/* B-S@fe — Banque & rapprochement
   Comptes reliés, import de relevés (CSV/OFX : Qonto, banques, PayPal, Stripe), boîtes mail liées,
   rapprochement automatique mouvements bancaires <-> opérations <-> e-mails de factures. */
(window.BFC_MODULES = window.BFC_MODULES || []).push((A) => {
'use strict';
const { db, R, $, $$, esc, fmt, fmtDate, toast, verifier, action, val, ouvrirModale, fermerModale, confirmer, router, VUES, formOperation, compteParId, tiersParId, optsListe, opts } = A;
const FOURNISSEURS = { import: 'Import de relevés', qonto: 'Qonto (API)', agregateur: 'Banque (agrégation DSP2)', paypal: 'PayPal (API)', stripe: 'Stripe (API)' };
const STATUTS_CNX = { manuel: 'Import manuel', a_configurer: 'À configurer', actif: 'Connecté', a_renouveler: 'Autorisation à renouveler', erreur: 'Erreur', desactive: 'Désactivé' };
const STATUTS_TB = { a_traiter: 'À traiter', rapprochee: 'Rapprochée', ignoree: 'Ignorée' };
const filtre = { compte: '', statut: 'a_traiter', onglet: 'mouvements' };

/* ------------------------------------------------------------ lecture des relevés */
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function nombre(v) {
  if (v === null || v === undefined) return NaN;
  let s = String(v).replace(/[\s  €$]|EUR/gi, '').trim();
  if (!s) return NaN;
  const neg = /^\(.*\)$/.test(s) || /-$/.test(s); s = s.replace(/[()]/g, '').replace(/-$/, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s); return neg ? -Math.abs(n) : n;
}
function laDate(v) {
  const s = String(v || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
function lireOfx(texte) {
  const blocs = texte.split(/<STMTTRN>/i).slice(1);
  const tag = (b, t) => { const m = b.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
  return blocs.map(b => ({ date: laDate(tag(b, 'DTPOSTED')), montant: nombre(tag(b, 'TRNAMT')), libelle: [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' – '), ref: tag(b, 'FITID') }));
}
function decouperCsv(texte) {
  const premiere = texte.split(/\r?\n/)[0] || '';
  const sep = [';', '\t', ','].map(s => [s, premiere.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const lignes = []; let ligne = [], champ = '', q = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (q) { if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else q = false; } else champ += c; }
    else if (c === '"') q = true;
    else if (c === sep) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texte[i + 1] === '\n') i++; ligne.push(champ); champ = ''; if (ligne.some(x => x.trim())) lignes.push(ligne); ligne = []; }
    else champ += c;
  }
  ligne.push(champ); if (ligne.some(x => x.trim())) lignes.push(ligne);
  return lignes;
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
function devinerColonnes(entetes) {
  const h = entetes.map(norm);
  const trouve = (...motifs) => h.findIndex(x => motifs.some(m => m instanceof RegExp ? m.test(x) : x === m));
  return {
    date: trouve(/^date( d.?operation| de l.?operation| comptable)?$/, /settlement.?date/, /^created/, /^date$/, /emitted.?at/, /^date/),
    libelle: trouve(/^libelle/, /^label$/, /^description$/, /counterparty.?name/, /^nom$/, /^objet/, /libelle/, /description/),
    montant: trouve(/^montant( \(eur\)| eur| ttc)?$/, /^amount$/, /^net$/, /^brut$/, /^montant/, /amount/),
    debit: trouve(/^debit/, /^débit/, /^sortie/),
    credit: trouve(/^credit/, /^crédit/, /^entree/),
    sens: trouve(/^side$/, /^sens$/, /^type$/),
    ref: trouve(/transaction.?id/, /^id$/, /^reference$/, /numero de transaction/, /^ref/)
  };
}
function lireCsv(lignes, col, debut) {
  return lignes.slice(debut).map(l => {
    let m;
    if (col.montant >= 0 && l[col.montant] !== undefined && String(l[col.montant]).trim() !== '') m = nombre(l[col.montant]);
    else { const d = col.debit >= 0 ? nombre(l[col.debit]) : NaN, c = col.credit >= 0 ? nombre(l[col.credit]) : NaN;
      m = (isNaN(c) ? 0 : Math.abs(c)) - (isNaN(d) ? 0 : Math.abs(d)); }
    if (col.sens >= 0 && /debit|sortie|debit/i.test(norm(l[col.sens]))) m = -Math.abs(m);
    return { date: laDate(l[col.date]), montant: m, libelle: String(l[col.libelle] ?? '').trim(), ref: col.ref >= 0 ? String(l[col.ref] ?? '').trim() : '' };
  });
}

/* ------------------------------------------------------------ vue principale */
VUES.banque = async (el) => {
  const [pointage, cnx] = await Promise.all([
    db.from('v_pointage').select('*'),
    db.from('connexions_bancaires').select('*')
  ]);
  const pt = verifier(pointage), connexions = verifier(cnx);
  const totalAT = pt.reduce((a, p) => a + Number(p.a_traiter || 0), 0);
  el.innerHTML = `
    <div class="tete-vue"><h1>🏦 Banque &amp; rapprochement</h1><div class="actions">
      <button class="btn btn-fantome" id="bq-pdf">🖨 PDF</button>
      <button class="btn btn-fantome" id="bq-rappr">🔗 Lancer le rapprochement</button>
      <button class="btn btn-primaire" id="bq-import">⬆ Importer un relevé</button></div></div>
    <div class="bascule" id="bq-onglets" style="margin-bottom:14px">
      <button data-o="mouvements" class="${filtre.onglet === 'mouvements' ? 'on' : ''}">Mouvements bancaires${totalAT ? ` (${totalAT})` : ''}</button>
      <button data-o="comptes" class="${filtre.onglet === 'comptes' ? 'on' : ''}">Comptes reliés</button>
      ${R.pro ? `<button data-o="emails" class="${filtre.onglet === 'emails' ? 'on' : ''}">E-mails liés</button>` : ''}</div>
    <div id="bq-contenu"></div>`;
  $('#bq-onglets').onclick = (e) => { const b = e.target.closest('button'); if (b) { filtre.onglet = b.dataset.o; router(); } };
  $('#bq-import').onclick = () => formImport();
  $('#bq-pdf').onclick = (e) => action(e.currentTarget, async () => {
    let q = db.from('transactions_bancaires').select('*').order('date_operation', { ascending: false }).limit(2000);
    if (filtre.compte) q = q.eq('compte_id', filtre.compte); if (filtre.statut) q = q.eq('statut', filtre.statut);
    const l = verifier(await q);
    await window.BFC_EXPORT.pdfTableau('Mouvements bancaires', filtre.compte ? compteParId(filtre.compte)?.nom : 'Tous les comptes', ['Date', 'Libellé bancaire', 'Provenance', 'Statut', 'Montant'],
      l.map(t => [fmtDate(t.date_operation), t.libelle_banque, tiersParId(t.tiers_id)?.nom || '', STATUTS_TB[t.statut], fmt(t.montant)]), `Mouvements_bancaires.pdf`, [4]);
  });
  $('#bq-rappr').onclick = (e) => action(e.currentTarget, async () => {
    const r = verifier(await db.rpc('rapprocher', { p_compte: filtre.compte || null }))?.[0] || {};
    toast(`Rapprochement : ${r.mouvements_rapproches || 0} mouvement(s), ${r.emails_rapproches || 0} e-mail(s), ${r.provenances_reconnues || 0} provenance(s) reconnue(s).`);
    router();
  });
  const c = $('#bq-contenu');
  if (filtre.onglet === 'comptes') return ongletComptes(c, pt, connexions);
  if (filtre.onglet === 'emails' && R.pro) return ongletEmails(c);
  return ongletMouvements(c);
};

async function ongletMouvements(c) {
  let q = db.from('transactions_bancaires').select('*').order('date_operation', { ascending: false }).limit(500);
  if (filtre.compte) q = q.eq('compte_id', filtre.compte);
  if (filtre.statut) q = q.eq('statut', filtre.statut);
  const liste = verifier(await q, 'Mouvements');
  c.innerHTML = `<div class="carte"><form class="filtres" id="bq-filtres">
      <div><label>Compte</label><select name="compte">${optsListe(R.comptes, filtre.compte, 'Tous')}</select></div>
      <div><label>Statut</label><select name="statut"><option value="">Tous</option>${opts(STATUTS_TB, filtre.statut)}</select></div></form>
    <div class="tableau-wrap"><table><thead><tr><th>Date</th><th>Libellé bancaire</th><th class="masquer-mobile">Compte</th><th>Statut</th><th class="montant">Montant</th><th></th></tr></thead><tbody>
    ${liste.map(t => { const ti = tiersParId(t.tiers_id); return `<tr data-id="${t.id}">
      <td>${fmtDate(t.date_operation)}</td>
      <td><div class="avec-image">${A.vignette(ti?.image_id, ti?.nom || t.libelle_banque)}<div><b>${esc(t.libelle_banque)}</b><div class="aide">${esc(ti?.nom || 'Provenance non reconnue')}${t.contrepartie ? ' · ' + esc(t.contrepartie) : ''}</div></div></div></td>
      <td class="masquer-mobile">${esc(compteParId(t.compte_id)?.nom || '')}</td>
      <td><span class="pastille ${t.statut === 'rapprochee' ? 'rec' : t.statut === 'ignoree' ? '' : 'orange'}">${STATUTS_TB[t.statut]}</span></td>
      <td class="montant ${t.montant > 0 ? 'positif' : 'negatif'}">${t.montant > 0 ? '+' : '−'}${fmt(Math.abs(t.montant))}</td>
      <td style="white-space:nowrap">${t.statut === 'a_traiter' ? `<button class="btn btn-primaire btn-petit" data-creer="${t.id}">Créer</button> <button class="btn btn-fantome btn-petit" data-associer="${t.id}">Associer</button> <button class="btn btn-fantome btn-petit" data-ignorer="${t.id}" title="Ignorer">✕</button>`
        : `<button class="btn btn-fantome btn-petit" data-reouvrir="${t.id}">Rouvrir</button>`}</td></tr>`; }).join('') || `<tr><td colspan="6" class="vide">Aucun mouvement${filtre.statut === 'a_traiter' ? ' à traiter' : ''}. Importez un relevé (CSV ou OFX) depuis l'espace en ligne de votre banque, Qonto, PayPal ou Stripe.</td></tr>`}
    </tbody></table></div></div>`;
  $('#bq-filtres').onchange = (e) => { filtre[e.target.name] = e.target.value; router(); };
  c.onclick = (e) => {
    const b = e.target.closest('button[data-creer],button[data-associer],button[data-ignorer],button[data-reouvrir]'); if (!b) return;
    const t = liste.find(x => x.id === (b.dataset.creer || b.dataset.associer || b.dataset.ignorer || b.dataset.reouvrir));
    if (b.dataset.creer) creerOperation(t);
    else if (b.dataset.associer) associer(t);
    else if (b.dataset.ignorer) action(b, async () => { verifier(await db.from('transactions_bancaires').update({ statut: 'ignoree' }).eq('id', t.id)); router(); });
    else action(b, async () => {
      if (t.operation_id) verifier(await db.from('operations').update({ transaction_id: null, statut: 'validee' }).eq('id', t.operation_id));
      verifier(await db.from('transactions_bancaires').update({ statut: 'a_traiter', operation_id: null }).eq('id', t.id)); router();
    });
  };
}

function creerOperation(t) {
  const ti = tiersParId(t.tiers_id);
  const compte = compteParId(t.compte_id);
  formOperation({ type: t.montant > 0 ? 'recette' : 'depense', montant: Math.abs(t.montant), date_operation: t.date_operation,
    libelle: ti ? `${ti.nom} – ${t.libelle_banque}`.slice(0, 120) : t.libelle_banque, compte_id: t.compte_id, tiers_id: t.tiers_id,
    categorie_id: ti?.categorie_defaut_id, moyen_paiement: compte?.type === 'paypal' ? 'paypal' : /PRLV|PRELEV/i.test(t.libelle_banque) ? 'prelevement' : /CB|CARTE/i.test(t.libelle_banque) ? 'carte' : /CHQ|CHEQUE/i.test(t.libelle_banque) ? 'cheque' : 'virement',
    reference: t.reference_externe.length < 40 ? t.reference_externe : null, transaction_id: t.id }, async (op) => {
    if (op) verifier(await db.from('transactions_bancaires').update({ operation_id: op.id, statut: 'rapprochee' }).eq('id', t.id));
    router();
  });
}

async function associer(t) {
  const d1 = new Date(t.date_operation); d1.setDate(d1.getDate() - 20); const d2 = new Date(t.date_operation); d2.setDate(d2.getDate() + 20);
  const iso = (d) => d.toISOString().slice(0, 10);
  const cands = verifier(await db.from('operations').select('*').eq('type', t.montant > 0 ? 'recette' : 'depense')
    .gte('date_operation', iso(d1)).lte('date_operation', iso(d2)).is('transaction_id', null).order('date_operation').limit(200));
  cands.sort((a, b) => Math.abs(a.montant - Math.abs(t.montant)) - Math.abs(b.montant - Math.abs(t.montant)));
  ouvrirModale('Associer à une opération', `<p><b>${esc(t.libelle_banque)}</b> · ${fmtDate(t.date_operation)} · <b>${fmt(t.montant)}</b></p>
    <div class="tableau-wrap"><table><tbody>${cands.slice(0, 30).map(o => `<tr><td>${fmtDate(o.date_operation)}</td><td>${esc(o.libelle)}<div class="aide">${esc(compteParId(o.compte_id)?.nom || '')}</div></td>
      <td class="montant ${Number(o.montant) === Math.abs(t.montant) ? 'positif' : ''}">${fmt(o.montant)}</td><td><button class="btn btn-bleu btn-petit" data-op="${o.id}">Associer</button></td></tr>`).join('')
      || '<tr><td class="vide">Aucune opération proche (±20 jours). Utilisez « Créer ».</td></tr>'}</tbody></table></div>
    <div class="modale-pied"><button class="btn btn-fantome" data-fermer>Fermer</button></div>`, (m) => {
    m.onclick = (e) => { const b = e.target.closest('[data-op]'); if (!b) return; action(b, async () => {
      verifier(await db.from('operations').update({ transaction_id: t.id, statut: 'rapprochee' }).eq('id', b.dataset.op));
      verifier(await db.from('transactions_bancaires').update({ operation_id: b.dataset.op, statut: 'rapprochee' }).eq('id', t.id));
      fermerModale(); toast('Mouvement rapproché.'); router();
    }); };
  });
}

/* ------------------------------------------------------------ import */
function formImport() {
  ouvrirModale('Importer un relevé bancaire', `<form id="f-imp">
    <div class="ligne"><div class="champ"><label>Compte *</label><select name="compte_id" required>${optsListe(R.comptes.filter(c => c.actif), filtre.compte || R.comptes.find(c => c.type === 'banque')?.id, 'Choisir…')}</select></div>
      <div class="champ"><label>Provenance du fichier</label><select name="fournisseur">${opts({ import: 'Banque (CSV / OFX)', qonto: 'Qonto (export CSV)', paypal: 'PayPal (rapport CSV)', stripe: 'Stripe (export CSV)' }, 'import')}</select></div></div>
    <div class="champ"><label>Fichier relevé *</label><input type="file" name="fichier" accept=".csv,.ofx,.qfx,.txt,text/csv" required>
      <div class="aide">Téléchargez le relevé depuis l'espace en ligne de la banque au format <b>CSV</b> ou <b>OFX</b> (Money/Quicken). Les doublons sont ignorés automatiquement.</div></div>
    <div id="imp-apercu"></div>
    <div class="modale-pied"><button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire" disabled>Importer</button></div></form>`, (m) => {
    const f = $('#f-imp', m); let mouvements = [];
    const rendre = (lignes, col, debut, entetes) => {
      mouvements = (lignes ? lireCsv(lignes, col, debut) : mouvements).filter(x => x.date && !isNaN(x.montant) && x.montant !== 0);
      const choix = (nom, i) => `<select data-col="${nom}" style="padding:6px">${['<option value="-1">—</option>', ...entetes.map((h, k) => `<option value="${k}" ${k === i ? 'selected' : ''}>${esc(h || 'colonne ' + (k + 1))}</option>`)].join('')}</select>`;
      $('#imp-apercu', m).innerHTML = (entetes ? `<div class="ligne3" style="margin-bottom:8px">
          <div><label>Date</label>${choix('date', col.date)}</div><div><label>Libellé</label>${choix('libelle', col.libelle)}</div><div><label>Montant (±)</label>${choix('montant', col.montant)}</div>
          <div><label>Débit</label>${choix('debit', col.debit)}</div><div><label>Crédit</label>${choix('credit', col.credit)}</div><div><label>Identifiant</label>${choix('ref', col.ref)}</div></div>` : '') +
        `<div class="aide"><b>${mouvements.length}</b> mouvement(s) reconnu(s) · entrées ${fmt(mouvements.filter(x => x.montant > 0).reduce((a, x) => a + x.montant, 0))} · sorties ${fmt(-mouvements.filter(x => x.montant < 0).reduce((a, x) => a + x.montant, 0))}</div>
        <div class="tableau-wrap" style="max-height:220px;overflow:auto"><table><tbody>${mouvements.slice(0, 8).map(x => `<tr><td>${fmtDate(x.date)}</td><td>${esc(x.libelle)}</td><td class="montant ${x.montant > 0 ? 'positif' : 'negatif'}">${fmt(x.montant)}</td></tr>`).join('')}</tbody></table></div>`;
      f.querySelector('.btn-primaire').disabled = !mouvements.length;
      if (entetes) $$('[data-col]', m).forEach(s => s.onchange = () => { col[s.dataset.col] = Number(s.value); rendre(lignes, col, debut, entetes); });
    };
    f.fichier.onchange = async () => {
      const fi = f.fichier.files[0]; if (!fi) return;
      const buf = await fi.arrayBuffer();
      let texte = new TextDecoder('utf-8').decode(buf);
      if (texte.includes('�')) texte = new TextDecoder('windows-1252').decode(buf);
      texte = texte.replace(/^﻿/, '');
      if (/<OFX>|<STMTTRN>/i.test(texte)) { mouvements = lireOfx(texte); rendre(null, null, 0, null); return; }
      const lignes = decouperCsv(texte);
      const debut = Math.max(0, lignes.findIndex(l => l.length >= 3 && l.some(x => /date/i.test(x))));
      const entetes = lignes[debut] || []; const col = devinerColonnes(entetes);
      rendre(lignes, col, debut + 1, entetes);
    };
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const compte_id = val(f, 'compte_id'), fournisseur = val(f, 'fournisseur');
      const vus = {};
      const lignes = mouvements.map(x => {
        let ref = x.ref;
        if (!ref) { const cle = `${x.date}|${x.montant}|${x.libelle}`; vus[cle] = (vus[cle] || 0) + 1; ref = 'h' + hash(cle + '|' + vus[cle]); }
        return { compte_id, source: fournisseur, date_operation: x.date, libelle_banque: x.libelle || '(sans libellé)', montant: Math.round(x.montant * 100) / 100, reference_externe: ref };
      });
      let ajoutes = 0;
      for (let i = 0; i < lignes.length; i += 500) {
        const r = verifier(await db.from('transactions_bancaires').upsert(lignes.slice(i, i + 500), { onConflict: 'compte_id,reference_externe', ignoreDuplicates: true }).select('id'), 'Import');
        ajoutes += (r || []).length;
      }
      await db.from('connexions_bancaires').upsert({ compte_id, fournisseur, statut: fournisseur === 'import' ? 'manuel' : 'a_configurer', derniere_synchro: new Date().toISOString(),
        libelle: FOURNISSEURS[fournisseur] }, { onConflict: 'compte_id,fournisseur' });
      const rr = verifier(await db.rpc('rapprocher', { p_compte: compte_id }))?.[0] || {};
      fermerModale();
      toast(`${ajoutes} nouveau(x) mouvement(s) importé(s) (${lignes.length - ajoutes} déjà présent(s)). ${rr.mouvements_rapproches || 0} rapproché(s) automatiquement.`);
      filtre.compte = compte_id; filtre.statut = 'a_traiter'; filtre.onglet = 'mouvements'; router();
    }); };
  });
}

/* ------------------------------------------------------------ comptes reliés */
function ongletComptes(c, pt, connexions) {
  c.innerHTML = `<div class="grille g3">${R.comptes.filter(x => x.actif).map(co => { const p = pt.find(x => x.compte_id === co.id) || {};
    const cx = connexions.filter(x => x.compte_id === co.id);
    return `<div class="carte compte-carte" style="border-top-color:${esc(co.couleur || '#2467b6')}"><h3 style="margin:0">${esc(co.nom)}</h3>
      <div class="aide">${esc(co.banque || A.TYPES_COMPTE[co.type])}${co.iban ? ' · ' + esc(co.iban) : ''}</div>
      <div style="margin:10px 0">${cx.map(x => `<div class="avec-image" style="margin-bottom:4px"><span class="pastille ${x.statut === 'actif' ? 'rec' : x.statut === 'manuel' ? '' : 'orange'}">${esc(FOURNISSEURS[x.fournisseur])} · ${STATUTS_CNX[x.statut]}</span></div>`).join('') || '<span class="aide">Aucune source reliée</span>'}</div>
      <div class="aide">${p.a_traiter ? `<b>${p.a_traiter}</b> mouvement(s) à traiter · ` : ''}${p.rapprochees || 0} rapproché(s)${p.derniere_synchro ? ' · dernier import ' + fmtDate(String(p.derniere_synchro).slice(0, 10)) : ''}</div>
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-fantome btn-petit" data-relier="${co.id}">＋ Relier une source</button></div></div>`; }).join('')}</div>
    <div class="carte mt"><h3>🔌 Connexion directe (étape 2)</h3>
      <p class="aide" style="margin-top:0">Aujourd'hui, les mouvements arrivent par import de relevés (CSV/OFX). La synchronisation automatique viendra à l'étape 2 :
      <b>Qonto</b> par son API, <b>PayPal</b> et <b>Stripe</b> par leurs API, les <b>banques traditionnelles</b> via un prestataire d'agrégation agréé (DSP2, autorisation à renouveler tous les 90 à 180 jours).
      Les clés d'accès seront rangées dans les secrets sécurisés de Supabase, jamais dans l'application.</p></div>`;
  c.onclick = (e) => { const b = e.target.closest('[data-relier]'); if (!b) return;
    ouvrirModale('Relier une source', `<form id="f-cx"><div class="champ"><label>Source</label><select name="fournisseur">${opts(FOURNISSEURS, 'import')}</select></div>
      <div class="champ"><label>Identifiant (facultatif)</label><input name="identifiant_externe" placeholder="IBAN masqué, n° de compte…"></div>
      <p class="aide">Les sources « API » et « agrégation » sont enregistrées « À configurer » : elles s'activeront à l'étape 2.</p>
      <div class="modale-pied"><button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
      const f = $('#f-cx', m);
      f.onsubmit = (ev) => { ev.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
        const fo = val(f, 'fournisseur');
        verifier(await db.from('connexions_bancaires').upsert({ compte_id: b.dataset.relier, fournisseur: fo, libelle: FOURNISSEURS[fo], identifiant_externe: val(f, 'identifiant_externe'),
          statut: fo === 'import' ? 'manuel' : 'a_configurer' }, { onConflict: 'compte_id,fournisseur' }));
        fermerModale(); toast('Source enregistrée.'); router();
      }); };
    });
  };
}

/* ------------------------------------------------------------ e-mails liés */
async function ongletEmails(c) {
  const [boites, mails] = await Promise.all([db.from('boites_mail').select('*').order('adresse'), db.from('emails_recus').select('*').order('recu_le', { ascending: false }).limit(200)]);
  const B = verifier(boites), M = verifier(mails);
  c.innerHTML = `<div class="grille g2">
    <div class="carte"><h3>📬 Boîtes mail liées</h3><div class="tableau-wrap"><table><tbody>
      ${B.map(b => `<tr data-id="${b.id}" style="cursor:pointer;${b.actif ? '' : 'opacity:.5'}"><td><b>${esc(b.adresse)}</b><div class="aide">${b.type === 'gmail' ? 'Gmail' : 'IMAP ' + esc(b.serveur_imap || '')}${b.notes ? ' · ' + esc(b.notes) : ''}</div></td>
        <td><span class="pastille ${b.statut === 'actif' ? 'rec' : 'orange'}">${{ a_configurer: 'À configurer', actif: 'Connectée', erreur: 'Erreur', desactive: 'Désactivée' }[b.statut]}</span></td></tr>`).join('')}
    </tbody></table></div><button class="btn btn-fantome btn-petit" id="bm-ajout" style="margin-top:10px">＋ Ajouter une adresse</button>
    <p class="aide">Les e-mails de ces boîtes servent à retrouver les factures (montant, expéditeur) et à les croiser avec les mouvements bancaires. La lecture automatique s'active à l'étape 2.</p></div>
    <div class="carte"><h3>🧾 Factures reçues par e-mail</h3><div class="tableau-wrap"><table><tbody>
      ${M.map(x => `<tr><td>${fmtDate(String(x.recu_le).slice(0, 10))}</td><td><b>${esc(x.objet || '(sans objet)')}</b><div class="aide">${esc(x.expediteur)}${x.tiers_id ? ' · ' + esc(tiersParId(x.tiers_id)?.nom || '') : ''}</div></td>
        <td class="montant">${x.montant_detecte ? fmt(x.montant_detecte) : ''}</td><td><span class="pastille ${x.statut === 'rapproche' ? 'rec' : 'orange'}">${{ a_traiter: 'À traiter', rapproche: 'Rapprochée', ignore: 'Ignorée' }[x.statut]}</span></td></tr>`).join('')
        || '<tr><td class="vide">Aucune facture reçue pour l\'instant.</td></tr>'}
    </tbody></table></div></div></div>`;
  const form = (b = {}) => ouvrirModale(b.id ? 'Boîte mail' : 'Ajouter une adresse e-mail', `<form id="f-bm">
    <div class="ligne"><div class="champ"><label>Adresse *</label><input name="adresse" type="email" required value="${esc(b.adresse || '')}"></div>
      <div class="champ"><label>Type</label><select name="type">${opts({ gmail: 'Gmail', imap: 'Autre (IMAP : Zimbra, Outlook…)' }, b.type || 'gmail')}</select></div></div>
    <div class="ligne"><div class="champ"><label>Serveur IMAP</label><input name="serveur_imap" value="${esc(b.serveur_imap || '')}" placeholder="ssl0.ovh.net"></div>
      <div class="champ"><label>Structure</label><select name="structure_code">${R.structures.map(s => `<option value="${s.code}" ${s.code === (b.structure_code || 'bformatik') ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></div></div>
    <div class="champ"><label>Notes</label><input name="notes" value="${esc(b.notes || '')}"></div>
    <div class="champ"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="actif" ${b.actif === false ? '' : 'checked'}> Active</label></div>
    <p class="aide">Aucun mot de passe n'est demandé ici : la connexion sécurisée (Google ou IMAP) se fera à l'étape 2, côté serveur.</p>
    <div class="modale-pied">${b.id ? '<button type="button" class="btn btn-danger gauche" id="bm-suppr">Supprimer</button>' : ''}<button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    const f = $('#f-bm', m);
    f.onsubmit = (ev) => { ev.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { adresse: val(f, 'adresse').toLowerCase(), type: val(f, 'type'), serveur_imap: val(f, 'serveur_imap'), structure_code: val(f, 'structure_code'), notes: val(f, 'notes'), actif: f.actif.checked };
      const r = b.id ? await db.from('boites_mail').update(rec).eq('id', b.id) : await db.from('boites_mail').insert(rec);
      if (r.error?.code === '23505') throw new Error('Cette adresse est déjà dans la liste.');
      verifier(r); fermerModale(); toast('Adresse enregistrée.'); router();
    }); };
    if (b.id) $('#bm-suppr', m).onclick = (ev) => action(ev.target, async () => { if (!await confirmer('Retirer cette adresse ?')) return; verifier(await db.from('boites_mail').delete().eq('id', b.id)); fermerModale(); router(); });
  });
  $('#bm-ajout').onclick = () => form();
  c.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) form(B.find(b => b.id === tr.dataset.id)); };
}
});
