/* B-S@fe — reconnaissance du visage, entièrement SUR L'APPAREIL.
   L'empreinte (128 nombres) est rangée dans le stockage local du téléphone, jamais envoyée à Supabase. */
(function () {
  const SEUIL = 0.5;                 // distance max entre deux empreintes du même visage (plus petit = plus strict)
  const CLE = (uid) => 'bsafe-visage:' + uid;
  let pret = null;

  function chargerScript(src) {
    return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Module visage introuvable')); document.head.appendChild(s); });
  }
  async function preparer() {
    if (!pret) pret = (async () => {
      if (!window.faceapi) await chargerScript('vendor/face-api.js');
      const m = 'vendor/visage';
      await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(m), faceapi.nets.faceLandmark68TinyNet.loadFromUri(m), faceapi.nets.faceRecognitionNet.loadFromUri(m)]);
    })().catch(e => { pret = null; throw e; });
    return pret;
  }

  const enregistree = (uid) => { try { return JSON.parse(localStorage.getItem(CLE(uid)) || 'null'); } catch { return null; } };
  const memoriser = (uid, emp) => localStorage.setItem(CLE(uid), JSON.stringify(Array.from(emp)));
  const oublier = (uid) => { try { localStorage.removeItem(CLE(uid)); } catch {} };
  const distance = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

  /* Ouvre la caméra frontale dans `zone`, puis déroule les étapes :
     1) visage de face (empreinte), 2) tête tournée (preuve qu'il ne s'agit pas d'une photo).
     `info(texte)` affiche la consigne. Renvoie l'empreinte moyenne. */
  async function scanner(zone, info, { captures = 3, delaiMax = 45000 } = {}) {
    info('Préparation de la caméra…');
    await preparer();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Caméra indisponible sur cet appareil.');
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false }); }
    catch { throw new Error('Accès à la caméra refusé. Autorisez la caméra pour B-S@fe dans les réglages du téléphone.'); }
    zone.innerHTML = '<div class="visage-cadre"><video playsinline muted autoplay></video><div class="visage-ovale"></div></div>';
    const video = zone.querySelector('video'); video.srcObject = flux; await video.play();
    const opt = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
    const fin = Date.now() + delaiMax;
    const pause = (ms) => new Promise(r => setTimeout(r, ms));
    const empreintes = []; let tourne = false;
    try {
      info('Regardez l\'écran, visage bien éclairé, dans l\'ovale.');
      while (empreintes.length < captures) {
        if (Date.now() > fin) throw new Error('Visage non détecté. Placez-vous face à une lumière et réessayez.');
        const r = await faceapi.detectSingleFace(video, opt).withFaceLandmarks(true).withFaceDescriptor();
        if (r && r.detection.score > 0.6) {
          const p = position(r);
          if (Math.abs(p - 0.5) < 0.12) { empreintes.push(r.descriptor); zone.querySelector('.visage-cadre').classList.add('ok'); }
        }
        await pause(250);
      }
      info('Parfait. Tournez maintenant <b>lentement la tête</b> vers la gauche ou la droite.');
      while (!tourne) {
        if (Date.now() > fin) throw new Error('Mouvement de tête non détecté. Réessayez en tournant un peu plus la tête.');
        const r = await faceapi.detectSingleFace(video, opt).withFaceLandmarks(true);
        if (r && Math.abs(position(r) - 0.5) > 0.16) tourne = true;
        await pause(200);
      }
    } finally { flux.getTracks().forEach(t => t.stop()); }
    const moy = new Float32Array(128);
    empreintes.forEach(e => e.forEach((v, i) => { moy[i] += v / empreintes.length; }));
    return moy;
  }
  // position horizontale du bout du nez dans le visage : 0,5 = de face
  function position(r) { const nez = r.landmarks.positions[30]; const b = r.detection.box; return (nez.x - b.x) / b.width; }

  window.BSAFE_VISAGE = {
    preparer, enregistree, oublier,
    async enregistrer(uid, zone, info) { const e = await scanner(zone, info, { captures: 5 }); memoriser(uid, e); return true; },
    async verifier(uid, zone, info) {
      const ref = enregistree(uid); if (!ref) throw new Error('Aucun visage enregistré sur cet appareil.');
      const e = await scanner(zone, info, { captures: 2 });
      const d = distance(Array.from(e), ref);
      return { ok: d < SEUIL, distance: d };
    }
  };
})();
