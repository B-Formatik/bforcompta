/* B-S@fe — lecture automatique des tickets de caisse et factures (photo ou PDF)
   Tout se passe dans l'appareil (aucun envoi à un service tiers) :
   1. contrôle de la photo (netteté, luminosité, taille) : une photo floue est refusée ;
   2. nettoyage de l'image (niveaux de gris, agrandissement, noir et blanc adaptatif) ;
   3. lecture des caractères (Tesseract, français, modules hébergés avec l'appli) ;
   4. analyse et CONTRÔLES CROISÉS : total lu, montant payé, total TVA et somme des articles doivent concorder.
   Une même photo donne toujours le même résultat. */
(() => {
'use strict';
const base = new URL('vendor/ocr/', document.baseURI).href;
const LIBS = {
  tesseract: base + 'tesseract.min.js',
  pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
};
const charges = {};
function charger(url) {
  return charges[url] ||= new Promise((ok, ko) => { const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => { delete charges[url]; ko(new Error('Module de lecture introuvable : vérifiez la connexion Internet.')); }; document.head.append(s); });
}
let travailleur = null;
async function lecteur() {
  if (travailleur) return travailleur;
  await charger(LIBS.tesseract);
  travailleur = (async () => {
    const w = await window.Tesseract.createWorker('fra', 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base, logger: (m) => { if (m.status === 'recognizing text' && lecteur.progression) lecteur.progression(m.progress); } });
    await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    return w;
  })().catch(e => { travailleur = null; throw e; });
  return travailleur;
}

/* ---------------------------------------------------------------- 1-2. contrôle et nettoyage de l'image */
class PhotoRefusee extends Error {}
async function chargerImage(source) {
  if (source instanceof HTMLCanvasElement) return source;
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Image illisible.')); i.src = url; });
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); return c;
  } finally { URL.revokeObjectURL(url); }
}
function gris(canvas, largeur) {
  const k = largeur / canvas.width, w = Math.round(canvas.width * k), h = Math.round(canvas.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high'; x.drawImage(canvas, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return { g, w, h };
}
/* Mesures de qualité sur la zone centrale (là où se trouve le ticket) */
function qualite(canvas) {
  const { g, w, h } = gris(canvas, 800);
  let s = 0, s2 = 0, n = 0, lum = 0;
  const x0 = Math.round(w * 0.15), x1 = Math.round(w * 0.85), y0 = Math.round(h * 0.1), y1 = Math.round(h * 0.9);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * w + x, l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    s += l; s2 += l * l; n++; lum += g[i];
  }
  const m = s / n;
  return { nettete: Math.round(s2 / n - m * m), luminosite: Math.round(lum / n), largeur: canvas.width, hauteur: canvas.height };
}
const SEUIL_NETTETE = 30;
function verifierPhoto(q) {
  if (Math.max(q.largeur, q.hauteur) < 700) throw new PhotoRefusee('Photo trop petite : prenez le ticket en photo de plus près, en pleine résolution.');
  if (q.luminosite < 45) throw new PhotoRefusee('Photo trop sombre : allumez la lumière ou utilisez le flash, puis reprenez la photo.');
  if (q.luminosite > 235) throw new PhotoRefusee('Photo trop claire (reflet) : évitez la lumière directe sur le ticket et reprenez la photo.');
  if (q.nettete < SEUIL_NETTETE) throw new PhotoRefusee('Photo floue : le texte n\'est pas assez net pour être lu de façon fiable. Posez le ticket à plat, tenez le téléphone immobile, laissez la mise au point se faire, puis reprenez la photo.');
}
/* Noir et blanc adaptatif (seuil local par image intégrale) : gère les ombres et le papier froissé */
function noirEtBlanc(canvas) {
  const cible = Math.min(2000, Math.max(1400, canvas.width));
  const { g, w, h } = gris(canvas, cible);
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) { let lig = 0; for (let x = 1; x <= w; x++) { lig += g[(y - 1) * w + x - 1]; I[y * (w + 1) + x] = I[(y - 1) * (w + 1) + x] + lig; } }
  const r = Math.max(10, Math.round(w / 45)), C = 12;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x2 = c.getContext('2d'); const out = x2.createImageData(w, h);
  for (let y = 0; y < h; y++) { const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) { const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
      const somme = I[yb * (w + 1) + xb] - I[ya * (w + 1) + xb] - I[yb * (w + 1) + xa] + I[ya * (w + 1) + xa];
      const v = g[y * w + x] < somme / ((xb - xa) * (yb - ya)) - C ? 0 : 255, o = (y * w + x) * 4;
      out.data[o] = out.data[o + 1] = out.data[o + 2] = v; out.data[o + 3] = 255; } }
  x2.putImageData(out, 0, 0); return c;
}
/* Redresse une photo légèrement penchée (jusqu'à ±8°) : on cherche l'angle qui aligne le mieux les lignes de texte */
function redresser(canvas) {
  const { g, w, h } = gris(canvas, 700);
  // pixels d'encre : nettement plus sombres que leur voisinage immédiat (ignore les grands fonds sombres)
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) { let lig = 0; for (let x = 1; x <= w; x++) { lig += g[(y - 1) * w + x - 1]; I[y * (w + 1) + x] = I[(y - 1) * (w + 1) + x] + lig; } }
  const r = 8, noirs = [];
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
    const m = (I[(y + r + 1) * (w + 1) + x + r + 1] - I[(y - r) * (w + 1) + x + r + 1] - I[(y + r + 1) * (w + 1) + x - r] + I[(y - r) * (w + 1) + x - r]) / ((2 * r + 1) ** 2);
    if (g[y * w + x] < m - 25 && m > 90) noirs.push(x - w / 2, y - h / 2);
  }
  if (noirs.length < 400) return canvas;
  let meilleur = 0, maxV = -1;
  for (let a = -8; a <= 8.01; a += 0.5) {
    const t = a * Math.PI / 180, sn = Math.sin(t), cs = Math.cos(t), H = new Float64Array(h * 2);
    for (let i = 0; i < noirs.length; i += 2) { const y = Math.round(-noirs[i] * sn + noirs[i + 1] * cs + h); if (y >= 0 && y < 2 * h) H[y]++; }
    let s = 0, s2 = 0; for (const v of H) { s += v; s2 += v * v; } const v = s2 / H.length - (s / H.length) ** 2;
    if (v > maxV) { maxV = v; meilleur = a; }
  }
  if (Math.abs(meilleur) < 0.75) return canvas;
  const t = meilleur * Math.PI / 180, W = canvas.width, Hh = canvas.height;
  const nw = Math.round(Math.abs(W * Math.cos(t)) + Math.abs(Hh * Math.sin(t))), nh = Math.round(Math.abs(W * Math.sin(t)) + Math.abs(Hh * Math.cos(t)));
  const c = document.createElement('canvas'); c.width = nw; c.height = nh; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, nw, nh); x.translate(nw / 2, nh / 2); x.rotate(-t); x.drawImage(canvas, -W / 2, -Hh / 2);
  return c;
}
function niveauxDeGris(canvas) {
  const { g, w, h } = gris(canvas, Math.min(2000, Math.max(1400, canvas.width)));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const o = x.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { o.data[i * 4] = o.data[i * 4 + 1] = o.data[i * 4 + 2] = g[i]; o.data[i * 4 + 3] = 255; }
  x.putImageData(o, 0, 0); return c;
}

async function ocr(canvas, part, progression) {
  const w = await lecteur();
  lecteur.progression = (p) => progression && progression(Math.round(part[0] + p * (part[1] - part[0])));
  const { data } = await w.recognize(canvas);
  return { texte: data.text || '', confiance: Math.round(data.confidence || 0) };
}

async function texteDepuisPdf(fichier) {
  await charger(LIBS.pdf);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
  const pdf = await window.pdfjsLib.getDocument({ data: await fichier.arrayBuffer() }).promise;
  let texte = '';
  for (let p = 1; p <= Math.min(pdf.numPages, 5); p++) {
    const page = await pdf.getPage(p); const contenu = await page.getTextContent(); const lignes = {};
    contenu.items.forEach(it => { const y = Math.round(it.transform[5]); (lignes[y] ||= []).push(it); });
    texte += Object.keys(lignes).sort((a, b) => b - a).map(y => lignes[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ')).join('\n') + '\n';
  }
  if (texte.replace(/\s/g, '').length > 40) return { texte };
  const page = await pdf.getPage(1); const vue = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement('canvas'); canvas.width = vue.width; canvas.height = vue.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vue }).promise;
  return { canvas };
}

/* ---------------------------------------------------------------- 3. analyse du texte */
const ENSEIGNES = ['Leader Price', 'Naturalia', 'Carrefour Market', 'Carrefour Contact', 'Carrefour City', 'Carrefour', 'Super U', 'Hyper U', 'U Express', 'Marché U', 'Système U', 'E.Leclerc', 'Leclerc', 'Intermarché', 'Lidl', 'Aldi', 'Auchan', 'Casino', 'Géant Casino', 'Monoprix', 'Franprix', 'Match', 'Cora', 'Netto', 'Picard', 'Biocoop', 'Grand Frais', 'Ecomax', 'Score', 'Milénis', 'Destreland', 'Cash Wholesale', 'Promocash', 'Metro', 'Spar', 'Vival', '8 à Huit', 'Proxi', 'Action', 'Gifi', 'Decathlon', 'Leroy Merlin', 'Castorama', 'Mr Bricolage', 'Bricomarché', 'Darty', 'Boulanger', 'Fnac', 'Pharmacie', 'Boulangerie', 'Station Total', 'TotalEnergies', 'Esso', 'Shell', 'Vito', 'Rubis', 'McDonald\'s', 'Burger King', 'KFC', 'Quick', 'Ikea', 'Conforama', 'But', 'Kiabi', 'H&M', 'Zara', 'Primark', 'Sephora', 'Marionnaud', 'Yves Rocher'];
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9&' ]/g, ' ').replace(/\s+/g, ' ').trim();
function distance(a, b) {
  const v = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let p = v[0]; v[0] = i; for (let j = 1; j <= b.length; j++) { const t = v[j]; v[j] = Math.min(v[j] + 1, v[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } }
  return v[b.length];
}
/* Cherche une enseigne (ou un magasin déjà connu) dans le haut du ticket, en tolérant les erreurs de lecture */
function trouverMagasin(lignes, magasinsConnus) {
  const candidats = [...magasinsConnus.map(m => ({ nom: m.nom, id: m.id })), ...ENSEIGNES.map(nom => ({ nom }))].filter(c => norm(c.nom).replace(/ /g, '').length >= 3);
  const haut = lignes.slice(0, 16).map(norm);
  const bloc = haut.join('').replace(/ /g, '');            // les enseignes sont souvent sur 2 lignes (« LEADER » / « PRICE »)
  const mots = new Set(haut.join(' ').split(' '));
  let meilleur = null;
  for (const c of candidats) {
    const cn = norm(c.nom).replace(/ /g, '');
    let trouve = false, d = 0;
    if (cn.length <= 6) trouve = norm(c.nom).split(' ').length === 1 ? mots.has(cn) : bloc.includes(cn);   // nom court : mot exact uniquement
    else {
      const tol = Math.floor(cn.length / 5);                // 1 erreur tolérée par tranche de 5 lettres
      for (let i = 0; i + cn.length <= bloc.length; i++) { const x = distance(cn, bloc.slice(i, i + cn.length)); if (x <= tol) { trouve = true; d = x; break; } }
    }
    if (trouve) { const sc = cn.length * 3 - d * 4 + (c.id ? 3 : 0); if (!meilleur || sc > meilleur.score) meilleur = { ...c, score: sc }; }
  }
  if (meilleur) return { magasin: meilleur.nom, magasin_id: meilleur.id || null, sur: true };
  return { magasin: null, magasin_id: null, sur: false };   // pas de nom inventé : mieux vaut un champ vide à remplir qu'un nom faux
}
const nombre = (s) => Math.round(Number(String(s).match(/-?\d{1,4}[,.]\d{2}/)?.[0]?.replace(',', '.') ?? NaN) * 100) / 100;
// prix en fin de ligne, tolère « € », « EUR », « e », et les lettres/astérisques de TVA après le prix
// un prix : 1 à 4 chiffres, virgule ou point, 2 chiffres ; tolère « € » mal lu (e, 6, g, 0, ©) juste après
const TOUS_PRIX = /-?\d{1,4}[,.]\d{2}(?:€|EUR|[eEg©]|\d(?=[\s;,.]|$))?(?!\d)/g;
const MOTS_TOTAL = /\b(TOTAL|[TL1I][O0]TAL|T[O0]RAL|NET A PAYER|A PAYER|MONTANT DU|SOMME DUE)\b/;   // tolère « lotal », « ToraL »…
const EXCLUS = /\b(SOUS[- ]?TOTAL|TVA|T\.?V\.?A|H\.?T\.?|TTC|RENDU|RENDRE|MONNAIE|CARTE|CB|VISA|MASTERCARD|ESPECES|CHEQUE|REMISE TOTALE|NB ARTICLES|ARTICLE\(S\)|ARTICLES|MONTANT|SOLDE|FIDELITE|AVOIR|PAIEMENT|REGLEMENT|TICKET|CAISSE|MERCI|EXONERE|VERSION|SIGNATURE|TEL|SIRET|OUVERT|DIMANCHE|LUNDI|CODE|TPV|TOT\.HT|VENTILATION|OPERATION|BIENVENUE)\b/;

// en cas d'égalité de votes : le total imprimé et le paiement carte priment ; les espèces données sont moins sûres (rendu mal lu)
const POIDS = { 'Total lu': 5, 'Payé par carte': 4, 'Payé par chèque': 4, 'Somme des articles': 3, 'Total TTC (TVA)': 2, 'Espèces − rendu': 1 };
const poids = (srcs) => Math.max(...srcs.map(x => POIDS[x] || 0));
function analyser(texte, magasinsConnus = []) {
  const lignes = texte.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').replace(/(\d)([,.]) (\d{2})(?!\d)/g, '$1$2$3').trim()).filter(Boolean);   // « 5, 16€ » → « 5,16€ »
  const N = lignes.map(norm);
  const r = { magasin: null, magasin_id: null, magasin_sur: false, date: null, heure: null, total: null, moyen: null, montant_paye: null, articles: [], controles: [], texte };
  Object.assign(r, (({ magasin, magasin_id, sur }) => ({ magasin, magasin_id, magasin_sur: sur }))(trouverMagasin(lignes, magasinsConnus)));
  // date (jj/mm/aa ou jj/mm/aaaa ; plausible : pas dans le futur, moins de 2 ans)
  const auj = new Date();
  for (const m of texte.matchAll(/\b(\d{1,2})\s?[\/.\-]\s?(\d{1,2})\s?[\/.\-]\s?(\d{4}|\d{2})\b/g)) {
    const a = +(m[3].length === 2 ? '20' + m[3] : m[3]), mo = +m[2], j = +m[1];
    const d = new Date(a, mo - 1, j);
    if (d.getMonth() === mo - 1 && d <= auj && auj - d < 730 * 864e5) { r.date = `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`; break; }
  }
  const h = texte.match(/\b([01]?\d|2[0-3])\s?[:hH]\s?([0-5]\d)\b/); if (h) r.heure = `${h[1].padStart(2, '0')}:${h[2]}`;

  // repère la fin de la liste des articles (première ligne TOTAL)
  let finArticles = N.findIndex(l => (MOTS_TOTAL.test(l) || /\bR?L?OTAL\b/.test(l)) && !/SOUS ?TOTAL/.test(l));
  if (finArticles < 0) finArticles = lignes.length;

  // sources de total
  const sources = [];
  const prixDe = (l) => [...l.matchAll(TOUS_PRIX)].map(x => nombre(x[0]));
  N.forEach((l, i) => {
    if (MOTS_TOTAL.test(l) && !/SOUS ?TOTAL|TVA|HT\b/.test(l)) { const p = prixDe(lignes[i]); if (p.length) sources.push({ v: p[p.length - 1], src: 'Total lu' }); }
    if (/TOTAL ?(TVA|DEV)/.test(l)) { const p = prixDe(lignes[i]); if (p.length) sources.push({ v: p[p.length - 1], src: 'Total TTC (TVA)' }); }
  });
  // paiement : « CARTE BANCAIRE 81,82 », « ESPECES 20,00 » (hors « rendu »)
  let carte = null, especes = null, cheque = null, rendu = 0;
  N.forEach((l, i) => { const p = prixDe(lignes[i]); if (!p.length) return; const v = p[p.length - 1];
    if (/RENDU|A RENDRE|MONNAIE|R[EF]N[DO][UO]|PENOU/.test(l) || (especes != null && /\(.*[CE]S\)/.test(l) && v < especes)) { rendu = v; return; }
    if (/\b(CARTE|CB|VISA|MASTERCARD|SANS CONTACT|CARTE BANCAIRE)\b/.test(l)) carte = (carte || 0) + v;
    else if (/\bESPECES\b/.test(l)) especes = (especes || 0) + v;
    else if (/\bCHEQUE\b/.test(l)) cheque = (cheque || 0) + v; });
  r.especes_donnees = especes;
  if (carte > 0) { r.moyen = 'carte'; r.montant_paye = carte; sources.push({ v: carte, src: 'Payé par carte' }); }
  else if (especes > 0) { r.moyen = 'especes'; r.montant_paye = Math.round((especes - rendu) * 100) / 100; sources.push({ v: r.montant_paye, src: 'Espèces − rendu' }); }
  else if (cheque > 0) { r.moyen = 'cheque'; r.montant_paye = cheque; sources.push({ v: cheque, src: 'Payé par chèque' }); }

  // articles
  for (let i = 0; i < finArticles; i++) {
    const l = lignes[i], n = N[i];
    if (EXCLUS.test(n) || /OTAL/.test(n) || /^[\d\s.,:\/-]+$/.test(l)) continue;
    // dernier prix de la ligne ; ce qui suit ne doit être que du bruit (pas de mot)
    const tous = [...l.matchAll(TOUS_PRIX)]; if (!tous.length) continue;
    const m = tous[tous.length - 1], apres = l.slice(m.index + m[0].length);
    const reste = apres.replace(/^\s*(?:E\s?U\s?[RKk]?|EUR|€)/i, '');
    if (/[A-Za-zÀ-ÿ]{3,}/.test(reste) || reste.replace(/\s/g, '').length > 6) continue;
    let total = nombre(m[0].match(/-?\d{1,4}[,.]\d{2}/)[0]); let libelle = l.slice(0, m.index).trim();
    let quantite = 1, pu = total;
    const q = libelle.match(/^(\d{1,3})\s?[xX×*]\s*/);                         // « 2X AILES … »
    const puLigne = [...libelle.matchAll(TOUS_PRIX)];                           // prix unitaire au milieu : « … 8,79€ 17,58€ »
    if (q) { quantite = +q[1]; libelle = libelle.slice(q[0].length); }
    if (puLigne.length) { const u = nombre(puLigne[puLigne.length - 1][0]); libelle = libelle.slice(0, puLigne[puLigne.length - 1].index).trim();
      if (q) pu = u; else if (u > 0 && Math.abs(Math.round(total / u) * u - total) < 0.02 && total / u >= 2) { quantite = Math.round(total / u); pu = u; } }
    else if (q) pu = Math.round(total / quantite * 100) / 100;
    libelle = libelle.replace(/^[^A-Za-zÀ-ÿ0-9]+/, '').replace(/^[A-Z]?\s?\d{8,14}[\s\-—:,.]*/, '').replace(/[|_~"“”«»]+/g, ' ').replace(/[\s.:;,*#€—–-]+$/, '').replace(/\s\d{1,4}[,.]\d{0,2}$/, '').replace(/\s+\d{1,2}$/, '').replace(/[\s.:;,*#€—–-]+$/, '').replace(/\s{2,}/g, ' ').trim();
    if (!/[A-Za-zÀ-ÿ]{3,}/.test(libelle) || !(pu > 0) || pu > 3000) continue;
    r.articles.push({ libelle: libelle.slice(0, 80), quantite, prix_unitaire: pu, total_ligne: Math.round(quantite * pu * 100) / 100 });
  }
  const somme = Math.round(r.articles.reduce((a, x) => a + x.quantite * x.prix_unitaire, 0) * 100) / 100;
  if (r.articles.length) sources.push({ v: somme, src: 'Somme des articles' });

  // total retenu : la valeur confirmée par le plus de sources
  const votes = {};
  sources.filter(s => s.v > 0).forEach(s => { (votes[s.v.toFixed(2)] ||= []).push(s.src); });
  const classement = Object.entries(votes).sort((a, b) => b[1].length - a[1].length || poids(b[1]) - poids(a[1]));
  if (classement.length) { r.total = Number(classement[0][0]); r.sources_total = classement[0][1]; }
  r.verifie = !!(classement.length && classement[0][1].length >= 2);
  r.somme_articles = somme;

  r.sources = sources;
  r.controles = controles(r);
  return r;
}
/* Contrôles affichés à l'utilisateur (✅ vérifié / ⚠️ à vérifier) */
function controles(r) {
  const out = [], ctl = (ok, texte) => out.push({ ok, texte }), e = (v) => Number(v).toFixed(2).replace('.', ',') + ' €';
  ctl(!!r.magasin_sur, r.magasin_sur ? `Magasin reconnu : ${r.magasin}` : r.magasin ? `Magasin incertain (« ${r.magasin} ») : vérifiez le nom` : 'Magasin non lu : saisissez-le');
  ctl(!!r.date, r.date ? `Date lue : ${r.date.split('-').reverse().join('/')}` : 'Date absente ou illisible : date du jour proposée, vérifiez-la');
  if (r.total) ctl(r.verifie, r.verifie ? `Total ${e(r.total)} confirmé par : ${r.sources_total.join(', ')}` : `Total ${e(r.total)} lu une seule fois : vérifiez-le`);
  else ctl(false, 'Total non lu : saisissez-le');
  const juste = r.articles.length && r.total != null && Math.abs(r.somme_articles - r.total) <= 0.02;
  if (r.articles.length) ctl(juste, juste ? `${r.articles.length} ligne(s) d'articles, somme = total` : `${r.articles.length} ligne(s) lue(s), somme ${e(r.somme_articles)} au lieu de ${e(r.total || 0)} : écart ${e((r.total || 0) - r.somme_articles)} (ligne manquante ou mal lue)`);
  else ctl(false, 'Aucun article lu : ajoutez-les si vous voulez suivre les prix');
  (r.corrections || []).forEach(c => ctl(true, 'Correction automatique : ' + c));
  if (r.moyen) ctl(true, `Paiement lu : ${{ carte: 'carte bancaire', especes: 'espèces', cheque: 'chèque' }[r.moyen]}${r.montant_paye ? ' ' + e(r.montant_paye) : ''}`);
  return out;
}
/* Score de cohérence d'une lecture (pour choisir la meilleure de deux) */
const score = (r) => (r.verifie ? 100 : 0) + (r.total ? 20 : 0) + (r.magasin_sur ? 15 : 0) + (r.date ? 10 : 0) + Math.min(r.articles.length, 30) * 2 + (r.articles.length && Math.abs(r.somme_articles - r.total) <= 0.02 ? 40 : 0);

/* Fusionne deux lectures de la même photo : chaque information est prise dans la lecture qui la confirme le mieux */
function fusionner(lectures, magasinsConnus) {
  const [a, b] = lectures; if (!b) return a;
  const r = score(b) > score(a) ? { ...b } : { ...a }, autre = r === b ? a : b;
  if (!r.magasin_sur && autre.magasin_sur) Object.assign(r, { magasin: autre.magasin, magasin_id: autre.magasin_id, magasin_sur: true });
  if (!r.date && autre.date) r.date = autre.date;
  if (!r.heure && autre.heure) r.heure = autre.heure;
  if (!r.moyen && autre.moyen) { r.moyen = autre.moyen; r.montant_paye = autre.montant_paye; }
  // le total : vote de toutes les sources des deux lectures
  const votes = {};
  for (const x of lectures) (x.sources || []).forEach(s => { if (s.v > 0) (votes[s.v.toFixed(2)] ||= new Set()).add(s.src); });
  const cl = Object.entries(votes).sort((p, q) => q[1].size - p[1].size || poids([...q[1]]) - poids([...p[1]]));
  if (cl.length) { r.total = Number(cl[0][0]); r.sources_total = [...cl[0][1]]; r.verifie = cl[0][1].size >= 2; }
  // espèces : rendu mal lu → on cherche dans les montants lus celui qui, retiré des espèces données, retombe sur le total
  const donne = lectures.map(x => x.especes_donnees).find(v => v > 0);
  if (r.moyen === 'especes' && donne && !r.verifie) {
    const montants = lectures.flatMap(x => [...x.texte.matchAll(TOUS_PRIX)].map(m => nombre(m[0])));
    const cands = Object.keys(votes).map(Number).filter(t => t > 0 && t < donne);
    const t = cands.find(t => montants.some(p => Math.abs(donne - p - t) < 0.01));
    if (t != null) { r.total = t; r.montant_paye = t; r.sources_total = [...(votes[t.toFixed(2)] || []), `Espèces ${donne.toFixed(2).replace('.', ',')} − rendu ${(donne - t).toFixed(2).replace('.', ',')}`]; r.verifie = true; }
  }
  // les articles : la liste dont la somme tombe juste, sinon la plus complète
  const juste = lectures.find(x => x.articles.length && Math.abs(x.somme_articles - r.total) <= 0.02);
  const liste = juste || lectures.slice().sort((p, q) => q.articles.length - p.articles.length)[0];
  r.articles = liste.articles; r.somme_articles = liste.somme_articles;
  r.articles = r.articles.map(a => ({ ...a }));
  if (r.verifie && r.articles.length && Math.abs(r.somme_articles - r.total) > 0.005) reconcilier(r, lectures.filter(x => x.articles !== liste.articles).flatMap(x => x.articles));
  r.texte = lectures.map(x => x.texte).join('\n---------- 2e lecture ----------\n');
  r.controles = controles(r);
  return r;
}
/* Le total est sûr (confirmé 2 fois) mais la somme des lignes ne tombe pas juste : un chiffre a été mal lu sur UNE ligne.
   On cherche l'unique correction qui fait tomber la somme exactement sur le total :
   1) le prix lu pour le même article dans l'autre lecture ; 2) un chiffre souvent confondu (5↔6↔8↔9↔3↔0, 1↔7, 2↔7).
   La correction n'est appliquée que si elle est unique ; elle est signalée à l'utilisateur. */
const CONFUS = { 0: '869', 1: '74', 2: '7', 3: '85', 4: '1', 5: '692', 6: '5980', 7: '12', 8: '6930', 9: '856' };
function reconcilier(r, autres) {
  const ecart = Math.round((r.total - r.somme_articles) * 100) / 100, sim = (a, b) => { const x = norm(a).replace(/ /g, ''), y = norm(b).replace(/ /g, ''); return distance(x, y) <= Math.max(2, Math.floor(Math.min(x.length, y.length) / 4)); };
  const sols = [];
  r.articles.forEach((a, i) => {
    const essais = new Set();
    autres.filter(o => sim(o.libelle, a.libelle)).forEach(o => essais.add(o.prix_unitaire));
    const ch = a.prix_unitaire.toFixed(2);
    for (let k = 0; k < ch.length; k++) { if (ch[k] === '.') continue; for (const c of CONFUS[ch[k]] || '') essais.add(Number(ch.slice(0, k) + c + ch.slice(k + 1))); }
    essais.forEach(p => { if (p > 0 && p !== a.prix_unitaire && Math.abs((p - a.prix_unitaire) * a.quantite - ecart) < 0.005) sols.push({ i, p }); });
  });
  const uniques = [...new Map(sols.map(s => [s.i + ':' + s.p, s])).values()];
  if (uniques.length !== 1) return;
  const { i, p } = uniques[0], a = r.articles[i];
  r.corrections = [`${a.libelle} : ${a.prix_unitaire.toFixed(2).replace('.', ',')} → ${p.toFixed(2).replace('.', ',')} € (chiffre mal lu, corrigé car la somme retombe exactement sur le total)`];
  a.prix_unitaire = p; a.total_ligne = Math.round(p * a.quantite * 100) / 100; a.corrige = true;
  r.somme_articles = Math.round(r.articles.reduce((s, x) => s + x.quantite * x.prix_unitaire, 0) * 100) / 100;
}

async function lireDocument(fichier, magasinsConnus, progression) {
  const estPdf = /pdf/i.test(fichier.type) || /\.pdf$/i.test(fichier.name || '');
  let canvas;
  if (estPdf) { const p = await texteDepuisPdf(fichier); if (p.texte) return { ...analyser(p.texte, magasinsConnus), lecture: 'pdf' }; canvas = p.canvas; }
  else canvas = await chargerImage(fichier);
  const q = qualite(canvas);
  verifierPhoto(q);
  canvas = redresser(canvas);
  const l1 = await ocr(noirEtBlanc(canvas), [0, 50], progression);
  const l2 = await ocr(niveauxDeGris(canvas), [50, 100], progression);
  const r = fusionner([analyser(l1.texte, magasinsConnus), analyser(l2.texte, magasinsConnus)], magasinsConnus);
  if (!r.total && !r.articles.length) throw new PhotoRefusee('Ticket illisible : aucun montant n\'a pu être lu de façon fiable. Reprenez la photo : ticket à plat, bien éclairé, en entier, téléphone immobile.');
  if (Math.max(l1.confiance, l2.confiance) < 45 && !r.verifie) throw new PhotoRefusee('Photo pas assez nette pour une lecture fiable. Reprenez-la : ticket à plat, sans ombre ni reflet, téléphone immobile au-dessus.');
  return { ...r, qualite: q, confiance: Math.max(l1.confiance, l2.confiance) };
}

window.BFC_TICKET = { lireDocument, analyser, fusionner, qualite, controles, PhotoRefusee };
})();
