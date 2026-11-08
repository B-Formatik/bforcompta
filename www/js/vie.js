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
const REPAS = { petit_dejeuner: 'Petit-déjeuner', dejeuner: 'Déjeuner', gouter: 'Goûter (enfants)', diner: 'Dîner' };
const LIENS = { moi: 'Moi', parent: 'Parent / conjoint(e)', enfant: 'Enfant', grand_parent: 'Grand-parent', autre: 'Autre' };
/* Pathologies : règles générales (repères de santé publique), elles ne remplacent pas l'avis du médecin.
   eviter = recette écartée des menus du foyer · limiter = recette moins proposée · favoriser = recette mise en avant
   maxIntens = intensité de sport conseillée au maximum (1 douce, 2 modérée, 3 intense) */
const PATHOS = {
  diabete: { lib: '🩸 Diabète', limiter: ['sucre', 'pain', 'pate a pizza', 'spaghetti', 'pate', 'semoule', 'plantain', 'patate douce', 'pomme de terre', 'farine'], favoriser: ['lentille', 'haricot', 'pois chiche', 'brocoli', 'epinard', 'salade', 'poisson', 'courgette'],
    cuisine: 'Féculents en petite portion (de préférence complets), légumes à volonté, pas de boisson sucrée ; un fruit plutôt qu\'un dessert sucré.', sport: 'Activité régulière recommandée ; contrôlez la glycémie avant et après l\'effort et gardez un sucre sur vous.', maxIntens: 3 },
  hypertension: { lib: '❤️ Hypertension', eviter: ['morue', 'jambon', 'saucisse', 'lardon'], limiter: ['fromage', 'mozzarella', 'thon'], favoriser: ['legume', 'brocoli', 'haricot vert', 'courgette', 'poisson', 'lentille'],
    cuisine: 'Peu de sel : goûtez avant de saler, remplacez le sel par les herbes, le citron et les épices ; évitez charcuterie, morue salée et plats préparés.', sport: 'Endurance modérée (marche rapide, vélo, natation) ; évitez les efforts violents et le port de charges lourdes sans avis médical.', maxIntens: 2 },
  cholesterol: { lib: '🫀 Cholestérol', eviter: ['saucisse', 'lardon'], limiter: ['jambon', 'fromage', 'beurre', 'creme', 'viande hach', 'mozzarella'], favoriser: ['poisson', 'saumon', 'lentille', 'pois chiche', 'haricot', 'brocoli'], friture: true,
    cuisine: 'Moins de graisses animales (beurre, crème, charcuterie, fromage) et de friture ; poisson au moins 2 fois par semaine ; légumineuses.', sport: 'Activité d\'endurance régulière, 30 min par jour.', maxIntens: 3 },
  coeliaque: { lib: '🌾 Maladie cœliaque', eviter: ['farine', 'pain', 'pate', 'spaghetti', 'semoule', 'pate bris', 'pate a pizza'], regime: 'sans_gluten',
    cuisine: 'Aucun gluten (blé, orge, seigle) : vérifiez les étiquettes, même pour les épices et sauces.', sport: '', maxIntens: 3 },
  renal: { lib: '🫘 Maladie des reins', eviter: ['morue', 'jambon', 'saucisse', 'lardon'], limiter: ['fromage', 'viande hach', 'lait'],
    cuisine: 'Peu de sel et quantités de protéines selon votre néphrologue ; demandez-lui pour le potassium (bananes, légumes secs).', sport: 'Activité douce à modérée selon votre néphrologue.', maxIntens: 2 },
  goutte: { lib: '🦶 Goutte', eviter: ['crevette', 'sardine'], limiter: ['viande hach', 'morue', 'thon'],
    cuisine: 'Limitez viandes rouges, abats et fruits de mer ; pas d\'alcool ni de soda ; buvez beaucoup d\'eau.', sport: 'Activité douce, évitez l\'effort pendant une crise.', maxIntens: 2 },
  surpoids: { lib: '⚖️ Surpoids', limiter: ['fromage', 'creme', 'beurre', 'mozzarella', 'pate a pizza'], favoriser: ['legume', 'salade', 'brocoli', 'courgette', 'poisson', 'lentille'], friture: true,
    cuisine: 'Moitié de l\'assiette en légumes, féculents en portion raisonnable, moins de friture et de fromage.', sport: 'Commencez doucement : 30 min de marche par jour, puis augmentez progressivement.', maxIntens: 2 },
  grossesse: { lib: '🤰 Grossesse', eviter: ['jambon', 'saucisse', 'lardon'], limiter: ['thon', 'saumon'],
    cuisine: 'Viande et poisson bien cuits, œufs cuits durs, légumes bien lavés, pas de lait cru ni de charcuterie ; limitez le thon (mercure).', sport: 'Activité douce à modérée (marche, natation, gym douce) ; évitez les sports de contact et les chutes.', maxIntens: 2 },
  asthme: { lib: '🌬️ Asthme', cuisine: '', sport: 'Échauffement progressif de 10 min, inhalateur à portée de main, évitez l\'effort au froid ou en cas de pollution.', maxIntens: 3 },
  cardiaque: { lib: '💓 Maladie cardiaque', eviter: ['morue', 'jambon', 'saucisse', 'lardon'], limiter: ['fromage', 'beurre', 'creme'], favoriser: ['poisson', 'legume', 'lentille'], friture: true,
    cuisine: 'Peu de sel, peu de graisses animales, poisson et légumes chaque jour.', sport: 'Effort modéré uniquement, selon l\'avis du cardiologue ; arrêtez en cas de douleur, malaise ou essoufflement inhabituel.', maxIntens: 2 },
  articulations: { lib: '🦴 Dos / articulations', cuisine: '', sport: 'Privilégiez natation, vélo, marche, gym douce ; évitez les sports à impacts (course sur bitume, sauts).', maxIntens: 2, impacts: true },
  drepanocytose: { lib: '🩸 Drépanocytose', favoriser: ['lentille', 'epinard', 'haricot', 'brocoli'],
    cuisine: 'Buvez beaucoup d\'eau tout au long de la journée ; aliments riches en acide folique (légumes verts, légumineuses).', sport: 'Hydratez-vous avant, pendant et après ; évitez les efforts intenses, la chaleur extrême, le froid et la déshydratation.', maxIntens: 2 },
  reflux: { lib: '🔥 Reflux / brûlures d\'estomac', limiter: ['piment', 'tomate', 'citron', 'orange', 'creme', 'beurre', 'chocolat', 'oignon'], friture: true,
    cuisine: 'Repas légers et fractionnés, moins de gras, d\'épices, d\'agrumes, de café et d\'alcool ; dîner 2 à 3 h avant le coucher.', sport: 'Évitez l\'effort juste après le repas et les exercices tête en bas.', maxIntens: 3 },
  osteoporose: { lib: '🦴 Ostéoporose', favoriser: ['lait', 'yaourt', 'fromage', 'sardine', 'brocoli', 'epinard'],
    cuisine: '3 produits laitiers par jour (calcium), poissons gras pour la vitamine D, un peu de soleil.', sport: 'Marche, gym douce et renforcement musculaire ; évitez les risques de chute.', maxIntens: 2 },
  intestin: { lib: '🌀 Côlon irritable / digestion', limiter: ['haricot rouge', 'pois chiche', 'lentille', 'oignon', 'chou'], friture: true,
    cuisine: 'Augmentez les fibres progressivement, limitez légumineuses, chou, oignon et boissons gazeuses en cas de ballonnements ; mangez lentement.', sport: 'Marche après les repas, yoga, natation.', maxIntens: 3 },
  thyroide: { lib: '🦋 Thyroïde', cuisine: 'Prenez votre traitement à jeun, à distance du café, du soja et des compléments de fer ou de calcium ; alimentation variée.', sport: 'Activité régulière adaptée à votre forme du moment.', maxIntens: 3 },
  anemie: { lib: '🩸 Anémie', favoriser: ['lentille', 'epinard', 'haricot rouge', 'viande hach', 'oeuf'],
    cuisine: 'Aliments riches en fer (légumineuses, viande, légumes verts) avec un agrume (citron) pour mieux l\'absorber ; évitez le thé au repas.', sport: 'Effort progressif, arrêtez en cas d\'essoufflement ou de vertige.', maxIntens: 2 }
};
const AVERT_SANTE = 'Conseils généraux qui ne remplacent pas l\'avis de votre médecin.';
const pathosDe = (membres) => [...new Set(membres.flatMap(m => m.pathologies || []))].filter(k => PATHOS[k]);
const contient = (r, mots) => (mots || []).filter(k => r.ingredients.some(i => radical(i.n).includes(radical(k)) || radical(i.k).includes(radical(k))));
const estFrit = (r) => /\bfri(re|ture|t)\b|huile chaude/i.test(r.instructions || '');
/* analyse santé d'une recette pour le foyer : écartée ? points (bonus/malus) ? remarques par personne */
function santeRecette(r, membres) {
  let exclue = false, points = 0; const notes = [];
  membres.forEach(m => (m.pathologies || []).forEach(k => { const P = PATHOS[k]; if (!P) return;
    const ev = contient(r, P.eviter), li = contient(r, P.limiter), fa = contient(r, P.favoriser);
    if (ev.length) { exclue = true; notes.push(`⛔ ${m.prenom} (${P.lib.replace(/^\S+ /, '')}) : à éviter — ${ev.join(', ')}`); }
    else if (li.length || (P.friture && estFrit(r))) { points -= 1.5; notes.push(`⚠️ ${m.prenom} (${P.lib.replace(/^\S+ /, '')}) : à limiter — ${[...li, ...(P.friture && estFrit(r) ? ['friture'] : [])].join(', ')}`); }
    if (fa.length) { points += 0.6; notes.push(`✅ ${m.prenom} (${P.lib.replace(/^\S+ /, '')}) : recommandé — ${fa.slice(0, 3).join(', ')}`); }
  }));
  return { exclue, points, notes };
}

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
    <div class="ligne"><div class="champ"><label>Lien</label><select name="lien">${opts(LIENS, m.lien || (m.role === 'enfant' ? 'enfant' : 'parent'))}</select></div>
      <div class="champ" id="mb-mail-z" ${m.role === 'enfant' ? 'hidden' : ''}><label>E-mail (pour partager B-S@fe)</label><input name="email" type="email" value="${esc(m.email || '')}" placeholder="facultatif"><div class="aide">La personne voit alors le foyer, les comptes joints, les menus… sur son téléphone.</div></div></div>
    <div class="ligne"><div class="champ"><label>Date de naissance</label><input type="date" name="date_naissance" value="${m.date_naissance || ''}"><div class="aide">Sert à adapter les portions et les objectifs de sport.</div></div>
      <div class="champ"><label>Objectif sport (min / semaine)</label><input name="objectif_sport_min" inputmode="numeric" value="${m.objectif_sport_min ?? ''}" placeholder="150 adulte · 420 enfant"></div></div>
    <div class="champ"><label>Régime alimentaire</label><div class="cases">${Object.entries(REGIMES).map(([k, l]) => `<label class="case"><input type="checkbox" name="regime" value="${k}" ${(m.regimes || []).includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
    <div class="champ"><label>Allergies / aliments à éviter</label><input name="allergies" value="${esc((m.allergies || []).join(', '))}" placeholder="ex : arachide, crevette, lait"></div>
    <div class="champ"><label>🩺 Santé (facultatif) — pour adapter les repas et le sport</label><div class="cases">${Object.entries(PATHOS).map(([k, P]) => `<label class="case"><input type="checkbox" name="patho" value="${k}" ${(m.pathologies || []).includes(k) ? 'checked' : ''}> ${P.lib}</label>`).join('')}</div>
      <input name="sante_notes" value="${esc(m.sante_notes || '')}" placeholder="Autre, précisions (ex : pas d'effort intense, régime prescrit…)" style="margin-top:6px"><div class="aide">Visible uniquement par votre foyer. ${AVERT_SANTE}</div></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="mb-suppr">Retirer</button>'}<button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (md) => {
    const f = $('#f-mb', md);
    $('#mb-role', md).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; f.role.value = b.dataset.r; $$('#mb-role button', md).forEach(x => x.classList.toggle('on', x === b));
      $('#mb-mail-z', md).hidden = b.dataset.r === 'enfant'; if (b.dataset.r === 'enfant') f.lien.value = 'enfant'; else if (f.lien.value === 'enfant') f.lien.value = 'parent'; };
    f.onsubmit = (e) => { e.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { prenom: val(f, 'prenom'), role: f.role.value, date_naissance: val(f, 'date_naissance'), objectif_sport_min: num(f, 'objectif_sport_min'),
        regimes: $$('input[name=regime]:checked', f).map(x => x.value), pathologies: $$('input[name=patho]:checked', f).map(x => x.value), sante_notes: val(f, 'sante_notes'), lien: val(f, 'lien'), email: f.role.value === 'enfant' ? null : val(f, 'email'), allergies: (val(f, 'allergies') || '').split(/[,;]/).map(s => s.trim()).filter(Boolean) };
      verifier(neuf ? await db.from('membres_foyer').insert(rec) : await db.from('membres_foyer').update(rec).eq('id', m.id), 'Foyer');
      if (rec.email && rec.email !== m.email) { const msg = await inviter(rec.email); toast(msg, /impossible|aucun/i.test(msg)); } else toast('Enregistré.');
      fermerModale(); apres ? apres() : router();
    }); };
    if (!neuf) $('#mb-suppr', md).onclick = (e) => action(e.target, async () => { if (!await confirmer(`Retirer ${m.prenom} du foyer ?`)) return; verifier(await db.from('membres_foyer').update({ actif: false }).eq('id', m.id)); fermerModale(); router(); });
  });
}

/* Inviter un autre parent : il devient co-titulaire du compte joint du foyer (créé s'il n'existe pas), ce qui partage le foyer */
async function inviter(email) {
  let joint = A.R.comptes.find(c => c.actif && c.nature === 'joint');
  if (!joint) { const r = await db.from('comptes').insert({ nom: 'Compte du foyer', type: 'banque', nature: 'joint', solde_initial: 0, date_ouverture: auj() }).select().single();
    if (r.error) return 'Invitation impossible : ' + r.error.message; joint = r.data; await A.chargerReferentiels(); }
  const r = await db.rpc('ajouter_titulaire', { p_compte: joint.id, p_email: email });
  return r.error ? (/Aucun compte/i.test(r.error.message) ? `Aucun compte B-S@fe pour ${email} : la personne doit d'abord créer son accès (« Créer un compte » sur l'écran de connexion), puis revenez ici.` : 'Invitation impossible : ' + r.error.message)
    : `${email} partage maintenant votre foyer (compte joint « ${joint.nom} »).`;
}

VUES.foyer = async (el) => {
  const F = await chargerFoyer();
  if (F.manque) { el.innerHTML = '<div class="carte"><h3>🛠️ Mise à jour de la base nécessaire</h3><p>Le module « Mon foyer » a besoin du script <b>08_foyer_cuisine_sport.sql</b>.</p></div>'; return; }
  const p = F.params || {};
  el.innerHTML = `<div class="tete-vue"><h1>👨‍👩‍👧 Mon foyer</h1><div class="actions"><button class="btn btn-fantome" id="fo-sante">🩺 Santé du foyer</button><button class="btn btn-fantome" id="fo-import">⬇️ Importer mes enfants</button><button class="btn btn-fantome" id="fo-parent">👫 Ajouter un parent</button><button class="btn btn-primaire" id="fo-ajout">＋ Enfant / autre</button></div></div>
    <div class="aj-grille"><div class="aj-col"><div class="carte"><h3>Qui vit à la maison <span class="aide">${resumeFoyer(F.membres)} · ${String(portionsFoyer(F.membres)).replace('.', ',')} portions par repas</span></h3>
      ${F.membres.map(m => `<div class="aj-item cliquable" data-id="${m.id}"><span class="pastille">${m.role === 'adulte' ? '🧑 ' + (LIENS[m.lien] && m.lien !== 'autre' ? LIENS[m.lien] : 'Adulte') : '🧒 Enfant'}</span><b>${esc(m.prenom)}</b>${m.email ? ` <span class="aide">✉️ ${esc(m.email)}</span>` : ''}
        <span class="aide">${age(m.date_naissance) != null ? age(m.date_naissance) + ' ans · ' : ''}part ${String(part(m)).replace('.', ',')}</span>
        ${(m.regimes || []).map(r => `<span class="pastille orange">${REGIMES[r] || r}</span>`).join('')}${(m.allergies || []).length ? `<span class="pastille dep">⚠️ ${esc(m.allergies.join(', '))}</span>` : ''}${(m.pathologies || []).map(k => `<span class="pastille sante">${PATHOS[k]?.lib || k}</span>`).join('')}</div>`).join('') || '<div class="vide">Personne pour l\'instant.</div>'}
      <p class="aide" style="margin-bottom:0">Les portions des recettes s'adaptent automatiquement : adulte = 1, enfant de 7 à 11 ans = 0,75, de 3 à 6 ans = 0,5…</p></div></div>
    <div class="aj-col"><div class="carte"><h3>Réglages</h3><form id="f-fp">
      <div class="champ"><label>Nom du foyer</label><input name="nom" value="${esc(p.nom || 'Mon foyer')}"></div>
      <div class="champ"><label>Repas à planifier</label><div class="cases">${Object.entries(REPAS).map(([k, l]) => `<label class="case"><input type="checkbox" name="repas" value="${k}" ${(p.repas || ['diner']).includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
      <div class="champ"><label>Budget courses par semaine (€)</label><input name="budget" inputmode="decimal" value="${p.budget_courses_semaine ?? ''}"></div>
      <button class="btn btn-primaire">Enregistrer</button></form></div></div></div>`;
  $('#fo-ajout').onclick = () => formMembre({ role: 'enfant', lien: 'enfant' });
  $('#fo-parent').onclick = () => formMembre({ role: 'adulte', lien: 'parent' });
  $('#fo-sante').onclick = () => demanderSante(F, true);
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

/* Questionnaire santé (facultatif), une fois par foyer */
async function demanderSante(F, force = false) {
  if (!F.membres.length) return;
  if (!force) { try { if (sessionStorage.getItem('bsafe-sante-plus-tard')) return; } catch {} if (F.params?.sante_demandee || F.membres.some(m => (m.pathologies || []).length)) return; }
  if (!$('#modale').hidden) return;
  ouvrirModale('🩺 Santé du foyer (facultatif)', `<p style="margin-top:0">Quelqu'un dans le foyer a-t-il un problème de santé à prendre en compte ? B-S@fe adaptera les <b>menus</b> (aliments à éviter ou à limiter), le <b>sport</b> (intensité conseillée) et les <b>conseils</b>.</p>
    <p class="aide">Ces informations restent dans votre foyer. ${AVERT_SANTE}</p>
    ${F.membres.map(m => `<div class="sante-membre"><b>${esc(m.prenom)}</b> <span class="aide">${m.role === 'enfant' ? 'enfant' : 'adulte'}</span>
      <div class="cases">${Object.entries(PATHOS).filter(([k]) => m.role === 'adulte' || k !== 'grossesse').map(([k, P]) => `<label class="case"><input type="checkbox" data-m="${m.id}" value="${k}" ${(m.pathologies || []).includes(k) ? 'checked' : ''}> ${P.lib}</label>`).join('')}</div>
      <input data-notes="${m.id}" value="${esc(m.sante_notes || '')}" placeholder="Autre / précisions (facultatif)"></div>`).join('')}
    <div class="modale-pied"><button type="button" class="btn btn-fantome" id="sa-tard">Plus tard</button><button type="button" class="btn btn-fantome" id="sa-rien">Personne n'est concerné</button><button type="button" class="btn btn-primaire" id="sa-ok">Enregistrer</button></div>`, (md) => {
    const fini = async () => { await db.from('foyer_parametres').upsert({ proprietaire: A.utilisateurId, sante_demandee: true, onboarding_fait: true }); fermerModale(); };
    $('#sa-tard', md).onclick = () => { try { sessionStorage.setItem('bsafe-sante-plus-tard', '1'); } catch {} fermerModale(); };
    $('#sa-rien', md).onclick = (e) => action(e.target, async () => { await fini(); toast('Noté. Vous pourrez compléter dans « Mon foyer ».'); });
    $('#sa-ok', md).onclick = (e) => action(e.target, async () => {
      for (const m of F.membres) {
        const pathologies = $$(`input[data-m="${m.id}"]:checked`, md).map(x => x.value), sante_notes = $(`input[data-notes="${m.id}"]`, md).value.trim() || null;
        verifier(await db.from('membres_foyer').update({ pathologies, sante_notes }).eq('id', m.id), 'Santé');
      }
      await fini(); toast('Santé enregistrée : menus et sport adaptés. 🩺'); if (/cuisine|sport|foyer/.test(location.hash)) router();
    });
  });
}

/* Accueil au premier lancement : composition du foyer */
async function verifierAccueil() {
  try { if (sessionStorage.getItem('bsafe-accueil-plus-tard')) return; } catch {}
  if (!$('#modale').hidden) return;
  const F = await chargerFoyer(); if (F.manque) return;
  if (F.params?.onboarding_fait || F.membres.length) return demanderSante(F);
  const enf = doux(await db.from('enfants').select('prenom, date_naissance, id').eq('actif', true)) || [];
  let lignes = [{ prenom: '', role: 'adulte' }, ...enf.map(x => ({ prenom: x.prenom, role: 'enfant', date_naissance: x.date_naissance, enfant_id: x.id }))];
  const rendre = () => lignes.map((l, i) => `<div class="ligne-membre"><input data-i="${i}" data-k="prenom" value="${esc(l.prenom)}" placeholder="Prénom">
      <select data-i="${i}" data-k="role">${opts({ adulte: 'Adulte', enfant: 'Enfant' }, l.role)}</select>
      <input type="date" data-i="${i}" data-k="date_naissance" value="${l.date_naissance || ''}" title="Date de naissance"><button type="button" class="btn-x" data-retirer="${i}">×</button></div>`).join('');
  ouvrirModale('👋 Bienvenue dans B-S@fe', `<p style="margin-top:0">Pour adapter les <b>repas</b> (quantités), le <b>sport</b> et les conseils, dites-moi qui vit dans votre foyer. Vous pourrez tout modifier dans « Mon foyer ».</p>
    <div id="ac-lignes">${rendre()}</div><button type="button" class="btn btn-petit btn-fantome" id="ac-plus">＋ Une personne</button>
    <div class="champ" style="margin-top:12px"><label>Repas à planifier</label><div class="cases"><label class="case"><input type="checkbox" id="ac-pdj" checked> Petit-déjeuner</label><label class="case"><input type="checkbox" id="ac-dej"> Déjeuner</label><label class="case"><input type="checkbox" id="ac-gou"> Goûter (enfants)</label><label class="case"><input type="checkbox" id="ac-din" checked> Dîner</label></div></div>
    <div class="modale-pied"><button type="button" class="btn btn-fantome" id="ac-tard">Plus tard</button><button type="button" class="btn btn-primaire" id="ac-ok">C'est parti</button></div>`, (md) => {
    const zone = $('#ac-lignes', md);
    zone.oninput = zone.onchange = (e) => { const i = e.target.dataset.i; if (i == null) return; let v = e.target.value; const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v); if (d) v = `${d[3]}-${d[2]}-${d[1]}`; else if (e.target.dataset.k === 'date_naissance' && v && !/^\d{4}-/.test(v)) v = ''; lignes[i][e.target.dataset.k] = v; };
    zone.onclick = (e) => { const b = e.target.closest('[data-retirer]'); if (b) { lignes.splice(+b.dataset.retirer, 1); zone.innerHTML = rendre(); } };
    $('#ac-plus', md).onclick = () => { lignes.push({ prenom: '', role: 'enfant' }); zone.innerHTML = rendre(); };
    $('#ac-tard', md).onclick = () => { try { sessionStorage.setItem('bsafe-accueil-plus-tard', '1'); } catch {} fermerModale(); };
    $('#ac-ok', md).onclick = (e) => action(e.target, async () => {
      const ok = lignes.filter(l => l.prenom.trim()); if (!ok.length) throw new Error('Indiquez au moins un prénom.');
      verifier(await db.from('membres_foyer').insert(ok.map(l => ({ prenom: l.prenom.trim(), role: l.role, date_naissance: l.date_naissance || null, enfant_id: l.enfant_id || null }))), 'Foyer');
      verifier(await db.from('foyer_parametres').upsert({ proprietaire: A.utilisateurId, repas: [$('#ac-pdj', md).checked && 'petit_dejeuner', $('#ac-dej', md).checked && 'dejeuner', $('#ac-gou', md).checked && 'gouter', $('#ac-din', md).checked && 'diner'].filter(Boolean), onboarding_fait: true }), 'Réglages');
      fermerModale(); toast(`Foyer enregistré : ${resumeFoyer(ok)} 🎉`);
      setTimeout(async () => demanderSante(await chargerFoyer()), 400);
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
  const reg = new Set(membres.flatMap(m => [...(m.regimes || []), ...(m.pathologies || []).map(k => PATHOS[k]?.regime).filter(Boolean)]));
  if (santeRecette(r, membres).exclue) return false;
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
  const legers = genererLegers(C, debut, repasListe.filter(r => ['petit_dejeuner', 'gouter'].includes(r)));
  repasListe = repasListe.filter(r => !['petit_dejeuner', 'gouter'].includes(r));
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
    const note = (r) => scoreRecette(r, C.placard) * 3 + santeRecette(r, C.membres).points + (semaineChargee && r.temps_min <= 30 ? 1 : 0) + (r.tags.includes('enfants') && C.membres.some(m => m.role === 'enfant') ? 0.5 : 0) + Math.random() * 1.2;
    let cand = pool.filter(r => groupe(r) === g && !choisis.includes(r));
    if (!cand.length) cand = pool.filter(r => !choisis.includes(r));
    if (!cand.length) cand = pool.slice();
    if (!cand.length) return;
    const r = cand.sort((a, b) => note(b) - note(a))[0];
    if (g) cible[g]--; prec = groupe(r); choisis.push(r); c.recette = r;
  });
  return [...legers, ...creneaux.filter(c => c.recette)];
}
/* petit-déjeuner et goûter : on fait tourner les recettes dédiées sans répéter deux jours de suite */
const portionsRepas = (C, repas) => repas === 'gouter' ? portionsFoyer(C.membres.filter(m => m.role === 'enfant').length ? C.membres.filter(m => m.role === 'enfant') : C.membres) : C.portions;
function genererLegers(C, debut, types) {
  const out = [];
  if (!C.membres.some(m => m.role === 'enfant')) types = types.filter(t => t !== 'gouter');   // goûter : uniquement pour les enfants
  types.forEach(tp => { const pool = C.recettes.filter(r => r.type_repas === tp && compatible(r, C.membres)); if (!pool.length) return; let prec = null; const usage = new Map();
    for (let j = 0; j < 7; j++) { const cand = pool.filter(r => r !== prec); const r = cand.sort((a, b) => (scoreRecette(b, C.placard) + santeRecette(b, C.membres).points - (usage.get(b) || 0) * 2 + Math.random() * 1.5) - (scoreRecette(a, C.placard) + santeRecette(a, C.membres).points - (usage.get(a) || 0) * 2 + Math.random() * 1.5))[0] || pool[0];
      usage.set(r, (usage.get(r) || 0) + 1);
      out.push({ jour: plusJours(debut, j), repas: tp, recette: r }); prec = r; } });
  return out;
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
    ${(() => { const S = santeRecette(r, C.membres), ps = pathosDe(C.membres).filter(k => PATHOS[k].cuisine);
      return S.notes.length || ps.length ? `<div class="carte sante-bloc"><h3>🩺 Santé du foyer</h3>${S.notes.map(n => `<div>${esc(n)}</div>`).join('')}${ps.map(k => `<div class="aide"><b>${PATHOS[k].lib}</b> : ${esc(PATHOS[k].cuisine)}</div>`).join('')}<div class="aide"><i>${AVERT_SANTE}</i></div></div>` : ''; })()}
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

VUES.cuisine = async (el, param) => {
  if (param) { cu.onglet = param; history.replaceState(null, '', '#/cuisine'); }
  cu.debut ||= lundi();
  const C = await chargerCuisine();
  if (C.F.manque) { el.innerHTML = '<div class="carte"><h3>🛠️ Mise à jour de la base nécessaire</h3><p>Le module « Cuisine » a besoin du script <b>08_foyer_cuisine_sport.sql</b>.</p></div>'; return; }
  const fin = plusJours(cu.debut, 6);
  const menus = doux(await db.from('menus').select('*').gte('jour', cu.debut).lte('jour', fin).order('jour')) || [];
  const repasListe = (C.F.params?.repas?.length ? C.F.params.repas : ['diner']).slice().sort((a, b) => Object.keys(REPAS).indexOf(a) - Object.keys(REPAS).indexOf(b));
  const recById = (id) => C.recettes.find(r => r.id === id);
  const compat = C.recettes.filter(r => compatible(r, C.membres));
  el.innerHTML = `<div class="tete-vue"><div><h1>🍽️ Cuisine</h1><div class="aide">${resumeFoyer(C.membres)} · <b>${String(C.portions).replace('.', ',')} portions</b> par repas · <a href="#/foyer">modifier le foyer</a></div></div>
      <div class="actions"><button class="btn btn-fantome" id="cu-nouv">＋ Recette</button></div></div>
    ${pathosDe(C.membres).length ? `<div class="alerte" style="margin-bottom:12px">🩺 Menus adaptés à : ${pathosDe(C.membres).map(k => PATHOS[k].lib).join(' · ')}. Les recettes déconseillées sont écartées, celles à limiter sont moins proposées. <i>${AVERT_SANTE}</i></div>` : ''}
    <div class="bascule" id="cu-onglets" style="margin-bottom:14px">${[['menu', '📅 Menu de la semaine'], ['journal', '📓 Ce que j\'ai mangé'], ['idees', '💡 Avec mes courses'], ['recettes', '📖 Recettes'], ['placard', '🧺 Mes achats récents']].map(([k, l]) => `<button data-o="${k}" class="${cu.onglet === k ? 'on' : ''}">${l}</button>`).join('')}</div>
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
      verifier(await db.from('menus').upsert(prop.map(p => ({ proprietaire: A.utilisateurId, jour: p.jour, repas: p.repas, recette_id: p.recette.id, libelle: p.recette.nom, portions: portionsRepas(C, p.repas), statut: 'prevu' })), { onConflict: 'proprietaire,jour,repas' }), 'Menu');
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
        const typeR = ['petit_dejeuner', 'gouter'].includes(repas) ? repas : 'plat';
        const tri = compat.filter(x => x.type_repas === typeR).sort((x, y) => scoreRecette(y, C.placard) - scoreRecette(x, C.placard));
        ouvrirModale(`Choisir le ${REPAS[repas].toLowerCase()} du ${fmtDate(jour)}`, `<div class="recettes-grille">${tri.map(carteRecette).join('')}</div>`, (md) => {
          md.onclick = (ev) => { const k = ev.target.closest('[data-r]'); if (!k) return; const r = recById(k.dataset.r);
            action(null, async () => { verifier(await db.from('menus').upsert({ proprietaire: A.utilisateurId, jour, repas, recette_id: r.id, libelle: r.nom, portions: portionsRepas(C, repas), statut: 'prevu' }, { onConflict: 'proprietaire,jour,repas' })); fermerModale(); router(); }); };
        }); }
    };
  } else if (cu.onglet === 'journal') {
    await ongletJournal(c, C);
  } else if (cu.onglet === 'idees') {
    const tri = compat.map(r => ({ r, s: scoreRecette(r, C.placard) })).filter(x => x.s > 0 && x.r.type_repas === 'plat').sort((a, b) => b.s - a.s).map(x => x.r);
    c.innerHTML = `<p class="aide">Recettes classées selon ce que vous avez acheté ces 3 dernières semaines (listes de courses cochées ou terminées, tickets scannés).</p>
      <div class="recettes-grille">${tri.map(carteRecette).join('') || '<div class="carte vide" style="grid-column:1/-1">Aucun achat récent trouvé. Faites vos courses avec l\'onglet Courses ou scannez un ticket : les idées de repas apparaîtront ici.</div>'}</div>`;
    c.onclick = (e) => { const k = e.target.closest('[data-r]'); if (k) ouvrirRecette(C, C.recettes.find(r => r.id === k.dataset.r)); };
  } else if (cu.onglet === 'recettes') {
    const liste = C.recettes.filter(r => !cu.filtre || r.proteine === cu.filtre || r.type_repas === cu.filtre);
    c.innerHTML = `<div style="margin-bottom:12px"><select id="cu-filtre" style="width:auto"><option value="">Toutes les recettes</option><option value="petit_dejeuner" ${cu.filtre === 'petit_dejeuner' ? 'selected' : ''}>☕ Petits-déjeuners</option><option value="gouter" ${cu.filtre === 'gouter' ? 'selected' : ''}>🍌 Goûters</option>${Object.entries(PROTEINES).map(([k, l]) => `<option value="${k}" ${k === cu.filtre ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="recettes-grille">${liste.map(r => carteRecette(r).replace('recette-carte', 'recette-carte' + (compatible(r, C.membres) ? '' : ' incompatible'))).join('')}</div>
      <p class="aide">Grisées : recettes qui ne conviennent pas aux régimes ou allergies du foyer.</p>`;
    $('#cu-filtre').onchange = (e) => { cu.filtre = e.target.value; router(); };
    c.onclick = (e) => { const k = e.target.closest('[data-r]'); if (k) ouvrirRecette(C, C.recettes.find(r => r.id === k.dataset.r)); };
  } else {
    c.innerHTML = `<div class="carte"><h3>🧺 Achats des 3 dernières semaines <span class="aide">${C.achats.length} article${C.achats.length > 1 ? 's' : ''}</span></h3>
      ${C.achats.sort((a, b) => b.date.localeCompare(a.date)).map(a => `<div class="aj-item"><span class="pastille">${fmtDate(a.date).slice(0, 5)}</span> <b>${esc(a.libelle)}</b> <span class="aide">${a.quantite} ${esc(a.unite || '')}</span></div>`).join('') || '<div class="vide">Rien pour l\'instant.</div>'}</div>`;
  }
};

/* ================================================================ JOURNAL : « ce que j'ai mangé », analyse et conseils nutrition
   Repères de santé publique (PNNS) : 5 fruits et légumes par jour, féculents à chaque repas (complets de préférence),
   légumineuses 2 fois par semaine, poisson 2 fois par semaine, viande rouge et charcuterie limitées, produits laitiers 2 par jour,
   sucré, boissons sucrées, friture, sel et alcool à limiter, de l'eau à volonté. */
const ALIMENTS = {
  legumes: ['salade', 'tomate', 'concombre', 'carotte', 'courgette', 'christophine', 'giraumon', 'potiron', 'haricot vert', 'brocoli', 'epinard', 'chou', 'poivron', 'aubergine', 'legume', 'crudite', 'soupe', 'ratatouille', 'gombo', 'poireau', 'champignon', 'avocat', 'betterave', 'radis', 'navet', 'petit pois', 'blette', 'cresson', 'calalou', 'touffee', 'chadek'],
  fruits: ['fruit', 'banane', 'pomme', 'orange', 'mangue', 'ananas', 'papaye', 'goyave', 'fraise', 'raisin', 'kiwi', 'melon', 'pasteque', 'compote', 'maracudja', 'prune', 'poire', 'mandarine', 'clementine', 'pamplemousse', 'corossol', 'carambole', 'pomme cannelle', 'cerise', 'abricot', 'peche', 'quenette', 'sapotille'],
  feculents: ['pain', 'riz', 'pate', 'pates', 'spaghetti', 'macaroni', 'semoule', 'pomme de terre', 'frite', 'igname', 'dachine', 'madere', 'patate douce', 'fruit a pain', 'plantain', 'manioc', 'cereale', 'biscotte', 'couscous', 'quinoa', 'ble', 'mais', 'galette', 'bokit', 'dombre', 'ti nain', 'banane verte', 'muesli', 'avoine', 'porridge', 'baguette', 'sandwich', 'pizza', 'tartine', 'farine', 'cassave'],
  complets: ['complet', 'integral', 'avoine', 'muesli', 'son', 'seigle', 'cereales completes', 'riz brun'],
  legumineuses: ['lentille', 'haricot rouge', 'pois chiche', 'pois d angole', 'pois de bois', 'haricot blanc', 'haricot noir', 'feve', 'soja', 'tofu', 'flageolet', 'pois casse'],
  viande_rouge: ['boeuf', 'veau', 'agneau', 'mouton', 'cabri', 'steak', 'viande hachee', 'hamburger', 'burger', 'entrecote', 'roti de boeuf', 'kebab'],
  volaille: ['poulet', 'dinde', 'canard', 'pintade', 'nugget'],
  poisson: ['poisson', 'morue', 'saumon', 'thon', 'sardine', 'vivaneau', 'daurade', 'crevette', 'ouassou', 'lambi', 'chatrou', 'fruits de mer', 'hareng', 'maquereau', 'colin', 'cabillaud', 'marlin', 'thazard', 'accra', 'langouste', 'crabe', 'zourite'],
  oeufs: ['oeuf', 'omelette'],
  charcuterie: ['jambon', 'saucisse', 'saucisson', 'lardon', 'boudin', 'chorizo', 'salami', 'bacon', 'pate de campagne', 'rillette', 'merguez', 'knacki', 'cervelas', 'salaison', 'queue de cochon', 'pied de cochon'],
  laitiers: ['lait', 'yaourt', 'yogourt', 'fromage', 'fromage blanc', 'petit suisse', 'skyr', 'kefir', 'mozzarella', 'camembert', 'emmental', 'comte', 'gruyere', 'feta', 'chocolat chaud'],
  sucres: ['sucre', 'sucree', 'gateau', 'biscuit', 'chocolat', 'bonbon', 'confiture', 'nutella', 'pate a tartiner', 'viennoiserie', 'croissant', 'pain au chocolat', 'beignet', 'glace', 'sorbet', 'dessert', 'tarte', 'miel', 'patisserie', 'flan', 'tourment d amour', 'kassav', 'cake', 'crepe', 'gaufre', 'donut', 'cookie', 'muffin', 'brownie', 'blanc manger', 'sucre d orge', 'sirop', 'chaudeau'],
  boissons_sucrees: ['soda', 'coca', 'cola', 'jus de canne', 'limonade', 'boisson energisante', 'ice tea', 'fanta', 'sprite', 'orangina', 'jus de fruit', 'jus', 'nectar', 'sirop', 'red bull', 'milkshake', 'smoothie'],
  gras: ['frit', 'frite', 'friture', 'accra', 'beignet', 'bokit', 'chips', 'mayonnaise', 'nugget', 'pizza', 'fast food', 'kfc', 'mcdo', 'burger', 'cordon bleu', 'creme fraiche', 'beurre', 'pane', 'panure', 'quiche', 'gratin', 'friand', 'pate feuilletee', 'samoussa', 'pastel'],
  sale: ['chips', 'plat prepare', 'pizza', 'saucisson', 'morue', 'cube', 'maggi', 'sauce soja', 'fast food', 'kebab', 'soupe en sachet', 'nouilles instantanees', 'olive', 'cacahuete salee', 'biscuit apero', 'jambon', 'chorizo', 'hareng saur'],
  eau: ['eau', 'eau de coco', 'tisane', 'the vert', 'infusion'],
  alcool: ['rhum', 'ti punch', 'biere', 'vin', 'planteur', 'champagne', 'whisky', 'punch', 'alcool', 'cocktail', 'shrubb', 'apero'],
  cafe: ['cafe', 'the ', 'expresso']
};
const GROUPES = { legumes: '🥦 Légumes', fruits: '🍎 Fruits', feculents: '🍞 Féculents', legumineuses: '🫘 Légumineuses', viande_rouge: '🥩 Viande rouge', volaille: '🍗 Volaille', poisson: '🐟 Poisson',
  oeufs: '🥚 Œufs', charcuterie: '🥓 Charcuterie', laitiers: '🥛 Produits laitiers', sucres: '🍬 Sucré', boissons_sucrees: '🥤 Boissons sucrées', gras: '🍟 Gras / friture', sale: '🧂 Très salé', eau: '💧 Eau', alcool: '🍷 Alcool' };
const REPAS_J = { petit_dejeuner: '☕ Petit-déjeuner', dejeuner: '🍽️ Déjeuner', gouter: '🍌 Goûter', diner: '🌙 Dîner', collation: '🥨 En-cas / collation' };
/* découpe la description et range chaque aliment dans ses groupes ; renvoie les comptes et les aliments reconnus */
function analyserTexte(texte) {
  const t = ' ' + norm(texte).replace(/\bpates?\b/g, 'pates') + ' ';
  const g = {}, vus = [];
  const avec = (mot) => { const m = ' ' + norm(mot) + ' '; return t.includes(m) || t.includes(' ' + norm(mot) + 's ') || t.includes(' ' + norm(mot) + 'x '); };
  const exclusions = { pomme: ['pomme de terre', 'pomme cannelle'], banane: ['banane verte', 'banane plantain'], pain: ['pain au chocolat'], orange: ['jus d orange'], lait: ['lait de coco'], the: ['the vert'], sucre: ['sans sucre', 'peu sucre'], jus: ['jus de canne', 'jus de citron'] };
  for (const [grp, mots] of Object.entries(ALIMENTS)) {
    let n = 0;
    for (const mot of mots) {
      if (!avec(mot)) continue;
      if ((exclusions[mot] || []).some(x => t.includes(' ' + x)) && !t.replace(new RegExp((exclusions[mot] || []).join('|'), 'g'), '').includes(' ' + norm(mot))) continue;
      n++; if (!vus.includes(mot)) vus.push(mot);
    }
    if (n) g[grp] = Math.min(n, grp === 'legumes' || grp === 'fruits' ? 3 : 2);
  }
  if (/sans sucre|non sucre|peu sucre/.test(t)) { delete g.sucres; }
  if (/eau de coco/.test(t)) g.eau = 1;
  return { g, vus };
}
function bilanJour(entrees, membre, ctx = {}) {
  const tot = {}; const parRepas = {};
  entrees.forEach(e => { const { g } = analyserTexte(e.description); const k = e.quantite === 'grande' ? 1.3 : e.quantite === 'petite' ? 0.7 : 1;
    parRepas[e.repas] = true; for (const [x, n] of Object.entries(g)) tot[x] = (tot[x] || 0) + n * (['legumes', 'fruits'].includes(x) ? 1 : k); });
  const fl = Math.round((tot.legumes || 0) + Math.min(tot.fruits || 0, 3));
  const enfant = membre?.role === 'enfant';
  const conseils = [], bravos = [];
  if (!entrees.length) return { tot, fl, conseils: [['info', 'Ajoutez ce que vous avez mangé aujourd\'hui pour recevoir une analyse.']], bravos, parRepas };
  if (fl >= 5) bravos.push(`${fl} portions de fruits et légumes : objectif atteint.`); else conseils.push(['attention', `Fruits et légumes : ${fl} / 5. Ajoutez ${5 - fl} portion${5 - fl > 1 ? 's' : ''} (crudités, un fruit au goûter, des légumes au dîner).`]);
  if (!parRepas.petit_dejeuner && new Date().getHours() >= 11 && ctx.jourMeme) conseils.push(['info', 'Pas de petit-déjeuner noté : un fruit, un laitage et du pain complet aident à tenir jusqu\'au midi.']);
  if (!tot.feculents) conseils.push(['info', 'Pas de féculents notés : un peu de pain, riz, igname ou patate douce à chaque repas apporte l\'énergie.']);
  else if (tot.feculents && !entrees.some(e => analyserTexte(e.description).g.complets)) conseils.push(['info', 'Pensez aux féculents complets (pain complet, riz complet, flocons d\'avoine) : plus de fibres, meilleure satiété.']);
  const prot = (tot.viande_rouge || 0) + (tot.volaille || 0) + (tot.poisson || 0) + (tot.oeufs || 0) + (tot.legumineuses || 0) + (tot.charcuterie || 0);
  if (!prot) conseils.push(['info', 'Pas de source de protéines notée : œufs, poisson, volaille ou légumineuses à au moins un repas.']);
  if (prot >= 4) conseils.push(['info', 'Beaucoup de protéines animales aujourd\'hui : une seule portion de viande, poisson ou œufs par jour suffit généralement.']);
  const lait = Math.round(tot.laitiers || 0), cible = enfant ? 3 : 2;
  if (lait < cible) conseils.push(['info', `Produits laitiers : ${lait} / ${cible} (yaourt, fromage blanc, lait, un morceau de fromage).`]);
  if ((tot.sucres || 0) >= 2) conseils.push(['attention', `Produits sucrés : ${Math.round(tot.sucres)} fois aujourd'hui. Remplacez un dessert sucré par un fruit.`]);
  if ((tot.boissons_sucrees || 0) >= 1) conseils.push(['attention', 'Boisson sucrée ou jus : préférez l\'eau ; un jus compte au maximum pour une portion de fruit.']);
  if ((tot.gras || 0) >= 2) conseils.push(['attention', 'Plusieurs plats gras ou frits aujourd\'hui : demain, privilégiez cuissons vapeur, four ou court-bouillon.']);
  if ((tot.charcuterie || 0) >= 1 && (tot.sale || 0) >= 1) conseils.push(['attention', 'Charcuterie et aliments très salés : attention au sel (pas plus de 5 g par jour).']);
  if (tot.alcool) conseils.push([enfant ? 'urgent' : 'attention', enfant ? 'Pas d\'alcool pour les enfants.' : 'Alcool noté : pas plus de 2 verres par jour et pas tous les jours.']);
  if (!tot.eau) conseils.push(['info', 'Pensez à boire de l\'eau tout au long de la journée (1,5 L environ, plus quand il fait chaud).']); else bravos.push('Eau notée : bien hydraté.');
  if (tot.legumineuses) bravos.push('Légumineuses au menu : fibres et protéines végétales.');
  if (tot.poisson) bravos.push('Poisson au menu.');
  // pathologies de la personne
  (membre?.pathologies || []).forEach(k => {
    const P = PATHOS[k]; if (!P) return; const n = P.lib.replace(/^\S+ /, '');
    if (k === 'diabete' && ((tot.sucres || 0) + (tot.boissons_sucrees || 0)) >= 1) conseils.push(['urgent', `${n} : produits ou boissons sucrés notés, attention à la glycémie ; associez toujours féculents et légumes.`]);
    if (['hypertension', 'cardiaque', 'renal'].includes(k) && ((tot.charcuterie || 0) + (tot.sale || 0)) >= 1) conseils.push(['urgent', `${n} : aliments salés notés (charcuterie, morue, plats préparés…). Limitez le sel.`]);
    if (['cholesterol', 'cardiaque', 'surpoids'].includes(k) && (tot.gras || 0) >= 1) conseils.push(['attention', `${n} : plat gras ou frit noté ; préférez vapeur, four ou grillades.`]);
    if (k === 'goutte' && ((tot.viande_rouge || 0) + (tot.alcool || 0) >= 1 || /crevette|fruits de mer|sardine/.test(norm(entrees.map(e => e.description).join(' '))))) conseils.push(['attention', `${n} : viande rouge, fruits de mer ou alcool notés ; buvez beaucoup d'eau.`]);
    if (k === 'coeliaque' && tot.feculents && /pain|pates|farine|biscuit|gateau|semoule|couscous|ble|pizza|croissant/.test(norm(entrees.map(e => e.description).join(' '))) && !/sans gluten/.test(norm(entrees.map(e => e.description).join(' ')))) conseils.push(['urgent', `${n} : aliment contenant du gluten noté (pain, pâtes, farine…). Vérifiez qu'il était bien sans gluten.`]);
    if (k === 'grossesse' && (tot.alcool || tot.charcuterie)) conseils.push(['urgent', `${n} : ${tot.alcool ? 'aucun alcool pendant la grossesse' : 'charcuterie déconseillée (listériose)'}.`]);
    if (k === 'anemie' && !(tot.legumineuses || tot.viande_rouge || /epinard|boudin/.test(norm(entrees.map(e => e.description).join(' '))))) conseils.push(['info', `${n} : pas d'aliment riche en fer noté (lentilles, viande, épinards) ; ajoutez un agrume au repas.`]);
    if (k === 'drepanocytose' && !tot.eau) conseils.push(['attention', `${n} : buvez de l'eau régulièrement, c'est essentiel.`]);
    if (k === 'reflux' && ((tot.gras || 0) + (tot.alcool || 0) >= 1 || /cafe|piment|epice|orange|citron|tomate/.test(norm(entrees.map(e => e.description).join(' '))))) conseils.push(['attention', `${n} : gras, épices, café, agrumes ou alcool peuvent réveiller les brûlures ; dîner léger 2 à 3 h avant le coucher.`]);
    if (k === 'osteoporose' && lait < 3) conseils.push(['attention', `${n} : visez 3 produits laitiers par jour (calcium) et un peu de soleil pour la vitamine D.`]);
    if (k === 'intestin' && (tot.legumineuses || /chou|oignon|soda/.test(norm(entrees.map(e => e.description).join(' '))))) conseils.push(['info', `${n} : légumineuses, chou, oignon ou boissons gazeuses peuvent ballonner ; augmentez les fibres progressivement.`]);
    if (k === 'diabete' && tot.feculents && !entrees.some(e => analyserTexte(e.description).g.complets)) conseils.push(['info', `${n} : préférez les féculents complets et les légumineuses, qui font moins monter la glycémie.`]);
  });
  return { tot, fl, conseils, bravos, parRepas };
}
function bilanSemaine(entrees) {
  const jours = new Set(entrees.map(e => e.jour)).size || 1, tot = {};
  entrees.forEach(e => { const { g } = analyserTexte(e.description); for (const [x, n] of Object.entries(g)) tot[x] = (tot[x] || 0) + n; });
  const repasAvec = (grp) => entrees.filter(e => analyserTexte(e.description).g[grp]).length;
  const l = [];
  l.push([repasAvec('poisson') >= 2 ? 'ok' : 'manque', `🐟 Poisson : ${repasAvec('poisson')} repas (repère : 2 par semaine)`]);
  l.push([repasAvec('legumineuses') >= 2 ? 'ok' : 'manque', `🫘 Légumineuses : ${repasAvec('legumineuses')} repas (repère : 2 par semaine)`]);
  l.push([repasAvec('viande_rouge') <= 3 ? 'ok' : 'trop', `🥩 Viande rouge : ${repasAvec('viande_rouge')} repas (repère : 3 au plus, environ 500 g)`]);
  l.push([repasAvec('charcuterie') <= 2 ? 'ok' : 'trop', `🥓 Charcuterie : ${repasAvec('charcuterie')} repas (repère : 150 g par semaine au plus)`]);
  l.push([(tot.legumes || 0) / jours + Math.min((tot.fruits || 0) / jours, 3) >= 5 ? 'ok' : 'manque', `🥦🍎 Fruits et légumes : ${(((tot.legumes || 0) + (tot.fruits || 0)) / jours).toFixed(1).replace('.', ',')} par jour en moyenne (repère : 5)`]);
  l.push([(repasAvec('sucres') + repasAvec('boissons_sucrees')) / jours <= 1 ? 'ok' : 'trop', `🍬 Sucré et boissons sucrées : ${repasAvec('sucres') + repasAvec('boissons_sucrees')} fois en ${jours} jour${jours > 1 ? 's' : ''}`]);
  l.push([repasAvec('gras') / jours <= 1 ? 'ok' : 'trop', `🍟 Gras et friture : ${repasAvec('gras')} fois en ${jours} jour${jours > 1 ? 's' : ''}`]);
  return l;
}
const jr = { jour: null, membre: '' };
async function ongletJournal(c, C) {
  jr.jour ||= auj();
  const qui = (e) => (e.membre_id || '') === jr.membre;
  const lundiSem = lundi(jr.jour);
  const [jourL, semL, menus] = await Promise.all([db.from('repas_journal').select('*').eq('jour', jr.jour).order('created_at').then(doux),
    db.from('repas_journal').select('*').gte('jour', lundiSem).lte('jour', plusJours(lundiSem, 6)).then(doux), db.from('menus').select('*').eq('jour', jr.jour).then(doux)]);
  if (jourL === null) { c.innerHTML = '<div class="carte"><h3>🛠️ Mise à jour de la base nécessaire</h3><p>Le journal a besoin du script <b>10_journal_repas.sql</b>.</p></div>'; return; }
  const membre = C.F.membres.find(m => m.id === jr.membre) || C.F.membres.find(m => m.role === 'adulte') || null;
  const entrees = jourL.filter(qui), sem = (semL || []).filter(qui);
  const B = bilanJour(entrees, jr.membre ? membre : (C.F.membres.find(m => m.role === 'adulte') || null), { jourMeme: jr.jour === auj() });
  const icones = { urgent: '🚨', attention: '⚠️', info: '💡' };
  c.innerHTML = `<div class="carte" style="margin-bottom:14px"><div class="barre-outils">
      <button class="btn btn-fantome btn-petit" id="jr-prec">◀</button><b>${jr.jour === auj() ? 'Aujourd\'hui' : fmtDate(jr.jour)}</b><button class="btn btn-fantome btn-petit" id="jr-suiv">▶</button>
      <select id="jr-qui" style="width:auto"><option value="">Moi</option>${C.F.membres.map(m => `<option value="${m.id}" ${m.id === jr.membre ? 'selected' : ''}>${esc(m.prenom)}</option>`).join('')}</select>
      <span style="margin-left:auto"></span><button class="btn btn-fantome" id="jr-pdf">🖨 PDF</button><button class="btn btn-primaire" id="jr-ajout">＋ Ce que j'ai mangé</button></div></div>
    <div class="aj-grille"><div class="aj-col">
      ${Object.entries(REPAS_J).filter(([k]) => (membre?.role === 'enfant' && jr.membre) ? k !== 'collation' || entrees.some(e => e.repas === k) : k !== 'gouter' || entrees.some(e => e.repas === k)).map(([k, l]) => { const es = entrees.filter(e => e.repas === k); const prevu = (menus || []).find(m => m.repas === k);

        return `<div class="carte"><h3>${l}${!es.length && prevu ? ` <button class="btn btn-petit btn-fantome" data-prevu="${k}" style="margin-left:auto">✓ J'ai mangé le menu prévu</button>` : `<button class="btn btn-petit btn-fantome" data-ajout="${k}" style="margin-left:auto">＋</button>`}</h3>
          ${es.map(e => { const A2 = analyserTexte(e.description); return `<div class="aj-item cliquable" data-id="${e.id}"><b>${esc(e.description)}</b>${e.quantite !== 'normale' ? ` <span class="aide">(${e.quantite} portion)</span>` : ''}<div style="width:100%">${Object.keys(A2.g).filter(g => GROUPES[g]).map(g => `<span class="pastille ${['sucres', 'boissons_sucrees', 'gras', 'sale', 'alcool', 'charcuterie'].includes(g) ? 'orange' : ['legumes', 'fruits', 'legumineuses', 'eau', 'poisson'].includes(g) ? 'rec' : ''}">${GROUPES[g]}</span>`).join(' ')}</div></div>`; }).join('') || `<div class="aide">${prevu ? 'Prévu : ' + esc(prevu.libelle || '') : 'Rien de noté.'}</div>`}</div>`; }).join('')}
    </div><div class="aj-col">
      <div class="carte"><h3>📊 Analyse de la journée</h3>
        <div class="nutri-jauges">${[['legumes', '🥦🍎 Fruits & légumes', B.fl, 5], ['laitiers', '🥛 Laitiers', Math.round(B.tot.laitiers || 0), membre?.role === 'enfant' ? 3 : 2], ['eau', '💧 Eau', B.tot.eau ? 1 : 0, 1]].map(([k, l, v, o]) => `<div><span>${l}</span><div class="barre"><span style="width:${Math.min(100, v / o * 100)}%"></span></div><b>${v}/${o}</b></div>`).join('')}</div>
        ${B.bravos.map(b => `<div class="alerte-ligne niv-info"><div>✅ ${esc(b)}</div></div>`).join('')}
        ${B.conseils.map(([n, t]) => `<div class="alerte-ligne niv-${n === 'urgent' ? 'urgent' : n === 'attention' ? 'attention' : 'info'}"><div>${icones[n]} ${esc(t)}</div></div>`).join('')}
        <div class="aide"><i>${AVERT_SANTE}</i></div></div>
      <div class="carte"><h3>📅 Bilan de la semaine <span class="aide">${new Set(sem.map(e => e.jour)).size} jour(s) notés</span></h3>
        ${sem.length ? bilanSemaine(sem).map(([s, t]) => `<div class="aj-item">${s === 'ok' ? '✅' : s === 'trop' ? '⚠️' : '➕'} ${esc(t)}</div>`).join('') : '<div class="vide">Notez vos repas quelques jours pour obtenir le bilan.</div>'}</div>
    </div></div>`;
  $('#jr-prec').onclick = () => { jr.jour = plusJours(jr.jour, -1); router(); };
  $('#jr-suiv').onclick = () => { jr.jour = plusJours(jr.jour, 1); router(); };
  $('#jr-qui').onchange = (e) => { jr.membre = e.target.value; router(); };
  $('#jr-ajout').onclick = () => formJournal({ jour: jr.jour, membre_id: jr.membre || null, enfant: !!(jr.membre && membre?.role === 'enfant') });
  $('#jr-pdf').onclick = (e) => action(e.target, () => window.BFC_EXPORT.pdfTableau('Journal alimentaire', `${fmtDate(jr.jour)} · ${jr.membre ? membre?.prenom : 'Moi'}`, ['Repas', 'Ce qui a été mangé', ''],
    [...entrees.map(x => [REPAS_J[x.repas] || x.repas, x.description, x.quantite]), ...B.bravos.map(b => ['Bravo', b, '']), ...B.conseils.map(([, t]) => ['Conseil', t, '']), ...(sem.length ? bilanSemaine(sem).map(([, t]) => ['Semaine', t, '']) : [])], `Journal_${jr.jour}.pdf`));
  c.onclick = (e) => {
    const a = e.target.closest('[data-ajout]'); if (a) return formJournal({ jour: jr.jour, repas: a.dataset.ajout, membre_id: jr.membre || null, enfant: !!(jr.membre && membre?.role === 'enfant') });
    const p = e.target.closest('[data-prevu]'); if (p) { const m = (menus || []).find(x => x.repas === p.dataset.prevu); const r = C.recettes.find(x => x.id === m?.recette_id);
      return action(p, async () => { verifier(await db.from('repas_journal').insert({ jour: jr.jour, repas: p.dataset.prevu, membre_id: jr.membre || null, recette_id: r?.id || null,
        description: r ? `${r.nom} (${r.ingredients.filter(i => !i.b).map(i => i.n.toLowerCase()).join(', ')})` : (m?.libelle || 'Menu prévu') })); router(); }); }
    const r = e.target.closest('.aj-item[data-id]'); if (r) formJournal(jourL.find(x => x.id === r.dataset.id));
  };
}
function formJournal(e = {}) {
  const neuf = !e.id;
  const h = new Date().getHours(), defaut = h < 10 ? 'petit_dejeuner' : h < 15 ? 'dejeuner' : h < 18 ? 'gouter' : 'diner';
  const rapides = ['eau', 'café', 'pain complet', 'riz', 'poulet', 'poisson', 'salade', 'légumes', 'fruit', 'yaourt', 'fromage', 'jus', 'soda', 'gâteau', 'frites'];
  ouvrirModale(neuf ? 'Ce que j\'ai mangé' : 'Modifier le repas', `<form id="f-jr">
    <div class="ligne"><div class="champ"><label>Repas</label><select name="repas">${opts(Object.fromEntries(Object.entries(REPAS_J).filter(([k]) => e.enfant ? k !== 'collation' : k !== 'gouter' || e.repas === 'gouter')), e.repas || (defaut === 'gouter' && !e.enfant ? 'collation' : defaut))}</select></div>
      <div class="champ"><label>Date</label><input type="date" name="jour" value="${e.jour || auj()}"></div></div>
    <div class="champ"><label>Qu'avez-vous mangé et bu ? *</label><textarea name="description" rows="3" required placeholder="ex : 2 tartines de pain complet, beurre, café sucré, jus d'orange">${esc(e.description || '')}</textarea>
      <div class="cases" style="margin-top:6px">${rapides.map(x => `<button type="button" class="btn btn-petit btn-fantome" data-mot="${x}">＋ ${x}</button>`).join('')}</div></div>
    <div class="ligne"><div class="champ"><label>Quantité</label><select name="quantite">${opts({ petite: 'Petite portion', normale: 'Normale', grande: 'Grande portion' }, e.quantite || 'normale')}</select></div>
      <div class="champ"><label>Notes</label><input name="notes" value="${esc(e.notes || '')}" placeholder="faim, fatigue, digestion…"></div></div>
    <div id="jr-apercu" class="aide"></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="jr-suppr">Supprimer</button>'}<button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (md) => {
    const f = $('#f-jr', md);
    const apercu = () => { const { g } = analyserTexte(f.description.value); $('#jr-apercu', md).innerHTML = Object.keys(g).filter(k => GROUPES[k]).map(k => `<span class="pastille">${GROUPES[k]}</span>`).join(' ') || 'Les groupes d\'aliments reconnus s\'afficheront ici.'; };
    f.description.oninput = apercu; apercu();
    md.querySelector('.cases').onclick = (ev) => { const b = ev.target.closest('[data-mot]'); if (!b) return; f.description.value = (f.description.value.trim() ? f.description.value.trim() + ', ' : '') + b.dataset.mot; apercu(); };
    f.onsubmit = (ev) => { ev.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { repas: val(f, 'repas'), jour: val(f, 'jour'), description: val(f, 'description'), quantite: val(f, 'quantite'), notes: val(f, 'notes'), membre_id: e.membre_id ?? null };
      verifier(neuf ? await db.from('repas_journal').insert(rec) : await db.from('repas_journal').update(rec).eq('id', e.id), 'Journal');
      fermerModale(); toast('Repas noté.'); cu.onglet = 'journal'; if (/cuisine/.test(location.hash)) router(); else location.hash = '#/cuisine';
    }); };
    if (!neuf) $('#jr-suppr', md).onclick = (ev) => action(ev.target, async () => { verifier(await db.from('repas_journal').delete().eq('id', e.id)); fermerModale(); router(); });
  });
}
A.analyserTexte = analyserTexte; A.bilanJour = bilanJour; A.formJournal = formJournal; A.REPAS_J = REPAS_J;
A.manquantsMenuSemaine = async () => { const C = await chargerCuisine(); const d = lundi(); const m = doux(await db.from('menus').select('*').gte('jour', d).lte('jour', plusJours(d, 6)).neq('statut', 'fait')) || [];
  return manquants(C, m.map(x => ({ r: C.recettes.find(r => r.id === x.recette_id), portions: Number(x.portions) || C.portions })).filter(x => x.r)); };

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
  S.membres.forEach(m => (m.pathologies || []).forEach(k => { const P = PATHOS[k]; if (!P?.sport) return;
    out.push(['sante', `🩺 ${m.prenom} (${P.lib.replace(/^\S+ /, '')}) : ${P.sport}`]);
    const trop = S.seances.filter(s => s.membre_id === m.id && s.jour > plusJours(today, -14) && s.intensite > P.maxIntens);
    const actTrop = S.activites.filter(a => (a.membre_id === m.id) && a.intensite > P.maxIntens);
    if (trop.length || actTrop.length) out.push(['vigilance', `⚠️ ${m.prenom} : ${trop.length ? trop.length + ' séance(s) intense(s) récente(s)' : 'activité « ' + actTrop[0].nom + ' » réglée en intense'} — avec ${P.lib.replace(/^\S+ /, '').toLowerCase()}, mieux vaut rester en intensité ${P.maxIntens === 1 ? 'douce' : 'modérée'} sauf avis médical.`]);
    if (P.impacts) { const imp = S.activites.filter(a => a.membre_id === m.id && /course|running|foot|basket|hand|tennis|saut|crossfit/i.test(a.nom)); if (imp.length) out.push(['vigilance', `⚠️ ${m.prenom} : « ${imp[0].nom} » comporte des impacts ; natation, vélo ou marche ménagent davantage le dos et les articulations.`]); }
  }));
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
        <div class="carte"><h3>💡 Conseils</h3>${conseils.map(([t, m]) => `<div class="alerte-ligne ${t === 'repos' || t === 'vigilance' ? 'niv-attention' : t === 'licence' ? 'niv-urgent' : ''}"><div>${esc(m)}</div></div>`).join('') || '<div class="vide">Enregistrez vos séances pour recevoir des conseils.</div>'}
          ${conseils.some(([t]) => t === 'sante' || t === 'vigilance') ? `<div class="aide"><i>${AVERT_SANTE}</i></div>` : ''}</div></div>
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
A.verifierAccueil = verifierAccueil; A.chargerFoyer = chargerFoyer; A.PATHOS = PATHOS;
});
