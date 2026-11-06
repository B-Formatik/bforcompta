/* B-S@fe — Base de prix commune (tous les utilisateurs) : recherche par produit ou par magasin, relevés de prix,
   et « devis de courses » : à partir d'un budget, la liste au meilleur prix avec magasins, articles, prix et total. */
(window.BFC_MODULES = window.BFC_MODULES || []).push((A) => {
'use strict';
const { db, R, $, $$, esc, fmt, fmtDate, auj, opts, toast, verifier, action, val, num, ouvrirModale, fermerModale, router, VUES } = A;
const doux = (r) => r.error ? null : r.data;
const cle = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/[^a-z0-9]+/g, ' ').trim();

/* Enregistre des prix dans la base commune (appelé par le scan de ticket, les courses terminées et la saisie manuelle) */
async function enregistrerPrix(articles, magasin, { ville = null, source = 'manuel', date = auj() } = {}) {
  if (!magasin) return 0; let n = 0;
  for (const a of articles) {
    const pu = Number(a.prix_unitaire ?? a.prix);
    if (!a.libelle || !(pu > 0)) continue;
    const r = await db.rpc('enregistrer_prix', { p_produit: a.libelle, p_magasin: magasin, p_prix: pu, p_ville: ville, p_unite: a.unite || null, p_source: source, p_date: date });
    if (!r.error && r.data) n++;
  }
  return n;
}
A.enregistrerPrix = enregistrerPrix;

const px = { onglet: 'recherche', q: '', mag: '', devis: null };
VUES.prix = async (el) => {
  const st = doux(await db.rpc('catalogue_stats'));
  if (!st) { el.innerHTML = '<div class="carte"><h3>🛠️ Mise à jour de la base nécessaire</h3><p>Le comparateur a besoin du script <b>11_catalogue_commun.sql</b>.</p></div>'; return; }
  el.innerHTML = `<div class="tete-vue"><div><h1>🔎 Prix & devis de courses</h1><div class="aide">Base commune à tous les utilisateurs de B-S@fe : ${st.produits} produits · ${st.magasins} magasins · ${st.releves} prix relevés (${st.releves_30j} ce mois-ci)</div></div>
      <div class="actions"><button class="btn btn-fantome" id="px-ajout">＋ Relever un prix</button><button class="btn btn-bleu" id="px-scan">📸 Scanner un ticket</button></div></div>
    <div class="bascule" id="px-onglets" style="margin-bottom:14px">${[['recherche', '🔎 Rechercher'], ['devis', '🧮 Devis avec mon budget'], ['magasins', '🏪 Magasins']].map(([k, l]) => `<button data-o="${k}" class="${px.onglet === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="px-contenu"></div>`;
  $('#px-onglets').onclick = (e) => { const b = e.target.closest('button'); if (b) { px.onglet = b.dataset.o; router(); } };
  $('#px-ajout').onclick = () => formPrix();
  $('#px-scan').onclick = () => A.scanner ? A.scanner('quotidien') : toast('Scanner indisponible.', true);
  const c = $('#px-contenu');
  if (px.onglet === 'recherche') return ongletRecherche(c);
  if (px.onglet === 'devis') return ongletDevis(c);
  return ongletMagasins(c);
};

async function ongletRecherche(c) {
  c.innerHTML = `<div class="carte" style="margin-bottom:14px"><div class="barre-outils"><input id="px-q" placeholder="Produit (ex : lait, riz, poulet)" value="${esc(px.q)}" style="flex:2;min-width:160px">
      <input id="px-m" placeholder="Magasin ou ville" value="${esc(px.mag)}" style="flex:1;min-width:140px"><button class="btn btn-primaire" id="px-go">Rechercher</button></div></div><div id="px-res"></div>`;
  const go = async () => {
    px.q = $('#px-q').value.trim(); px.mag = $('#px-m').value.trim();
    const res = $('#px-res');
    if (!px.q && !px.mag) { res.innerHTML = '<div class="carte vide">Tapez un produit et/ou un magasin. Exemple : « lait », ou « Leader Price ».</div>'; return; }
    res.innerHTML = '<div class="chargement">Recherche…</div>';
    const l = doux(await db.rpc('chercher_prix', { p_produit: px.q, p_magasin: px.mag, p_limite: 300 })) || [];
    const parProd = l.reduce((m, x) => { (m[x.produit_id] ||= { nom: x.produit, marque: x.marque, unite: x.unite, l: [] }).l.push(x); return m; }, {});
    res.innerHTML = Object.values(parProd).map(p => `<div class="carte prix-carte"><h3>${esc(p.nom)}${p.marque ? ` <span class="aide">${esc(p.marque)}</span>` : ''}${p.unite ? ` <span class="aide">· ${esc(p.unite)}</span>` : ''}</h3>
      ${p.l.map(x => `<div class="aj-item ${x.meilleur ? 'meilleur' : ''}"><b>${esc(x.magasin)}</b><span class="aide">${esc(x.ville || '')} · relevé le ${fmtDate(x.date_releve)}${x.nb_releves > 1 ? ' · ' + x.nb_releves + ' relevés' : ''}</span>
        <span style="margin-left:auto;font-weight:900">${fmt(x.prix)}</span>${x.meilleur ? '<span class="pastille rec">🏆 moins cher</span>' : `<span class="pastille orange">+${fmt(x.ecart)}</span>`}</div>`).join('')}</div>`).join('')
      || '<div class="carte vide">Aucun prix trouvé. Scannez vos tickets ou relevez un prix : la base grandit avec chaque utilisateur.</div>';
  };
  $('#px-go').onclick = go; $('#px-q').onkeydown = $('#px-m').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  if (px.q || px.mag) go(); else $('#px-res').innerHTML = '<div class="carte vide">Tapez un produit et/ou un magasin. Exemple : « lait », ou « Leader Price ».</div>';
}

async function ongletMagasins(c) {
  const [mags, prix] = await Promise.all([db.from('catalogue_magasins').select('*').order('nom').then(doux), db.from('v_prix_actuels').select('magasin_id, produit_id').limit(20000).then(doux)]);
  const nb = (id) => new Set((prix || []).filter(p => p.magasin_id === id).map(p => p.produit_id)).size;
  c.innerHTML = `<div class="espaces-grille">${(mags || []).map(m => `<div class="carte cliquable mag-carte" data-m="${esc(m.nom)}"><div class="espace-ic">🏪</div><b>${esc(m.nom)}</b><div class="aide">${esc(m.ville || '')}</div><div class="aide">${nb(m.id)} produit(s) avec prix</div></div>`).join('') || '<div class="carte vide">Aucun magasin pour l\'instant.</div>'}</div>`;
  c.onclick = (e) => { const k = e.target.closest('[data-m]'); if (k) { px.onglet = 'recherche'; px.q = ''; px.mag = k.dataset.m; router(); } };
}

function formPrix() {
  ouvrirModale('＋ Relever un prix', `<form id="f-px"><div class="ligne"><div class="champ"><label>Produit *</label><input name="produit" required placeholder="ex : Lait demi-écrémé 1 L"></div><div class="champ"><label>Prix (€) *</label><input name="prix" inputmode="decimal" required></div></div>
    <div class="ligne"><div class="champ"><label>Magasin *</label><input name="magasin" required list="px-mags" placeholder="ex : Leader Price"></div><div class="champ"><label>Ville</label><input name="ville" placeholder="ex : Baie-Mahault"></div></div>
    <div class="ligne"><div class="champ"><label>Unité / format</label><input name="unite" placeholder="1 L, 1 kg, pièce…"></div><div class="champ"><label>Date</label><input type="date" name="date" value="${auj()}"></div></div>
    <datalist id="px-mags"></datalist><p class="aide">Le prix rejoint la base commune (votre nom n'apparaît pas).</p>
    <div class="modale-pied"><button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, async (md) => {
    const f = $('#f-px', md);
    const mags = doux(await db.from('catalogue_magasins').select('nom, ville').order('nom')) || [];
    $('#px-mags', md).innerHTML = mags.map(m => `<option value="${esc(m.nom)}">${esc(m.ville || '')}</option>`).join('');
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const r = await db.rpc('enregistrer_prix', { p_produit: val(f, 'produit'), p_magasin: val(f, 'magasin'), p_prix: num(f, 'prix'), p_ville: val(f, 'ville'), p_unite: val(f, 'unite'), p_source: 'manuel', p_date: val(f, 'date') });
      verifier(r, 'Prix'); fermerModale(); toast('Prix enregistré dans la base commune. Merci !'); px.q = val(f, 'produit'); px.onglet = 'recherche'; router();
    }); };
  });
}

/* ---------------------------------------------------------------- Devis de courses à partir d'un budget */
const PANIER_BASE = ['riz', 'pâtes', 'lait', 'œufs', 'pain', 'beurre', 'yaourt', 'pommes de terre', 'oignons', 'tomates', 'carottes', 'bananes', 'pommes', 'poulet', 'poisson', 'huile', 'fromage', 'eau'];
/* Niveau de nécessité d'un article : 3 indispensable, 2 utile, 1 plaisir / superflu (un « ! » en fin de ligne le rend indispensable) */
const PLAISIR = /(soda|coca|cola|fanta|sprite|limonade|jus|nectar|sirop|biere|vin|rhum|alcool|champagne|punch|chips|biscuit|gateau|cookie|bonbon|confiserie|chocolat|glace|sorbet|nutella|pate a tartiner|cereales sucrees|apero|cacahuete|viennoiserie|croissant|brioche|dessert|creme dessert|bougie|magazine|energisante)/;
const INDISPENSABLE = /(riz|pate|pain|lait|oeuf|eau|farine|legume|fruit|banane|pomme|tomate|carotte|oignon|igname|patate|pomme de terre|poulet|poisson|viande|lentille|haricot|pois|couche|savon|dentifrice|papier toilette|lessive|huile|sel|sucre|medicament|lait infantile|yaourt)/;
function niveau(l) { if (/!\s*$/.test(l.brut || '')) return 3; const n = cle(l.nom); return PLAISIR.test(n) ? 1 : INDISPENSABLE.test(n) ? 3 : 2; }
const NIVEAUX = { 1: '🍬 Plaisir / superflu', 2: '👍 Utile', 3: '⭐ Indispensable' };
function lignesDemandees(texte) {
  return texte.split(/\n|;/).map(l => l.trim()).filter(Boolean).map((l, i) => {
    const m = l.match(/^(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(.+)$/i);
    return { brut: l, q: m ? Number(m[1].replace(',', '.')) : 1, nom: (m ? m[2] : l).replace(/!\s*$/, '').trim(), rang: i };
  });
}
async function calculerDevis({ budget, lignes, mode, ville, exclus = [] }) {
  const misDeCote = lignes.filter(l => exclus.includes(l.rang)); lignes = lignes.filter(l => !exclus.includes(l.rang));
  const cand = await Promise.all(lignes.map(l => db.rpc('chercher_prix', { p_produit: l.nom, p_magasin: ville || '', p_limite: 60 }).then(doux)));
  const items = lignes.map((l, i) => ({ ...l, offres: (cand[i] || []).filter(o => cle(o.produit).includes(cle(l.nom).split(' ')[0])) }));
  const trouves = items.filter(x => x.offres.length), introuvables = items.filter(x => !x.offres.length);
  let choix = [];
  if (mode === 'unique') {
    const mags = {}; trouves.forEach(x => x.offres.forEach(o => { (mags[o.magasin_id] ||= { nom: o.magasin, ville: o.ville, items: {} }); const cur = mags[o.magasin_id].items[x.rang]; if (!cur || o.prix < cur.prix) mags[o.magasin_id].items[x.rang] = o; }));
    const best = Object.entries(mags).map(([id, m]) => ({ id, ...m, n: Object.keys(m.items).length, total: trouves.reduce((s, x) => s + (m.items[x.rang] ? m.items[x.rang].prix * x.q : 0), 0) }))
      .sort((a, b) => b.n - a.n || a.total - b.total)[0];
    if (best) trouves.forEach(x => { const o = best.items[x.rang]; if (o) choix.push({ ...x, o }); else introuvables.push({ ...x, raison: `pas de prix connu chez ${best.nom}` }); });
  } else trouves.forEach(x => choix.push({ ...x, o: x.offres.slice().sort((a, b) => a.prix - b.prix)[0] }));
  choix.sort((a, b) => a.rang - b.rang);
  const total = choix.reduce((s, x) => s + x.o.prix * x.q, 0);
  choix.forEach(x => { x.niveau = niveau(x); x.montant = Math.round(x.o.prix * x.q * 100) / 100; });
  // Budget dépassé : rien n'est supprimé ; on PROPOSE les articles les moins nécessaires (puis les derniers de la liste) jusqu'à repasser sous le budget
  const depassement = Math.round((total - budget) * 100) / 100, propose = [];
  if (depassement > 0) { let ecart = depassement;
    for (const x of choix.slice().sort((a, b) => a.niveau - b.niveau || b.rang - a.rang)) { if (ecart <= 0) break; if (x.niveau === 3 && propose.length && ecart <= 0) break; propose.push(x.rang); ecart -= x.montant; } }
  const parMag = choix.reduce((m, x) => { const k = x.o.magasin + (x.o.ville ? ' · ' + x.o.ville : ''); (m[k] ||= []).push(x); return m; }, {});
  return { budget, total: Math.round(total * 100) / 100, reste: Math.round((budget - total) * 100) / 100, parMag, introuvables, misDeCote, mode, choix, depassement, propose };
}
async function ongletDevis(c) {
  const d = px.devis;
  c.innerHTML = `<div class="aj-grille"><div class="aj-col"><div class="carte"><h3>🧮 Mon budget et ma liste</h3><form id="f-dv">
      <div class="ligne"><div class="champ"><label>Budget (€) *</label><input name="budget" inputmode="decimal" required value="${d?.budget ?? ''}" placeholder="ex : 80"></div>
        <div class="champ"><label>Où ?</label><input name="ville" value="${esc(d?.ville || '')}" placeholder="Ville ou magasin (facultatif)"></div></div>
      <div class="champ"><label>Articles (un par ligne, quantité devant si besoin)</label><textarea name="articles" rows="8" placeholder="2 lait&#10;riz&#10;6 œufs&#10;poulet">${esc(d?.texte || '')}</textarea>
        <div class="barre-outils" style="margin-top:6px"><button type="button" class="btn btn-petit btn-fantome" id="dv-base">🧺 Panier de base</button><button type="button" class="btn btn-petit btn-fantome" id="dv-menu">🍽️ Manquants de mon menu</button><button type="button" class="btn btn-petit btn-fantome" id="dv-vider">Vider</button></div></div>
      <div class="champ"><label>Stratégie</label><select name="mode">${opts({ multi: 'Le moins cher article par article (plusieurs magasins)', unique: 'Tout dans un seul magasin (le moins cher)' }, d?.mode || 'multi')}</select></div>
      <p class="aide">Si le budget est dépassé, rien n'est supprimé : je vous signale le dépassement et vous propose les articles les moins nécessaires à retirer (plaisir d'abord, puis utile). Ajoutez « ! » en fin de ligne pour un article indispensable.</p>
      <button class="btn btn-primaire">🧮 Calculer le devis</button></form></div></div>
    <div class="aj-col" id="dv-res">${d?.res ? '' : '<div class="carte vide">Indiquez un budget et vos articles : je cherche les meilleurs prix dans la base commune et je vous prépare la liste avec magasins, prix et total.</div>'}</div></div>`;
  const f = $('#f-dv');
  const ajouter = (l) => { f.articles.value = (f.articles.value.trim() ? f.articles.value.trim() + '\n' : '') + l.join('\n'); };
  $('#dv-base').onclick = () => ajouter(PANIER_BASE);
  $('#dv-vider').onclick = () => { f.articles.value = ''; };
  $('#dv-menu').onclick = (e) => action(e.target, async () => { const m = A.manquantsMenuSemaine ? await A.manquantsMenuSemaine() : []; if (!m.length) return toast('Aucun manquant : proposez d\'abord un menu dans Cuisine.'); ajouter(m.map(x => (x.u === 'pièce' ? Math.ceil(x.q) + ' ' : '') + x.n)); });
  f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
    const budget = num(f, 'budget'); if (!(budget > 0)) throw new Error('Indiquez un budget.');
    const lignes = lignesDemandees(f.articles.value); if (!lignes.length) throw new Error('Ajoutez au moins un article (ou le panier de base).');
    const res = await calculerDevis({ budget, lignes, mode: val(f, 'mode'), ville: val(f, 'ville') });
    px.devis = { budget, texte: f.articles.value, mode: val(f, 'mode'), ville: val(f, 'ville'), exclus: [], lignes, res };
    afficherDevis($('#dv-res'), res);
  }); };
  if (d?.res) afficherDevis($('#dv-res'), d.res);
}
function afficherDevis(z, d) {
  const mags = Object.entries(d.parMag);
  z.innerHTML = `<div class="carte kpi principal rav ${d.reste < 0 ? 'negatif' : ''}"><div class="lib">Devis de courses · ${d.mode === 'unique' ? 'un seul magasin' : 'meilleur prix par article'}</div>
      <div class="val">${fmt(d.total)}</div><div class="det">budget ${fmt(d.budget)} · reste ${fmt(d.reste)}</div></div>
    ${mags.map(([m, l]) => `<div class="carte"><h3>🏪 ${esc(m)} <span class="aide" style="margin-left:auto">${fmt(l.reduce((s, x) => s + x.o.prix * x.q, 0))}</span></h3>
      <div class="tableau-wrap"><table><thead><tr><th>Article</th><th>Qté</th><th class="montant">Prix u.</th><th class="montant">Total</th></tr></thead><tbody>
      ${l.map(x => `<tr><td><b>${esc(x.o.produit)}</b><div class="aide">demandé : ${esc(x.nom)} · relevé le ${fmtDate(x.o.date_releve)}</div></td><td>${String(x.q).replace('.', ',')}</td><td class="montant">${fmt(x.o.prix)}</td><td class="montant">${fmt(x.o.prix * x.q)}</td></tr>`).join('')}</tbody></table></div></div>`).join('')}
    ${d.depassement > 0 ? `<div class="carte depasse"><h3>⚠️ Budget dépassé de ${fmt(d.depassement)}</h3>
      <p class="aide" style="margin-top:0">Rien n'a été supprimé. Voici les articles que je vous propose de retirer (cochés), classés du moins nécessaire au plus nécessaire. Cochez ou décochez, puis validez.</p>
      ${d.choix.slice().sort((a, b) => a.niveau - b.niveau || b.rang - a.rang).map(x => `<label class="case dv-choix"><input type="checkbox" value="${x.rang}" ${d.propose.includes(x.rang) ? 'checked' : ''} data-m="${x.montant}">
        <span>${esc(x.nom)} <span class="aide">${NIVEAUX[x.niveau]}</span></span><b style="margin-left:auto">${fmt(x.montant)}</b></label>`).join('')}
      <div class="barre-outils" style="margin-top:8px"><span id="dv-apres" class="aide"></span><span style="margin-left:auto"></span><button class="btn btn-primaire" id="dv-retirer">✂️ Retirer les articles cochés</button></div></div>` : ''}
    ${d.misDeCote?.length ? `<div class="alerte">✂️ Retirés à votre demande : ${d.misDeCote.map(x => esc(x.nom)).join(', ')} <button class="btn btn-petit btn-fantome" id="dv-remettre">↺ Tout remettre</button></div>` : ''}
    ${d.introuvables.length ? `<div class="carte"><h3>❓ Sans prix dans la base</h3><div class="aide">${d.introuvables.map(x => esc(x.nom) + (x.raison ? ' — ' + esc(x.raison) : '')).join(' · ')}</div><p class="aide">Ils seront ajoutés à la liste sans prix. Plus les utilisateurs scannent leurs tickets, plus la base est complète.</p></div>` : ''}
    <div class="barre-outils"><button class="btn btn-fantome" id="dv-pdf">🖨 PDF du devis</button><button class="btn btn-primaire" id="dv-listes">🛒 Créer ${mags.length > 1 ? 'les listes' : 'la liste'} de courses</button></div>`;
  const recalc = async (exclus) => { const D = px.devis; D.exclus = exclus; D.res = await calculerDevis({ budget: D.budget, lignes: D.lignes, mode: D.mode, ville: D.ville, exclus }); afficherDevis(z, D.res); };
  if (d.depassement > 0) {
    const maj = () => { const coches = $$('.dv-choix input:checked', z); const retire = coches.reduce((s, c) => s + Number(c.dataset.m), 0);
      $('#dv-apres', z).innerHTML = `Total après retrait : <b>${fmt(d.total - retire)}</b> · ${d.total - retire <= d.budget ? '<span style="color:var(--vert)">dans le budget ✓</span>' : `<span style="color:var(--rouge)">encore ${fmt(d.total - retire - d.budget)} au-dessus</span>`}`; };
    z.querySelectorAll('.dv-choix input').forEach(i => i.onchange = maj); maj();
    $('#dv-retirer', z).onclick = (e) => action(e.target, () => recalc([...(px.devis.exclus || []), ...$$('.dv-choix input:checked', z).map(i => +i.value)]));
  }
  if ($('#dv-remettre', z)) $('#dv-remettre', z).onclick = (e) => action(e.target, () => recalc([]));
  $('#dv-pdf', z).onclick = (e) => action(e.target, () => window.BFC_EXPORT.pdfTableau('Devis de courses', `Budget ${fmt(d.budget)} · total ${fmt(d.total)} · reste ${fmt(d.reste)}`, ['Magasin', 'Article', 'Qté', 'Prix u.', 'Total'],
    [...mags.flatMap(([m, l]) => l.map(x => [m, x.o.produit, String(x.q).replace('.', ','), fmt(x.o.prix), fmt(x.o.prix * x.q)])), ['', 'TOTAL', '', '', fmt(d.total)],
     ...(d.depassement > 0 ? [['Budget dépassé', `de ${fmt(d.depassement)}`, '', '', '']] : []), ...(d.misDeCote || []).map(x => ['Retiré', x.nom, '', '', '']), ...d.introuvables.map(x => ['Sans prix', x.nom, '', '', ''])], `Devis_courses_${auj()}.pdf`, [3, 4]));
  $('#dv-listes', z).onclick = (e) => action(e.target, async () => {
    const groupes = mags.length ? mags : [['Courses', []]];
    for (const [i, [m, l]] of groupes.entries()) {
      const liste = verifier(await db.from('listes_courses').insert({ titre: `Devis · ${m}`, statut: 'brouillon', date_prevue: auj(), lieu_paiement: m.split(' · ')[0], notes: `Devis budget ${fmt(d.budget)}` }).select().single(), 'Liste');
      const lignes = [...l.map((x, k) => ({ liste_id: liste.id, libelle: x.o.produit, quantite: x.q, prix_unitaire: x.o.prix, ordre: k })),
        ...(i === 0 ? d.introuvables.map((x, k) => ({ liste_id: liste.id, libelle: x.nom, quantite: x.q, ordre: 100 + k })) : [])];
      if (lignes.length) verifier(await db.from('lignes_courses').insert(lignes), 'Lignes');
    }
    toast(`${groupes.length} liste(s) de courses créée(s).`); location.hash = '#/courses';
  });
}
});
