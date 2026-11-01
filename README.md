# B-ForCompt@ — created by B-Form@tik

Gestion financière de B-Form@tik : dépenses, recettes, espèces, comptes, justificatifs, bibliothèque d'images, factures & devis par structure, graphiques.
Base de données : Supabase « B-Form@tik » (schéma `bforcompta`), protégée par RLS : seuls les comptes autorisés voient les données.

## Ce que fait ce dépôt
À chaque modification sur `main`, GitHub construit automatiquement :
- **l'APK Android** → onglet *Releases*, fichier `B-ForCompta.apk`
  (lien permanent : `https://github.com/<compte>/<dépôt>/releases/latest/download/B-ForCompta.apk`)
- **la version web** → GitHub Pages (`https://<compte>.github.io/<dépôt>/`)

## Installer l'APK sur un téléphone Android
1. Sur le téléphone, ouvrez le lien de téléchargement de l'APK.
2. Autorisez l'installation depuis le navigateur (« Sources inconnues ») si Android le demande.
3. Ouvrez **B-ForCompt@** → *Mot de passe oublié ?* la première fois → code reçu par e-mail.

Mise à jour : chaque nouvelle version est signée avec une clé de développement différente ; si Android refuse la mise à jour, désinstallez l'ancienne version puis installez la nouvelle (vos données sont dans la base, rien n'est perdu).

## Arborescence
```
www/                     l'application (HTML/CSS/JS, sans étape de compilation)
  js/config.js           raccordement Supabase (clé publishable)
assets/                  icône et écran de démarrage Android
capacitor.config.json    identifiant Android fr.bformatik.bforcompta
.github/workflows/       construction APK + publication web
```
