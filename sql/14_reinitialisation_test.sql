-- =====================================================================
--  B-S@fe — Remise à zéro avant le test réel (À NE LANCER QU'UNE FOIS, IRRÉVERSIBLE)
--  Efface toutes les données saisies et les comptes utilisateurs de test.
--  Garde : les comptes administrateurs (rôle admin sur une structure), le catalogue de prix commun,
--  les recettes de base, les espaces, catégories, tiers, bibliothèque d'images, et la plateforme B-Form@tik.
-- =====================================================================
begin;
create temp table a_garder on commit drop as
  select distinct user_id from plateforme.acces where role = 'admin';

delete from bforcompta.transactions_bancaires;
delete from bforcompta.connexions_bancaires;
delete from bforcompta.emails_recus;
delete from bforcompta.boites_mail;
delete from bforcompta.lignes_courses;
delete from bforcompta.listes_courses;
delete from bforcompta.echeances_pointages;
delete from bforcompta.documents;
delete from bforcompta.echeances;
delete from bforcompta.objectifs_epargne;
delete from bforcompta.operations;
delete from bforcompta.virements;
delete from bforcompta.budgets;
delete from bforcompta.comptes_membres;
delete from bforcompta.comptes;
delete from bforcompta.alertes;
delete from bforcompta.agenda_taches;
delete from bforcompta.planning_taches;
delete from bforcompta.taches_menageres;
delete from bforcompta.periodes_calendrier;
delete from bforcompta.enfants;
delete from bforcompta.repas_journal;
delete from bforcompta.menus;
delete from bforcompta.seances_sport;
delete from bforcompta.activites_sport where proprietaire is not null;
delete from bforcompta.recettes where proprietaire is not null;
delete from bforcompta.membres_foyer;
delete from bforcompta.foyer_parametres;
delete from bforcompta.securite_visage;

-- comptes utilisateurs de test (tout compte sans rôle administrateur)
delete from auth.users u where not exists (select 1 from a_garder g where g.user_id = u.id);

select (select count(*) from auth.users) as comptes_restants,
       (select count(*) from bforcompta.comptes) as comptes_bancaires,
       (select count(*) from bforcompta.operations) as operations,
       (select count(*) from bforcompta.catalogue_prix) as prix_catalogue_gardes;
commit;
