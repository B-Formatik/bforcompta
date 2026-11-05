/* B-ForCompt@ — exports PDF et CSV (web et application Android)
   Web : téléchargement direct. Android : partage (Enregistrer dans Fichiers, Drive, e-mail, WhatsApp…). */
(() => {
'use strict';
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmt = (n) => euro.format(Number(n || 0)).replace(/ | /g, ' ');
const fmtDate = (d) => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('fr-FR') : '';
const MARINE = [17, 49, 110], BLEU = [36, 103, 182], ORANGE = [247, 148, 29];
const estApp = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

function blobVersBase64(blob) {
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(blob); });
}

/* Enregistre / partage un fichier */
async function partagerFichier(nom, blob, titre) {
  if (estApp()) {
    const P = window.Capacitor.Plugins || {};
    if (!P.Filesystem || !P.Share) throw new Error('Module de partage indisponible : mettez l\'application à jour.');
    const data = await blobVersBase64(blob);
    const ecrit = await P.Filesystem.writeFile({ path: nom, data, directory: 'CACHE' });
    await P.Share.share({ title: titre || nom, text: titre || nom, files: [ecrit.uri], dialogTitle: 'Enregistrer ou envoyer' });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

let logoCache = null;
async function logo() {
  if (logoCache) return logoCache;
  const blob = await fetch('assets/logo.png').then(r => r.blob());
  const url = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
  const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = url; });
  return (logoCache = { url, ratio: img.height / img.width });
}

function nouveauPdf() {
  if (!window.jspdf) throw new Error('Module PDF non chargé.');
  return new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
}
function piedDePage(doc, texte) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFillColor(...BLEU); doc.rect(0, 284, 210, 13, 'F');
    doc.setFillColor(...ORANGE); doc.rect(0, 283, 210, 1.2, 'F');
    doc.setTextColor(255); doc.setFontSize(8);
    doc.text(texte, 14, 291);
    doc.text(`Page ${i} / ${n}`, 196, 291, { align: 'right' });
  }
}

/* ---------- Facture / devis / avoir ---------- */
async function pdfPiece(p, structure) {
  const doc = nouveauPdf();
  const L = await logo();
  doc.addImage(L.url, 'PNG', 14, 12, 70, 70 * L.ratio);
  const titre = { facture: 'FACTURE', devis: 'DEVIS', avoir: 'AVOIR' }[p.type_piece] || 'PIÈCE';
  doc.setTextColor(...MARINE); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text(titre, 196, 18, { align: 'right' });
  doc.setFontSize(11); doc.text(p.numero || 'BROUILLON', 196, 25, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60);
  doc.text(`Date : ${fmtDate(p.date_piece)}`, 196, 31, { align: 'right' });
  if (p.date_echeance) doc.text(`${p.type_piece === 'devis' ? 'Valable jusqu\'au' : 'Échéance'} : ${fmtDate(p.date_echeance)}`, 196, 36, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...MARINE); doc.setFontSize(10.5);
  doc.text(structure?.nom || 'B-Form@tik', 14, 34);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(90); doc.setFontSize(8.5);
  if (structure?.description) doc.text(doc.splitTextToSize(structure.description, 90), 14, 39);
  doc.setFillColor(...ORANGE); doc.rect(14, 46, 182, 1.2, 'F');
  // Client
  doc.setDrawColor(219, 229, 243); doc.roundedRect(110, 52, 86, 26, 3, 3);
  doc.setTextColor(...MARINE); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(p.client_nom || '', 114, 59);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(50); doc.setFontSize(9);
  doc.text(doc.splitTextToSize([p.client_adresse, p.client_email].filter(Boolean).join('\n'), 78), 114, 65);
  let y = 86;
  if (p.objet) { doc.setFontSize(10); doc.setTextColor(30); doc.setFont('helvetica', 'bold'); doc.text('Objet : ', 14, y); doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(p.objet, 165), 28, y); y += 8; }
  doc.autoTable({
    startY: y,
    head: [['Désignation', 'Qté', 'PU HT', 'TVA', 'Total HT']],
    body: (p.lignes || []).map(l => [l.designation || '', String(l.quantite ?? ''), fmt(l.prix_unitaire), `${l.tva || 0} %`, fmt((Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0))]),
    headStyles: { fillColor: MARINE, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 249, 255] },
    styles: { fontSize: 9.5, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'center', cellWidth: 16 }, 2: { halign: 'right', cellWidth: 28 }, 3: { halign: 'center', cellWidth: 18 }, 4: { halign: 'right', cellWidth: 30 } },
    margin: { left: 14, right: 14, bottom: 20 }
  });
  y = doc.lastAutoTable.finalY + 6;
  const ligneTotal = (lib, v, gras, couleur) => {
    doc.setFont('helvetica', gras ? 'bold' : 'normal'); doc.setTextColor(...(couleur || [30, 30, 30])); doc.setFontSize(gras ? 12 : 10);
    doc.text(lib, 140, y); doc.text(fmt(v), 196, y, { align: 'right' }); y += gras ? 8 : 6;
  };
  ligneTotal('Total HT', p.montant_ht); ligneTotal('TVA', p.montant_tva);
  doc.setFillColor(...ORANGE); doc.rect(138, y - 4, 58, 0.8, 'F'); y += 2;
  ligneTotal('Total TTC', p.montant_ttc, true, ORANGE);
  if (p.notes) { doc.setFont('helvetica', 'normal'); doc.setTextColor(60); doc.setFontSize(9); doc.text(doc.splitTextToSize(p.notes, 182), 14, y + 6); }
  piedDePage(doc, 'B-Form@tik · Jhonny BOURGEOIS · Bformatik@gmail.com · +590 690 70 55 84');
  const nom = `${(p.numero || 'brouillon-' + titre.toLowerCase()).replace(/[^\w.-]+/g, '_')}.pdf`;
  await partagerFichier(nom, doc.output('blob'), `${titre} ${p.numero || ''} – ${p.client_nom || ''}`);
}

/* ---------- Relevé des opérations ---------- */
async function pdfOperations(liste, ctx) {
  const doc = nouveauPdf();
  const L = await logo();
  doc.addImage(L.url, 'PNG', 14, 10, 55, 55 * L.ratio);
  doc.setTextColor(...MARINE); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('B-ForCompt@ · Relevé des opérations', 196, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80);
  doc.text(ctx.periode || '', 196, 22, { align: 'right' });
  const r = liste.filter(o => o.type === 'recette').reduce((a, o) => a + Number(o.montant), 0);
  const d = liste.filter(o => o.type === 'depense').reduce((a, o) => a + Number(o.montant), 0);
  doc.setFillColor(...ORANGE); doc.rect(14, 27, 182, 1, 'F');
  doc.setFontSize(10); doc.setTextColor(30);
  doc.text(`${liste.length} opération(s)   ·   Recettes ${fmt(r)}   ·   Dépenses ${fmt(d)}   ·   Balance ${fmt(r - d)}`, 14, 34);
  doc.autoTable({
    startY: 39,
    head: [['Date', 'Libellé', 'Catégorie', 'Compte', 'Structure', 'Montant']],
    body: liste.map(o => [fmtDate(o.date_operation), o.libelle + (ctx.tiers(o) ? `\n${ctx.tiers(o)}` : ''), ctx.categorie(o) || '', ctx.compte(o) || '', ctx.structure(o) || '',
      (o.type === 'recette' ? '+' : '-') + fmt(o.montant)]),
    headStyles: { fillColor: MARINE, textColor: 255 },
    alternateRowStyles: { fillColor: [244, 249, 255] },
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 20 }, 5: { halign: 'right', cellWidth: 26, fontStyle: 'bold' } },
    didParseCell: (c) => { if (c.section === 'body' && c.column.index === 5) c.cell.styles.textColor = liste[c.row.index]?.type === 'recette' ? [21, 128, 61] : [198, 40, 40]; },
    margin: { left: 14, right: 14, bottom: 20 }
  });
  piedDePage(doc, `B-ForCompt@ · created by B-Form@tik · édité le ${new Date().toLocaleDateString('fr-FR')}`);
  await partagerFichier(`B-ForCompta_releve_${new Date().toLocaleDateString('fr-CA')}.pdf`, doc.output('blob'), 'Relevé B-ForCompt@');
}

/* ---------- Liste de courses ---------- */
async function pdfListeCourses(l, lignes, ctx) {
  const doc = nouveauPdf();
  const L = await logo();
  doc.addImage(L.url, 'PNG', 14, 10, 55, 55 * L.ratio);
  doc.setTextColor(...MARINE); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text(l.titre || 'Liste de courses', 196, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(70);
  const infos = [`${ctx.jour ? ctx.jour.charAt(0).toUpperCase() + ctx.jour.slice(1) + ' ' : ''}${fmtDate(l.date_prevue)}${l.heure_prevue ? ' à ' + String(l.heure_prevue).slice(0, 5) : ''}`,
    ctx.magasin ? 'Magasin : ' + ctx.magasin : '', [ctx.moyen, ctx.compte].filter(Boolean).join(' · '), l.lieu_paiement ? 'Paiement : ' + l.lieu_paiement : ''].filter(Boolean);
  infos.forEach((t, i) => doc.text(t, 196, 22 + i * 5, { align: 'right' }));
  doc.setFillColor(...ORANGE); doc.rect(14, 44, 182, 1, 'F');
  doc.autoTable({
    startY: 49,
    head: [['', 'Article', 'Qté', 'Prix unit.', 'Total']],
    body: lignes.map(x => ['', x.libelle, String(Number(x.quantite)) + (x.unite && x.unite !== 'pièce' ? ' ' + x.unite : ''), x.prix_unitaire != null ? fmt(x.prix_unitaire) : '', x.prix_unitaire != null ? fmt(Number(x.quantite) * Number(x.prix_unitaire)) : '']),
    headStyles: { fillColor: MARINE, textColor: 255 },
    alternateRowStyles: { fillColor: [244, 249, 255] },
    styles: { fontSize: 11, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'center', cellWidth: 22 }, 3: { halign: 'right', cellWidth: 28 }, 4: { halign: 'right', cellWidth: 28 } },
    didDrawCell: (c) => { if (c.section === 'body' && c.column.index === 0) { doc.setDrawColor(...BLEU); doc.setLineWidth(0.4); doc.rect(c.cell.x + 2.5, c.cell.y + 2.6, 4.5, 4.5);
      if (lignes[c.row.index]?.achete) { doc.setDrawColor(21, 128, 61); doc.line(c.cell.x + 3.2, c.cell.y + 5, c.cell.x + 4.6, c.cell.y + 6.5); doc.line(c.cell.x + 4.6, c.cell.y + 6.5, c.cell.x + 6.6, c.cell.y + 3.2); } } },
    margin: { left: 14, right: 14, bottom: 20 }
  });
  const tot = lignes.reduce((a, x) => a + Number(x.quantite || 0) * Number(x.prix_unitaire || 0), 0);
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...ORANGE); doc.setFontSize(13);
  doc.text(`Total estimé : ${fmt(tot)}`, 196, doc.lastAutoTable.finalY + 9, { align: 'right' });
  piedDePage(doc, 'B-ForCompt@ · created by B-Form@tik');
  await partagerFichier(`Liste_courses_${l.date_prevue}.pdf`, doc.output('blob'), l.titre || 'Liste de courses');
}

/* ---------- Planning des tâches des enfants ---------- */
async function pdfPlanning(ctx) {
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const L = await logo();
  doc.addImage(L.url, 'PNG', 14, 8, 50, 50 * L.ratio);
  doc.setTextColor(...MARINE); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(`Planning des tâches · semaine du ${fmtDate(ctx.jours[0])}`, 283, 15, { align: 'right' });
  const J = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const tache = (id) => ctx.taches.find(t => t.id === id);
  doc.autoTable({
    startY: 26,
    head: [['Enfant', ...ctx.jours.map(j => { const d = new Date(j + 'T12:00:00'); return `${J[(d.getDay() + 6) % 7]} ${j.slice(8)}/${j.slice(5, 7)}`; })]],
    body: ctx.enfants.map(e => [e.prenom, ...ctx.jours.map(j => { const ty = ctx.typeJour(j, e);
      if (ty === 'absent') return 'Absent';
      return ctx.planning.filter(p => p.enfant_id === e.id && p.jour === j).map(p => (p.statut === 'fait' ? '[x] ' : '[ ] ') + (tache(p.tache_id)?.nom || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')).join('\n') || '-'; })]),
    headStyles: { fillColor: MARINE, textColor: 255 },
    styles: { fontSize: 8.5, cellPadding: 2, valign: 'top' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26 } },
    margin: { left: 14, right: 14, bottom: 18 }
  });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFillColor(...BLEU); doc.rect(0, 199, 297, 11, 'F'); doc.setFillColor(...ORANGE); doc.rect(0, 198, 297, 1, 'F');
    doc.setTextColor(255); doc.setFontSize(8); doc.text('B-ForCompt@ · created by B-Form@tik', 14, 205); doc.text(`Page ${i} / ${n}`, 283, 205, { align: 'right' }); }
  await partagerFichier(`Planning_taches_${ctx.jours[0]}.pdf`, doc.output('blob'), 'Planning des tâches');
}

/* ---------- Tableau générique (agenda, comptes, espèces…) ---------- */
async function pdfTableau(titre, sousTitre, entetes, lignes, nomFichier, alignDroite = []) {
  const propre = (s) => String(s ?? '').replace(/→/g, '->').replace(/←/g, '<-').replace(/−/g, '-').replace(/[\u202f\u00a0]/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
  titre = propre(titre); sousTitre = propre(sousTitre); lignes = lignes.map(l => l.map(propre));
  const doc = nouveauPdf();
  const L = await logo();
  doc.addImage(L.url, 'PNG', 14, 10, 55, 55 * L.ratio);
  doc.setTextColor(...MARINE); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(titre, 196, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80);
  if (sousTitre) doc.text(sousTitre, 196, 22, { align: 'right' });
  doc.setFillColor(...ORANGE); doc.rect(14, 27, 182, 1, 'F');
  const colStyles = {}; alignDroite.forEach(i => { colStyles[i] = { halign: 'right' }; });
  doc.autoTable({ startY: 32, head: [entetes], body: lignes, headStyles: { fillColor: MARINE, textColor: 255 }, alternateRowStyles: { fillColor: [244, 249, 255] },
    styles: { fontSize: 9, cellPadding: 2.2 }, columnStyles: colStyles, margin: { left: 14, right: 14, bottom: 20 } });
  piedDePage(doc, `B-ForCompt@ · created by B-Form@tik · édité le ${new Date().toLocaleDateString('fr-FR')}`);
  await partagerFichier(nomFichier, doc.output('blob'), titre);
}

/* ---------- CSV (Excel) ---------- */
async function csv(nom, entetes, lignes) {
  const contenu = [entetes, ...lignes].map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  await partagerFichier(nom, new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8' }), 'Export B-ForCompt@');
}

window.BFC_EXPORT = { partagerFichier, pdfPiece, pdfOperations, pdfListeCourses, pdfPlanning, pdfTableau, csv };
})();
