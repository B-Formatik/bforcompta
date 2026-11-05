-- =====================================================================
--  B-ForCompt@ — Courses : catalogue de produits, listes de courses, tickets
--  Une liste terminée crée automatiquement la dépense (opération) sur le compte
--  choisi (banque, carte ou caisse espèces) : elle entre dans tous les calculs.
-- =====================================================================
set search_path = bforcompta, extensions, public;

create table if not exists bforcompta.produits (
  id                  uuid primary key default gen_random_uuid(),
  nom                 text not null,
  marque              text,
  rayon               text,                         -- ex : Épicerie, Frais, Hygiène…
  unite               text not null default 'pièce',
  prix_habituel       numeric(10,2),
  magasin_habituel_id uuid references bforcompta.tiers(id) on delete set null,
  photos              text[] not null default '{}',  -- chemins dans le bucket bforcompta-images (dossier produits/)
  details             text,
  code_barres         text,
  actif               boolean not null default true,
  created_by          uuid references auth.users(id) default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_produits_nom on bforcompta.produits(lower(nom));

create table if not exists bforcompta.listes_courses (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null default 'Courses',
  date_prevue     date not null default current_date,
  heure_prevue    time,
  magasin_id      uuid references bforcompta.tiers(id) on delete set null,      -- lieu d'achat
  compte_id       uuid references bforcompta.comptes(id) on delete set null,    -- banque, carte ou caisse espèces
  moyen_paiement  bforcompta.moyen_paiement not null default 'carte',
  lieu_paiement   text,                                                          -- caisse, drive, en ligne, ville…
  statut          text not null default 'brouillon' check (statut in ('brouillon','programmee','en_cours','terminee','annulee')),
  total_estime    numeric(12,2) not null default 0,
  total_paye      numeric(12,2),
  operation_id    uuid references bforcompta.operations(id) on delete set null,
  document_id     uuid references bforcompta.documents(id) on delete set null,  -- ticket / facture
  structure_code  text not null default 'bformatik' references plateforme.structures(code) on update cascade,
  proprietaire    uuid references auth.users(id) on delete set null default auth.uid(),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_listes_date on bforcompta.listes_courses(date_prevue);

create table if not exists bforcompta.lignes_courses (
  id             uuid primary key default gen_random_uuid(),
  liste_id       uuid not null references bforcompta.listes_courses(id) on delete cascade,
  produit_id     uuid references bforcompta.produits(id) on delete set null,
  libelle        text not null,
  quantite       numeric(10,3) not null default 1,
  unite          text,
  prix_unitaire  numeric(10,2),
  prix_total     numeric(12,2) generated always as (round(quantite * coalesce(prix_unitaire, 0), 2)) stored,
  achete         boolean not null default false,
  ordre          int not null default 0
);
create index if not exists idx_lignes_liste on bforcompta.lignes_courses(liste_id);

-- total estimé tenu à jour automatiquement
create or replace function bforcompta.maj_total_liste()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v uuid := coalesce(new.liste_id, old.liste_id);
begin
  update bforcompta.listes_courses set total_estime = coalesce((select sum(prix_total) from bforcompta.lignes_courses where liste_id = v), 0), updated_at = now() where id = v;
  return null;
end $$;
drop trigger if exists trg_total_liste on bforcompta.lignes_courses;
create trigger trg_total_liste after insert or update or delete on bforcompta.lignes_courses
  for each row execute function bforcompta.maj_total_liste();

drop trigger if exists trg_produits_upd on bforcompta.produits;
create trigger trg_produits_upd before update on bforcompta.produits for each row execute function bforcompta.set_updated_at();

-- catégorie de dépense dédiée
insert into bforcompta.categories (nom, type, couleur) values ('Courses & alimentation', 'depense', '#16a34a') on conflict (nom, type) do nothing;

-- Règles d'accès : une liste est visible de son auteur, ou de ceux qui voient le compte de paiement
create or replace function bforcompta.peut_voir_liste(p_liste uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from bforcompta.listes_courses l where l.id = p_liste and (
    l.proprietaire = auth.uid() or (l.compte_id is not null and bforcompta.peut_voir_compte(l.compte_id))));
$$;
alter table bforcompta.produits enable row level security;
alter table bforcompta.listes_courses enable row level security;
alter table bforcompta.lignes_courses enable row level security;
drop policy if exists produits_acces on bforcompta.produits;
create policy produits_acces on bforcompta.produits for all to authenticated using (bforcompta.peut_utiliser()) with check (bforcompta.peut_utiliser());
drop policy if exists listes_lecture on bforcompta.listes_courses;
drop policy if exists listes_ecriture on bforcompta.listes_courses;
drop policy if exists listes_modif on bforcompta.listes_courses;
drop policy if exists listes_suppr on bforcompta.listes_courses;
create policy listes_lecture on bforcompta.listes_courses for select to authenticated
  using (proprietaire = auth.uid() or (compte_id is not null and bforcompta.peut_voir_compte(compte_id)));
create policy listes_ecriture on bforcompta.listes_courses for insert to authenticated
  with check (bforcompta.peut_utiliser() and proprietaire = auth.uid() and (compte_id is null or bforcompta.peut_voir_compte(compte_id)));
create policy listes_modif on bforcompta.listes_courses for update to authenticated
  using (proprietaire = auth.uid() or (compte_id is not null and bforcompta.peut_voir_compte(compte_id)))
  with check (compte_id is null or bforcompta.peut_voir_compte(compte_id));
create policy listes_suppr on bforcompta.listes_courses for delete to authenticated
  using (proprietaire = auth.uid() or (compte_id is not null and bforcompta.peut_voir_compte(compte_id)));
drop policy if exists lignes_acces on bforcompta.lignes_courses;
create policy lignes_acces on bforcompta.lignes_courses for all to authenticated
  using (bforcompta.peut_voir_liste(liste_id)) with check (bforcompta.peut_voir_liste(liste_id));

grant all on bforcompta.produits, bforcompta.listes_courses, bforcompta.lignes_courses to authenticated, service_role;
grant execute on all functions in schema bforcompta to authenticated, service_role;

select 'ok' as courses;

-- Synchronisation en direct entre appareils (ex. deux téléphones d'un couple sur un compte joint)
-- Supabase Realtime diffuse chaque modification ; les règles d'accès (RLS) s'appliquent : chacun ne reçoit que ce qu'il a le droit de voir.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['operations','virements','comptes','comptes_membres','listes_courses','lignes_courses','produits','transactions_bancaires','emails_recus'] loop
    begin
      execute format('alter publication supabase_realtime add table bforcompta.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
alter table bforcompta.lignes_courses replica identity full;
alter table bforcompta.listes_courses replica identity full;
alter table bforcompta.operations replica identity full;

select 'ok' as synchronisation;
