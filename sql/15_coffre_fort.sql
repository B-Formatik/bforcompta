-- =====================================================================
--  B-S@fe — Coffre-fort (3 sécurités : code e-mail de 5 min + visage + phrase secrète)
--  Tout est chiffré DANS LE TÉLÉPHONE (AES-256-GCM, clé tirée de la phrase secrète par PBKDF2-SHA256 600 000 tours).
--  La base ne contient que du texte chiffré illisible : ni Supabase, ni B-Form@tik, ni Claude ne peuvent lire les codes.
--  Phrase perdue = contenu irrécupérable (c'est le prix de cette sécurité).
--  Contrôle côté serveur : les données du coffre ne sont lisibles qu'avec un code e-mail validé il y a moins de 15 minutes.
-- =====================================================================
set search_path = bforcompta, extensions, public;

create table if not exists bforcompta.coffre_parametres (
  proprietaire uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  sel text not null,                 -- sel aléatoire (base64) pour dériver la clé
  iterations int not null default 600000,
  verificateur text not null,        -- texte connu chiffré : permet de savoir si la phrase est juste, sans la stocker
  echecs int not null default 0,
  bloque boolean not null default false,
  cree timestamptz not null default now(),
  maj timestamptz not null default now()
);
create table if not exists bforcompta.coffre_entrees (
  id uuid primary key default gen_random_uuid(),
  proprietaire uuid not null references auth.users(id) on delete cascade default auth.uid(),
  donnees text not null,             -- JSON chiffré (catégorie, titre, identifiant, code, notes) : rien en clair
  cree timestamptz not null default now(),
  maj timestamptz not null default now()
);
create index if not exists idx_coffre_proprio on bforcompta.coffre_entrees(proprietaire);

-- Code e-mail validé récemment (champ « amr » du jeton de connexion Supabase)
create or replace function bforcompta.code_recent(p_minutes int default 15) returns boolean language sql stable set search_path = '' as $$
  select coalesce((select bool_or((a->>'method') in ('otp', 'magiclink', 'email/signup', 'email_change') and (a->>'timestamp')::bigint > extract(epoch from now())::bigint - p_minutes * 60)
                   from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) a), false);
$$;
create or replace function bforcompta.coffre_accessible() returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and bforcompta.code_recent(15) and not bforcompta.est_bloque()
     and not coalesce((select p.bloque from bforcompta.coffre_parametres p where p.proprietaire = auth.uid()), false);
$$;

alter table bforcompta.coffre_parametres enable row level security;
alter table bforcompta.coffre_entrees enable row level security;
drop policy if exists coffre_param_proprio on bforcompta.coffre_parametres;
create policy coffre_param_proprio on bforcompta.coffre_parametres for select to authenticated using (proprietaire = auth.uid() and bforcompta.coffre_accessible());
drop policy if exists coffre_param_creer on bforcompta.coffre_parametres;
create policy coffre_param_creer on bforcompta.coffre_parametres for insert to authenticated with check (proprietaire = auth.uid() and bforcompta.coffre_accessible());
drop policy if exists coffre_entrees_proprio on bforcompta.coffre_entrees;
create policy coffre_entrees_proprio on bforcompta.coffre_entrees for all to authenticated
  using (proprietaire = auth.uid() and bforcompta.coffre_accessible()) with check (proprietaire = auth.uid() and bforcompta.coffre_accessible());
grant select, insert on bforcompta.coffre_parametres to authenticated;
grant select, insert, update, delete on bforcompta.coffre_entrees to authenticated;

-- État du coffre (sans rien révéler du contenu)
create or replace function bforcompta.coffre_etat() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p bforcompta.coffre_parametres;
begin
  select * into p from bforcompta.coffre_parametres where proprietaire = auth.uid();
  return jsonb_build_object('existe', p.proprietaire is not null, 'bloque', coalesce(p.bloque, false), 'echecs', coalesce(p.echecs, 0),
                            'restant', greatest(0, 5 - coalesce(p.echecs, 0)), 'code_recent', bforcompta.code_recent(15));
end $$;

-- Résultat de la saisie de la phrase secrète : 5 erreurs = coffre bloqué, administrateurs prévenus
create or replace function bforcompta.coffre_phrase(p_ok boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p bforcompta.coffre_parametres; u text;
begin
  if not bforcompta.code_recent(15) then raise exception 'Code e-mail expiré : redemandez un code.'; end if;
  select * into p from bforcompta.coffre_parametres where proprietaire = auth.uid();
  if p.proprietaire is null or p.bloque then return bforcompta.coffre_etat(); end if;
  if p_ok then update bforcompta.coffre_parametres set echecs = 0, maj = now() where proprietaire = auth.uid();
  else
    update bforcompta.coffre_parametres set echecs = echecs + 1, bloque = (echecs + 1 >= 5), maj = now() where proprietaire = auth.uid() returning * into p;
    if p.bloque then
      select email into u from auth.users where id = auth.uid();
      perform bforcompta.prevenir_admins_visage(auth.uid(), 'Coffre-fort bloqué : ' || u,
        '5 phrases secrètes fausses le ' || to_char(now(), 'DD/MM à HH24:MI') || '. Vérifiez auprès de la personne, puis Paramètres → Utilisateurs → « Débloquer le coffre ».',
        'coffre:' || auth.uid() || ':' || extract(epoch from now())::bigint);
    end if;
  end if;
  return bforcompta.coffre_etat();
end $$;

-- Administration : débloquer un coffre (l'administrateur ne voit jamais le contenu)
create or replace function bforcompta.admin_coffre_debloquer(p_user uuid) returns text language plpgsql security definer set search_path = '' as $$
begin
  if not bforcompta.est_admin_bsafe() then raise exception 'Réservé aux administrateurs.'; end if;
  update bforcompta.coffre_parametres set bloque = false, echecs = 0, maj = now() where proprietaire = p_user;
  return 'ok';
end $$;
create or replace function bforcompta.admin_coffres() returns table (user_id uuid, bloque boolean, echecs int) language plpgsql stable security definer set search_path = '' as $$
begin
  if not bforcompta.est_admin_bsafe() then raise exception 'Réservé aux administrateurs.'; end if;
  return query select p.proprietaire, p.bloque, p.echecs from bforcompta.coffre_parametres p;
end $$;

grant execute on function bforcompta.code_recent(int), bforcompta.coffre_accessible(), bforcompta.coffre_etat(), bforcompta.coffre_phrase(boolean),
  bforcompta.admin_coffre_debloquer(uuid), bforcompta.admin_coffres() to authenticated;

select 'ok' as coffre_fort;
