-- =====================================================================
--  B-S@fe — Connexion par code e-mail (5 min) + reconnaissance du visage
--  L'empreinte du visage reste SUR LE TÉLÉPHONE (jamais en base) : ici on ne garde que l'état
--  (visage enregistré ou non, échecs, blocage). Après 3 échecs ou sur un nouvel appareil,
--  le compte est bloqué et seul un administrateur peut le débloquer.
-- =====================================================================
set search_path = bforcompta, extensions, public;

create table if not exists bforcompta.securite_visage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enregistre boolean not null default false,
  enregistre_le timestamptz,
  echecs int not null default 0,
  bloque boolean not null default false,
  motif text,                                   -- echecs | nouvel_appareil
  bloque_le timestamptz,
  reenregistrement_autorise boolean not null default false,
  derniere_reussite timestamptz,
  maj timestamptz not null default now()
);
alter table bforcompta.securite_visage enable row level security;
drop policy if exists securite_visage_lecture on bforcompta.securite_visage;
create policy securite_visage_lecture on bforcompta.securite_visage for select to authenticated
  using (user_id = auth.uid() or bforcompta.est_admin_bsafe());
-- aucune écriture directe : tout passe par les fonctions ci-dessous

create or replace function bforcompta.est_bloque() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.bloque from bforcompta.securite_visage s where s.user_id = auth.uid()), false);
$$;

-- Un compte bloqué ne voit plus aucune donnée (contrôle côté serveur, en plus de l'écran de l'appli)
create or replace function bforcompta.peut_utiliser()
returns boolean language sql stable security definer set search_path = '' as $$
  select not bforcompta.est_bloque() and (
         bforcompta.acces_pro()
      or exists (select 1 from bforcompta.comptes_membres m where m.user_id = auth.uid())
      or exists (select 1 from bforcompta.comptes c where c.proprietaire = auth.uid() and c.nature <> 'professionnel')
      or exists (select 1 from plateforme.acces a where a.user_id = auth.uid() and a.structure_code = 'bforcompta'));
$$;

create or replace function bforcompta.prevenir_admins_visage(p_user uuid, p_titre text, p_message text, p_cle text) returns void
language plpgsql security definer set search_path = '' as $$
declare adm record;
begin
  for adm in select distinct a.user_id from plateforme.acces a where a.role = 'admin' and a.structure_code in ('bformatik', 'bforcompta') loop
    insert into bforcompta.alertes (type, niveau, titre, message, cle, proprietaire)
    values ('compte_bloque', 'attention', p_titre, p_message, p_cle, adm.user_id)
    on conflict (proprietaire, cle) do nothing;
  end loop;
end $$;

-- État pour l'utilisateur connecté
create or replace function bforcompta.etat_visage() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s bforcompta.securite_visage;
begin
  if auth.uid() is null then return null; end if;
  insert into bforcompta.securite_visage (user_id) values (auth.uid()) on conflict do nothing;
  select * into s from bforcompta.securite_visage where user_id = auth.uid();
  return jsonb_build_object('enregistre', s.enregistre, 'bloque', s.bloque, 'motif', s.motif, 'echecs', s.echecs,
                            'restant', greatest(0, 3 - s.echecs), 'reenregistrement', s.reenregistrement_autorise);
end $$;

-- Le visage vient d'être enregistré sur l'appareil (1re connexion, ou réenregistrement autorisé par l'admin)
create or replace function bforcompta.visage_enregistre() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s bforcompta.securite_visage;
begin
  select * into s from bforcompta.securite_visage where user_id = auth.uid();
  if s.bloque then raise exception 'Compte bloqué : un administrateur doit le débloquer.'; end if;
  if s.enregistre and not s.reenregistrement_autorise then raise exception 'Un visage est déjà enregistré pour ce compte.'; end if;
  update bforcompta.securite_visage set enregistre = true, enregistre_le = now(), echecs = 0, reenregistrement_autorise = false,
         derniere_reussite = now(), maj = now() where user_id = auth.uid();
  return bforcompta.etat_visage();
end $$;

-- Résultat d'une vérification du visage
create or replace function bforcompta.visage_resultat(p_ok boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s bforcompta.securite_visage; u text;
begin
  select * into s from bforcompta.securite_visage where user_id = auth.uid();
  if s.bloque then return bforcompta.etat_visage(); end if;
  if p_ok then
    update bforcompta.securite_visage set echecs = 0, derniere_reussite = now(), maj = now() where user_id = auth.uid();
  else
    update bforcompta.securite_visage set echecs = echecs + 1, maj = now() where user_id = auth.uid() returning * into s;
    if s.echecs >= 3 then
      update bforcompta.securite_visage set bloque = true, motif = 'echecs', bloque_le = now() where user_id = auth.uid();
      select email into u from auth.users where id = auth.uid();
      perform bforcompta.prevenir_admins_visage(auth.uid(), 'Compte bloqué : ' || u,
        '3 échecs de reconnaissance du visage le ' || to_char(now(), 'DD/MM à HH24:MI') || '. Vérifiez auprès de la personne, puis Paramètres → Utilisateurs pour débloquer.',
        'visage:' || auth.uid() || ':' || extract(epoch from now())::bigint);
    end if;
  end if;
  return bforcompta.etat_visage();
end $$;

-- Connexion depuis un appareil qui ne connaît pas le visage (nouveau téléphone, appli réinstallée…)
create or replace function bforcompta.visage_nouvel_appareil() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u text;
begin
  update bforcompta.securite_visage set bloque = true, motif = 'nouvel_appareil', bloque_le = now(), maj = now()
   where user_id = auth.uid() and enregistre and not reenregistrement_autorise and not bloque;
  if found then
    select email into u from auth.users where id = auth.uid();
    perform bforcompta.prevenir_admins_visage(auth.uid(), 'Nouvel appareil : ' || u,
      'Connexion depuis un appareil où le visage n''est pas enregistré (' || to_char(now(), 'DD/MM à HH24:MI') || '). Si c''est bien la personne, Paramètres → Utilisateurs → « Nouveau visage ».',
      'visage-app:' || auth.uid() || ':' || extract(epoch from now())::bigint);
  end if;
  return bforcompta.etat_visage();
end $$;

-- Administration
create or replace function bforcompta.admin_visages()
returns table (user_id uuid, enregistre boolean, bloque boolean, motif text, echecs int, bloque_le timestamptz, reenregistrement boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not bforcompta.est_admin_bsafe() then raise exception 'Réservé aux administrateurs.'; end if;
  return query select s.user_id, s.enregistre, s.bloque, s.motif, s.echecs, s.bloque_le, s.reenregistrement_autorise from bforcompta.securite_visage s;
end $$;
create or replace function bforcompta.admin_visage(p_user uuid, p_action text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not bforcompta.est_admin_bsafe() then raise exception 'Réservé aux administrateurs.'; end if;
  insert into bforcompta.securite_visage (user_id) values (p_user) on conflict do nothing;
  if p_action = 'debloquer' then
    update bforcompta.securite_visage set bloque = false, motif = null, echecs = 0, maj = now() where user_id = p_user;
  elsif p_action = 'reenregistrer' then
    update bforcompta.securite_visage set bloque = false, motif = null, echecs = 0, reenregistrement_autorise = true, maj = now() where user_id = p_user;
  else raise exception 'Action inconnue : %', p_action; end if;
  return 'ok';
end $$;

grant select on bforcompta.securite_visage to authenticated;
grant execute on function bforcompta.est_bloque(), bforcompta.etat_visage(), bforcompta.visage_enregistre(), bforcompta.visage_resultat(boolean),
  bforcompta.visage_nouvel_appareil(), bforcompta.admin_visages(), bforcompta.admin_visage(uuid, text) to authenticated;
revoke execute on function bforcompta.prevenir_admins_visage(uuid, text, text, text) from public, anon, authenticated;

select 'ok' as connexion_visage;
