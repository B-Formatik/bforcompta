/* B-S@fe — lecture automatique des tickets de caisse et factures (photo ou PDF)
   PDF avec texte : lecture directe (pdf.js). Photo / PDF scanné : reconnaissance de caractères (Tesseract, français).
   Les bibliothèques ne sont chargées qu'au premier scan. Tout se passe dans l'appareil : le document n'est envoyé à aucun service tiers. */
(() => {
'use strict';
const LIBS = {
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
};
const charges = {};
function charger(url) {
  return charges[url] ||= new Promise((ok, ko) => { const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => ko(new Error('Connexion Internet nécessaire pour lire le document.')); document.head.append(s); });
}

async function texteDepuisImage(source, progression) {
  await charger(LIBS.tesseract);
  const { data } = await window.Tesseract.recognize(source, 'fra', { logger: m => { if (m.status === 'recognizing text' && progression) progression(Math.round(m.progress * 100)); } });
  return data.text || '';
}
async function texteDepuisPdf(fichier, progression) {
  await charger(LIBS.pdf);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
  const pdf = await window.pdfjsLib.getDocument({ data: await fichier.arrayBuffer() }).promise;
  let texte = '';
  for (let p = 1; p <= Math.min(pdf.numPages, 5); p++) {
    const page = await pdf.getPage(p);
    const contenu = await page.getTextContent();
    // reconstitue les lignes à partir des positions verticales
    const lignes = {};
    contenu.items.forEach(it => { const y = Math.round(it.transform[5]); (lignes[y] ||= []).push(it); });
    texte += Object.keys(lignes).sort((a, b) => b - a).map(y => lignes[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ')).join('\n') + '\n';
  }
  if (texte.replace(/\s/g, '').length > 40) return texte;
  // PDF scanné : rendu de la 1re page en image puis reconnaissance
  const page = await pdf.getPage(1); const vue = page.getViewport({ scale: 2.2 });
  const canvas = document.createElement('canvas'); canvas.width = vue.width; canvas.height = vue.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vue }).promise;
  return texteDepuisImage(canvas, progression);
}

const nombre = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'));
const PRIX = /(-?\d{1,4}(?:[ .]\d{3})*[,.]\d{2})\s*(?:€|EUR|E)?\s*[A-Z0-9*]{0,2}\s*$/i;
const EXCLUS = /\b(total|sous[- ]?total|tva|t\.v\.a|ht\b|ttc|a payer|à payer|net a payer|rendu|rendre|monnaie|cb\b|carte|visa|mastercard|esp[eè]ces|cheque|chèque|remise totale|nb articles|articles?|montant|solde|fidelite|fidélité|avoir|paiement|reglement|règlement|ticket|caisse|merci)\b/i;

/* Analyse le texte : magasin, date, heure, total, moyen de paiement, lignes d'articles */
function analyser(texte, magasinsConnus = []) {
  const lignes = texte.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const r = { magasin: null, magasin_id: null, date: null, heure: null, total: null, moyen: null, articles: [], texte };
  // magasin : un magasin connu cité dans le texte, sinon la première ligne « lisible »
  const haut = texte.toUpperCase();
  const connu = magasinsConnus.slice().sort((a, b) => b.nom.length - a.nom.length).find(m => m.nom.length >= 3 && haut.includes(m.nom.toUpperCase()));
  if (connu) { r.magasin = connu.nom; r.magasin_id = connu.id; }
  else r.magasin = (lignes.find(l => /[A-Za-z]{3,}/.test(l) && !/\d{2}[\/.-]\d{2}/.test(l)) || '').slice(0, 60) || null;
  // date et heure
  const d = texte.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  if (d) { const a = d[3].length === 2 ? '20' + d[3] : d[3]; if (+d[2] >= 1 && +d[2] <= 12 && +d[1] >= 1 && +d[1] <= 31) r.date = `${a}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`; }
  const h = texte.match(/\b([01]?\d|2[0-3])[:hH]([0-5]\d)\b/); if (h) r.heure = `${h[1].padStart(2, '0')}:${h[2]}`;
  // total
  const totaux = lignes.filter(l => /(total|a payer|à payer|net a payer|montant ttc|total ttc)/i.test(l) && !/sous[- ]?total|tva/i.test(l)).map(l => l.match(PRIX)).filter(Boolean).map(m => nombre(m[1]));
  if (totaux.length) r.total = Math.max(...totaux);
  // moyen de paiement
  if (/esp[eè]ces|especes/i.test(texte)) r.moyen = 'especes';
  if (/\b(cb|carte bancaire|carte|visa|mastercard|sans contact|paiement cb)\b/i.test(texte)) r.moyen = 'carte';
  if (/ch[eè]que/i.test(texte)) r.moyen = 'cheque';
  if (/virement/i.test(texte) && !r.moyen) r.moyen = 'virement';
  // articles : « libellé ... prix », avec quantité éventuelle « 2 x 1,25 »
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    if (EXCLUS.test(l)) continue;
    const av = l.match(/^(\d+(?:[,.]\d+)?)\s*[xX*]\s*(\d+[,.]\d{2})\s*(?:€|EUR)?\s+([A-Za-zÀ-ÿ].{1,79})$/);   // « 2 x 1,25 YAOURTS »
    if (av) { r.articles.push({ libelle: av[3].trim(), quantite: nombre(av[1]), prix_unitaire: Math.round(nombre(av[2]) * 100) / 100 }); continue; }
    const m = l.match(PRIX); if (!m) continue;
    let libelle = l.slice(0, m.index).replace(/[.\-_:*]+$/, '').trim();
    let quantite = 1, pu = nombre(m[1]);
    const q = libelle.match(/(\d+(?:[,.]\d+)?)\s*[xX*]\s*(\d+[,.]\d{2})/);
    if (q) { quantite = nombre(q[1]); pu = nombre(q[2]); libelle = libelle.replace(q[0], '').trim(); }
    else if (!/[A-Za-zÀ-ÿ]{2,}/.test(libelle) && i > 0 && !PRIX.test(lignes[i - 1]) && !EXCLUS.test(lignes[i - 1])) {
      // prix sur la ligne suivant le libellé
      const q2 = l.match(/(\d+(?:[,.]\d+)?)\s*[xX*]\s*(\d+[,.]\d{2})/); if (q2) { quantite = nombre(q2[1]); pu = nombre(q2[2]); }
      libelle = lignes[i - 1];
    }
    libelle = libelle.replace(/^\d{6,}\s*/, '').replace(/\s{2,}/g, ' ').trim();
    if (!/[A-Za-zÀ-ÿ]{2,}/.test(libelle) || isNaN(pu) || pu <= 0 || pu > 5000) continue;
    r.articles.push({ libelle: libelle.slice(0, 80), quantite, prix_unitaire: Math.round(pu * 100) / 100 });
  }
  if (!r.total && r.articles.length) r.total = Math.round(r.articles.reduce((a, x) => a + x.quantite * x.prix_unitaire, 0) * 100) / 100;
  return r;
}

async function lireDocument(fichier, magasinsConnus, progression) {
  const estPdf = /pdf/i.test(fichier.type) || /\.pdf$/i.test(fichier.name);
  const texte = estPdf ? await texteDepuisPdf(fichier, progression) : await texteDepuisImage(fichier, progression);
  return analyser(texte, magasinsConnus);
}

window.BFC_TICKET = { lireDocument, analyser };
})();
