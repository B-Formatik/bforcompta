-- =====================================================================
--  B-ForCompt@ — Mes enfants (planning des tâches ménagères) et Mon agenda (tâches classées par urgence)
--  Partage au « foyer » : un parent voit les enfants, plannings et tâches de l'autre
--  dès qu'ils sont co-titulaires d'un même compte joint.
-- =====================================================================
set search_path = bforcompta, extensions, public;

create or replace function bforcompta.meme_foyer(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid() or exists (
    select 1 from bforcompta.comptes_membres a join bforcompta.comptes_membres b on b.compte_id = a.compte_id
    where a.user_id = auth.uid() and b.user_id = p_user);
$$;

create table if not exists bforcompta.enfants (
  id                uuid primary key default gen_random_uuid(),
  prenom            text not null,
  date_naissance    date,
  telephone         text,            -- WhatsApp de l'enfant (facultatif)
  telephone_parent  text,            -- utilisé si l'enfant n'a pas de numéro
  jours_cours       int[] not null default '{1,2,4,5}',   -- 1 = lundi … 7 = dimanche
  couleur           text default '#2467b6',
  rappel_heure      time default '07:00',
  actif             boolean not null default true,
  proprietaire      uuid references auth.users(id) on delete cascade default auth.uid(),
  created_at        timestamptz not null default now()
);

create table if not exists bforcompta.taches_menageres (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null,
  icone         text default '🧹',
  duree_min     int not null default 10,
  age_min       int not null default 3,
  points        int not null default 1,
  par_enfant    boolean not null default false,  -- vrai : chaque enfant la fait (ex. ranger sa chambre) ; faux : un seul enfant, à tour de rôle
  jours         int[] not null default '{1,2,3,4,5,6,7}',
  periodes      text[] not null default '{cours,weekend,vacances}',
  actif         boolean not null default true,
  proprietaire  uuid references auth.users(id) on delete cascade default auth.uid(),
  created_at    timestamptz not null default now()
);

create table if not exists bforcompta.periodes_calendrier (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('vacances','ferie','absence','autre')),
  enfant_id     uuid references bforcompta.enfants(id) on delete cascade,  -- null = toute la famille
  date_debut    date not null,
  date_fin      date not null,
  libelle       text,
  proprietaire  uuid references auth.users(id) on delete cascade default auth.uid(),
  check (date_fin >= date_debut)
);

create table if not exists bforcompta.planning_taches (
  id              uuid primary key default gen_random_uuid(),
  jour            date not null,
  enfant_id       uuid not null references bforcompta.enfants(id) on delete cascade,
  tache_id        uuid not null references bforcompta.taches_menageres(id) on delete cascade,
  statut          text not null default 'a_faire' check (statut in ('a_faire','fait','non_fait')),
  rappel_envoye_le timestamptz,
  proprietaire    uuid references auth.users(id) on delete cascade default auth.uid(),
  unique (jour, enfant_id, tache_id)
);
create index if not exists idx_planning_jour on bforcompta.planning_taches(jour);

create table if not exists bforcompta.agenda_taches (
  id            uuid primary key default gen_random_uuid(),
  titre         text not null,
  details       text,
  categorie     text default 'Perso',
  echeance      timestamptz,
  importance    int not null default 2 check (importance between 1 and 3),   -- 1 faible, 2 normale, 3 haute
  statut        text not null default 'a_faire' check (statut in ('a_faire','en_cours','fait','annule')),
  rappel_le     timestamptz,
  canaux        text[] not null default '{whatsapp,email}',
  telephone     text,
  email         text,
  rappel_envoye_le timestamptz,
  partage_foyer boolean not null default false,
  proprietaire  uuid references auth.users(id) on delete cascade default auth.uid(),
  created_at    timestamptz not null default now(),
  fait_le       timestamptz
);
create index if not exists idx_agenda_echeance on bforcompta.agenda_taches(echeance);

-- Score de priorité : importance × urgence (en retard 4, aujourd'hui 3, sous 3 jours 2, plus tard 1)
create or replace view bforcompta.v_agenda_priorites with (security_invoker = true) as
  select t.*,
    case when t.echeance is null then 1
         when t.echeance < now() then 4
         when t.echeance::date = current_date then 3
         when t.echeance < now() + interval '3 days' then 2 else 1 end as urgence,
    t.importance * case when t.echeance is null then 1 when t.echeance < now() then 4 when t.echeance::date = current_date then 3
                        when t.echeance < now() + interval '3 days' then 2 else 1 end as score
  from bforcompta.agenda_taches t;

-- Règles d'accès
do $$ declare t text;
begin
  foreach t in array array['enfants','taches_menageres','periodes_calendrier','planning_taches'] loop
    execute format('alter table bforcompta.%I enable row level security', t);
    execute format('drop policy if exists foyer_acces on bforcompta.%I', t);
    execute format('create policy foyer_acces on bforcompta.%I for all to authenticated using (bforcompta.meme_foyer(proprietaire)) with check (bforcompta.peut_utiliser() and bforcompta.meme_foyer(proprietaire))', t);
  end loop;
end $$;
alter table bforcompta.agenda_taches enable row level security;
drop policy if exists agenda_acces on bforcompta.agenda_taches;
create policy agenda_acces on bforcompta.agenda_taches for all to authenticated
  using (proprietaire = auth.uid() or (partage_foyer and bforcompta.meme_foyer(proprietaire)))
  with check (bforcompta.peut_utiliser() and (proprietaire = auth.uid() or (partage_foyer and bforcompta.meme_foyer(proprietaire))));

grant all on bforcompta.enfants, bforcompta.taches_menageres, bforcompta.periodes_calendrier, bforcompta.planning_taches, bforcompta.agenda_taches to authenticated, service_role;
grant select on bforcompta.v_agenda_priorites to authenticated, service_role;
grant execute on all functions in schema bforcompta to authenticated, service_role;

do $$ declare t text;
begin
  foreach t in array array['enfants','planning_taches','agenda_taches'] loop
    begin execute format('alter publication supabase_realtime add table bforcompta.%I', t); exception when duplicate_object then null; end;
  end loop;
end $$;

select 'ok' as famille_agenda;
