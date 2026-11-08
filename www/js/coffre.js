/* B-S@fe — Coffre-fort : codes bancaires, cartes, mots de passe, numéros de documents.
   3 sécurités à CHAQUE ouverture : 1) nouveau code e-mail valable 5 min, 2) reconnaissance du visage, 3) phrase secrète.
   Chiffrement dans le téléphone (AES-256-GCM, clé = PBKDF2-SHA256 600 000 tours de la phrase secrète).
   La clé n'existe qu'en mémoire pendant que le coffre est ouvert ; rien de lisible n'est envoyé ni stocké. */
(window.BFC_MODULES ||= []).push((A) => {
'use strict';
const { sb, db, $, $$, esc, toast, action, ouvrirModale, fermerModale, confirmer, VUES } = A;
const VERIF = 'B-S@fe coffre v1';
const DUREE_CODE = 300, VERROU_INACTIF = 3 * 60 * 1000;
const CATS = {
  banque: { ic: '🏦', lib: 'Banque', champs: [['identifiant', 'Identifiant / n° client'], ['secret', 'Code d\'accès'], ['url', 'Site ou appli']] },
  carte: { ic: '💳', lib: 'Carte bancaire', champs: [['identifiant', 'Numéro de carte'], ['expiration', 'Expiration (MM/AA)'], ['secret', 'Code PIN'], ['cvv', 'Cryptogramme']] },
  site: { ic: '🌐', lib: 'Site / application', champs: [['url', 'Adresse du site ou nom de l\'appli'], ['identifiant', 'Identifiant / e-mail'], ['secret', 'Mot de passe']] },
  code: { ic: '🔢', lib: 'Code (digicode, alarme, wifi…)', champs: [['secret', 'Code']] },
  document: { ic: '🪪', lib: 'Document (passeport, sécu, permis…)', champs: [['identifiant', 'Numéro'], ['expiration', 'Date d\'expiration']] },
  note: { ic: '📝', lib: 'Note secrète', champs: [] }
};
const SECRETS = ['secret', 'cvv'];
const C = { cle: null, entrees: [], minuteur: null, dernierGeste: 0, codeEnvoye: 0 };

/* ---------------------------------------------------------------- chiffrement */
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const deb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriver(phrase, sel, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(phrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: deb64(sel), iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function chiffrer(cle, texte) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, new TextEncoder().encode(texte)));
  return 'v1.' + b64(iv) + '.' + b64(ct);
}
async function dechiffrer(cle, s) {
  const [, iv, ct] = s.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(iv) }, cle, deb64(ct)));
}

/* ---------------------------------------------------------------- verrouillage */
function verrouiller(raison) {
  if (!C.cle) return;
  C.cle = null; C.entrees = []; clearInterval(C.minuteur);
  if (location.hash.startsWith('#/coffre')) { VUES.coffre($('#vue')); if (raison) toast(raison); }
}
const geste = () => { C.dernierGeste = Date.now(); };
['click', 'keydown', 'touchstart', 'input'].forEach(e => document.addEventListener(e, geste, { passive: true }));
setInterval(() => { if (C.cle && Date.now() - C.dernierGeste > VERROU_INACTIF) verrouiller('🔒 Coffre refermé automatiquement (3 min sans activité).'); }, 10000);
document.addEventListener('visibilitychange', () => { if (document.hidden) verrouiller(); });
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/coffre')) verrouiller(); });

/* ---------------------------------------------------------------- écrans */
VUES.coffre = async (el) => {
  if (C.cle) return afficherCoffre(el);
  const { data: etat } = await db.rpc('coffre_etat');
  if (etat?.bloque) {
    el.innerHTML = `<div class="carte coffre-carte"><h2>🔐 Coffre-fort bloqué</h2>
      <div class="alerte" style="background:#fdecea;border-color:#c0392b;color:#8e1b10">Le coffre est bloqué après 5 phrases secrètes fausses. Un administrateur a été prévenu automatiquement et doit le débloquer après avoir vérifié qu'il s'agit bien de vous.</div>
      <p class="aide">Contact : contact@b-formatik.fr</p></div>`; return;
  }
  el.innerHTML = `<div class="carte coffre-carte"><h2>🔐 Coffre-fort</h2>
    <p>Vos codes bancaires, cartes, mots de passe et numéros de documents, <b>chiffrés dans votre téléphone</b>. Personne d'autre ne peut les lire : ni B-Form@tik, ni Supabase, ni un administrateur.</p>
    <ol class="coffre-etapes"><li class="en-cours">✉️ Code temporaire par e-mail (5 min)</li><li>🙂 Reconnaissance du visage</li><li>🔑 Phrase secrète</li></ol>
    <div id="cf-zone"><button class="btn btn-primaire" id="cf-ouvrir" style="width:100%;justify-content:center">🔐 Ouvrir le coffre : recevoir mon code</button>
    <p class="aide">Le coffre se referme tout seul après 3 minutes sans activité, si vous quittez la page ou mettez l'appli en arrière-plan.</p></div></div>`;
  $('#cf-ouvrir').onclick = (e) => action(e.target, () => envoyerCode(el));
};
const etape = (el, n) => $$('.coffre-etapes li', el).forEach((li, i) => { li.className = i < n ? 'fait' : i === n ? 'en-cours' : ''; });

async function envoyerCode(el) {
  const email = (await sb.auth.getUser()).data.user?.email;
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) throw new Error(/rate|security/i.test(error.message) ? 'Un code vient déjà d\'être envoyé : patientez une minute.' : error.message);
  C.codeEnvoye = Date.now();
  const z = $('#cf-zone', el);
  z.innerHTML = `<form id="cf-code"><p>Code envoyé à <b>${esc(email)}</b> (pensez aux courriers indésirables).</p>
    <div class="champ"><label>Code temporaire</label><input name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="10" style="font-size:22px;letter-spacing:4px;text-align:center"></div>
    <p id="cf-minuteur" class="aide" style="text-align:center"></p>
    <button class="btn btn-primaire" id="cf-valider" style="width:100%;justify-content:center">Valider le code</button>
    <p style="text-align:center"><button type="button" class="lien" id="cf-renvoi" disabled>Redemander un code</button></p></form>`;
  clearInterval(C.minuteur);
  const tic = () => { const reste = DUREE_CODE - Math.floor((Date.now() - C.codeEnvoye) / 1000), m = $('#cf-minuteur', el); if (!m) return clearInterval(C.minuteur);
    $('#cf-renvoi', el).disabled = Date.now() - C.codeEnvoye < 60000;
    if (reste <= 0) { m.innerHTML = '<b style="color:#c0392b">⏱️ Code expiré.</b> Redemandez un code.'; $('#cf-valider', el).disabled = true; $('#cf-renvoi', el).disabled = false; clearInterval(C.minuteur); }
    else m.textContent = `⏱️ Code valable encore ${Math.floor(reste / 60)} min ${String(reste % 60).padStart(2, '0')} s`; };
  tic(); C.minuteur = setInterval(tic, 1000);
  $('#cf-renvoi', el).onclick = (e) => action(e.target, () => envoyerCode(el));
  $('#cf-code', el).onsubmit = (e) => { e.preventDefault(); action($('#cf-valider', el), async () => {
    if (Date.now() - C.codeEnvoye > DUREE_CODE * 1000) throw new Error('Code expiré : redemandez un code.');
    const { error: ev } = await sb.auth.verifyOtp({ email, token: e.target.code.value.replace(/\s/g, ''), type: 'email' });
    if (ev) throw new Error('Code incorrect ou expiré. Redemandez un code.');
    clearInterval(C.minuteur); etape(el, 1); verifierVisage(el);
  }); };
}

async function verifierVisage(el) {
  const uid = (await sb.auth.getUser()).data.user?.id;
  const z = $('#cf-zone', el);
  if (!window.BSAFE_VISAGE?.enregistree(uid)) { z.innerHTML = '<div class="alerte">Visage non enregistré sur ce téléphone : déconnectez-vous et reconnectez-vous pour l\'enregistrer.</div>'; return; }
  z.innerHTML = `<div id="cf-visage"></div><p id="cf-consigne" style="text-align:center;font-weight:bold"></p>
    <button class="btn btn-primaire" id="cf-bv" style="width:100%;justify-content:center">🙂 Vérifier mon visage</button>`;
  $('#cf-bv', el).onclick = (e) => action(e.target, async () => {
    const r = await window.BSAFE_VISAGE.verifier(uid, $('#cf-visage', el), (t) => { $('#cf-consigne', el).innerHTML = t; });
    const { data: etat } = await db.rpc('visage_resultat', { p_ok: r.ok });
    if (etat?.bloque) { await sb.auth.signOut(); return; }               // 3 échecs : compte bloqué (écran de blocage de la connexion)
    if (!r.ok) throw new Error(`Visage non reconnu. Il reste ${etat?.restant ?? '?'} essai(s) avant le blocage du compte.`);
    etape(el, 2); phrase(el);
  });
}

async function phrase(el) {
  const z = $('#cf-zone', el);
  const p = (await db.from('coffre_parametres').select('*').maybeSingle()).data;
  if (!p) {
    z.innerHTML = `<form id="cf-ph"><h3 style="margin-top:0">Créez votre phrase secrète</h3>
      <p class="aide">Une phrase que vous seul connaissez, d'au moins <b>4 mots</b> et <b>20 caractères</b> (ex. : « mon chat Noisette aime le gratin 1987 »).</p>
      <div class="alerte" style="margin-bottom:10px">⚠️ <b>Notez-la en lieu sûr.</b> Elle n'est enregistrée nulle part : si vous l'oubliez, <b>personne ne pourra récupérer le contenu du coffre</b>, pas même un administrateur.</div>
      <div class="champ"><label>Phrase secrète</label><input name="p1" type="password" autocomplete="new-password" required></div>
      <div class="champ"><label>Répétez la phrase</label><input name="p2" type="password" autocomplete="new-password" required></div>
      <label class="case"><input type="checkbox" name="ok"> J'ai noté ma phrase et je comprends qu'elle est irrécupérable.</label>
      <button class="btn btn-primaire" id="cf-creer" style="width:100%;justify-content:center">Créer mon coffre</button></form>`;
    $('#cf-ph', el).onsubmit = (e) => { e.preventDefault(); const f = e.target; action($('#cf-creer', el), async () => {
      const ph = f.p1.value;
      if (ph.trim().split(/\s+/).length < 4 || ph.length < 20) throw new Error('Phrase trop courte : au moins 4 mots et 20 caractères.');
      if (ph !== f.p2.value) throw new Error('Les deux phrases ne sont pas identiques.');
      if (!f.ok.checked) throw new Error('Cochez la case pour confirmer que vous avez noté la phrase.');
      const sel = b64(crypto.getRandomValues(new Uint8Array(16))), it = 600000;
      const cle = await deriver(ph, sel, it);
      const r = await db.from('coffre_parametres').insert({ sel, iterations: it, verificateur: await chiffrer(cle, VERIF) });
      if (r.error) throw new Error(/row-level|policy/i.test(r.error.message) ? 'Sécurité expirée : refermez et rouvrez le coffre.' : r.error.message);
      C.cle = cle; geste(); toast('Coffre créé. 🔐'); afficherCoffre(el);
    }); };
    return;
  }
  z.innerHTML = `<form id="cf-ph"><div class="champ"><label>Phrase secrète</label><input name="p" type="password" autocomplete="current-password" required></div>
    <button class="btn btn-primaire" id="cf-entrer" style="width:100%;justify-content:center">🔑 Ouvrir</button>
    <p class="aide">⚠️ Après 5 phrases fausses, le coffre est bloqué et seul un administrateur peut le débloquer.</p></form>`;
  $('#cf-ph', el).onsubmit = (e) => { e.preventDefault(); action($('#cf-entrer', el), async () => {
    const cle = await deriver(e.target.p.value, p.sel, p.iterations);
    let ok = false; try { ok = (await dechiffrer(cle, p.verificateur)) === VERIF; } catch {}
    const { data: etat, error } = await db.rpc('coffre_phrase', { p_ok: ok });
    if (error) throw new Error(error.message);
    if (etat?.bloque) return VUES.coffre(el);
    if (!ok) { e.target.p.value = ''; throw new Error(`Phrase secrète incorrecte. Il reste ${etat.restant} essai(s) avant le blocage du coffre.`); }
    C.cle = cle; geste(); afficherCoffre(el);
  }); };
}

/* ---------------------------------------------------------------- coffre ouvert */
async function charger() {
  const { data, error } = await db.from('coffre_entrees').select('*').order('maj', { ascending: false });
  if (error) throw error;
  C.entrees = [];
  for (const r of data || []) { try { C.entrees.push({ id: r.id, ...JSON.parse(await dechiffrer(C.cle, r.donnees)) }); } catch { C.entrees.push({ id: r.id, categorie: 'note', titre: '⚠️ Entrée illisible', notes: '' }); } }
}
async function afficherCoffre(el) {
  try { await charger(); } catch (e) { verrouiller(); return toast('Sécurité expirée (code de plus de 15 min) : rouvrez le coffre.', true); }
  const filtre = () => { const q = ($('#cf-q', el)?.value || '').toLowerCase(); return C.entrees.filter(x => !q || [x.titre, x.identifiant, x.url, x.notes].join(' ').toLowerCase().includes(q)); };
  el.innerHTML = `<div class="tete-vue"><div><h1>🔐 Coffre-fort <span class="pastille rec">ouvert</span></h1><div class="aide">Refermeture automatique après 3 min sans activité.</div></div>
    <div style="display:flex;gap:8px"><button class="btn btn-primaire" id="cf-ajout">＋ Ajouter</button><button class="btn btn-fantome" id="cf-fermer">🔒 Fermer</button></div></div>
    <div class="carte"><input id="cf-q" placeholder="🔎 Rechercher (banque, site, carte…)" style="margin-bottom:10px"><div id="cf-liste"></div></div>`;
  const dessiner = () => {
    const l = filtre();
    $('#cf-liste', el).innerHTML = l.map(x => { const c = CATS[x.categorie] || CATS.note; return `<div class="coffre-ligne" data-id="${x.id}">
      <div class="coffre-ic">${c.ic}</div><div class="coffre-txt"><b>${esc(x.titre || c.lib)}</b><div class="aide">${esc(c.lib)}${x.identifiant ? ' · ' + esc(String(x.identifiant).replace(/.(?=.{4})/g, '•')) : ''}</div></div>
      <button class="btn btn-petit btn-fantome" data-voir="${x.id}">Voir</button></div>`; }).join('') || '<p class="vide">Coffre vide. Ajoutez vos codes avec « ＋ Ajouter ».</p>';
  };
  dessiner();
  $('#cf-q', el).oninput = dessiner;
  $('#cf-fermer', el).onclick = () => verrouiller('🔒 Coffre fermé.');
  $('#cf-ajout', el).onclick = () => formEntree({ categorie: 'banque' }, el);
  $('#cf-liste', el).onclick = (e) => { const b = e.target.closest('[data-voir]'); if (b) voir(C.entrees.find(x => x.id === b.dataset.voir), el); };
}
function voir(x, el) {
  const c = CATS[x.categorie] || CATS.note;
  ouvrirModale(`${c.ic} ${x.titre || c.lib}`, `<div class="coffre-detail">
      ${c.champs.filter(([k]) => x[k]).map(([k, lib]) => `<div class="coffre-champ"><label>${esc(lib)}</label><div><code data-val="${esc(x[k])}">${SECRETS.includes(k) ? '••••••••' : esc(x[k])}</code>
        ${SECRETS.includes(k) ? `<button type="button" class="btn btn-petit btn-fantome" data-afficher>👁 Afficher</button>` : ''}<button type="button" class="btn btn-petit btn-fantome" data-copier>📋 Copier</button></div></div>`).join('')}
      ${x.notes ? `<div class="coffre-champ"><label>Notes</label><div style="white-space:pre-wrap">${esc(x.notes)}</div></div>` : ''}</div>
    <div class="modale-pied"><button type="button" class="btn btn-fantome" id="cf-suppr">🗑 Supprimer</button><button type="button" class="btn btn-fantome" id="cf-modif">✏️ Modifier</button><button type="button" class="btn btn-primaire" data-fermer>OK</button></div>`, (m) => {
    m.onclick = (e) => {
      const a = e.target.closest('[data-afficher]'); if (a) { const code = a.parentElement.querySelector('code'); const vis = code.textContent !== '••••••••'; code.textContent = vis ? '••••••••' : code.dataset.val; a.textContent = vis ? '👁 Afficher' : '🙈 Masquer'; if (!vis) setTimeout(() => { code.textContent = '••••••••'; a.textContent = '👁 Afficher'; }, 20000); }
      const cp = e.target.closest('[data-copier]'); if (cp) { navigator.clipboard?.writeText(cp.parentElement.querySelector('code').dataset.val).then(() => toast('Copié. Pensez à ne pas le coller ailleurs que sur le site concerné.')).catch(() => toast('Copie impossible sur cet appareil.', true)); }
    };
    $('#cf-modif', m).onclick = () => { fermerModale(); formEntree(x, el); };
    $('#cf-suppr', m).onclick = (e) => action(e.target, async () => {
      if (!(await confirmer(`Supprimer définitivement « ${x.titre || c.lib} » du coffre ?`))) return;
      const r = await db.from('coffre_entrees').delete().eq('id', x.id); if (r.error) throw r.error; fermerModale(); toast('Supprimé.'); afficherCoffre(el); });
  });
}
function formEntree(x, el) {
  const neuf = !x.id;
  const champs = (cat) => (CATS[cat] || CATS.note).champs.map(([k, lib]) => `<div class="champ"><label>${esc(lib)}</label><input name="${k}" value="${esc(x[k] || '')}" ${SECRETS.includes(k) ? 'type="password" autocomplete="new-password"' : 'autocomplete="off"'}></div>`).join('');
  ouvrirModale(neuf ? '＋ Ajouter au coffre' : '✏️ Modifier', `<form id="cf-f">
      <div class="champ"><label>Type</label><select name="categorie">${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${k === x.categorie ? 'selected' : ''}>${c.ic} ${esc(c.lib)}</option>`).join('')}</select></div>
      <div class="champ"><label>Nom</label><input name="titre" value="${esc(x.titre || '')}" placeholder="ex. : Bred – compte courant" required autocomplete="off"></div>
      <div id="cf-champs">${champs(x.categorie)}</div>
      <div class="champ"><label>Notes</label><textarea name="notes" rows="3">${esc(x.notes || '')}</textarea></div>
      <p class="aide">🔐 Chiffré dans votre téléphone avant l'envoi : seule votre phrase secrète peut le relire.</p>
      <div class="modale-pied"><button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">💾 Enregistrer</button></div></form>`, (m) => {
    const f = $('#cf-f', m);
    f.categorie.onchange = () => { $('#cf-champs', m).innerHTML = champs(f.categorie.value); };
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      if (!C.cle) throw new Error('Coffre refermé : rouvrez-le.');
      const d = { categorie: f.categorie.value, titre: f.titre.value.trim(), notes: f.notes.value };
      (CATS[d.categorie] || CATS.note).champs.forEach(([k]) => { if (f[k]?.value) d[k] = f[k].value; });
      const donnees = await chiffrer(C.cle, JSON.stringify(d));
      const r = neuf ? await db.from('coffre_entrees').insert({ donnees }) : await db.from('coffre_entrees').update({ donnees, maj: new Date().toISOString() }).eq('id', x.id);
      if (r.error) throw new Error(/row-level|policy/i.test(r.error.message) ? 'Sécurité expirée (code de plus de 15 min) : refermez et rouvrez le coffre.' : r.error.message);
      fermerModale(); toast('Enregistré dans le coffre. 🔐'); afficherCoffre(el);
    }); };
  });
}
A.verrouillerCoffre = verrouiller;
});
