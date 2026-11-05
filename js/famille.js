/* B-ForCompt@ — « Mes enfants » (planning des tâches ménagères) et « Mon agenda » (tâches classées par urgence, rappels) */
(window.BFC_MODULES = window.BFC_MODULES || []).push((A) => {
'use strict';
const { sb, db, C, $, esc, fmtDate, auj, toast, verifier, action, val, ouvrirModale, fermerModale, confirmer, router, VUES, opts } = A;
const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateDe = (s) => new Date(s + 'T12:00:00');
const jourSemaine = (s) => ((dateDe(s).getDay() + 6) % 7) + 1; // 1 = lundi
const age = (dn) => { if (!dn) return null; const d = dateDe(dn), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };
const TYPES_PERIODE = { vacances: '🏖️ Vacances', ferie: '🎉 Jour férié', absence: '🚫 Absence', autre: '📌 Autre' };
const PERIODES = { cours: 'Jours de cours', weekend: 'Week-ends', vacances: 'Vacances & fériés' };

/* Jours fériés (France + Guadeloupe : 27 mai abolition de l'esclavage, 21 juillet Victor Schœlcher) */
function paques(a) { const f = Math.floor, g = a % 19, c = f(a / 100), h = (c - f(c / 4) - f((8 * c + 13) / 25) + 19 * g + 15) % 30, i = h - f(h / 28) * (1 - f(29 / (h + 1)) * f((21 - g) / 11)), j = (a + f(a / 4) + i + 2 - c + f(c / 4)) % 7, l = i - j, m = 3 + f((l + 40) / 44), d = l + 28 - 31 * f(m / 4); return new Date(a, m - 1, d, 12); }
function feries(a) {
  const p = paques(a), plus = (n) => { const d = new Date(p); d.setDate(d.getDate() + n); return iso(d); };
  return { [`${a}-01-01`]: 'Jour de l\'an', [plus(1)]: 'Lundi de Pâques', [plus(-2)]: 'Vendredi saint', [`${a}-05-01`]: 'Fête du travail', [`${a}-05-08`]: 'Victoire 1945', [`${a}-05-27`]: 'Abolition de l\'esclavage',
    [plus(39)]: 'Ascension', [plus(50)]: 'Lundi de Pentecôte', [`${a}-07-14`]: 'Fête nationale', [`${a}-07-21`]: 'Fête Victor Schœlcher', [`${a}-08-15`]: 'Assomption',
    [`${a}-11-01`]: 'Toussaint', [`${a}-11-11`]: 'Armistice', [`${a}-12-25`]: 'Noël' };
}
/* Numéro au format international pour WhatsApp (Guadeloupe 0690/0590 → 590…, France 06/07 → 33…) */
function numeroWa(n) {
  let s = String(n || '').replace(/[^\d+]/g, ''); if (!s) return null;
  if (s.startsWith('+')) return s.slice(1);
  if (s.startsWith('00')) return s.slice(2);
  if (/^0(690|691|590)/.test(s)) return '590' + s.slice(1);
  if (/^0(694|594)/.test(s)) return '594' + s.slice(1);
  if (/^0(696|697|596)/.test(s)) return '596' + s.slice(1);
  if (/^0(692|693|262)/.test(s)) return '262' + s.slice(1);
  if (/^0[1-9]/.test(s)) return '33' + s.slice(1);
  return s;
}
const lienWa = (num, texte) => { const n = numeroWa(num); return n ? `https://wa.me/${n}?text=${encodeURIComponent(texte)}` : null; };
function ouvrirLien(url) { if (window.Capacitor?.Plugins?.Browser) window.Capacitor.Plugins.Browser.open({ url }); else window.open(url, '_blank', 'noopener'); }

/* ================================================================ MES ENFANTS */
const ef = { debut: null, onglet: 'planning' };
function lundi(d = new Date()) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); }

async function chargerFamille() {
  const [e, t, p] = await Promise.all([db.from('enfants').select('*').order('date_naissance'), db.from('taches_menageres').select('*').order('nom'), db.from('periodes_calendrier').select('*').order('date_debut', { ascending: false })]);
  return { enfants: verifier(e).filter(x => x.actif), taches: verifier(t), periodes: verifier(p) };
}
/* type de journée pour un enfant : absent, vacances (vacances + fériés), cours, weekend */
function typeJour(jour, enfant, periodes) {
  const dans = (p) => jour >= p.date_debut && jour <= p.date_fin && (!p.enfant_id || p.enfant_id === enfant.id);
  if (periodes.some(p => p.type === 'absence' && dans(p))) return 'absent';
  if (feries(+jour.slice(0, 4))[jour] || periodes.some(p => (p.type === 'vacances' || p.type === 'ferie') && dans(p))) return 'vacances';
  const js = jourSemaine(jour);
  if ((enfant.jours_cours || [1, 2, 4, 5]).includes(js)) return 'cours';
  return js >= 6 ? 'weekend' : 'vacances';   // mercredi sans cours = journée libre
}

/* Génère le planning : tâche « par enfant » pour chacun, sinon un seul enfant à tour de rôle (le moins chargé en points) */
async function genererPlanning(debut, nbJours, F) {
  const lignes = [], charge = Object.fromEntries(F.enfants.map(e => [e.id, 0]));
  for (let i = 0; i < nbJours; i++) {
    const d = dateDe(debut); d.setDate(d.getDate() + i); const jour = iso(d), js = jourSemaine(jour);
    for (const t of F.taches.filter(x => x.actif && (x.jours || []).includes(js))) {
      const eligibles = F.enfants.filter(e => { const ty = typeJour(jour, e, F.periodes); return ty !== 'absent' && (t.periodes || []).includes(ty) && (age(e.date_naissance) ?? 99) >= t.age_min; });
      if (!eligibles.length) continue;
      const cibles = t.par_enfant ? eligibles : [eligibles.sort((a, b) => charge[a.id] - charge[b.id] || a.prenom.localeCompare(b.prenom))[0]];
      cibles.forEach(e => { charge[e.id] += t.points; lignes.push({ jour, enfant_id: e.id, tache_id: t.id }); });
    }
  }
  const fin = dateDe(debut); fin.setDate(fin.getDate() + nbJours - 1);
  verifier(await db.from('planning_taches').delete().gte('jour', debut).lte('jour', iso(fin)).eq('statut', 'a_faire'));
  for (let i = 0; i < lignes.length; i += 500) verifier(await db.from('planning_taches').upsert(lignes.slice(i, i + 500), { onConflict: 'jour,enfant_id,tache_id', ignoreDuplicates: true }));
  return lignes.length;
}

VUES.enfants = async (el) => {
  const F = await chargerFamille();
  ef.debut ||= lundi();
  el.innerHTML = `<div class="tete-vue"><h1>👨‍👩‍👧 Mes enfants · entretien de la maison</h1><div class="actions">
      <button class="btn btn-fantome" id="ef-enfant">＋ Enfant</button><button class="btn btn-fantome" id="ef-tache">＋ Tâche</button>
      <button class="btn btn-primaire" id="ef-generer">⚙️ Générer le planning</button></div></div>
    <div class="bascule" id="ef-onglets" style="margin-bottom:14px">${[['planning', '📋 Planning'], ['enfants', '👧 Enfants'], ['taches', '🧹 Tâches'], ['calendrier', '📅 Vacances & absences']].map(([k, l]) => `<button data-o="${k}" class="${ef.onglet === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="ef-contenu"></div>`;
  $('#ef-onglets').onclick = (e) => { const b = e.target.closest('button'); if (b) { ef.onglet = b.dataset.o; router(); } };
  $('#ef-enfant').onclick = () => formEnfant({});
  $('#ef-tache').onclick = () => formTache({});
  $('#ef-generer').onclick = () => formGenerer(F);
  const c = $('#ef-contenu');
  if (!F.enfants.length && ef.onglet === 'planning') { c.innerHTML = `<div class="carte"><p>Commencez par ajouter vos enfants (prénom, date de naissance, jours de cours, numéros), puis les tâches ménagères ; le planning se génère ensuite en un clic.</p>
      <button class="btn btn-primaire" id="ef-premier">＋ Ajouter un enfant</button>${F.taches.length ? '' : ' <button class="btn btn-fantome" id="ef-modeles">Ajouter des tâches types</button>'}</div>`;
    $('#ef-premier').onclick = () => formEnfant({}); $('#ef-modeles')?.addEventListener('click', (e) => action(e.currentTarget, () => tachesTypes()));
    return; }
  if (ef.onglet === 'enfants') return ongletEnfants(c, F);
  if (ef.onglet === 'taches') return ongletTaches(c, F);
  if (ef.onglet === 'calendrier') return ongletCalendrier(c, F);
  return ongletPlanning(c, F);
};

async function ongletPlanning(c, F) {
  const fin = dateDe(ef.debut); fin.setDate(fin.getDate() + 6);
  const pl = verifier(await db.from('planning_taches').select('*').gte('jour', ef.debut).lte('jour', iso(fin)));
  const tache = (id) => F.taches.find(t => t.id === id);
  const jours = [...Array(7)].map((_, i) => { const d = dateDe(ef.debut); d.setDate(d.getDate() + i); return iso(d); });
  const aujourdhui = auj();
  c.innerHTML = `<div class="carte"><div class="filtres" style="align-items:center">
      <button class="btn btn-fantome btn-petit" id="ef-prec">◀</button><b>Semaine du ${fmtDate(ef.debut)} au ${fmtDate(iso(fin))}</b><button class="btn btn-fantome btn-petit" id="ef-suiv">▶</button>
      <button class="btn btn-fantome btn-petit" id="ef-cette">Cette semaine</button>
      <span style="margin-left:auto"></span><button class="btn btn-fantome btn-petit" id="ef-pdf">🖨 PDF</button></div>
    <div class="tableau-wrap"><table class="planning"><thead><tr><th>Enfant</th>${jours.map(j => { const f = feries(+j.slice(0, 4))[j];
      return `<th class="${j === aujourdhui ? 'auj' : ''}">${JOURS_COURTS[jourSemaine(j) - 1]} ${j.slice(8)}/${j.slice(5, 7)}${f ? `<div class="aide" style="text-transform:none">🎉 ${esc(f)}</div>` : ''}</th>`; }).join('')}</tr></thead><tbody>
    ${F.enfants.map(e => `<tr><td><b style="color:${esc(e.couleur)}">${esc(e.prenom)}</b><div class="aide">${age(e.date_naissance) ?? '?'} ans</div>
      <button class="btn btn-fantome btn-petit" data-wa="${e.id}" title="Envoyer les tâches du jour par WhatsApp">📲 Rappel</button></td>
      ${jours.map(j => { const ty = typeJour(j, e, F.periodes); const items = pl.filter(p => p.enfant_id === e.id && p.jour === j);
        return `<td class="jour-${ty}${j === aujourdhui ? ' auj' : ''}"><div class="aide" style="margin-bottom:3px">${{ cours: '🎒 cours', weekend: '🏠 week-end', vacances: '🏖️ libre', absent: '🚫 absent' }[ty]}</div>
          ${items.map(p => { const t = tache(p.tache_id); return t ? `<label class="puce-tache ${p.statut}"><input type="checkbox" data-p="${p.id}" ${p.statut === 'fait' ? 'checked' : ''}>${esc(t.icone || '')} ${esc(t.nom)}</label>` : ''; }).join('')}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="aide">Cochez les tâches faites (synchronisé sur tous les téléphones). « Générer le planning » répartit les tâches selon l'âge, les jours de cours, les week-ends, les vacances, les jours fériés et les absences.</p></div>`;
  $('#ef-prec').onclick = () => { const d = dateDe(ef.debut); d.setDate(d.getDate() - 7); ef.debut = iso(d); router(); };
  $('#ef-suiv').onclick = () => { const d = dateDe(ef.debut); d.setDate(d.getDate() + 7); ef.debut = iso(d); router(); };
  $('#ef-cette').onclick = () => { ef.debut = lundi(); router(); };
  c.onchange = (e) => { const cb = e.target.closest('[data-p]'); if (cb) action(null, async () => { verifier(await db.from('planning_taches').update({ statut: cb.checked ? 'fait' : 'a_faire' }).eq('id', cb.dataset.p)); cb.parentElement.className = 'puce-tache ' + (cb.checked ? 'fait' : 'a_faire'); }); };
  c.onclick = (e) => {
    const b = e.target.closest('[data-wa]'); if (!b) return;
    const enf = F.enfants.find(x => x.id === b.dataset.wa); const jour = jours.includes(aujourdhui) ? aujourdhui : jours[0];
    const items = pl.filter(p => p.enfant_id === enf.id && p.jour === jour).map(p => tache(p.tache_id)).filter(Boolean);
    const texte = `Bonjour ${enf.prenom} ! 🧹 Tes tâches pour ${JOURS[jourSemaine(jour) - 1]} ${fmtDate(jour)} :\n${items.map(t => `• ${t.icone || ''} ${t.nom} (${t.duree_min} min)`).join('\n') || '• Rien aujourd\'hui, profite ! 😊'}\nBon courage 💪`;
    const url = lienWa(enf.telephone || enf.telephone_parent, texte);
    if (!url) return toast('Ajoutez le numéro de l\'enfant ou d\'un parent dans sa fiche.', true);
    ouvrirLien(url);
    db.from('planning_taches').update({ rappel_envoye_le: new Date().toISOString() }).eq('enfant_id', enf.id).eq('jour', jour).then(() => {});
  };
  $('#ef-pdf').onclick = (e) => action(e.currentTarget, () => window.BFC_EXPORT.pdfPlanning({ debut: ef.debut, jours, enfants: F.enfants, planning: pl, taches: F.taches, typeJour: (j, en) => typeJour(j, en, F.periodes) }));
}

function ongletEnfants(c, F) {
  c.innerHTML = `<div class="grille g3">${F.enfants.map(e => `<div class="carte" style="border-top:5px solid ${esc(e.couleur)};cursor:pointer" data-id="${e.id}">
    <h3 style="margin:0">${esc(e.prenom)}</h3><div class="aide">${age(e.date_naissance) ?? '?'} ans · né(e) le ${fmtDate(e.date_naissance)}</div>
    <div class="aide">🎒 Cours : ${(e.jours_cours || []).map(j => JOURS_COURTS[j - 1]).join(', ') || 'aucun'}</div>
    <div class="aide">📱 ${esc(e.telephone || '—')} · 👪 ${esc(e.telephone_parent || '—')}</div></div>`).join('') || '<div class="carte">Aucun enfant.</div>'}</div>`;
  c.onclick = (e) => { const k = e.target.closest('[data-id]'); if (k) formEnfant(F.enfants.find(x => x.id === k.dataset.id)); };
}
function formEnfant(e) {
  const neuf = !e.id;
  ouvrirModale(neuf ? 'Ajouter un enfant' : e.prenom, `<form id="f-en">
    <div class="ligne"><div class="champ"><label>Prénom *</label><input name="prenom" required value="${esc(e.prenom || '')}"></div>
      <div class="champ"><label>Date de naissance</label><input type="date" name="date_naissance" value="${e.date_naissance || ''}"></div></div>
    <div class="champ"><label>Jours de cours</label><div style="display:flex;gap:10px;flex-wrap:wrap">${JOURS.map((j, i) => `<label style="display:flex;gap:4px;font-weight:600"><input type="checkbox" name="jc" value="${i + 1}" ${(e.jours_cours || [1, 2, 4, 5]).includes(i + 1) ? 'checked' : ''}>${j}</label>`).join('')}</div></div>
    <div class="ligne"><div class="champ"><label>WhatsApp de l'enfant</label><input name="telephone" inputmode="tel" value="${esc(e.telephone || '')}" placeholder="0690 12 34 56"></div>
      <div class="champ"><label>WhatsApp du parent (si pas de numéro enfant)</label><input name="telephone_parent" inputmode="tel" value="${esc(e.telephone_parent || '')}" placeholder="0690 70 55 84"></div></div>
    <div class="ligne"><div class="champ"><label>Heure du rappel quotidien</label><input type="time" name="rappel_heure" value="${(e.rappel_heure || '07:00').slice(0, 5)}"></div>
      <div class="champ"><label>Couleur</label><input type="color" name="couleur" value="${e.couleur || '#2467b6'}"></div></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="en-suppr">Supprimer</button>'}<button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    const f = $('#f-en', m);
    f.onsubmit = (ev) => { ev.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { prenom: val(f, 'prenom'), date_naissance: val(f, 'date_naissance'), telephone: val(f, 'telephone'), telephone_parent: val(f, 'telephone_parent'),
        rappel_heure: val(f, 'rappel_heure'), couleur: val(f, 'couleur'), jours_cours: [...f.querySelectorAll('[name=jc]:checked')].map(x => +x.value) };
      verifier(neuf ? await db.from('enfants').insert(rec) : await db.from('enfants').update(rec).eq('id', e.id)); fermerModale(); toast('Enfant enregistré.'); router();
    }); };
    if (!neuf) $('#en-suppr', m).onclick = (ev) => action(ev.target, async () => { if (!await confirmer(`Supprimer ${e.prenom} et son planning ?`)) return; verifier(await db.from('enfants').delete().eq('id', e.id)); fermerModale(); router(); });
  });
}

function ongletTaches(c, F) {
  c.innerHTML = `<div class="carte"><div class="tableau-wrap"><table><thead><tr><th>Tâche</th><th>Durée</th><th>Âge min.</th><th>Jours</th><th>Quand</th><th>Qui</th></tr></thead><tbody>
    ${F.taches.map(t => `<tr data-id="${t.id}" style="cursor:pointer;${t.actif ? '' : 'opacity:.5'}"><td>${esc(t.icone || '')} <b>${esc(t.nom)}</b></td><td>${t.duree_min} min</td><td>${t.age_min} ans</td>
      <td>${(t.jours || []).length === 7 ? 'tous les jours' : (t.jours || []).map(j => JOURS_COURTS[j - 1]).join(', ')}</td><td>${(t.periodes || []).map(p => ({ cours: '🎒', weekend: '🏠', vacances: '🏖️' }[p])).join(' ')}</td>
      <td>${t.par_enfant ? 'chaque enfant' : 'à tour de rôle'}</td></tr>`).join('') || '<tr><td colspan="6" class="vide">Aucune tâche.</td></tr>'}</tbody></table></div>
    ${F.taches.length ? '' : '<button class="btn btn-fantome" id="ef-modeles2">Ajouter des tâches types</button>'}</div>`;
  c.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) formTache(F.taches.find(t => t.id === tr.dataset.id)); };
  $('#ef-modeles2')?.addEventListener('click', (e) => action(e.currentTarget, () => tachesTypes()));
}
async function tachesTypes() {
  const T = [['Faire son lit', '🛏️', 5, 4, true, [1, 2, 3, 4, 5, 6, 7]], ['Ranger sa chambre', '🧸', 15, 4, true, [3, 6]], ['Mettre la table', '🍽️', 5, 5, false, [1, 2, 3, 4, 5, 6, 7]],
    ['Débarrasser la table', '🧽', 5, 5, false, [1, 2, 3, 4, 5, 6, 7]], ['Vider le lave-vaisselle', '🫧', 10, 8, false, [1, 2, 3, 4, 5, 6, 7]], ['Sortir les poubelles', '🗑️', 5, 9, false, [2, 5]],
    ['Passer le balai', '🧹', 15, 9, false, [3, 6]], ['Plier le linge', '👕', 15, 7, false, [6]], ['Nourrir les animaux', '🐾', 5, 6, false, [1, 2, 3, 4, 5, 6, 7]], ['Arroser les plantes', '🪴', 5, 5, false, [3, 6]]];
  verifier(await db.from('taches_menageres').insert(T.map(([nom, icone, duree_min, age_min, par_enfant, jours]) => ({ nom, icone, duree_min, age_min, par_enfant, jours, points: Math.max(1, Math.round(duree_min / 5)) }))));
  toast('10 tâches types ajoutées : modifiez-les à votre goût.'); ef.onglet = 'taches'; router();
}
function formTache(t) {
  const neuf = !t.id;
  ouvrirModale(neuf ? 'Nouvelle tâche' : t.nom, `<form id="f-ta">
    <div class="ligne3"><div class="champ"><label>Tâche *</label><input name="nom" required value="${esc(t.nom || '')}"></div>
      <div class="champ"><label>Icône</label><input name="icone" value="${esc(t.icone || '🧹')}" maxlength="4"></div>
      <div class="champ"><label>Durée (min)</label><input name="duree_min" type="number" min="1" value="${t.duree_min || 10}"></div></div>
    <div class="ligne3"><div class="champ"><label>Âge minimum</label><input name="age_min" type="number" min="2" value="${t.age_min ?? 5}"></div>
      <div class="champ"><label>Points (charge)</label><input name="points" type="number" min="1" value="${t.points || 1}"></div>
      <div class="champ"><label>Qui</label><select name="par_enfant"><option value="0">Un enfant, à tour de rôle</option><option value="1" ${t.par_enfant ? 'selected' : ''}>Chaque enfant</option></select></div></div>
    <div class="champ"><label>Jours</label><div style="display:flex;gap:10px;flex-wrap:wrap">${JOURS.map((j, i) => `<label style="display:flex;gap:4px;font-weight:600"><input type="checkbox" name="j" value="${i + 1}" ${(t.jours || [1, 2, 3, 4, 5, 6, 7]).includes(i + 1) ? 'checked' : ''}>${j}</label>`).join('')}</div></div>
    <div class="champ"><label>Périodes</label><div style="display:flex;gap:14px;flex-wrap:wrap">${Object.entries(PERIODES).map(([k, l]) => `<label style="display:flex;gap:4px;font-weight:600"><input type="checkbox" name="p" value="${k}" ${(t.periodes || ['cours', 'weekend', 'vacances']).includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
    <div class="champ"><label style="display:flex;gap:8px"><input type="checkbox" name="actif" ${t.actif === false ? '' : 'checked'}> Active</label></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="ta-suppr">Supprimer</button>'}<button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    const f = $('#f-ta', m);
    f.onsubmit = (ev) => { ev.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { nom: val(f, 'nom'), icone: val(f, 'icone'), duree_min: +val(f, 'duree_min') || 10, age_min: +val(f, 'age_min') || 3, points: +val(f, 'points') || 1, par_enfant: f.par_enfant.value === '1',
        jours: [...f.querySelectorAll('[name=j]:checked')].map(x => +x.value), periodes: [...f.querySelectorAll('[name=p]:checked')].map(x => x.value), actif: f.actif.checked };
      verifier(neuf ? await db.from('taches_menageres').insert(rec) : await db.from('taches_menageres').update(rec).eq('id', t.id)); fermerModale(); toast('Tâche enregistrée.'); router();
    }); };
    if (!neuf) $('#ta-suppr', m).onclick = (ev) => action(ev.target, async () => { if (!await confirmer('Supprimer cette tâche ?')) return; verifier(await db.from('taches_menageres').delete().eq('id', t.id)); fermerModale(); router(); });
  });
}

function ongletCalendrier(c, F) {
  const a = new Date().getFullYear(), fer = { ...feries(a), ...feries(a + 1) };
  c.innerHTML = `<div class="grille g2"><div class="carte"><h3>Vacances, absences et autres</h3>
    <button class="btn btn-primaire btn-petit" id="ca-ajout">＋ Ajouter une période</button>
    <div class="tableau-wrap" style="margin-top:10px"><table><tbody>${F.periodes.map(p => `<tr data-id="${p.id}" style="cursor:pointer"><td>${TYPES_PERIODE[p.type]}</td><td><b>${esc(p.libelle || '')}</b><div class="aide">${p.enfant_id ? esc(F.enfants.find(e => e.id === p.enfant_id)?.prenom || '') : 'Toute la famille'}</div></td>
      <td>${fmtDate(p.date_debut)}${p.date_fin !== p.date_debut ? ' → ' + fmtDate(p.date_fin) : ''}</td></tr>`).join('') || '<tr><td class="vide">Ajoutez les vacances scolaires (calendrier de l\'académie de Guadeloupe) et les absences.</td></tr>'}</tbody></table></div></div>
    <div class="carte"><h3>Jours fériés pris en compte</h3><div class="tableau-wrap"><table><tbody>${Object.entries(fer).filter(([d]) => d >= auj()).sort().slice(0, 14).map(([d, l]) => `<tr><td>${fmtDate(d)}</td><td>${esc(l)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
  const form = (p = {}) => ouvrirModale(p.id ? 'Période' : 'Ajouter une période', `<form id="f-pe">
    <div class="ligne"><div class="champ"><label>Type</label><select name="type">${opts(TYPES_PERIODE, p.type || 'vacances')}</select></div>
      <div class="champ"><label>Concerne</label><select name="enfant_id"><option value="">Toute la famille</option>${F.enfants.map(e => `<option value="${e.id}" ${e.id === p.enfant_id ? 'selected' : ''}>${esc(e.prenom)}</option>`).join('')}</select></div></div>
    <div class="ligne3"><div class="champ"><label>Du</label><input type="date" name="date_debut" required value="${p.date_debut || auj()}"></div><div class="champ"><label>Au</label><input type="date" name="date_fin" required value="${p.date_fin || auj()}"></div>
      <div class="champ"><label>Libellé</label><input name="libelle" value="${esc(p.libelle || '')}" placeholder="Vacances de Noël, stage, malade…"></div></div>
    <div class="modale-pied">${p.id ? '<button type="button" class="btn btn-danger gauche" id="pe-suppr">Supprimer</button>' : ''}<button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    const f = $('#f-pe', m);
    f.onsubmit = (ev) => { ev.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const rec = { type: val(f, 'type'), enfant_id: val(f, 'enfant_id'), date_debut: val(f, 'date_debut'), date_fin: val(f, 'date_fin'), libelle: val(f, 'libelle') };
      if (rec.date_fin < rec.date_debut) throw new Error('La date de fin est avant la date de début.');
      verifier(p.id ? await db.from('periodes_calendrier').update(rec).eq('id', p.id) : await db.from('periodes_calendrier').insert(rec)); fermerModale(); toast('Période enregistrée. Pensez à régénérer le planning.'); router();
    }); };
    if (p.id) $('#pe-suppr', m).onclick = (ev) => action(ev.target, async () => { verifier(await db.from('periodes_calendrier').delete().eq('id', p.id)); fermerModale(); router(); });
  });
  $('#ca-ajout').onclick = () => form();
  c.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) form(F.periodes.find(p => p.id === tr.dataset.id)); };
}

function formGenerer(F) {
  if (!F.enfants.length || !F.taches.length) return toast('Ajoutez au moins un enfant et une tâche.', true);
  ouvrirModale('Générer le planning', `<form id="f-ge"><div class="ligne"><div class="champ"><label>À partir du</label><input type="date" name="debut" value="${ef.debut || lundi()}"></div>
    <div class="champ"><label>Durée</label><select name="nb"><option value="7">1 semaine</option><option value="14">2 semaines</option><option value="28">4 semaines</option></select></div></div>
    <p class="aide">Les tâches déjà cochées « faites » sont conservées ; les autres sont redistribuées équitablement selon l'âge, la charge (points), les jours de cours, les week-ends, les vacances, les jours fériés et les absences.</p>
    <div class="modale-pied"><button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Générer</button></div></form>`, (m) => {
    const f = $('#f-ge', m);
    f.onsubmit = (ev) => { ev.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const n = await genererPlanning(val(f, 'debut'), +val(f, 'nb'), F); ef.debut = lundi(dateDe(val(f, 'debut'))); ef.onglet = 'planning';
      fermerModale(); toast(`${n} tâche(s) planifiée(s).`); router();
    }); };
  });
}

/* ================================================================ MON AGENDA (bloc tâches classées par urgence) */
const ma = { vue: 'priorites', mois: new Date().getMonth(), annee: new Date().getFullYear(), voirFaites: false };
const QUADRANTS = [['🔥 Urgent et important', t => t.urgence >= 3 && t.importance >= 2], ['⭐ Important, à planifier', t => t.urgence < 3 && t.importance >= 2], ['⚡ Urgent, peu important', t => t.urgence >= 3 && t.importance < 2], ['🕊️ Plus tard', t => t.urgence < 3 && t.importance < 2]];
VUES.monagenda = async (el) => {
  let q = db.from('v_agenda_priorites').select('*').order('score', { ascending: false }).order('echeance', { ascending: true, nullsFirst: false }).limit(500);
  if (!ma.voirFaites) q = q.in('statut', ['a_faire', 'en_cours']);
  const taches = verifier(await q, 'Agenda');
  const rappelsDus = taches.filter(t => t.rappel_le && new Date(t.rappel_le) <= new Date() && !t.rappel_envoye_le && t.statut !== 'fait');
  el.innerHTML = `<div class="tete-vue"><h1>🗓️ Mon agenda</h1><div class="actions">
      <div class="bascule" id="ma-vue"><button data-v="priorites" class="${ma.vue === 'priorites' ? 'on' : ''}">Par urgence</button><button data-v="calendrier" class="${ma.vue === 'calendrier' ? 'on' : ''}">Calendrier</button></div>
      <button class="btn btn-fantome" id="ma-pdf">🖨 PDF</button><button class="btn btn-primaire" id="ma-ajout">＋ À faire</button></div></div>
    ${rappelsDus.length ? `<div class="alerte" style="margin-bottom:14px">🔔 <b>${rappelsDus.length} rappel(s)</b> à envoyer : ${rappelsDus.map(t => `<a href="#" data-rappel="${t.id}">${esc(t.titre)}</a>`).join(', ')}</div>` : ''}
    <div id="ma-contenu"></div>`;
  $('#ma-vue').onclick = (e) => { const b = e.target.closest('button'); if (b) { ma.vue = b.dataset.v; router(); } };
  $('#ma-ajout').onclick = () => formAFaire({});
  $('#ma-pdf').onclick = (e) => action(e.currentTarget, () => window.BFC_EXPORT.pdfTableau('Mon agenda · à faire', `Classé par urgence · ${new Date().toLocaleDateString('fr-FR')}`,
    ['Priorité', 'À faire', 'Échéance', 'Catégorie', 'Statut'],
    taches.map(t => [QUADRANTS.find(([, fn]) => fn(t))?.[0].replace(/^\S+\s/, '') || '', t.titre + (t.details ? '\n' + t.details : ''), t.echeance ? new Date(t.echeance).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-',
      t.categorie || '', { a_faire: 'À faire', en_cours: 'En cours', fait: 'Fait', annule: 'Annulé' }[t.statut]]), `Agenda_${auj()}.pdf`));
  el.querySelectorAll('[data-rappel]').forEach(a => a.onclick = (e) => { e.preventDefault(); envoyerRappel(taches.find(t => t.id === a.dataset.rappel)); });
  const c = $('#ma-contenu');
  const carteTache = (t) => `<div class="tache-carte imp${t.importance}" data-id="${t.id}"><label class="tache-coche"><input type="checkbox" data-fait="${t.id}" ${t.statut === 'fait' ? 'checked' : ''}></label>
    <div style="flex:1;min-width:0"><b>${esc(t.titre)}</b><div class="aide">${t.echeance ? `${t.urgence === 4 ? '<b class="negatif">En retard · </b>' : ''}${new Date(t.echeance).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Sans échéance'} · ${esc(t.categorie || '')}${t.rappel_le ? ' · 🔔' : ''}${t.partage_foyer ? ' · 👪' : ''}</div></div>
    <button class="btn btn-fantome btn-petit" data-wa-t="${t.id}" title="Rappel WhatsApp / e-mail">📲</button></div>`;
  if (ma.vue === 'calendrier') {
    const debut = new Date(ma.annee, ma.mois, 1), fin = new Date(ma.annee, ma.mois + 1, 0), decal = (debut.getDay() + 6) % 7;
    const cases = [...Array(decal)].map(() => '<div class="ag-case vide-case"></div>');
    for (let d = 1; d <= fin.getDate(); d++) { const j = iso(new Date(ma.annee, ma.mois, d)); const l = taches.filter(t => t.echeance && iso(new Date(t.echeance)) === j);
      cases.push(`<div class="ag-case${l.length ? ' plein' : ''}${j === auj() ? ' auj' : ''}"><div class="ag-num">${d}</div>${l.map(t => `<div class="ag-ligne imp${t.importance}" data-id="${t.id}" style="cursor:pointer"><span class="ag-compte">${esc(t.titre)}</span></div>`).join('')}</div>`); }
    c.innerHTML = `<div class="carte"><div class="filtres" style="align-items:center"><button class="btn btn-fantome btn-petit" id="ma-prec">◀</button><b style="text-transform:capitalize">${debut.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</b><button class="btn btn-fantome btn-petit" id="ma-suiv">▶</button></div>
      <div class="ag-grille">${JOURS_COURTS.map(j => `<div class="ag-entete">${j}</div>`).join('')}${cases.join('')}</div></div>`;
    const aller = (k) => { const d = new Date(ma.annee, ma.mois + k, 1); ma.annee = d.getFullYear(); ma.mois = d.getMonth(); router(); };
    $('#ma-prec').onclick = () => aller(-1); $('#ma-suiv').onclick = () => aller(1);
  } else {
    c.innerHTML = `<div class="grille g2">${QUADRANTS.map(([titre, f]) => { const l = taches.filter(t => t.statut !== 'fait' && f(t));
      return `<div class="carte"><h3>${titre} <span class="pastille">${l.length}</span></h3>${l.map(carteTache).join('') || '<p class="aide">Rien ici.</p>'}</div>`; }).join('')}</div>
      <p style="margin-top:12px"><label class="aide" style="display:inline-flex;gap:6px;font-weight:600"><input type="checkbox" id="ma-faites" ${ma.voirFaites ? 'checked' : ''}> Afficher aussi les tâches faites</label></p>
      ${ma.voirFaites ? `<div class="carte"><h3>✅ Faites</h3>${taches.filter(t => t.statut === 'fait').map(carteTache).join('') || '<p class="aide">Aucune.</p>'}</div>` : ''}`;
    $('#ma-faites').onchange = (e) => { ma.voirFaites = e.target.checked; router(); };
  }
  c.onclick = (e) => {
    const w = e.target.closest('[data-wa-t]'); if (w) return envoyerRappel(taches.find(t => t.id === w.dataset.waT));
    if (e.target.closest('[data-fait]')) return;
    const k = e.target.closest('[data-id]'); if (k) formAFaire(taches.find(t => t.id === k.dataset.id));
  };
  c.onchange = (e) => { const cb = e.target.closest('[data-fait]'); if (cb) action(null, async () => { verifier(await db.from('agenda_taches').update({ statut: cb.checked ? 'fait' : 'a_faire', fait_le: cb.checked ? new Date().toISOString() : null }).eq('id', cb.dataset.fait)); router(); }); };
};

function envoyerRappel(t) {
  if (!t) return;
  const quand = t.echeance ? new Date(t.echeance).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  const texte = `🔔 Rappel B-ForCompt@ : ${t.titre}${quand ? '\n📅 ' + quand : ''}${t.details ? '\n' + t.details : ''}`;
  ouvrirModale('Envoyer le rappel', `<p><b>${esc(t.titre)}</b></p><div class="ligne"><div class="champ"><label>WhatsApp</label><input id="rp-tel" inputmode="tel" value="${esc(t.telephone || '')}" placeholder="0690…"></div>
    <div class="champ"><label>E-mail</label><input id="rp-mail" type="email" value="${esc(t.email || '')}"></div></div>
    <p class="aide">Le message s'ouvre prêt à envoyer dans WhatsApp ou dans votre messagerie. Les rappels envoyés automatiquement à l'heure prévue viendront avec le branchement de Brevo (e-mail) et de WhatsApp Business.</p>
    <div class="modale-pied"><button class="btn btn-fantome" data-fermer>Fermer</button><button class="btn btn-bleu" id="rp-mail-b">✉️ E-mail</button><button class="btn btn-primaire" id="rp-wa">📲 WhatsApp</button></div>`, (m) => {
    const marquer = () => db.from('agenda_taches').update({ rappel_envoye_le: new Date().toISOString(), telephone: $('#rp-tel', m).value || null, email: $('#rp-mail', m).value || null }).eq('id', t.id).then(() => {});
    $('#rp-wa', m).onclick = () => { const url = lienWa($('#rp-tel', m).value, texte); if (!url) return toast('Indiquez un numéro WhatsApp.', true); ouvrirLien(url); marquer(); };
    $('#rp-mail-b', m).onclick = () => { const mail = $('#rp-mail', m).value; if (!mail) return toast('Indiquez une adresse e-mail.', true);
      ouvrirLien(`mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent('Rappel : ' + t.titre)}&body=${encodeURIComponent(texte)}`); marquer(); };
  });
}

function formAFaire(t) {
  const neuf = !t.id; const loc = (v) => v ? new Date(new Date(v) - new Date(v).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  ouvrirModale(neuf ? 'Nouvelle chose à faire' : t.titre, `<form id="f-af">
    <div class="champ"><label>Quoi *</label><input name="titre" required value="${esc(t.titre || '')}" placeholder="Payer la cantine, rendez-vous dentiste…"></div>
    <div class="ligne3"><div class="champ"><label>Échéance</label><input type="datetime-local" name="echeance" value="${loc(t.echeance)}"></div>
      <div class="champ"><label>Importance</label><select name="importance">${opts({ 3: '🔴 Haute', 2: '🟠 Normale', 1: '🟢 Faible' }, String(t.importance || 2))}</select></div>
      <div class="champ"><label>Catégorie</label><input name="categorie" list="af-cat" value="${esc(t.categorie || 'Perso')}"><datalist id="af-cat"><option>Perso</option><option>Pro</option><option>Maison</option><option>Enfants</option><option>Santé</option><option>Administratif</option><option>Finances</option></datalist></div></div>
    <div class="champ"><label>Détails</label><textarea name="details" rows="2">${esc(t.details || '')}</textarea></div>
    <div class="ligne3"><div class="champ"><label>Rappel le</label><input type="datetime-local" name="rappel_le" value="${loc(t.rappel_le)}"></div>
      <div class="champ"><label>WhatsApp du rappel</label><input name="telephone" inputmode="tel" value="${esc(t.telephone || '')}"></div>
      <div class="champ"><label>E-mail du rappel</label><input name="email" type="email" value="${esc(t.email || '')}"></div></div>
    <div class="champ"><label style="display:flex;gap:8px"><input type="checkbox" name="partage_foyer" ${t.partage_foyer ? 'checked' : ''}> Partager avec mon foyer (co-titulaire du compte joint)</label></div>
    <div class="modale-pied">${neuf ? '' : '<button type="button" class="btn btn-danger gauche" id="af-suppr">Supprimer</button>'}<button type="button" class="btn btn-fantome" data-fermer>Annuler</button><button class="btn btn-primaire">Enregistrer</button></div></form>`, (m) => {
    const f = $('#f-af', m);
    f.onsubmit = (ev) => { ev.preventDefault(); action(f.querySelector('.btn-primaire'), async () => {
      const dt = (n) => val(f, n) ? new Date(val(f, n)).toISOString() : null;
      const rec = { titre: val(f, 'titre'), echeance: dt('echeance'), importance: +val(f, 'importance'), categorie: val(f, 'categorie'), details: val(f, 'details'), rappel_le: dt('rappel_le'),
        telephone: val(f, 'telephone'), email: val(f, 'email'), partage_foyer: f.partage_foyer.checked };
      if (!neuf && rec.rappel_le !== t.rappel_le) rec.rappel_envoye_le = null;
      verifier(neuf ? await db.from('agenda_taches').insert(rec) : await db.from('agenda_taches').update(rec).eq('id', t.id)); fermerModale(); toast('Enregistré.'); router();
    }); };
    if (!neuf) $('#af-suppr', m).onclick = (ev) => action(ev.target, async () => { verifier(await db.from('agenda_taches').delete().eq('id', t.id)); fermerModale(); router(); });
  });
}

/* rafraîchissement en direct */
sb.auth.onAuthStateChange((evt) => {
  if ((evt !== 'SIGNED_IN' && evt !== 'INITIAL_SESSION') || window.__bfcSyncFamille) return;
  let att; const raf = () => { clearTimeout(att); att = setTimeout(() => { const r = location.hash.replace('#/', ''); if ($('#modale').hidden && (r.startsWith('enfants') || r.startsWith('monagenda'))) router(); }, 800); };
  window.__bfcSyncFamille = sb.channel('bfc-famille');
  ['enfants', 'planning_taches', 'agenda_taches'].forEach(t => window.__bfcSyncFamille.on('postgres_changes', { event: '*', schema: C.structure, table: t }, raf));
  window.__bfcSyncFamille.subscribe();
});
});
