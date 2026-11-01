/* B-ForCompt@ — Agenda des sorties et Messagerie (synthèse des boîtes mail + factures reçues) */
(window.BFC_MODULES = window.BFC_MODULES || []).push((A) => {
'use strict';
const { db, sb, C, R, $, esc, fmt, fmtDate, toast, verifier, action, val, num, uuid, nettoyerNom, ouvrirModale, fermerModale, confirmer, router, VUES, formOperation, compteParId, tiersParId, optsListe, opts } = A;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ================================================================ AGENDA */
const ag = { annee: new Date().getFullYear(), mois: new Date().getMonth(), entrees: false, compte: '' };
VUES.agenda = async (el) => {
  const debut = new Date(ag.annee, ag.mois, 1), fin = new Date(ag.annee, ag.mois + 1, 0);
  const [opsR, virR, propR] = await Promise.all([
    db.from('operations').select('id, type, montant, date_operation, libelle, compte_id, tiers_id, statut').gte('date_operation', iso(debut)).lte('date_operation', iso(fin)).limit(5000),
    db.from('virements').select('*').gte('date_virement', iso(debut)).lte('date_virement', iso(fin)).limit(2000),
    db.rpc('proprietaires_comptes')
  ]);
  const proprio = Object.fromEntries((verifier(propR) || []).map(p => [p.compte_id, p.proprietaires]));
  // mouvements du mois : sorties (dépenses + virements sortants) et, au choix, entrées
  const mvts = [];
  verifier(opsR).forEach(o => { if (o.type === 'depense' || ag.entrees) mvts.push({ jour: o.date_operation, compte: o.compte_id, montant: o.type === 'depense' ? -o.montant : +o.montant, libelle: o.libelle, prevue: o.statut === 'prevue', op: o }); });
  verifier(virR).forEach(v => {
    mvts.push({ jour: v.date_virement, compte: v.compte_source_id, montant: -v.montant, libelle: `Virement → ${compteParId(v.compte_destination_id)?.nom || ''}`, virement: true });
    if (ag.entrees) mvts.push({ jour: v.date_virement, compte: v.compte_destination_id, montant: +v.montant, libelle: `Virement ← ${compteParId(v.compte_source_id)?.nom || ''}`, virement: true });
  });
  const liste = mvts.filter(m => !ag.compte || m.compte === ag.compte);
  const parJour = {};
  liste.forEach(m => { (parJour[m.jour] ||= []).push(m); });
  const totSorties = liste.filter(m => m.montant < 0).reduce((a, m) => a - m.montant, 0);
  const totEntrees = liste.filter(m => m.montant > 0).reduce((a, m) => a + m.montant, 0);
  // synthèse par compte
  const parCompte = {};
  liste.forEach(m => { const x = parCompte[m.compte] ||= { s: 0, e: 0, n: 0 }; m.montant < 0 ? x.s -= m.montant : x.e += m.montant; x.n++; });

  const decal = (debut.getDay() + 6) % 7;
  const cases = [];
  for (let i = 0; i < decal; i++) cases.push('<div class="ag-case vide-case"></div>');
  for (let d = 1; d <= fin.getDate(); d++) {
    const j = iso(new Date(ag.annee, ag.mois, d)), items = parJour[j] || [];
    const groupes = {};
    items.forEach(m => { const g = groupes[m.compte] ||= { s: 0, e: 0 }; m.montant < 0 ? g.s -= m.montant : g.e += m.montant; });
    const totJ = items.reduce((a, m) => a + (m.montant < 0 ? -m.montant : 0), 0);
    const aujourdHui = j === iso(new Date());
    cases.push(`<div class="ag-case${items.length ? ' plein' : ''}${aujourdHui ? ' auj' : ''}" data-jour="${j}">
      <div class="ag-num">${d}${totJ ? `<span class="ag-tot">−${fmt(totJ)}</span>` : ''}</div>
      ${Object.entries(groupes).map(([cid, g]) => { const co = compteParId(cid);
        return `<div class="ag-ligne" style="border-left-color:${esc(co?.couleur || '#2467b6')}" title="${esc(co?.nom || '')} · ${esc(proprio[cid] || '')}">
          <span class="ag-compte">${esc(co?.nom || 'Compte')}<small>${esc(proprio[cid] || '')}</small></span>
          ${g.s ? `<b class="negatif">−${fmt(g.s)}</b>` : ''}${g.e ? `<b class="positif">+${fmt(g.e)}</b>` : ''}</div>`; }).join('')}
    </div>`);
  }
  el.innerHTML = `
    <div class="tete-vue"><h1>📅 Agenda des sorties</h1><div class="actions">
      <button class="btn btn-fantome" id="ag-prec">◀</button>
      <b style="min-width:150px;text-align:center;text-transform:capitalize">${MOIS[ag.mois]} ${ag.annee}</b>
      <button class="btn btn-fantome" id="ag-suiv">▶</button>
      <button class="btn btn-fantome" id="ag-auj">Aujourd'hui</button></div></div>
    <div class="carte"><form class="filtres" id="ag-filtres">
      <div><label>Compte</label><select name="compte">${optsListe(R.comptes, ag.compte, 'Tous les comptes', c => `${c.nom} · ${proprio[c.id] || ''}`)}</select></div>
      <div><label>Afficher</label><select name="entrees"><option value="">Sorties seulement</option><option value="1" ${ag.entrees ? 'selected' : ''}>Sorties et entrées</option></select></div>
      <div style="flex:2" class="aide">Sorties du mois <b class="negatif">−${fmt(totSorties)}</b>${ag.entrees ? ` · Entrées <b class="positif">+${fmt(totEntrees)}</b>` : ''} · ${liste.length} mouvement(s)</div></form>
    <div class="ag-grille">${JOURS.map(j => `<div class="ag-entete">${j}</div>`).join('')}${cases.join('')}</div></div>
    <div class="carte mt"><h3>Synthèse par compte — ${MOIS[ag.mois]} ${ag.annee}</h3><div class="tableau-wrap"><table>
      <thead><tr><th>Compte</th><th>Propriétaire(s)</th><th class="montant">Sorties</th>${ag.entrees ? '<th class="montant">Entrées</th>' : ''}<th class="montant">Mouvements</th></tr></thead><tbody>
      ${Object.entries(parCompte).sort((a, b) => b[1].s - a[1].s).map(([cid, x]) => { const co = compteParId(cid); return `<tr><td><span class="point" style="background:${esc(co?.couleur || '#999')}"></span> <b>${esc(co?.nom || '')}</b></td>
        <td>${esc(proprio[cid] || '')}</td><td class="montant negatif">−${fmt(x.s)}</td>${ag.entrees ? `<td class="montant positif">+${fmt(x.e)}</td>` : ''}<td class="montant">${x.n}</td></tr>`; }).join('') || `<tr><td colspan="5" class="vide">Aucune sortie ce mois-ci.</td></tr>`}
    </tbody></table></div></div>`;
  const aller = (dm) => { const d = new Date(ag.annee, ag.mois + dm, 1); ag.annee = d.getFullYear(); ag.mois = d.getMonth(); router(); };
  $('#ag-prec').onclick = () => aller(-1); $('#ag-suiv').onclick = () => aller(1);
  $('#ag-auj').onclick = () => { ag.annee = new Date().getFullYear(); ag.mois = new Date().getMonth(); router(); };
  $('#ag-filtres').onchange = (e) => { if (e.target.name === 'entrees') ag.entrees = !!e.target.value; else ag.compte = e.target.value; router(); };
  el.querySelector('.ag-grille').onclick = (e) => {
    const c = e.target.closest('.ag-case[data-jour]'); if (!c) return;
    const items = parJour[c.dataset.jour] || [];
    ouvrirModale(`Mouvements du ${fmtDate(c.dataset.jour)}`, `<div class="tableau-wrap"><table><tbody>
      ${items.map((m, i) => `<tr ${m.op ? `data-i="${i}" style="cursor:pointer"` : ''}><td><b>${esc(m.libelle)}</b>${m.prevue ? ' <span class="pastille orange">Prévue</span>' : ''}<div class="aide">${esc(compteParId(m.compte)?.nom || '')} · ${esc(proprio[m.compte] || '')}${m.op?.tiers_id ? ' · ' + esc(tiersParId(m.op.tiers_id)?.nom || '') : ''}</div></td>
        <td class="montant ${m.montant < 0 ? 'negatif' : 'positif'}">${m.montant < 0 ? '−' : '+'}${fmt(Math.abs(m.montant))}</td></tr>`).join('') || '<tr><td class="vide">Aucun mouvement ce jour.</td></tr>'}
      </tbody></table></div>
      <div class="modale-pied"><button class="btn btn-fantome" data-fermer>Fermer</button><button class="btn btn-primaire" id="ag-ajout">＋ Dépense ce jour</button></div>`, (m) => {
      m.querySelector('tbody').onclick = (ev) => { const tr = ev.target.closest('tr[data-i]'); if (tr) { const op = items[tr.dataset.i].op; fermerModale(); db.from('operations').select('*, documents(id)').eq('id', op.id).single().then(r => formOperation(r.data, router)); } };
      $('#ag-ajout', m).onclick = () => { fermerModale(); formOperation({ type: 'depense', date_operation: c.dataset.jour, compte_id: ag.compte || undefined }, router); };
    });
  };
};

/* ================================================================ MESSAGERIE */
const ms = { boite: '', statut: 'a_traiter' };
VUES.messagerie = async (el) => {
  if (!R.pro) { el.innerHTML = '<div class="carte">La messagerie est réservée aux comptes professionnels B-Form@tik.</div>'; return; }
  const [bR, mR] = await Promise.all([
    db.from('boites_mail').select('*').order('adresse'),
    db.from('emails_recus').select('*, documents:document_id(id, nom_fichier, storage_path)').order('recu_le', { ascending: false }).limit(1000)
  ]);
  const boites = verifier(bR), tous = verifier(mR);
  const stat = (b) => { const l = tous.filter(x => x.boite_id === b.id); return { total: l.length, at: l.filter(x => x.statut === 'a_traiter').length, ok: l.filter(x => x.statut === 'rapproche').length }; };
  const liste = tous.filter(x => (!ms.boite || x.boite_id === ms.boite) && (!ms.statut || x.statut === ms.statut));
  el.innerHTML = `
    <div class="tete-vue"><h1>✉️ Messagerie</h1><div class="actions">
      <button class="btn btn-fantome" id="ms-rappr">🔗 Rapprocher</button>
      <button class="btn btn-primaire" id="ms-ajout">＋ Ajouter une facture reçue</button></div></div>
    <div class="grille g3">
      ${boites.filter(b => b.actif).map(b => { const s = stat(b); return `<div class="carte kpi" data-boite="${b.id}" style="cursor:pointer;${ms.boite === b.id ? 'outline:3px solid var(--orange)' : ''}">
        <div class="lib">${b.type === 'gmail' ? '📧 Gmail' : '📨 IMAP'}</div><div style="font-weight:900;color:var(--marine);overflow-wrap:anywhere">${esc(b.adresse)}</div>
        <div class="det">${s.at ? `<b class="negatif">${s.at} à traiter</b> · ` : ''}${s.ok} rapproché(s) · ${s.total} reçu(s)</div>
        <div class="det">${b.statut === 'actif' ? '🟢 Lecture automatique active' : '🟠 Lecture automatique : étape 2'}</div></div>`; }).join('')}
    </div>
    <div class="carte mt"><form class="filtres" id="ms-filtres">
      <div><label>Boîte</label><select name="boite">${optsListe(boites, ms.boite, 'Toutes les boîtes', b => b.adresse)}</select></div>
      <div><label>Statut</label><select name="statut"><option value="">Tous</option>${opts({ a_traiter: 'À traiter', rapproche: 'Rapprochés', ignore: 'Ignorés' }, ms.statut)}</select></div></form>
    <div class="tableau-wrap"><table><thead><tr><th>Reçu le</th><th>Expéditeur / objet</th><th class="masquer-mobile">Pièce jointe</th><th class="montant">Montant</th><th>Statut</th><th></th></tr></thead><tbody>
    ${liste.map(x => `<tr data-id="${x.id}"><td>${fmtDate(String(x.recu_le).slice(0, 10))}</td>
      <td><b>${esc(x.objet || '(sans objet)')}</b><div class="aide">${esc(x.expediteur_nom || x.expediteur)}${x.tiers_id ? ' · ' + esc(tiersParId(x.tiers_id)?.nom || '') : ''} · ${esc(boites.find(b => b.id === x.boite_id)?.adresse || '')}</div></td>
      <td class="masquer-mobile">${x.documents ? `<a href="#" data-doc="${esc(x.documents.storage_path)}">📎 ${esc(x.documents.nom_fichier)}</a>` : '<span class="aide">—</span>'}</td>
      <td class="montant">${x.montant_detecte ? fmt(x.montant_detecte) : ''}</td>
      <td><span class="pastille ${x.statut === 'rapproche' ? 'rec' : x.statut === 'ignore' ? '' : 'orange'}">${{ a_traiter: 'À traiter', rapproche: 'Rapproché', ignore: 'Ignoré' }[x.statut]}</span></td>
      <td style="white-space:nowrap">${x.statut === 'a_traiter' ? `<button class="btn btn-primaire btn-petit" data-transferer="${x.id}">Transférer</button> <button class="btn btn-fantome btn-petit" data-ignorer="${x.id}">✕</button>` : x.operation_id ? '<span class="aide">lié à une opération</span>' : ''}</td></tr>`).join('')
      || `<tr><td colspan="6" class="vide">Aucun e-mail ${ms.statut === 'a_traiter' ? 'à traiter' : ''}. Les factures reçues dans les boîtes liées apparaîtront ici ; en attendant la lecture automatique (étape 2), ajoutez-les avec « Ajouter une facture reçue ».</td></tr>`}
    </tbody></table></div></div>`;
  el.querySelectorAll('[data-boite]').forEach(k => k.onclick = () => { ms.boite = ms.boite === k.dataset.boite ? '' : k.dataset.boite; router(); });
  $('#ms-filtres').onchange = (e) => { ms[e.target.name] = e.target.value; router(); };
  $('#ms-ajout').onclick = () => formFacture(boites);
  $('#ms-rappr').onclick = (e) => action(e.currentTarget, async () => { const r = verifier(await db.rpc('rapprocher', { p_compte: null }))?.[0] || {}; toast(`${r.emails_rapproches || 0} e-mail(s) rapproché(s).`); router(); });
  el.querySelector('tbody').onclick = async (e) => {
    const d = e.target.closest('[data-doc]'); if (d) { e.preventDefault(); const { data } = await sb.storage.from(C.bucketDocuments).createSignedUrl(d.dataset.doc, 300); if (data) window.open(data.signedUrl, '_blank', 'noopener'); return; }
    const ig = e.target.closest('[data-ignorer]'); if (ig) return action(ig, async () => { verifier(await db.from('emails_recus').update({ statut: 'ignore' }).eq('id', ig.dataset.ignorer)); router(); });
    const tr = e.target.closest('[data-transferer]'); if (tr) transferer(tous.find(x => x.id === tr.dataset.transferer));
  };
};

/* Transférer une facture reçue vers une opération (existante ou nouvelle) : le document suit */
async function transferer(x) {
  const ops = verifier(await db.from('operations').select('*').order('date_operation', { ascending: false }).limit(300));
  const proches = x.montant_detecte ? ops.filter(o => Math.abs(Number(o.montant) - Number(x.montant_detecte)) < 0.01) : [];
  ouvrirModale('Transférer la facture', `<p><b>${esc(x.objet || '')}</b><br><span class="aide">${esc(x.expediteur)} · ${fmtDate(String(x.recu_le).slice(0, 10))}${x.montant_detecte ? ' · ' + fmt(x.montant_detecte) : ''}</span></p>
    <h3 style="font-size:1rem">Opérations correspondantes</h3>
    <div class="tableau-wrap"><table><tbody>${(proches.length ? proches : ops.slice(0, 15)).map(o => `<tr><td>${fmtDate(o.date_operation)}</td><td>${esc(o.libelle)}<div class="aide">${esc(compteParId(o.compte_id)?.nom || '')}</div></td>
      <td class="montant">${fmt(o.montant)}</td><td><button class="btn btn-bleu btn-petit" data-op="${o.id}">Joindre</button></td></tr>`).join('')}</tbody></table></div>
    <div class="modale-pied"><button class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire" id="tr-nouvelle">＋ Créer une dépense avec ce document</button></div>`, (m) => {
    const lier = async (opId) => {
      verifier(await db.from('emails_recus').update({ operation_id: opId, statut: 'rapproche' }).eq('id', x.id));
      if (x.document_id) verifier(await db.from('documents').update({ operation_id: opId }).eq('id', x.document_id));
    };
    m.querySelector('tbody').onclick = (e) => { const b = e.target.closest('[data-op]'); if (b) action(b, async () => { await lier(b.dataset.op); fermerModale(); toast('Facture jointe à l\'opération.'); router(); }); };
    $('#tr-nouvelle', m).onclick = () => { fermerModale();
      formOperation({ type: 'depense', montant: x.montant_detecte || undefined, date_operation: String(x.recu_le).slice(0, 10), libelle: x.objet || x.expediteur, tiers_id: x.tiers_id, reference: x.reference_detectee },
        async (op) => { if (op) { await lier(op.id); toast('Dépense créée et facture jointe.'); } router(); }); };
  });
}

/* Ajout manuel d'une facture reçue par e-mail (en attendant la lecture automatique) */
function formFacture(boites) {
  ouvrirModale('Ajouter une facture reçue', `<form id="f-fr">
    <div class="ligne"><div class="champ"><label>Boîte de réception</label><select name="boite_id">${optsListe(boites, boites[0]?.id, '—', b => b.adresse)}</select></div>
      <div class="champ"><label>Reçu le</label><input type="date" name="recu_le" value="${A.auj()}"></div></div>
    <div class="ligne"><div class="champ"><label>Expéditeur (e-mail) *</label><input name="expediteur" type="email" required placeholder="factures@edf.fr"></div>
      <div class="champ"><label>Montant (€)</label><input name="montant" inputmode="decimal"></div></div>
    <div class="champ"><label>Objet</label><input name="objet" placeholder="Votre facture d'octobre"></div>
    <div class="champ"><label>Facture (PDF ou photo)</label><input type="file" name="fichier" accept="application/pdf,image/*"></div>
    <div class="modale-pied"><button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Ajouter</button></div></form>`, (m) => {
    const f = $('#f-fr', m);
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      let document_id = null; const fi = f.fichier.files[0];
      if (fi) {
        const d = new Date(); const chemin = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${uuid()}-${nettoyerNom(fi.name)}`;
        const up = await sb.storage.from(C.bucketDocuments).upload(chemin, fi, { contentType: fi.type || undefined }); if (up.error) throw up.error;
        document_id = verifier(await db.from('documents').insert({ type: 'facture', nom_fichier: fi.name, storage_path: chemin, mime_type: fi.type, taille_octets: fi.size, date_document: val(f, 'recu_le'), montant: num(f, 'montant') }).select('id').single()).id;
      }
      verifier(await db.from('emails_recus').insert({ boite_id: val(f, 'boite_id'), message_id: 'manuel-' + uuid(), expediteur: val(f, 'expediteur').toLowerCase(), objet: val(f, 'objet'),
        recu_le: val(f, 'recu_le'), montant_detecte: num(f, 'montant'), document_id }), 'Facture reçue');
      const r = verifier(await db.rpc('rapprocher', { p_compte: null }))?.[0] || {};
      fermerModale(); toast(`Facture ajoutée.${r.emails_rapproches ? ' Rapprochée automatiquement avec un mouvement bancaire.' : ''}`); router();
    }); };
  });
}
});
