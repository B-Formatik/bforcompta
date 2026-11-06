/* B-S@fe — Assistant de vie : « Aujourd'hui », espaces de vie, factures à venir (échéancier),
   reste à vivre, alertes (vigilance), épargne & investissement, documents par espace */
(window.BFC_MODULES = window.BFC_MODULES || []).push((A) => {
'use strict';
const { sb, db, R, $, $$, esc, fmt, fmtDate, auj, opts, optsListe, toast, verifier, action, val, num, ouvrirModale, fermerModale, confirmer,
  router, VUES, formOperation, chargerSoldes, compteParId, espaceParCode, televerserDocuments, ouvrirDocument, supprimerDocument, TYPES_DOC, MOIS_LONG, MOYENS } = A;

const FREQ = { mensuelle: 'Chaque mois', bimestrielle: 'Tous les 2 mois', trimestrielle: 'Tous les 3 mois', semestrielle: 'Tous les 6 mois', annuelle: 'Chaque année', hebdomadaire: 'Chaque semaine', ponctuelle: 'Une seule fois' };
const STATUT_OCC = { payee: ['✅ Payée', 'rec'], a_venir: ['À venir', ''], due: ['À payer', 'orange'], en_retard: ['⚠️ En retard', 'dep'], sautee: ['⏭ Sautée', ''] };
const NIVEAU = { urgent: '🚨', attention: '⚠️', info: 'ℹ️' };
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const LIENS_ESPACE = {
  quotidien: [['#/monagenda', '🗓️ Mon agenda'], ['#/courses', '🛒 Courses']],
  enfants: [['#/enfants', '👨‍👩‍👧 Planning des tâches']],
  travail: [['#/pieces', '📄 Factures & devis'], ['#/tableau', '📊 Tableau de bord']],
  foyer: [['#/foyer', '🏡 Mon foyer'], ['#/comptes', '🏦 Comptes perso & joints']],
  epargne: [['#/comptes', '🏦 Comptes épargne']],
  cuisine: [['#/cuisine', '🍽️ Menus & recettes'], ['#/courses', '🛒 Courses']],
  sport: [['#/sport', '🏃 Suivi sportif']]
};
const dateDe = (s) => new Date(String(s).slice(0, 10) + 'T12:00:00');
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusJours = (s, n) => { const d = dateDe(s); d.setDate(d.getDate() + n); return iso(d); };
const joursTxt = (n) => n === 0 ? 'aujourd\'hui' : n === 1 ? 'demain' : n > 1 ? `dans ${n} j` : n === -1 ? 'hier' : `il y a ${-n} j`;
const jjmm = (s) => { const d = dateDe(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
const esp = (code) => espaceParCode(code) || { code, nom: code || '—', icone: '📁', couleur: '#64748b' };
const tagEspace = (code, court = false) => { const e = esp(code); return `<span class="pastille" style="background:${e.couleur}1f;color:${e.couleur}" title="${esc(e.nom)}">${e.icone}${court ? '' : ' ' + esc(e.nom)}</span>`; };
const multiligne = (t) => esc(t || '').replace(/\n/g, '<br>');

/* Lecture tolérante : si la base n'a pas encore le script 07, on affiche une explication plutôt qu'une erreur */
let baseManquante = false;
function doux(res) { if (res.error) { console.warn(res.error); if (/does not exist|schema cache|Could not find/i.test(res.error.message || '')) baseManquante = true; return null; } return res.data; }
const msgBase = `<div class="carte"><h3>🛠️ Mise à jour de la base nécessaire</h3><p>Le module « Assistant » a besoin du script <b>07_assistant.sql</b> dans Supabase.</p></div>`;

/* ---------------------------------------------------------------- démarrage : badge + temps réel */
let demarre = false;
async function majBadge() {
  const b = $('#badge-alertes'); if (!b) return;
  const { count } = await db.from('alertes').select('id', { count: 'exact', head: true }).eq('lue', false);
  b.hidden = !count; b.textContent = count > 99 ? '99+' : (count || '');
}
function demarrer() {
  if (demarre) return; demarre = true;
  majBadge().catch(() => {});
  try {
    sb.channel('bfc-assistant')
      .on('postgres_changes', { event: 'INSERT', schema: 'bforcompta', table: 'alertes' }, (p) => {
        const a = p.new || {}; toast(`${NIVEAU[a.niveau] || '🔔'} ${a.titre || 'Nouvelle alerte'}`, a.niveau === 'urgent');
        majBadge().catch(() => {});
        if (/^#\/?(aujourdhui)?$/.test(location.hash)) router();
      })
      .on('postgres_changes', { event: '*', schema: 'bforcompta', table: 'echeances' }, () => { if (/echeances|aujourdhui|espace/.test(location.hash)) router(); })
      .subscribe();
  } catch (e) { console.warn(e); }
}

/* ---------------------------------------------------------------- actions sur une échéance */
async function pointer(o, statut, opId = null, montant = null) {
  verifier(await db.from('echeances_pointages').upsert({ echeance_id: o.echeance_id, date_prevue: o.date_prevue, statut, operation_id: opId, montant }, { onConflict: 'echeance_id,date_prevue' }), 'Pointage');
}
function payer(o) {
  formOperation({ type: o.sens, montant: o.montant, date_operation: auj(), libelle: o.libelle, compte_id: o.compte_id || undefined, tiers_id: o.tiers_id,
    categorie_id: o.categorie_id, moyen_paiement: o.moyen_paiement, espace: o.espace }, async (op) => {
    if (!op) return; await pointer(o, 'payee', op.id, op.montant); toast('Facture pointée comme payée.'); router();
  });
}
function ligneOcc(o, i, avecActions = true) {
  const [lib, cls] = STATUT_OCC[o.statut] || [o.statut, ''];
  const rec = o.sens === 'recette';
  return `<div class="occ ${o.statut}">
    <div class="occ-date"><b>${jjmm(o.date_prevue)}</b><span>${joursTxt(o.jours)}</span></div>
    <div class="occ-lib">${tagEspace(o.espace, true)} <b>${esc(o.libelle)}</b>${rec ? ' <span class="pastille rec">rentrée</span>' : ''}<div class="aide">${o.compte_id ? esc(compteParId(o.compte_id)?.nom || '') : 'compte non précisé'}</div></div>
    <div class="occ-mt ${rec ? 'pos' : ''}">${rec ? '+' : '−'}${fmt(o.montant_reel ?? o.montant)}</div>
    <div class="occ-st"><span class="pastille ${cls}">${lib}</span></div>
    ${avecActions ? `<div class="occ-act">${['a_venir', 'due', 'en_retard'].includes(o.statut)
      ? `<button class="btn btn-petit btn-primaire" data-occ="${i}" data-a="payer" title="Enregistrer le paiement">${rec ? '💶 Reçu' : '💳 Payer'}</button>
         <button class="btn btn-petit btn-fantome" data-occ="${i}" data-a="deja" title="Déjà payée (sans saisir l'opération)">✓</button>
         <button class="btn btn-petit btn-fantome" data-occ="${i}" data-a="sauter" title="Pas de facture cette fois">⏭</button>`
      : `<button class="btn btn-petit btn-fantome" data-occ="${i}" data-a="annuler" title="Revenir à « à payer »">↺</button>`}</div>` : ''}
  </div>`;
}
function brancherOcc(el, liste) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-occ]'); if (!b) return;
    const o = liste[+b.dataset.occ];
    if (b.dataset.a === 'payer') return payer(o);
    action(b, async () => {
      if (b.dataset.a === 'deja') { await pointer(o, 'payee'); toast('Marquée comme payée.'); }
      if (b.dataset.a === 'sauter') { await pointer(o, 'sautee'); toast('Échéance sautée pour cette fois.'); }
      if (b.dataset.a === 'annuler') { verifier(await db.from('echeances_pointages').delete().eq('echeance_id', o.echeance_id).eq('date_prevue', o.date_prevue)); toast('Pointage annulé.'); }
      router();
    });
  });
}

/* ---------------------------------------------------------------- suggestions (factures récurrentes détectées) */
const ignorees = () => { try { return JSON.parse(localStorage.getItem('bfc-detect-ignorees') || '[]'); } catch { return []; } };
function ignorer(cle) { try { localStorage.setItem('bfc-detect-ignorees', JSON.stringify([...ignorees(), cle])); } catch {} }
function htmlSuggestions(det) {
  return det.map((d, i) => `<div class="sugg"><div>${tagEspace(d.espace, true)} <b>${esc(d.libelle)}</b>
      <div class="aide">${d.sens === 'recette' ? 'Rentrée' : 'Paiement'} d'environ <b>${fmt(d.montant)}</b> vers le ${d.jour} de chaque mois · vu ${d.nb_mois} mois${d.variable ? ' · montant variable' : ''}</div></div>
      <div class="occ-act"><button class="btn btn-petit btn-primaire" data-sugg="${i}" data-a="ajouter">＋ Ajouter</button><button class="btn btn-petit btn-fantome" data-sugg="${i}" data-a="ignorer">Ignorer</button></div></div>`).join('');
}
function brancherSugg(el, det) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sugg]'); if (!b) return;
    const d = det[+b.dataset.sugg];
    if (b.dataset.a === 'ignorer') { ignorer(d.cle); b.closest('.sugg').remove(); return; }
    action(b, async () => {
      verifier(await db.from('echeances').insert({ libelle: d.libelle, sens: d.sens, montant: d.montant, montant_variable: !!d.variable, frequence: 'mensuelle',
        premiere_date: d.prochaine, tiers_id: d.tiers_id, categorie_id: d.categorie_id, compte_id: d.compte_id, espace: d.espace || 'quotidien',
        mot_cle: d.tiers_id ? null : String(d.cle || '').trim().slice(0, 60) || null, origine: 'detection' }), 'Ajout');
      toast(`« ${d.libelle} » ajoutée aux factures à venir.`); router();
    });
  });
}

/* ================================================================ AUJOURD'HUI */
const st = { perim: 'perso' };
VUES.aujourdhui = async (el) => {
  demarrer();
  if (!R.pro) st.perim = 'perso';
  const today = auj();
  await db.rpc('verifier_echeances').then(() => {}, () => {});
  const [rav, alertes, occ, agenda, planning, courses, det] = (await Promise.all([
    db.rpc('reste_a_vivre', { p_perimetre: st.perim }),
    db.from('alertes').select('*').eq('lue', false).order('created_at', { ascending: false }).limit(30),
    db.rpc('occurrences_echeances', { p_debut: plusJours(today, -60), p_fin: plusJours(today, 30) }),
    db.from('v_agenda_priorites').select('*').in('statut', ['a_faire', 'en_cours']).order('score', { ascending: false }).limit(50),
    db.from('planning_taches').select('*, enfants(prenom, couleur), taches_menageres(nom, icone)').eq('jour', today),
    db.from('listes_courses').select('id, titre, date_prevue, heure_prevue, total_estime, statut').in('statut', ['programmee', 'en_cours']).gte('date_prevue', today).lte('date_prevue', plusJours(today, 7)).order('date_prevue'),
    db.rpc('detecter_echeances')
  ])).map(doux);
  if (baseManquante && !rav) { el.innerHTML = msgBase; return; }
  majBadge().catch(() => {});

  const d = new Date(), h = d.getHours();
  const salut = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const dateLongue = `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  const pending = (occ || []).filter(o => ["en_retard", "due", "a_venir"].includes(o.statut));
  const aPayer = pending.filter(o => o.sens === 'depense');
  const retard = aPayer.filter(o => o.statut === 'en_retard');
  const agendaJour = (agenda || []).filter(t => t.echeance && t.echeance.slice(0, 10) <= today).slice(0, 8);
  const agendaAutres = (agenda || []).filter(t => !agendaJour.includes(t)).slice(0, Math.max(0, 5 - agendaJour.length));
  const detVisibles = (det || []).filter(x => !ignorees().includes(x.cle)).slice(0, 6);
  const r = rav || { disponible: 0, solde: 0, factures: 0, courses: 0, epargne: 0, jusqua: today, jours: 1, par_jour: 0 };
  const negatif = r.disponible < 0;

  el.innerHTML = `<div class="tete-vue"><div><h1>☀️ ${salut} !</h1><div class="aide" style="font-size:.95rem">${dateLongue}</div></div><div class="actions">
      ${R.pro ? `<select id="aj-perim" style="width:auto">${opts({ perso: '🔒 Perso & joints', pro: '🏢 Professionnel', tout: 'Tout' }, st.perim)}</select>` : ''}
      <button class="btn btn-fantome" id="aj-pdf">🖨 PDF</button><button class="btn btn-bleu" id="aj-scan">📸 Ticket / facture</button><button class="btn btn-primaire" id="aj-dep">＋ Dépense</button></div></div>
    <div class="aj-grille">
      <div class="aj-col">
        <div class="carte kpi principal rav ${negatif ? 'negatif' : ''}">
          <div class="lib">Disponible réel jusqu'au ${fmtDate(r.jusqua)}</div>
          <div class="val rav-val">${fmt(r.disponible)}</div>
          <div class="det">soit ≈ ${fmt(r.par_jour)} par jour pendant ${r.jours} jour${r.jours > 1 ? 's' : ''}</div>
          <div class="rav-calc"><span>Sur les comptes</span><b>${fmt(r.solde)}</b><span>− Factures à venir${r.dont_retard > 0 ? ` (dont ${fmt(r.dont_retard)} en retard)` : ''}</span><b>${fmt(r.factures)}</b>
            <span>− Courses programmées</span><b>${fmt(r.courses)}</b>${r.epargne ? `<span>🐷 Épargne de côté (non comptée)</span><b>${fmt(r.epargne)}</b>` : ''}</div>
        </div>
        <div class="carte"><h3>🔔 Alertes ${alertes?.length ? `<span class="pastille dep">${alertes.length}</span><button class="btn btn-petit btn-fantome" id="aj-tout-lu" style="margin-left:auto">Tout marquer comme vu</button>` : ''}</h3>
          <div id="aj-alertes">${(alertes || []).map(a => `<div class="alerte-ligne niv-${a.niveau}"><div><b>${NIVEAU[a.niveau] || '🔔'} ${esc(a.titre)}</b>${a.espace ? ' ' + tagEspace(a.espace, true) : ''}
              <div class="msg">${multiligne(a.message)}</div><span class="aide">${fmtDate(a.created_at.slice(0, 10))}</span></div>
              <button class="btn btn-petit btn-fantome" data-lu="${a.id}" title="Marquer comme vu">✓ Vu</button></div>`).join('') || '<div class="vide">Rien à signaler. 👍</div>'}</div></div>
        <div class="carte"><h3>📆 Factures à venir <span class="aide">${aPayer.length} à payer · ${fmt(aPayer.reduce((s, o) => s + Number(o.montant), 0))}${retard.length ? ` · <b style="color:var(--rouge)">${retard.length} en retard</b>` : ''}</span><a href="#/echeances" class="btn btn-petit btn-fantome" style="margin-left:auto">Tout voir →</a></h3>
          <div id="aj-occ">${pending.slice(0, 12).map((o, i) => ligneOcc(o, i)).join('') || `<div class="vide">Aucune facture enregistrée pour les 30 prochains jours.<br><button class="btn btn-primaire" id="aj-ech" style="margin-top:10px">＋ Ajouter une facture régulière</button></div>`}</div></div>
      </div>
      <div class="aj-col">
        ${detVisibles.length ? `<div class="carte sugg-carte"><h3>🔍 J'ai repéré ${detVisibles.length} paiement${detVisibles.length > 1 ? 's' : ''} qui revien${detVisibles.length > 1 ? 'nent' : 't'} chaque mois</h3><div id="aj-sugg">${htmlSuggestions(detVisibles)}</div></div>` : ''}
        <div class="carte"><h3>🗓️ Mon agenda <a href="#/monagenda" class="btn btn-petit btn-fantome" style="margin-left:auto">Ouvrir →</a></h3>
          ${agendaJour.length ? '<div class="aide" style="margin-bottom:6px">Aujourd\'hui et en retard</div>' : ''}
          ${[...agendaJour, ...agendaAutres].map(t => `<div class="aj-item"><span class="pastille ${t.urgence >= 4 ? 'dep' : t.urgence >= 3 ? 'orange' : ''}">${t.echeance ? (t.echeance.slice(0, 10) < today ? 'En retard' : t.echeance.slice(0, 10) === today ? (t.echeance.slice(11, 16) || 'Auj.') : jjmm(t.echeance)) : 'Sans date'}</span>
            <b>${esc(t.titre)}</b>${t.categorie ? ` <span class="aide">${esc(t.categorie)}</span>` : ''}</div>`).join('') || '<div class="vide">Rien de prévu.</div>'}</div>
        <div class="carte"><h3>👨‍👩‍👧 Les enfants aujourd'hui <a href="#/enfants" class="btn btn-petit btn-fantome" style="margin-left:auto">Planning →</a></h3>
          ${(planning || []).length ? Object.values((planning || []).reduce((m, p) => { const k = p.enfant_id; (m[k] ||= { e: p.enfants, l: [] }).l.push(p); return m; }, {})).map(g => `<div class="aj-item"><b style="color:${g.e?.couleur || 'inherit'}">${esc(g.e?.prenom || '?')}</b>
            ${g.l.map(p => `<span class="pastille ${p.statut === 'fait' ? 'rec' : ''}">${p.taches_menageres?.icone || ''} ${esc(p.taches_menageres?.nom || '')}${p.statut === 'fait' ? ' ✓' : ''}</span>`).join(' ')}</div>`).join('') : '<div class="vide">Pas de tâches prévues aujourd\'hui.</div>'}</div>
        <div class="carte"><h3>🛒 Courses de la semaine <a href="#/courses" class="btn btn-petit btn-fantome" style="margin-left:auto">Ouvrir →</a></h3>
          ${(courses || []).map(c => `<div class="aj-item"><span class="pastille">${jjmm(c.date_prevue)}${c.heure_prevue ? ' ' + c.heure_prevue.slice(0, 5) : ''}</span> <b>${esc(c.titre)}</b> <span class="aide">≈ ${fmt(c.total_estime)}</span></div>`).join('') || '<div class="vide">Aucune course programmée.</div>'}</div>
      </div>
    </div>`;

  $('#aj-perim') && ($('#aj-perim').onchange = (e) => { st.perim = e.target.value; router(); });
  $('#aj-dep').onclick = () => formOperation({ type: 'depense' }, () => router());
  $('#aj-scan').onclick = () => scanner();
  $('#aj-ech') && ($('#aj-ech').onclick = () => formEcheance({}));
  brancherOcc($('#aj-occ'), pending);
  $('#aj-sugg') && brancherSugg($('#aj-sugg'), detVisibles);
  $('#aj-alertes').onclick = (e) => { const b = e.target.closest('[data-lu]'); if (!b) return;
    action(b, async () => { verifier(await db.from('alertes').update({ lue: true }).eq('id', b.dataset.lu)); b.closest('.alerte-ligne').remove(); majBadge(); }); };
  $('#aj-tout-lu') && ($('#aj-tout-lu').onclick = (e) => action(e.target, async () => { verifier(await db.from('alertes').update({ lue: true }).eq('lue', false)); router(); }));
  $('#aj-pdf').onclick = (e) => action(e.target, async () => {
    const L = [['Disponible réel', `jusqu'au ${fmtDate(r.jusqua)} (≈ ${fmt(r.par_jour)}/jour)`, fmt(r.disponible)], ['Sur les comptes', '', fmt(r.solde)], ['Factures à venir', '', '-' + fmt(r.factures)], ['Courses programmées', '', '-' + fmt(r.courses)]];
    (alertes || []).forEach(a => L.push(['Alerte', `${a.titre} — ${(a.message || '').split('\n')[0]}`, '']));
    pending.forEach(o => L.push([`Facture ${jjmm(o.date_prevue)}`, `${o.libelle} (${(STATUT_OCC[o.statut] || [o.statut])[0]})`, (o.sens === 'recette' ? '+' : '-') + fmt(o.montant)]));
    [...agendaJour, ...agendaAutres].forEach(t => L.push(['Agenda', t.titre + (t.echeance ? ' — ' + fmtDate(t.echeance.slice(0, 10)) : ''), '']));
    (planning || []).forEach(p => L.push(['Enfants', `${p.enfants?.prenom || ''} : ${p.taches_menageres?.nom || ''}${p.statut === 'fait' ? ' (fait)' : ''}`, '']));
    (courses || []).forEach(c => L.push(['Courses', `${c.titre} — ${fmtDate(c.date_prevue)}`, fmt(c.total_estime)]));
    await window.BFC_EXPORT.pdfTableau('Point du jour', dateLongue, ['Rubrique', 'Détail', 'Montant'], L, `Point_du_jour_${today}.pdf`, [2]);
  });
};

/* ================================================================ FACTURES À VENIR (échéancier) */
const ec = { onglet: 'calendrier', espace: '' };
VUES.echeances = async (el) => {
  demarrer();
  const today = auj();
  const [liste, occ, det] = (await Promise.all([
    db.from('echeances').select('*').order('actif', { ascending: false }).order('libelle'),
    db.rpc('occurrences_echeances', { p_debut: plusJours(today, -60), p_fin: plusJours(today, 92) }),
    db.rpc('detecter_echeances')
  ])).map(doux);
  if (baseManquante && !liste) { el.innerHTML = msgBase; return; }
  const filtre = (x) => !ec.espace || x.espace === ec.espace;
  const occF = (occ || []).filter(filtre).filter(o => o.statut !== 'payee' || o.date_prevue >= plusJours(today, -31));
  const detV = (det || []).filter(x => !ignorees().includes(x.cle));
  const prochaine = (id) => (occ || []).find(o => o.echeance_id === id && ['a_venir', 'due', 'en_retard'].includes(o.statut));
  const parMois = occF.reduce((m, o) => { const k = o.date_prevue.slice(0, 7); (m[k] ||= []).push(o); return m; }, {});

  el.innerHTML = `<div class="tete-vue"><h1>📆 Factures à venir</h1><div class="actions">
      <select id="ec-espace" style="width:auto"><option value="">Tous les espaces</option>${R.espaces.map(e => `<option value="${e.code}" ${e.code === ec.espace ? 'selected' : ''}>${e.icone} ${esc(e.nom)}</option>`).join('')}</select>
      <button class="btn btn-fantome" id="ec-pdf">🖨 PDF</button><button class="btn btn-primaire" id="ec-nouveau">＋ Facture régulière</button></div></div>
    <div class="bascule" id="ec-onglets" style="margin-bottom:14px">${[['calendrier', '📆 Calendrier'], ['liste', '🧾 Mes factures régulières'], ['detect', `🔍 Détectées${detV.length ? ' (' + detV.length + ')' : ''}`]].map(([k, l]) => `<button data-o="${k}" class="${ec.onglet === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="ec-contenu"></div>`;
  const c = $('#ec-contenu');
  if (ec.onglet === 'calendrier') {
    const tout = [];
    c.innerHTML = Object.entries(parMois).map(([k, l]) => {
      const [a, m] = k.split('-'); const ap = l.filter(o => o.sens === 'depense' && o.statut !== 'payee' && o.statut !== 'sautee').reduce((s, o) => s + Number(o.montant), 0);
      const pay = l.filter(o => o.statut === 'payee' && o.sens === 'depense').reduce((s, o) => s + Number(o.montant_reel ?? o.montant), 0);
      const html = `<div class="carte"><h3>${MOIS_LONG[+m - 1]} ${a} <span class="aide">à payer ${fmt(ap)} · déjà payé ${fmt(pay)}</span></h3>${l.map(o => ligneOcc(o, tout.push(o) - 1)).join('')}</div>`;
      return html;
    }).join('<div style="height:14px"></div>') || `<div class="carte vide">Aucune facture régulière${ec.espace ? ' dans cet espace' : ''}.<br>Ajoutez vos factures (électricité, eau, loyer, assurance…) ou regardez l'onglet « Détectées ».</div>`;
    brancherOcc(c, tout);
  } else if (ec.onglet === 'liste') {
    const l = (liste || []).filter(filtre);
    c.innerHTML = `<div class="carte"><div class="tableau-wrap"><table><thead><tr><th>Facture</th><th class="masquer-mobile">Espace</th><th>Fréquence</th><th>Prochaine</th><th class="montant">Montant</th><th class="masquer-mobile">Compte</th></tr></thead><tbody>
      ${l.map(e => { const p = prochaine(e.id); return `<tr data-id="${e.id}" class="cliquable ${e.actif ? '' : 'inactif'}"><td><b>${esc(e.libelle)}</b>${e.sens === 'recette' ? ' <span class="pastille rec">rentrée</span>' : ''}${e.origine === 'detection' ? ' <span class="aide">détectée</span>' : ''}</td>
        <td class="masquer-mobile">${tagEspace(e.espace)}</td><td>${FREQ[e.frequence]}</td><td>${p ? `${fmtDate(p.date_prevue)} <span class="aide">${joursTxt(p.jours)}</span>` : '—'}</td>
        <td class="montant">${e.montant_variable ? '≈ ' : ''}${fmt(e.montant)}</td><td class="masquer-mobile">${esc(compteParId(e.compte_id)?.nom || '—')}</td></tr>`; }).join('') || '<tr><td colspan="6" class="vide">Aucune facture régulière.</td></tr>'}
      </tbody></table></div></div>`;
    c.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) formEcheance(liste.find(x => x.id === tr.dataset.id)); };
  } else {
    c.innerHTML = `<div class="carte"><p class="aide" style="margin-top:0">L'assistant cherche dans vos 13 derniers mois les paiements qui reviennent (même provenance ou même libellé, au moins 3 mois, montant et jour réguliers).</p>
      <div id="ec-sugg">${htmlSuggestions(detV) || '<div class="vide">Rien de nouveau détecté. Plus vous enregistrez d\'opérations, plus la détection est fiable.</div>'}</div></div>`;
    brancherSugg($('#ec-sugg'), detV);
  }
  $('#ec-onglets').onclick = (e) => { const b = e.target.closest('button'); if (b) { ec.onglet = b.dataset.o; router(); } };
  $('#ec-espace').onchange = (e) => { ec.espace = e.target.value; router(); };
  $('#ec-nouveau').onclick = () => formEcheance({ espace: ec.espace || undefined });
  $('#ec-pdf').onclick = (e) => action(e.target, () => window.BFC_EXPORT.pdfTableau('Factures à venir', `${ec.espace ? esp(ec.espace).nom + ' · ' : ''}édité le ${fmtDate(today)}`,
    ['Date', 'Facture', 'Espace', 'Statut', 'Montant'], occF.map(o => [fmtDate(o.date_prevue), o.libelle, esp(o.espace).nom, (STATUT_OCC[o.statut] || [o.statut])[0], (o.sens === 'recette' ? '+' : '-') + fmt(o.montant_reel ?? o.montant)]),
    `Factures_a_venir_${today}.pdf`, [4]));
};

async function formEcheance(e = {}, apres) {
  const neuf = !e.id;
  const docs = neuf ? [] : (doux(await db.from('documents').select('*').eq('echeance_id', e.id).order('created_at')) || []);
  const sens = e.sens || 'depense';
  ouvrirModale(neuf ? 'Nouvelle facture régulière' : 'Modifier la facture régulière', `<form id="f-ec">
    <div class="champ"><div class="bascule" id="ec-sens"><button type="button" data-t="depense" class="${sens === 'depense' ? 'on dep' : ''}">Facture à payer</button><button type="button" data-t="recette" class="${sens === 'recette' ? 'on rec' : ''}">Rentrée d'argent (salaire…)</button></div><input type="hidden" name="sens" value="${sens}"></div>
    <div class="champ"><label>Nom *</label><input name="libelle" required value="${esc(e.libelle || '')}" placeholder="ex : Électricité, Eau, Loyer, Assurance auto, Salaire"></div>
    <div class="ligne3">
      <div class="champ"><label>Montant (€) *</label><input name="montant" inputmode="decimal" required value="${e.montant ?? ''}"></div>
      <div class="champ"><label>Fréquence</label><select name="frequence">${opts(FREQ, e.frequence || 'mensuelle')}</select></div>
      <div class="champ"><label>Prochaine date *</label><input type="date" name="premiere_date" required value="${e.premiere_date || auj()}"></div>
    </div>
    <label class="case"><input type="checkbox" name="montant_variable" ${e.montant_variable ? 'checked' : ''}> Le montant varie (électricité, eau…) : c'est une estimation</label>
    <div class="ligne">
      <div class="champ"><label>Espace de vie</label><select name="espace">${R.espaces.map(x => `<option value="${x.code}" ${x.code === (e.espace || 'quotidien') ? 'selected' : ''}>${x.icone} ${esc(x.nom)}</option>`).join('')}</select></div>
      <div class="champ"><label>Compte qui paie</label><select name="compte_id">${optsListe(R.comptes.filter(c => c.actif || c.id === e.compte_id), e.compte_id, 'Non précisé')}</select></div>
    </div>
    <div class="ligne">
      <div class="champ"><label>Provenance (fournisseur)</label><select name="tiers_id">${optsListe(R.tiers, e.tiers_id, '—')}</select></div>
      <div class="champ"><label>Catégorie</label><select name="categorie_id">${optsListe(R.categories.filter(c => c.type === sens), e.categorie_id, '—')}</select></div>
    </div>
    <div class="ligne3">
      <div class="champ"><label>Mot dans le libellé bancaire</label><input name="mot_cle" value="${esc(e.mot_cle || '')}" placeholder="ex : EDF, SMGEAG"><div class="aide">Pour reconnaître le paiement automatiquement.</div></div>
      <div class="champ"><label>Moyen de paiement</label><select name="moyen_paiement">${opts(MOYENS, e.moyen_paiement || 'prelevement')}</select></div>
      <div class="champ"><label>Me prévenir</label><select name="rappel_jours">${opts({ 0: 'Le jour même', 1: '1 jour avant', 3: '3 jours avant', 7: '7 jours avant', 15: '15 jours avant' }, String(e.rappel_jours ?? 3))}</select></div>
    </div>
    <div class="ligne"><div class="champ"><label>Fin (facultatif)</label><input type="date" name="date_fin" value="${e.date_fin || ''}"></div>
      <div class="champ"><label>Tolérance (jours)</label><input name="tolerance_jours" inputmode="numeric" value="${e.tolerance_jours ?? 5}"></div></div>
    <div class="champ"><label>Notes</label><textarea name="notes" rows="2">${esc(e.notes || '')}</textarea></div>
    <div class="champ"><label>Documents (contrat, facture, échéancier…)</label>
      <div id="ec-docs">${docs.map(d => `<div class="avec-image" style="margin-bottom:6px">📎 <a href="#" data-ouvrir="${esc(d.storage_path)}">${esc(d.nom_fichier)}</a> <span class="aide">${TYPES_DOC[d.type] || d.type}</span> <button type="button" class="btn btn-danger btn-petit" data-suppr-doc="${d.id}">Retirer</button></div>`).join('')}</div>
      <input type="file" name="fichiers" multiple accept="application/pdf,image/*,.docx,.xlsx,.csv"></div>
    ${neuf ? '' : `<label class="case"><input type="checkbox" name="actif" ${e.actif !== false ? 'checked' : ''}> Active</label>`}
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="ec-suppr">Supprimer</button>'}
      <button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    const f = $('#f-ec', m);
    $('#ec-sens', m).onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; f.sens.value = b.dataset.t;
      $$('#ec-sens button', m).forEach(x => { x.className = x === b ? 'on ' + (b.dataset.t === 'depense' ? 'dep' : 'rec') : ''; });
      f.categorie_id.innerHTML = optsListe(R.categories.filter(c => c.type === b.dataset.t), null, '—'); };
    f.tiers_id.onchange = () => { const t = R.tiers.find(x => x.id === f.tiers_id.value); if (t?.categorie_defaut_id && !f.categorie_id.value) f.categorie_id.value = t.categorie_defaut_id; if (t && !f.libelle.value) f.libelle.value = t.nom; };
    f.categorie_id.onchange = () => { const c = R.categories.find(x => x.id === f.categorie_id.value); if (c?.espace && neuf) f.espace.value = c.espace; };
    $('#ec-docs', m).onclick = (ev) => {
      const o = ev.target.closest('[data-ouvrir]'); if (o) { ev.preventDefault(); ouvrirDocument(o.dataset.ouvrir); }
      const s = ev.target.closest('[data-suppr-doc]');
      if (s) action(s, async () => { if (!await confirmer('Retirer ce document ?')) return; await supprimerDocument(docs.find(d => d.id === s.dataset.supprDoc)); s.parentElement.remove(); });
    };
    f.onsubmit = (ev) => { ev.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const montant = num(f, 'montant'); if (!(montant >= 0)) throw new Error('Montant invalide.');
      const rec = { libelle: val(f, 'libelle'), sens: f.sens.value, montant, montant_variable: f.montant_variable.checked, frequence: val(f, 'frequence'), premiere_date: val(f, 'premiere_date'),
        espace: val(f, 'espace'), compte_id: val(f, 'compte_id'), tiers_id: val(f, 'tiers_id'), categorie_id: val(f, 'categorie_id'), mot_cle: val(f, 'mot_cle'),
        moyen_paiement: val(f, 'moyen_paiement'), rappel_jours: +val(f, 'rappel_jours'), date_fin: val(f, 'date_fin'), tolerance_jours: Math.min(31, Math.max(0, +(val(f, 'tolerance_jours') || 5))), notes: val(f, 'notes') };
      if (!neuf) rec.actif = f.actif.checked;
      const res = neuf ? await db.from('echeances').insert(rec).select().single() : await db.from('echeances').update(rec).eq('id', e.id).select().single();
      const x = verifier(res, 'Enregistrement');
      if (f.fichiers.files.length) await televerserDocuments([...f.fichiers.files], { echeance_id: x.id, espace: x.espace, compte_id: x.compte_id, tiers_id: x.tiers_id, type: 'facture', structure_code: x.espace === 'travail' ? 'bformatik' : 'bforcompta' });
      fermerModale(); toast(neuf ? 'Facture régulière ajoutée.' : 'Mise à jour enregistrée.'); apres ? apres(x) : router();
    }); };
    if (!neuf) $('#ec-suppr', m).onclick = (ev) => action(ev.target, async () => {
      if (!await confirmer('Supprimer cette facture régulière (les paiements déjà enregistrés sont conservés) ?')) return;
      verifier(await db.from('echeances').delete().eq('id', e.id)); fermerModale(); toast('Supprimée.'); router();
    });
  });
}

/* ================================================================ ESPACES DE VIE */
VUES.espaces = async (el) => {
  demarrer();
  const today = auj(), debutMois = today.slice(0, 8) + '01';
  const [ops, occ, docs] = (await Promise.all([
    db.from('operations').select('espace, type, montant').gte('date_operation', debutMois).neq('statut', 'prevue').limit(20000),
    db.rpc('occurrences_echeances', { p_debut: today, p_fin: plusJours(today, 30) }),
    db.from('documents').select('espace').not('espace', 'is', null).limit(20000)
  ])).map(doux);
  if (!R.espaces.length) { el.innerHTML = msgBase; return; }
  const somme = (code) => (ops || []).filter(o => o.espace === code && o.type === 'depense').reduce((s, o) => s + Number(o.montant), 0);
  el.innerHTML = `<div class="tete-vue"><h1>🧭 Espaces de vie</h1><div class="aide">Tout est rangé par domaine : dépenses, factures à venir, documents.</div></div>
    <div class="espaces-grille">${R.espaces.map(e => { const f = (occ || []).filter(o => o.espace === e.code && o.sens === 'depense' && o.statut !== 'payee' && o.statut !== 'sautee');
      const nd = (docs || []).filter(d => d.espace === e.code).length;
      return `<a class="carte espace-carte" href="#/espace/${e.code}" style="--c:${e.couleur}"><div class="espace-ic">${e.icone}</div><div class="espace-nom">${esc(e.nom)}</div>
        <div class="aide">${esc(e.description || '')}</div>
        <div class="espace-chiffres"><span>Ce mois <b>${fmt(somme(e.code))}</b></span><span>À venir <b>${f.length ? `${f.length} · ${fmt(f.reduce((s, o) => s + Number(o.montant), 0))}` : '—'}</b></span><span>📎 <b>${nd}</b></span></div></a>`; }).join('')}</div>`;
};

const ex = { onglet: 'resume' };
let dernierEspace = null;
VUES.espace = async (el, code) => {
  demarrer();
  const e = espaceParCode(code); if (!e) { location.hash = '#/espaces'; return; }
  if (dernierEspace !== code) { ex.onglet = 'resume'; dernierEspace = code; }
  setTimeout(() => $$('#menu a').forEach(a => a.classList.toggle('actif', a.dataset.route === 'espaces')), 0);
  const onglets = [['resume', '📋 Résumé'], ['operations', '🧾 Dépenses'], ['factures', '📆 Factures'], ['documents', '📎 Documents']];
  if (code === 'epargne') onglets.splice(1, 0, ['epargne', '🐷 Épargne & placements']);
  el.innerHTML = `<div class="tete-vue"><h1><a href="#/espaces" class="aide" style="text-decoration:none">🧭 Espaces ›</a> ${e.icone} ${esc(e.nom)}</h1><div class="actions">
      ${(LIENS_ESPACE[code] || []).map(([h, l]) => `<a class="btn btn-fantome" href="${h}">${l}</a>`).join('')}
      <button class="btn btn-fantome" id="es-doc">📎 Téléverser</button><button class="btn btn-bleu" id="es-scan">📸 Ticket / facture</button><button class="btn btn-primaire" id="es-dep">＋ Dépense</button></div></div>
    <div class="bascule" id="es-onglets" style="margin-bottom:14px">${onglets.map(([k, l]) => `<button data-o="${k}" class="${ex.onglet === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="es-contenu"><div class="chargement">Chargement…</div></div>`;
  $('#es-onglets').onclick = (ev) => { const b = ev.target.closest('button'); if (b) { ex.onglet = b.dataset.o; router(); } };
  $('#es-dep').onclick = () => formOperation({ type: 'depense', espace: code }, () => router());
  $('#es-doc').onclick = () => formDocuments(code);
  $('#es-scan').onclick = () => scanner(code);
  const c = $('#es-contenu');
  const today = auj();

  if (ex.onglet === 'resume') {
    const debut12 = plusJours(today.slice(0, 8) + '01', -334).slice(0, 8) + '01';
    const [ops, occ, taches] = (await Promise.all([
      db.from('operations').select('id, type, montant, date_operation, libelle, compte_id').eq('espace', code).neq('statut', 'prevue').gte('date_operation', debut12).order('date_operation', { ascending: false }).limit(5000),
      db.rpc('occurrences_echeances', { p_debut: plusJours(today, -60), p_fin: plusJours(today, 60) }),
      db.from('v_agenda_priorites').select('*').eq('espace', code).in('statut', ['a_faire', 'en_cours']).order('score', { ascending: false }).limit(10)
    ])).map(doux);
    const dep = (ops || []).filter(o => o.type === 'depense');
    const mois = []; for (let i = 11; i >= 0; i--) { const d = dateDe(today.slice(0, 8) + '15'); d.setMonth(d.getMonth() - i); mois.push(iso(d).slice(0, 7)); }
    const parMois = mois.map(m => dep.filter(o => o.date_operation.startsWith(m)).reduce((s, o) => s + Number(o.montant), 0));
    const occE = (occ || []).filter(o => o.espace === code && ['a_venir', 'due', 'en_retard'].includes(o.statut));
    c.innerHTML = `<div class="grille g3" style="margin-bottom:16px">
        <div class="carte kpi principal"><div class="lib">Dépensé ce mois</div><div class="val">${fmt(parMois[11])}</div><div class="det">${MOIS_LONG[new Date().getMonth()]}</div></div>
        <div class="carte kpi"><div class="lib">Moyenne mensuelle</div><div class="val">${fmt(parMois.reduce((a, b) => a + b, 0) / 12)}</div><div class="det">sur 12 mois</div></div>
        <div class="carte kpi"><div class="lib">Factures à venir</div><div class="val">${fmt(occE.filter(o => o.sens === 'depense').reduce((s, o) => s + Number(o.montant), 0))}</div><div class="det">${occE.length} sur 60 jours</div></div></div>
      <div class="aj-grille"><div class="aj-col"><div class="carte"><h3>📊 Dépenses sur 12 mois</h3><div style="height:220px"><canvas id="es-graph"></canvas></div></div>
          <div class="carte"><h3>🧾 Dernières dépenses</h3>${dep.slice(0, 8).map(o => `<div class="aj-item"><span class="pastille">${jjmm(o.date_operation)}</span> <b>${esc(o.libelle)}</b> <span style="margin-left:auto;font-weight:800">−${fmt(o.montant)}</span></div>`).join('') || '<div class="vide">Aucune dépense dans cet espace.</div>'}</div></div>
        <div class="aj-col"><div class="carte"><h3>📆 Factures à venir</h3><div id="es-occ">${occE.map((o, i) => ligneOcc(o, i)).join('') || '<div class="vide">Aucune.</div>'}</div></div>
          <div class="carte"><h3>🗓️ À faire</h3>${(taches || []).map(t => `<div class="aj-item"><b>${esc(t.titre)}</b> <span class="aide">${t.echeance ? fmtDate(t.echeance.slice(0, 10)) : ''}</span></div>`).join('') || '<div class="vide">Rien.</div>'}</div></div></div>`;
    brancherOcc($('#es-occ'), occE);
    if (window.Chart) A.ajouterGraphique(new window.Chart($('#es-graph'), { type: 'bar', data: { labels: mois.map(m => ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][+m.slice(5) - 1]), datasets: [{ data: parMois, backgroundColor: e.couleur, borderRadius: 6 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }));
  } else if (ex.onglet === 'operations') {
    const ops = doux(await db.from('operations').select('*').eq('espace', code).order('date_operation', { ascending: false }).limit(300)) || [];
    c.innerHTML = `<div class="carte"><div class="tableau-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th class="masquer-mobile">Compte</th><th class="montant">Montant</th></tr></thead><tbody>
      ${ops.map(o => `<tr data-id="${o.id}" class="cliquable"><td>${fmtDate(o.date_operation)}</td><td>${esc(o.libelle)}</td><td class="masquer-mobile">${esc(compteParId(o.compte_id)?.nom || '')}</td>
        <td class="montant ${o.type === 'recette' ? 'pos' : 'neg'}">${o.type === 'recette' ? '+' : '−'}${fmt(o.montant)}</td></tr>`).join('') || '<tr><td colspan="4" class="vide">Aucune opération.</td></tr>'}</tbody></table></div></div>`;
    c.onclick = (ev) => { const tr = ev.target.closest('tr[data-id]'); if (tr) formOperation(ops.find(o => o.id === tr.dataset.id), () => router()); };
  } else if (ex.onglet === 'factures') {
    ec.espace = code; ec.onglet = 'liste';
    const l = (doux(await db.from('echeances').select('*').eq('espace', code).order('libelle')) || []);
    c.innerHTML = `<div class="carte"><h3>Factures régulières de l'espace <button class="btn btn-petit btn-primaire" id="es-ech" style="margin-left:auto">＋ Ajouter</button></h3>
      ${l.map(x => `<div class="aj-item cliquable" data-id="${x.id}"><b>${esc(x.libelle)}</b> <span class="aide">${FREQ[x.frequence]}</span><span style="margin-left:auto;font-weight:800">${x.montant_variable ? '≈ ' : ''}${fmt(x.montant)}</span></div>`).join('') || '<div class="vide">Aucune facture régulière.</div>'}
      <div style="margin-top:10px"><a href="#/echeances" class="btn btn-petit btn-fantome">Voir le calendrier →</a></div></div>`;
    $('#es-ech').onclick = () => formEcheance({ espace: code });
    c.onclick = (ev) => { const r = ev.target.closest('[data-id]'); if (r) formEcheance(l.find(x => x.id === r.dataset.id)); };
  } else if (ex.onglet === 'documents') {
    const [a, b, d] = (await Promise.all([
      db.from('documents').select('*').eq('espace', code).order('created_at', { ascending: false }).limit(500),
      db.from('documents').select('*, operations!inner(espace, libelle)').eq('operations.espace', code).order('created_at', { ascending: false }).limit(500),
      db.from('documents').select('*, echeances!inner(espace, libelle)').eq('echeances.espace', code).order('created_at', { ascending: false }).limit(500)
    ])).map(doux);
    const vus = new Set(); const docs = [...(a || []), ...(b || []), ...(d || [])].filter(x => !vus.has(x.id) && vus.add(x.id)).sort((x, y) => (y.date_document || y.created_at).localeCompare(x.date_document || x.created_at));
    c.innerHTML = `<div class="docs-grille">${docs.map(x => `<div class="carte doc-carte"><a href="#" data-ouvrir="${esc(x.storage_path)}" class="doc-ic">${/pdf/.test(x.mime_type || '') ? '📄' : /image/.test(x.mime_type || '') ? '🖼️' : '📎'}</a>
        <div class="doc-nom" title="${esc(x.nom_fichier)}">${esc(x.nom_fichier)}</div><div class="aide">${TYPES_DOC[x.type] || x.type} · ${fmtDate(x.date_document || x.created_at.slice(0, 10))}${x.montant ? ' · ' + fmt(x.montant) : ''}</div>
        ${x.operations ? `<div class="aide">↳ ${esc(x.operations.libelle)}</div>` : x.echeances ? `<div class="aide">↳ ${esc(x.echeances.libelle)}</div>` : ''}${x.notes ? `<div class="aide">${esc(x.notes)}</div>` : ''}
        <button class="btn btn-petit btn-danger" data-suppr="${x.id}">Supprimer</button></div>`).join('') || `<div class="carte vide" style="grid-column:1/-1">Aucun document dans cet espace.<br><button class="btn btn-primaire" id="es-doc2" style="margin-top:10px">📎 Téléverser un document</button></div>`}</div>`;
    $('#es-doc2') && ($('#es-doc2').onclick = () => formDocuments(code));
    c.onclick = (ev) => {
      const o = ev.target.closest('[data-ouvrir]'); if (o) { ev.preventDefault(); ouvrirDocument(o.dataset.ouvrir); }
      const s = ev.target.closest('[data-suppr]');
      if (s) action(s, async () => { if (!await confirmer('Supprimer ce document ?')) return; await supprimerDocument(docs.find(x => x.id === s.dataset.suppr)); toast('Document supprimé.'); router(); });
    };
  } else if (ex.onglet === 'epargne') await vueEpargne(c);
};

function formDocuments(code) {
  ouvrirModale(`Téléverser · ${esp(code).icone} ${esp(code).nom}`, `<form id="f-esdoc">
    <div class="champ"><label>Fichiers * (PDF, photos, Word, Excel)</label><input type="file" name="fichiers" multiple required accept="application/pdf,image/*,.docx,.xlsx,.csv"></div>
    <div class="champ"><label>…ou prendre une photo</label><input type="file" name="photo" accept="image/*" capture="environment"></div>
    <div class="ligne"><div class="champ"><label>Type</label><select name="type">${opts(TYPES_DOC, { vehicules: 'vehicule', sante: 'sante', administratif: 'administratif', enfants: 'bulletin' }[code] || 'facture')}</select></div>
      <div class="champ"><label>Date du document</label><input type="date" name="date_document" value="${auj()}"></div></div>
    <div class="ligne"><div class="champ"><label>Montant (€)</label><input name="montant" inputmode="decimal"></div>
      <div class="champ"><label>Provenance</label><select name="tiers_id">${optsListe(R.tiers, null, '—')}</select></div></div>
    <div class="champ"><label>Notes</label><input name="notes" placeholder="ex : garantie 2 ans, contrat n°…"></div>
    <div class="modale-pied"><button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Envoyer</button></div></form>`, (m) => {
    const f = $('#f-esdoc', m);
    f.photo.onchange = () => { if (f.photo.files.length) f.fichiers.required = false; };
    f.onsubmit = (ev) => { ev.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const fichiers = [...f.fichiers.files, ...f.photo.files]; if (!fichiers.length) throw new Error('Choisissez au moins un fichier.');
      await televerserDocuments(fichiers, { espace: code, type: val(f, 'type'), date_document: val(f, 'date_document'), montant: num(f, 'montant'), tiers_id: val(f, 'tiers_id'), notes: val(f, 'notes'),
        structure_code: code === 'travail' ? 'bformatik' : 'bforcompta' });
      fermerModale(); toast(`${fichiers.length} document${fichiers.length > 1 ? 's' : ''} envoyé${fichiers.length > 1 ? 's' : ''}.`); ex.onglet = 'documents'; router();
    }); };
  });
}

/* ---------------------------------------------------------------- Épargne & investissement (suivi, sans conseil en placement) */
async function vueEpargne(c) {
  const today = auj();
  const debut = plusJours(today.slice(0, 8) + '01', -85).slice(0, 8) + '01';
  const [soldes, objectifs, ops] = await Promise.all([chargerSoldes(),
    db.from('objectifs_epargne').select('*').order('actif', { ascending: false }).order('date_cible').then(doux),
    db.from('operations').select('type, montant, date_operation, compte_id').gte('date_operation', debut).lt('date_operation', today.slice(0, 8) + '01').neq('statut', 'prevue').limit(20000).then(doux)]);
  const comptesEp = R.comptes.filter(x => x.actif && ['epargne', 'placement'].includes(x.type));
  const solde = (id) => Number(soldes.find(s => s.compte_id === id)?.solde_actuel || 0);
  const perso = (id) => (compteParId(id)?.nature || 'professionnel') !== 'professionnel' && !['epargne', 'placement'].includes(compteParId(id)?.type);
  const net = (ops || []).filter(o => perso(o.compte_id)).reduce((s, o) => s + (o.type === 'recette' ? 1 : -1) * Number(o.montant), 0);
  const capacite = net / 3;
  const total = comptesEp.reduce((s, x) => s + solde(x.id), 0);
  c.innerHTML = `<div class="grille g3" style="margin-bottom:16px">
      <div class="carte kpi principal"><div class="lib">Épargne & placements</div><div class="val">${fmt(total)}</div><div class="det">${comptesEp.length} compte${comptesEp.length > 1 ? 's' : ''}</div></div>
      <div class="carte kpi"><div class="lib">Capacité d'épargne</div><div class="val" style="color:${capacite >= 0 ? 'var(--vert)' : 'var(--rouge)'}">${fmt(capacite)}</div><div class="det">par mois (moyenne des 3 derniers mois, comptes perso)</div></div>
      <div class="carte kpi"><div class="lib">Objectifs</div><div class="val">${(objectifs || []).filter(o => o.actif).length}</div><div class="det">en cours</div></div></div>
    <div class="aj-grille"><div class="aj-col"><div class="carte"><h3>🎯 Mes objectifs <button class="btn btn-petit btn-primaire" id="ep-obj" style="margin-left:auto">＋ Objectif</button></h3>
      ${(objectifs || []).map(o => { const act = o.compte_id ? solde(o.compte_id) : Number(o.montant_actuel); const pc = Math.max(0, Math.min(100, act / o.montant_cible * 100));
        const moisRest = o.date_cible ? Math.max(1, Math.round((dateDe(o.date_cible) - dateDe(today)) / 2.63e9)) : null; const besoin = moisRest ? Math.max(0, (o.montant_cible - act) / moisRest) : null;
        return `<div class="objectif cliquable" data-id="${o.id}"><div class="aj-item" style="border:0;padding:0"><b>${esc(o.icone || '🎯')} ${esc(o.nom)}</b><span style="margin-left:auto;font-weight:800">${fmt(act)} / ${fmt(o.montant_cible)}</span></div>
          <div class="barre"><span style="width:${pc}%"></span></div>
          <div class="aide">${pc.toFixed(0)} %${o.date_cible ? ` · objectif le ${fmtDate(o.date_cible)} → mettre ≈ <b>${fmt(besoin)}</b>/mois` : ''}${besoin != null && capacite > 0 && besoin > capacite ? ' · <b style="color:var(--rouge)">au-dessus de la capacité actuelle</b>' : ''}</div></div>`; }).join('') || '<div class="vide">Aucun objectif. Exemples : fonds d\'urgence (3 mois de dépenses), vacances, voiture, études des enfants.</div>'}</div></div>
      <div class="aj-col"><div class="carte"><h3>🏦 Comptes d'épargne & placements <a href="#/comptes" class="btn btn-petit btn-fantome" style="margin-left:auto">＋ Compte</a></h3>
        ${comptesEp.map(x => `<div class="aj-item"><b>${esc(x.nom)}</b> <span class="aide">${x.type === 'placement' ? 'Placement' : 'Épargne'}${x.banque ? ' · ' + esc(x.banque) : ''}</span><span style="margin-left:auto;font-weight:800">${fmt(solde(x.id))}</span></div>`).join('') || '<div class="vide">Aucun compte. Créez un compte de type « Épargne » (livret A, LDDS…) ou « Placement / investissement » (assurance-vie, PEA…) dans Comptes.</div>'}
        <p class="aide" style="margin-bottom:0">Suivi de votre épargne : l'appli calcule et vous prévient, mais ne donne pas de conseil en placement.</p></div></div></div>`;
  $('#ep-obj').onclick = () => formObjectif({});
  c.onclick = (ev) => { const o = ev.target.closest('.objectif[data-id]'); if (o) formObjectif(objectifs.find(x => x.id === o.dataset.id)); };
}
function formObjectif(o) {
  const neuf = !o.id;
  ouvrirModale(neuf ? 'Nouvel objectif d\'épargne' : 'Modifier l\'objectif', `<form id="f-obj">
    <div class="ligne"><div class="champ" style="max-width:90px"><label>Icône</label><input name="icone" value="${esc(o.icone || '🎯')}"></div><div class="champ"><label>Nom *</label><input name="nom" required value="${esc(o.nom || '')}" placeholder="ex : Fonds d'urgence, Vacances 2027"></div></div>
    <div class="ligne3"><div class="champ"><label>Montant visé (€) *</label><input name="montant_cible" inputmode="decimal" required value="${o.montant_cible ?? ''}"></div>
      <div class="champ"><label>Déjà de côté (€)</label><input name="montant_actuel" inputmode="decimal" value="${o.montant_actuel ?? 0}"></div>
      <div class="champ"><label>Pour le</label><input type="date" name="date_cible" value="${o.date_cible || ''}"></div></div>
    <div class="champ"><label>Compte lié (son solde fait foi)</label><select name="compte_id">${optsListe(R.comptes.filter(c => c.actif && ['epargne', 'placement', 'banque'].includes(c.type)), o.compte_id, 'Aucun')}</select></div>
    <div class="champ"><label>Notes</label><input name="notes" value="${esc(o.notes || '')}"></div>
    ${neuf ? '' : `<label class="case"><input type="checkbox" name="actif" ${o.actif !== false ? 'checked' : ''}> En cours</label>`}
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="obj-suppr">Supprimer</button>'}<button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    const f = $('#f-obj', m);
    f.onsubmit = (ev) => { ev.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { icone: val(f, 'icone'), nom: val(f, 'nom'), montant_cible: num(f, 'montant_cible'), montant_actuel: num(f, 'montant_actuel') || 0, date_cible: val(f, 'date_cible'), compte_id: val(f, 'compte_id'), notes: val(f, 'notes') };
      if (!(rec.montant_cible > 0)) throw new Error('Montant visé invalide.');
      if (!neuf) rec.actif = f.actif.checked;
      verifier(neuf ? await db.from('objectifs_epargne').insert(rec) : await db.from('objectifs_epargne').update(rec).eq('id', o.id), 'Objectif');
      fermerModale(); toast('Objectif enregistré.'); router();
    }); };
    if (!neuf) $('#obj-suppr', m).onclick = (ev) => action(ev.target, async () => { if (!await confirmer('Supprimer cet objectif ?')) return; verifier(await db.from('objectifs_epargne').delete().eq('id', o.id)); fermerModale(); router(); });
  });
}

/* ================================================================ SCANNER UN TICKET / UNE FACTURE / UN DEVIS
   Photo ou PDF → lecture dans l'appareil → vérification → dépense (ou facture à payer, ou devis) + justificatif + produits
   enregistrés dans la base produits → rapport de la dépense par rapport à la situation financière */
async function reduireImage(fichier) {
  if (!/^image\//.test(fichier.type) || /svg|gif/.test(fichier.type)) return fichier;
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(fichier); });
  const k = Math.min(1, 2000 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const b = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.85));
  return b ? new File([b], (fichier.name || 'ticket').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : fichier;
}
const compteDefaut = (moyen) => { const a = R.comptes.filter(c => c.actif);
  return moyen === 'especes' ? a.find(c => c.type === 'especes')?.id : (a.find(c => c.type === 'banque' && c.nature !== 'professionnel') || a.find(c => c.type === 'banque') || a[0])?.id; };
const TYPES_SCAN = { ticket: '🧾 Ticket de caisse', facture: '📄 Facture', devis: '📝 Devis' };

function scanner(espaceDefaut) {
  ouvrirModale('📸 Ticket, facture ou devis', `<div id="sc-zone">
    <p class="aide" style="margin-top:0">Photographiez le document bien à plat et lisible (ou choisissez une photo / un PDF). L'appli lit le magasin, la date, les articles et le total dans votre téléphone ; vous vérifiez avant d'enregistrer.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <label class="btn btn-primaire" style="margin:0">📷 Prendre la photo<input type="file" id="sc-photo" accept="image/*" capture="environment" hidden></label>
      <label class="btn btn-fantome" style="margin:0">📁 Choisir une photo ou un PDF<input type="file" id="sc-fichier" accept="image/*,application/pdf" hidden></label></div>
    <div id="sc-etat" style="margin-top:12px"></div></div>`, (m) => {
    const traiter = async (brut) => {
      if (!brut) return;
      const etat = $('#sc-etat', m);
      etat.innerHTML = '<div class="chargement">Lecture du document… <b id="sc-pc">0 %</b><div class="aide">La première lecture télécharge le module de lecture (quelques secondes).</div></div>';
      try {
        const fi = /^image\//.test(brut.type) ? await reduireImage(brut) : brut;
        const r = await window.BFC_TICKET.lireDocument(fi, R.tiers, (p) => { const b = $('#sc-pc', m); if (b) b.textContent = p + ' %'; });
        r.fichier = fi;
        r.type = /devis/i.test(r.texte) ? 'devis' : /facture|invoice|n° client|echeance|échéance/i.test(r.texte) && r.articles.length < 4 ? 'facture' : 'ticket';
        afficherScan(m, r, espaceDefaut);
      } catch (e) { etat.innerHTML = `<div class="alerte">${esc(e.message || String(e))}</div>`; }
    };
    $('#sc-photo', m).onchange = (e) => traiter(e.target.files[0]);
    $('#sc-fichier', m).onchange = (e) => traiter(e.target.files[0]);
  });
}

function afficherScan(m, r, espaceDefaut) {
  const catCourses = R.categories.find(c => /courses/i.test(c.nom))?.id;
  const tiersCat = R.tiers.find(t => t.id === r.magasin_id)?.categorie_defaut_id;
  const cat0 = tiersCat || (r.type === 'ticket' ? catCourses : null);
  const esp0 = espaceDefaut || R.categories.find(c => c.id === cat0)?.espace || 'quotidien';
  $('#sc-zone', m).innerHTML = `<form id="f-scan">
    <div class="champ"><div class="bascule" id="sc-type">${Object.entries(TYPES_SCAN).map(([k, l]) => `<button type="button" data-t="${k}" class="${k === r.type ? 'on' : ''}">${l}</button>`).join('')}</div><input type="hidden" name="type" value="${r.type}"></div>
    <div class="ligne3"><div class="champ"><label>Magasin / fournisseur</label><select name="tiers_id">${optsListe(R.tiers.filter(t => t.type !== 'client' && t.type !== 'salarie'), r.magasin_id, r.magasin && !r.magasin_id ? 'Nouveau : ' + r.magasin.slice(0, 40) : '—')}</select></div>
      <div class="champ"><label>Date</label><input type="date" name="date" value="${r.date || auj()}"></div>
      <div class="champ"><label>Total (€) *</label><input name="total" inputmode="decimal" required value="${r.total ?? ''}"></div></div>
    <div id="sc-paye" class="champ" ${r.type === 'facture' ? '' : 'hidden'}><div class="bascule" id="sc-etatp"><button type="button" data-p="payee" class="on">Déjà payée</button><button type="button" data-p="a_payer">À payer</button></div>
      <span id="sc-limite" hidden> avant le <input type="date" name="date_limite" value="${plusJours(r.date || auj(), 15)}" style="width:auto;display:inline-block"></span><input type="hidden" name="paiement" value="payee"></div>
    <div class="ligne3" id="sc-compta" ${r.type === 'devis' ? 'hidden' : ''}><div class="champ"><label>Payé avec</label><select name="moyen">${opts(MOYENS, r.moyen || 'carte')}</select></div>
      <div class="champ"><label>Compte</label><select name="compte_id">${optsListe(R.comptes.filter(c => c.actif), compteDefaut(r.moyen || 'carte'), 'Choisir…', c => `${c.type === 'especes' ? '💶' : '🏦'} ${c.nom}`)}</select></div>
      <div class="champ"><label>Catégorie</label><select name="categorie_id">${optsListe(R.categories.filter(c => c.type === 'depense'), cat0, '—')}</select></div></div>
    <div class="ligne"><div class="champ"><label>Espace de vie</label><select name="espace">${R.espaces.map(x => `<option value="${x.code}" ${x.code === esp0 ? 'selected' : ''}>${x.icone} ${esc(x.nom)}</option>`).join('')}</select></div>
      <div class="champ"><label>Libellé</label><input name="libelle" value="${esc((r.type === 'ticket' ? 'Courses' : r.type === 'devis' ? 'Devis' : 'Facture') + (r.magasin ? ' – ' + r.magasin.slice(0, 40) : ''))}"></div></div>
    <label class="case" id="sc-prod-l" ${r.type === 'ticket' ? '' : 'hidden'}><input type="checkbox" name="produits" ${r.type === 'ticket' ? 'checked' : ''}> Enregistrer les articles dans la base produits (prix mis à jour)</label>
    <label>Articles reconnus (<span id="sc-n">${r.articles.length}</span>) <button type="button" class="btn btn-petit btn-fantome" id="sc-plus">＋ Article</button></label>
    <div class="tableau-wrap" style="max-height:240px;overflow:auto"><table><thead><tr><th>Article</th><th style="width:64px">Qté</th><th style="width:84px">Prix u.</th><th></th></tr></thead><tbody id="sc-art"></tbody></table></div>
    <div class="aide" id="sc-ctrl"></div>
    <details style="margin-top:6px"><summary class="aide">Texte lu (pour vérifier)</summary><pre style="white-space:pre-wrap;font-size:.75rem;max-height:150px;overflow:auto">${esc(r.texte)}</pre></details>
    <div class="modale-pied"><button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">💾 Enregistrer</button></div></form>`;
  const f = $('#f-scan', m), tb = $('#sc-art', m);
  const dessiner = () => {
    tb.innerHTML = r.articles.map((a, i) => `<tr><td><input data-i="${i}" data-k="libelle" value="${esc(a.libelle)}"></td><td><input data-i="${i}" data-k="quantite" value="${a.quantite}" inputmode="decimal"></td><td><input data-i="${i}" data-k="prix_unitaire" value="${a.prix_unitaire}" inputmode="decimal"></td><td><button type="button" class="btn-x" data-retirer="${i}">×</button></td></tr>`).join('') || '<tr><td colspan="4" class="vide">Aucun article (facultatif).</td></tr>';
    controle();
  };
  const controle = () => { $('#sc-n', m).textContent = r.articles.length;
    const s = Math.round(r.articles.reduce((a, x) => a + (x.quantite || 0) * (x.prix_unitaire || 0), 0) * 100) / 100, t = num(f, 'total');
    $('#sc-ctrl', m).innerHTML = r.articles.length ? `Somme des articles : <b>${fmt(s)}</b>${t && Math.abs(s - t) > 0.05 ? ` · <span style="color:var(--rouge)">écart de ${fmt(t - s)} avec le total (remises, articles mal lus ?)</span>` : ' ✓'}` : ''; };
  dessiner();
  tb.oninput = (e) => { const i = e.target.dataset.i; if (i == null) return; const k = e.target.dataset.k; r.articles[i][k] = k === 'libelle' ? e.target.value : Number(String(e.target.value).replace(',', '.')) || 0; controle(); };
  tb.onclick = (e) => { const b = e.target.closest('[data-retirer]'); if (b) { r.articles.splice(+b.dataset.retirer, 1); dessiner(); } };
  f.total.oninput = controle;
  $('#sc-plus', m).onclick = () => { r.articles.push({ libelle: '', quantite: 1, prix_unitaire: 0 }); dessiner(); };
  $('#sc-type', m).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; f.type.value = b.dataset.t; $$('#sc-type button', m).forEach(x => x.classList.toggle('on', x === b));
    $('#sc-paye', m).hidden = b.dataset.t !== 'facture'; $('#sc-compta', m).hidden = b.dataset.t === 'devis'; $('#sc-prod-l', m).hidden = b.dataset.t !== 'ticket'; f.produits.checked = b.dataset.t === 'ticket'; };
  $('#sc-etatp', m).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; f.paiement.value = b.dataset.p; $$('#sc-etatp button', m).forEach(x => x.classList.toggle('on', x === b)); $('#sc-limite', m).hidden = b.dataset.p !== 'a_payer'; };
  f.moyen.onchange = () => { if (f.moyen.value === 'especes') f.compte_id.value = compteDefaut('especes') || ''; };
  f.categorie_id.onchange = () => { const c = R.categories.find(x => x.id === f.categorie_id.value); if (c?.espace) f.espace.value = c.espace; };
  f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
    const type = f.type.value, total = num(f, 'total');
    if (!(total > 0)) throw new Error('Indiquez le total.');
    let tiers_id = val(f, 'tiers_id');
    if (!tiers_id && r.magasin) { tiers_id = verifier(await db.from('tiers').insert({ nom: r.magasin.slice(0, 60), type: 'fournisseur', categorie_defaut_id: val(f, 'categorie_id') }).select().single(), 'Magasin').id; await A.chargerReferentiels(); }
    const espace = val(f, 'espace'), date = val(f, 'date'), libelle = val(f, 'libelle') || TYPES_SCAN[type];
    const lien = { type: type === 'ticket' ? 'ticket' : type, date_document: date, montant: total, tiers_id, espace, structure_code: espace === 'travail' ? 'bformatik' : 'bforcompta', notes: libelle };
    let op = null, ech = null;
    if (type === 'devis') {
      await televerserDocuments([r.fichier], lien);
    } else if (type === 'facture' && f.paiement.value === 'a_payer') {
      ech = verifier(await db.from('echeances').insert({ libelle, montant: total, frequence: 'ponctuelle', premiere_date: val(f, 'date_limite') || date, espace, tiers_id, compte_id: val(f, 'compte_id'),
        categorie_id: val(f, 'categorie_id'), moyen_paiement: val(f, 'moyen'), origine: 'manuel', rappel_jours: 3 }).select().single(), 'Facture à payer');
      await televerserDocuments([r.fichier], { ...lien, echeance_id: ech.id, compte_id: ech.compte_id });
    } else {
      if (!val(f, 'compte_id')) throw new Error('Choisissez le compte (ou la caisse espèces).');
      op = verifier(await db.from('operations').insert({ type: 'depense', montant: total, date_operation: date, libelle, compte_id: val(f, 'compte_id'), moyen_paiement: val(f, 'moyen'),
        tiers_id, categorie_id: val(f, 'categorie_id'), espace, structure_code: espace === 'travail' ? 'bformatik' : 'bforcompta',
        notes: r.articles.length ? r.articles.map(a => `${a.quantite} × ${a.libelle} ${a.prix_unitaire}`).join(' ; ').slice(0, 1000) : null }).select().single(), 'Dépense');
      await televerserDocuments([r.fichier], { ...lien, operation_id: op.id, compte_id: op.compte_id });
    }
    // base produits : mise à jour du prix habituel, création des nouveaux produits
    const prix = [];
    if (f.produits.checked && r.articles.length) {
      const existants = doux(await db.from('produits').select('id, nom, prix_habituel')) || [];
      for (const a of r.articles.filter(x => x.libelle && x.prix_unitaire > 0)) {
        const p = existants.find(x => x.nom.toLowerCase() === a.libelle.toLowerCase());
        if (p) { prix.push({ nom: p.nom, avant: p.prix_habituel, apres: a.prix_unitaire }); await db.from('produits').update({ prix_habituel: a.prix_unitaire, magasin_habituel_id: tiers_id || undefined }).eq('id', p.id); }
        else { prix.push({ nom: a.libelle, avant: null, apres: a.prix_unitaire }); await db.from('produits').insert({ nom: a.libelle.slice(0, 80), prix_habituel: a.prix_unitaire, magasin_habituel_id: tiers_id, unite: 'pièce' }); }
      }
    }
    // base de prix commune (tickets uniquement : ce sont des prix réellement payés)
    if (type === 'ticket' && r.articles.length && A.enregistrerPrix) { const magNom = R.tiers.find(t => t.id === tiers_id)?.nom || r.magasin; let lieu = null; try { lieu = JSON.parse(localStorage.getItem('bsafe-lieu'))?.nom || null; } catch {}
      await A.enregistrerPrix(r.articles, magNom, { ville: lieu, source: 'ticket', date }).catch(() => {}); }
    fermerModale();
    toast(type === 'devis' ? 'Devis enregistré.' : ech ? 'Facture à payer ajoutée à l\'échéancier.' : 'Dépense enregistrée avec son justificatif.');
    await rapportDepense({ type, total, date, libelle, espace, categorie_id: val(f, 'categorie_id'), tiers_id, op, ech, prix, compte_id: val(f, 'compte_id') });
  }); };
}

/* Rapport : la dépense replacée dans la situation financière */
async function rapportDepense(x) {
  const today = auj(), m0 = x.date.slice(0, 8) + '01', m3 = plusJours(m0, -88).slice(0, 8) + '01';
  const nature = R.comptes.find(c => c.id === x.compte_id)?.nature;
  const [rav, catOps, magOps, budget, alertes] = (await Promise.all([
    db.rpc('reste_a_vivre', { p_perimetre: nature === 'professionnel' ? 'pro' : 'perso' }),
    x.categorie_id ? db.from('operations').select('montant, date_operation').eq('type', 'depense').eq('categorie_id', x.categorie_id).gte('date_operation', m3).neq('statut', 'prevue').limit(5000) : Promise.resolve({ data: [] }),
    x.tiers_id ? db.from('operations').select('montant').eq('type', 'depense').eq('tiers_id', x.tiers_id).gte('date_operation', m0).limit(2000) : Promise.resolve({ data: [] }),
    x.categorie_id ? db.from('budgets').select('montant').eq('categorie_id', x.categorie_id).eq('mois', m0) : Promise.resolve({ data: [] }),
    x.op ? db.from('alertes').select('*').eq('operation_id', x.op.id) : Promise.resolve({ data: [] })
  ])).map(doux);
  const cat = R.categories.find(c => c.id === x.categorie_id), mag = R.tiers.find(t => t.id === x.tiers_id);
  const ceMois = (catOps || []).filter(o => o.date_operation >= m0).reduce((s, o) => s + Number(o.montant), 0);
  const avant = (catOps || []).filter(o => o.date_operation < m0).reduce((s, o) => s + Number(o.montant), 0) / 3;
  const b = budget?.[0]?.montant;
  const lignes = [];
  if (x.op) lignes.push(['Dépense', `${x.libelle} — ${fmtDate(x.date)}`, fmt(x.total)]);
  if (x.ech) lignes.push(['Facture à payer', `${x.libelle} — avant le ${fmtDate(x.ech.premiere_date)}`, fmt(x.total)]);
  if (x.type === 'devis') lignes.push(['Devis', `${x.libelle} — ${fmtDate(x.date)} (non compté dans les dépenses)`, fmt(x.total)]);
  if (rav) lignes.push(['Disponible réel', `jusqu'au ${fmtDate(rav.jusqua)}, factures à venir déduites (≈ ${fmt(rav.par_jour)}/jour)`, fmt(rav.disponible)]);
  if (x.type === 'devis' && rav) lignes.push(['Si le devis est accepté', 'disponible restant', fmt(rav.disponible - x.total)]);
  if (cat) lignes.push([`Catégorie ${cat.nom}`, `ce mois${b ? ` (budget ${fmt(b)})` : ''} · moyenne des 3 mois précédents ${fmt(avant)}`, fmt(ceMois)]);
  if (mag && (magOps || []).length) lignes.push([`Chez ${mag.nom}`, `ce mois (${magOps.length} passage${magOps.length > 1 ? 's' : ''})`, fmt(magOps.reduce((s, o) => s + Number(o.montant), 0))]);
  const hausses = x.prix.filter(p => p.avant && p.apres > p.avant * 1.02), baisses = x.prix.filter(p => p.avant && p.apres < p.avant * 0.98), nouveaux = x.prix.filter(p => !p.avant);
  hausses.forEach(p => lignes.push(['Prix en hausse', `${p.nom} : ${fmt(p.avant)} → ${fmt(p.apres)}`, '+' + Math.round((p.apres / p.avant - 1) * 100) + ' %']));
  baisses.forEach(p => lignes.push(['Prix en baisse', `${p.nom} : ${fmt(p.avant)} → ${fmt(p.apres)}`, Math.round((p.apres / p.avant - 1) * 100) + ' %']));
  if (nouveaux.length) lignes.push(['Base produits', `${nouveaux.length} nouveau${nouveaux.length > 1 ? 'x' : ''} produit${nouveaux.length > 1 ? 's' : ''} ajouté${nouveaux.length > 1 ? 's' : ''}, ${x.prix.length - nouveaux.length} prix mis à jour`, '']);
  (alertes || []).forEach(a => lignes.push(['Alerte', a.titre, '']));
  const conseil = !rav ? '' : rav.disponible < 0 ? '🚨 Les factures à venir ne sont plus couvertes : reportez les dépenses non urgentes jusqu\'à la prochaine rentrée d\'argent.'
    : b && ceMois > b ? `⚠️ Budget « ${cat.nom} » dépassé de ${fmt(ceMois - b)} ce mois-ci.`
    : avant > 0 && ceMois > avant * 1.25 ? `⚠️ Vous avez déjà dépensé ${Math.round((ceMois / avant - 1) * 100)} % de plus que d'habitude en « ${cat.nom} » ce mois-ci.`
    : `✅ Dépense compatible avec votre situation : il vous reste ≈ ${fmt(rav.par_jour)} par jour jusqu'au ${fmtDate(rav.jusqua)}.`;
  ouvrirModale('📊 Rapport de la dépense', `<div class="carte kpi principal ${rav && rav.disponible < 0 ? 'rav negatif' : 'rav'}" style="margin-bottom:12px"><div class="lib">${esc(x.libelle)}</div><div class="val">${fmt(x.total)}</div>
      <div class="det">${rav ? `Disponible réel après cette dépense : <b>${fmt(rav.disponible)}</b> jusqu'au ${fmtDate(rav.jusqua)}` : ''}</div></div>
    ${conseil ? `<div class="alerte" style="margin-bottom:10px">${esc(conseil)}</div>` : ''}
    <div class="tableau-wrap"><table><tbody>${lignes.map(l => `<tr><td><b>${esc(l[0])}</b></td><td>${esc(l[1])}</td><td class="montant">${esc(l[2])}</td></tr>`).join('')}</tbody></table></div>
    <div class="modale-pied"><button type="button" class="btn btn-fantome" id="rp-pdf">🖨 PDF</button><a class="btn btn-fantome" href="#/echeances" data-fermer>📆 Factures à venir</a><button type="button" class="btn btn-primaire" data-fermer>OK</button></div>`, (m) => {
    $('#rp-pdf', m).onclick = (e) => action(e.target, () => window.BFC_EXPORT.pdfTableau('Rapport de dépense', `${x.libelle} · ${fmtDate(x.date)}`, ['Rubrique', 'Détail', 'Montant'],
      [...lignes, ...(conseil ? [['Avis', conseil, '']] : [])], `Rapport_depense_${x.date}.pdf`, [2]));
  });
  if (/aujourdhui|espace|echeances|^#?\/?$/.test(location.hash)) { const el = $('#vue'); const cible = location.hash; setTimeout(() => { if (location.hash === cible) VUES[(cible.replace(/^#\/?/, '') || 'aujourdhui').split('/')[0]]?.(el, cible.split('/')[2]); }, 50); }
}
A.scanner = scanner;

A.formEcheance = formEcheance;
});
