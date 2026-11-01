-- =====================================================================
--  B-ForCompt@ — comptes professionnels, personnels et joints (plusieurs titulaires)
--  Règles :
--   * compte professionnel : visible des comptes ayant un accès « pro » à B-ForCompt@
--     (rôles admin, super_utilisateur, utilisateur, lecture sur bforcompta ou bformatik)
--   * compte personnel / joint : visible UNIQUEMENT de son créateur et de ses titulaires
--     (même un administrateur ne voit pas le compte personnel d'un autre utilisateur)
--   * une personne sans accès pro (rôle « client ») peut utiliser l'appli pour ses comptes perso/joints
-- =====================================================================
set search_path = bforcompta, extensions, public;

alter table bforcompta.comptes add column if not exists nature text not null default 'professionnel';
alter table bforcompta.comptes drop constraint if exists comptes_nature_check;
alter table bforcompta.comptes add constraint comptes_nature_check check (nature in ('professionnel','personnel','joint'));
alter table bforcompta.comptes add column if not exists proprietaire uuid references auth.users(id) on delete set null default auth.uid();
alter table bforcompta.comptes drop constraint if exists comptes_nom_key;          -- deux personnes peuvent avoir un « Compte courant »
create unique index if not exists comptes_nom_pro_uq on bforcompta.comptes(nom) where nature = 'professionnel';

create table if not exists bforcompta.comptes_membres (
  compte_id  uuid not null references bforcompta.comptes(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'co_titulaire' check (role in ('titulaire','co_titulaire')),
  ajoute_le  timestamptz not null default now(),
  primary key (compte_id, user_id)
);

-- Accès « pro » (exclut le rôle client)
create or replace function bforcompta.acces_pro()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from plateforme.acces a where a.user_id = auth.uid()
                 and a.structure_code in ('bforcompta','bformatik') and a.role <> 'client');
$$;
-- Peut utiliser l'appli : accès pro, ou titulaire d'au moins un compte, ou inscrit via B-ForCompt@
create or replace function bforcompta.peut_utiliser()
returns boolean language sql stable security definer set search_path = '' as $$
  select bforcompta.acces_pro()
      or exists (select 1 from bforcompta.comptes_membres m where m.user_id = auth.uid())
      or exists (select 1 from bforcompta.comptes c where c.proprietaire = auth.uid() and c.nature <> 'professionnel')
      or exists (select 1 from plateforme.acces a where a.user_id = auth.uid() and a.structure_code = 'bforcompta');
$$;
create or replace function bforcompta.peut_voir_compte(p_compte uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from bforcompta.comptes c where c.id = p_compte and (
           (c.nature = 'professionnel' and bforcompta.acces_pro())
        or (c.nature <> 'professionnel' and (c.proprietaire = auth.uid()
             or exists (select 1 from bforcompta.comptes_membres m where m.compte_id = c.id and m.user_id = auth.uid())))));
$$;

-- Le créateur d'un compte perso/joint en devient titulaire
create or replace function bforcompta.comptes_titulaire_auto()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.nature <> 'professionnel' and new.proprietaire is not null then
    insert into bforcompta.comptes_membres (compte_id, user_id, role) values (new.id, new.proprietaire, 'titulaire') on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_comptes_titulaire on bforcompta.comptes;
create trigger trg_comptes_titulaire after insert or update of nature on bforcompta.comptes
  for each row execute function bforcompta.comptes_titulaire_auto();

-- Ajouter / retirer / lister les titulaires d'un compte (par adresse e-mail)
create or replace function bforcompta.ajouter_titulaire(p_compte uuid, p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_nature text;
begin
  select nature into v_nature from bforcompta.comptes where id = p_compte;
  if v_nature is null or not bforcompta.peut_voir_compte(p_compte) then raise exception 'Compte introuvable.'; end if;
  if v_nature = 'professionnel' then raise exception 'Les comptes professionnels sont partagés par les droits B-Form@tik : passez le compte en « joint » pour ajouter un titulaire.'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'Aucun compte B-ForCompt@ pour %. La personne doit d''abord créer son compte (bouton « Créer un compte » à la connexion).', p_email; end if;
  insert into bforcompta.comptes_membres (compte_id, user_id, role) values (p_compte, v_user, 'co_titulaire') on conflict do nothing;
  update bforcompta.comptes set nature = 'joint' where id = p_compte and nature = 'personnel';
  return 'ok';
end $$;
create or replace function bforcompta.retirer_titulaire(p_compte uuid, p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not bforcompta.peut_voir_compte(p_compte) then raise exception 'Compte introuvable.'; end if;
  if (select count(*) from bforcompta.comptes_membres where compte_id = p_compte) <= 1 then raise exception 'Un compte doit garder au moins un titulaire.'; end if;
  delete from bforcompta.comptes_membres where compte_id = p_compte and user_id = p_user;
  return 'ok';
end $$;
create or replace function bforcompta.titulaires(p_compte uuid)
returns table (user_id uuid, email text, role text) language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role from bforcompta.comptes_membres m join auth.users u on u.id = m.user_id
  where m.compte_id = p_compte and bforcompta.peut_voir_compte(p_compte) order by m.role desc, u.email;
$$;

-- Propriétaires affichés (agenda) : « B-Form@tik » pour les comptes pro, titulaires pour les comptes perso/joints
create or replace function bforcompta.proprietaires_comptes()
returns table (compte_id uuid, proprietaires text) language sql stable security definer set search_path = '' as $$
  select c.id, case when c.nature = 'professionnel' then 'B-Form@tik'
           else coalesce((select string_agg(coalesce(nullif(u.raw_user_meta_data->>'nom_complet', ''), split_part(u.email::text, '@', 1)), ' & ' order by m.role desc, u.email)
                          from bforcompta.comptes_membres m join auth.users u on u.id = m.user_id where m.compte_id = c.id), '—') end
  from bforcompta.comptes c where bforcompta.peut_voir_compte(c.id);
$$;

-- ------------------------------------------------------------ règles d'accès (RLS)
alter table bforcompta.comptes_membres enable row level security;
do $$ declare t text; p record;
begin
  foreach t in array array['comptes','operations','virements','documents','transactions_bancaires','connexions_bancaires',
                           'categories','tiers','bibliotheque_images','budgets','boites_mail','emails_recus','comptes_membres'] loop
    for p in select policyname from pg_policies where schemaname = 'bforcompta' and tablename = t loop
      execute format('drop policy %I on bforcompta.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

create policy comptes_lecture on bforcompta.comptes for select to authenticated using (bforcompta.peut_voir_compte(id) or proprietaire = auth.uid());
create policy comptes_creation on bforcompta.comptes for insert to authenticated
  with check (bforcompta.peut_utiliser() and ((nature = 'professionnel' and bforcompta.acces_pro()) or (nature <> 'professionnel' and proprietaire = auth.uid())));
create policy comptes_modif on bforcompta.comptes for update to authenticated using (bforcompta.peut_voir_compte(id))
  with check ((nature = 'professionnel' and bforcompta.acces_pro()) or (nature <> 'professionnel' and bforcompta.peut_voir_compte(id)));
create policy comptes_suppr on bforcompta.comptes for delete to authenticated using (bforcompta.peut_voir_compte(id));

create policy membres_lecture on bforcompta.comptes_membres for select to authenticated using (bforcompta.peut_voir_compte(compte_id));

create policy operations_acces on bforcompta.operations for all to authenticated
  using (bforcompta.peut_voir_compte(compte_id)) with check (bforcompta.peut_voir_compte(compte_id));
create policy virements_acces on bforcompta.virements for all to authenticated
  using (bforcompta.peut_voir_compte(compte_source_id) and bforcompta.peut_voir_compte(compte_destination_id))
  with check (bforcompta.peut_voir_compte(compte_source_id) and bforcompta.peut_voir_compte(compte_destination_id));
create policy transactions_acces on bforcompta.transactions_bancaires for all to authenticated
  using (bforcompta.peut_voir_compte(compte_id)) with check (bforcompta.peut_voir_compte(compte_id));
create policy connexions_acces on bforcompta.connexions_bancaires for all to authenticated
  using (bforcompta.peut_voir_compte(compte_id)) with check (bforcompta.peut_voir_compte(compte_id));
create policy documents_acces on bforcompta.documents for all to authenticated
  using (case when compte_id is not null then bforcompta.peut_voir_compte(compte_id)
              when operation_id is not null then exists (select 1 from bforcompta.operations o where o.id = operation_id)
              else bforcompta.acces_pro() end)
  with check (case when compte_id is not null then bforcompta.peut_voir_compte(compte_id) else bforcompta.peut_utiliser() end);
-- bibliothèques partagées (catégories, provenances, images) : tous les utilisateurs de l'appli
create policy categories_acces on bforcompta.categories for all to authenticated using (bforcompta.peut_utiliser()) with check (bforcompta.peut_utiliser());
create policy tiers_acces on bforcompta.tiers for all to authenticated using (bforcompta.peut_utiliser()) with check (bforcompta.peut_utiliser());
create policy images_acces on bforcompta.bibliotheque_images for all to authenticated using (bforcompta.peut_utiliser()) with check (bforcompta.peut_utiliser());
-- données de l'entreprise : accès pro uniquement
create policy budgets_acces on bforcompta.budgets for all to authenticated using (bforcompta.acces_pro()) with check (bforcompta.acces_pro());
create policy boites_acces on bforcompta.boites_mail for all to authenticated using (bforcompta.acces_pro()) with check (bforcompta.acces_pro());
create policy emails_acces on bforcompta.emails_recus for all to authenticated using (bforcompta.acces_pro()) with check (bforcompta.acces_pro());

-- Stockage : justificatifs et images accessibles aux utilisateurs de l'appli
drop policy if exists "bforcompta_storage_select" on storage.objects;
drop policy if exists "bforcompta_storage_insert" on storage.objects;
drop policy if exists "bforcompta_storage_update" on storage.objects;
drop policy if exists "bforcompta_storage_delete" on storage.objects;
create policy "bforcompta_storage_select" on storage.objects for select to authenticated using (bucket_id in ('bforcompta-documents','bforcompta-images') and bforcompta.peut_utiliser());
create policy "bforcompta_storage_insert" on storage.objects for insert to authenticated with check (bucket_id in ('bforcompta-documents','bforcompta-images') and bforcompta.peut_utiliser());
create policy "bforcompta_storage_update" on storage.objects for update to authenticated using (bucket_id in ('bforcompta-documents','bforcompta-images') and bforcompta.peut_utiliser());
create policy "bforcompta_storage_delete" on storage.objects for delete to authenticated using (bucket_id in ('bforcompta-documents','bforcompta-images') and bforcompta.peut_utiliser());

grant all on bforcompta.comptes_membres to authenticated, service_role;
grant execute on all functions in schema bforcompta to authenticated, service_role;

select 'ok' as comptes_perso_joints;
