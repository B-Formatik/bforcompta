/* =====================================================================
   B-S@fe — application de gestion financière · created by B-Form@tik
   Base : Supabase « B-Form@tik », schéma bforcompta (+ plateforme)
   ===================================================================== */
(() => {
'use strict';
const C = window.BFC_CONFIG;
const sb = window.supabase.createClient(C.url, C.cle, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const db = sb.schema(C.structure);
const pf = sb.schema('plateforme');

/* ---------------------------------------------------------------- utilitaires */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: C.devise });
const fmt = (n) => euro.format(Number(n || 0));
const fmtDate = (d) => d ? new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('fr-FR') : '';
const dateLocale = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const auj = () => dateLocale(new Date());
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const NATURES = { professionnel: 'Professionnel', personnel: 'Personnel', joint: 'Joint' };
const TYPES_COMPTE = { banque: 'Banque', especes: 'Espèces (caisse)', epargne: 'Épargne', carte: 'Carte', paypal: 'PayPal', placement: 'Placement / investissement', autre: 'Autre' };
const MOYENS = { especes: 'Espèces', carte: 'Carte', virement: 'Virement', cheque: 'Chèque', prelevement: 'Prélèvement', paypal: 'PayPal', autre: 'Autre' };
const STATUTS = { validee: 'Validée', prevue: 'Prévue', rapprochee: 'Rapprochée' };
const TYPES_TIERS = { client: 'Client', fournisseur: 'Fournisseur', organisme: 'Organisme', salarie: 'Salarié', particulier: 'Particulier', autre: 'Autre' };
const TYPES_DOC = { facture: 'Facture', recu: 'Reçu', ticket: 'Ticket de caisse', devis: 'Devis', releve: 'Relevé', contrat: 'Contrat', justificatif: 'Justificatif', garantie: 'Garantie', assurance: 'Assurance', bulletin: 'Bulletin scolaire', sante: 'Santé', administratif: 'Administratif', vehicule: 'Véhicule', autre: 'Autre' };
const TYPES_IMAGE = { provenance: 'Provenance', categorie: 'Catégorie', compte: 'Compte', autre: 'Autre' };
const STATUTS_PIECE = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', payee: 'Payée', partiellement_payee: 'Part. payée', annulee: 'Annulée', expire: 'Expiré' };
const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
const optsListe = (liste, sel, vide = '—', lib = x => x.nom) => `<option value="">${esc(vide)}</option>` + liste.map(x => `<option value="${x.id ?? x.code}" ${(x.id ?? x.code) === sel ? 'selected' : ''}>${esc(lib(x))}</option>`).join('');
const nettoyerNom = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const val = (form, nom) => { const v = form.elements[nom]?.value?.trim(); return v === '' ? null : v; };
const num = (form, nom) => { const v = val(form, nom); return v === null ? null : Number(String(v).replace(',', '.')); };

function toast(msg, erreur = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (erreur ? ' erreur' : '');
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), erreur ? 7000 : 3500);
}
function verifier({ data, error, count }, contexte = '') {
  if (error) { console.error(contexte, error); throw new Error((contexte ? contexte + ' : ' : '') + (error.message || error)); }
  return count !== undefined && count !== null && data === null ? count : data;
}
async function action(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message || String(e), true); } finally { if (btn) btn.disabled = false; }
}

/* ---------------------------------------------------------------- modale */
function ouvrirModale(titre, html, apresRendu) {
  $('#modale-titre').textContent = titre;
  $('#modale-corps').innerHTML = html;
  $('#modale').hidden = false;
  apresRendu && apresRendu($('#modale-corps'));
  setTimeout(() => $('#modale-corps input, #modale-corps select')?.focus(), 50);
}
function fermerModale() { $('#modale').hidden = true; $('#modale-corps').innerHTML = ''; }
document.addEventListener('click', e => { if (e.target.closest('[data-fermer]')) fermerModale(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modale').hidden) fermerModale(); });
async function confirmer(message) { return window.confirm(message); }

/* ---------------------------------------------------------------- référentiels */
const R = { comptes: [], categories: [], tiers: [], images: [], structures: [], soldes: [], espaces: [] };
const urlsImages = new Map();   // storage_path -> URL signée

async function chargerReferentiels() {
  const [comptes, categories, tiers, images, structures] = await Promise.all([
    db.from('comptes').select('*').order('actif', { ascending: false }).order('nom'),
    db.from('categories').select('*').order('type').order('nom'),
    db.from('tiers').select('*').order('nom'),
    db.from('bibliotheque_images').select('*').order('nom'),
    pf.from('structures').select('*').eq('actif', true).order('nom')
  ]);
  const esp = await db.from('espaces').select('*').eq('actif', true).order('ordre');
  R.espaces = esp.error ? [] : esp.data;
  R.comptes = verifier(comptes, 'Comptes');
  R.categories = verifier(categories, 'Catégories');
  R.tiers = verifier(tiers, 'Tiers');
  R.images = verifier(images, 'Images');
  R.structures = verifier(structures, 'Structures');
  await signerImages(R.images.map(i => i.storage_path));
}
async function chargerSoldes() {
  R.soldes = verifier(await db.from('v_soldes_comptes').select('*'), 'Soldes');
  return R.soldes;
}
async function signerImages(chemins) {
  const manquants = [...new Set(chemins.filter(p => p && !urlsImages.has(p)))];
  if (!manquants.length) return;
  const { data, error } = await sb.storage.from(C.bucketImages).createSignedUrls(manquants, 60 * 60 * 12);
  if (error) { console.warn(error); return; }
  data.forEach(d => d.signedUrl && urlsImages.set(d.path, d.signedUrl));
}
const imageParId = (id) => R.images.find(i => i.id === id);
const compteParId = (id) => R.comptes.find(c => c.id === id);
const categorieParId = (id) => R.categories.find(c => c.id === id);
const tiersParId = (id) => R.tiers.find(t => t.id === id);
const structureParCode = (c) => R.structures.find(s => s.code === c);
const espaceParCode = (c) => R.espaces.find(e => e.code === c);
function vignette(imageId, texte = '?', grande = false) {
  const img = imageId && imageParId(imageId);
  const url = img && urlsImages.get(img.storage_path);
  const cls = 'vignette' + (grande ? ' grande' : '');
  if (url) return `<img class="${cls}" src="${esc(url)}" alt="${esc(img.nom)}">`;
  return `<span class="${cls}">${esc((texte || '?').trim().charAt(0).toUpperCase())}</span>`;
}
function imageOperation(o) { return o.image_id || tiersParId(o.tiers_id)?.image_id || categorieParId(o.categorie_id)?.image_id || null; }

/* Sélecteur d'image de la bibliothèque (utilisé dans les formulaires) */
function choixImageHtml(nomChamp, selection, filtreType) {
  const liste = R.images.filter(i => !filtreType || i.type === filtreType || i.id === selection);
  const boutons = liste.map(i => `<button type="button" data-img="${i.id}" class="${i.id === selection ? 'on' : ''}" title="${esc(i.nom)}">
      <img src="${esc(urlsImages.get(i.storage_path) || '')}" alt="">${esc(i.nom.slice(0, 14))}</button>`).join('');
  return `<input type="hidden" name="${nomChamp}" value="${selection || ''}">
    <div class="choix-images" data-choix="${nomChamp}">
      <button type="button" data-img="" class="${!selection ? 'on' : ''}"><span class="vignette" style="width:100%;height:auto;aspect-ratio:1">∅</span>Aucune</button>
      ${boutons || ''}
    </div>
    <div class="aide">${liste.length ? 'Cliquez sur une image.' : 'Bibliothèque vide : ajoutez des images dans « Bibliothèque d\'images ».'}</div>`;
}
function brancherChoixImage(racine) {
  $$('.choix-images', racine).forEach(box => box.addEventListener('click', e => {
    const b = e.target.closest('button[data-img]'); if (!b) return;
    $$('button', box).forEach(x => x.classList.toggle('on', x === b));
    racine.querySelector(`input[name="${box.dataset.choix}"]`).value = b.dataset.img;
  }));
}

/* ---------------------------------------------------------------- authentification */
function vueAuth(mode = 'connexion', message = '', emailPrerempli = '') {
  $('#ecran-app').hidden = true; $('#ecran-auth').hidden = false;
  const c = $('#auth-contenu');
  const msg = message ? `<div class="alerte" style="margin-bottom:12px">${esc(message)}</div>` : '';
  if (mode === 'connexion') {
    c.innerHTML = `${msg}<form id="f-auth">
      <div class="champ"><label>Adresse e-mail</label><input name="email" type="email" autocomplete="username" required></div>
      <div class="champ"><label>Mot de passe</label><input name="mdp" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primaire" style="width:100%;justify-content:center">Se connecter</button>
      <p style="text-align:center;margin:14px 0 0"><button type="button" class="lien" id="l-oubli">Mot de passe oublié ?</button> · <button type="button" class="lien" id="l-creer">Créer un compte</button></p>
    </form>`;
    $('#f-auth').onsubmit = (e) => { e.preventDefault(); const f = e.target; action(f.querySelector('button'), async () => {
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.mdp.value });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou mot de passe incorrect.' : error.message);
    }); };
    $('#l-oubli').onclick = () => vueAuth('oubli');
    $('#l-creer').onclick = () => vueAuth('creer');
  } else if (mode === 'creer') {
    c.innerHTML = `${msg}<form id="f-auth">
      <p>Créez votre accès personnel à B-S@fe (comptes personnels et comptes joints).</p>
      <div class="champ"><label>Nom et prénom</label><input name="nom" required autocomplete="name"></div>
      <div class="champ"><label>Adresse e-mail</label><input name="email" type="email" required autocomplete="username"></div>
      <div class="champ"><label>Mot de passe (8 caractères minimum)</label><input name="mdp" type="password" minlength="8" required autocomplete="new-password"></div>
      <button class="btn btn-primaire" style="width:100%;justify-content:center">Créer mon compte</button>
      <p style="text-align:center;margin:14px 0 0"><button type="button" class="lien" id="l-retour">Retour à la connexion</button></p>
    </form>`;
    $('#f-auth').onsubmit = (e) => { e.preventDefault(); const f = e.target; action(f.querySelector('button'), async () => {
      const { data, error } = await sb.auth.signUp({ email: f.email.value.trim(), password: f.mdp.value,
        options: { data: { app: C.structure, nom_complet: f.nom.value.trim() }, emailRedirectTo: window.Capacitor ? C.urlWeb : location.origin + location.pathname } });
      if (error) throw new Error(/already/i.test(error.message) ? 'Un compte existe déjà avec cette adresse : utilisez « Mot de passe oublié ».' : error.message);
      if (!data.session) vueAuth('connexion', 'Compte créé. Confirmez votre adresse avec le lien reçu par e-mail, puis connectez-vous.');
    }); };
    $('#l-retour').onclick = () => vueAuth('connexion');
  } else if (mode === 'oubli') {
    c.innerHTML = `${msg}<form id="f-auth">
      <p>Saisissez votre adresse : vous recevrez un e-mail pour choisir un nouveau mot de passe.</p>
      <div class="champ"><label>Adresse e-mail</label><input name="email" type="email" required></div>
      <button class="btn btn-primaire" style="width:100%;justify-content:center">Recevoir l'e-mail</button>
      <p style="text-align:center;margin:14px 0 0"><button type="button" class="lien" id="l-code">J'ai déjà un code</button> · <button type="button" class="lien" id="l-retour">Retour</button></p>
    </form>`;
    $('#f-auth').onsubmit = (e) => { e.preventDefault(); const f = e.target; action(f.querySelector('button'), async () => {
      const email = f.email.value.trim();
      const options = { redirectTo: window.Capacitor ? C.urlWeb : location.origin + location.pathname };
      const { error } = await sb.auth.resetPasswordForEmail(email, options);
      if (error) throw new Error(/rate limit/i.test(error.message) ? 'Trop de demandes : patientez quelques minutes avant de redemander un code.' : error.message);
      if (window.Capacitor) vueAuth('connexion', 'E-mail envoyé (pensez aux spams). Ouvrez le lien : il vous amène sur la version web de B-S@fe pour choisir votre mot de passe. Revenez ensuite vous connecter ici.');
      else vueAuth('connexion', 'E-mail envoyé (pensez aux spams). Ouvrez le lien depuis cet appareil pour choisir votre mot de passe.');
    }); };
    $('#l-code').onclick = () => vueAuth('code', '', $('#f-auth').email.value.trim());
    $('#l-retour').onclick = () => vueAuth('connexion');
  } else if (mode === 'code') {
    c.innerHTML = `${msg}<form id="f-auth">
      <p>Si l'e-mail reçu contient un code, saisissez-le ici avec votre nouveau mot de passe.</p>
      <div class="champ"><label>Adresse e-mail</label><input name="email" type="email" required value="${esc(emailPrerempli)}"></div>
      <div class="champ"><label>Code reçu par e-mail</label><input name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="10" placeholder="123456"></div>
      <div class="champ"><label>Nouveau mot de passe</label><input name="mdp" type="password" minlength="8" autocomplete="new-password" required></div>
      <button class="btn btn-primaire" style="width:100%;justify-content:center">Valider</button>
      <p style="text-align:center;margin:14px 0 0"><button type="button" class="lien" id="l-retour">Retour à la connexion</button></p>
    </form>`;
    $('#f-auth').onsubmit = (e) => { e.preventDefault(); const f = e.target; action(f.querySelector('button'), async () => {
      enRecuperation = true;
      const v = await sb.auth.verifyOtp({ email: f.email.value.trim(), token: f.code.value.trim(), type: 'recovery' });
      if (v.error) { enRecuperation = false; throw new Error('Code invalide ou expiré. Redemandez un code.'); }
      const u = await sb.auth.updateUser({ password: f.mdp.value });
      enRecuperation = false;
      if (u.error) throw u.error;
      toast('Mot de passe enregistré. Bienvenue !');
      demarrerApp();
    }); };
    $('#l-retour').onclick = () => vueAuth('connexion');
  } else if (mode === 'nouveau-mdp') {
    c.innerHTML = `${msg}<form id="f-auth">
      <p>Choisissez votre nouveau mot de passe (8 caractères minimum).</p>
      <div class="champ"><label>Nouveau mot de passe</label><input name="mdp" type="password" minlength="8" autocomplete="new-password" required></div>
      <div class="champ"><label>Confirmation</label><input name="mdp2" type="password" minlength="8" autocomplete="new-password" required></div>
      <button class="btn btn-primaire" style="width:100%;justify-content:center">Enregistrer</button>
    </form>`;
    $('#f-auth').onsubmit = (e) => { e.preventDefault(); const f = e.target; action(f.querySelector('button'), async () => {
      if (f.mdp.value !== f.mdp2.value) throw new Error('Les deux mots de passe ne sont pas identiques.');
      const { error } = await sb.auth.updateUser({ password: f.mdp.value });
      if (error) throw error;
      toast('Mot de passe enregistré.');
      history.replaceState(null, '', location.pathname + '#/tableau');
      demarrerApp();
    }); };
  } else if (mode === 'refus') {
    c.innerHTML = `<div class="alerte">Votre compte n'a pas encore accès à B-S@fe.<br>Un administrateur B-Form@tik doit vous l'ouvrir (structure « bforcompta »).</div>
      <p style="margin-top:14px"><button class="btn btn-fantome" id="l-deco">Se déconnecter</button></p>`;
    $('#l-deco').onclick = () => sb.auth.signOut();
  }
}

let appDemarree = false, enRecuperation = false;
/* Type de compte affiché en haut : Administrateur, Super utilisateur, Utilisateur, Lecture seule */
const PROFILS = {
  admin: { lib: 'Administrateur', icone: '👑', cls: 'admin' },
  super_utilisateur: { lib: 'Super utilisateur', icone: '⭐', cls: 'super' },
  utilisateur: { lib: 'Utilisateur', icone: '👤', cls: 'user' },
  lecture: { lib: 'Lecture seule', icone: '👁️', cls: 'lecture' },
  client: { lib: 'Comptes personnels', icone: '👤', cls: 'user' }
};
const RANG = ['admin', 'super_utilisateur', 'utilisateur', 'lecture', 'client'];
R.profil = 'utilisateur';
async function afficherProfil(user) {
  const { data } = await pf.from('acces').select('structure_code, role').eq('user_id', user.id);
  const roles = (data || []).filter(a => a.structure_code === C.structure || a.structure_code === 'bformatik').map(a => a.role);
  R.profil = RANG.find(r => roles.includes(r)) || 'client';
  R.pro = R.profil !== 'client';
  $$('[data-pro]').forEach(a => { a.hidden = !R.pro; });
  const p = PROFILS[R.profil];
  const b = $('#badge-profil');
  b.className = 'badge-profil ' + p.cls;
  b.innerHTML = `<span>${p.icone}</span>${esc(p.lib)}`;
  b.title = `Connecté en tant que ${p.lib} · ${user.email}`;
  b.hidden = false;
}
async function demarrerApp() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { appDemarree = false; return vueAuth('connexion'); }
  if (enRecuperation) return vueAuth('nouveau-mdp');
  const { data: ok, error } = await db.rpc('peut_utiliser');
  if (error || !ok) { appDemarree = false; return vueAuth('refus'); }
  $('#ecran-auth').hidden = true; $('#ecran-app').hidden = false;
  $('#utilisateur').textContent = session.user.email;
  API.utilisateurId = session.user.id;
  await afficherProfil(session.user);
  try { await chargerReferentiels(); } catch (e) { toast(e.message, true); }
  appDemarree = true;
  router();
}
sb.auth.onAuthStateChange((evt) => {
  if (evt === 'PASSWORD_RECOVERY') { enRecuperation = true; vueAuth('nouveau-mdp'); return; }
  if (evt === 'USER_UPDATED') enRecuperation = false;
  if (evt === 'SIGNED_OUT') { appDemarree = false; vueAuth('connexion'); }
  if (evt === 'SIGNED_IN' && !appDemarree && !enRecuperation) setTimeout(demarrerApp, 0);
});
$('#btn-deconnexion').onclick = () => sb.auth.signOut();
$('#btn-menu').onclick = () => $('#menu').classList.toggle('ouvert');
$('#menu').addEventListener('click', e => { if (e.target.closest('a')) $('#menu').classList.remove('ouvert'); });

/* ---------------------------------------------------------------- routeur */
const VUES = {};
let graphiques = [];
function detruireGraphiques() { graphiques.forEach(g => g.destroy()); graphiques = []; }
async function router() {
  if (!appDemarree) return;
  const [route, param] = (location.hash.replace(/^#\/?/, '') || 'aujourdhui').split('/');
  const v = VUES[route] ? route : (VUES.aujourdhui ? 'aujourdhui' : 'tableau');
  $$('#menu a').forEach(a => a.classList.toggle('actif', a.dataset.route === v));
  detruireGraphiques();
  const el = $('#vue');
  el.onclick = null;
  if (!$('#modale').hidden) fermerModale();
  document.querySelectorAll('.sous-modale').forEach(x => x.remove());
  el.innerHTML = '<div class="chargement">Chargement…</div>';
  try { await VUES[v](el, param); } catch (e) { console.error(e); el.innerHTML = `<div class="carte"><h3>Erreur</h3><p>${esc(e.message)}</p></div>`; }
  el.focus({ preventScroll: true });
}
window.addEventListener('hashchange', router);

/* ================================================================= TABLEAU DE BORD */
const filtreTB = { annee: new Date().getFullYear(), mois: new Date().getMonth(), perimetre: 'tout' };
VUES.tableau = async (el) => {
  const dansPerimetre = (compteId) => { const n = compteParId(compteId)?.nature || 'professionnel';
    return filtreTB.perimetre === 'tout' || (filtreTB.perimetre === 'pro' ? n === 'professionnel' : n !== 'professionnel'); };
  const aDesPerso = R.comptes.some(c => c.nature && c.nature !== 'professionnel');
  if (!R.pro) filtreTB.perimetre = 'perso';
  const [soldesTous, toutesOps] = await Promise.all([
    chargerSoldes(),
    db.from('operations').select('type, montant, date_operation, categorie_id, structure_code, moyen_paiement, statut, compte_id').neq('statut', 'prevue').limit(50000)
  ]);
  const soldes = soldesTous.filter(s => dansPerimetre(s.compte_id));
  const t = { total_general: soldes.reduce((a, s) => a + Number(s.solde_actuel), 0),
    total_especes: soldes.filter(s => s.type === 'especes').reduce((a, s) => a + Number(s.solde_actuel), 0) };
  t.total_hors_especes = t.total_general - t.total_especes;
  const opsPerim = verifier(toutesOps, 'Opérations').filter(o => dansPerimetre(o.compte_id));
  const parAnnee = {};
  opsPerim.forEach(o => { const a = Number(o.date_operation.slice(0, 4)); const x = parAnnee[a] ||= { annee: a, recettes: 0, depenses: 0 };
    o.type === 'recette' ? x.recettes += Number(o.montant) : x.depenses += Number(o.montant); });
  const annees = { data: Object.values(parAnnee).map(x => ({ ...x, balance: x.recettes - x.depenses })), error: null };
  const anneesDispo = [...new Set([new Date().getFullYear(), ...annees.data.map(a => a.annee)])].sort((a, b) => b - a);
  const { annee, mois } = filtreTB;
  const ops = opsPerim.filter(o => o.date_operation.startsWith(String(annee)));

  const rec = Array(12).fill(0), dep = Array(12).fill(0), recEsp = Array(12).fill(0), depEsp = Array(12).fill(0);
  const parCat = {}, parCatAn = {}, parStruct = {};
  for (const o of ops) {
    const m = Number(o.date_operation.slice(5, 7)) - 1, mt = Number(o.montant);
    if (o.type === 'recette') { rec[m] += mt; if (o.moyen_paiement === 'especes') recEsp[m] += mt; }
    else {
      dep[m] += mt; if (o.moyen_paiement === 'especes') depEsp[m] += mt;
      const k = o.categorie_id || 'nc';
      parCatAn[k] = (parCatAn[k] || 0) + mt;
      if (m === mois) parCat[k] = (parCat[k] || 0) + mt;
    }
    const s = parStruct[o.structure_code] ||= { r: 0, d: 0 };
    o.type === 'recette' ? s.r += mt : s.d += mt;
  }
  const bal = rec.map((r, i) => r - dep[i]);
  let cumul = 0; const cumuls = bal.map(b => (cumul += b));
  const totR = rec.reduce((a, b) => a + b, 0), totD = dep.reduce((a, b) => a + b, 0);
  const balMois = rec[mois] - dep[mois];

  el.innerHTML = `
    <div class="tete-vue"><h1>Tableau de bord</h1>
      <div class="actions">
        ${aDesPerso && R.pro ? `<select id="tb-perim" style="width:auto"><option value="tout" ${filtreTB.perimetre === 'tout' ? 'selected' : ''}>Tous les comptes</option><option value="pro" ${filtreTB.perimetre === 'pro' ? 'selected' : ''}>🏢 Professionnels</option><option value="perso" ${filtreTB.perimetre === 'perso' ? 'selected' : ''}>🔒 Perso &amp; joints</option></select>` : ''}
        <select id="tb-mois" style="width:auto">${MOIS_LONG.map((m, i) => `<option value="${i}" ${i === mois ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <select id="tb-annee" style="width:auto">${anneesDispo.map(a => `<option ${a === annee ? 'selected' : ''}>${a}</option>`).join('')}</select>
        <a class="btn btn-primaire" href="#/operations/nouvelle">＋ Nouvelle opération</a>
      </div></div>
    <div class="grille g4">
      <div class="carte kpi principal"><div class="lib">Trésorerie totale</div><div class="val">${fmt(t.total_general)}</div><div class="det">${soldes.length} compte(s) actif(s)</div></div>
      <div class="carte kpi"><div class="lib">🏦 Banques &amp; autres</div><div class="val">${fmt(t.total_hors_especes)}</div><div class="det">hors espèces</div></div>
      <div class="carte kpi"><div class="lib">💶 Espèces (caisse)</div><div class="val">${fmt(t.total_especes)}</div><div class="det"><a href="#/especes">Gérer la caisse →</a></div></div>
      <div class="carte kpi"><div class="lib">Balance ${MOIS_LONG[mois]}</div><div class="val ${balMois >= 0 ? 'positif' : 'negatif'}">${fmt(balMois)}</div>
        <div class="det"><span class="positif">+${fmt(rec[mois])}</span> · <span class="negatif">−${fmt(dep[mois])}</span></div></div>
    </div>
    <div class="grille g2 mt">
      <div class="carte"><h3>📈 Balance mensuelle ${annee}</h3>
        <div class="det" style="color:var(--gris);margin-bottom:6px">Recettes ${fmt(totR)} · Dépenses ${fmt(totD)} · Balance <b class="${totR - totD >= 0 ? 'positif' : 'negatif'}">${fmt(totR - totD)}</b></div>
        <div class="graph"><canvas id="g-balance"></canvas></div></div>
      <div class="carte"><h3>🍩 Dépenses par catégorie</h3>
        <div class="bascule" id="b-cat" style="margin-bottom:8px"><button data-p="mois" class="on">${MOIS_LONG[mois]}</button><button data-p="annee">Année ${annee}</button></div>
        <div class="graph petit"><canvas id="g-cat"></canvas></div></div>
    </div>
    <div class="grille g2 mt">
      <div class="carte"><h3>💶 Espèces ${annee}</h3><div class="graph petit"><canvas id="g-especes"></canvas></div></div>
      <div class="carte"><h3>📅 Balance par année</h3><div class="graph petit"><canvas id="g-annees"></canvas></div></div>
    </div>
    <div class="grille g2 mt">
      <div class="carte"><h3>🏦 Soldes des comptes</h3><div class="tableau-wrap"><table><tbody>
        ${soldes.map(s => { const c = compteParId(s.compte_id); return `<tr><td><div class="avec-image">${vignette(c?.image_id, s.nom)}<div><b>${esc(s.nom)}</b><div class="aide">${TYPES_COMPTE[s.type] || s.type}</div></div></div></td>
          <td class="montant ${Number(s.solde_actuel) >= 0 ? '' : 'negatif'}">${fmt(s.solde_actuel)}</td></tr>`; }).join('') || '<tr><td class="vide">Aucun compte</td></tr>'}
      </tbody></table></div></div>
      <div class="carte"><h3>🧩 Par structure ${annee}</h3><div class="tableau-wrap"><table>
        <thead><tr><th>Structure</th><th class="montant">Recettes</th><th class="montant">Dépenses</th><th class="montant">Balance</th></tr></thead><tbody>
        ${Object.entries(parStruct).map(([code, v]) => { const s = structureParCode(code); return `<tr><td><span class="point" style="background:${esc(s?.couleur || '#999')}"></span> <b>${esc(s?.nom || code)}</b></td>
          <td class="montant positif">${fmt(v.r)}</td><td class="montant negatif">${fmt(v.d)}</td><td class="montant">${fmt(v.r - v.d)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="vide">Aucune opération cette année</td></tr>'}
      </tbody></table></div></div>
    </div>`;

  $('#tb-annee').onchange = (e) => { filtreTB.annee = Number(e.target.value); router(); };
  if ($('#tb-perim')) $('#tb-perim').onchange = (e) => { filtreTB.perimetre = e.target.value; router(); };
  $('#tb-mois').onchange = (e) => { filtreTB.mois = Number(e.target.value); router(); };

  const coul = { marine: '#11316e', bleu: '#2467b6', orange: '#f7941d', vert: '#16a34a', rouge: '#dc2626' };
  Chart.defaults.font.family = 'Nunito, system-ui, sans-serif';
  Chart.defaults.color = '#475569';
  const eur = { callbacks: { label: (c) => `${c.dataset.label ? c.dataset.label + ' : ' : ''}${fmt(c.parsed.y ?? c.parsed)}` } };
  graphiques.push(new Chart($('#g-balance'), {
    data: { labels: MOIS, datasets: [
      { type: 'bar', label: 'Recettes', data: rec, backgroundColor: coul.bleu, borderRadius: 6 },
      { type: 'bar', label: 'Dépenses', data: dep, backgroundColor: coul.orange, borderRadius: 6 },
      { type: 'line', label: 'Balance cumulée', data: cumuls, borderColor: coul.marine, backgroundColor: coul.marine, tension: .3, pointRadius: 3 }
    ] },
    options: { maintainAspectRatio: false, plugins: { tooltip: eur, legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: v => fmt(v) } } } }
  }));
  const donut = (src) => {
    const entrees = Object.entries(src).sort((a, b) => b[1] - a[1]);
    return { labels: entrees.map(([k]) => categorieParId(k)?.nom || 'Non classé'),
      datasets: [{ data: entrees.map(e => e[1]), backgroundColor: entrees.map(([k], i) => categorieParId(k)?.couleur || ['#94a3b8', '#2467b6', '#f7941d'][i % 3]), borderWidth: 2 }] };
  };
  const gCat = new Chart($('#g-cat'), { type: 'doughnut', data: donut(parCat),
    options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: innerWidth < 820 ? 'bottom' : 'right' }, tooltip: { callbacks: { label: c => `${c.label} : ${fmt(c.parsed)}` } } } } });
  graphiques.push(gCat);
  $('#b-cat').onclick = (e) => { const b = e.target.closest('button'); if (!b) return;
    $$('#b-cat button').forEach(x => x.classList.toggle('on', x === b));
    gCat.data = donut(b.dataset.p === 'mois' ? parCat : parCatAn); gCat.update(); };
  graphiques.push(new Chart($('#g-especes'), { type: 'bar',
    data: { labels: MOIS, datasets: [{ label: 'Entrées espèces', data: recEsp, backgroundColor: coul.vert, borderRadius: 6 }, { label: 'Sorties espèces', data: depEsp, backgroundColor: coul.rouge, borderRadius: 6 }] },
    options: { maintainAspectRatio: false, plugins: { tooltip: eur, legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: v => fmt(v) } } } } }));
  const ann = verifier(annees).sort((a, b) => a.annee - b.annee);
  graphiques.push(new Chart($('#g-annees'), { type: 'bar',
    data: { labels: ann.map(a => a.annee), datasets: [
      { label: 'Recettes', data: ann.map(a => a.recettes), backgroundColor: coul.bleu, borderRadius: 6 },
      { label: 'Dépenses', data: ann.map(a => a.depenses), backgroundColor: coul.orange, borderRadius: 6 },
      { label: 'Balance', data: ann.map(a => a.balance), backgroundColor: coul.marine, borderRadius: 6 }] },
    options: { maintainAspectRatio: false, plugins: { tooltip: eur, legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: v => fmt(v) } } } } }));
};

/* ================================================================= OPÉRATIONS */
const filtreOp = { du: `${new Date().getFullYear()}-01-01`, au: '', type: '', compte: '', categorie: '', structure: '', moyen: '', q: '' };
async function requeteOperations(f, limite = 1000) {
  let q = db.from('operations').select('*, documents(id)').order('date_operation', { ascending: false }).order('created_at', { ascending: false }).limit(limite);
  if (f.du) q = q.gte('date_operation', f.du);
  if (f.au) q = q.lte('date_operation', f.au);
  if (f.type) q = q.eq('type', f.type);
  if (f.compte) q = q.eq('compte_id', f.compte);
  if (f.categorie) q = q.eq('categorie_id', f.categorie);
  if (f.structure) q = q.eq('structure_code', f.structure);
  if (f.moyen) q = q.eq('moyen_paiement', f.moyen);
  if (f.q) q = q.or(`libelle.ilike.%${f.q.replace(/[,()%]/g, ' ')}%,reference.ilike.%${f.q.replace(/[,()%]/g, ' ')}%`);
  return verifier(await q, 'Opérations');
}
function ligneOperation(o) {
  const cat = categorieParId(o.categorie_id), ti = tiersParId(o.tiers_id), co = compteParId(o.compte_id), st = structureParCode(o.structure_code);
  const signe = o.type === 'recette' ? '+' : '−';
  return `<tr data-id="${o.id}" style="cursor:pointer">
    <td>${fmtDate(o.date_operation)}</td>
    <td><div class="avec-image">${vignette(imageOperation(o), ti?.nom || o.libelle)}<div><b>${esc(o.libelle)}</b>
      <div class="aide">${esc(ti?.nom || '')}${o.reference ? ' · ' + esc(o.reference) : ''}${o.documents?.length ? ` · 📎 ${o.documents.length}` : ''}${o.statut !== 'validee' ? ` · <span class="pastille orange">${STATUTS[o.statut]}</span>` : ''}</div></div></div></td>
    <td class="masquer-mobile">${cat ? `<span class="pastille"><span class="point" style="background:${esc(cat.couleur)}"></span>${esc(cat.nom)}</span>` : ''}</td>
    <td class="masquer-mobile">${esc(co?.nom || '')}<div class="aide">${MOYENS[o.moyen_paiement] || ''}</div></td>
    <td class="masquer-mobile"><span class="point" style="background:${esc(st?.couleur || '#ccc')}"></span> ${esc(st?.nom || o.structure_code)}</td>
    <td class="montant ${o.type === 'recette' ? 'positif' : 'negatif'}">${signe}${fmt(o.montant)}</td></tr>`;
}
VUES.operations = async (el, param) => {
  const f = filtreOp;
  el.innerHTML = `
    <div class="tete-vue"><h1>Dépenses &amp; recettes</h1><div class="actions">
      <button class="btn btn-fantome" id="op-pdf">📄 PDF</button><button class="btn btn-fantome" id="op-csv">⬇ Excel (CSV)</button>
      <button class="btn btn-bleu" id="op-rec">＋ Recette</button>
      <button class="btn btn-primaire" id="op-dep">＋ Dépense</button></div></div>
    <div class="carte"><form class="filtres" id="op-filtres">
      <div><label>Du</label><input type="date" name="du" value="${f.du}"></div>
      <div><label>Au</label><input type="date" name="au" value="${f.au}"></div>
      <div><label>Type</label><select name="type"><option value="">Tous</option>${opts({ depense: 'Dépenses', recette: 'Recettes' }, f.type)}</select></div>
      <div><label>Compte</label><select name="compte">${optsListe(R.comptes, f.compte, 'Tous')}</select></div>
      <div><label>Catégorie</label><select name="categorie">${optsListe(R.categories, f.categorie, 'Toutes')}</select></div>
      <div><label>Structure</label><select name="structure">${optsListe(R.structures, f.structure, 'Toutes')}</select></div>
      <div><label>Paiement</label><select name="moyen"><option value="">Tous</option>${opts(MOYENS, f.moyen)}</select></div>
      <div style="flex:2"><label>Recherche</label><input name="q" value="${esc(f.q)}" placeholder="Libellé, référence…"></div>
    </form>
    <div id="op-totaux" class="aide" style="margin-bottom:8px"></div>
    <div class="tableau-wrap"><table><thead><tr><th>Date</th><th>Libellé / provenance</th><th class="masquer-mobile">Catégorie</th><th class="masquer-mobile">Compte</th><th class="masquer-mobile">Structure</th><th class="montant">Montant</th></tr></thead>
    <tbody id="op-liste"><tr><td colspan="6" class="chargement">Chargement…</td></tr></tbody></table></div></div>`;
  let liste = [];
  const charger = async () => {
    liste = await requeteOperations(f);
    await signerImages(liste.map(o => imageParId(imageOperation(o))?.storage_path));
    const r = liste.filter(o => o.type === 'recette').reduce((a, o) => a + Number(o.montant), 0);
    const d = liste.filter(o => o.type === 'depense').reduce((a, o) => a + Number(o.montant), 0);
    $('#op-totaux').innerHTML = `${liste.length} opération(s) · Recettes <b class="positif">${fmt(r)}</b> · Dépenses <b class="negatif">${fmt(d)}</b> · Balance <b>${fmt(r - d)}</b>`;
    $('#op-liste').innerHTML = liste.map(ligneOperation).join('') || '<tr><td colspan="6" class="vide">Aucune opération pour ces filtres.</td></tr>';
  };
  let minuterie;
  $('#op-filtres').addEventListener('input', (e) => { f[e.target.name] = e.target.value; clearTimeout(minuterie); minuterie = setTimeout(() => charger().catch(x => toast(x.message, true)), 300); });
  $('#op-liste').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) formOperation(liste.find(o => o.id === tr.dataset.id), charger); };
  $('#op-dep').onclick = () => formOperation({ type: 'depense' }, charger);
  $('#op-rec').onclick = () => formOperation({ type: 'recette' }, charger);
  $('#op-csv').onclick = (e) => action(e.currentTarget, () => exporterCsv(liste));
  $('#op-pdf').onclick = (e) => action(e.currentTarget, () => window.BFC_EXPORT.pdfOperations(liste, { periode: `Du ${f.du ? fmtDate(f.du) : 'début'} au ${f.au ? fmtDate(f.au) : fmtDate(auj())}`,
    tiers: o => tiersParId(o.tiers_id)?.nom, categorie: o => categorieParId(o.categorie_id)?.nom, compte: o => compteParId(o.compte_id)?.nom, structure: o => structureParCode(o.structure_code)?.nom }));
  await charger();
  if (param === 'nouvelle') formOperation({ type: 'depense' }, charger);
};

function exporterCsv(liste) {
  const ent = ['Date', 'Type', 'Libellé', 'Montant', 'Compte', 'Moyen de paiement', 'Catégorie', 'Provenance', 'Structure', 'Référence', 'TVA %', 'Montant TVA', 'Statut', 'Notes'];
  const lignes = liste.map(o => [o.date_operation, o.type, o.libelle, String(o.montant).replace('.', ','), compteParId(o.compte_id)?.nom, MOYENS[o.moyen_paiement],
    categorieParId(o.categorie_id)?.nom, tiersParId(o.tiers_id)?.nom, structureParCode(o.structure_code)?.nom, o.reference, o.taux_tva, o.montant_tva, STATUTS[o.statut], o.notes]);
  return window.BFC_EXPORT.csv(`B-Safe_operations_${auj()}.csv`, ent, lignes);
}

async function televerserDocuments(fichiers, lien) {
  for (const fichier of fichiers) {
    const d = new Date(); const chemin = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${uuid()}-${nettoyerNom(fichier.name)}`;
    const up = await sb.storage.from(C.bucketDocuments).upload(chemin, fichier, { contentType: fichier.type || undefined });
    if (up.error) throw new Error(`Envoi de « ${fichier.name} » : ${up.error.message}`);
    verifier(await db.from('documents').insert({ ...lien, nom_fichier: fichier.name, storage_path: chemin, mime_type: fichier.type, taille_octets: fichier.size }), 'Document');
  }
}
async function ouvrirDocument(chemin) {
  const { data, error } = await sb.storage.from(C.bucketDocuments).createSignedUrl(chemin, 300);
  if (error) return toast(error.message, true);
  window.open(data.signedUrl, '_blank', 'noopener');
}
async function supprimerDocument(doc) {
  await sb.storage.from(C.bucketDocuments).remove([doc.storage_path]);
  verifier(await db.from('documents').delete().eq('id', doc.id), 'Suppression document');
}

async function formOperation(o = {}, apres) {
  const neuf = !o.id;
  const docs = neuf ? [] : verifier(await db.from('documents').select('*').eq('operation_id', o.id).order('created_at'));
  const type = o.type || 'depense';
  const compteDefaut = o.compte_id || R.comptes.find(c => c.actif && c.type === 'banque')?.id || R.comptes[0]?.id;
  const html = `<form id="f-op">
    <div class="champ"><div class="bascule" id="op-type"><button type="button" data-t="depense" class="${type === 'depense' ? 'on dep' : ''}">Dépense</button><button type="button" data-t="recette" class="${type === 'recette' ? 'on rec' : ''}">Recette</button></div>
      <input type="hidden" name="type" value="${type}"></div>
    <div class="ligne3">
      <div class="champ"><label>Montant TTC (€) *</label><input name="montant" inputmode="decimal" required value="${o.montant ?? ''}" placeholder="0,00"></div>
      <div class="champ"><label>Date *</label><input type="date" name="date_operation" required value="${o.date_operation || auj()}"></div>
      <div class="champ"><label>Statut</label><select name="statut">${opts(STATUTS, o.statut || 'validee')}</select></div>
    </div>
    <div class="champ"><label>Libellé *</label><input name="libelle" required value="${esc(o.libelle || '')}" placeholder="ex : Facture EDF octobre"></div>
    <div class="ligne">
      <div class="champ"><label>Compte *</label><select name="compte_id" required>${optsListe(R.comptes.filter(c => c.actif || c.id === o.compte_id), compteDefaut, 'Choisir…', c => `${c.nom} (${TYPES_COMPTE[c.type]}${c.nature && c.nature !== 'professionnel' ? ' · ' + NATURES[c.nature] : ''})`)}</select></div>
      <div class="champ"><label>Moyen de paiement</label><select name="moyen_paiement">${opts(MOYENS, o.moyen_paiement || (compteParId(compteDefaut)?.type === 'especes' ? 'especes' : 'carte'))}</select></div>
    </div>
    <div class="ligne">
      <div class="champ"><label>Provenance / tiers</label><select name="tiers_id">${optsListe(R.tiers, o.tiers_id, '—')}</select><div class="aide"><a href="#/tiers">Gérer les provenances</a></div></div>
      <div class="champ"><label>Catégorie</label><select name="categorie_id"></select></div>
    </div>
    ${R.espaces.length ? `<div class="champ"><label>Espace de vie</label><select name="espace">${optsListe(R.espaces, o.espace || null, 'Automatique (selon la catégorie)', e => e.icone + ' ' + e.nom)}</select></div>` : ''}
    <div class="ligne3">
      <div class="champ"><label>Structure concernée</label><select name="structure_code">${R.structures.map(s => `<option value="${s.code}" ${s.code === (o.structure_code || 'bformatik') ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></div>
      <div class="champ"><label>Référence</label><input name="reference" value="${esc(o.reference || '')}" placeholder="n° facture, chèque…"></div>
      <div class="champ"><label>TVA %</label><input name="taux_tva" inputmode="decimal" value="${o.taux_tva ?? ''}" placeholder="8,5 / 2,1…"></div>
    </div>
    <div class="champ"><label>Image (provenance)</label>${choixImageHtml('image_id', o.image_id)}<div class="aide">Laissez « Aucune » pour utiliser l'image de la provenance ou de la catégorie.</div></div>
    <div class="champ"><label>Notes</label><textarea name="notes" rows="2">${esc(o.notes || '')}</textarea></div>
    <div class="champ"><label>Justificatifs (factures, tickets, reçus…)</label>
      <div id="op-docs">${docs.map(d => `<div class="avec-image" style="margin-bottom:6px">📎 <a href="#" data-ouvrir="${esc(d.storage_path)}">${esc(d.nom_fichier)}</a> <span class="aide">${TYPES_DOC[d.type] || ''}</span> <button type="button" class="btn btn-danger btn-petit" data-suppr-doc="${d.id}">Retirer</button></div>`).join('')}</div>
      <input type="file" name="fichiers" multiple accept="application/pdf,image/*,.docx,.xlsx,.csv" capture="environment">
      <div class="aide">PDF ou photo (20 Mo max par fichier).</div></div>
    <div class="modale-pied">
      ${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="op-suppr">Supprimer</button><button type="button" class="btn btn-fantome" id="op-dupl">Dupliquer</button>'}
      <button type="button" class="btn btn-fantome" data-fermer>Annuler</button>
      <button class="btn btn-primaire">Enregistrer</button></div>
  </form>`;
  ouvrirModale(neuf ? (type === 'recette' ? 'Nouvelle recette' : 'Nouvelle dépense') : 'Modifier l\'opération', html, (m) => {
    const f = $('#f-op', m);
    brancherChoixImage(m);
    const majCategories = () => {
      const t = f.type.value;
      f.categorie_id.innerHTML = optsListe(R.categories.filter(c => c.type === t && (c.actif || c.id === o.categorie_id)), f.categorie_id.value || o.categorie_id, '—');
    };
    majCategories();
    $('#op-type', m).onclick = (e) => { const b = e.target.closest('button'); if (!b) return;
      f.type.value = b.dataset.t;
      $$('#op-type button', m).forEach(x => { x.className = x === b ? 'on ' + (b.dataset.t === 'depense' ? 'dep' : 'rec') : ''; });
      majCategories(); };
    f.compte_id.onchange = () => { if (compteParId(f.compte_id.value)?.type === 'especes') f.moyen_paiement.value = 'especes'; };
    f.tiers_id.onchange = () => { const t = tiersParId(f.tiers_id.value); if (t?.categorie_defaut_id && !f.categorie_id.value) f.categorie_id.value = t.categorie_defaut_id; };
    $('#op-docs', m).onclick = (e) => {
      const ouv = e.target.closest('[data-ouvrir]'); if (ouv) { e.preventDefault(); ouvrirDocument(ouv.dataset.ouvrir); }
      const sup = e.target.closest('[data-suppr-doc]');
      if (sup) action(sup, async () => { if (!await confirmer('Retirer ce justificatif ?')) return; await supprimerDocument(docs.find(d => d.id === sup.dataset.supprDoc)); sup.parentElement.remove(); toast('Justificatif retiré.'); });
    };
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const montant = num(f, 'montant');
      if (!(montant > 0)) throw new Error('Le montant doit être supérieur à 0.');
      const taux = num(f, 'taux_tva');
      const rec = { type: f.type.value, montant, date_operation: val(f, 'date_operation'), libelle: val(f, 'libelle'), compte_id: val(f, 'compte_id'),
        moyen_paiement: val(f, 'moyen_paiement'), tiers_id: val(f, 'tiers_id'), categorie_id: val(f, 'categorie_id'), structure_code: val(f, 'structure_code'),
        reference: val(f, 'reference'), statut: val(f, 'statut'), taux_tva: taux, montant_tva: taux ? Math.round(montant * taux / (100 + taux) * 100) / 100 : null,
        image_id: val(f, 'image_id'), notes: val(f, 'notes') };
      if (f.espace) rec.espace = val(f, 'espace');
      if (o.piece_id) rec.piece_id = o.piece_id;
      if (o.transaction_id) { rec.transaction_id = o.transaction_id; rec.statut = 'rapprochee'; }
      const res = neuf ? await db.from('operations').insert(rec).select().single() : await db.from('operations').update(rec).eq('id', o.id).select().single();
      const op = verifier(res, 'Enregistrement');
      if (f.fichiers.files.length) await televerserDocuments([...f.fichiers.files], { operation_id: op.id, compte_id: op.compte_id, tiers_id: op.tiers_id,
        structure_code: op.structure_code, type: op.type === 'recette' ? 'recu' : 'facture', date_document: op.date_operation, montant: op.montant });
      fermerModale(); toast(neuf ? 'Opération enregistrée.' : 'Opération mise à jour.');
      apres && apres(op);
    }); };
    if (!neuf) {
      $('#op-suppr', m).onclick = (e) => action(e.target, async () => {
        if (!await confirmer('Supprimer définitivement cette opération ?')) return;
        for (const d of docs) await supprimerDocument(d);
        verifier(await db.from('operations').delete().eq('id', o.id), 'Suppression');
        fermerModale(); toast('Opération supprimée.'); apres && apres();
      });
      $('#op-dupl', m).onclick = () => { const { id, created_at, updated_at, documents, ...copie } = o; fermerModale(); formOperation({ ...copie, date_operation: auj() }, apres); };
    }
  });
}

/* ================================================================= ESPÈCES */
VUES.especes = async (el) => {
  await chargerSoldes();
  const caisses = R.comptes.filter(c => c.type === 'especes' && c.actif);
  const banques = R.comptes.filter(c => c.type !== 'especes' && c.actif);
  if (!caisses.length) {
    el.innerHTML = `<div class="tete-vue"><h1>Espèces</h1></div><div class="carte"><p>Aucun compte « Espèces » actif.</p><button class="btn btn-primaire" id="es-creer">Créer une caisse</button></div>`;
    $('#es-creer').onclick = () => formCompte({ type: 'especes', nom: 'Caisse espèces' });
    return;
  }
  const ids = caisses.map(c => c.id);
  const mvts = verifier(await db.from('v_mouvements').select('*').in('compte_id', ids).order('date_mouvement', { ascending: false }).limit(300));
  const total = R.soldes.filter(s => ids.includes(s.compte_id)).reduce((a, s) => a + Number(s.solde_actuel), 0);
  el.innerHTML = `
    <div class="tete-vue"><h1>💶 Espèces</h1><div class="actions">
      <button class="btn btn-fantome" id="es-retrait">🏧 Retrait banque → caisse</button>
      <button class="btn btn-fantome" id="es-depot">🏦 Dépôt caisse → banque</button>
      <button class="btn btn-bleu" id="es-rec">＋ Recette espèces</button>
      <button class="btn btn-fantome" id="es-pdf">🖨 PDF</button>
      <button class="btn btn-primaire" id="es-dep">＋ Dépense espèces</button></div></div>
    <div class="grille g4">
      <div class="carte kpi principal"><div class="lib">Argent liquide disponible</div><div class="val">${fmt(total)}</div><div class="det">${caisses.length} caisse(s)</div></div>
      ${caisses.map(c => { const s = R.soldes.find(x => x.compte_id === c.id); return `<div class="carte kpi"><div class="lib">${esc(c.nom)}</div><div class="val">${fmt(s?.solde_actuel)}</div><div class="det">Entrées ${fmt(s?.total_recettes)} · Sorties ${fmt(s?.total_depenses)}</div></div>`; }).join('')}
    </div>
    <div class="carte mt"><h3>Mouvements de caisse</h3><div class="tableau-wrap"><table>
      <thead><tr><th>Date</th><th>Libellé</th><th>Nature</th><th class="montant">Montant</th></tr></thead><tbody>
      ${mvts.map(m => `<tr><td>${fmtDate(m.date_mouvement)}</td><td>${esc(m.libelle)}${caisses.length > 1 ? `<div class="aide">${esc(compteParId(m.compte_id)?.nom)}</div>` : ''}</td>
        <td><span class="pastille ${m.montant_signe < 0 ? 'dep' : 'rec'}">${{ recette: 'Recette', depense: 'Dépense', virement_entrant: 'Retrait banque', virement_sortant: 'Dépôt banque' }[m.nature] || m.nature}</span></td>
        <td class="montant ${m.montant_signe < 0 ? 'negatif' : 'positif'}">${fmt(m.montant_signe)}</td></tr>`).join('') || '<tr><td colspan="4" class="vide">Aucun mouvement</td></tr>'}
      </tbody></table></div></div>`;
  const recharger = () => router();
  $('#es-pdf').onclick = (e) => action(e.currentTarget, () => window.BFC_EXPORT.pdfTableau('Caisse espèces', `Disponible : ${fmt(total)}`, ['Date', 'Libellé', 'Caisse', 'Montant'],
    mvts.map(m => [fmtDate(m.date_mouvement), m.libelle, compteParId(m.compte_id)?.nom || '', fmt(m.montant_signe)]), `Especes_${auj()}.pdf`, [3]));
  $('#es-dep').onclick = () => formOperation({ type: 'depense', compte_id: caisses[0].id, moyen_paiement: 'especes' }, recharger);
  $('#es-rec').onclick = () => formOperation({ type: 'recette', compte_id: caisses[0].id, moyen_paiement: 'especes' }, recharger);
  $('#es-retrait').onclick = () => formVirement({ compte_source_id: banques[0]?.id, compte_destination_id: caisses[0].id, libelle: 'Retrait espèces (DAB)' }, recharger);
  $('#es-depot').onclick = () => formVirement({ compte_source_id: caisses[0].id, compte_destination_id: banques[0]?.id, libelle: 'Dépôt d\'espèces en banque' }, recharger);
};

/* ================================================================= VIREMENTS */
VUES.virements = async (el) => {
  const liste = verifier(await db.from('virements').select('*').order('date_virement', { ascending: false }).limit(500));
  el.innerHTML = `<div class="tete-vue"><h1>Virements entre comptes</h1><div class="actions"><button class="btn btn-fantome" id="vi-pdf">🖨 PDF</button><button class="btn btn-primaire" id="vi-nouveau">＋ Nouveau virement</button></div></div>
    <div class="carte"><p class="aide" style="margin-top:0">Un virement déplace de l'argent entre deux de vos comptes (ex. retrait au distributeur = banque → caisse). Il ne compte ni en recette ni en dépense.</p>
    <div class="tableau-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th>De</th><th>Vers</th><th class="montant">Montant</th></tr></thead><tbody>
    ${liste.map(v => `<tr data-id="${v.id}" style="cursor:pointer"><td>${fmtDate(v.date_virement)}</td><td>${esc(v.libelle)}</td><td>${esc(compteParId(v.compte_source_id)?.nom)}</td><td>${esc(compteParId(v.compte_destination_id)?.nom)}</td><td class="montant">${fmt(v.montant)}</td></tr>`).join('') || '<tr><td colspan="5" class="vide">Aucun virement</td></tr>'}
    </tbody></table></div></div>`;
  $('#vi-nouveau').onclick = () => formVirement({}, router);
  $('#vi-pdf').onclick = (e) => action(e.currentTarget, () => window.BFC_EXPORT.pdfTableau('Virements entre comptes', '', ['Date', 'Libellé', 'De', 'Vers', 'Montant'],
    liste.map(v => [fmtDate(v.date_virement), v.libelle, compteParId(v.compte_source_id)?.nom || '', compteParId(v.compte_destination_id)?.nom || '', fmt(v.montant)]), `Virements_${auj()}.pdf`, [4]));
  $('tbody', el).onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) formVirement(liste.find(v => v.id === tr.dataset.id), router); };
};
function formVirement(v = {}, apres) {
  const neuf = !v.id;
  const actifs = R.comptes.filter(c => c.actif);
  ouvrirModale(neuf ? 'Nouveau virement' : 'Modifier le virement', `<form id="f-vi">
    <div class="ligne"><div class="champ"><label>Compte de départ *</label><select name="compte_source_id" required>${optsListe(actifs, v.compte_source_id, 'Choisir…')}</select></div>
      <div class="champ"><label>Compte d'arrivée *</label><select name="compte_destination_id" required>${optsListe(actifs, v.compte_destination_id, 'Choisir…')}</select></div></div>
    <div class="ligne"><div class="champ"><label>Montant (€) *</label><input name="montant" inputmode="decimal" required value="${v.montant ?? ''}"></div>
      <div class="champ"><label>Date *</label><input type="date" name="date_virement" required value="${v.date_virement || auj()}"></div></div>
    <div class="champ"><label>Libellé</label><input name="libelle" value="${esc(v.libelle || 'Virement interne')}"></div>
    <div class="champ"><label>Notes</label><textarea name="notes" rows="2">${esc(v.notes || '')}</textarea></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="vi-suppr">Supprimer</button>'}
      <button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    const f = $('#f-vi', m);
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { compte_source_id: val(f, 'compte_source_id'), compte_destination_id: val(f, 'compte_destination_id'), montant: num(f, 'montant'),
        date_virement: val(f, 'date_virement'), libelle: val(f, 'libelle') || 'Virement interne', notes: val(f, 'notes') };
      if (rec.compte_source_id === rec.compte_destination_id) throw new Error('Choisissez deux comptes différents.');
      if (!(rec.montant > 0)) throw new Error('Le montant doit être supérieur à 0.');
      verifier(neuf ? await db.from('virements').insert(rec) : await db.from('virements').update(rec).eq('id', v.id), 'Virement');
      fermerModale(); toast('Virement enregistré.'); apres && apres();
    }); };
    if (!neuf) $('#vi-suppr', m).onclick = (e) => action(e.target, async () => {
      if (!await confirmer('Supprimer ce virement ?')) return;
      verifier(await db.from('virements').delete().eq('id', v.id)); fermerModale(); toast('Virement supprimé.'); apres && apres();
    });
  });
}

/* ================================================================= COMPTES */
VUES.comptes = async (el) => {
  await Promise.all([chargerReferentiels(), chargerSoldes()]);
  el.innerHTML = `<div class="tete-vue"><h1>Comptes</h1><div class="actions">${R.pro ? '' : ''}<button class="btn btn-fantome" id="co-pdf">🖨 PDF</button><button class="btn btn-primaire" id="co-nouveau">＋ Nouveau compte</button></div></div>
    <p class="aide" style="margin-top:-8px">🏢 Professionnel : partagé avec l'équipe B-Form@tik · 🔒 Personnel : visible de vous seul · 👥 Joint : visible de ses titulaires uniquement.</p>
    <div class="grille g3">${R.comptes.map(c => { const s = R.soldes.find(x => x.compte_id === c.id);
      return `<div class="carte compte-carte" style="border-top-color:${esc(c.couleur || '#2467b6')};${c.actif ? '' : 'opacity:.6'}">
        <div class="avec-image">${vignette(c.image_id, c.nom, true)}<div><h3 style="margin:0">${esc(c.nom)}</h3><span class="pastille ${c.type === 'especes' ? 'orange' : ''}">${TYPES_COMPTE[c.type]}</span> <span class="pastille ${c.nature === 'professionnel' ? '' : c.nature === 'joint' ? 'rec' : 'orange'}">${c.nature === 'joint' ? '👥 ' : c.nature === 'personnel' ? '🔒 ' : '🏢 '}${NATURES[c.nature] || 'Professionnel'}</span> ${c.actif ? '' : '<span class="pastille">Archivé</span>'}</div></div>
        <div class="solde mt">${s ? fmt(s.solde_actuel) : '—'}</div>
        <div class="aide">${esc(c.banque || '')}${c.iban ? ' · ' + esc(c.iban) : ''}</div>
        <div class="aide">Solde initial ${fmt(c.solde_initial)} au ${fmtDate(c.date_ouverture)}</div>
        <div style="margin-top:10px;display:flex;gap:6px"><button class="btn btn-fantome btn-petit" data-modif="${c.id}">Modifier</button>
          <a class="btn btn-fantome btn-petit" href="#/operations" data-filtre="${c.id}">Opérations</a></div></div>`; }).join('') || '<div class="carte">Aucun compte.</div>'}</div>`;
  $('#co-nouveau').onclick = () => formCompte({ nature: R.pro ? 'professionnel' : 'personnel' }, router);
  $('#co-pdf').onclick = (e) => action(e.currentTarget, () => window.BFC_EXPORT.pdfTableau('Comptes et soldes', `au ${fmtDate(auj())}`, ['Compte', 'Type', 'Nature', 'Banque', 'Solde'],
    R.comptes.filter(c => c.actif).map(c => [c.nom, TYPES_COMPTE[c.type], NATURES[c.nature] || '', c.banque || '', fmt(R.soldes.find(s => s.compte_id === c.id)?.solde_actuel)]), `Comptes_${auj()}.pdf`, [4]));
  el.onclick = (e) => {
    const b = e.target.closest('[data-modif]'); if (b) formCompte(compteParId(b.dataset.modif), router);
    const a = e.target.closest('[data-filtre]'); if (a) { filtreOp.compte = a.dataset.filtre; filtreOp.du = ''; }
  };
};
function formCompte(c = {}, apres) {
  const neuf = !c.id;
  ouvrirModale(neuf ? 'Nouveau compte' : 'Modifier le compte', `<form id="f-co">
    <div class="ligne"><div class="champ"><label>Nom *</label><input name="nom" required value="${esc(c.nom || '')}"></div>
      <div class="champ"><label>Type</label><select name="type">${opts(TYPES_COMPTE, c.type || 'banque')}</select></div></div>
    <div class="champ"><label>Nature du compte</label><select name="nature">${Object.entries(NATURES).filter(([k]) => R.pro || k !== 'professionnel').map(([k, v]) => `<option value="${k}" ${k === (c.nature || 'professionnel') ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="aide">Personnel : visible de vous seul. Joint : partagé avec les titulaires que vous ajoutez (ex. conjoint). Professionnel : partagé avec l'équipe B-Form@tik.</div></div>
    ${!neuf && c.nature !== 'professionnel' ? `<div class="champ"><label>Titulaires</label><div id="co-titulaires" class="aide">Chargement…</div>
      <div style="display:flex;gap:8px;margin-top:6px"><input id="co-email-tit" type="email" placeholder="adresse e-mail du co-titulaire"><button type="button" class="btn btn-bleu btn-petit" id="co-ajout-tit">Ajouter</button></div>
      <div class="aide">La personne doit avoir créé son accès B-S@fe (« Créer un compte » sur l'écran de connexion).</div></div>` : ''}
    <div class="ligne"><div class="champ"><label>Banque</label><input name="banque" value="${esc(c.banque || '')}"></div>
      <div class="champ"><label>IBAN</label><input name="iban" value="${esc(c.iban || '')}"></div></div>
    <div class="ligne3"><div class="champ"><label>Solde initial (€)</label><input name="solde_initial" inputmode="decimal" value="${c.solde_initial ?? 0}"></div>
      <div class="champ"><label>À la date du</label><input type="date" name="date_ouverture" value="${c.date_ouverture || auj()}"></div>
      <div class="champ"><label>Couleur</label><input type="color" name="couleur" value="${c.couleur || '#2467b6'}"></div></div>
    <div class="champ"><label>Image</label>${choixImageHtml('image_id', c.image_id)}</div>
    <div class="champ"><label>Notes</label><textarea name="notes" rows="2">${esc(c.notes || '')}</textarea></div>
    <div class="champ"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="actif" ${c.actif === false ? '' : 'checked'}> Compte actif</label></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="co-suppr">Supprimer</button>'}
      <button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    brancherChoixImage(m);
    const f = $('#f-co', m);
    const chargerTitulaires = async () => {
      const box = $('#co-titulaires', m); if (!box) return;
      const t = verifier(await db.rpc('titulaires', { p_compte: c.id }));
      box.innerHTML = t.map(x => `<div class="avec-image" style="margin-bottom:4px">${x.role === 'titulaire' ? '👤' : '👥'} <b>${esc(x.email)}</b> <span class="aide">${x.role === 'titulaire' ? 'titulaire' : 'co-titulaire'}</span>
        ${t.length > 1 ? `<button type="button" class="btn btn-danger btn-petit" data-retirer="${x.user_id}">Retirer</button>` : ''}</div>`).join('');
      box.onclick = (e) => { const b = e.target.closest('[data-retirer]'); if (b) action(b, async () => {
        if (!await confirmer('Retirer ce titulaire ? Il ne verra plus ce compte.')) return;
        verifier(await db.rpc('retirer_titulaire', { p_compte: c.id, p_user: b.dataset.retirer })); chargerTitulaires(); }); };
    };
    if ($('#co-ajout-tit', m)) {
      chargerTitulaires();
      $('#co-ajout-tit', m).onclick = (e) => action(e.currentTarget, async () => {
        const email = $('#co-email-tit', m).value.trim(); if (!email) return;
        verifier(await db.rpc('ajouter_titulaire', { p_compte: c.id, p_email: email }), 'Titulaire');
        $('#co-email-tit', m).value = ''; f.nature.value = 'joint'; toast('Co-titulaire ajouté : le compte est maintenant joint.'); chargerTitulaires();
      });
    }
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { nom: val(f, 'nom'), type: val(f, 'type'), nature: val(f, 'nature'), banque: val(f, 'banque'), iban: val(f, 'iban'), solde_initial: num(f, 'solde_initial') || 0,
        date_ouverture: val(f, 'date_ouverture'), couleur: val(f, 'couleur'), image_id: val(f, 'image_id'), notes: val(f, 'notes'), actif: f.actif.checked };
      if (neuf && rec.nature !== 'professionnel') rec.proprietaire = (await sb.auth.getUser()).data.user?.id;
      verifier(neuf ? await db.from('comptes').insert(rec) : await db.from('comptes').update(rec).eq('id', c.id), 'Compte');
      await chargerReferentiels(); fermerModale(); toast('Compte enregistré.'); apres ? apres() : router();
    }); };
    if (!neuf) $('#co-suppr', m).onclick = (e) => action(e.target, async () => {
      if (!await confirmer('Supprimer ce compte ? (impossible s\'il contient des opérations : archivez-le plutôt)')) return;
      const r = await db.from('comptes').delete().eq('id', c.id);
      if (r.error) throw new Error('Ce compte contient des opérations ou virements : décochez « Compte actif » pour l\'archiver.');
      await chargerReferentiels(); fermerModale(); toast('Compte supprimé.'); router();
    });
  });
}

/* ================================================================= CATÉGORIES */
VUES.categories = async (el) => {
  await chargerReferentiels();
  const bloc = (t, titre) => `<div class="carte"><h3>${titre}</h3><div class="tableau-wrap"><table><tbody>
    ${R.categories.filter(c => c.type === t).map(c => `<tr data-id="${c.id}" style="cursor:pointer;${c.actif ? '' : 'opacity:.5'}"><td><div class="avec-image">${vignette(c.image_id, c.nom)}<span class="point" style="background:${esc(c.couleur)}"></span><b>${esc(c.nom)}</b>
      ${c.parent_id ? `<span class="aide">(${esc(categorieParId(c.parent_id)?.nom)})</span>` : ''}</div></td></tr>`).join('') || '<tr><td class="vide">Aucune</td></tr>'}
    </tbody></table></div></div>`;
  el.innerHTML = `<div class="tete-vue"><h1>Catégories</h1><div class="actions"><button class="btn btn-bleu" id="ca-rec">＋ Catégorie de recette</button><button class="btn btn-primaire" id="ca-dep">＋ Catégorie de dépense</button></div></div>
    <div class="grille g2">${bloc('depense', '🔻 Dépenses')}${bloc('recette', '🔺 Recettes')}</div>`;
  $('#ca-dep').onclick = () => formCategorie({ type: 'depense' });
  $('#ca-rec').onclick = () => formCategorie({ type: 'recette' });
  el.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) formCategorie(categorieParId(tr.dataset.id)); };
};
function formCategorie(c = {}) {
  const neuf = !c.id;
  ouvrirModale(neuf ? 'Nouvelle catégorie' : 'Modifier la catégorie', `<form id="f-ca">
    <div class="ligne"><div class="champ"><label>Nom *</label><input name="nom" required value="${esc(c.nom || '')}"></div>
      <div class="champ"><label>Type</label><select name="type">${opts({ depense: 'Dépense', recette: 'Recette' }, c.type)}</select></div></div>
    <div class="ligne"><div class="champ"><label>Catégorie parente</label><select name="parent_id">${optsListe(R.categories.filter(x => x.type === c.type && x.id !== c.id), c.parent_id, 'Aucune')}</select></div>
      <div class="champ"><label>Couleur (graphiques)</label><input type="color" name="couleur" value="${c.couleur || '#2467b6'}"></div></div>
    <div class="champ"><label>Image</label>${choixImageHtml('image_id', c.image_id)}</div>
    <div class="champ"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="actif" ${c.actif === false ? '' : 'checked'}> Active</label></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="ca-suppr">Supprimer</button>'}
      <button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    brancherChoixImage(m);
    const f = $('#f-ca', m);
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { nom: val(f, 'nom'), type: val(f, 'type'), parent_id: val(f, 'parent_id'), couleur: val(f, 'couleur'), image_id: val(f, 'image_id'), actif: f.actif.checked };
      verifier(neuf ? await db.from('categories').insert(rec) : await db.from('categories').update(rec).eq('id', c.id), 'Catégorie');
      fermerModale(); toast('Catégorie enregistrée.'); router();
    }); };
    if (!neuf) $('#ca-suppr', m).onclick = (e) => action(e.target, async () => {
      if (!await confirmer('Supprimer cette catégorie ? Les opérations liées deviendront « non classées ».')) return;
      verifier(await db.from('categories').delete().eq('id', c.id)); fermerModale(); toast('Catégorie supprimée.'); router();
    });
  });
}

/* ================================================================= TIERS (provenances) */
VUES.tiers = async (el) => {
  await chargerReferentiels();
  el.innerHTML = `<div class="tete-vue"><h1>Provenances (tiers)</h1><div class="actions"><button class="btn btn-primaire" id="ti-nouveau">＋ Nouvelle provenance</button></div></div>
    <div class="carte"><p class="aide" style="margin-top:0">Clients, fournisseurs, organismes… Chaque provenance peut avoir son image : elle s'affiche automatiquement sur les dépenses et recettes correspondantes.</p>
    <div class="galerie">${R.tiers.map(t => `<div class="tuile" data-id="${t.id}" style="cursor:pointer"><div style="padding:14px;display:grid;place-items:center;background:var(--ciel)">${vignette(t.image_id, t.nom, true)}</div>
      <div class="info"><b>${esc(t.nom)}</b><span class="aide">${TYPES_TIERS[t.type]}${t.categorie_defaut_id ? ' · ' + esc(categorieParId(t.categorie_defaut_id)?.nom) : ''}</span></div></div>`).join('') || '<p class="vide">Aucune provenance pour l\'instant.</p>'}</div></div>`;
  $('#ti-nouveau').onclick = () => formTiers({});
  el.onclick = (e) => { const t = e.target.closest('.tuile[data-id]'); if (t) formTiers(tiersParId(t.dataset.id)); };
};
function formTiers(t = {}) {
  const neuf = !t.id;
  ouvrirModale(neuf ? 'Nouvelle provenance' : 'Modifier la provenance', `<form id="f-ti">
    <div class="ligne"><div class="champ"><label>Nom *</label><input name="nom" required value="${esc(t.nom || '')}"></div>
      <div class="champ"><label>Type</label><select name="type">${opts(TYPES_TIERS, t.type || 'fournisseur')}</select></div></div>
    <div class="champ"><label>Catégorie proposée par défaut</label><select name="categorie_defaut_id">${optsListe(R.categories, t.categorie_defaut_id, 'Aucune', c => `${c.nom} (${c.type === 'depense' ? 'dépense' : 'recette'})`)}</select></div>
    <div class="champ"><label>Image / logo</label>${choixImageHtml('image_id', t.image_id)}</div>
    <div class="champ"><label>Adresses e-mail liées</label><input name="emails" value="${esc((t.emails || []).join(', '))}" placeholder="factures@edf.fr, @orange.fr">
      <div class="aide">Séparées par des virgules. « @domaine.fr » reconnaît toute l'entreprise. Sert à relier automatiquement les e-mails de factures.</div></div>
    <div class="champ"><label>Libellés bancaires reconnus</label><input name="motifs_banque" value="${esc((t.motifs_banque || []).join(', '))}" placeholder="PRLV SEPA EDF, EDF CLIENTS">
      <div class="aide">Morceaux de texte qui apparaissent sur vos relevés pour cette provenance.</div></div>
    <div class="ligne"><div class="champ"><label>E-mail de contact</label><input name="email" type="email" value="${esc(t.email || '')}"></div>
      <div class="champ"><label>Téléphone</label><input name="telephone" value="${esc(t.telephone || '')}"></div></div>
    <div class="ligne"><div class="champ"><label>Adresse</label><input name="adresse" value="${esc(t.adresse || '')}"></div>
      <div class="champ"><label>SIRET</label><input name="siret" value="${esc(t.siret || '')}"></div></div>
    <div class="champ"><label>Notes</label><textarea name="notes" rows="2">${esc(t.notes || '')}</textarea></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="ti-suppr">Supprimer</button>'}
      <button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    brancherChoixImage(m);
    const f = $('#f-ti', m);
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { nom: val(f, 'nom'), type: val(f, 'type'), categorie_defaut_id: val(f, 'categorie_defaut_id'), image_id: val(f, 'image_id'),
        email: val(f, 'email'), telephone: val(f, 'telephone'), adresse: val(f, 'adresse'), siret: val(f, 'siret'), notes: val(f, 'notes'),
        emails: (val(f, 'emails') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        motifs_banque: (val(f, 'motifs_banque') || '').split(',').map(s => s.trim()).filter(Boolean) };
      const r = neuf ? await db.from('tiers').insert(rec) : await db.from('tiers').update(rec).eq('id', t.id);
      if (r.error?.code === '23505') throw new Error('Une provenance porte déjà ce nom.');
      verifier(r, 'Provenance'); fermerModale(); toast('Provenance enregistrée.'); router();
    }); };
    if (!neuf) $('#ti-suppr', m).onclick = (e) => action(e.target, async () => {
      if (!await confirmer('Supprimer cette provenance ?')) return;
      verifier(await db.from('tiers').delete().eq('id', t.id)); fermerModale(); toast('Provenance supprimée.'); router();
    });
  });
}

/* ================================================================= BIBLIOTHÈQUE D'IMAGES */
VUES.images = async (el) => {
  await chargerReferentiels();
  let filtre = '';
  const rendre = () => {
    const liste = R.images.filter(i => !filtre || i.type === filtre);
    $('#im-galerie').innerHTML = liste.map(i => `<div class="tuile"><img src="${esc(urlsImages.get(i.storage_path) || '')}" alt="${esc(i.nom)}" loading="lazy">
      <div class="info"><b title="${esc(i.nom)}">${esc(i.nom)}</b><span class="aide">${TYPES_IMAGE[i.type]}${i.tags?.length ? ' · ' + esc(i.tags.join(', ')) : ''}</span>
      <div class="actions"><button class="btn btn-fantome btn-petit" data-modif="${i.id}">Modifier</button></div></div></div>`).join('') || '<p class="vide">Aucune image.</p>';
  };
  el.innerHTML = `<div class="tete-vue"><h1>Bibliothèque d'images</h1><div class="actions">
      <select id="im-filtre" style="width:auto"><option value="">Toutes</option>${opts(TYPES_IMAGE, '')}</select>
      <button class="btn btn-primaire" id="im-ajout">＋ Ajouter des images</button></div></div>
    <div class="carte"><p class="aide" style="margin-top:0">Logos de fournisseurs, clients, organismes, icônes de catégories… Choisissez-les ensuite lors de l'enregistrement des dépenses et recettes.</p>
    <div class="galerie" id="im-galerie"></div></div>`;
  rendre();
  $('#im-filtre').onchange = (e) => { filtre = e.target.value; rendre(); };
  $('#im-ajout').onclick = () => ouvrirModale('Ajouter des images', `<form id="f-im">
    <div class="champ"><label>Fichiers image *</label><input type="file" name="fichiers" accept="image/*" multiple required><div class="aide">PNG, JPG, WebP, SVG, GIF — 5 Mo max. Le nom du fichier devient le nom de l'image.</div></div>
    <div class="ligne"><div class="champ"><label>Type</label><select name="type">${opts(TYPES_IMAGE, 'provenance')}</select></div>
      <div class="champ"><label>Mots-clés</label><input name="tags" placeholder="énergie, banque…"></div></div>
    <div class="modale-pied"><button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Envoyer</button></div></form>`, (m) => {
    const f = $('#f-im', m);
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const tags = (val(f, 'tags') || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const fi of f.fichiers.files) {
        const chemin = `${f.type.value}/${uuid()}-${nettoyerNom(fi.name)}`;
        const up = await sb.storage.from(C.bucketImages).upload(chemin, fi, { contentType: fi.type });
        if (up.error) throw new Error(`« ${fi.name} » : ${up.error.message}`);
        verifier(await db.from('bibliotheque_images').insert({ nom: fi.name.replace(/\.[^.]+$/, ''), type: f.type.value, storage_path: chemin, mime_type: fi.type, taille_octets: fi.size, tags }), 'Image');
      }
      fermerModale(); toast('Images ajoutées.'); router();
    }); };
  });
  el.onclick = (e) => {
    const b = e.target.closest('[data-modif]'); if (!b) return;
    const i = imageParId(b.dataset.modif);
    ouvrirModale('Modifier l\'image', `<form id="f-im2"><div style="text-align:center;margin-bottom:12px"><img src="${esc(urlsImages.get(i.storage_path) || '')}" style="max-width:160px;max-height:160px"></div>
      <div class="ligne"><div class="champ"><label>Nom</label><input name="nom" required value="${esc(i.nom)}"></div>
        <div class="champ"><label>Type</label><select name="type">${opts(TYPES_IMAGE, i.type)}</select></div></div>
      <div class="champ"><label>Mots-clés</label><input name="tags" value="${esc((i.tags || []).join(', '))}"></div>
      <div class="modale-pied"><button type="button" class="btn btn-danger gauche" id="im-suppr">Supprimer</button>
        <button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
      const f = $('#f-im2', m);
      f.onsubmit = (ev) => { ev.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
        verifier(await db.from('bibliotheque_images').update({ nom: val(f, 'nom'), type: val(f, 'type'), tags: (val(f, 'tags') || '').split(',').map(s => s.trim()).filter(Boolean) }).eq('id', i.id));
        fermerModale(); toast('Image mise à jour.'); router();
      }); };
      $('#im-suppr', m).onclick = (ev) => action(ev.target, async () => {
        if (!await confirmer('Supprimer cette image ? Elle sera retirée des comptes, catégories, provenances et opérations qui l\'utilisent.')) return;
        verifier(await db.from('bibliotheque_images').delete().eq('id', i.id));
        await sb.storage.from(C.bucketImages).remove([i.storage_path]);
        fermerModale(); toast('Image supprimée.'); router();
      });
    });
  };
};

/* ================================================================= DOCUMENTS */
VUES.documents = async (el) => {
  const docs = verifier(await db.from('documents').select('*, operations(libelle, date_operation, montant, type)').order('created_at', { ascending: false }).limit(500));
  el.innerHTML = `<div class="tete-vue"><h1>Documents</h1><div class="actions"><button class="btn btn-primaire" id="do-ajout">＋ Téléverser</button></div></div>
    <div class="carte"><div class="tableau-wrap"><table><thead><tr><th>Document</th><th>Type</th><th class="masquer-mobile">Opération liée</th><th class="masquer-mobile">Structure</th><th>Date</th><th></th></tr></thead><tbody>
    ${docs.map(d => `<tr><td><a href="#" data-ouvrir="${esc(d.storage_path)}">📎 ${esc(d.nom_fichier)}</a><div class="aide">${d.taille_octets ? Math.round(d.taille_octets / 1024) + ' Ko' : ''}</div></td>
      <td><span class="pastille">${TYPES_DOC[d.type] || d.type}</span>${d.espace && espaceParCode(d.espace) ? ` <span class="aide">${espaceParCode(d.espace).icone} ${esc(espaceParCode(d.espace).nom)}</span>` : ''}</td>
      <td class="masquer-mobile">${d.operations ? `${esc(d.operations.libelle)} <span class="aide">${fmtDate(d.operations.date_operation)} · ${fmt(d.operations.montant)}</span>` : '<span class="aide">—</span>'}</td>
      <td class="masquer-mobile">${esc(structureParCode(d.structure_code)?.nom || d.structure_code)}</td>
      <td>${fmtDate(d.date_document || d.created_at.slice(0, 10))}</td>
      <td><button class="btn btn-danger btn-petit" data-suppr="${d.id}">Supprimer</button></td></tr>`).join('') || '<tr><td colspan="6" class="vide">Aucun document.</td></tr>'}
    </tbody></table></div></div>`;
  el.onclick = (e) => {
    const o = e.target.closest('[data-ouvrir]'); if (o) { e.preventDefault(); ouvrirDocument(o.dataset.ouvrir); }
    const s = e.target.closest('[data-suppr]');
    if (s) action(s, async () => { if (!await confirmer('Supprimer ce document ?')) return; await supprimerDocument(docs.find(d => d.id === s.dataset.suppr)); toast('Document supprimé.'); router(); });
  };
  $('#do-ajout').onclick = () => ouvrirModale('Téléverser des documents', `<form id="f-do">
    <div class="champ"><label>Fichiers *</label><input type="file" name="fichiers" multiple required accept="application/pdf,image/*,.docx,.xlsx,.csv"></div>
    <div class="ligne"><div class="champ"><label>Type</label><select name="type">${opts(TYPES_DOC, 'facture')}</select></div>
      <div class="champ"><label>Date du document</label><input type="date" name="date_document" value="${auj()}"></div></div>
    <div class="ligne"><div class="champ"><label>Structure</label><select name="structure_code">${R.structures.map(s => `<option value="${s.code}" ${s.code === 'bformatik' ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></div>
      <div class="champ"><label>Provenance</label><select name="tiers_id">${optsListe(R.tiers, null, '—')}</select></div></div>
    <div class="ligne">${R.espaces.length ? `<div class="champ"><label>Espace de vie</label><select name="espace">${optsListe(R.espaces, null, '—', e => e.icone + ' ' + e.nom)}</select></div>` : ''}
      <div class="champ"><label>Montant (€)</label><input name="montant" inputmode="decimal"></div></div>
    <div class="modale-pied"><button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Envoyer</button></div></form>`, (m) => {
    const f = $('#f-do', m);
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      await televerserDocuments([...f.fichiers.files], { type: val(f, 'type'), date_document: val(f, 'date_document'), structure_code: val(f, 'structure_code'), tiers_id: val(f, 'tiers_id'), montant: num(f, 'montant'), ...(f.espace && val(f, 'espace') ? { espace: val(f, 'espace') } : {}) });
      fermerModale(); toast('Documents envoyés.'); router();
    }); };
  });
};

/* ================================================================= FACTURES & DEVIS (par structure) */
const filtrePiece = { structure: '', type: '' };
VUES.pieces = async (el) => {
  let q = pf.from('pieces').select('*').order('date_piece', { ascending: false }).order('created_at', { ascending: false }).limit(500);
  if (filtrePiece.structure) q = q.eq('structure_code', filtrePiece.structure);
  if (filtrePiece.type) q = q.eq('type_piece', filtrePiece.type);
  const pieces = verifier(await q, 'Factures & devis');
  el.innerHTML = `<div class="tete-vue"><h1>Factures &amp; devis</h1><div class="actions">
      <button class="btn btn-bleu" id="pi-devis">＋ Devis</button><button class="btn btn-primaire" id="pi-facture">＋ Facture</button></div></div>
    <div class="carte"><p class="aide" style="margin-top:0">Chaque pièce dépend de la structure qui l'émet (ex. B-Scol@r pour les cours) et reçoit sa propre numérotation : BSCO-FAC-2026-0001.</p>
    <form class="filtres" id="pi-filtres"><div><label>Structure</label><select name="structure">${optsListe(R.structures, filtrePiece.structure, 'Toutes')}</select></div>
      <div><label>Type</label><select name="type"><option value="">Tous</option>${opts({ facture: 'Factures', devis: 'Devis', avoir: 'Avoirs' }, filtrePiece.type)}</select></div></form>
    <div class="tableau-wrap"><table><thead><tr><th>N°</th><th>Date</th><th>Client</th><th class="masquer-mobile">Structure</th><th>Statut</th><th class="montant">TTC</th></tr></thead><tbody>
    ${pieces.map(p => { const s = structureParCode(p.structure_code); return `<tr data-id="${p.id}" style="cursor:pointer"><td><b>${esc(p.numero || 'Brouillon')}</b><div class="aide">${{ facture: 'Facture', devis: 'Devis', avoir: 'Avoir' }[p.type_piece]}</div></td>
      <td>${fmtDate(p.date_piece)}</td><td>${esc(p.client_nom)}<div class="aide">${esc(p.objet || '')}</div></td>
      <td class="masquer-mobile"><span class="point" style="background:${esc(s?.couleur || '#ccc')}"></span> ${esc(s?.nom || p.structure_code)}</td>
      <td><span class="pastille ${p.statut === 'payee' ? 'rec' : ['refuse', 'annulee'].includes(p.statut) ? 'dep' : p.statut === 'brouillon' ? '' : 'orange'}">${STATUTS_PIECE[p.statut]}</span></td>
      <td class="montant">${fmt(p.montant_ttc)}</td></tr>`; }).join('') || '<tr><td colspan="6" class="vide">Aucune pièce.</td></tr>'}
    </tbody></table></div></div>`;
  $('#pi-filtres').onchange = (e) => { filtrePiece[e.target.name] = e.target.value; router(); };
  $('#pi-devis').onclick = () => formPiece({ type_piece: 'devis' });
  $('#pi-facture').onclick = () => formPiece({ type_piece: 'facture' });
  $('tbody', el).onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) formPiece(pieces.find(p => p.id === tr.dataset.id)); };
};
function totauxLignes(lignes) {
  let ht = 0, tva = 0;
  for (const l of lignes) { const h = (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0); ht += h; tva += h * (Number(l.tva) || 0) / 100; }
  ht = Math.round(ht * 100) / 100; tva = Math.round(tva * 100) / 100;
  return { ht, tva, ttc: Math.round((ht + tva) * 100) / 100 };
}
function formPiece(p = {}) {
  const neuf = !p.id;
  let lignes = (p.lignes && p.lignes.length) ? JSON.parse(JSON.stringify(p.lignes)) : [{ designation: '', quantite: 1, prix_unitaire: 0, tva: 0 }];
  const nomType = { facture: 'facture', devis: 'devis', avoir: 'avoir' }[p.type_piece];
  ouvrirModale(neuf ? `Nouveau ${nomType === 'facture' ? 'facture' : nomType}`.replace('Nouveau facture', 'Nouvelle facture') : `${p.numero || 'Brouillon'}`, `<form id="f-pi">
    <div class="ligne3"><div class="champ"><label>Structure émettrice *</label><select name="structure_code" required>${R.structures.map(s => `<option value="${s.code}" ${s.code === (p.structure_code || 'bformatik') ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></div>
      <div class="champ"><label>Type</label><select name="type_piece">${opts({ facture: 'Facture', devis: 'Devis', avoir: 'Avoir' }, p.type_piece)}</select></div>
      <div class="champ"><label>Statut</label><select name="statut">${opts(STATUTS_PIECE, p.statut || 'brouillon')}</select></div></div>
    <div class="ligne"><div class="champ"><label>Date</label><input type="date" name="date_piece" value="${p.date_piece || auj()}"></div>
      <div class="champ"><label>Échéance / validité</label><input type="date" name="date_echeance" value="${p.date_echeance || ''}"></div></div>
    <div class="ligne"><div class="champ"><label>Client *</label><input name="client_nom" required value="${esc(p.client_nom || '')}" list="liste-clients"></div>
      <div class="champ"><label>E-mail client</label><input name="client_email" type="email" value="${esc(p.client_email || '')}"></div></div>
    <datalist id="liste-clients">${R.tiers.filter(t => ['client', 'particulier', 'organisme'].includes(t.type)).map(t => `<option value="${esc(t.nom)}">`).join('')}</datalist>
    <div class="champ"><label>Adresse client</label><input name="client_adresse" value="${esc(p.client_adresse || '')}"></div>
    <div class="champ"><label>Objet</label><input name="objet" value="${esc(p.objet || '')}" placeholder="ex : Cours de soutien CM2 – octobre"></div>
    <div class="champ"><label>Lignes</label><div class="tableau-wrap"><table class="lignes-piece"><thead><tr><th>Désignation</th><th style="width:80px">Qté</th><th style="width:110px">PU HT</th><th style="width:80px">TVA %</th><th class="montant" style="width:100px">Total HT</th><th></th></tr></thead><tbody id="pi-lignes"></tbody></table></div>
      <button type="button" class="btn btn-fantome btn-petit" id="pi-ajout-ligne">＋ Ligne</button>
      <div id="pi-totaux" style="text-align:right;font-weight:800;margin-top:8px"></div></div>
    <div class="champ"><label>Notes / conditions</label><textarea name="notes" rows="2">${esc(p.notes || '')}</textarea></div>
    <div class="modale-pied">
      ${neuf ? '' : `<button type="button" class="btn btn-danger gauche" id="pi-suppr">Supprimer</button>
        <button type="button" class="btn btn-fantome" id="pi-imprimer">📄 PDF</button>
        ${p.type_piece === 'devis' && p.statut !== 'refuse' ? '<button type="button" class="btn btn-fantome" id="pi-convertir">→ Facturer</button>' : ''}
        ${p.type_piece === 'facture' && p.statut !== 'payee' ? '<button type="button" class="btn btn-bleu" id="pi-paye">💶 Encaisser</button>' : ''}`}
      <button type="button" class="btn btn-fantome" data-fermer>Fermer</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    const f = $('#f-pi', m);
    const rendreLignes = () => {
      $('#pi-lignes', m).innerHTML = lignes.map((l, i) => `<tr data-i="${i}"><td><input data-k="designation" value="${esc(l.designation)}"></td>
        <td><input data-k="quantite" inputmode="decimal" value="${l.quantite}"></td><td><input data-k="prix_unitaire" inputmode="decimal" value="${l.prix_unitaire}"></td>
        <td><input data-k="tva" inputmode="decimal" value="${l.tva}"></td><td class="montant">${fmt((Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0))}</td>
        <td><button type="button" class="btn-x" data-suppr-ligne="${i}" title="Retirer">×</button></td></tr>`).join('');
      majTotaux();
    };
    const majTotaux = () => { const t = totauxLignes(lignes); $('#pi-totaux', m).innerHTML = `HT ${fmt(t.ht)} · TVA ${fmt(t.tva)} · <span style="color:var(--orange)">TTC ${fmt(t.ttc)}</span>`; };
    rendreLignes();
    $('#pi-lignes', m).addEventListener('input', (e) => { const tr = e.target.closest('tr'); const k = e.target.dataset.k;
      lignes[tr.dataset.i][k] = k === 'designation' ? e.target.value : Number(String(e.target.value).replace(',', '.')) || 0;
      tr.querySelector('td.montant').textContent = fmt((Number(lignes[tr.dataset.i].quantite) || 0) * (Number(lignes[tr.dataset.i].prix_unitaire) || 0)); majTotaux(); });
    $('#pi-lignes', m).addEventListener('click', (e) => { const b = e.target.closest('[data-suppr-ligne]'); if (b) { lignes.splice(Number(b.dataset.supprLigne), 1); rendreLignes(); } });
    $('#pi-ajout-ligne', m).onclick = () => { lignes.push({ designation: '', quantite: 1, prix_unitaire: 0, tva: 0 }); rendreLignes(); };
    const donnees = () => { const t = totauxLignes(lignes);
      return { structure_code: val(f, 'structure_code'), type_piece: val(f, 'type_piece'), statut: val(f, 'statut'), date_piece: val(f, 'date_piece'), date_echeance: val(f, 'date_echeance'),
        client_nom: val(f, 'client_nom'), client_email: val(f, 'client_email'), client_adresse: val(f, 'client_adresse'), objet: val(f, 'objet'), notes: val(f, 'notes'),
        lignes: lignes.filter(l => l.designation || l.prix_unitaire), montant_ht: t.ht, montant_tva: t.tva, montant_ttc: t.ttc }; };
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const r = neuf ? await pf.from('pieces').insert(donnees()).select().single() : await pf.from('pieces').update(donnees()).eq('id', p.id).select().single();
      const piece = verifier(r, 'Pièce');
      fermerModale(); toast(piece.numero ? `Enregistré : ${piece.numero}` : 'Brouillon enregistré (le numéro est attribué à l\'envoi).'); router();
    }); };
    if (!neuf) {
      $('#pi-suppr', m).onclick = (e) => action(e.target, async () => {
        if (p.numero && !await confirmer(`La pièce ${p.numero} est numérotée. La supprimer créera un trou dans la numérotation ; préférez le statut « Annulée ». Supprimer quand même ?`)) return;
        if (!p.numero && !await confirmer('Supprimer ce brouillon ?')) return;
        verifier(await pf.from('pieces').delete().eq('id', p.id)); fermerModale(); toast('Pièce supprimée.'); router();
      });
      $('#pi-imprimer', m).onclick = (e) => action(e.currentTarget, () => window.BFC_EXPORT.pdfPiece({ ...p, ...donnees() }, structureParCode(val(f, 'structure_code'))));
      $('#pi-convertir', m)?.addEventListener('click', (e) => action(e.target, async () => {
        verifier(await pf.from('pieces').update({ statut: 'accepte' }).eq('id', p.id));
        const { id, numero, created_at, updated_at, ...base } = { ...p, ...donnees() };
        const fac = verifier(await pf.from('pieces').insert({ ...base, type_piece: 'facture', statut: 'envoye', devis_origine_id: p.id, date_piece: auj() }).select().single());
        fermerModale(); toast(`Facture ${fac.numero} créée.`); router();
      }));
      $('#pi-paye', m)?.addEventListener('click', () => {
        const t = totauxLignes(lignes);
        const cat = R.categories.find(c => c.type === 'recette' && /prestation|formation/i.test(c.nom))?.id;
        fermerModale();
        formOperation({ type: 'recette', montant: t.ttc, libelle: `${p.numero} – ${p.client_nom}`, reference: p.numero, structure_code: p.structure_code,
          piece_id: p.id, categorie_id: cat, moyen_paiement: 'virement' }, async () => {
          await pf.from('pieces').update({ statut: 'payee' }).eq('id', p.id); toast(`${p.numero} marquée payée.`); router();
        });
      });
    }
  });
}
function imprimerPiece(p) {
  const s = structureParCode(p.structure_code);
  const titre = { facture: 'FACTURE', devis: 'DEVIS', avoir: 'AVOIR' }[p.type_piece];
  const div = document.createElement('div');
  div.className = 'impression';
  div.innerHTML = `<div class="impr-entete"><div><img src="assets/logo.png" alt="B-Form@tik"><div style="margin-top:6px;font-weight:800;color:#11316e">${esc(s?.nom || '')}</div>
      <div style="color:#64748b">${esc(s?.description || '')}</div></div>
    <div style="text-align:right"><div class="impr-titre">${titre}</div><div><b>${esc(p.numero || 'BROUILLON')}</b></div><div>Date : ${fmtDate(p.date_piece)}</div>${p.date_echeance ? `<div>${p.type_piece === 'devis' ? 'Valable jusqu\'au' : 'Échéance'} : ${fmtDate(p.date_echeance)}</div>` : ''}</div></div>
    <div style="margin:18px 0 18px auto;width:45%;border:1px solid #dbe5f3;border-radius:10px;padding:10px"><b>${esc(p.client_nom)}</b><br>${esc(p.client_adresse || '')}<br>${esc(p.client_email || '')}</div>
    ${p.objet ? `<p><b>Objet :</b> ${esc(p.objet)}</p>` : ''}
    <table style="width:100%;border-collapse:collapse"><thead><tr style="background:#11316e;color:#fff"><th style="color:#fff;padding:6px">Désignation</th><th style="color:#fff">Qté</th><th style="color:#fff">PU HT</th><th style="color:#fff">TVA</th><th style="color:#fff;text-align:right;padding-right:6px">Total HT</th></tr></thead><tbody>
    ${(p.lignes || []).map(l => `<tr><td style="padding:6px">${esc(l.designation)}</td><td>${l.quantite}</td><td>${fmt(l.prix_unitaire)}</td><td>${l.tva || 0} %</td><td style="text-align:right;padding-right:6px">${fmt(l.quantite * l.prix_unitaire)}</td></tr>`).join('')}
    </tbody></table>
    <div style="margin-left:auto;width:40%;margin-top:12px"><div style="display:flex;justify-content:space-between"><span>Total HT</span><b>${fmt(p.montant_ht)}</b></div>
      <div style="display:flex;justify-content:space-between"><span>TVA</span><b>${fmt(p.montant_tva)}</b></div>
      <div style="display:flex;justify-content:space-between;font-size:15px;color:#f7941d;border-top:2px solid #f7941d;margin-top:4px;padding-top:4px"><span>Total TTC</span><b>${fmt(p.montant_ttc)}</b></div></div>
    ${p.notes ? `<p style="margin-top:20px;white-space:pre-wrap">${esc(p.notes)}</p>` : ''}
    <div class="impr-pied">B-Form@tik · Jhonny BOURGEOIS · Bformatik@gmail.com · +590 690 70 55 84</div>`;
  document.body.append(div);
  setTimeout(() => { window.print(); div.remove(); }, 300);
}

/* ================================================================= BUDGETS */
VUES.budgets = async (el) => {
  const a = filtreTB.annee, mo = filtreTB.mois;
  const mois = `${a}-${String(mo + 1).padStart(2, '0')}-01`;
  const fin = dateLocale(new Date(a, mo + 1, 0));
  const [budgets, ops] = await Promise.all([
    db.from('budgets').select('*').eq('mois', mois),
    db.from('operations').select('categorie_id, montant').eq('type', 'depense').neq('statut', 'prevue').gte('date_operation', mois).lte('date_operation', fin)
  ]);
  const b = verifier(budgets), reel = {};
  verifier(ops).forEach(o => { reel[o.categorie_id] = (reel[o.categorie_id] || 0) + Number(o.montant); });
  const cats = R.categories.filter(c => c.type === 'depense' && c.actif);
  el.innerHTML = `<div class="tete-vue"><h1>Budgets</h1><div class="actions">
      <select id="bu-mois" style="width:auto">${MOIS_LONG.map((m, i) => `<option value="${i}" ${i === mo ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <input id="bu-annee" type="number" value="${a}" style="width:100px"></div></div>
    <div class="carte"><p class="aide" style="margin-top:0">Fixez un budget mensuel par catégorie de dépense et comparez avec le réel.</p>
    <form id="f-bu"><div class="tableau-wrap"><table><thead><tr><th>Catégorie</th><th class="montant">Budget</th><th class="montant">Réel</th><th style="width:30%">Consommation</th></tr></thead><tbody>
    ${cats.map(c => { const bu = b.find(x => x.categorie_id === c.id); const r = reel[c.id] || 0; const pct = bu?.montant ? Math.round(r / bu.montant * 100) : null;
      return `<tr><td><span class="point" style="background:${esc(c.couleur)}"></span> ${esc(c.nom)}</td>
        <td class="montant"><input name="${c.id}" inputmode="decimal" value="${bu?.montant ?? ''}" style="width:110px;text-align:right" placeholder="—"></td>
        <td class="montant">${fmt(r)}</td>
        <td>${pct === null ? '<span class="aide">—</span>' : `<div style="background:var(--bleu-clair);border-radius:99px;height:10px;overflow:hidden"><div style="width:${Math.min(pct, 100)}%;height:100%;background:${pct > 100 ? 'var(--rouge)' : pct > 80 ? 'var(--orange)' : 'var(--vert)'}"></div></div><span class="aide">${pct} %</span>`}</td></tr>`; }).join('')}
    </tbody></table></div><div class="modale-pied"><button class="btn btn-primaire">Enregistrer les budgets</button></div></form></div>`;
  $('#bu-mois').onchange = (e) => { filtreTB.mois = Number(e.target.value); router(); };
  $('#bu-annee').onchange = (e) => { filtreTB.annee = Number(e.target.value); router(); };
  $('#f-bu').onsubmit = (e) => { e.preventDefault(); const f = e.target; action(f.querySelector('.btn-primaire'), async () => {
    const aGarder = [], aSuppr = [];
    cats.forEach(c => { const v = num(f, c.id); if (v === null || isNaN(v)) aSuppr.push(c.id); else aGarder.push({ categorie_id: c.id, mois, montant: v }); });
    if (aGarder.length) verifier(await db.from('budgets').upsert(aGarder, { onConflict: 'categorie_id,mois' }), 'Budgets');
    if (aSuppr.length) verifier(await db.from('budgets').delete().eq('mois', mois).in('categorie_id', aSuppr));
    toast('Budgets enregistrés.'); router();
  }); };
};

/* ---------------------------------------------------------------- démarrage */
/* Modules complémentaires (banque & rapprochement…) */
const API = { sb, db, pf, R, C, $, $$, esc, fmt, fmtDate, auj, opts, optsListe, toast, verifier, action, val, num, uuid, nettoyerNom,
  formCompte, formCategorie, formTiers,
  televerserDocuments, ouvrirDocument, supprimerDocument, espaceParCode, TYPES_DOC, MOIS_LONG, detruireGraphiques, ajouterGraphique: (g) => graphiques.push(g),
  ouvrirModale, fermerModale, confirmer, router, VUES, formOperation, chargerReferentiels, chargerSoldes, vignette,
  compteParId, tiersParId, categorieParId, structureParCode, MOYENS, TYPES_COMPTE, NATURES };
(window.BFC_MODULES || []).forEach(m => m(API));

if (/type=recovery/.test(location.hash)) enRecuperation = true;
demarrerApp();
})();
