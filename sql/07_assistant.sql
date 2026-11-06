-- =====================================================================
--  B-ForCompt@ — Assistant de vie : espaces de vie, échéancier des factures,
--  reste à vivre, vigilance (alertes), épargne & investissement, documents par espace
-- =====================================================================
set search_path = bforcompta, extensions, public;

-- Nouveaux types (ajoutés hors usage dans ce script)
alter type bforcompta.type_compte add value if not exists 'placement';
alter type bforcompta.type_document add value if not exists 'garantie';
alter type bforcompta.type_document add value if not exists 'assurance';
alter type bforcompta.type_document add value if not exists 'bulletin';
alter type bforcompta.type_document add value if not exists 'sante';
alter type bforcompta.type_document add value if not exists 'administratif';
alter type bforcompta.type_document add value if not exists 'vehicule';

-- ---------------------------------------------------------------- Espaces de vie
create table if not exists bforcompta.espaces (
  code        text primary key,
  nom         text not null,
  icone       text not null default '📁',
  couleur     text not null default '#2467b6',
  ordre       int  not null default 100,
  description text,
  actif       boolean not null default true
);
insert into bforcompta.espaces (code, nom, icone, couleur, ordre, description) values
  ('quotidien',     'Quotidien',               '🏠', '#2467b6', 10, 'Agenda, rendez-vous, appels, courses, vie de tous les jours'),
  ('travail',       'Travail',                 '💼', '#0f2a4a', 20, 'Structures B-Form@tik, missions, notes de frais'),
  ('foyer',         'Foyer',                   '👨‍👩‍👧', '#db2777', 30, 'Famille, partage du couple, budget commun'),
  ('enfants',       'Enfants & éducation',     '🎒', '#7c3aed', 40, 'École, devoirs, activités, cantine, garde'),
  ('vehicules',     'Véhicules',               '🚗', '#0891b2', 50, 'Entretien, contrôle technique, assurance, carburant'),
  ('maison',        'Maison',                  '🏡', '#16a34a', 60, 'Contrats, énergie, eau, travaux, équipements'),
  ('sorties',       'Sorties & loisirs',       '🎉', '#f97316', 70, 'Sorties, vacances, loisirs'),
  ('annexes',       'Dépenses annexes',        '💸', '#64748b', 80, 'Cadeaux, imprévus, petites dépenses'),
  ('epargne',       'Épargne & investissement','🐷', '#ca8a04', 85, 'Objectifs d''épargne, livrets, placements'),
  ('sante',         'Santé',                   '🩺', '#dc2626', 90, 'Médecin, mutuelle, pharmacie'),
  ('administratif', 'Papiers & administratif', '📑', '#475569', 95, 'Impôts, papiers d''identité, banque'),
  ('animaux',       'Animaux',                 '🐾', '#a16207', 99, 'Vétérinaire, nourriture, garde')
on conflict (code) do nothing;

alter table bforcompta.categories    add column if not exists espace text references bforcompta.espaces(code);
alter table bforcompta.operations    add column if not exists espace text references bforcompta.espaces(code);
alter table bforcompta.agenda_taches add column if not exists espace text references bforcompta.espaces(code);
alter table bforcompta.listes_courses add column if not exists espace text references bforcompta.espaces(code) default 'quotidien';
alter table bforcompta.documents     add column if not exists espace text references bforcompta.espaces(code);
create index if not exists idx_operations_espace on bforcompta.operations(espace);

-- Espace par défaut des catégories existantes
update bforcompta.categories set espace = case
    when nom ilike 'courses%'                         then 'quotidien'
    when nom ilike '%électricité%' or nom ilike 'loyer%' then 'maison'
    when nom ilike 'télécom%'                         then 'maison'
    when nom ilike 'carburant%'                       then 'vehicules'
    when nom ilike 'assurances'                       then 'administratif'
    when nom ilike 'banque%' or nom ilike 'impôts%'   then 'administratif'
    when nom ilike 'repas%'                           then 'sorties'
    when nom ilike 'autres dépenses'                  then 'annexes'
    else 'travail' end
  where espace is null;
insert into bforcompta.categories (nom, type, couleur, espace)
select v.nom, 'depense', v.couleur, v.espace from (values
  ('Scolarité & cantine', '#7c3aed', 'enfants'), ('Activités enfants', '#a855f7', 'enfants'),
  ('Entretien véhicule', '#0891b2', 'vehicules'), ('Assurance véhicule', '#0e7490', 'vehicules'),
  ('Travaux & équipement maison', '#16a34a', 'maison'), ('Eau', '#0284c7', 'maison'),
  ('Sorties & restaurants', '#f97316', 'sorties'), ('Vacances', '#fb923c', 'sorties'),
  ('Cadeaux', '#e11d48', 'annexes'), ('Santé & pharmacie', '#dc2626', 'sante'),
  ('Animaux', '#a16207', 'animaux'), ('Versement épargne', '#ca8a04', 'epargne')) v(nom, couleur, espace)
where not exists (select 1 from bforcompta.categories c where c.nom = v.nom);
insert into bforcompta.categories (nom, type, couleur, espace)
select 'Salaire & revenus', 'recette', '#15803d', 'foyer'
where not exists (select 1 from bforcompta.categories c where c.nom = 'Salaire & revenus');

-- Espace automatique : catégorie, sinon « travail » pour un compte pro, sinon « quotidien »
create or replace function bforcompta.operation_espace_auto() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.espace is null then
    select c.espace into new.espace from bforcompta.categories c where c.id = new.categorie_id;
    if new.espace is null then
      select case when c.nature = 'professionnel' then 'travail' else 'quotidien' end into new.espace
      from bforcompta.comptes c where c.id = new.compte_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_operation_espace on bforcompta.operations;
create trigger trg_operation_espace before insert or update of categorie_id, espace on bforcompta.operations
  for each row execute function bforcompta.operation_espace_auto();
update bforcompta.operations o set espace = null where espace is null;  -- déclenche le calcul

-- ---------------------------------------------------------------- Échéancier
create table if not exists bforcompta.echeances (
  id              uuid primary key default gen_random_uuid(),
  libelle         text not null,
  sens            bforcompta.type_operation not null default 'depense',
  montant         numeric(14,2) not null default 0 check (montant >= 0),
  montant_variable boolean not null default false,
  frequence       text not null default 'mensuelle'
                  check (frequence in ('hebdomadaire','mensuelle','bimestrielle','trimestrielle','semestrielle','annuelle','ponctuelle')),
  premiere_date   date not null default current_date,
  date_fin        date,
  tolerance_jours int  not null default 5 check (tolerance_jours between 0 and 31),
  rappel_jours    int  not null default 3 check (rappel_jours between 0 and 60),
  compte_id       uuid references bforcompta.comptes(id) on delete set null,
  categorie_id    uuid references bforcompta.categories(id) on delete set null,
  tiers_id        uuid references bforcompta.tiers(id) on delete set null,
  mot_cle         text,
  espace          text not null default 'quotidien' references bforcompta.espaces(code),
  moyen_paiement  bforcompta.moyen_paiement not null default 'prelevement',
  origine         text not null default 'manuel' check (origine in ('manuel','detection','email')),
  actif           boolean not null default true,
  notes           text,
  proprietaire    uuid references auth.users(id) on delete cascade default auth.uid(),
  created_at      timestamptz not null default now()
);
alter table bforcompta.documents add column if not exists echeance_id uuid references bforcompta.echeances(id) on delete set null;

create table if not exists bforcompta.echeances_pointages (
  echeance_id  uuid not null references bforcompta.echeances(id) on delete cascade,
  date_prevue  date not null,
  statut       text not null check (statut in ('payee','sautee')),
  operation_id uuid references bforcompta.operations(id) on delete set null,
  montant      numeric(14,2),
  proprietaire uuid references auth.users(id) on delete cascade default auth.uid(),
  created_at   timestamptz not null default now(),
  primary key (echeance_id, date_prevue)
);

-- Dates d'une échéance dans une période (calculées depuis la 1re date : le 31 devient le 30 ou le 28 au besoin)
create or replace function bforcompta.dates_echeance(p_premiere date, p_frequence text, p_fin_validite date, p_debut date, p_fin date)
returns setof date language sql immutable set search_path = '' as $$
  select d from (
    select case when p_frequence = 'ponctuelle' then p_premiere
                else (p_premiere + n * case p_frequence
                       when 'hebdomadaire'  then interval '7 days'
                       when 'mensuelle'     then interval '1 month'
                       when 'bimestrielle'  then interval '2 months'
                       when 'trimestrielle' then interval '3 months'
                       when 'semestrielle'  then interval '6 months'
                       else interval '1 year' end)::date end as d
    from generate_series(0, case when p_frequence = 'ponctuelle' then 0 when p_frequence = 'hebdomadaire' then 1100 else 400 end) n
  ) s
  where d between p_debut and p_fin and (p_fin_validite is null or d <= p_fin_validite);
$$;

-- Occurrences des échéances d'une période, avec leur statut (payée, à venir, due, en retard)
create or replace function bforcompta.occurrences_echeances(p_debut date, p_fin date)
returns table (echeance_id uuid, libelle text, sens text, montant numeric, date_prevue date, espace text, compte_id uuid,
               tiers_id uuid, categorie_id uuid, moyen_paiement text, statut text, operation_id uuid, montant_reel numeric, jours int)
language sql stable set search_path = '' as $$
  select e.id, e.libelle, e.sens::text, e.montant, d, e.espace, e.compte_id, e.tiers_id, e.categorie_id, e.moyen_paiement::text,
         case when p.statut is not null then p.statut
              when o.id is not null then 'payee'
              when d + e.tolerance_jours < current_date then 'en_retard'
              when d <= current_date then 'due'
              else 'a_venir' end,
         coalesce(p.operation_id, o.id), coalesce(p.montant, o.montant), (d - current_date)
  from bforcompta.echeances e
  cross join lateral bforcompta.dates_echeance(e.premiere_date, e.frequence, e.date_fin, p_debut, p_fin) d
  left join bforcompta.echeances_pointages p on p.echeance_id = e.id and p.date_prevue = d
  left join lateral (
    select op.id, op.montant from bforcompta.operations op
    where p.statut is null and op.type = e.sens and op.statut <> 'prevue'
      and op.date_operation between d - e.tolerance_jours - 3 and d + e.tolerance_jours + 3
      and (   (e.tiers_id is not null and op.tiers_id = e.tiers_id)
           or (e.mot_cle is not null and op.libelle ilike '%' || e.mot_cle || '%')
           or (e.tiers_id is null and e.mot_cle is null and op.categorie_id = e.categorie_id
               and abs(op.montant - e.montant) <= greatest(e.montant * 0.2, 2)))
      and not exists (select 1 from bforcompta.echeances_pointages x where x.operation_id = op.id)
    order by abs(op.date_operation - d) limit 1) o on true
  where e.actif
  order by d, e.libelle;
$$;

-- Reste à vivre : ce qu'on peut vraiment dépenser jusqu'à la prochaine rentrée d'argent (ou la fin du mois)
create or replace function bforcompta.reste_a_vivre(p_perimetre text default 'perso', p_jusqua date default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_horizon date; v_solde numeric; v_epargne numeric; v_factures numeric; v_retard numeric; v_courses numeric; v_recettes numeric;
  v_liste jsonb; v_jours int;
begin
  v_horizon := coalesce(p_jusqua,
    (select min(o.date_prevue) - 1 from bforcompta.occurrences_echeances(current_date + 1, current_date + 45) o
      join bforcompta.echeances e on e.id = o.echeance_id
      where o.sens = 'recette' and o.statut = 'a_venir'
        and (p_perimetre = 'tout' or (p_perimetre = 'pro') = (e.espace = 'travail'))),
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date);
  if v_horizon < current_date then v_horizon := current_date; end if;

  with c as (select c.id, c.type from bforcompta.comptes c where c.actif and
              (p_perimetre = 'tout' or (p_perimetre = 'pro') = (c.nature = 'professionnel')))
  select coalesce(sum(s.solde_actuel) filter (where c.type not in ('epargne','placement')), 0),
         coalesce(sum(s.solde_actuel) filter (where c.type in ('epargne','placement')), 0)
    into v_solde, v_epargne
  from c join bforcompta.v_soldes_comptes s on s.compte_id = c.id;

  with o as (
    select o.* from bforcompta.occurrences_echeances(current_date - 60, v_horizon) o
    left join bforcompta.comptes c on c.id = o.compte_id
    where o.statut in ('a_venir','due','en_retard')
      and (p_perimetre = 'tout'
           or (p_perimetre = 'pro' and (c.nature = 'professionnel' or (c.id is null and o.espace = 'travail')))
           or (p_perimetre = 'perso' and coalesce(c.nature, case when o.espace = 'travail' then 'professionnel' else 'personnel' end) <> 'professionnel')))
  select coalesce(sum(montant) filter (where sens = 'depense'), 0),
         coalesce(sum(montant) filter (where sens = 'depense' and statut = 'en_retard'), 0),
         coalesce(sum(montant) filter (where sens = 'recette'), 0),
         coalesce(jsonb_agg(jsonb_build_object('id', echeance_id, 'libelle', libelle, 'montant', montant, 'date', date_prevue,
                  'statut', statut, 'espace', espace, 'sens', sens) order by date_prevue), '[]'::jsonb)
    into v_factures, v_retard, v_recettes, v_liste from o;

  select coalesce(sum(l.total_estime), 0) into v_courses from bforcompta.listes_courses l
   left join bforcompta.comptes c on c.id = l.compte_id
   where l.statut in ('programmee','en_cours') and l.date_prevue between current_date and v_horizon
     and (p_perimetre = 'tout' or (p_perimetre = 'pro') = (coalesce(c.nature, 'personnel') = 'professionnel'));

  v_jours := v_horizon - current_date + 1;
  return jsonb_build_object('perimetre', p_perimetre, 'jusqua', v_horizon, 'jours', v_jours,
    'solde', v_solde, 'epargne', v_epargne, 'factures', v_factures, 'dont_retard', v_retard, 'courses', v_courses,
    'recettes_attendues', v_recettes, 'disponible', v_solde - v_factures - v_courses,
    'par_jour', round((v_solde - v_factures - v_courses) / greatest(v_jours, 1), 2), 'echeances', v_liste);
end $$;

-- Détection des factures récurrentes dans l'historique (même provenance ou même libellé, ≥ 3 mois, montant et jour réguliers)
create or replace function bforcompta.detecter_echeances()
returns table (cle text, libelle text, sens text, tiers_id uuid, categorie_id uuid, compte_id uuid, espace text,
               montant numeric, jour int, nb_mois int, derniere date, prochaine date, variable boolean)
language sql stable set search_path = '' as $$
  with o as (
    select op.*, coalesce(op.tiers_id::text, lower(trim(regexp_replace(op.libelle, '[0-9/.-]+', ' ', 'g')))) as k
    from bforcompta.operations op
    where op.statut <> 'prevue' and op.date_operation >= current_date - 400 and op.moyen_paiement <> 'especes'),
  g as (
    select k, type::text as sens, count(distinct date_trunc('month', date_operation)) as nb_mois,
           avg(montant) as moy, stddev_pop(montant) as ec, avg(extract(day from date_operation)) as j,
           stddev_pop(extract(day from date_operation)) as ecj, max(date_operation) as derniere,
           (array_agg(libelle order by date_operation desc))[1] as libelle,
           (array_agg(tiers_id order by date_operation desc))[1] as tiers_id,
           (array_agg(categorie_id order by date_operation desc))[1] as categorie_id,
           (array_agg(compte_id order by date_operation desc))[1] as compte_id,
           (array_agg(espace order by date_operation desc))[1] as espace,
           count(*) as n
    from o group by k, type)
  select g.k, g.libelle, g.sens, g.tiers_id, g.categorie_id, g.compte_id, coalesce(g.espace, 'quotidien'),
         round(g.moy, 2), round(g.j)::int, g.nb_mois::int, g.derniere,
         (g.derniere + interval '1 month')::date, (g.ec / nullif(g.moy, 0)) > 0.1
  from g
  where g.nb_mois >= 3 and g.n <= g.nb_mois + 1 and g.ecj <= 4 and (g.ec / nullif(g.moy, 0)) <= 0.35
    and g.derniere >= current_date - 70
    and not exists (select 1 from bforcompta.echeances e where e.actif and e.sens::text = g.sens and (
          (g.tiers_id is not null and e.tiers_id = g.tiers_id) or (e.mot_cle is not null and g.libelle ilike '%' || e.mot_cle || '%')
          or (lower(e.libelle) = lower(g.libelle))))
  order by g.sens desc, g.moy desc;
$$;

-- ---------------------------------------------------------------- Alertes (vigilance)
create table if not exists bforcompta.alertes (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,   -- depense_inhabituelle, solde_en_danger, grosse_depense, doublon, budget_depasse, echeance_retard, echeance_proche
  niveau       text not null default 'info' check (niveau in ('info','attention','urgent')),
  titre        text not null,
  message      text,
  espace       text references bforcompta.espaces(code),
  operation_id uuid references bforcompta.operations(id) on delete cascade,
  echeance_id  uuid references bforcompta.echeances(id) on delete cascade,
  cle          text,
  lue          boolean not null default false,
  envoyee_le   timestamptz,
  proprietaire uuid references auth.users(id) on delete cascade default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (proprietaire, cle)
);
create index if not exists idx_alertes_proprio on bforcompta.alertes(proprietaire, lue, created_at desc);

create or replace function bforcompta.fmt_euros(p numeric) returns text language sql immutable set search_path = '' as $$
  select translate(to_char(round(coalesce(p, 0), 2), 'FM999,999,990.00'), ',.', ' ,') || ' €' $$;

-- Analyse de chaque nouvelle dépense : inhabituelle ? grosse ? met en danger les factures ? doublon ? budget dépassé ?
create or replace function bforcompta.analyser_operation() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_nature text; v_moy numeric; v_n int; v_connu boolean; v_rav jsonb; v_dispo numeric; v_lignes text; v_budget numeric; v_mois numeric;
  v_inhab boolean; v_niveau text; v_titre text; v_type text; v_cat text;
begin
  if auth.uid() is null or new.type <> 'depense' or new.statut = 'prevue' then return new; end if;
  select nature into v_nature from bforcompta.comptes where id = new.compte_id;
  select avg(montant), count(*) into v_moy, v_n from bforcompta.operations
   where id <> new.id and type = 'depense' and categorie_id = new.categorie_id and date_operation >= new.date_operation - 120;
  select exists (select 1 from bforcompta.operations where id <> new.id and type = 'depense' and date_operation < new.date_operation + 1
                 and ((new.tiers_id is not null and tiers_id = new.tiers_id) or lower(libelle) = lower(new.libelle))) into v_connu;
  v_inhab := (v_n >= 3 and new.montant > 2 * v_moy and new.montant >= 30) or (not v_connu and new.montant >= 80);

  -- doublon
  if exists (select 1 from bforcompta.operations where id <> new.id and compte_id = new.compte_id and type = 'depense'
             and montant = new.montant and date_operation = new.date_operation
             and (tiers_id = new.tiers_id or lower(libelle) = lower(new.libelle))) then
    insert into bforcompta.alertes (type, niveau, titre, message, espace, operation_id, cle)
    values ('doublon', 'attention', 'Dépense en double ?', format('« %s » de %s apparaît deux fois le %s sur le même compte.',
            new.libelle, bforcompta.fmt_euros(new.montant), to_char(new.date_operation, 'DD/MM')), new.espace, new.id, 'doublon:' || new.id)
    on conflict (proprietaire, cle) do nothing;
  end if;

  -- budget du mois
  if new.categorie_id is not null then
    select b.montant into v_budget from bforcompta.budgets b
     where b.categorie_id = new.categorie_id and b.mois = date_trunc('month', new.date_operation)::date;
    if v_budget is not null then
      select coalesce(sum(montant), 0) into v_mois from bforcompta.operations
       where type = 'depense' and categorie_id = new.categorie_id and statut <> 'prevue'
         and date_trunc('month', date_operation) = date_trunc('month', new.date_operation);
      if v_mois > v_budget and v_mois - new.montant <= v_budget then
        select nom into v_cat from bforcompta.categories where id = new.categorie_id;
        insert into bforcompta.alertes (type, niveau, titre, message, espace, operation_id, cle)
        values ('budget_depasse', 'attention', 'Budget dépassé : ' || v_cat,
                format('%s dépensés ce mois pour un budget de %s.', bforcompta.fmt_euros(v_mois), bforcompta.fmt_euros(v_budget)),
                new.espace, new.id, 'budget:' || new.categorie_id || ':' || to_char(new.date_operation, 'YYYY-MM'))
        on conflict (proprietaire, cle) do nothing;
      end if;
    end if;
  end if;

  if new.date_operation < current_date - 7 then return new; end if;   -- pas d'alerte « argent » pour une saisie ancienne
  v_rav := bforcompta.reste_a_vivre(case when v_nature = 'professionnel' then 'pro' else 'perso' end, null);
  v_dispo := (v_rav->>'disponible')::numeric;
  if not (v_inhab or v_dispo < 0 or new.montant >= 300) then return new; end if;

  select string_agg(format('• le %s : %s (≈ %s)', to_char((x->>'date')::date, 'DD/MM'), x->>'libelle', bforcompta.fmt_euros((x->>'montant')::numeric)), E'\n')
    into v_lignes
  from (select x from jsonb_array_elements(v_rav->'echeances') x where x->>'sens' = 'depense' limit 6) s;

  if v_dispo < 0 then v_niveau := 'urgent'; v_type := 'solde_en_danger'; v_titre := 'Attention : les factures à venir ne sont plus couvertes';
  elsif v_inhab then v_niveau := 'attention'; v_type := 'depense_inhabituelle'; v_titre := 'Dépense inhabituelle';
  else v_niveau := 'info'; v_type := 'grosse_depense'; v_titre := 'Grosse dépense'; end if;

  insert into bforcompta.alertes (type, niveau, titre, message, espace, operation_id, cle)
  values (v_type, v_niveau, v_titre,
    format('Tu viens de dépenser %s (%s).', bforcompta.fmt_euros(new.montant), new.libelle)
    || E'\n' || format('Disponible réel jusqu''au %s : %s.', to_char((v_rav->>'jusqua')::date, 'DD/MM'), bforcompta.fmt_euros(v_dispo))
    || case when v_lignes is not null then E'\nIl reste à payer :\n' || v_lignes else '' end,
    new.espace, new.id, 'op:' || new.id)
  on conflict (proprietaire, cle) do nothing;
  return new;
end $$;
drop trigger if exists trg_analyser_operation on bforcompta.operations;
create trigger trg_analyser_operation after insert on bforcompta.operations
  for each row execute function bforcompta.analyser_operation();

-- Rappels d'échéances (en retard, ou dans les « rappel_jours » à venir). Appelée à l'ouverture de l'appli (puis chaque matin).
create or replace function bforcompta.verifier_echeances() returns int
language plpgsql set search_path = '' as $$
declare n int := 0; r record;
begin
  if auth.uid() is null then return 0; end if;
  for r in select o.*, e.rappel_jours from bforcompta.occurrences_echeances(current_date - 60, current_date + 60) o
           join bforcompta.echeances e on e.id = o.echeance_id
           where o.sens = 'depense' and (o.statut = 'en_retard' or (o.statut in ('a_venir','due') and o.jours <= e.rappel_jours)) loop
    insert into bforcompta.alertes (type, niveau, titre, message, espace, echeance_id, cle)
    values (case when r.statut = 'en_retard' then 'echeance_retard' else 'echeance_proche' end,
            case when r.statut = 'en_retard' then 'urgent' else 'info' end,
            case when r.statut = 'en_retard' then 'Facture non retrouvée : ' || r.libelle
                 when r.jours = 0 then 'À payer aujourd''hui : ' || r.libelle
                 else format('À payer dans %s jour%s : %s', r.jours, case when r.jours > 1 then 's' else '' end, r.libelle) end,
            format('%s prévu le %s.', bforcompta.fmt_euros(r.montant), to_char(r.date_prevue, 'DD/MM/YYYY'))
            || case when r.statut = 'en_retard' then ' Aucun paiement correspondant trouvé : vérifie qu''elle est bien réglée.' else '' end,
            r.espace, r.echeance_id, r.statut || ':' || r.echeance_id || ':' || r.date_prevue)
    on conflict (proprietaire, cle) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- Épargne & investissement
create table if not exists bforcompta.objectifs_epargne (
  id             uuid primary key default gen_random_uuid(),
  nom            text not null,
  icone          text default '🎯',
  montant_cible  numeric(14,2) not null check (montant_cible > 0),
  montant_actuel numeric(14,2) not null default 0,
  date_cible     date,
  compte_id      uuid references bforcompta.comptes(id) on delete set null,   -- si lié : le solde du compte fait foi
  versement_mensuel numeric(14,2),
  espace         text references bforcompta.espaces(code) default 'epargne',
  actif          boolean not null default true,
  notes          text,
  proprietaire   uuid references auth.users(id) on delete cascade default auth.uid(),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- Règles d'accès
alter table bforcompta.espaces enable row level security;
drop policy if exists espaces_lecture on bforcompta.espaces;
create policy espaces_lecture on bforcompta.espaces for select to authenticated using (true);

do $$ declare t text;
begin
  foreach t in array array['echeances','objectifs_epargne'] loop
    execute format('alter table bforcompta.%I enable row level security', t);
    execute format('drop policy if exists acces_assistant on bforcompta.%I', t);
    execute format($p$create policy acces_assistant on bforcompta.%I for all to authenticated
      using (proprietaire = auth.uid() or (compte_id is not null and bforcompta.peut_voir_compte(compte_id))
             or (compte_id is null and espace <> 'travail' and bforcompta.meme_foyer(proprietaire))
             or (compte_id is null and espace = 'travail' and bforcompta.acces_pro()))
      with check (bforcompta.peut_utiliser() and (proprietaire = auth.uid() or bforcompta.meme_foyer(proprietaire) or bforcompta.acces_pro()))$p$, t);
  end loop;
end $$;
alter table bforcompta.echeances_pointages enable row level security;
drop policy if exists acces_pointages on bforcompta.echeances_pointages;
create policy acces_pointages on bforcompta.echeances_pointages for all to authenticated
  using (exists (select 1 from bforcompta.echeances e where e.id = echeance_id))
  with check (bforcompta.peut_utiliser() and exists (select 1 from bforcompta.echeances e where e.id = echeance_id));
alter table bforcompta.alertes enable row level security;
drop policy if exists alertes_perso on bforcompta.alertes;
create policy alertes_perso on bforcompta.alertes for all to authenticated
  using (proprietaire = auth.uid()) with check (proprietaire = auth.uid());

-- Documents : aussi rattachables à une échéance ou à un espace de vie
drop policy if exists documents_acces on bforcompta.documents;
create policy documents_acces on bforcompta.documents for all to authenticated
  using (case when compte_id is not null then bforcompta.peut_voir_compte(compte_id)
              when operation_id is not null then exists (select 1 from bforcompta.operations o where o.id = documents.operation_id)
              when echeance_id is not null then exists (select 1 from bforcompta.echeances e where e.id = documents.echeance_id)
              when espace is not null and espace <> 'travail' then created_by = auth.uid() or bforcompta.meme_foyer(created_by)
              else bforcompta.acces_pro() end)
  with check (bforcompta.peut_utiliser());

grant select on bforcompta.espaces to authenticated, service_role;
grant all on bforcompta.echeances, bforcompta.echeances_pointages, bforcompta.alertes, bforcompta.objectifs_epargne to authenticated, service_role;
grant execute on all functions in schema bforcompta to authenticated, service_role;

do $$ declare t text;
begin
  foreach t in array array['echeances','echeances_pointages','alertes','objectifs_epargne'] loop
    begin execute format('alter publication supabase_realtime add table bforcompta.%I', t); exception when duplicate_object then null; end;
  end loop;
end $$;

select 'ok' as assistant;
