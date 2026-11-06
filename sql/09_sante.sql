-- =====================================================================
--  B-S@fe — Santé du foyer : pathologies de chaque membre (facultatif) pour adapter repas, sport et conseils.
--  Données de santé : visibles uniquement par le foyer (mêmes règles d'accès que membres_foyer).
-- =====================================================================
set search_path = bforcompta, extensions, public;
alter table bforcompta.membres_foyer   add column if not exists pathologies text[] not null default '{}';
alter table bforcompta.membres_foyer   add column if not exists sante_notes text;
alter table bforcompta.foyer_parametres add column if not exists sante_demandee boolean not null default false;
select 'ok' as sante;
