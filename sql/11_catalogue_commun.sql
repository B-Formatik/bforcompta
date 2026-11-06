-- =====================================================================
--  B-S@fe — Base de prix commune à tous les utilisateurs (produits, magasins, relevés de prix),
--  alimentée par les tickets scannés, les courses terminées et les saisies ; recherche par produit et par magasin ;
--  + membres du foyer : lien de parenté et e-mail (inviter un autre parent)
-- =====================================================================
set search_path = bforcompta, extensions, public;

alter table bforcompta.membres_foyer add column if not exists lien  text default 'autre' check (lien in ('moi','parent','enfant','grand_parent','autre'));
alter table bforcompta.membres_foyer add column if not exists email text;

-- clé de recherche : minuscules, sans accents, sans ponctuation
create or replace function bforcompta.cle(p text) returns text language sql immutable set search_path = '' as $$
  select trim(regexp_replace(translate(lower(coalesce(p, '')),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ', 'aaaaaaceeeeiiiinooooouuuuyyoa'), '[^a-z0-9]+', ' ', 'g'));
$$;

create table if not exists bforcompta.catalogue_magasins (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  ville      text,
  nom_cle    text not null,
  ville_cle  text not null default '',
  created_at timestamptz not null default now(),
  unique (nom_cle, ville_cle)
);
create table if not exists bforcompta.catalogue_produits (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  nom_cle    text not null unique,
  marque     text,
  rayon      text,
  unite      text,
  created_at timestamptz not null default now()
);
create table if not exists bforcompta.catalogue_prix (
  id           uuid primary key default gen_random_uuid(),
  produit_id   uuid not null references bforcompta.catalogue_produits(id) on delete cascade,
  magasin_id   uuid not null references bforcompta.catalogue_magasins(id) on delete cascade,
  prix         numeric(10,2) not null check (prix > 0 and prix < 10000),
  unite        text,
  date_releve  date not null default current_date,
  source       text not null default 'manuel' check (source in ('ticket','courses','manuel')),
  contributeur uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists idx_catprix_produit on bforcompta.catalogue_prix(produit_id, magasin_id, date_releve desc);
create index if not exists idx_catprod_cle on bforcompta.catalogue_produits(nom_cle);

-- Lecture pour tous les utilisateurs connectés ; écriture uniquement via enregistrer_prix (contrôles et normalisation)
alter table bforcompta.catalogue_magasins enable row level security;
alter table bforcompta.catalogue_produits enable row level security;
alter table bforcompta.catalogue_prix     enable row level security;
drop policy if exists lecture on bforcompta.catalogue_magasins; create policy lecture on bforcompta.catalogue_magasins for select to authenticated using (true);
drop policy if exists lecture on bforcompta.catalogue_produits; create policy lecture on bforcompta.catalogue_produits for select to authenticated using (true);
drop policy if exists lecture on bforcompta.catalogue_prix;     create policy lecture on bforcompta.catalogue_prix     for select to authenticated using (true);
revoke all on bforcompta.catalogue_magasins, bforcompta.catalogue_produits, bforcompta.catalogue_prix from authenticated;
grant select on bforcompta.catalogue_magasins, bforcompta.catalogue_produits to authenticated;
grant select (id, produit_id, magasin_id, prix, unite, date_releve, source, created_at) on bforcompta.catalogue_prix to authenticated;   -- le contributeur reste anonyme
grant all on bforcompta.catalogue_magasins, bforcompta.catalogue_produits, bforcompta.catalogue_prix to service_role;

-- Dernier prix connu de chaque produit dans chaque magasin (relevés des 180 derniers jours)
create or replace view bforcompta.v_prix_actuels with (security_invoker = true) as
  select distinct on (p.produit_id, p.magasin_id)
    p.produit_id, pr.nom as produit, pr.nom_cle, pr.marque, pr.rayon, coalesce(p.unite, pr.unite) as unite,
    p.magasin_id, m.nom as magasin, m.ville, m.nom_cle as magasin_cle, p.prix, p.date_releve,
    count(*) over (partition by p.produit_id, p.magasin_id) as nb_releves
  from bforcompta.catalogue_prix p
  join bforcompta.catalogue_produits pr on pr.id = p.produit_id
  join bforcompta.catalogue_magasins m on m.id = p.magasin_id
  where p.date_releve >= current_date - 180
  order by p.produit_id, p.magasin_id, p.date_releve desc, p.created_at desc;
grant select on bforcompta.v_prix_actuels to authenticated, service_role;

create or replace function bforcompta.enregistrer_prix(p_produit text, p_magasin text, p_prix numeric, p_ville text default null,
  p_unite text default null, p_marque text default null, p_rayon text default null, p_source text default 'manuel', p_date date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_mag uuid; v_prod uuid; v_id uuid; v_pc text := bforcompta.cle(p_produit); v_mc text := bforcompta.cle(p_magasin);
begin
  if auth.uid() is null or not bforcompta.peut_utiliser() then raise exception 'Accès refusé.'; end if;
  if length(v_pc) < 2 or length(v_mc) < 2 or p_prix is null or p_prix <= 0 or p_prix >= 10000 then return null; end if;
  if p_date > current_date + 1 or p_date < current_date - 400 then p_date := current_date; end if;
  insert into bforcompta.catalogue_magasins (nom, ville, nom_cle, ville_cle) values (trim(p_magasin), nullif(trim(p_ville), ''), v_mc, bforcompta.cle(p_ville))
    on conflict (nom_cle, ville_cle) do update set nom = bforcompta.catalogue_magasins.nom returning id into v_mag;
  insert into bforcompta.catalogue_produits (nom, nom_cle, marque, rayon, unite) values (left(trim(p_produit), 80), v_pc, p_marque, p_rayon, p_unite)
    on conflict (nom_cle) do update set marque = coalesce(bforcompta.catalogue_produits.marque, excluded.marque),
      rayon = coalesce(bforcompta.catalogue_produits.rayon, excluded.rayon), unite = coalesce(bforcompta.catalogue_produits.unite, excluded.unite) returning id into v_prod;
  select id into v_id from bforcompta.catalogue_prix where produit_id = v_prod and magasin_id = v_mag and date_releve = p_date and prix = round(p_prix, 2) and contributeur = auth.uid();
  if v_id is not null then return v_id; end if;
  insert into bforcompta.catalogue_prix (produit_id, magasin_id, prix, unite, date_releve, source)
    values (v_prod, v_mag, round(p_prix, 2), p_unite, p_date, case when p_source in ('ticket','courses','manuel') then p_source else 'manuel' end) returning id into v_id;
  return v_id;
end $$;

-- Recherche : par nom de produit et/ou par magasin ; « meilleur » = prix le plus bas pour ce produit
create or replace function bforcompta.chercher_prix(p_produit text default '', p_magasin text default '', p_limite int default 200)
returns table (produit_id uuid, produit text, marque text, unite text, magasin_id uuid, magasin text, ville text, prix numeric, date_releve date, nb_releves bigint, meilleur boolean, ecart numeric)
language sql stable set search_path = '' as $$
  with v as (select * from bforcompta.v_prix_actuels
             where (p_produit = '' or nom_cle like '%' || bforcompta.cle(p_produit) || '%')
               and (p_magasin = '' or magasin_cle like '%' || bforcompta.cle(p_magasin) || '%' or bforcompta.cle(ville) like '%' || bforcompta.cle(p_magasin) || '%')),
       mini as (select v.produit_id, min(v.prix) as pmin from bforcompta.v_prix_actuels v where v.produit_id in (select produit_id from v) group by v.produit_id)
  select v.produit_id, v.produit, v.marque, v.unite, v.magasin_id, v.magasin, v.ville, v.prix, v.date_releve, v.nb_releves,
         v.prix = mini.pmin, v.prix - mini.pmin
  from v join mini using (produit_id)
  order by v.produit, v.prix, v.magasin
  limit greatest(1, least(p_limite, 1000));
$$;
create or replace function bforcompta.catalogue_stats() returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('produits', (select count(*) from bforcompta.catalogue_produits), 'magasins', (select count(*) from bforcompta.catalogue_magasins),
    'releves', (select count(*) from bforcompta.catalogue_prix), 'releves_30j', (select count(*) from bforcompta.catalogue_prix where date_releve >= current_date - 30));
$$;
grant execute on function bforcompta.cle(text), bforcompta.enregistrer_prix(text, text, numeric, text, text, text, text, text, date),
  bforcompta.chercher_prix(text, text, int), bforcompta.catalogue_stats() to authenticated, service_role;

select 'ok' as catalogue_commun;
