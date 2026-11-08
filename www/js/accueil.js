/* B-S@fe — Tableau de bord sur une seule page : des « bulles » qui résument chaque domaine et renvoient vers sa page.
   + pages Alertes et Météo. */
(window.BFC_MODULES = window.BFC_MODULES || []).push((A) => {
'use strict';
const { db, R, $, $$, esc, fmt, fmtDate, auj, toast, verifier, action, router, VUES, formOperation, chargerSoldes, MOIS_LONG } = A;
const doux = (r) => r?.error ? null : r?.data;
const sur = (p) => Promise.resolve(p).then(doux, () => null);
const plusJours = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const lundi = () => { const d = new Date(auj() + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const court = (n) => { const v = Math.round(Number(n || 0)); return (Math.abs(v) >= 10000 ? (v / 1000).toFixed(1).replace('.', ',') + ' k€' : fmt(v).replace(/,00/, '')); };

function bulle({ lien, ic, titre, val, det, det2, etat = '', badge = '', couleur = '#2467b6' }) {
  return `<a class="bulle ${etat}" href="${lien}" style="--c:${couleur}"><div class="b-tete"><span class="b-ic">${ic}</span><span class="b-titre">${titre}</span>${badge ? `<span class="b-badge">${badge}</span>` : ''}</div>
    <div class="b-val">${val}</div>${det ? `<div class="b-det">${det}</div>` : ''}${det2 ? `<div class="b-det2">${det2}</div>` : ''}</a>`;
}

VUES.aujourdhui = async (el) => {
  A.installerVoix?.();
  const today = auj(), debutMois = today.slice(0, 8) + '01', jsem = ((new Date().getDay() + 6) % 7) + 1;
  const d0 = new Date(today + 'T12:00:00'); d0.setMonth(d0.getMonth() - 1); const moisPrec = d0.toISOString().slice(0, 8) + '01';
  const aPerso = R.comptes.some(c => c.actif && c.nature && c.nature !== 'professionnel');
  await db.rpc('verifier_echeances').then(() => {}, () => {});
  const [rav, ops, alertes, occ, menus, agenda, planning, listes, cat, seances, membres, objectifs, soldes, journal, meteo] = await Promise.all([
    sur(db.rpc('reste_a_vivre', { p_perimetre: aPerso ? 'perso' : 'tout' })),
    sur(db.from('operations').select('type, montant, date_operation').gte('date_operation', moisPrec).neq('statut', 'prevue').limit(20000)),
    sur(db.from('alertes').select('id, titre, niveau').eq('lue', false).order('created_at', { ascending: false }).limit(50)),
    sur(db.rpc('occurrences_echeances', { p_debut: plusJours(today, -60), p_fin: plusJours(today, 30) })),
    sur(db.from('menus').select('repas, libelle, statut').eq('jour', today)),
    sur(db.from('v_agenda_priorites').select('titre, echeance, urgence').in('statut', ['a_faire', 'en_cours']).order('score', { ascending: false }).limit(30)),
    sur(db.from('planning_taches').select('statut').eq('jour', today)),
    sur(db.from('listes_courses').select('titre, date_prevue, total_estime, statut, lignes_courses(id)').in('statut', ['brouillon', 'programmee', 'en_cours']).order('date_prevue').limit(5)),
    sur(db.rpc('catalogue_stats')),
    sur(db.from('seances_sport').select('membre_id, duree_min, intensite').gte('jour', lundi())),
    sur(db.from('membres_foyer').select('id, prenom, role, objectif_sport_min, pathologies, lien').eq('actif', true)),
    sur(db.from('objectifs_epargne').select('nom, montant_cible, montant_actuel, compte_id').eq('actif', true)),
    chargerSoldes().catch(() => []),
    sur(db.from('repas_journal').select('description, membre_id').eq('jour', today)),
    A.resumeMeteo ? A.resumeMeteo().catch(() => null) : null
  ]);
  const h = new Date().getHours(), salut = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const dep = (debut, fin) => (ops || []).filter(o => o.type === 'depense' && o.date_operation >= debut && (!fin || o.date_operation < fin)).reduce((s, o) => s + Number(o.montant), 0);
  const depMois = dep(debutMois), depPrec = dep(moisPrec, debutMois);
  const aPayer = (occ || []).filter(o => o.sens === 'depense' && ['a_venir', 'due', 'en_retard'].includes(o.statut));
  const retard = aPayer.filter(o => o.statut === 'en_retard'), prochaine = aPayer.find(o => o.statut !== 'en_retard');
  const urgentes = (alertes || []).filter(a => a.niveau === 'urgent');
  const agJour = (agenda || []).filter(t => t.echeance && t.echeance.slice(0, 10) <= today);
  const pl = planning || [], plFait = pl.filter(p => p.statut === 'fait').length;
  const liste = (listes || [])[0];
  const moi = (membres || []).find(m => m.lien === 'moi') || (membres || []).find(m => m.role === 'adulte');
  const minMoi = (seances || []).filter(s => !moi || s.membre_id === moi.id).reduce((a, s) => a + s.duree_min * (s.intensite === 3 ? 2 : 1), 0), objMoi = moi?.objectif_sport_min || 150;
  const comptesEp = R.comptes.filter(c => c.actif && ['epargne', 'placement'].includes(c.type)), epargne = comptesEp.reduce((s, c) => s + Number((soldes || []).find(x => x.compte_id === c.id)?.solde_actuel || 0), 0);
  const obj = (objectifs || [])[0], objAct = obj ? (obj.compte_id ? Number((soldes || []).find(x => x.compte_id === obj.compte_id)?.solde_actuel || 0) : Number(obj.montant_actuel)) : 0;
  const jMoi = (journal || []).filter(j => !j.membre_id), bilan = A.bilanJour && jMoi.length ? A.bilanJour(jMoi.map(j => ({ ...j, repas: 'dejeuner', quantite: 'normale' })), moi, {}) : null;
  const conseilMeteo = meteo?.C?.liste?.[0];

  const bulles = [
    bulle({ lien: '#/tableau', ic: '💶', titre: 'Disponible réel', couleur: '#11316e', etat: rav && rav.disponible < 0 ? 'danger' : '',
      val: rav ? court(rav.disponible) : '—', det: rav ? `jusqu'au ${fmtDate(rav.jusqua).slice(0, 5)} · ≈ ${court(rav.par_jour)}/jour` : 'Ajoutez vos comptes',
      det2: `Dépensé ce mois : <b>${court(depMois)}</b>${depPrec ? ` <span class="${depMois > depPrec ? 'neg' : 'pos'}">(${depMois > depPrec ? '+' : ''}${Math.round((depMois / depPrec - 1) * 100)} %)</span>` : ''}` }),
    bulle({ lien: '#/echeances', ic: '📆', titre: 'Factures à venir', couleur: '#ea580c', etat: retard.length ? 'danger' : aPayer.some(o => o.jours <= 3) ? 'alerte' : '',
      val: aPayer.length ? court(aPayer.reduce((s, o) => s + Number(o.montant), 0)) : '0', det: `${aPayer.length} à payer sur 30 jours${retard.length ? ` · <b>${retard.length} en retard</b>` : ''}`,
      det2: prochaine ? `Prochaine : ${esc(prochaine.libelle)} ${prochaine.jours === 0 ? 'aujourd\'hui' : prochaine.jours === 1 ? 'demain' : 'le ' + fmtDate(prochaine.date_prevue).slice(0, 5)}` : 'Ajoutez électricité, eau, loyer…' }),
    bulle({ lien: '#/alertes', ic: '🔔', titre: 'Alertes', couleur: '#c62828', etat: urgentes.length ? 'danger' : (alertes || []).length ? 'alerte' : '', badge: (alertes || []).length || '',
      val: (alertes || []).length ? String((alertes || []).length) : '✓', det: (alertes || []).length ? esc((alertes || [])[0].titre) : 'Rien à signaler' }),
    bulle({ lien: '#/meteo', ic: meteo?.code?.[0] || '🌦️', titre: 'Météo', couleur: '#0ea5e9', etat: conseilMeteo && conseilMeteo.n === 'urgent' ? 'alerte' : '',
      val: meteo ? `${Math.round(meteo.d.current.temperature_2m)} °C` : 'Activer', det: meteo ? `${esc(meteo.lieu.nom || '')} · ${meteo.code[1]}` : 'Parapluie, parasol, UV…', det2: conseilMeteo ? `${conseilMeteo.i} ${esc(conseilMeteo.t.split(':')[0])}` : '' }),
    bulle({ lien: '#/courses', ic: '🛒', titre: 'Courses & tickets', couleur: '#16a34a',
      val: liste ? esc(liste.titre).slice(0, 22) : 'Aucune liste', det: liste ? `${(liste.lignes_courses || []).length} article(s) · ≈ ${court(liste.total_estime)} · ${fmtDate(liste.date_prevue).slice(0, 5)}` : 'Créer une liste, scanner un ticket',
      det2: '📸 ticket → dépense + compte + prix' }),
    bulle({ lien: '#/prix', ic: '🔎', titre: 'Prix & devis', couleur: '#7c3aed',
      val: cat ? `${cat.produits} produits` : '—', det: cat ? `${cat.magasins} magasins · ${cat.releves} prix` : 'Base commune', det2: '🧮 Devis à partir de votre budget' }),
    bulle({ lien: '#/cuisine', ic: '🍽️', titre: 'Au menu aujourd\'hui', couleur: '#e11d48',
      val: (menus || []).length ? esc((menus.find(m => m.repas === (h < 15 ? 'dejeuner' : 'diner')) || menus[0]).libelle || '').slice(0, 26) : 'Pas de menu', det: (menus || []).length ? `${menus.length} repas prévu(s)` : 'Proposer un menu équilibré' }),
    bulle({ lien: '#/cuisine/journal', ic: '📓', titre: 'Ce que j\'ai mangé', couleur: '#f97316', etat: bilan && bilan.fl < 3 && h >= 18 ? 'alerte' : '',
      val: bilan ? `${bilan.fl}/5` : '—', det: bilan ? 'fruits & légumes aujourd\'hui' : 'Notez vos repas pour l\'analyse', det2: bilan?.conseils?.[0] ? esc(bilan.conseils[0][1].split(/[.:]/)[0]) : '' }),
    bulle({ lien: '#/monagenda', ic: '🗓️', titre: 'Mon agenda', couleur: '#0f766e', etat: agJour.some(t => t.urgence >= 4) ? 'alerte' : '',
      val: String(agJour.length), det: agJour.length ? `à faire aujourd'hui · ${esc(agJour[0].titre).slice(0, 30)}` : 'Rien d\'urgent aujourd\'hui' }),
    bulle({ lien: '#/enfants', ic: '👨‍👩‍👧', titre: 'Les enfants', couleur: '#7c3aed',
      val: pl.length ? `${plFait}/${pl.length}` : '—', det: pl.length ? 'tâches faites aujourd\'hui' : 'Planning des tâches' }),
    bulle({ lien: '#/sport', ic: '🏃', titre: 'Sport', couleur: '#0d9488', etat: minMoi >= objMoi ? 'ok' : '',
      val: `${minMoi} min`, det: `sur ${objMoi} cette semaine${moi ? ' · ' + esc(moi.prenom) : ''}`, det2: `<span class="b-barre"><span style="width:${Math.min(100, minMoi / objMoi * 100)}%"></span></span>` }),
    bulle({ lien: '#/espace/epargne', ic: '🐷', titre: 'Épargne', couleur: '#ca8a04',
      val: court(epargne), det: obj ? `${esc(obj.nom)} : ${Math.round(objAct / obj.montant_cible * 100)} %` : 'Fixer un objectif', det2: obj ? `<span class="b-barre"><span style="width:${Math.min(100, objAct / obj.montant_cible * 100)}%"></span></span>` : '' })
,
    bulle({ lien: '#/coffre', ic: '🔐', titre: 'Coffre-fort', couleur: '#334155', val: '3 sécurités', det: 'code e-mail · visage · phrase secrète' })
  ];
  el.innerHTML = `<div class="tdb-tete"><div><h1>${salut} !</h1><div class="aide">${JOURS[new Date().getDay()]} ${new Date().getDate()} ${MOIS_LONG[new Date().getMonth()]}</div></div>
      <div class="tdb-actions"><button class="btn btn-bleu" id="tb-scan">📸 Ticket / facture</button><button class="btn btn-primaire" id="tb-dep">＋ Dépense</button>
        <a class="btn btn-fantome" href="#/prix">🧮 Devis</a><a class="btn btn-fantome" href="#/donnees">⚙️ Mes données</a><button class="btn btn-fantome" id="tb-ecoute">🔊 Écouter</button></div></div>
    ${!R.comptes.some(c => c.actif) || !(membres || []).length ? `<div class="demarrer">👋 <b>Pour commencer</b>, enregistrez ${!(membres || []).length ? 'votre foyer' : ''}${!(membres || []).length && !R.comptes.some(c => c.actif) ? ' et ' : ''}${!R.comptes.some(c => c.actif) ? 'vos comptes (banque, espèces, épargne)' : ''}. <a class="btn btn-petit btn-primaire" href="#/donnees">⚙️ Mes données →</a></div>` : ''}
    <div class="bulles">${bulles.join('')}</div>`;
  $('#tb-scan').onclick = () => A.scanner ? A.scanner() : toast('Scanner indisponible.', true);
  $('#tb-dep').onclick = () => formOperation({ type: 'depense' }, () => router());
  $('#tb-ecoute').onclick = (e) => action(e.target, async () => A.parler?.(await A.pointDuJour()));
  const b = $('#badge-alertes'); if (b) { b.hidden = !(alertes || []).length; b.textContent = (alertes || []).length || ''; }
  setTimeout(() => A.verifierAccueil?.(), 300);
};

/* ---------------------------------------------------------------- Alertes */
VUES.alertes = async (el) => {
  const l = doux(await db.from('alertes').select('*').order('lue').order('created_at', { ascending: false }).limit(100)) || [];
  const NIV = { urgent: '🚨', attention: '⚠️', info: 'ℹ️' };
  el.innerHTML = `<div class="tete-vue"><h1>🔔 Alertes</h1><div class="actions"><button class="btn btn-fantome" id="al-tout">✓ Tout marquer comme vu</button></div></div>
    <div class="carte">${l.map(a => `<div class="alerte-ligne niv-${a.niveau} ${a.lue ? 'lue' : ''}"><div><b>${NIV[a.niveau] || '🔔'} ${esc(a.titre)}</b><div class="msg">${esc(a.message || '').replace(/\n/g, '<br>')}</div><span class="aide">${fmtDate(a.created_at.slice(0, 10))}</span></div>
      ${a.lue ? '' : `<button class="btn btn-petit btn-fantome" data-lu="${a.id}">✓ Vu</button>`}</div>`).join('') || '<div class="vide">Aucune alerte. 👍</div>'}</div>`;
  el.onclick = (e) => { const b = e.target.closest('[data-lu]'); if (b) action(b, async () => { verifier(await db.from('alertes').update({ lue: true }).eq('id', b.dataset.lu)); router(); }); };
  $('#al-tout').onclick = (e) => action(e.target, async () => { verifier(await db.from('alertes').update({ lue: true }).eq('lue', false)); router(); });
};

/* ---------------------------------------------------------------- Météo */
VUES.meteo = async (el) => {
  A.installerVoix?.();
  el.innerHTML = `<div class="tete-vue"><h1>🌦️ Météo & conseils</h1><div class="actions"><button class="btn btn-fantome" id="me-lieu">📍 Changer de lieu</button></div></div><div class="meteo-page" id="me-zone"></div>`;
  $('#me-lieu').onclick = () => A.choisirLieu?.(() => router());
  if (A.carteMeteo) await A.carteMeteo($('#me-zone'));
};

/* ---------------------------------------------------------------- Mes données : par où commencer, où tout enregistrer */
VUES.donnees = async (el) => {
  const n = async (q) => { const r = await q; return r?.count ?? (Array.isArray(r?.data) ? r.data.length : 0); };
  const tete = (t) => db.from(t).select('*', { count: 'exact', head: true });
  const [membres, comptes, echeances, ops, docs, listes, sante] = await Promise.all([n(tete('membres_foyer').eq('actif', true)), Promise.resolve(R.comptes.filter(c => c.actif).length),
    n(tete('echeances').eq('actif', true)), n(tete('operations')), n(tete('documents')), n(tete('listes_courses')), n(db.from('foyer_parametres').select('sante_demandee').eq('sante_demandee', true))]);
  const etapes = [
    ['foyer', '🏡', 'Mon foyer', 'Qui vit à la maison : vous, l\'autre parent, les enfants (âges, régimes, allergies).', membres, `${membres} personne(s)`, '#/foyer', 'Ouvrir'],
    ['sante', '🩺', 'Santé du foyer', 'Les pathologies de chacun pour adapter repas, sport et conseils.', sante, sante ? 'Renseignée' : 'À faire', '#/foyer', 'Ouvrir'],
    ['comptes', '🏦', 'Mes comptes', 'Chaque compte bancaire (perso, joint), la caisse espèces, l\'épargne, avec le solde du jour.', comptes, `${comptes} compte(s)`, null, '＋ Créer un compte'],
    ['factures', '📆', 'Mes factures régulières', 'Électricité, eau, loyer, assurances, abonnements… et le salaire (rentrée d\'argent).', echeances, `${echeances} enregistrée(s)`, '#/echeances', 'Ouvrir'],
    ['depenses', '🧾', 'Mes dépenses et recettes', 'Saisie à la main, ou photo d\'un ticket ou d\'une facture.', ops, `${ops} opération(s)`, '#/operations', 'Ouvrir'],
    ['courses', '🛒', 'Courses', 'Listes de courses, produits, tickets de caisse.', listes, `${listes} liste(s)`, '#/courses', 'Ouvrir'],
    ['documents', '📎', 'Documents', 'Factures, contrats, garanties, papiers… rangés par espace de vie.', docs, `${docs} document(s)`, '#/espaces', 'Ouvrir'],
    ['epargne', '🐷', 'Épargne', 'Objectifs d\'épargne (fonds d\'urgence, vacances…).', null, '', '#/espace/epargne', 'Ouvrir'],
    ['parametres', '🏷️', 'Magasins et catégories', 'Vos magasins, fournisseurs et catégories de dépenses.', null, '', '#/tiers', 'Ouvrir']
  ];
  const faites = etapes.filter(e => e[4]).length, aFaire = etapes.filter(e => e[4] === 0).length;
  el.innerHTML = `<div class="tete-vue"><div><h1>⚙️ Mes données</h1><div class="aide">Tout ce que vous enregistrez ici est sauvegardé dans votre base B-S@fe.</div></div></div>
    ${aFaire ? `<div class="alerte" style="margin-bottom:14px">👉 Pour bien démarrer : ${aFaire} étape(s) à compléter, dans l'ordre ci-dessous.</div>` : ''}
    <div class="donnees">${etapes.map(([k, ic, t, d, v, etat, lien, bouton]) => `<div class="carte donnee ${v === 0 ? 'a-faire' : v ? 'faite' : ''}"><div class="b-ic">${ic}</div>
      <div class="donnee-txt"><b>${t}</b> ${v === 0 ? '<span class="pastille orange">à faire</span>' : v ? `<span class="pastille rec">✓ ${etat}</span>` : ''}<div class="aide">${d}</div></div>
      ${lien ? `<a class="btn ${v === 0 ? 'btn-primaire' : 'btn-fantome'}" href="${lien}">${bouton}</a>` : `<button class="btn ${v === 0 ? 'btn-primaire' : 'btn-fantome'}" data-act="${k}">${bouton}</button>`}</div>`).join('')}</div>`;
  el.onclick = (e) => { const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'comptes') A.formCompte ? A.formCompte({ nature: 'personnel', type: 'banque' }, async () => { await A.chargerReferentiels(); router(); }) : (location.hash = '#/comptes'); };
};

/* ---------------------------------------------------------------- Utilisateurs (administrateurs) : voir et débloquer les comptes */
VUES.utilisateurs = async (el) => {
  const [r, rv, rc] = await Promise.all([db.rpc('admin_utilisateurs'), db.rpc('admin_visages'), db.rpc('admin_coffres')]);
  const CF = new Map((rc.data || []).map(c => [c.user_id, c]));
  if (r.error) { el.innerHTML = `<div class="carte"><h3>👥 Utilisateurs</h3><p>${/Réservé/.test(r.error.message) ? 'Page réservée aux administrateurs.' : esc(r.error.message)}</p></div>`; return; }
  const V = new Map((rv.data || []).map(v => [v.user_id, v]));
  const ETATS = { en_attente: ['⏳ Jamais connecté (code non validé)', 'orange'], sans_acces: ['🚫 Sans accès', 'dep'], jamais_connecte: ['✅ Confirmé · jamais connecté', ''], actif: ['✅ Actif', 'rec'] };
  const visage = (v) => !v ? '<span class="aide">—</span>'
    : v.bloque ? `<span class="pastille dep">🔒 ${v.motif === 'nouvel_appareil' ? 'Nouvel appareil' : '3 échecs'}</span>`
    : v.reenregistrement ? '<span class="pastille orange">📷 Nouveau visage autorisé</span>'
    : v.enregistre ? `<span class="pastille rec">🙂 Enregistré</span>${v.echecs ? ` <span class="aide">${v.echecs} échec(s)</span>` : ''}` : '<span class="aide">Pas encore</span>';
  const l = r.data || [], bloques = [...V.values()].filter(v => v.bloque).length;
  el.innerHTML = `<div class="tete-vue"><div><h1>👥 Utilisateurs</h1><div class="aide">${l.length} compte(s)${bloques ? ` · <b style="color:var(--rouge)">${bloques} bloqué(s)</b>` : ''}</div></div></div>
    <div class="carte"><div class="tableau-wrap"><table><thead><tr><th>Compte</th><th>État</th><th>Visage</th><th class="masquer-mobile">Dernière connexion</th><th class="masquer-mobile">Accès</th><th></th></tr></thead><tbody>
    ${l.map(u => { const v = V.get(u.id); return `<tr><td><b>${esc(u.email)}</b>${u.nom && u.nom !== u.email ? `<div class="aide">${esc(u.nom)}</div>` : ''}</td><td><span class="pastille ${ETATS[u.etat]?.[1] || ''}">${ETATS[u.etat]?.[0] || u.etat}</span></td>
      <td>${visage(v)}</td><td class="masquer-mobile">${u.derniere_connexion ? fmtDate(u.derniere_connexion.slice(0, 10)) : '—'}</td><td class="masquer-mobile aide">${esc(u.acces || '—')}</td>
      <td>${v?.bloque && v.motif !== 'nouvel_appareil' ? `<button class="btn btn-petit btn-primaire" data-visage="debloquer" data-u="${u.id}">🔓 Débloquer</button> ` : ''}
        ${v?.bloque || v?.enregistre ? `<button class="btn btn-petit btn-fantome" data-visage="reenregistrer" data-u="${u.id}">📷 Nouveau visage</button> ` : ''}
        ${CF.get(u.id)?.bloque ? `<button class="btn btn-petit btn-primaire" data-coffre="${u.id}">🔐 Débloquer le coffre</button> ` : ''}
        ${u.etat === 'sans_acces' ? `<button class="btn btn-petit btn-primaire" data-conf="${u.id}">🔓 Donner l'accès</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="aide" style="margin-bottom:0">Vérifiez toujours auprès de la personne avant de débloquer. « 🔓 Débloquer » remet les essais à zéro (visage inchangé). « 📷 Nouveau visage » débloque et lui fait réenregistrer son visage à la prochaine connexion (nouveau téléphone, appli réinstallée, visage mal enregistré).</p></div>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-visage]'); if (b) return action(b, async () => { verifier(await db.rpc('admin_visage', { p_user: b.dataset.u, p_action: b.dataset.visage }), 'Déblocage'); toast(b.dataset.visage === 'debloquer' ? 'Compte débloqué.' : 'Compte débloqué : la personne réenregistrera son visage à la prochaine connexion.'); router(); });
    const co = e.target.closest('[data-coffre]'); if (co) return action(co, async () => { verifier(await db.rpc('admin_coffre_debloquer', { p_user: co.dataset.coffre }), 'Coffre'); toast('Coffre débloqué (son contenu reste illisible pour vous).'); router(); });
    const cf = e.target.closest('[data-conf]'); if (cf) return action(cf, async () => { verifier(await db.rpc('admin_confirmer', { p_user: cf.dataset.conf }), 'Accès'); toast('Accès donné.'); router(); });
  };
};

/* ---------------------------------------------------------------- Bouton « retour au tableau de bord » sur toutes les pages */
Object.keys(VUES).forEach(k => {
  if (k === 'aujourdhui') return;
  const vue = VUES[k];
  VUES[k] = async (el, p) => {
    await vue(el, p);
    if (!el.querySelector(':scope > .retour')) el.insertAdjacentHTML('afterbegin', `<div class="retour"><a href="#/aujourdhui" class="btn btn-petit btn-fantome">🏠 Tableau de bord</a>${history.length > 1 ? '<button class="btn btn-petit btn-fantome" data-retour>← Retour</button>' : ''}</div>`);
    const r = el.querySelector(':scope > .retour [data-retour]'); if (r) r.onclick = () => history.back();
  };
});
});
