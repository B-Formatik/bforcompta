/* B-S@fe — Météo locale (géolocalisation + prévisions Open-Meteo) avec conseils : parapluie, parasol, crème solaire,
   chaleur, vent, orages… et assistant vocal (voix de femme ou d'homme, commandes à la voix ou au clavier).
   La position reste dans l'appareil ; seules des coordonnées arrondies (≈ 1 km) sont envoyées au service météo. */
(window.BFC_MODULES = window.BFC_MODULES || []).push((A) => {
'use strict';
const { sb, db, $, $$, esc, fmt, fmtDate, auj, toast, action, ouvrirModale, fermerModale, router, VUES, formOperation } = A;
const Plug = () => window.Capacitor?.Plugins || {};
const lire = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9€,. ]+/g, ' ').replace(/\s+/g, ' ').trim();
const doux = (r) => r.error ? null : r.data;
const plusJours = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const euros = (n) => fmt(n).replace(/ | /g, ' ');

/* ================================================================ POSITION */
const LIEU = 'bsafe-lieu', METEO = 'bsafe-meteo';
async function positionGps() {
  const G = Plug().Geolocation;
  if (G?.getCurrentPosition) {
    try { await G.requestPermissions?.(); } catch {}
    const p = await G.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    return { lat: p.coords.latitude, lon: p.coords.longitude };
  }
  if (!navigator.geolocation) throw new Error('La localisation n\'est pas disponible sur cet appareil.');
  return new Promise((ok, ko) => navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }),
    e => ko(new Error(e.code === 1 ? 'Localisation refusée : autorisez-la dans les réglages, ou choisissez une ville.' : 'Position introuvable pour le moment.')), { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }));
}
async function nomDuLieu(lat, lon) {
  try { const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=fr`).then(x => x.json());
    return r.city || r.locality || r.principalSubdivision || null; } catch { return null; }
}
const distanceKm = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2)); };
/* met à jour la position (mode automatique) ; renvoie le lieu courant */
async function lieuCourant(forcer = false) {
  let l = lire(LIEU, null);
  if (l?.manuel) return l;
  if (!l?.auto && !forcer) return l;           // l'utilisateur n'a pas encore activé la météo locale
  if (!forcer && l && Date.now() - l.ts < 20 * 60000) return l;
  const p = await positionGps();
  const bouge = !l || distanceKm(l, p) > 3;
  l = { ...p, auto: true, ts: Date.now(), nom: bouge || !l?.nom ? (await nomDuLieu(p.lat, p.lon)) || 'Ma position' : l.nom };
  ecrire(LIEU, l); if (bouge) ecrire(METEO, null);
  return l;
}
let suivi = null;
function suivrePosition() {   // suivi pendant que l'appli est ouverte : si l'on se déplace de plus de 5 km, la météo est recalculée
  if (suivi || !navigator.geolocation || !lire(LIEU, null)?.auto) return;
  suivi = navigator.geolocation.watchPosition(async (p) => {
    const l = lire(LIEU, null); if (!l?.auto) return;
    const n = { lat: p.coords.latitude, lon: p.coords.longitude };
    if (distanceKm(l, n) > 5) { ecrire(LIEU, { ...n, auto: true, ts: Date.now(), nom: (await nomDuLieu(n.lat, n.lon)) || 'Ma position' }); ecrire(METEO, null);
      toast('📍 Nouveau lieu : météo mise à jour.'); if (/^#?\/?(aujourdhui)?$/.test(location.hash)) router(); }
  }, () => {}, { enableHighAccuracy: false, maximumAge: 300000, timeout: 60000 });
}
async function chercherVille(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=fr&format=json`).then(x => x.json());
  return (r.results || []).map(v => ({ lat: v.latitude, lon: v.longitude, nom: [v.name, v.admin1, v.country].filter(Boolean).filter((x, i, t) => t.indexOf(x) === i).join(', ') }));
}

/* ================================================================ MÉTÉO */
const CODES = { 0: ['☀️', 'Ciel dégagé'], 1: ['🌤️', 'Peu nuageux'], 2: ['⛅', 'Éclaircies'], 3: ['☁️', 'Couvert'], 45: ['🌫️', 'Brouillard'], 48: ['🌫️', 'Brouillard'],
  51: ['🌦️', 'Bruine'], 53: ['🌦️', 'Bruine'], 55: ['🌦️', 'Bruine'], 61: ['🌧️', 'Pluie faible'], 63: ['🌧️', 'Pluie'], 65: ['🌧️', 'Forte pluie'], 66: ['🌧️', 'Pluie'], 67: ['🌧️', 'Pluie'],
  71: ['🌨️', 'Neige'], 73: ['🌨️', 'Neige'], 75: ['🌨️', 'Neige'], 80: ['🌦️', 'Averses'], 81: ['🌧️', 'Averses'], 82: ['⛈️', 'Fortes averses'], 95: ['⛈️', 'Orage'], 96: ['⛈️', 'Orage et grêle'], 99: ['⛈️', 'Orage et grêle'] };
const code = (c) => CODES[c] || ['🌡️', 'Météo'];
async function meteo(l) {
  const c = lire(METEO, null);
  if (c && c.cle === `${l.lat.toFixed(2)},${l.lon.toFixed(2)}` && Date.now() - c.ts < 30 * 60000) return c.d;
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${l.lat.toFixed(2)}&longitude=${l.lon.toFixed(2)}&timezone=auto&forecast_days=2`
    + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m'
    + '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,uv_index,wind_gusts_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,wind_gusts_10m_max';
  const d = await fetch(u).then(x => { if (!x.ok) throw new Error('Service météo indisponible.'); return x.json(); });
  ecrire(METEO, { cle: `${l.lat.toFixed(2)},${l.lon.toFixed(2)}`, ts: Date.now(), d });
  return d;
}
/* Conseils pour la journée (ou demain après 19 h), croisés avec le foyer et le sport du jour */
function conseilsMeteo(d, ctx = {}) {
  const maintenant = new Date(), h0 = maintenant.getHours(), soir = h0 >= 19;
  const jour = soir ? plusJours(auj(), 1) : auj(), quand = soir ? 'demain' : 'aujourd\'hui';
  const H = d.hourly.time.map((t, i) => ({ t, h: +t.slice(11, 13), j: t.slice(0, 10), p: d.hourly.precipitation_probability?.[i] ?? 0, mm: d.hourly.precipitation?.[i] ?? 0,
    c: d.hourly.weather_code?.[i], uv: d.hourly.uv_index?.[i] ?? 0, raf: d.hourly.wind_gusts_10m?.[i] ?? 0, tp: d.hourly.temperature_2m?.[i], ress: d.hourly.apparent_temperature?.[i] }))
    .filter(x => x.j === jour && x.h >= (soir ? 7 : Math.max(7, h0)) && x.h <= 21);
  const out = [];
  if (!H.length) return { quand, liste: out };
  const pluie = H.reduce((a, b) => b.p > a.p ? b : a), mm = H.reduce((s, x) => s + x.mm, 0);
  const uv = Math.max(...H.map(x => x.uv)), raf = Math.max(...H.map(x => x.raf)), tmax = Math.max(...H.map(x => x.ress ?? x.tp)), tmin = Math.min(...H.map(x => x.tp));
  const orage = H.find(x => x.c >= 95);
  if (orage) out.push({ i: '⛈️', n: 'urgent', t: `Orages prévus ${quand} vers ${orage.h} h : évitez plage, baignade, randonnée et abris sous les arbres.` });
  if (pluie.p >= 50 || mm >= 1) out.push({ i: '☂️', n: 'attention', t: `Prenez un parapluie : pluie probable ${quand} vers ${pluie.h} h (${pluie.p} %${mm >= 1 ? `, ${mm.toFixed(1).replace('.', ',')} mm` : ''}).` });
  else if (pluie.p >= 30) out.push({ i: '🌂', n: 'info', t: `Petit risque d'averse vers ${pluie.h} h (${pluie.p} %) : un parapluie pliant dans le sac.` });
  if (uv >= 8) out.push({ i: '⛱️', n: 'attention', t: `UV très élevés (${Math.round(uv)}) : crème solaire indice 50, chapeau, lunettes ; parasol à la plage et ombre entre 11 h et 15 h.` });
  else if (uv >= 6) out.push({ i: '🧴', n: 'info', t: `UV élevés (${Math.round(uv)}) : crème solaire, chapeau et lunettes ; parasol si vous allez à la plage.` });
  else if (uv >= 3 && !(pluie.p >= 50)) out.push({ i: '🕶️', n: 'info', t: `UV modérés (${Math.round(uv)}) : lunettes de soleil.` });
  if (tmax >= 33) out.push({ i: '🥵', n: 'attention', t: `Forte chaleur (ressenti ${Math.round(tmax)} °C) : buvez souvent, évitez l'effort entre 11 h et 16 h, vêtements légers.` });
  else if (tmax >= 30) out.push({ i: '💧', n: 'info', t: `Il fera chaud (ressenti ${Math.round(tmax)} °C) : gourde d'eau dans le sac.` });
  if (raf >= 70) out.push({ i: '🌬️', n: 'urgent', t: `Rafales jusqu'à ${Math.round(raf)} km/h : rentrez les objets légers, prudence en mer et sur la route.` });
  else if (raf >= 50) out.push({ i: '💨', n: 'info', t: `Vent soutenu (rafales ${Math.round(raf)} km/h) : parasol déconseillé, attention en mer.` });
  if (tmin <= 12) out.push({ i: '🧥', n: 'info', t: `Frais le matin et le soir (${Math.round(tmin)} °C) : prévoyez une veste.` });
  const enfants = (ctx.membres || []).filter(m => m.role === 'enfant');
  if (enfants.length && uv >= 6) out.push({ i: '🧢', n: 'info', t: `Enfants : casquette et crème solaire avant l'école ou la sortie.` });
  (ctx.membres || []).filter(m => (m.pathologies || []).includes('drepanocytose') && (tmax >= 30 || tmin <= 15)).forEach(m => out.push({ i: '🩸', n: 'attention', t: `${m.prenom} : ${tmax >= 30 ? 'chaleur' : 'fraîcheur'} annoncée, bien s'hydrater et éviter les écarts de température.` }));
  (ctx.membres || []).filter(m => (m.pathologies || []).includes('asthme') && raf >= 50).forEach(m => out.push({ i: '🌬️', n: 'info', t: `${m.prenom} (asthme) : vent fort, inhalateur à portée de main.` }));
  (ctx.activites || []).forEach(a => { if (!a.heure) return; const hh = +a.heure.slice(0, 2), x = H.find(y => y.h === hh);
    if (x && (x.p >= 50 || x.c >= 95)) out.push({ i: '🏃', n: 'attention', t: `${a.nom} à ${hh} h : ${x.c >= 95 ? 'orage' : 'pluie'} probable à cette heure (${x.p} %).` });
    else if (x && (x.ress ?? x.tp) >= 32) out.push({ i: '🏃', n: 'info', t: `${a.nom} à ${hh} h : forte chaleur, hydratation renforcée.` }); });
  if (!out.length) out.push({ i: '👍', n: 'info', t: `Temps calme ${quand} : rien de particulier à prévoir.` });
  return { quand, liste: out, pluie, uv, tmax, tmin };
}
async function contexteFoyer() {
  const jsem = ((new Date().getDay() + 6) % 7) + 1;
  const [m, a] = await Promise.all([db.from('membres_foyer').select('prenom, role, pathologies').eq('actif', true).then(doux), db.from('activites_sport').select('nom, heure, jours').eq('actif', true).contains('jours', [jsem]).then(doux)]);
  return { membres: m || [], activites: a || [] };
}
function choisirLieu(apres) {
  ouvrirModale('📍 Lieu pour la météo', `<p style="margin-top:0">Utilisez votre position (mise à jour quand vous vous déplacez), ou choisissez une ville.</p>
    <button class="btn btn-primaire" id="lx-gps">📍 Utiliser ma position</button>
    <div class="champ" style="margin-top:14px"><label>…ou chercher une ville</label><div class="barre-outils"><input id="lx-q" placeholder="ex : Le Lamentin, Pointe-à-Pitre" style="flex:1"><button class="btn btn-fantome" id="lx-ok">Chercher</button></div></div>
    <div id="lx-res"></div><p class="aide">La position reste dans votre appareil ; seules des coordonnées arrondies (≈ 1 km) sont envoyées au service météo.</p>`, (md) => {
    $('#lx-gps', md).onclick = (e) => action(e.target, async () => { ecrire(LIEU, { auto: true, ts: 0, lat: 0, lon: 0 }); const l = await lieuCourant(true); fermerModale(); toast(`📍 ${l.nom}`); suivrePosition(); apres?.(); });
    const go = () => action($('#lx-ok', md), async () => { const r = await chercherVille($('#lx-q', md).value); $('#lx-res', md).innerHTML = r.map((v, i) => `<div class="aj-item cliquable" data-i="${i}">📍 ${esc(v.nom)}</div>`).join('') || '<div class="vide">Aucune ville trouvée.</div>';
      $('#lx-res', md).onclick = (e) => { const x = e.target.closest('[data-i]'); if (!x) return; ecrire(LIEU, { ...r[+x.dataset.i], manuel: true, ts: Date.now() }); ecrire(METEO, null); fermerModale(); apres?.(); }; });
    $('#lx-ok', md).onclick = go; $('#lx-q', md).onkeydown = (e) => { if (e.key === 'Enter') go(); };
  });
}
async function carteMeteo(col) {
  const box = document.createElement('div'); box.className = 'carte meteo-carte'; col.prepend(box);
  const l = lire(LIEU, null);
  if (!l) { box.innerHTML = `<h3>🌦️ Météo & conseils</h3><p class="aide">Activez la météo locale : l'assistant vous dira s'il faut un parapluie, un parasol, de la crème solaire…</p><button class="btn btn-primaire" id="mt-on">📍 Activer la météo locale</button>`;
    $('#mt-on', box).onclick = () => choisirLieu(() => router()); return; }
  box.innerHTML = '<div class="chargement">Météo…</div>';
  try {
    const lc = await lieuCourant(); const [d, ctx] = await Promise.all([meteo(lc), contexteFoyer()]);
    const C = conseilsMeteo(d, ctx), [ic, lib] = code(d.current.weather_code);
    const now = new Date().getHours(), prochaines = d.hourly.time.map((t, i) => ({ t, i })).filter(x => new Date(x.t) >= new Date(Date.now() - 3600000)).slice(0, 12);
    box.innerHTML = `<h3>🌦️ Météo <span class="aide">📍 ${esc(lc.nom || 'Ma position')}${lc.manuel ? '' : ' · suivie'}</span>
        <button class="btn btn-petit btn-fantome" id="mt-voix" style="margin-left:auto" title="Écouter">🔊</button><button class="btn btn-petit btn-fantome" id="mt-lieu" title="Changer de lieu">📍</button></h3>
      <div class="meteo-now"><span class="meteo-ic">${ic}</span><div><b class="meteo-t">${Math.round(d.current.temperature_2m)} °C</b> <span class="aide">ressenti ${Math.round(d.current.apparent_temperature)} °C</span><div>${lib} · ${Math.round(d.daily.temperature_2m_min[0])}° / ${Math.round(d.daily.temperature_2m_max[0])}° · UV max ${Math.round(d.daily.uv_index_max[0])}</div></div></div>
      <div class="meteo-heures">${prochaines.map(({ t, i }) => `<div><span>${+t.slice(11, 13)} h</span><b>${code(d.hourly.weather_code[i])[0]}</b><span>${Math.round(d.hourly.temperature_2m[i])}°</span><span class="${d.hourly.precipitation_probability[i] >= 50 ? 'pluie' : ''}">💧${d.hourly.precipitation_probability[i]}%</span></div>`).join('')}</div>
      <div class="aide" style="margin:8px 0 4px">À prévoir ${C.quand} :</div>
      ${C.liste.map(c => `<div class="alerte-ligne niv-${c.n === 'urgent' ? 'urgent' : c.n === 'attention' ? 'attention' : 'info'}"><div>${c.i} ${esc(c.t)}</div></div>`).join('')}`;
    $('#mt-lieu', box).onclick = () => choisirLieu(() => router());
    $('#mt-voix', box).onclick = () => parler(texteMeteo(lc, d, C));
    suivrePosition();
  } catch (e) { box.innerHTML = `<h3>🌦️ Météo</h3><div class="alerte">${esc(e.message)}</div><button class="btn btn-fantome btn-petit" id="mt-lieu2" style="margin-top:8px">📍 Choisir une ville</button>`; $('#mt-lieu2', box).onclick = () => choisirLieu(() => router()); }
}
const texteMeteo = (l, d, C) => `Météo à ${l.nom || 'votre position'} : ${code(d.current.weather_code)[1].toLowerCase()}, ${Math.round(d.current.temperature_2m)} degrés. ` + C.liste.map(c => c.t).join(' ');

/* ================================================================ VOIX */
const REGL = 'bsafe-voix';
const reglages = () => ({ genre: 'femme', vitesse: 1, alertes: true, ...lire(REGL, {}) });
const FEMME = /(amelie|amélie|audrey|aurelie|aurélie|julie|hortense|denise|marie|virginie|celine|céline|chantal|lea|léa|elsa|eloise|vivienne|female|femme|fr-fr-x-fra|fr-fr-x-frc|fr-fr-x-vlf|-fra-|-frc-)/i;
const HOMME = /(thomas|paul|henri|nicolas|daniel|claude|jean|remy|rémy|antoine|mathieu|fabrice|guillaume|yves|alain|\bmale\b|homme|fr-fr-x-frb|fr-fr-x-frd|-frb-|-frd-)/i;
async function voixWeb() {
  const s = window.speechSynthesis; if (!s) return [];
  let v = s.getVoices(); if (v.length) return v;
  await new Promise(r => { s.onvoiceschanged = r; setTimeout(r, 1200); }); return s.getVoices();
}
function choisirVoix(liste, genre) {
  const fr = liste.map((v, i) => ({ v, i })).filter(x => /^fr/i.test(x.v.lang || ''));
  const test = (x) => `${x.v.name || ''} ${x.v.voiceURI || ''} ${x.v.identifier || ''}`;
  const h = fr.find(x => HOMME.test(test(x)) && !FEMME.test(test(x)));
  return genre === 'homme' ? (h || fr[0] || null) : (fr.find(x => FEMME.test(test(x))) || fr.find(x => !HOMME.test(test(x))) || fr[0] || null);
}
async function parler(texte) {
  if (!texte) return;
  const R = reglages(), pitch = R.genre === 'homme' ? 0.82 : 1.12;   // la hauteur différencie toujours les deux voix, même si l'appareil n'a qu'une voix française
  const propre = texte.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/€/g, ' euros').replace(/°C/g, ' degrés').replace(/\bh\b/g, 'heures').replace(/\s+/g, ' ');
  bulle(texte, 'assistant');
  const T = Plug().TextToSpeech;
  if (T?.speak) {
    try { await T.stop?.(); } catch {}
    let voice; try { const v = choisirVoix((await T.getSupportedVoices()).voices || [], R.genre); voice = v?.i; } catch {}
    return T.speak({ text: propre, lang: 'fr-FR', rate: R.vitesse, pitch, volume: 1, ...(voice != null ? { voice } : {}), category: 'ambient' }).catch(e => toast('Voix : ' + e.message, true));
  }
  const s = window.speechSynthesis; if (!s) return toast('La synthèse vocale n\'est pas disponible sur cet appareil.', true);
  s.cancel(); const u = new SpeechSynthesisUtterance(propre); u.lang = 'fr-FR'; u.rate = R.vitesse; u.pitch = pitch;
  const v = choisirVoix(await voixWeb(), R.genre); if (v) u.voice = v.v;
  s.speak(u);
}
function silence() { try { Plug().TextToSpeech?.stop?.(); } catch {} try { window.speechSynthesis?.cancel(); } catch {} }
async function ecouter() {
  const S = Plug().SpeechRecognition;
  if (S?.start) {
    const { available } = await S.available(); if (!available) throw new Error('Reconnaissance vocale indisponible sur ce téléphone.');
    try { const p = await S.requestPermissions(); if (p?.speechRecognition === 'denied') throw new Error('Micro refusé : autorisez-le dans les réglages du téléphone.'); } catch (e) { if (/refus/.test(e.message)) throw e; }
    const r = await S.start({ language: 'fr-FR', maxResults: 1, prompt: 'Je vous écoute…', partialResults: false, popup: true });
    return r?.matches?.[0] || '';
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error('La reconnaissance vocale n\'est pas disponible dans ce navigateur : tapez votre demande.');
  return new Promise((ok, ko) => { const r = new SR(); r.lang = 'fr-FR'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => ok(e.results[0][0].transcript); r.onerror = (e) => ko(new Error(e.error === 'not-allowed' ? 'Micro refusé : autorisez-le pour ce site.' : 'Je n\'ai rien entendu.')); r.onend = () => ok(''); r.start(); });
}

/* ---------------------------------------------------------------- ce que l'assistant sait dire */
async function texteDisponible() {
  const r = doux(await db.rpc('reste_a_vivre', { p_perimetre: A.R.pro ? 'tout' : 'perso' }));
  if (!r) return 'Je ne trouve pas encore vos comptes.';
  return `Il vous reste ${euros(r.disponible)} de disponible réel jusqu'au ${fmtDate(r.jusqua)}, soit environ ${euros(r.par_jour)} par jour, après ${euros(r.factures)} de factures à venir.`;
}
async function texteFactures() {
  const o = doux(await db.rpc('occurrences_echeances', { p_debut: plusJours(auj(), -30), p_fin: plusJours(auj(), 10) })) || [];
  const l = o.filter(x => x.sens === 'depense' && ['a_venir', 'due', 'en_retard'].includes(x.statut));
  if (!l.length) return 'Aucune facture à payer dans les dix prochains jours.';
  return `${l.length} facture${l.length > 1 ? 's' : ''} à payer : ` + l.slice(0, 6).map(x => `${x.libelle}, ${euros(x.montant)}, ${x.statut === 'en_retard' ? 'en retard' : x.jours === 0 ? 'aujourd\'hui' : x.jours === 1 ? 'demain' : 'le ' + fmtDate(x.date_prevue).slice(0, 5)}`).join(' ; ') + '.';
}
async function texteMenu() {
  const m = doux(await db.from('menus').select('repas, libelle').eq('jour', auj())) || [];
  return m.length ? 'Au menu aujourd\'hui : ' + m.map(x => `${x.repas === 'dejeuner' ? 'au déjeuner' : 'au dîner'}, ${x.libelle}`).join(' ; ') + '.' : 'Aucun menu prévu aujourd\'hui. Dites « ouvre la cuisine » pour en proposer un.';
}
async function texteAgenda() {
  const a = doux(await db.from('v_agenda_priorites').select('titre, echeance').in('statut', ['a_faire', 'en_cours']).lte('echeance', auj() + 'T23:59:59').order('echeance').limit(6)) || [];
  return a.length ? `À faire : ${a.map(x => x.titre + (x.echeance?.slice(0, 10) < auj() ? ' (en retard)' : '')).join(' ; ')}.` : 'Rien d\'urgent dans votre agenda.';
}
async function texteMeteoCourt() {
  const l = await lieuCourant().catch(() => lire(LIEU, null)); if (!l) return 'La météo locale n\'est pas encore activée.';
  const [d, ctx] = await Promise.all([meteo(l), contexteFoyer()]); return texteMeteo(l, d, conseilsMeteo(d, ctx));
}
async function pointDuJour() {
  const h = new Date().getHours(), salut = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const al = doux(await db.from('alertes').select('titre').eq('lue', false).limit(5)) || [];
  const parts = await Promise.all([texteMeteoCourt().catch(() => ''), texteDisponible().catch(() => ''), texteFactures().catch(() => ''), texteAgenda().catch(() => ''), texteMenu().catch(() => '')]);
  return [`${salut} ! Voici votre point du jour.`, ...parts, al.length ? `Vous avez ${al.length} alerte${al.length > 1 ? 's' : ''} : ${al.map(x => x.titre).join(' ; ')}.` : ''].filter(Boolean).join(' ');
}
const PAGES = { aujourdhui: /aujourd|accueil/, cuisine: /cuisine|recette|menu/, courses: /course/, sport: /sport/, foyer: /foyer/, echeances: /facture/, espaces: /espace/,
  monagenda: /agenda/, enfants: /enfant|planning/, comptes: /compte/, operations: /depense|recette|operation/, documents: /document/, tableau: /tableau|bord/ };
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function dateDite(t) {
  const d = new Date(); if (/apres demain/.test(t)) d.setDate(d.getDate() + 2); else if (/demain/.test(t)) d.setDate(d.getDate() + 1);
  else { const j = JOURS.findIndex(x => t.includes(x)); if (j >= 0) { let n = (j - d.getDay() + 7) % 7; if (!n) n = 7; d.setDate(d.getDate() + n); } }
  const h = t.match(/(\d{1,2}) ?(?:h|heures?)(?: ?(\d{2}))?/); d.setHours(h ? +h[1] : 9, h?.[2] ? +h[2] : 0, 0, 0); return d;
}
async function traiter(phrase) {
  const t = norm(phrase); bulle(phrase, 'moi');
  if (!t) return parler('Je n\'ai rien entendu.');
  if (/^(stop|silence|tais toi|arrete)/.test(t)) return silence();
  // ajouter une dépense : « j'ai dépensé 12,50 euros chez Carrefour »
  const montant = t.match(/(\d+(?:[.,]\d{1,2})?) ?(?:€|euros?)/);
  if (montant && /(depense|achat|paye|ajoute|note|enregistre)/.test(t)) {
    const chez = phrase.match(/(?:chez|à|au|a la|pour)\s+([^,.]+)$/i)?.[1]?.trim();
    parler(`D'accord, je prépare une dépense de ${montant[1]} euros${chez ? ' chez ' + chez : ''}. Vérifiez et enregistrez.`);
    return formOperation({ type: 'depense', montant: Number(montant[1].replace(',', '.')), libelle: chez ? chez.charAt(0).toUpperCase() + chez.slice(1) : 'Dépense', date_operation: auj() }, () => router());
  }
  // rappel : « rappelle-moi d'appeler le garage demain à 10 h »
  if (/(rappelle|rappel|n oublie pas|pense a|note que)/.test(t)) {
    const titre = phrase.replace(/^.*?(rappelle[- ]moi( de| d')?|rappel( de)?|n'oublie pas( de| d')?|pense à|note que)\s*/i, '').replace(/\s*(demain|après-demain|aujourd'hui|ce soir|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(\s.*)?$/i, '').trim() || phrase;
    const d = dateDite(t);
    const r = await db.from('agenda_taches').insert({ titre: titre.charAt(0).toUpperCase() + titre.slice(1), echeance: d.toISOString(), rappel_le: d.toISOString(), importance: 2 });
    return parler(r.error ? 'Je n\'ai pas pu enregistrer le rappel.' : `C'est noté : ${titre}, le ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${d.getHours()} heures.`);
  }
  if (/(ouvre|va (sur|dans|a)|affiche|montre)/.test(t)) { const p = Object.entries(PAGES).find(([, re]) => re.test(t)); if (p) { location.hash = '#/' + p[0]; return parler('Voilà.'); } }
  if (/(point|resume|journee|briefing|quoi de neuf)/.test(t)) return parler(await pointDuJour());
  if (/(meteo|parapluie|pleuv|pluie|soleil|parasol|temps qu|creme solaire|chaud)/.test(t)) return parler(await texteMeteoCourt());
  if (/(reste|disponible|solde|combien|argent|depenser)/.test(t)) return parler(await texteDisponible());
  if (/(facture|payer|echeance|prelevement)/.test(t)) return parler(await texteFactures());
  if (/(menu|manger|repas|diner|dejeuner|cuisine)/.test(t)) return parler(await texteMenu());
  if (/(agenda|faire|tache|rendez vous|rdv)/.test(t)) return parler(await texteAgenda());
  return parler('Je n\'ai pas compris. Vous pouvez dire : point du jour, météo, combien il me reste, mes factures, le menu, rappelle-moi de… demain à 10 heures, ou j\'ai dépensé 12 euros chez Carrefour.');
}

/* ---------------------------------------------------------------- panneau vocal (bouton flottant) */
function bulle(texte, qui) { const z = $('#vx-fil'); if (!z) return; z.insertAdjacentHTML('beforeend', `<div class="vx-bulle ${qui}">${esc(texte)}</div>`); z.scrollTop = z.scrollHeight; }
function panneau() {
  if ($('#vx-panneau')) { $('#vx-panneau').remove(); return; }
  const R = reglages();
  const p = document.createElement('div'); p.id = 'vx-panneau'; p.className = 'vx-panneau';
  p.innerHTML = `<div class="vx-tete"><b>🎙️ Assistant B-S@fe</b><button class="btn-x" id="vx-x">×</button></div>
    <div class="vx-regl"><div class="bascule" id="vx-genre"><button data-g="femme" class="${R.genre === 'femme' ? 'on' : ''}">👩 Voix de femme</button><button data-g="homme" class="${R.genre === 'homme' ? 'on' : ''}">👨 Voix d'homme</button></div>
      <label class="aide">Vitesse <input type="range" id="vx-vit" min="0.7" max="1.4" step="0.1" value="${R.vitesse}"></label>
      <label class="case aide"><input type="checkbox" id="vx-al" ${R.alertes ? 'checked' : ''}> Lire les nouvelles alertes</label></div>
    <div class="vx-fil" id="vx-fil"><div class="vx-bulle assistant">Bonjour ! Appuyez sur 🎤 et parlez, ou écrivez. Essayez : « point du jour », « faut-il un parapluie ? », « combien il me reste », « rappelle-moi d'appeler le garage demain à 10 h ».</div></div>
    <div class="vx-saisie"><input id="vx-txt" placeholder="Écrivez votre demande…"><button class="btn btn-fantome" id="vx-env">➤</button><button class="btn btn-primaire vx-micro" id="vx-mic">🎤</button></div>
    <div class="vx-raccourcis"><button class="btn btn-petit btn-fantome" data-c="point du jour">☀️ Point du jour</button><button class="btn btn-petit btn-fantome" data-c="météo">🌦️ Météo</button><button class="btn btn-petit btn-fantome" data-c="combien il me reste">💶 Disponible</button><button class="btn btn-petit btn-fantome" data-c="mes factures">📆 Factures</button><button class="btn btn-petit btn-fantome" data-c="stop">⏹ Stop</button></div>`;
  document.body.append(p);
  $('#vx-x', p).onclick = () => { silence(); p.remove(); };
  $('#vx-genre', p).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; ecrire(REGL, { ...reglages(), genre: b.dataset.g }); $$('#vx-genre button', p).forEach(x => x.classList.toggle('on', x === b)); parler(b.dataset.g === 'homme' ? 'Bonjour, je serai votre assistant.' : 'Bonjour, je serai votre assistante.'); };
  $('#vx-vit', p).onchange = (e) => ecrire(REGL, { ...reglages(), vitesse: +e.target.value });
  $('#vx-al', p).onchange = (e) => ecrire(REGL, { ...reglages(), alertes: e.target.checked });
  const envoyer = () => { const v = $('#vx-txt', p).value.trim(); if (!v) return; $('#vx-txt', p).value = ''; traiter(v).catch(e => parler(e.message)); };
  $('#vx-env', p).onclick = envoyer; $('#vx-txt', p).onkeydown = (e) => { if (e.key === 'Enter') envoyer(); };
  $('.vx-raccourcis', p).onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) traiter(b.dataset.c).catch(er => parler(er.message)); };
  $('#vx-mic', p).onclick = async (e) => { const b = e.currentTarget; silence(); b.classList.add('ecoute'); b.textContent = '👂';
    try { const t = await ecouter(); await traiter(t); } catch (er) { bulle(er.message, 'assistant'); } finally { b.classList.remove('ecoute'); b.textContent = '🎤'; } };
}
let bouton = false, canal = false;
function installer() {
  if (!bouton) { bouton = true; const b = document.createElement('button'); b.className = 'vx-flottant'; b.id = 'vx-bouton'; b.title = 'Assistant vocal'; b.textContent = '🎙️'; b.onclick = panneau; document.body.append(b); }
  if (!canal) { canal = true; try { sb.channel('bsafe-voix').on('postgres_changes', { event: 'INSERT', schema: 'bforcompta', table: 'alertes' }, (p) => { if (reglages().alertes && p.new?.titre) parler('Alerte : ' + p.new.titre); }).subscribe(); } catch {} }
}

/* ---------------------------------------------------------------- « Aujourd'hui » : carte météo + bouton écouter */
const vueAvant = VUES.aujourdhui;
if (vueAvant) VUES.aujourdhui = async (el, p) => {
  await vueAvant(el, p);
  installer();
  const col = $$('.aj-col', el)[1]; if (col) await carteMeteo(col);
  const act = $('.tete-vue .actions', el);
  if (act && !$('#aj-ecouter', el)) { act.insertAdjacentHTML('afterbegin', '<button class="btn btn-fantome" id="aj-ecouter" title="Écouter le point du jour">🔊 Écouter</button>');
    $('#aj-ecouter', el).onclick = (e) => action(e.target, async () => parler(await pointDuJour())); }
};
A.parler = parler; A.pointDuJour = pointDuJour;
setTimeout(() => { if (document.querySelector('#ecran-app:not([hidden])')) installer(); }, 3000);
});
