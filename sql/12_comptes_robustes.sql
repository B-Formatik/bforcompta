-- =====================================================================
--  B-S@fe — Comptes robustes : quel que soit le type d'adresse ou la façon dont le compte a été créé,
--  l'utilisateur obtient son accès ; l'admin voit et débloque les comptes en attente ; surveillance automatique.
-- =====================================================================
set search_path = bforcompta, extensions, public;

-- 1. Accès automatique à B-S@fe pour tout compte connecté (inscription par l'appli, invitation, lien magique, futur Google/Apple…)
create or replace function bforcompta.rejoindre_bsafe() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  insert into plateforme.acces (user_id, structure_code, role) values (auth.uid(), 'bforcompta', 'client') on conflict do nothing;
  insert into bforcompta.profils (id, nom_complet)
    select u.id, coalesce(u.raw_user_meta_data->>'nom_complet', u.email) from auth.users u where u.id = auth.uid()
    on conflict (id) do nothing;
  return true;
end $$;

-- 2. Administration des comptes (réservée aux administrateurs B-Form@tik / B-S@fe)
create or replace function bforcompta.est_admin_bsafe() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from plateforme.acces a where a.user_id = auth.uid() and a.role = 'admin' and a.structure_code in ('bformatik', 'bforcompta'));
$$;
create or replace function bforcompta.admin_utilisateurs()
returns table (id uuid, email text, nom text, cree timestamptz, confirme timestamptz, derniere_connexion timestamptz, acces text, etat text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not bforcompta.est_admin_bsafe() then raise exception 'Réservé aux administrateurs.'; end if;
  return query
    select u.id, u.email::text, coalesce(u.raw_user_meta_data->>'nom_complet', '')::text, u.created_at, u.email_confirmed_at, u.last_sign_in_at,
      coalesce((select string_agg(a.structure_code || ' : ' || a.role, ', ' order by a.structure_code) from plateforme.acces a where a.user_id = u.id), '')::text,
      case when u.email_confirmed_at is null then 'en_attente'
           when not exists (select 1 from plateforme.acces a where a.user_id = u.id and a.structure_code in ('bforcompta', 'bformatik')) then 'sans_acces'
           when u.last_sign_in_at is null then 'jamais_connecte'
           else 'actif' end
    from auth.users u order by u.created_at desc;
end $$;
create or replace function bforcompta.admin_confirmer(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not bforcompta.est_admin_bsafe() then raise exception 'Réservé aux administrateurs.'; end if;
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = p_user;
  insert into plateforme.acces (user_id, structure_code, role) values (p_user, 'bforcompta', 'client') on conflict do nothing;
  return 'ok';
end $$;

-- 3. Surveillance : alerte les administrateurs quand un compte reste bloqué (e-mail non confirmé depuis plus d'une heure, ou sans accès)
create or replace function bforcompta.surveiller_comptes() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record; adm record;
begin
  for r in select u.id, u.email, u.created_at, u.email_confirmed_at from auth.users u
           where (u.email_confirmed_at is null and u.created_at < now() - interval '1 hour' and u.created_at > now() - interval '14 days')
              or (u.email_confirmed_at is not null and not exists (select 1 from plateforme.acces a where a.user_id = u.id)) loop
    for adm in select distinct a.user_id from plateforme.acces a where a.role = 'admin' and a.structure_code in ('bformatik', 'bforcompta') loop
      insert into bforcompta.alertes (type, niveau, titre, message, cle, proprietaire)
      values ('compte_bloque', 'attention',
              case when r.email_confirmed_at is null then 'Compte en attente : ' || r.email else 'Compte sans accès : ' || r.email end,
              case when r.email_confirmed_at is null
                   then 'Créé le ' || to_char(r.created_at, 'DD/MM à HH24:MI') || ', e-mail de confirmation jamais validé (non reçu ?). Ouvrez Paramètres → Utilisateurs pour renvoyer l''e-mail ou confirmer le compte.'
                   else 'Le compte n''a accès à aucune application B-Form@tik. Il l''obtiendra à sa prochaine connexion, ou ouvrez Paramètres → Utilisateurs.' end,
              'compte:' || r.id || ':' || (r.email_confirmed_at is null)::text, adm.user_id)
      on conflict (proprietaire, cle) do nothing;
      if found then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;

grant execute on function bforcompta.rejoindre_bsafe(), bforcompta.est_admin_bsafe(), bforcompta.admin_utilisateurs(), bforcompta.admin_confirmer(uuid) to authenticated;
revoke execute on function bforcompta.surveiller_comptes() from public, anon, authenticated;
grant execute on function bforcompta.surveiller_comptes() to service_role;

-- 4. Rattrapage : tout compte confirmé sans aucun accès reçoit l'accès B-S@fe
insert into plateforme.acces (user_id, structure_code, role)
select u.id, 'bforcompta', 'client' from auth.users u
where u.email_confirmed_at is not null and not exists (select 1 from plateforme.acces a where a.user_id = u.id)
on conflict do nothing;

-- 5. Surveillance toutes les heures (si l'extension pg_cron est disponible)
do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'bsafe-surveiller-comptes';
  perform cron.schedule('bsafe-surveiller-comptes', '17 * * * *', 'select bforcompta.surveiller_comptes()');
exception when others then raise notice 'pg_cron indisponible : surveillance à lancer à la main (%).', sqlerrm;
end $$;

select 'ok' as comptes_robustes, bforcompta.surveiller_comptes() as alertes_creees;
