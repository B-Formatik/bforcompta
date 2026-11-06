/* B-S@fe — Mon foyer (qui vit à la maison : adultes, enfants, régimes, allergies), Cuisine (menus équilibrés à partir
   des courses, quantités adaptées au foyer, liste des manquants) et Sport (activités, séances, objectifs, conseils de repos) */
(window.BFC_MODULES = window.BFC_MODULES || []).push((A) => {
'use strict';
const { db, R, $, $$, esc, fmt, fmtDate, auj, opts, optsListe, toast, verifier, action, val, num, ouvrirModale, fermerModale, confirmer, router, VUES } = A;

const dateDe = (s) => new Date(String(s).slice(0, 10) + 'T12:00:00');
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusJours = (s, n) => { const d = dateDe(s); d.setDate(d.getDate() + n); return iso(d); };
const lundi = (s = auj()) => { const d = dateDe(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const jourSem = (s) => ((dateDe(s).getDay() + 6) % 7) + 1;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const age = (dn) => { if (!dn) return null; const d = dateDe(dn), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };
const doux = (res) => { if (res.error) { console.warn(res.error); return null; } return res.data; };
const REGIMES = { vegetarien: '🥦 Végétarien', sans_porc: '🚫🐖 Sans porc', halal: '☪️ Halal', sans_gluten: '🌾 Sans gluten', sans_lactose: '🥛 Sans lactose' };
const PROTEINES = { volaille: '🍗 Volaille', viande_rouge: '🥩 Viande rouge', porc: '🐖 Porc', poisson: '🐟 Poisson / fruits de mer', oeufs: '🥚 Œufs', vegetal: '🫘 Végétal' };
const REPAS = { dejeuner: 'Déjeuner', diner: 'Dîner' };

/* ================================================================ MON FOYER */
async function chargerFoyer() {
  const [p, m] = await Promise.all([db.from('foyer_parametres').select('*'), db.from('membres_foyer').select('*').eq('actif', true).order('role').order('date_naissance')]);
  const params = doux(p); const membres = doux(m) || [];
  return { manque: params === null, params: (params || []).find(x => x.proprietaire === A.utilisateurId) || (params || [])[0] || null, membres };
}
/* part d'un adulte : enfant < 3 ans 0,4 · 3-6 ans 0,5 · 7-11 ans 0,75 · 12 ans et + 1 */
const part = (m) => { if (m.role === 'adulte') return 1; const a = age(m.date_naissance); return a == null ? 0.75 : a < 3 ? 0.4 : a < 7 ? 0.5 : a < 12 ? 0.75 : 1; };
const portionsFoyer = (membres) => Math.max(1, Math.round(membres.reduce((s, m) => s + part(m), 0) * 4) / 4);
const resumeFoyer = (membres) => { const a = membres.filter(m => m.role === 'adulte').length, e = membres.length - a; return `${a} adulte${a > 1 ? 's' : ''}${e ? ` · ${e} enfant${e > 1 ? 's' : ''}` : ''}`; };

function formMembre(m = {}, apres) {
  const neuf = !m.id;
  ouvrirModale(neuf ? 'Ajouter une personne' : `Modifier · ${m.prenom}`, `<form id="f-mb">
    <div class="ligne"><div class="champ"><label>Prénom *</label><input name="prenom" required value="${esc(m.prenom || '')}"></div>
      <div class="champ"><label>Rôle</label><div class="bascule" id="mb-role"><button type="button" data-r="adulte" class="${(m.role || 'adulte') === 'adulte' ? 'on' : ''}">Adulte</button><button type="button" data-r="enfant" class="${m.role === 'enfant' ? 'on' : ''}">Enfant</button></div><input type="hidden" name="role" value="${m.role || 'adulte'}"></div></div>
    <div class="ligne"><div class="champ"><label>Date de naissance</label><input type="date" name="date_naissance" value="${m.date_naissance || ''}"><div class="aide">Sert à adapter les portions et les objectifs de sport.</div></div>
      <div class="champ"><label>Objectif sport (min / semaine)</label><input name="objectif_sport_min" inputmode="numeric" value="${m.objectif_sport_min ?? ''}" placeholder="150 adulte · 420 enfant"></div></div>
    <div class="champ"><label>Régime alimentaire</label><div class="cases">${Object.entries(REGIMES).map(([k, l]) => `<label class="case"><input type="checkbox" name="regime" value="${k}" ${(m.regimes || []).includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
    <div class="champ"><label>Allergies / aliments à éviter</label><input name="allergies" value="${esc((m.allergies || []).join(', '))}" placeholder="ex : arachide, crevette, lait"></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="mb-suppr">Retirer</button>'}<button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (md) => {
    const f = $('#f-mb', md);
    $('#mb-role', md).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; f.role.value = b.dataset.r; $$('#mb-role button', md).forEach(x => x.classList.toggle('on', x === b)); };
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { prenom: val(f, 'prenom'), role: f.role.value, date_naissance: val(f, 'date_naissance'), objectif_sport_min: num(f, 'objectif_sport_min'),
        regimes: $$('input[name=regime]:checked', f).map(x => x.value), allergies: (val(f, 'allergies') || '').split(/[,;]/).map(s => s.trim()).filter(Boolean) };
      verifier(neuf ? await db.from('membres_foyer').insert(rec) : await db.from('membres_foyer').update(rec).eq('id', m.id), 'Foyer');
      fermerModale(); toast('Enregistré.'); apres ? apres() : router();
    }); };
    if (!neuf) $('#mb-suppr', md).onclick = (e) => action(e.target, async () => { if (!await confirmer(`Retirer ${m.prenom} du foyer ?`)) return; verifier(await db.from('membres_foyer').update({ actif: false }).eq('id', m.id)); fermerModale(); router(); });
  });
}

VUES.foyer = async (el) => {
  const F = await chargerFoyer();
  if (F.manque) { el.innerHTML = '<div class="carte"><h3>🛠️ Mise à jour de la base nécessaire</h3><p>Le module « Mon foyer » a besoin du script <b>08_foyer_cuisine_sport.sql</b>.</p></div>'; return; }
  const p = F.params || {};
  el.innerHTML = `<div class="tete-vue"><h1>👨‍👩‍👧 Mon foyer</h1><div class="actions"><button class="btn btn-fantome" id="fo-import">⬇️ Importer mes enfants</button><button class="btn btn-primaire" id="fo-ajout">＋ Personne</button></div></div>
    <div class="aj-grille"><div class="aj-col"><div class="carte"><h3>Qui vit à la maison <span class="aide">${resumeFoyer(F.membres)} · ${String(portionsFoyer(F.membres)).replace('.', ',')} portions par repas</span></h3>
      ${F.membres.map(m => `<div class="aj-item cliquable" data-id="${m.id}"><span class="pastille">${m.role === 'adulte' ? '🧑 Adulte' : '🧒 Enfant'}</span><b>${esc(m.prenom)}</b>
        <span class="aide">${age(m.date_naissance) != null ? age(m.date_naissance) + ' ans · ' : ''}part ${String(part(m)).replace('.', ',')}</span>
        ${(m.regimes || []).map(r => `<span class="pastille orange">${REGIMES[r] || r}</span>`).join('')}${(m.allergies || []).length ? `<span class="pastille dep">⚠️ ${esc(m.allergies.join(', '))}</span>` : ''}</div>`).join('') || '<div class="vide">Personne pour l\'instant.</div>'}
      <p class="aide" style="margin-bottom:0">Les portions des recettes s'adaptent automatiquement : adulte = 1, enfant de 7 à 11 ans = 0,75, de 3 à 6 ans = 0,5…</p></div></div>
    <div class="aj-col"><div class="carte"><h3>Réglages</h3><form id="f-fp">
      <div class="champ"><label>Nom du foyer</label><input name="nom" value="${esc(p.nom || 'Mon foyer')}"></div>
      <div class="champ"><label>Repas à planifier</label><div class="cases">${Object.entries(REPAS).map(([k, l]) => `<label class="case"><input type="checkbox" name="repas" value="${k}" ${(p.repas || ['diner']).includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
      <div class="champ"><label>Budget courses par semaine (€)</label><input name="budget" inputmode="decimal" value="${p.budget_courses_semaine ?? ''}"></div>
      <button class="btn btn-primaire">Enregistrer</button></form></div></div></div>`;
  $('#fo-ajout').onclick = () => formMembre({});
  el.onclick = (e) => { const r = e.target.closest('.aj-item[data-id]'); if (r) formMembre(F.membres.find(m => m.id === r.dataset.id)); };
  $('#fo-import').onclick = (e) => action(e.target, async () => {
    const enf = doux(await db.from('enfants').select('*').eq('actif', true)) || [];
    const nv = enf.filter(x => !F.membres.some(m => m.enfant_id === x.id || norm(m.prenom) === norm(x.prenom)));
    if (!nv.length) return toast('Tous vos enfants sont déjà dans le foyer.');
    verifier(await db.from('membres_foyer').insert(nv.map(x => ({ prenom: x.prenom, role: 'enfant', date_naissance: x.date_naissance, enfant_id: x.id, couleur: x.couleur }))));
    toast(`${nv.length} enfant${nv.length > 1 ? 's' : ''} ajouté${nv.length > 1 ? 's' : ''}.`); router();
  });
  $('#f-fp').onsubmit = (e) => { e.preventDefault(); const f = e.target; action(f.querySelector('button'), async () => {
    verifier(await db.from('foyer_parametres').upsert({ proprietaire: A.utilisateurId, nom: val(f, 'nom'), repas: $$('input[name=repas]:checked', f).map(x => x.value), budget_courses_semaine: num(f, 'budget'), onboarding_fait: true, updated_at: new Date().toISOString() }));
    toast('Réglages enregistrés.');
  }); };
};

/* Accueil au premier lancement : composition du foyer */
async function verifierAccueil() {
  try { if (sessionStorage.getItem('bsafe-accueil-plus-tard')) return; } catch {}
  if (!$('#modale').hidden) return;
  const F = await chargerFoyer(); if (F.manque || F.params?.onboarding_fait || F.membres.length) return;
  const enf = doux(await db.from('enfants').select('prenom, date_naissance, id').eq('actif', true)) || [];
  let lignes = [{ prenom: '', role: 'adulte' }, ...enf.map(x => ({ prenom: x.prenom, role: 'enfant', date_naissance: x.date_naissance, enfant_id: x.id }))];
  const rendre = () => lignes.map((l, i) => `<div class="ligne-membre"><input data-i="${i}" data-k="prenom" value="${esc(l.prenom)}" placeholder="Prénom">
      <select data-i="${i}" data-k="role">${opts({ adulte: 'Adulte', enfant: 'Enfant' }, l.role)}</select>
      <input type="date" data-i="${i}" data-k="date_naissance" value="${l.date_naissance || ''}" title="Date de naissance"><button type="button" class="btn-x" data-retirer="${i}">×</button></div>`).join('');
  ouvrirModale('👋 Bienvenue dans B-S@fe', `<p style="margin-top:0">Pour adapter les <b>repas</b> (quantités), le <b>sport</b> et les conseils, dites-moi qui vit dans votre foyer. Vous pourrez tout modifier dans « Mon foyer ».</p>
    <div id="ac-lignes">${rendre()}</div><button type="button" class="btn btn-petit btn-fantome" id="ac-plus">＋ Une personne</button>
    <div class="champ" style="margin-top:12px"><label>Repas à planifier</label><div class="cases"><label class="case"><input type="checkbox" id="ac-dej"> Déjeuner</label><label class="case"><input type="checkbox" id="ac-din" checked> Dîner</label></div></div>
    <div class="modale-pied"><button type="button" class="btn btn-fantome" id="ac-tard">Plus tard</button><button type="button" class="btn btn-primaire" id="ac-ok">C'est parti</button></div>`, (md) => {
    const zone = $('#ac-lignes', md);
    zone.oninput = zone.onchange = (e) => { const i = e.target.dataset.i; if (i != null) lignes[i][e.target.dataset.k] = e.target.value; };
    zone.onclick = (e) => { const b = e.target.closest('[data-retirer]'); if (b) { lignes.splice(+b.dataset.retirer, 1); zone.innerHTML = rendre(); } };
    $('#ac-plus', md).onclick = () => { lignes.push({ prenom: '', role: 'enfant' }); zone.innerHTML = rendre(); };
    $('#ac-tard', md).onclick = () => { try { sessionStorage.setItem('bsafe-accueil-plus-tard', '1'); } catch {} fermerModale(); };
    $('#ac-ok', md).onclick = (e) => action(e.target, async () => {
      const ok = lignes.filter(l => l.prenom.trim()); if (!ok.length) throw new Error('Indiquez au moins un prénom.');
      verifier(await db.from('membres_foyer').insert(ok.map(l => ({ prenom: l.prenom.trim(), role: l.role, date_naissance: l.date_naissance || null, enfant_id: l.enfant_id || null }))), 'Foyer');
      verifier(await db.from('foyer_parametres').upsert({ proprietaire: A.utilisateurId, repas: [$('#ac-dej', md).checked && 'dejeuner', $('#ac-din', md).checked && 'diner'].filter(Boolean), onboarding_fait: true }), 'Réglages');
      fermerModale(); toast(`Foyer enregistré : ${resumeFoyer(ok)} 🎉`);
    });
  });
}

/* ================================================================ CUISINE */
const cu = { onglet: 'menu', debut: null, filtre: '' };
async function chargerCuisine() {
  const depuis = plusJours(auj(), -21);
  const [F, rec, listes] = await Promise.all([chargerFoyer(),
    db.from('recettes').select('*').eq('actif', true).order('nom').then(doux),
    db.from('listes_courses').select('id, date_prevue, statut, lignes_courses(libelle, quantite, unite, achete)').in('statut', ['en_cours', 'terminee']).gte('date_prevue', depuis).then(doux)]);
  const achats = [];
  (listes || []).forEach(l => (l.lignes_courses || []).forEach(x => { if (x.achete || l.statut === 'terminee') achats.push({ ...x, date: l.date_prevue }); }));
  const placard = achats.map(a => radical(a.libelle));
  const membres = F.membres.length ? F.membres : [{ prenom: 'Moi', role: 'adulte' }];
  return { F, membres, recettes: rec || [], achats, placard, portions: portionsFoyer(membres) };
}
/* recettes compatibles avec les régimes et allergies du foyer */
function compatible(r, membres) {
  const reg = new Set(membres.flatMap(m => m.regimes || []));
  if ((reg.has('sans_porc') || reg.has('halal')) && (r.proteine === 'porc' || r.ingredients.some(i => /jambon|lard|saucisse|porc/.test(norm(i.n))))) return false;
  if (membres.length && membres.every(m => (m.regimes || []).includes('vegetarien')) && !['oeufs', 'vegetal'].includes(r.proteine)) return false;
  if (reg.has('sans_gluten') && !r.tags.includes('sans_gluten')) return false;
  const allerg = membres.flatMap(m => m.allergies || []).map(norm).filter(Boolean);
  return !allerg.some(a => r.ingredients.some(i => norm(i.n).includes(a) || norm(i.k).includes(a)));
}
const radical = (s) => norm(s).split(' ').map(w => w.length > 3 ? w.replace(/(s|x)$/, '') : w).join(' ');
const dispo = (i, placard) => !!i.b || placard.some(p => p.includes(radical(i.k)));
const scoreRecette = (r, placard) => { const ing = r.ingredients.filter(i => !i.b); return ing.length ? ing.filter(i => dispo(i, placard)).length / ing.length : 0; };
function quantite(i, portions, base) {
  let q = i.q * portions / (base || 4);
  if (i.u === 'g') q = q >= 100 ? Math.round(q / 10) * 10 : Math.round(q);
  else if (i.u === 'cl') q = Math.round(q / 5) * 5 || 5;
  else q = Math.ceil(q * 2) / 2;
  return q;
}
const fmtQ = (q, u) => `${String(q).replace('.', ',')} ${q > 1 && ['pièce', 'gousse', 'brin', 'botte', 'tranche'].includes(u) ? u + 's' : u}`;

/* Menu équilibré de la semaine : ≥ 2 poissons, ≤ 2 viandes rouges, ≤ 1 porc, ≥ 2 repas végétariens (œufs / légumineuses),
   pas deux fois la même protéine d'affilée, priorité aux recettes faisables avec les courses récentes */
function genererMenu(C, debut, repasListe) {
  const pool = C.recettes.filter(r => r.type_repas === 'plat' && compatible(r, C.membres));
  const creneaux = []; for (let j = 0; j < 7; j++) repasListe.forEach(rp => creneaux.push({ jour: plusJours(debut, j), repas: rp }));
  const n = creneaux.length;
  const groupe = (r) => ['vegetal', 'oeufs'].includes(r.proteine) ? 'vegoeufs' : r.proteine;
  const dispos = new Set(pool.map(groupe));
  // répartition cible : 2/7 poisson, 2/7 végétarien (œufs, légumineuses), 2/7 volaille, 1/7 viande rouge (+ 1 porc si 2 repas/jour)
  const cible = { poisson: Math.floor(n * 2 / 7), vegoeufs: Math.floor(n * 2 / 7), volaille: Math.floor(n * 2 / 7), viande_rouge: Math.floor(n / 7) };
  for (const k of ['volaille', 'vegoeufs', 'poisson', 'viande_rouge']) if (Object.values(cible).reduce((a, b) => a + b, 0) < n) cible[k]++;
  if (n >= 14 && dispos.has('porc')) { cible.volaille--; cible.porc = 1; }
  for (const k of Object.keys(cible)) if (!dispos.has(k) && cible[k]) { const v = cible[k]; cible[k] = 0; const repli = ['vegoeufs', 'poisson', 'volaille'].find(x => dispos.has(x)); if (repli) cible[repli] += v; }
  const choisis = []; let prec = null;
  creneaux.forEach(c => {
    const ordre = Object.keys(cible).filter(k => cible[k] > 0).sort((a, b) => (b !== prec) - (a !== prec) || cible[b] - cible[a] || Math.random() - .5);
    const g = ordre[0];
    const semaineChargee = c.repas === 'dejeuner' && jourSem(c.jour) <= 5;
    const note = (r) => scoreRecette(r, C.placard) * 3 + (semaineChargee && r.temps_min <= 30 ? 1 : 0) + (r.tags.includes('enfants') && C.membres.some(m => m.role === 'enfant') ? 0.5 : 0) + Math.random() * 1.2;
    let cand = pool.filter(r => groupe(r) === g && !choisis.includes(r));
    if (!cand.length) cand = pool.filter(r => !choisis.includes(r));
    if (!cand.length) cand = pool.slice();
    if (!cand.length) return;
    const r = cand.sort((a, b) => note(b) - note(a))[0];
    if (g) cible[g]--; prec = groupe(r); choisis.push(r); c.recette = r;
  });
  return creneaux.filter(c => c.recette);
}
function manquants(C, recettesPortions) {
  const tot = {};
  recettesPortions.forEach(({ r, portions }) => r.ingredients.filter(i => !i.b && !dispo(i, C.placard)).forEach(i => {
    const k = norm(i.k) + '|' + i.u; (tot[k] ||= { n: i.n, u: i.u, k: i.k, q: 0, pour: new Set() }); tot[k].q += i.q * portions / (r.portions_base || 4); tot[k].pour.add(r.nom);
  }));
  return Object.values(tot).map(x => ({ ...x, q: quantite({ q: x.q, u: x.u }, 4, 4) }));
}
async function creerListeCourses(C, items, titre) {
  if (!items.length) return toast('Tout est déjà dans vos courses récentes. 👍');
  const produits = doux(await db.from('produits').select('id, nom, prix_habituel, rayon').eq('actif', true)) || [];
  const l = verifier(await db.from('listes_courses').insert({ titre, statut: 'brouillon', date_prevue: auj() }).select().single(), 'Liste');
  verifier(await db.from('lignes_courses').insert(items.map((x, i) => { const p = produits.find(pp => norm(pp.nom).includes(norm(x.k)));
    return { liste_id: l.id, libelle: p?.nom || x.n, produit_id: p?.id || null, quantite: x.u === 'pièce' ? x.q : 1, unite: x.u === 'pièce' ? 'pièce' : `${String(x.q).replace('.', ',')} ${x.u}`, prix_unitaire: p?.prix_habituel ?? null, ordre: i }; })), 'Lignes');
  toast(`Liste de courses créée (${items.length} article${items.length > 1 ? 's' : ''}).`);
  location.hash = '#/courses';
}

function ouvrirRecette(C, r, portions = C.portions) {
  const ings = r.ingredients.map(i => ({ ...i, qa: quantite(i, portions, r.portions_base), ok: dispo(i, C.placard) }));
  const manque = ings.filter(i => !i.ok);
  ouvrirModale(`${r.icone || '🍽️'} ${r.nom}`, `<div class="barre-outils" style="justify-content:space-between"><div><span class="pastille">${PROTEINES[r.proteine] || ''}</span> <span class="pastille">⏱ ${r.temps_min || '?'} min</span> ${r.tags.map(t => `<span class="pastille orange">${esc(t.replace('_', ' '))}</span>`).join(' ')}</div>
      <div class="champ" style="max-width:180px;margin:0"><label>Portions</label><input id="rc-p" inputmode="decimal" value="${String(portions).replace('.', ',')}"></div></div>
    <p class="aide">Quantités calculées pour ${String(portions).replace('.', ',')} portions (${resumeFoyer(C.membres)}). ✓ = dans vos courses des 3 dernières semaines ou dans le placard.</p>
    <div class="tableau-wrap"><table><tbody>${ings.map(i => `<tr><td>${i.ok ? '✅' : '🛒'}</td><td><b>${esc(i.n)}</b></td><td class="montant">${fmtQ(i.qa, i.u)}</td></tr>`).join('')}</tbody></table></div>
    <h3 style="margin-top:14px">Préparation</h3><ol class="etapes">${(r.instructions || '').split('\n').filter(Boolean).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="aide">Pour un repas équilibré : un fruit ou un laitage en dessert, de l'eau à table.</p>
    <div class="modale-pied">${r.proprietaire ? '<button type="button" class="btn btn-fantome gauche" id="rc-mod">✏️ Modifier</button>' : ''}<button type="button" class="btn btn-fantome" id="rc-pdf">🖨 PDF</button>
      ${manque.length ? `<button type="button" class="btn btn-fantome" id="rc-courses">🛒 ${manque.length} manquant${manque.length > 1 ? 's' : ''} → courses</button>` : ''}
      <button type="button" class="btn btn-primaire" id="rc-plan">📅 Planifier</button></div>`, (md) => {
    $('#rc-p', md).onchange = (e) => { const p = Number(String(e.target.value).replace(',', '.')); if (p > 0) ouvrirRecette(C, r, p); };
    $('#rc-pdf', md).onclick = (e) => action(e.target, () => window.BFC_EXPORT.pdfTableau(r.nom, `${String(portions).replace('.', ',')} portions · ${r.temps_min || '?'} min`, ['', 'Ingrédient / étape', 'Quantité'],
      [...ings.map(i => [i.ok ? 'OK' : 'acheter', i.n, fmtQ(i.qa, i.u)]), ...(r.instructions || '').split('\n').filter(Boolean).map((s, k) => [`Étape ${k + 1}`, s, ''])], `Recette_${norm(r.nom).replace(/ /g, '_')}.pdf`, [2]));
    $('#rc-courses', md) && ($('#rc-courses', md).onclick = (e) => action(e.target, async () => { fermerModale(); await creerListeCourses(C, manquants(C, [{ r, portions }]), `Courses · ${r.nom}`); }));
    $('#rc-mod', md) && ($('#rc-mod', md).onclick = () => formRecette(r));
    $('#rc-plan', md).onclick = () => ouvrirModale('📅 Planifier', `<form id="f-pl"><div class="ligne"><div class="champ"><label>Jour</label><input type="date" name="jour" value="${auj()}"></div>
        <div class="champ"><label>Repas</label><select name="repas">${opts(REPAS, 'diner')}</select></div></div>
        <div class="modale-pied"><button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Planifier</button></div></form>`, (m2) => {
      const f = $('#f-pl', m2); f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
        verifier(await db.from('menus').upsert({ proprietaire: A.utilisateurId, jour: val(f, 'jour'), repas: val(f, 'repas'), recette_id: r.id, libelle: r.nom, portions, statut: 'prevu' }, { onConflict: 'proprietaire,jour,repas' }), 'Menu');
        fermerModale(); toast('Ajouté au menu.'); router(); }); };
    });
  });
}

function formRecette(r = {}) {
  const neuf = !r.id;
  const texteIng = (r.ingredients || []).map(i => `${String(i.q).replace('.', ',')} ${i.u} ${i.n}`).join('\n');
  ouvrirModale(neuf ? 'Nouvelle recette' : 'Modifier la recette', `<form id="f-rc">
    <div class="ligne"><div class="champ" style="max-width:90px"><label>Icône</label><input name="icone" value="${esc(r.icone || '🍽️')}"></div><div class="champ"><label>Nom *</label><input name="nom" required value="${esc(r.nom || '')}"></div></div>
    <div class="ligne3"><div class="champ"><label>Protéine principale</label><select name="proteine">${opts(PROTEINES, r.proteine || 'vegetal')}</select></div>
      <div class="champ"><label>Pour (personnes)</label><input name="portions_base" inputmode="numeric" value="${r.portions_base || 4}"></div>
      <div class="champ"><label>Temps (min)</label><input name="temps_min" inputmode="numeric" value="${r.temps_min ?? ''}"></div></div>
    <div class="champ"><label>Ingrédients * <span class="aide">une ligne par ingrédient : « 300 g Riz », « 2 pièce Oignons », « 20 cl Crème »</span></label><textarea name="ing" rows="7" required>${esc(texteIng)}</textarea></div>
    <div class="champ"><label>Préparation <span class="aide">une étape par ligne</span></label><textarea name="instructions" rows="6">${esc(r.instructions || '')}</textarea></div>
    <div class="champ"><label>Étiquettes</label><input name="tags" value="${esc((r.tags || []).join(', '))}" placeholder="antillais, rapide, enfants, sans_porc, sans_gluten, vegetarien"></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="rc-suppr">Supprimer</button>'}<button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (md) => {
    const f = $('#f-rc', md);
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const PLACARD = /^(sel|poivre|huile|sucre|farine|ail|epice|curry|colombo|piment|vinaigre|bouillon)/;
      const ingredients = val(f, 'ing').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const m = l.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|cl|ml|l|pièces?|pieces?|gousses?|c\. ?à ?s\.?|c\. ?à ?c\.?|brins?|bottes?|tranches?|boîtes?)?\s+(.+)$/i);
        const n = m ? m[3] : l, k = norm(n).split(' ').filter(w => w.length > 2).slice(0, 2).join(' ') || norm(n);
        return { q: m ? Number(m[1].replace(',', '.')) : 1, u: m?.[2] ? m[2].replace(/s$/, '').replace('piece', 'pièce') : 'pièce', n, k, ...(PLACARD.test(norm(n)) ? { b: 1 } : {}) };
      });
      const rec = { icone: val(f, 'icone'), nom: val(f, 'nom'), proteine: val(f, 'proteine'), portions_base: +val(f, 'portions_base') || 4, temps_min: num(f, 'temps_min'), ingredients,
        instructions: val(f, 'instructions'), tags: (val(f, 'tags') || '').split(',').map(s => s.trim().replace(/ /g, '_')).filter(Boolean) };
      verifier(neuf ? await db.from('recettes').insert(rec) : await db.from('recettes').update(rec).eq('id', r.id), 'Recette');
      fermerModale(); toast('Recette enregistrée.'); router();
    }); };
    if (!neuf) $('#rc-suppr', md).onclick = (e) => action(e.target, async () => { if (!await confirmer('Supprimer cette recette ?')) return; verifier(await db.from('recettes').delete().eq('id', r.id)); fermerModale(); router(); });
  });
}

VUES.cuisine = async (el) => {
  cu.debut ||= lundi();
  const C = await chargerCuisine();
  if (C.F.manque) { el.innerHTML = '<div class="carte"><h3>🛠️ Mise à jour de la base nécessaire</h3><p>Le module « Cuisine » a besoin du script <b>08_foyer_cuisine_sport.sql</b>.</p></div>'; return; }
  const fin = plusJours(cu.debut, 6);
  const menus = doux(await db.from('menus').select('*').gte('jour', cu.debut).lte('jour', fin).order('jour')) || [];
  const repasListe = C.F.params?.repas?.length ? C.F.params.repas : ['diner'];
  const recById = (id) => C.recettes.find(r => r.id === id);
  const compat = C.recettes.filter(r => compatible(r, C.membres));
  el.innerHTML = `<div class="tete-vue"><div><h1>🍽️ Cuisine</h1><div class="aide">${resumeFoyer(C.membres)} · <b>${String(C.portions).replace('.', ',')} portions</b> par repas · <a href="#/foyer">modifier le foyer</a></div></div>
      <div class="actions"><button class="btn btn-fantome" id="cu-nouv">＋ Recette</button></div></div>
    <div class="bascule" id="cu-onglets" style="margin-bottom:14px">${[['menu', '📅 Menu de la semaine'], ['idees', '💡 Avec mes courses'], ['recettes', '📖 Recettes'], ['placard', '🧺 Mes achats récents']].map(([k, l]) => `<button data-o="${k}" class="${cu.onglet === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="cu-contenu"></div>`;
  const c = $('#cu-contenu');
  $('#cu-onglets').onclick = (e) => { const b = e.target.closest('button'); if (b) { cu.onglet = b.dataset.o; router(); } };
  $('#cu-nouv').onclick = () => formRecette({});
  const carteRecette = (r) => { const s = scoreRecette(r, C.placard); return `<div class="carte recette-carte cliquable" data-r="${r.id}"><div class="recette-ic">${r.icone || '🍽️'}</div><b>${esc(r.nom)}</b>
    <div class="aide">${PROTEINES[r.proteine] || ''} · ⏱ ${r.temps_min || '?'} min</div><div class="barre"><span style="width:${Math.round(s * 100)}%"></span></div><div class="aide">${Math.round(s * 100)} % des ingrédients déjà achetés</div></div>`; };

  if (cu.onglet === 'menu') {
    const parJour = {}; menus.forEach(m => { (parJour[m.jour] ||= {})[m.repas] = m; });
    const prot = menus.map(m => recById(m.recette_id)?.proteine).filter(Boolean);
    const cnt = (p) => prot.filter(x => x === p).length;
    c.innerHTML = `<div class="carte" style="margin-bottom:14px"><div class="barre-outils">
        <button class="btn btn-fantome btn-petit" id="cu-prec">◀</button><b>Semaine du ${fmtDate(cu.debut)} au ${fmtDate(fin)}</b><button class="btn btn-fantome btn-petit" id="cu-suiv">▶</button>
        <span style="margin-left:auto"></span><button class="btn btn-fantome" id="cu-pdf">🖨 PDF</button><button class="btn btn-fantome" id="cu-liste">🛒 Liste des manquants</button><button class="btn btn-primaire" id="cu-gen">✨ ${menus.length ? 'Refaire' : 'Proposer'} le menu équilibré</button></div>
        ${menus.length ? `<div class="equilibre">🐟 Poisson ${cnt('poisson')} · 🥚🫘 Végétarien ${cnt('oeufs') + cnt('vegetal')} · 🍗 Volaille ${cnt('volaille')} · 🥩 Viande rouge ${cnt('viande_rouge')} · 🐖 Porc ${cnt('porc')}
          ${cnt('poisson') >= 2 && cnt('viande_rouge') <= 2 ? '<span class="pastille rec">✓ équilibré</span>' : '<span class="pastille orange">à rééquilibrer : au moins 2 poissons, au plus 2 viandes rouges</span>'}</div>` : ''}</div>
      <div class="menu-grille">${[0, 1, 2, 3, 4, 5, 6].map(j => { const d = plusJours(cu.debut, j); return `<div class="carte menu-jour ${d === auj() ? 'auj' : ''}"><div class="menu-tete">${JOURS[j]} <span class="aide">${fmtDate(d).slice(0, 5)}</span></div>
        ${repasListe.map(rp => { const m = parJour[d]?.[rp]; const r = m && recById(m.recette_id); return `<div class="menu-repas ${m?.statut === 'fait' ? 'fait' : ''}"><span class="aide">${REPAS[rp]}</span>
          ${m ? `<a href="#" data-r="${m.recette_id}">${r?.icone || '🍽️'} ${esc(m.libelle || r?.nom || '')}</a><div class="occ-act" style="justify-content:flex-start"><button class="btn btn-petit btn-fantome" data-fait="${m.id}" title="Fait">✓</button><button class="btn btn-petit btn-fantome" data-chg="${d}|${rp}" title="Changer">🔄</button><button class="btn btn-petit btn-fantome" data-sup="${m.id}" title="Retirer">×</button></div>`
            : `<button class="btn btn-petit btn-fantome" data-chg="${d}|${rp}">＋ Choisir</button>`}</div>`; }).join('')}</div>`; }).join('')}</div>`;
    $('#cu-prec').onclick = () => { cu.debut = plusJours(cu.debut, -7); router(); };
    $('#cu-suiv').onclick = () => { cu.debut = plusJours(cu.debut, 7); router(); };
    $('#cu-gen').onclick = (e) => action(e.target, async () => {
      if (menus.length && !await confirmer('Remplacer le menu de cette semaine par une nouvelle proposition ?')) return;
      const prop = genererMenu(C, cu.debut, repasListe);
      if (!prop.length) throw new Error('Aucune recette compatible avec les régimes du foyer.');
      verifier(await db.from('menus').upsert(prop.map(p => ({ proprietaire: A.utilisateurId, jour: p.jour, repas: p.repas, recette_id: p.recette.id, libelle: p.recette.nom, portions: C.portions, statut: 'prevu' })), { onConflict: 'proprietaire,jour,repas' }), 'Menu');
      toast('Menu équilibré proposé. Cliquez sur 🔄 pour changer un repas.'); router();
    });
    $('#cu-liste').onclick = (e) => action(e.target, () => creerListeCourses(C, manquants(C, menus.filter(m => m.statut !== 'fait' && recById(m.recette_id)).map(m => ({ r: recById(m.recette_id), portions: Number(m.portions) || C.portions }))), `Courses menus · semaine du ${fmtDate(cu.debut)}`));
    $('#cu-pdf').onclick = (e) => action(e.target, () => window.BFC_EXPORT.pdfTableau('Menu de la semaine', `${fmtDate(cu.debut)} au ${fmtDate(fin)} · ${resumeFoyer(C.membres)} (${C.portions} portions)`, ['Jour', 'Repas', 'Plat'],
      menus.map(m => [`${JOURS[jourSem(m.jour) - 1]} ${fmtDate(m.jour).slice(0, 5)}`, REPAS[m.repas] || m.repas, m.libelle || recById(m.recette_id)?.nom || '']), `Menu_semaine_${cu.debut}.pdf`));
    c.onclick = (e) => {
      const a = e.target.closest('[data-r]'); if (a) { e.preventDefault(); const r = recById(a.dataset.r); if (r) ouvrirRecette(C, r); return; }
      const f = e.target.closest('[data-fait]'); if (f) return action(f, async () => { verifier(await db.from('menus').update({ statut: 'fait' }).eq('id', f.dataset.fait)); router(); });
      const s = e.target.closest('[data-sup]'); if (s) return action(s, async () => { verifier(await db.from('menus').delete().eq('id', s.dataset.sup)); router(); });
      const ch = e.target.closest('[data-chg]'); if (ch) { const [jour, repas] = ch.dataset.chg.split('|');
        const tri = compat.slice().sort((x, y) => scoreRecette(y, C.placard) - scoreRecette(x, C.placard));
        ouvrirModale(`Choisir le ${REPAS[repas].toLowerCase()} du ${fmtDate(jour)}`, `<div class="recettes-grille">${tri.map(carteRecette).join('')}</div>`, (md) => {
          md.onclick = (ev) => { const k = ev.target.closest('[data-r]'); if (!k) return; const r = recById(k.dataset.r);
            action(null, async () => { verifier(await db.from('menus').upsert({ proprietaire: A.utilisateurId, jour, repas, recette_id: r.id, libelle: r.nom, portions: C.portions, statut: 'prevu' }, { onConflict: 'proprietaire,jour,repas' })); fermerModale(); router(); }); };
        }); }
    };
  } else if (cu.onglet === 'idees') {
    const tri = compat.map(r => ({ r, s: scoreRecette(r, C.placard) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.r);
    c.innerHTML = `<p class="aide">Recettes classées selon ce que vous avez acheté ces 3 dernières semaines (listes de courses cochées ou terminées, tickets scannés).</p>
      <div class="recettes-grille">${tri.map(carteRecette).join('') || '<div class="carte vide" style="grid-column:1/-1">Aucun achat récent trouvé. Faites vos courses avec l\'onglet Courses ou scannez un ticket : les idées de repas apparaîtront ici.</div>'}</div>`;
    c.onclick = (e) => { const k = e.target.closest('[data-r]'); if (k) ouvrirRecette(C, C.recettes.find(r => r.id === k.dataset.r)); };
  } else if (cu.onglet === 'recettes') {
    const liste = C.recettes.filter(r => !cu.filtre || r.proteine === cu.filtre);
    c.innerHTML = `<div style="margin-bottom:12px"><select id="cu-filtre" style="width:auto"><option value="">Toutes les protéines</option>${Object.entries(PROTEINES).map(([k, l]) => `<option value="${k}" ${k === cu.filtre ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="recettes-grille">${liste.map(r => carteRecette(r).replace('recette-carte', 'recette-carte' + (compatible(r, C.membres) ? '' : ' incompatible'))).join('')}</div>
      <p class="aide">Grisées : recettes qui ne conviennent pas aux régimes ou allergies du foyer.</p>`;
    $('#cu-filtre').onchange = (e) => { cu.filtre = e.target.value; router(); };
    c.onclick = (e) => { const k = e.target.closest('[data-r]'); if (k) ouvrirRecette(C, C.recettes.find(r => r.id === k.dataset.r)); };
  } else {
    c.innerHTML = `<div class="carte"><h3>🧺 Achats des 3 dernières semaines <span class="aide">${C.achats.length} article${C.achats.length > 1 ? 's' : ''}</span></h3>
      ${C.achats.sort((a, b) => b.date.localeCompare(a.date)).map(a => `<div class="aj-item"><span class="pastille">${fmtDate(a.date).slice(0, 5)}</span> <b>${esc(a.libelle)}</b> <span class="aide">${a.quantite} ${esc(a.unite || '')}</span></div>`).join('') || '<div class="vide">Rien pour l\'instant.</div>'}</div>`;
  }
};

/* ================================================================ SPORT */
const sp = { onglet: 'semaine', debut: null };
const INTENS = { 1: '🙂 Douce', 2: '💪 Modérée', 3: '🔥 Intense' };
const minutesEff = (s) => s.duree_min * (s.intensite === 3 ? 2 : 1);   // 1 min intense ≈ 2 min modérées (repères OMS)
const objectif = (m) => m.objectif_sport_min || (m.role === 'enfant' ? 420 : 150);
async function chargerSport(debut) {
  const [F, act, seances] = await Promise.all([chargerFoyer(),
    db.from('activites_sport').select('*').eq('actif', true).order('nom').then(doux),
    db.from('seances_sport').select('*').gte('jour', plusJours(debut, -28)).order('jour', { ascending: false }).then(doux)]);
  return { F, membres: F.membres, activites: act || [], seances: seances || [] };
}
function conseilsSport(S, debut) {
  const out = [], today = auj(), finSem = plusJours(debut, 6), js = jourSem(today);
  S.membres.forEach(m => {
    const sem = S.seances.filter(s => s.membre_id === m.id && s.jour >= debut && s.jour <= finSem);
    const eff = sem.reduce((a, s) => a + minutesEff(s), 0), obj = objectif(m);
    const sept = S.seances.filter(s => s.membre_id === m.id && s.jour > plusJours(today, -7) && s.jour <= today);
    const intenses = sept.filter(s => s.intensite === 3).length;
    let suite = 0; for (let k = 0; k < 7; k++) { if (sept.some(s => s.jour === plusJours(today, -k))) suite++; else break; }
    if (intenses >= 3 || suite >= 4) out.push(['repos', `😮‍💨 ${m.prenom} : ${intenses >= 3 ? intenses + ' séances intenses' : suite + ' jours de suite'} sur les 7 derniers jours → prévois une journée de repos ou une séance douce (marche, étirements).`]);
    else if (js >= 4 && eff < obj * 0.5) out.push(['bouger', `💪 ${m.prenom} : ${eff} min sur ${obj} cette semaine. Il reste ${obj - eff} min : ${m.role === 'enfant' ? 'jeux dehors, vélo, piscine…' : '2 ou 3 marches rapides de 30 min suffisent.'}`]);
    else if (eff >= obj) out.push(['bravo', `🏅 ${m.prenom} : objectif de la semaine atteint (${eff} / ${obj} min).`]);
  });
  S.activites.filter(a => a.licence_fin && a.licence_fin <= plusJours(today, 30)).forEach(a => out.push(['licence', `📑 ${a.nom} : licence / abonnement à renouveler avant le ${fmtDate(a.licence_fin)}.`]));
  return out;
}
function formSeance(S, s = {}) {
  const neuf = !s.id;
  ouvrirModale(neuf ? 'Nouvelle séance' : 'Modifier la séance', `<form id="f-se">
    <div class="ligne"><div class="champ"><label>Qui *</label><select name="membre_id" required>${optsListe(S.membres, s.membre_id || S.membres[0]?.id, 'Choisir…', m => m.prenom)}</select></div>
      <div class="champ"><label>Activité</label><select name="activite_id">${optsListe(S.activites, s.activite_id, 'Autre / libre')}</select></div></div>
    <div class="champ"><label>Libellé</label><input name="libelle" value="${esc(s.libelle || '')}" placeholder="ex : footing, piscine, match"></div>
    <div class="ligne3"><div class="champ"><label>Date</label><input type="date" name="jour" value="${s.jour || auj()}"></div>
      <div class="champ"><label>Durée (min) *</label><input name="duree_min" inputmode="numeric" required value="${s.duree_min || 45}"></div>
      <div class="champ"><label>Intensité</label><select name="intensite">${opts(INTENS, String(s.intensite || 2))}</select></div></div>
    <div class="ligne"><div class="champ"><label>Distance (km)</label><input name="distance_km" inputmode="decimal" value="${s.distance_km ?? ''}"></div>
      <div class="champ"><label>Ressenti</label><select name="ressenti">${opts({ '': '—', 5: '😄 Excellent', 4: '🙂 Bien', 3: '😐 Moyen', 2: '😓 Difficile', 1: '🤕 Douleur' }, String(s.ressenti ?? ''))}</select></div></div>
    <div class="champ"><label>Notes</label><input name="notes" value="${esc(s.notes || '')}"></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="se-suppr">Supprimer</button>'}<button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (md) => {
    const f = $('#f-se', md);
    f.activite_id.onchange = () => { const a = S.activites.find(x => x.id === f.activite_id.value); if (a) { f.duree_min.value = a.duree_min; f.intensite.value = a.intensite; if (!f.libelle.value) f.libelle.value = a.nom; if (a.membre_id) f.membre_id.value = a.membre_id; } };
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { membre_id: val(f, 'membre_id'), activite_id: val(f, 'activite_id'), libelle: val(f, 'libelle') || S.activites.find(x => x.id === val(f, 'activite_id'))?.nom || 'Séance', jour: val(f, 'jour'),
        duree_min: Math.max(1, +val(f, 'duree_min') || 30), intensite: +val(f, 'intensite'), distance_km: num(f, 'distance_km'), ressenti: val(f, 'ressenti') ? +val(f, 'ressenti') : null, notes: val(f, 'notes') };
      verifier(neuf ? await db.from('seances_sport').insert(rec) : await db.from('seances_sport').update(rec).eq('id', s.id), 'Séance');
      fermerModale(); toast('Séance enregistrée.'); router();
    }); };
    if (!neuf) $('#se-suppr', md).onclick = (e) => action(e.target, async () => { verifier(await db.from('seances_sport').delete().eq('id', s.id)); fermerModale(); router(); });
  });
}
function formActivite(S, a = {}) {
  const neuf = !a.id;
  ouvrirModale(neuf ? 'Nouvelle activité régulière' : 'Modifier l\'activité', `<form id="f-ac">
    <div class="ligne"><div class="champ" style="max-width:90px"><label>Icône</label><input name="icone" value="${esc(a.icone || '🏃')}"></div><div class="champ"><label>Activité *</label><input name="nom" required value="${esc(a.nom || '')}" placeholder="ex : Football, Natation, Salle de sport"></div></div>
    <div class="ligne"><div class="champ"><label>Qui</label><select name="membre_id">${optsListe(S.membres, a.membre_id, 'Toute la famille', m => m.prenom)}</select></div><div class="champ"><label>Lieu</label><input name="lieu" value="${esc(a.lieu || '')}"></div></div>
    <div class="champ"><label>Jours</label><div class="cases">${JOURS.map((j, i) => `<label class="case"><input type="checkbox" name="jour" value="${i + 1}" ${(a.jours || []).includes(i + 1) ? 'checked' : ''}> ${j.slice(0, 3)}.</label>`).join('')}</div></div>
    <div class="ligne3"><div class="champ"><label>Heure</label><input type="time" name="heure" value="${(a.heure || '').slice(0, 5)}"></div><div class="champ"><label>Durée (min)</label><input name="duree_min" inputmode="numeric" value="${a.duree_min || 60}"></div>
      <div class="champ"><label>Intensité</label><select name="intensite">${opts(INTENS, String(a.intensite || 2))}</select></div></div>
    <div class="ligne3"><div class="champ"><label>Coût (€)</label><input name="cout" inputmode="decimal" value="${a.cout ?? ''}"></div><div class="champ"><label>Par</label><select name="periode_cout">${opts({ mensuel: 'mois', trimestriel: 'trimestre', annuel: 'an', seance: 'séance' }, a.periode_cout || 'mensuel')}</select></div>
      <div class="champ"><label>Licence / abonnement jusqu'au</label><input type="date" name="licence_fin" value="${a.licence_fin || ''}"></div></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="ac-suppr">Supprimer</button>'}<button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (md) => {
    const f = $('#f-ac', md);
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { icone: val(f, 'icone'), nom: val(f, 'nom'), membre_id: val(f, 'membre_id'), lieu: val(f, 'lieu'), jours: $$('input[name=jour]:checked', f).map(x => +x.value), heure: val(f, 'heure'),
        duree_min: +val(f, 'duree_min') || 60, intensite: +val(f, 'intensite'), cout: num(f, 'cout'), periode_cout: val(f, 'periode_cout'), licence_fin: val(f, 'licence_fin') };
      verifier(neuf ? await db.from('activites_sport').insert(rec) : await db.from('activites_sport').update(rec).eq('id', a.id), 'Activité');
      fermerModale(); toast('Activité enregistrée.'); router();
    }); };
    if (!neuf) $('#ac-suppr', md).onclick = (e) => action(e.target, async () => { verifier(await db.from('activites_sport').update({ actif: false }).eq('id', a.id)); fermerModale(); router(); });
  });
}

VUES.sport = async (el) => {
  sp.debut ||= lundi();
  const S = await chargerSport(sp.debut);
  if (S.F.manque) { el.innerHTML = '<div class="carte"><h3>🛠️ Mise à jour de la base nécessaire</h3><p>Le module « Sport » a besoin du script <b>08_foyer_cuisine_sport.sql</b>.</p></div>'; return; }
  const fin = plusJours(sp.debut, 6), today = auj();
  const conseils = conseilsSport(S, sp.debut);
  const prevus = S.activites.filter(a => (a.jours || []).includes(jourSem(today)) && !S.seances.some(s => s.activite_id === a.id && s.jour === today));
  el.innerHTML = `<div class="tete-vue"><h1>🏃 Sport & bien-être</h1><div class="actions"><button class="btn btn-fantome" id="sp-act">＋ Activité régulière</button><button class="btn btn-primaire" id="sp-seance">＋ Séance</button></div></div>
    ${S.membres.length ? '' : '<div class="alerte" style="margin-bottom:14px">Ajoutez les membres du foyer dans <a href="#/foyer">Mon foyer</a> pour suivre le sport de chacun.</div>'}
    <div class="bascule" id="sp-onglets" style="margin-bottom:14px">${[['semaine', '📊 Ma semaine'], ['seances', '📝 Séances'], ['activites', '📅 Activités régulières']].map(([k, l]) => `<button data-o="${k}" class="${sp.onglet === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="sp-contenu"></div>`;
  $('#sp-onglets').onclick = (e) => { const b = e.target.closest('button'); if (b) { sp.onglet = b.dataset.o; router(); } };
  $('#sp-seance').onclick = () => formSeance(S);
  $('#sp-act').onclick = () => formActivite(S);
  const c = $('#sp-contenu');
  if (sp.onglet === 'semaine') {
    c.innerHTML = `<div class="aj-grille"><div class="aj-col">
        <div class="carte"><div class="barre-outils"><button class="btn btn-fantome btn-petit" id="sp-prec">◀</button><b>Semaine du ${fmtDate(sp.debut)}</b><button class="btn btn-fantome btn-petit" id="sp-suiv">▶</button><button class="btn btn-fantome btn-petit" id="sp-pdf" style="margin-left:auto">🖨 PDF</button></div>
        ${S.membres.map(m => { const sem = S.seances.filter(s => s.membre_id === m.id && s.jour >= sp.debut && s.jour <= fin); const eff = sem.reduce((a, s) => a + minutesEff(s), 0), obj = objectif(m);
          return `<div class="objectif"><div class="aj-item" style="border:0;padding:0"><b>${esc(m.prenom)}</b><span class="aide">${sem.length} séance${sem.length > 1 ? 's' : ''}</span><span style="margin-left:auto;font-weight:800">${eff} / ${obj} min</span></div>
            <div class="barre sport"><span style="width:${Math.min(100, Math.round(eff / obj * 100))}%"></span></div></div>`; }).join('') || '<div class="vide">Aucun membre.</div>'}
        <p class="aide" style="margin-bottom:0">Repères : 150 min d'activité modérée par semaine pour un adulte, 60 min par jour pour un enfant. Une minute intense compte double.</p></div>
        <div class="carte"><h3>💡 Conseils</h3>${conseils.map(([t, m]) => `<div class="alerte-ligne ${t === 'repos' ? 'niv-attention' : t === 'licence' ? 'niv-urgent' : ''}"><div>${esc(m)}</div></div>`).join('') || '<div class="vide">Enregistrez vos séances pour recevoir des conseils.</div>'}</div></div>
      <div class="aj-col"><div class="carte"><h3>📅 Aujourd'hui</h3>${prevus.map(a => `<div class="aj-item"><span class="pastille">${a.heure ? a.heure.slice(0, 5) : '—'}</span><b>${esc(a.icone || '')} ${esc(a.nom)}</b><span class="aide">${esc(S.membres.find(m => m.id === a.membre_id)?.prenom || 'famille')} · ${a.duree_min} min</span>
          <button class="btn btn-petit btn-primaire" data-fait-act="${a.id}" style="margin-left:auto">✓ Fait</button></div>`).join('') || '<div class="vide">Pas d\'activité prévue aujourd\'hui.</div>'}</div>
        <div class="carte"><h3>📝 Dernières séances</h3>${S.seances.slice(0, 8).map(s => `<div class="aj-item"><span class="pastille">${fmtDate(s.jour).slice(0, 5)}</span><b>${esc(s.libelle || '')}</b><span class="aide">${esc(S.membres.find(m => m.id === s.membre_id)?.prenom || '')} · ${s.duree_min} min · ${INTENS[s.intensite]}</span></div>`).join('') || '<div class="vide">Aucune séance.</div>'}</div></div></div>`;
    $('#sp-prec').onclick = () => { sp.debut = plusJours(sp.debut, -7); router(); };
    $('#sp-suiv').onclick = () => { sp.debut = plusJours(sp.debut, 7); router(); };
    $('#sp-pdf').onclick = (e) => action(e.target, () => window.BFC_EXPORT.pdfTableau('Sport de la semaine', `${fmtDate(sp.debut)} au ${fmtDate(fin)}`, ['Date', 'Qui', 'Séance', 'Durée'],
      [...S.seances.filter(s => s.jour >= sp.debut && s.jour <= fin).map(s => [fmtDate(s.jour), S.membres.find(m => m.id === s.membre_id)?.prenom || '', `${s.libelle || ''} (${INTENS[s.intensite]})`, s.duree_min + ' min']), ...conseils.map(([, m]) => ['Conseil', '', m, ''])], `Sport_${sp.debut}.pdf`, [3]));
    c.onclick = (e) => { const b = e.target.closest('[data-fait-act]'); if (!b) return; const a = S.activites.find(x => x.id === b.dataset.faitAct);
      action(b, async () => { const qui = a.membre_id ? [a.membre_id] : S.membres.map(m => m.id);
        verifier(await db.from('seances_sport').insert(qui.map(id => ({ membre_id: id, activite_id: a.id, libelle: a.nom, jour: today, duree_min: a.duree_min, intensite: a.intensite })))); toast('Bravo ! Séance enregistrée. 🏅'); router(); }); };
  } else if (sp.onglet === 'seances') {
    c.innerHTML = `<div class="carte"><div class="tableau-wrap"><table><thead><tr><th>Date</th><th>Qui</th><th>Séance</th><th>Durée</th><th class="masquer-mobile">Intensité</th><th class="masquer-mobile">Distance</th></tr></thead><tbody>
      ${S.seances.map(s => `<tr data-id="${s.id}" class="cliquable"><td>${fmtDate(s.jour)}</td><td>${esc(S.membres.find(m => m.id === s.membre_id)?.prenom || '')}</td><td>${esc(s.libelle || '')}</td><td>${s.duree_min} min</td><td class="masquer-mobile">${INTENS[s.intensite]}</td><td class="masquer-mobile">${s.distance_km ? String(s.distance_km).replace('.', ',') + ' km' : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="vide">Aucune séance sur les 4 dernières semaines.</td></tr>'}</tbody></table></div></div>`;
    c.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) formSeance(S, S.seances.find(s => s.id === tr.dataset.id)); };
  } else {
    c.innerHTML = `<div class="carte">${S.activites.map(a => `<div class="aj-item cliquable" data-id="${a.id}"><b>${esc(a.icone || '')} ${esc(a.nom)}</b><span class="aide">${esc(S.membres.find(m => m.id === a.membre_id)?.prenom || 'famille')} · ${(a.jours || []).map(j => JOURS[j - 1].slice(0, 3)).join(', ') || 'jours libres'}${a.heure ? ' · ' + a.heure.slice(0, 5) : ''}</span>
        ${a.cout ? `<span class="pastille">${fmt(a.cout)} / ${{ mensuel: 'mois', trimestriel: 'trim.', annuel: 'an', seance: 'séance' }[a.periode_cout]}</span>${a.periode_cout !== 'seance' ? `<button class="btn btn-petit btn-fantome" data-ech="${a.id}">💶 Ajouter à mes factures</button>` : ''}` : ''}
        ${a.licence_fin ? `<span class="pastille ${a.licence_fin <= plusJours(today, 30) ? 'dep' : ''}">licence → ${fmtDate(a.licence_fin)}</span>` : ''}</div>`).join('') || '<div class="vide">Aucune activité régulière. Ajoutez le foot du mercredi, la piscine du samedi…</div>'}</div>`;
    c.onclick = (e) => {
      const b = e.target.closest('[data-ech]'); if (b) { e.stopPropagation(); const a = S.activites.find(x => x.id === b.dataset.ech);
        return A.formEcheance?.({ libelle: `Sport · ${a.nom}`, montant: a.cout, frequence: a.periode_cout === 'annuel' ? 'annuelle' : a.periode_cout === 'trimestriel' ? 'trimestrielle' : 'mensuelle', espace: 'sport', moyen_paiement: 'prelevement' }); }
      const r = e.target.closest('[data-id]'); if (r) formActivite(S, S.activites.find(x => x.id === r.dataset.id));
    };
  }
};

/* ---------------------------------------------------------------- « Aujourd'hui » : menu du jour, sport du jour, accueil */
const vueAujourdhui = VUES.aujourdhui;
if (vueAujourdhui) VUES.aujourdhui = async (el, p) => {
  await vueAujourdhui(el, p);
  try {
    const today = auj();
    const [menus, rec, act, sea] = await Promise.all([db.from('menus').select('*').eq('jour', today), db.from('recettes').select('id, nom, icone'),
      db.from('activites_sport').select('*').eq('actif', true).contains('jours', [jourSem(today)]), db.from('seances_sport').select('activite_id').eq('jour', today)].map(q => q.then(doux)));
    const col = $$('.aj-col', el)[1]; if (!col || menus === null) { verifierAccueil(); return; }
    const restants = (act || []).filter(a => !(sea || []).some(s => s.activite_id === a.id));
    col.insertAdjacentHTML('afterbegin', `<div class="carte"><h3>🍽️ Au menu aujourd'hui <a href="#/cuisine" class="btn btn-petit btn-fantome" style="margin-left:auto">Cuisine →</a></h3>
      ${(menus || []).map(m => `<div class="aj-item"><span class="pastille">${REPAS[m.repas] || m.repas}</span><b>${(rec || []).find(r => r.id === m.recette_id)?.icone || '🍽️'} ${esc(m.libelle || '')}</b></div>`).join('') || '<div class="vide">Pas de menu prévu. <a href="#/cuisine">Proposer un menu équilibré</a></div>'}
      ${restants.length ? `<h3 style="margin-top:12px">🏃 Sport du jour</h3>${restants.map(a => `<div class="aj-item"><span class="pastille">${a.heure ? a.heure.slice(0, 5) : '—'}</span><b>${esc(a.icone || '')} ${esc(a.nom)}</b></div>`).join('')}` : ''}</div>`);
  } catch (e) { console.warn(e); }
  verifierAccueil();
};
});
