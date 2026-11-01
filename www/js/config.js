// Raccordement à la base Supabase « B-Form@tik »
// La clé « publishable » est faite pour être utilisée dans un navigateur :
// la sécurité est assurée par les règles RLS (accès réservé aux comptes autorisés pour 'bforcompta').
window.BFC_CONFIG = {
  url: 'https://fvqixplmmnzkoadfawrc.supabase.co',
  cle: 'sb_publishable_WlDhEe_AscU9VYk2ZQmLgQ_IoEZZTVh',
  structure: 'bforcompta',           // schéma de l'application
  bucketDocuments: 'bforcompta-documents',
  bucketImages: 'bforcompta-images',
  devise: 'EUR',
  urlWeb: 'https://b-formatik.github.io/bforcompta/'   // version web (GitHub Pages) : sert aussi au lien « mot de passe oublié » depuis l'APK
};
