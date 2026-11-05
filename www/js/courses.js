/* B-ForCompt@ — Courses : listes (faire maintenant / programmer), catalogue de produits avec photos,
   lecture des tickets, impression, création automatique de la dépense. Synchronisation en direct entre appareils. */
(window.BFC_MODULES = window.BFC_MODULES || []).push((A) => {
'use strict';
const { sb, db, C, R, $, $$, esc, fmt, fmtDate, auj, toast, verifier, action, val, num, uuid, nettoyerNom, ouvrirModale, fermerModale, confirmer, router, VUES, compteParId, tiersParId, optsListe, opts, MOYENS, TYPES_COMPTE } = A;
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const STATUTS = { brouillon: 'Brouillon', programmee: 'Programmée', en_cours: 'En cours', terminee: 'Terminée', annulee: 'Annulée' };
const RAYONS = ['Fruits & légumes', 'Boucherie & poissonnerie', 'Crèmerie & frais', 'Épicerie', 'Boissons', 'Surgelés', 'Boulangerie', 'Hygiène & beauté', 'Entretien', 'Bébé', 'Animaux', 'Autre'];
const UNITES = ['pièce', 'kg', 'g', 'L', 'paquet', 'lot', 'boîte', 'bouteille'];
const urls = new Map();
const jourDe = (d) => d ? JOURS[new Date(d + 'T12:00:00').getDay()] : '';
const vue = { onglet: 'listes', recherche: '' };
let produits = [];

async function signer(chemins) {
  const manque = [...new Set(chemins.filter(p => p && !urls.has(p)))]; if (!manque.length) return;
  const { data } = await sb.storage.from(C.bucketImages).createSignedUrls(manque, 43200);
  (data || []).forEach(d => d.signedUrl && urls.set(d.path, d.signedUrl));
}
async function chargerProduits() {
  produits = verifier(await db.from('produits').select('*').eq('actif', true).order('nom'), 'Produits');
  await signer(produits.map(p => p.photos?.[0]));
  return produits;
}
const magasins = () => R.tiers.filter(t => t.type !== 'client' && t.type !== 'salarie');
const photoProduit = (p, cls = 'vignette') => p?.photos?.[0] && urls.get(p.photos[0]) ? `<img class="${cls}" src="${esc(urls.get(p.photos[0]))}" alt="">` : `<span class="${cls}">🛒</span>`;
function compteParDefaut(moyen) {
  const actifs = R.comptes.filter(c => c.actif);
  if (moyen === 'especes') return actifs.find(c => c.type === 'especes')?.id;
  return (actifs.find(c => c.type === 'banque' && c.nature !== 'professionnel') || actifs.find(c => c.type === 'banque') || actifs[0])?.id;
}
const libCompte = (c) => `${c.type === 'especes' ? '💶 ' : '🏦 '}${c.nom}${c.nature && c.nature !== 'professionnel' ? ' · ' + (c.nature === 'joint' ? 'joint' : 'perso') : ''}`;

/* ================================================================ vue Courses */
VUES.courses = async (el) => {
  await chargerProduits();
  el.innerHTML = `
    <div class="tete-vue"><h1>🛒 Courses</h1><div class="actions">
      <button class="btn btn-fantome" id="co-scan">🧾 Lire un ticket / une facture</button>
      <button class="btn btn-bleu" id="co-prog">📅 Programmer des courses</button>
      <button class="btn btn-primaire" id="co-faire">🛒 Faire les courses</button></div></div>
    <div class="bascule" id="co-onglets" style="margin-bottom:14px">
      <button data-o="listes" class="${vue.onglet === 'listes' ? 'on' : ''}">Mes listes</button>
      <button data-o="produits" class="${vue.onglet === 'produits' ? 'on' : ''}">Produits (${produits.length})</button></div>
    <div id="co-contenu"></div>`;
  $('#co-onglets').onclick = (e) => { const b = e.target.closest('button'); if (b) { vue.onglet = b.dataset.o; router(); } };
  $('#co-faire').onclick = () => nouvelleListe('en_cours');
  $('#co-prog').onclick = () => nouvelleListe('programmee');
  $('#co-scan').onclick = () => scannerTicket(null);
  return vue.onglet === 'produits' ? ongletProduits($('#co-contenu')) : ongletListes($('#co-contenu'));
};

async function ongletListes(c) {
  const listes = verifier(await db.from('listes_courses').select('*, lignes_courses(id, achete)').order('date_prevue', { ascending: false }).limit(200), 'Listes');
  const groupes = [['en_cours', '🛒 En cours'], ['programmee', '📅 Programmées'], ['brouillon', '📝 Brouillons'], ['terminee', '✅ Terminées']];
  c.innerHTML = groupes.map(([s, titre]) => { const l = listes.filter(x => x.statut === s); if (!l.length && s !== 'en_cours' && s !== 'programmee') return '';
    return `<div class="carte" style="margin-bottom:14px"><h3>${titre} (${l.length})</h3>${l.length ? `<div class="grille g3">${l.map(x => {
      const n = x.lignes_courses?.length || 0, ok = x.lignes_courses?.filter(y => y.achete).length || 0, co = compteParId(x.compte_id), ma = tiersParId(x.magasin_id);
      return `<div class="carte liste-carte" data-id="${x.id}" style="cursor:pointer;box-shadow:none">
        <div class="avec-image">${A.vignette(ma?.image_id, ma?.nom || '🛒')}<div><b>${esc(x.titre)}</b><div class="aide">${esc(ma?.nom || 'Magasin à choisir')}</div></div></div>
        <div class="aide" style="margin-top:6px">📅 ${esc(jourDe(x.date_prevue))} ${fmtDate(x.date_prevue)}${x.heure_prevue ? ' · ' + x.heure_prevue.slice(0, 5) : ''}</div>
        <div class="aide">${co ? esc(libCompte(co)) : 'Compte à choisir'} · ${MOYENS[x.moyen_paiement] || ''}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px"><span class="aide">${ok}/${n} article(s)</span>
          <b style="color:var(--marine)">${fmt(x.statut === 'terminee' ? (x.total_paye ?? x.total_estime) : x.total_estime)}</b></div>
        ${n ? `<div style="background:var(--bleu-clair);height:6px;border-radius:9px;overflow:hidden;margin-top:6px"><div style="width:${Math.round(ok / n * 100)}%;height:100%;background:var(--vert)"></div></div>` : ''}</div>`; }).join('')}</div>`
      : `<p class="aide">Aucune liste. Utilisez « ${s === 'en_cours' ? 'Faire les courses' : 'Programmer des courses'} ».</p>`}</div>`; }).join('');
  c.onclick = (e) => { const k = e.target.closest('.liste-carte'); if (k) ouvrirListe(k.dataset.id); };
}

/* ================================================================ produits */
function ongletProduits(c) {
  const rendre = () => {
    const q = vue.recherche.toLowerCase();
    const l = produits.filter(p => !q || [p.nom, p.marque, p.rayon].some(x => (x || '').toLowerCase().includes(q)));
    $('#pr-galerie').innerHTML = l.map(p => `<div class="tuile" data-id="${p.id}" style="cursor:pointer">${p.photos?.[0] && urls.get(p.photos[0]) ? `<img src="${esc(urls.get(p.photos[0]))}" alt="" loading="lazy">` : '<div style="aspect-ratio:1;display:grid;place-items:center;font-size:2.4rem;background:var(--ciel)">🛒</div>'}
      <div class="info"><b>${esc(p.nom)}</b><span class="aide">${esc([p.marque, p.rayon].filter(Boolean).join(' · '))}</span>
      <div style="display:flex;justify-content:space-between;margin-top:4px"><b style="color:var(--orange)">${p.prix_habituel != null ? fmt(p.prix_habituel) : '—'}</b><span class="aide">${esc(p.unite)}</span></div></div></div>`).join('')
      || '<p class="vide">Aucun produit. Ajoutez-en, ou terminez une liste : les articles achetés entrent automatiquement dans le catalogue.</p>';
  };
  c.innerHTML = `<div class="carte"><div class="filtres"><div style="flex:3"><label>Rechercher</label><input id="pr-q" value="${esc(vue.recherche)}" placeholder="Nom, marque, rayon…"></div>
    <div style="flex:0"><label>&nbsp;</label><button class="btn btn-primaire" id="pr-ajout">＋ Produit</button></div></div><div class="galerie" id="pr-galerie"></div></div>`;
  rendre();
  $('#pr-q').oninput = (e) => { vue.recherche = e.target.value; rendre(); };
  $('#pr-ajout').onclick = () => formProduit({});
  $('#pr-galerie').onclick = (e) => { const t = e.target.closest('.tuile[data-id]'); if (t) formProduit(produits.find(p => p.id === t.dataset.id)); };
}

async function envoyerPhoto(fichier) {
  const chemin = `produits/${uuid()}-${nettoyerNom(fichier.name || 'photo.jpg')}`;
  const up = await sb.storage.from(C.bucketImages).upload(chemin, await reduire(fichier), { contentType: 'image/jpeg' });
  if (up.error) throw new Error('Photo : ' + up.error.message);
  return chemin;
}
/* réduit les photos de téléphone (souvent 4 à 12 Mo) à 1600 px max */
async function reduire(fichier) {
  if (!/^image\//.test(fichier.type) || /svg|gif/.test(fichier.type)) return fichier;
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(fichier); });
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return new Promise(ok => cv.toBlob(b => ok(b || fichier), 'image/jpeg', 0.85));
}
const champsPhoto = (nom) => `<div style="display:flex;gap:8px;flex-wrap:wrap">
  <label class="btn btn-bleu btn-petit" style="margin:0">📷 Prendre une photo<input type="file" name="${nom}" accept="image/*" capture="environment" hidden></label>
  <label class="btn btn-fantome btn-petit" style="margin:0">🖼️ Choisir dans la galerie<input type="file" name="${nom}_galerie" accept="image/*" multiple hidden></label></div>`;

function formProduit(p, apres) {
  const neuf = !p.id; let photos = [...(p.photos || [])];
  ouvrirModale(neuf ? 'Nouveau produit' : p.nom, `<form id="f-pr">
    <div class="champ"><label>Photos</label><div id="pr-photos" class="choix-images" style="max-height:none"></div>${champsPhoto('photo')}</div>
    <div class="ligne"><div class="champ"><label>Nom *</label><input name="nom" required value="${esc(p.nom || '')}"></div>
      <div class="champ"><label>Marque</label><input name="marque" value="${esc(p.marque || '')}"></div></div>
    <div class="ligne3"><div class="champ"><label>Rayon</label><select name="rayon"><option value="">—</option>${RAYONS.map(r => `<option ${r === p.rayon ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="champ"><label>Unité</label><select name="unite">${UNITES.map(u => `<option ${u === (p.unite || 'pièce') ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      <div class="champ"><label>Prix habituel (€)</label><input name="prix_habituel" inputmode="decimal" value="${p.prix_habituel ?? ''}"></div></div>
    <div class="ligne"><div class="champ"><label>Magasin habituel</label><select name="magasin_habituel_id">${optsListe(magasins(), p.magasin_habituel_id, '—')}</select></div>
      <div class="champ"><label>Code-barres</label><input name="code_barres" inputmode="numeric" value="${esc(p.code_barres || '')}"></div></div>
    <div class="champ"><label>Détails (contenance, variété, remarques…)</label><textarea name="details" rows="3">${esc(p.details || '')}</textarea></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="pr-suppr">Supprimer</button>'}
      <button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    const f = $('#f-pr', m);
    const rendrePhotos = () => { $('#pr-photos', m).innerHTML = photos.map((ph, i) => `<button type="button" data-i="${i}" title="Retirer"><img src="${esc(urls.get(ph) || '')}" alt="">✕ retirer</button>`).join('') || '<span class="aide" style="padding:8px">Aucune photo</span>'; };
    rendrePhotos();
    $('#pr-photos', m).onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) { photos.splice(+b.dataset.i, 1); rendrePhotos(); } };
    const ajouter = async (liste) => { for (const fi of liste) { const ch = await envoyerPhoto(fi); await signer([ch]); photos.push(ch); } rendrePhotos(); };
    f.photo.onchange = () => action(null, () => ajouter([...f.photo.files]));
    f.photo_galerie.onchange = () => action(null, () => ajouter([...f.photo_galerie.files]));
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { nom: val(f, 'nom'), marque: val(f, 'marque'), rayon: val(f, 'rayon'), unite: val(f, 'unite'), prix_habituel: num(f, 'prix_habituel'),
        magasin_habituel_id: val(f, 'magasin_habituel_id'), code_barres: val(f, 'code_barres'), details: val(f, 'details'), photos };
      const r = verifier(neuf ? await db.from('produits').insert(rec).select().single() : await db.from('produits').update(rec).eq('id', p.id).select().single(), 'Produit');
      fermerModale(); toast('Produit enregistré.'); apres ? apres(r) : router();
    }); };
    if (!neuf) $('#pr-suppr', m).onclick = (e) => action(e.target, async () => {
      if (!await confirmer('Retirer ce produit du catalogue ?')) return;
      verifier(await db.from('produits').update({ actif: false }).eq('id', p.id)); fermerModale(); router();
    });
  });
}

/* ================================================================ listes */
async function nouvelleListe(statut, base = {}) {
  const demain = new Date(); demain.setDate(demain.getDate() + 1);
  const date = statut === 'programmee' ? `${demain.getFullYear()}-${String(demain.getMonth() + 1).padStart(2, '0')}-${String(demain.getDate()).padStart(2, '0')}` : auj();
  const moyen = base.moyen_paiement || 'carte';
  const l = verifier(await db.from('listes_courses').insert({ titre: base.titre || (statut === 'programmee' ? 'Courses prévues' : 'Courses du ' + fmtDate(auj())), statut,
    date_prevue: base.date_prevue || date, moyen_paiement: moyen, compte_id: base.compte_id || compteParDefaut(moyen), magasin_id: base.magasin_id || null,
    lieu_paiement: base.lieu_paiement || null }).select().single(), 'Nouvelle liste');
  if (base.articles?.length) verifier(await db.from('lignes_courses').insert(base.articles.map((a, i) => ({ liste_id: l.id, libelle: a.libelle, quantite: a.quantite || 1, prix_unitaire: a.prix_unitaire, produit_id: a.produit_id || null, achete: !!a.achete, ordre: i }))));
  await ouvrirListe(l.id);
}

let canalListe = null;
async function ouvrirListe(id) {
  const charger = async () => {
    const l = verifier(await db.from('listes_courses').select('*').eq('id', id).single(), 'Liste');
    const lignes = verifier(await db.from('lignes_courses').select('*').eq('liste_id', id).order('achete').order('ordre').order('libelle'), 'Lignes');
    return { l, lignes };
  };
  let { l, lignes } = await charger();
  if (!produits.length) await chargerProduits();
  const fini = l.statut === 'terminee';
  ouvrirModale(`🛒 ${l.titre}`, `<form id="f-li">
    <div class="ligne"><div class="champ"><label>Titre</label><input name="titre" value="${esc(l.titre)}" ${fini ? 'disabled' : ''}></div>
      <div class="champ"><label>Statut</label><select name="statut" ${fini ? 'disabled' : ''}>${opts(fini ? STATUTS : { brouillon: 'Brouillon', programmee: 'Programmée', en_cours: 'En cours', annulee: 'Annulée' }, l.statut)}</select></div></div>
    <div class="ligne3"><div class="champ"><label>Date</label><input type="date" name="date_prevue" value="${l.date_prevue}" ${fini ? 'disabled' : ''}><div class="aide" id="li-jour" style="text-transform:capitalize">${jourDe(l.date_prevue)}</div></div>
      <div class="champ"><label>Heure</label><input type="time" name="heure_prevue" value="${(l.heure_prevue || '').slice(0, 5)}" ${fini ? 'disabled' : ''}></div>
      <div class="champ"><label>Lieu d'achat (magasin)</label><select name="magasin_id" ${fini ? 'disabled' : ''}>${optsListe(magasins(), l.magasin_id, '—')}</select><div class="aide"><a href="#" id="li-nv-mag">＋ nouveau magasin</a></div></div></div>
    <div class="ligne3"><div class="champ"><label>Payé avec</label><select name="moyen_paiement" ${fini ? 'disabled' : ''}>${opts(MOYENS, l.moyen_paiement)}</select></div>
      <div class="champ"><label>Compte débité</label><select name="compte_id" ${fini ? 'disabled' : ''}>${optsListe(R.comptes.filter(c => c.actif || c.id === l.compte_id), l.compte_id, 'Choisir…', libCompte)}</select></div>
      <div class="champ"><label>Lieu de paiement</label><input name="lieu_paiement" list="li-lieux" value="${esc(l.lieu_paiement || '')}" placeholder="Caisse, drive, en ligne, ville…" ${fini ? 'disabled' : ''}>
        <datalist id="li-lieux"><option>Caisse du magasin</option><option>Caisse automatique</option><option>Drive</option><option>En ligne</option><option>Livraison</option><option>Marché</option></datalist></div></div>
    ${fini ? '' : `<div class="champ"><label>Ajouter un article</label><div style="display:flex;gap:8px"><input id="li-q" list="li-produits" placeholder="Tapez un produit du catalogue ou un nouvel article…" autocomplete="off">
      <button type="button" class="btn btn-bleu btn-petit" id="li-ajout">＋</button><button type="button" class="btn btn-fantome btn-petit" id="li-catalogue">📚 Catalogue</button></div>
      <datalist id="li-produits">${produits.map(p => `<option value="${esc(p.nom)}">${p.prix_habituel != null ? fmt(p.prix_habituel) : ''}</option>`).join('')}</datalist></div>`}
    <div class="tableau-wrap"><table class="lignes-courses"><thead><tr><th style="width:34px">✓</th><th>Article</th><th style="width:74px">Qté</th><th style="width:96px">Prix unit.</th><th class="montant" style="width:90px">Total</th><th style="width:30px"></th></tr></thead><tbody id="li-lignes"></tbody></table></div>
    <div id="li-total" style="text-align:right;font-weight:900;font-size:1.1rem;margin:10px 0;color:var(--marine)"></div>
    <div class="champ"><label>Notes</label><textarea name="notes" rows="2" ${fini ? 'disabled' : ''}>${esc(l.notes || '')}</textarea></div>
    ${l.operation_id ? `<div class="alerte" style="background:var(--vert-clair);border-color:#b6e3c4;color:var(--vert)">✅ Dépense enregistrée : ${fmt(l.total_paye ?? l.total_estime)} sur ${esc(compteParId(l.compte_id)?.nom || '')}. Elle est comptée dans les dépenses et le solde du compte.</div>` : ''}
    <div class="modale-pied">
      <button type="button" class="btn btn-danger gauche" id="li-suppr">Supprimer</button>
      <button type="button" class="btn btn-fantome" id="li-pdf">🖨 Imprimer / PDF</button>
      ${fini ? '' : `<button type="button" class="btn btn-fantome" id="li-ticket">🧾 Lire le ticket</button>
      <button type="button" class="btn btn-fantome" id="li-enreg">💾 Enregistrer</button>
      <button type="button" class="btn btn-primaire" id="li-terminer">✅ Courses terminées</button>`}
      ${fini ? '<button type="button" class="btn btn-bleu" id="li-refaire">🔁 Refaire cette liste</button>' : ''}</div></form>`, (m) => {
    const f = $('#f-li', m);
    const total = () => lignes.reduce((a, x) => a + Number(x.quantite || 0) * Number(x.prix_unitaire || 0), 0);
    const rendre = () => {
      $('#li-lignes', m).innerHTML = lignes.map(x => { const p = produits.find(y => y.id === x.produit_id);
        return `<tr data-id="${x.id}" class="${x.achete ? 'achete' : ''}"><td><input type="checkbox" data-k="achete" ${x.achete ? 'checked' : ''} ${fini ? 'disabled' : ''} style="width:22px;height:22px"></td>
        <td><div class="avec-image">${photoProduit(p)}<div><b>${esc(x.libelle)}</b>${p?.details ? `<div class="aide">${esc(p.details.slice(0, 60))}</div>` : ''}</div></div></td>
        <td><input data-k="quantite" inputmode="decimal" value="${Number(x.quantite)}" ${fini ? 'disabled' : ''}></td>
        <td><input data-k="prix_unitaire" inputmode="decimal" value="${x.prix_unitaire ?? ''}" placeholder="—" ${fini ? 'disabled' : ''}></td>
        <td class="montant">${fmt(Number(x.quantite || 0) * Number(x.prix_unitaire || 0))}</td>
        <td>${fini ? '' : '<button type="button" class="btn-x" data-suppr title="Retirer">×</button>'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="vide">Liste vide : ajoutez des articles.</td></tr>';
      const n = lignes.length, ok = lignes.filter(x => x.achete).length;
      $('#li-total', m).innerHTML = `${ok}/${n} acheté(s) · Total ${fini ? 'payé' : 'estimé'} : <span style="color:var(--orange)">${fmt(fini ? (l.total_paye ?? total()) : total())}</span>`;
    };
    rendre();
    const majLigne = async (lid, champs) => { verifier(await db.from('lignes_courses').update(champs).eq('id', lid)); };
    $('#li-lignes', m).addEventListener('change', (e) => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; const x = lignes.find(y => y.id === tr.dataset.id); const k = e.target.dataset.k;
      const v = k === 'achete' ? e.target.checked : Number(String(e.target.value).replace(',', '.')) || (k === 'quantite' ? 1 : null);
      x[k] = v; rendre(); action(null, () => majLigne(x.id, { [k]: v })); });
    $('#li-lignes', m).addEventListener('click', (e) => { const b = e.target.closest('[data-suppr]'); if (!b) return; const tr = b.closest('tr'); lignes = lignes.filter(y => y.id !== tr.dataset.id); rendre();
      action(null, async () => verifier(await db.from('lignes_courses').delete().eq('id', tr.dataset.id))); });
    f.date_prevue && (f.date_prevue.onchange = () => { $('#li-jour', m).textContent = jourDe(f.date_prevue.value); });
    f.moyen_paiement && (f.moyen_paiement.onchange = () => { const c = compteParDefaut(f.moyen_paiement.value); if (f.moyen_paiement.value === 'especes' && c) f.compte_id.value = c; });
    const ajouterArticle = async (libelle, produit) => {
      const p = produit || produits.find(y => y.nom.toLowerCase() === libelle.toLowerCase());
      const x = verifier(await db.from('lignes_courses').insert({ liste_id: id, libelle: p?.nom || libelle, produit_id: p?.id || null, quantite: 1, unite: p?.unite, prix_unitaire: p?.prix_habituel ?? null, ordre: lignes.length }).select().single());
      lignes.push(x); rendre();
    };
    if (!fini) {
      $('#li-ajout', m).onclick = () => { const v = $('#li-q', m).value.trim(); if (!v) return; $('#li-q', m).value = ''; action(null, () => ajouterArticle(v)); };
      $('#li-q', m).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#li-ajout', m).click(); } };
      $('#li-catalogue', m).onclick = () => choisirProduits(m, async (choix) => { for (const p of choix) await ajouterArticle(p.nom, p); });
      $('#li-nv-mag', m).onclick = (e) => { e.preventDefault(); const nom = prompt('Nom du magasin (ex : Carrefour Destreland)'); if (!nom) return;
        action(null, async () => { const t = verifier(await db.from('tiers').insert({ nom: nom.trim(), type: 'fournisseur', categorie_defaut_id: R.categories.find(c => /courses/i.test(c.nom))?.id }).select().single());
          await A.chargerReferentiels(); f.magasin_id.insertAdjacentHTML('beforeend', `<option value="${t.id}" selected>${esc(t.nom)}</option>`); f.magasin_id.value = t.id; }); };
      const enteteDonnees = () => ({ titre: val(f, 'titre') || 'Courses', statut: val(f, 'statut'), date_prevue: val(f, 'date_prevue'), heure_prevue: val(f, 'heure_prevue'), magasin_id: val(f, 'magasin_id'),
        moyen_paiement: val(f, 'moyen_paiement'), compte_id: val(f, 'compte_id'), lieu_paiement: val(f, 'lieu_paiement'), notes: val(f, 'notes') });
      $('#li-enreg', m).onclick = (e) => action(e.currentTarget, async () => { verifier(await db.from('listes_courses').update(enteteDonnees()).eq('id', id)); toast('Liste enregistrée.'); fermerModale(); router(); });
      $('#li-ticket', m).onclick = () => scannerTicket({ id, lignes, appliquer: async (r) => {
        const h = enteteDonnees();
        if (r.date) f.date_prevue.value = r.date; if (r.heure) f.heure_prevue.value = r.heure; if (r.moyen) { f.moyen_paiement.value = r.moyen; f.moyen_paiement.onchange(); }
        if (r.magasin_id) f.magasin_id.value = r.magasin_id;
        verifier(await db.from('listes_courses').update({ ...h, ...enteteDonnees(), total_paye: r.total || null, document_id: r.document_id || l.document_id }).eq('id', id));
        l.total_paye = r.total; l.document_id = r.document_id || l.document_id;
        for (const a of r.articles) {
          const ex = lignes.find(y => y.libelle.toLowerCase() === a.libelle.toLowerCase() || (y.produit_id && produits.find(p => p.id === y.produit_id)?.nom.toLowerCase() === a.libelle.toLowerCase()));
          if (ex) { Object.assign(ex, { prix_unitaire: a.prix_unitaire, quantite: a.quantite, achete: true }); await majLigne(ex.id, { prix_unitaire: a.prix_unitaire, quantite: a.quantite, achete: true }); }
          else lignes.push(verifier(await db.from('lignes_courses').insert({ liste_id: id, libelle: a.libelle, quantite: a.quantite, prix_unitaire: a.prix_unitaire, achete: true, ordre: lignes.length }).select().single()));
        }
        rendre(); toast(`Ticket lu : ${r.articles.length} article(s)${r.total ? ', total ' + fmt(r.total) : ''}. Vérifiez puis cliquez « Courses terminées ».`);
      } });
      $('#li-terminer', m).onclick = (e) => action(e.currentTarget, async () => {
        const h = enteteDonnees();
        if (!h.compte_id) throw new Error('Choisissez le compte débité (banque ou caisse espèces).');
        const montant = Math.round(Number(l.total_paye || total()) * 100) / 100;
        if (!(montant > 0)) throw new Error('Indiquez les prix des articles (ou lisez le ticket) pour calculer le montant.');
        if (!await confirmer(`Enregistrer la dépense de ${fmt(montant)} sur « ${compteParId(h.compte_id)?.nom} » ?`)) return;
        const mag = tiersParId(h.magasin_id);
        const op = verifier(await db.from('operations').insert({ type: 'depense', montant, date_operation: h.date_prevue, libelle: `Courses${mag ? ' – ' + mag.nom : ''}`,
          compte_id: h.compte_id, moyen_paiement: h.moyen_paiement, tiers_id: h.magasin_id, categorie_id: R.categories.find(c => c.type === 'depense' && /courses/i.test(c.nom))?.id || mag?.categorie_defaut_id || null,
          notes: [h.lieu_paiement ? 'Lieu de paiement : ' + h.lieu_paiement : '', `${lignes.length} article(s) : ` + lignes.map(x => x.libelle).join(', ')].filter(Boolean).join('\n').slice(0, 2000) }).select().single(), 'Dépense');
        if (l.document_id) await db.from('documents').update({ operation_id: op.id, compte_id: h.compte_id }).eq('id', l.document_id);
        verifier(await db.from('listes_courses').update({ ...h, statut: 'terminee', total_paye: montant, operation_id: op.id }).eq('id', id));
        // catalogue : met à jour les prix et ajoute les nouveaux articles
        for (const x of lignes.filter(y => y.prix_unitaire)) {
          if (x.produit_id) await db.from('produits').update({ prix_habituel: x.prix_unitaire, magasin_habituel_id: h.magasin_id || undefined }).eq('id', x.produit_id);
          else { const p = await db.from('produits').insert({ nom: x.libelle, prix_habituel: x.prix_unitaire, magasin_habituel_id: h.magasin_id, unite: x.unite || 'pièce' }).select().single();
            if (p.data) await db.from('lignes_courses').update({ produit_id: p.data.id }).eq('id', x.id); }
        }
        fermerModale(); toast(`Dépense de ${fmt(montant)} enregistrée : elle est comptée dans vos dépenses.`); router();
      });
    }
    $('#li-pdf', m).onclick = (e) => action(e.currentTarget, () => window.BFC_EXPORT.pdfListeCourses({ ...l, titre: f.titre?.value || l.titre }, lignes, { magasin: tiersParId(f.magasin_id.value)?.nom, compte: compteParId(f.compte_id.value)?.nom, moyen: MOYENS[f.moyen_paiement.value], jour: jourDe(f.date_prevue.value) }));
    $('#li-suppr', m).onclick = (e) => action(e.currentTarget, async () => {
      if (!await confirmer(l.operation_id ? 'Supprimer la liste ? (la dépense déjà enregistrée est conservée)' : 'Supprimer cette liste ?')) return;
      verifier(await db.from('listes_courses').delete().eq('id', id)); fermerModale(); router();
    });
    $('#li-refaire', m)?.addEventListener('click', () => { fermerModale(); nouvelleListe('programmee', { titre: l.titre, magasin_id: l.magasin_id, compte_id: l.compte_id, moyen_paiement: l.moyen_paiement, lieu_paiement: l.lieu_paiement,
      articles: lignes.map(x => ({ libelle: x.libelle, quantite: x.quantite, prix_unitaire: x.prix_unitaire, produit_id: x.produit_id })) }); });
    // synchronisation en direct : l'autre téléphone voit les articles cochés / ajoutés
    if (canalListe) sb.removeChannel(canalListe);
    canalListe = sb.channel('liste-' + id).on('postgres_changes', { event: '*', schema: C.structure, table: 'lignes_courses', filter: `liste_id=eq.${id}` }, async () => {
      if ($('#modale').hidden) { sb.removeChannel(canalListe); canalListe = null; return; }
      const r = await charger(); lignes = r.lignes; rendre();
    }).subscribe();
  });
}

/* Sélection multiple dans le catalogue (avec photos) */
function choisirProduits(parent, ok) {
  const fond = document.createElement('div'); fond.className = 'sous-modale';
  fond.innerHTML = `<div class="sous-modale-boite"><div class="modale-tete"><h2>📚 Catalogue</h2><button class="btn-x" data-x>×</button></div>
    <div class="modale-corps"><input id="cp-q" placeholder="Rechercher…" style="margin-bottom:10px"><div class="galerie" id="cp-g"></div>
    <div class="modale-pied"><button class="btn btn-fantome" data-x>Annuler</button><button class="btn btn-primaire" id="cp-ok">Ajouter la sélection</button></div></div></div>`;
  document.body.append(fond);
  const sel = new Set();
  const rendre = (q = '') => { $('#cp-g', fond).innerHTML = produits.filter(p => !q || p.nom.toLowerCase().includes(q.toLowerCase())).map(p => `<div class="tuile ${sel.has(p.id) ? 'choisie' : ''}" data-id="${p.id}" style="cursor:pointer">
    ${p.photos?.[0] && urls.get(p.photos[0]) ? `<img src="${esc(urls.get(p.photos[0]))}" alt="">` : '<div style="aspect-ratio:1;display:grid;place-items:center;font-size:2rem;background:var(--ciel)">🛒</div>'}
    <div class="info"><b>${esc(p.nom)}</b><span class="aide">${p.prix_habituel != null ? fmt(p.prix_habituel) : ''}</span></div></div>`).join('') || '<p class="vide">Catalogue vide.</p>'; };
  rendre();
  $('#cp-q', fond).oninput = (e) => rendre(e.target.value);
  $('#cp-g', fond).onclick = (e) => { const t = e.target.closest('[data-id]'); if (!t) return; sel.has(t.dataset.id) ? sel.delete(t.dataset.id) : sel.add(t.dataset.id); t.classList.toggle('choisie'); };
  fond.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) fond.remove(); });
  $('#cp-ok', fond).onclick = () => { const choix = produits.filter(p => sel.has(p.id)); fond.remove(); action(null, () => ok(choix)); };
}

/* ================================================================ lecture d'un ticket / d'une facture */
function scannerTicket(cible) {
  const fond = document.createElement('div'); fond.className = 'sous-modale';
  fond.innerHTML = `<div class="sous-modale-boite"><div class="modale-tete"><h2>🧾 Lire un ticket ou une facture</h2><button class="btn-x" data-x>×</button></div><div class="modale-corps">
    <p class="aide" style="margin-top:0">Photographiez le ticket bien à plat et lisible, ou choisissez une facture PDF. L'appli lit le magasin, la date, l'heure, les articles, le total et le moyen de paiement ; vous vérifiez avant d'enregistrer.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <label class="btn btn-primaire" style="margin:0">📷 Photographier le ticket<input type="file" id="tk-photo" accept="image/*" capture="environment" hidden></label>
      <label class="btn btn-fantome" style="margin:0">📄 Choisir une photo ou un PDF<input type="file" id="tk-fichier" accept="image/*,application/pdf" hidden></label></div>
    <div id="tk-etat" style="margin-top:12px"></div></div></div>`;
  document.body.append(fond);
  fond.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) fond.remove(); });
  const traiter = async (fi) => {
    if (!fi) return;
    const etat = $('#tk-etat', fond);
    etat.innerHTML = '<div class="chargement">Lecture du document… <b id="tk-pc">0 %</b><div class="aide">La première lecture télécharge le module de lecture (quelques secondes).</div></div>';
    try {
      const r = await window.BFC_TICKET.lireDocument(fi, R.tiers, (p) => { const b = $('#tk-pc', fond); if (b) b.textContent = p + ' %'; });
      // le document est conservé comme justificatif
      const d = new Date(); const chemin = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${uuid()}-${nettoyerNom(fi.name || 'ticket.jpg')}`;
      const up = await sb.storage.from(C.bucketDocuments).upload(chemin, /^image\//.test(fi.type) ? await reduire(fi) : fi, { contentType: /^image\//.test(fi.type) ? 'image/jpeg' : fi.type });
      if (!up.error) r.document_id = verifier(await db.from('documents').insert({ type: 'ticket', nom_fichier: fi.name || 'ticket.jpg', storage_path: chemin, mime_type: fi.type, taille_octets: fi.size, date_document: r.date, montant: r.total, tiers_id: r.magasin_id }).select('id').single()).id;
      afficher(r);
    } catch (e) { etat.innerHTML = `<div class="alerte">${esc(e.message || String(e))}</div>`; }
  };
  $('#tk-photo', fond).onchange = (e) => traiter(e.target.files[0]);
  $('#tk-fichier', fond).onchange = (e) => traiter(e.target.files[0]);
  const afficher = (r) => {
    $('#tk-etat', fond).innerHTML = `<div class="ligne3"><div class="champ"><label>Magasin</label><select id="tk-mag">${optsListe(magasins(), r.magasin_id, r.magasin ? 'Nouveau : ' + r.magasin : '—')}</select></div>
      <div class="champ"><label>Date</label><input type="date" id="tk-date" value="${r.date || auj()}"></div><div class="champ"><label>Heure</label><input type="time" id="tk-heure" value="${r.heure || ''}"></div></div>
      <div class="ligne3"><div class="champ"><label>Payé avec</label><select id="tk-moyen">${opts(MOYENS, r.moyen || 'carte')}</select></div>
        <div class="champ"><label>Compte débité</label><select id="tk-compte">${optsListe(R.comptes.filter(c => c.actif), compteParDefaut(r.moyen || 'carte'), 'Choisir…', libCompte)}</select></div>
        <div class="champ"><label>Total payé (€)</label><input id="tk-total" inputmode="decimal" value="${r.total ?? ''}"></div></div>
      <label>Articles reconnus (${r.articles.length})</label>
      <div class="tableau-wrap" style="max-height:260px;overflow:auto"><table><tbody id="tk-art">${r.articles.map((a, i) => `<tr><td><input data-i="${i}" data-k="libelle" value="${esc(a.libelle)}"></td><td style="width:70px"><input data-i="${i}" data-k="quantite" value="${a.quantite}"></td><td style="width:90px"><input data-i="${i}" data-k="prix_unitaire" value="${a.prix_unitaire}"></td><td><button class="btn-x" data-retirer="${i}">×</button></td></tr>`).join('') || '<tr><td class="vide">Aucun article reconnu : vous pourrez les saisir à la main.</td></tr>'}</tbody></table></div>
      <details style="margin-top:8px"><summary class="aide">Texte lu (pour vérifier)</summary><pre style="white-space:pre-wrap;font-size:.75rem;max-height:160px;overflow:auto">${esc(r.texte)}</pre></details>
      <div class="modale-pied"><button class="btn btn-fantome" data-x>Annuler</button><button class="btn btn-primaire" id="tk-ok">${cible ? 'Remplir la liste' : 'Créer la liste et la dépense'}</button></div>`;
    const tb = $('#tk-art', fond);
    tb.oninput = (e) => { const i = e.target.dataset.i; if (i == null) return; const k = e.target.dataset.k; r.articles[i][k] = k === 'libelle' ? e.target.value : Number(String(e.target.value).replace(',', '.')) || 0; };
    tb.onclick = (e) => { const b = e.target.closest('[data-retirer]'); if (b) { r.articles.splice(+b.dataset.retirer, 1); b.closest('tr').remove(); } };
    $('#tk-moyen', fond).onchange = (e) => { if (e.target.value === 'especes') $('#tk-compte', fond).value = compteParDefaut('especes') || ''; };
    $('#tk-ok', fond).onclick = (e) => action(e.currentTarget, async () => {
      let magasin_id = $('#tk-mag', fond).value || null;
      if (!magasin_id && r.magasin) { magasin_id = verifier(await db.from('tiers').insert({ nom: r.magasin.slice(0, 60), type: 'fournisseur', categorie_defaut_id: R.categories.find(c => /courses/i.test(c.nom))?.id }).select().single()).id; await A.chargerReferentiels(); }
      const res = { ...r, magasin_id, date: $('#tk-date', fond).value, heure: $('#tk-heure', fond).value || null, moyen: $('#tk-moyen', fond).value, total: Number(String($('#tk-total', fond).value).replace(',', '.')) || null };
      fond.remove();
      if (cible) return cible.appliquer(res);
      const l = verifier(await db.from('listes_courses').insert({ titre: `Courses${tiersParId(magasin_id) ? ' ' + tiersParId(magasin_id).nom : ''} du ${fmtDate(res.date)}`, statut: 'en_cours', date_prevue: res.date,
        heure_prevue: res.heure, magasin_id, moyen_paiement: res.moyen, compte_id: $('#tk-compte', fond)?.value || compteParDefaut(res.moyen), total_paye: res.total, document_id: r.document_id }).select().single());
      if (res.articles.length) verifier(await db.from('lignes_courses').insert(res.articles.map((a, i) => ({ liste_id: l.id, libelle: a.libelle, quantite: a.quantite, prix_unitaire: a.prix_unitaire, achete: true, ordre: i }))));
      toast('Ticket enregistré dans une liste : vérifiez puis cliquez « Courses terminées » pour créer la dépense.');
      vue.onglet = 'listes'; await router(); ouvrirListe(l.id);
    });
  };
}

/* ================================================================ synchronisation en direct (tous écrans) */
let attente = null;
const rafraichir = () => { clearTimeout(attente); attente = setTimeout(() => { if ($('#modale').hidden && !document.querySelector('.sous-modale')) router(); }, 800); };
sb.auth.onAuthStateChange((evt) => {
  if (evt !== 'SIGNED_IN' && evt !== 'INITIAL_SESSION') return;
  if (window.__bfcSync) return;
  window.__bfcSync = sb.channel('bfc-sync');
  ['operations', 'virements', 'comptes', 'listes_courses', 'produits', 'transactions_bancaires'].forEach(t =>
    window.__bfcSync.on('postgres_changes', { event: '*', schema: C.structure, table: t }, rafraichir));
  window.__bfcSync.subscribe();
});
});
