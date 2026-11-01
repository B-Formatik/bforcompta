-- =====================================================================
--  B-ForCompt@ — Étape 1 : comptes bancaires reliés, e-mails liés, rapprochement
--  (schéma bforcompta, base B-Form@tik) — rejouable
-- =====================================================================
set search_path = bforcompta, extensions, public;

-- 1. Sources de synchronisation d'un compte (import de relevés aujourd'hui ; API demain)
--    Aucun secret ici : les clés d'API seront rangées dans les secrets Supabase (Edge Functions).
create table if not exists bforcompta.connexions_bancaires (
  id                uuid primary key default gen_random_uuid(),
  compte_id         uuid not null references bforcompta.comptes(id) on delete cascade,
  fournisseur       text not null check (fournisseur in ('import','qonto','agregateur','paypal','stripe')),
  libelle           text,
  identifiant_externe text,           -- IBAN masqué, n° de compte Qonto, ID marchand…
  statut            text not null default 'manuel' check (statut in ('manuel','a_configurer','actif','a_renouveler','erreur','desactive')),
  derniere_synchro  timestamptz,
  expire_le         timestamptz,      -- fin de l'autorisation DSP2 (agrégateur)
  message           text,
  created_at        timestamptz not null default now(),
  unique (compte_id, fournisseur)
);

-- 2. Mouvements bancaires importés ou synchronisés (montant signé : + crédit, − débit)
create table if not exists bforcompta.transactions_bancaires (
  id                 uuid primary key default gen_random_uuid(),
  compte_id          uuid not null references bforcompta.comptes(id) on delete cascade,
  source             text not null default 'import',
  date_operation     date not null,
  date_valeur        date,
  libelle_banque     text not null,
  montant            numeric(14,2) not null check (montant <> 0),
  devise             char(3) not null default 'EUR',
  contrepartie       text,             -- nom/IBAN de la contrepartie quand la banque le fournit
  reference_externe  text not null,    -- identifiant unique (FITID, id API, ou empreinte) : évite les doublons
  operation_id       uuid references bforcompta.operations(id) on delete set null,
  tiers_id           uuid references bforcompta.tiers(id) on delete set null,
  statut             text not null default 'a_traiter' check (statut in ('a_traiter','rapprochee','ignoree')),
  brut               jsonb,
  importe_le         timestamptz not null default now(),
  unique (compte_id, reference_externe)
);
create index if not exists idx_tb_compte_date on bforcompta.transactions_bancaires(compte_id, date_operation);
create index if not exists idx_tb_statut on bforcompta.transactions_bancaires(statut);

-- 3. Boîtes mail liées et e-mails de factures retrouvés
create table if not exists bforcompta.boites_mail (
  id              uuid primary key default gen_random_uuid(),
  adresse         text not null unique,
  type            text not null check (type in ('gmail','imap')),
  serveur_imap    text,                -- ex : ssl0.ovh.net (Zimbra OVH)
  structure_code  text not null default 'bformatik' references plateforme.structures(code) on update cascade,
  actif           boolean not null default true,
  statut          text not null default 'a_configurer' check (statut in ('a_configurer','actif','erreur','desactive')),
  derniere_lecture timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);

create table if not exists bforcompta.emails_recus (
  id              uuid primary key default gen_random_uuid(),
  boite_id        uuid references bforcompta.boites_mail(id) on delete set null,
  message_id      text not null unique,
  expediteur      text not null,
  expediteur_nom  text,
  objet           text,
  recu_le         timestamptz not null,
  montant_detecte numeric(14,2),
  reference_detectee text,
  tiers_id        uuid references bforcompta.tiers(id) on delete set null,
  document_id     uuid references bforcompta.documents(id) on delete set null,
  transaction_id  uuid references bforcompta.transactions_bancaires(id) on delete set null,
  operation_id    uuid references bforcompta.operations(id) on delete set null,
  statut          text not null default 'a_traiter' check (statut in ('a_traiter','rapproche','ignore')),
  created_at      timestamptz not null default now()
);
create index if not exists idx_er_recu on bforcompta.emails_recus(recu_le);

-- 4. Tiers : adresses e-mail et motifs de libellé bancaire (pour reconnaître la provenance)
alter table bforcompta.tiers add column if not exists emails text[] not null default '{}';
alter table bforcompta.tiers add column if not exists motifs_banque text[] not null default '{}';
alter table bforcompta.operations add column if not exists transaction_id uuid references bforcompta.transactions_bancaires(id) on delete set null;

-- 5. Reconnaissance de la provenance d'un libellé bancaire
create or replace function bforcompta.tiers_pour_libelle(p_libelle text)
returns uuid language sql stable security invoker set search_path = '' as $$
  select t.id from bforcompta.tiers t, unnest(t.motifs_banque || array[t.nom]) m
  where length(trim(m)) >= 3 and upper(p_libelle) like '%' || upper(trim(m)) || '%'
  order by length(m) desc limit 1;
$$;

-- 6. Rapprochement automatique
--    a) mouvement bancaire  <-> opération saisie (même compte, même montant, ±5 jours)
--    b) e-mail de facture   <-> mouvement bancaire (même montant, e-mail entre −10 et +45 jours)
--    Un rapprochement n'est fait que s'il n'y a qu'un seul candidat ; sinon il reste « à traiter ».
create or replace function bforcompta.rapprocher(p_compte uuid default null)
returns table (mouvements_rapproches int, emails_rapproches int, provenances_reconnues int)
language plpgsql security invoker set search_path = '' as $$
declare v_m int := 0; v_e int := 0; v_t int := 0; r record; cand uuid[];
begin
  -- provenance reconnue par motif
  update bforcompta.transactions_bancaires tb set tiers_id = bforcompta.tiers_pour_libelle(tb.libelle_banque)
   where tb.tiers_id is null and (p_compte is null or tb.compte_id = p_compte)
     and bforcompta.tiers_pour_libelle(tb.libelle_banque) is not null;
  get diagnostics v_t = row_count;

  for r in select * from bforcompta.transactions_bancaires
            where statut = 'a_traiter' and operation_id is null and (p_compte is null or compte_id = p_compte) loop
    select array_agg(o.id) into cand from bforcompta.operations o
     where o.compte_id = r.compte_id
       and o.montant = abs(r.montant)
       and o.type = case when r.montant > 0 then 'recette'::bforcompta.type_operation else 'depense'::bforcompta.type_operation end
       and o.date_operation between r.date_operation - 5 and r.date_operation + 5
       and o.transaction_id is null
       and not exists (select 1 from bforcompta.transactions_bancaires x where x.operation_id = o.id);
    if array_length(cand, 1) = 1 then
      update bforcompta.transactions_bancaires set operation_id = cand[1], statut = 'rapprochee' where id = r.id;
      update bforcompta.operations set transaction_id = r.id, statut = 'rapprochee' where id = cand[1];
      v_m := v_m + 1;
    end if;
  end loop;

  for r in select * from bforcompta.emails_recus where statut = 'a_traiter' and transaction_id is null and montant_detecte is not null loop
    select array_agg(tb.id) into cand from bforcompta.transactions_bancaires tb
     where abs(tb.montant) = r.montant_detecte
       and tb.date_operation between (r.recu_le::date - 10) and (r.recu_le::date + 45)
       and (r.tiers_id is null or tb.tiers_id is null or tb.tiers_id = r.tiers_id)
       and not exists (select 1 from bforcompta.emails_recus e where e.transaction_id = tb.id);
    if array_length(cand, 1) = 1 then
      update bforcompta.emails_recus e set transaction_id = cand[1], statut = 'rapproche',
             operation_id = (select operation_id from bforcompta.transactions_bancaires where id = cand[1])
       where e.id = r.id;
      v_e := v_e + 1;
    end if;
  end loop;
  return query select v_m, v_e, v_t;
end $$;

-- e-mail reçu : provenance reconnue par l'adresse de l'expéditeur
create or replace function bforcompta.emails_tiers_auto()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.tiers_id is null then
    select t.id into new.tiers_id from bforcompta.tiers t
     where lower(new.expediteur) = any (select lower(x) from unnest(t.emails) x)
        or split_part(lower(new.expediteur), '@', 2) = any (select lower(ltrim(x, '@')) from unnest(t.emails) x where x like '@%')
     limit 1;
  end if;
  return new;
end $$;
drop trigger if exists trg_emails_tiers on bforcompta.emails_recus;
create trigger trg_emails_tiers before insert or update of expediteur on bforcompta.emails_recus
  for each row execute function bforcompta.emails_tiers_auto();

-- 7. Vue de pointage par compte
create or replace view bforcompta.v_pointage with (security_invoker = true) as
  select c.id as compte_id, c.nom,
         count(tb.*) filter (where tb.statut = 'a_traiter') as a_traiter,
         count(tb.*) filter (where tb.statut = 'rapprochee') as rapprochees,
         max(tb.date_operation) as dernier_mouvement,
         (select max(derniere_synchro) from bforcompta.connexions_bancaires cb where cb.compte_id = c.id) as derniere_synchro
  from bforcompta.comptes c left join bforcompta.transactions_bancaires tb on tb.compte_id = c.id
  group by c.id;

-- 8. Sécurité
do $$
declare t text;
begin
  foreach t in array array['connexions_bancaires','transactions_bancaires','boites_mail','emails_recus'] loop
    execute format('alter table bforcompta.%I enable row level security', t);
    execute format('drop policy if exists "acces_authentifie" on bforcompta.%I', t);
    execute format('create policy "acces_authentifie" on bforcompta.%I for all to authenticated using (plateforme.a_acces(''bforcompta'')) with check (plateforme.a_acces(''bforcompta''))', t);
  end loop;
end $$;
grant all on all tables in schema bforcompta to authenticated, service_role;
grant execute on all functions in schema bforcompta to authenticated, service_role;

-- 9. Boîtes mail déclarées (lecture branchée à l'étape 2)
insert into bforcompta.boites_mail (adresse, type, serveur_imap, notes) values
  ('contact@b-formatik.fr', 'imap', 'ssl0.ovh.net', 'Zimbra OVH'),
  ('bformatik@gmail.com', 'gmail', null, 'OVH, Odoo, Brevo, Stripe, clients clim'),
  ('jbsbourgeois@gmail.com', 'gmail', null, null),
  ('bourgeoisjhonny@gmail.com', 'gmail', null, null),
  ('jhonnybourgeois@gmail.com', 'gmail', null, null),
  ('behelpers971@gmail.com', 'gmail', null, null)
on conflict (adresse) do nothing;

select 'ok' as etape1_banque_rapprochement;
