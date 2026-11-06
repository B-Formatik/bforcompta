-- =====================================================================
--  B-S@fe (ex B-ForCompt@) — Mon foyer (adultes / enfants, régimes, allergies),
--  Cuisine (recettes, menus équilibrés adaptés au foyer et aux courses), Sport (activités, séances, objectifs)
-- =====================================================================
set search_path = bforcompta, extensions, public;

insert into bforcompta.espaces (code, nom, icone, couleur, ordre, description) values
  ('cuisine', 'Cuisine & repas', '🍽️', '#e11d48', 35, 'Menus équilibrés, recettes, garde-manger'),
  ('sport',   'Sport & bien-être', '🏃', '#0d9488', 75, 'Activités, séances, objectifs, licences')
on conflict (code) do nothing;
insert into bforcompta.categories (nom, type, couleur, espace)
select v.nom, 'depense', v.couleur, v.espace from (values ('Sport & licences', '#0d9488', 'sport'), ('Restauration & repas', '#e11d48', 'cuisine')) v(nom, couleur, espace)
where not exists (select 1 from bforcompta.categories c where c.nom = v.nom);

-- ---------------------------------------------------------------- Mon foyer
create table if not exists bforcompta.foyer_parametres (
  proprietaire   uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  nom            text default 'Mon foyer',
  repas          text[] not null default '{diner}',          -- repas à planifier : dejeuner, diner
  budget_courses_semaine numeric(10,2),
  onboarding_fait boolean not null default false,
  updated_at     timestamptz not null default now()
);
create table if not exists bforcompta.membres_foyer (
  id              uuid primary key default gen_random_uuid(),
  prenom          text not null,
  role            text not null default 'adulte' check (role in ('adulte','enfant')),
  date_naissance  date,
  regimes         text[] not null default '{}',   -- vegetarien, sans_porc, sans_gluten, sans_lactose, halal
  allergies       text[] not null default '{}',   -- texte libre : arachide, crustacés…
  objectif_sport_min int,                         -- minutes d'activité par semaine
  couleur         text default '#2467b6',
  enfant_id       uuid references bforcompta.enfants(id) on delete set null,
  actif           boolean not null default true,
  proprietaire    uuid references auth.users(id) on delete cascade default auth.uid(),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- Cuisine
create table if not exists bforcompta.recettes (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null,
  icone         text default '🍽️',
  type_repas    text not null default 'plat' check (type_repas in ('plat','entree','dessert','petit_dejeuner','gouter')),
  proteine      text check (proteine in ('volaille','viande_rouge','porc','poisson','oeufs','vegetal')),
  portions_base int  not null default 4,
  temps_min     int,
  difficulte    int default 1 check (difficulte between 1 and 3),
  tags          text[] not null default '{}',     -- antillais, rapide, enfants, vegetarien, sans_porc, sans_gluten…
  ingredients   jsonb not null default '[]',      -- [{q, u, n, k (mot-clé), b (placard : sel, huile…)}]
  instructions  text,
  legumes       boolean not null default true,
  feculent      boolean not null default true,
  proprietaire  uuid references auth.users(id) on delete cascade default auth.uid(),   -- null = recette de base partagée
  actif         boolean not null default true,
  created_at    timestamptz not null default now()
);
create table if not exists bforcompta.menus (
  id           uuid primary key default gen_random_uuid(),
  jour         date not null,
  repas        text not null default 'diner' check (repas in ('petit_dejeuner','dejeuner','gouter','diner')),
  recette_id   uuid references bforcompta.recettes(id) on delete set null,
  libelle      text,
  portions     numeric(6,2),
  statut       text not null default 'prevu' check (statut in ('prevu','fait','annule')),
  proprietaire uuid references auth.users(id) on delete cascade default auth.uid(),
  unique (proprietaire, jour, repas)
);

-- Recettes de base (pour 4 personnes) — insérées une seule fois
do $$
begin
if not exists (select 1 from bforcompta.recettes where proprietaire is null) then
insert into bforcompta.recettes (nom, icone, proteine, temps_min, difficulte, tags, legumes, feculent, ingredients, instructions, proprietaire) values
('Colombo de poulet', '🍛', 'volaille', 60, 2, '{antillais,sans_porc}', true, true,
 '[{"q":1000,"u":"g","n":"Poulet en morceaux","k":"poulet"},{"q":500,"u":"g","n":"Pommes de terre","k":"pomme de terre"},{"q":1,"u":"pièce","n":"Courgette","k":"courgette"},{"q":2,"u":"pièce","n":"Oignons","k":"oignon"},{"q":3,"u":"gousse","n":"Ail","k":"ail","b":1},{"q":2,"u":"c. à s.","n":"Poudre à colombo","k":"colombo","b":1},{"q":1,"u":"pièce","n":"Citron vert","k":"citron"},{"q":300,"u":"g","n":"Riz","k":"riz"}]',
 E'Mariner le poulet avec le citron, l''ail et la moitié du colombo (30 min si possible).\nFaire dorer le poulet avec les oignons émincés.\nAjouter le reste du colombo, les pommes de terre et la courgette en dés, couvrir d''eau.\nLaisser mijoter 40 min à couvert.\nServir avec le riz.', null),
('Court-bouillon de poisson', '🐟', 'poisson', 45, 2, '{antillais,sans_porc,sans_gluten}', true, true,
 '[{"q":1000,"u":"g","n":"Poisson (vivaneau, daurade…)","k":"poisson"},{"q":3,"u":"pièce","n":"Tomates","k":"tomate"},{"q":2,"u":"pièce","n":"Oignons","k":"oignon"},{"q":2,"u":"brin","n":"Cive","k":"cive"},{"q":3,"u":"gousse","n":"Ail","k":"ail","b":1},{"q":2,"u":"pièce","n":"Citrons verts","k":"citron"},{"q":1,"u":"pièce","n":"Piment","k":"piment","b":1},{"q":300,"u":"g","n":"Riz","k":"riz"}]',
 E'Nettoyer le poisson au citron, le mariner avec ail, cive et piment.\nFaire revenir oignons et tomates, ajouter un verre d''eau.\nPoser le poisson, cuire 15 min à couvert.\nArroser d''un filet de citron, servir avec le riz.', null),
('Riz aux haricots rouges et légumes', '🫘', 'vegetal', 40, 1, '{antillais,vegetarien,sans_porc,sans_gluten}', true, true,
 '[{"q":300,"u":"g","n":"Riz","k":"riz"},{"q":500,"u":"g","n":"Haricots rouges cuits","k":"haricot rouge"},{"q":1,"u":"pièce","n":"Oignon","k":"oignon"},{"q":2,"u":"pièce","n":"Carottes","k":"carotte"},{"q":2,"u":"brin","n":"Cive","k":"cive"},{"q":2,"u":"gousse","n":"Ail","k":"ail","b":1}]',
 E'Faire revenir oignon, cive et ail.\nAjouter les carottes en dés et les haricots, puis le riz.\nCouvrir d''eau (1,5 fois le volume du riz), cuire 18 min à couvert.', null),
('Christophines gratinées', '🥒', 'porc', 60, 2, '{antillais}', true, false,
 '[{"q":4,"u":"pièce","n":"Christophines","k":"christophine"},{"q":150,"u":"g","n":"Jambon","k":"jambon"},{"q":50,"u":"cl","n":"Lait","k":"lait"},{"q":40,"u":"g","n":"Farine","k":"farine","b":1},{"q":40,"u":"g","n":"Beurre","k":"beurre"},{"q":80,"u":"g","n":"Fromage râpé","k":"fromage"},{"q":400,"u":"g","n":"Pain","k":"pain"}]',
 E'Cuire les christophines coupées en deux 25 min à l''eau, évider.\nPréparer une béchamel (beurre, farine, lait), y mêler la chair et le jambon.\nRemplir les christophines, couvrir de fromage, gratiner 15 min à 200 °C. Servir avec du pain.', null),
('Accras de morue et salade', '🧆', 'poisson', 50, 2, '{antillais,sans_porc}', true, true,
 '[{"q":300,"u":"g","n":"Morue dessalée","k":"morue"},{"q":250,"u":"g","n":"Farine","k":"farine","b":1},{"q":1,"u":"pièce","n":"Œuf","k":"oeuf"},{"q":2,"u":"brin","n":"Cive","k":"cive"},{"q":1,"u":"pièce","n":"Salade","k":"salade"},{"q":2,"u":"pièce","n":"Tomates","k":"tomate"},{"q":1,"u":"pièce","n":"Concombre","k":"concombre"}]',
 E'Émietter la morue, la mélanger avec farine, œuf, cive hachée et un peu d''eau.\nFrire des petites cuillerées dans l''huile chaude.\nServir avec une grande salade tomates-concombre.', null),
('Spaghetti bolognaise', '🍝', 'viande_rouge', 35, 1, '{enfants,sans_porc}', true, true,
 '[{"q":400,"u":"g","n":"Spaghetti","k":"spaghetti"},{"q":400,"u":"g","n":"Viande hachée","k":"viande hach"},{"q":500,"u":"g","n":"Sauce tomate","k":"tomate"},{"q":1,"u":"pièce","n":"Oignon","k":"oignon"},{"q":2,"u":"pièce","n":"Carottes","k":"carotte"},{"q":60,"u":"g","n":"Fromage râpé","k":"fromage"}]',
 E'Faire revenir oignon et carottes râpées, ajouter la viande.\nVerser la sauce tomate, mijoter 20 min.\nCuire les pâtes, servir avec la sauce et le fromage.', null),
('Poulet rôti, haricots verts et pommes de terre', '🍗', 'volaille', 75, 1, '{enfants,sans_porc,sans_gluten}', true, true,
 '[{"q":1,"u":"pièce","n":"Poulet entier (1,4 kg)","k":"poulet"},{"q":800,"u":"g","n":"Pommes de terre","k":"pomme de terre"},{"q":500,"u":"g","n":"Haricots verts","k":"haricot vert"},{"q":3,"u":"gousse","n":"Ail","k":"ail","b":1}]',
 E'Rôtir le poulet 1 h à 200 °C avec les pommes de terre en quartiers et l''ail.\nCuire les haricots verts 10 min à la vapeur.', null),
('Omelette aux légumes et salade', '🍳', 'oeufs', 20, 1, '{rapide,vegetarien,sans_porc,sans_gluten}', true, false,
 '[{"q":8,"u":"pièce","n":"Œufs","k":"oeuf"},{"q":1,"u":"pièce","n":"Poivron","k":"poivron"},{"q":1,"u":"pièce","n":"Oignon","k":"oignon"},{"q":2,"u":"pièce","n":"Tomates","k":"tomate"},{"q":1,"u":"pièce","n":"Salade","k":"salade"},{"q":400,"u":"g","n":"Pain","k":"pain"}]',
 E'Faire revenir oignon et poivron.\nVerser les œufs battus, cuire à feu doux.\nServir avec la salade et des tomates, et du pain.', null),
('Soupe de légumes et tartines au fromage', '🥣', 'vegetal', 40, 1, '{vegetarien,sans_porc,enfants}', true, true,
 '[{"q":4,"u":"pièce","n":"Carottes","k":"carotte"},{"q":3,"u":"pièce","n":"Pommes de terre","k":"pomme de terre"},{"q":2,"u":"pièce","n":"Poireaux","k":"poireau"},{"q":1,"u":"pièce","n":"Courgette","k":"courgette"},{"q":400,"u":"g","n":"Pain","k":"pain"},{"q":150,"u":"g","n":"Fromage","k":"fromage"}]',
 E'Éplucher et couper les légumes, couvrir d''eau, cuire 30 min puis mixer.\nGriller des tartines de pain avec le fromage.', null),
('Curry de pois chiches au lait de coco', '🍛', 'vegetal', 35, 1, '{vegetarien,sans_porc,sans_gluten}', true, true,
 '[{"q":500,"u":"g","n":"Pois chiches cuits","k":"pois chiche"},{"q":40,"u":"cl","n":"Lait de coco","k":"coco"},{"q":400,"u":"g","n":"Tomates concassées","k":"tomate"},{"q":1,"u":"pièce","n":"Oignon","k":"oignon"},{"q":200,"u":"g","n":"Épinards","k":"epinard"},{"q":2,"u":"c. à s.","n":"Curry","k":"curry","b":1},{"q":300,"u":"g","n":"Riz","k":"riz"}]',
 E'Faire revenir l''oignon avec le curry.\nAjouter tomates, pois chiches et lait de coco, mijoter 15 min.\nAjouter les épinards 2 min avant la fin. Servir avec le riz.', null),
('Saumon, riz et brocolis', '🍣', 'poisson', 25, 1, '{rapide,sans_porc,sans_gluten}', true, true,
 '[{"q":600,"u":"g","n":"Pavés de saumon","k":"saumon"},{"q":300,"u":"g","n":"Riz","k":"riz"},{"q":500,"u":"g","n":"Brocolis","k":"brocoli"},{"q":1,"u":"pièce","n":"Citron","k":"citron"}]',
 E'Cuire le riz.\nCuire les brocolis 8 min à la vapeur.\nPoêler le saumon 4 min de chaque côté, arroser de citron.', null),
('Lentilles aux carottes et saucisses', '🌭', 'porc', 45, 1, '{sans_gluten}', true, true,
 '[{"q":300,"u":"g","n":"Lentilles","k":"lentille"},{"q":3,"u":"pièce","n":"Carottes","k":"carotte"},{"q":1,"u":"pièce","n":"Oignon","k":"oignon"},{"q":4,"u":"pièce","n":"Saucisses","k":"saucisse"}]',
 E'Cuire les lentilles 25 min avec carottes et oignon.\nAjouter les saucisses les 10 dernières minutes.', null),
('Gratin de pâtes au thon et courgettes', '🧀', 'poisson', 40, 1, '{enfants,sans_porc}', true, true,
 '[{"q":400,"u":"g","n":"Pâtes","k":"pate"},{"q":280,"u":"g","n":"Thon en boîte","k":"thon"},{"q":2,"u":"pièce","n":"Courgettes","k":"courgette"},{"q":50,"u":"cl","n":"Lait","k":"lait"},{"q":80,"u":"g","n":"Fromage râpé","k":"fromage"}]',
 E'Cuire les pâtes al dente.\nMélanger avec thon, courgettes en dés et lait.\nCouvrir de fromage, gratiner 20 min à 200 °C.', null),
('Quiche aux poireaux et salade', '🥧', 'oeufs', 50, 2, '{vegetarien,sans_porc}', true, true,
 '[{"q":1,"u":"pièce","n":"Pâte brisée","k":"pate bris"},{"q":3,"u":"pièce","n":"Œufs","k":"oeuf"},{"q":20,"u":"cl","n":"Crème","k":"creme"},{"q":20,"u":"cl","n":"Lait","k":"lait"},{"q":2,"u":"pièce","n":"Poireaux","k":"poireau"},{"q":60,"u":"g","n":"Fromage râpé","k":"fromage"},{"q":1,"u":"pièce","n":"Salade","k":"salade"}]',
 E'Faire fondre les poireaux émincés 10 min.\nBattre œufs, crème et lait, ajouter poireaux et fromage.\nVerser sur la pâte, cuire 35 min à 180 °C. Servir avec la salade.', null),
('Chili con carne', '🌶️', 'viande_rouge', 45, 1, '{sans_porc,sans_gluten}', true, true,
 '[{"q":400,"u":"g","n":"Viande hachée","k":"viande hach"},{"q":400,"u":"g","n":"Haricots rouges cuits","k":"haricot rouge"},{"q":400,"u":"g","n":"Tomates concassées","k":"tomate"},{"q":1,"u":"pièce","n":"Poivron","k":"poivron"},{"q":1,"u":"pièce","n":"Oignon","k":"oignon"},{"q":300,"u":"g","n":"Riz","k":"riz"}]',
 E'Faire revenir oignon et poivron, ajouter la viande.\nAjouter tomates et haricots, épicer, mijoter 25 min.\nServir avec le riz.', null),
('Poisson grillé, bananes plantain et crudités', '🍌', 'poisson', 35, 1, '{antillais,sans_porc,sans_gluten}', true, true,
 '[{"q":800,"u":"g","n":"Poisson","k":"poisson"},{"q":3,"u":"pièce","n":"Bananes plantain","k":"plantain"},{"q":3,"u":"pièce","n":"Tomates","k":"tomate"},{"q":1,"u":"pièce","n":"Concombre","k":"concombre"},{"q":2,"u":"pièce","n":"Citrons verts","k":"citron"}]',
 E'Mariner le poisson au citron, le griller 6 à 8 min par face.\nCuire les bananes plantain en rondelles à la poêle.\nServir avec tomates et concombre.', null),
('Blanc de poulet, purée de patate douce et haricots verts', '🍠', 'volaille', 35, 1, '{enfants,sans_porc,sans_gluten}', true, true,
 '[{"q":600,"u":"g","n":"Blancs de poulet","k":"poulet"},{"q":800,"u":"g","n":"Patates douces","k":"patate douce"},{"q":400,"u":"g","n":"Haricots verts","k":"haricot vert"},{"q":20,"u":"cl","n":"Lait","k":"lait"}]',
 E'Cuire les patates douces 20 min à l''eau, écraser avec le lait.\nPoêler le poulet.\nCuire les haricots verts à la vapeur.', null),
('Salade composée œufs, maïs et riz', '🥗', 'oeufs', 25, 1, '{rapide,vegetarien,sans_porc,sans_gluten}', true, true,
 '[{"q":250,"u":"g","n":"Riz","k":"riz"},{"q":4,"u":"pièce","n":"Œufs","k":"oeuf"},{"q":3,"u":"pièce","n":"Tomates","k":"tomate"},{"q":1,"u":"pièce","n":"Concombre","k":"concombre"},{"q":300,"u":"g","n":"Maïs","k":"mais"},{"q":1,"u":"pièce","n":"Salade","k":"salade"}]',
 E'Cuire le riz et les œufs (10 min), laisser refroidir.\nCouper les légumes, mélanger le tout avec une vinaigrette.', null),
('Dombrés aux crevettes', '🦐', 'poisson', 60, 2, '{antillais,sans_porc}', true, true,
 '[{"q":400,"u":"g","n":"Farine","k":"farine","b":1},{"q":500,"u":"g","n":"Crevettes","k":"crevette"},{"q":3,"u":"pièce","n":"Tomates","k":"tomate"},{"q":1,"u":"pièce","n":"Oignon","k":"oignon"},{"q":2,"u":"brin","n":"Cive","k":"cive"},{"q":3,"u":"gousse","n":"Ail","k":"ail","b":1}]',
 E'Pétrir farine, eau et sel, former de petits boudins (dombrés).\nFaire revenir oignon, tomates, cive et ail, ajouter de l''eau.\nCuire les dombrés 20 min dans la sauce, ajouter les crevettes 5 min avant la fin.', null),
('Pizza maison jambon et légumes', '🍕', 'porc', 40, 1, '{enfants}', true, true,
 '[{"q":1,"u":"pièce","n":"Pâte à pizza","k":"pate a pizza"},{"q":200,"u":"g","n":"Sauce tomate","k":"tomate"},{"q":150,"u":"g","n":"Jambon","k":"jambon"},{"q":1,"u":"pièce","n":"Poivron","k":"poivron"},{"q":150,"u":"g","n":"Champignons","k":"champignon"},{"q":125,"u":"g","n":"Mozzarella","k":"mozzarella"},{"q":1,"u":"pièce","n":"Salade","k":"salade"}]',
 E'Étaler la pâte, la couvrir de sauce tomate.\nRépartir jambon, poivron, champignons et mozzarella.\nCuire 15 min à 240 °C. Servir avec la salade.', null),
('Riz cantonais', '🍚', 'oeufs', 25, 1, '{rapide,enfants}', true, true,
 '[{"q":300,"u":"g","n":"Riz","k":"riz"},{"q":3,"u":"pièce","n":"Œufs","k":"oeuf"},{"q":200,"u":"g","n":"Petits pois","k":"petit pois"},{"q":150,"u":"g","n":"Jambon","k":"jambon"},{"q":1,"u":"pièce","n":"Oignon","k":"oignon"}]',
 E'Cuire le riz (idéalement la veille).\nFaire une omelette fine, la couper en lanières.\nFaire sauter oignon, petits pois, jambon et riz, ajouter l''omelette.', null),
('Ratatouille, semoule et œufs', '🍆', 'oeufs', 50, 1, '{vegetarien,sans_porc}', true, true,
 '[{"q":2,"u":"pièce","n":"Courgettes","k":"courgette"},{"q":1,"u":"pièce","n":"Aubergine","k":"aubergine"},{"q":2,"u":"pièce","n":"Poivrons","k":"poivron"},{"q":4,"u":"pièce","n":"Tomates","k":"tomate"},{"q":1,"u":"pièce","n":"Oignon","k":"oignon"},{"q":300,"u":"g","n":"Semoule","k":"semoule"},{"q":4,"u":"pièce","n":"Œufs","k":"oeuf"}]',
 E'Couper les légumes, les faire mijoter 35 min avec l''oignon.\nPréparer la semoule.\nCuire les œufs (mollets ou au plat) et servir le tout.', null);
end if;
end $$;

-- ---------------------------------------------------------------- Sport
create table if not exists bforcompta.activites_sport (
  id           uuid primary key default gen_random_uuid(),
  membre_id    uuid references bforcompta.membres_foyer(id) on delete cascade,
  nom          text not null,
  icone        text default '🏃',
  jours        int[] not null default '{}',        -- 1 = lundi … 7 = dimanche
  heure        time,
  duree_min    int not null default 60,
  intensite    int not null default 2 check (intensite between 1 and 3),
  lieu         text,
  cout         numeric(10,2),
  periode_cout text default 'mensuel' check (periode_cout in ('seance','mensuel','trimestriel','annuel')),
  licence_fin  date,
  actif        boolean not null default true,
  proprietaire uuid references auth.users(id) on delete cascade default auth.uid(),
  created_at   timestamptz not null default now()
);
create table if not exists bforcompta.seances_sport (
  id           uuid primary key default gen_random_uuid(),
  membre_id    uuid references bforcompta.membres_foyer(id) on delete cascade,
  activite_id  uuid references bforcompta.activites_sport(id) on delete set null,
  libelle      text,
  jour         date not null default current_date,
  duree_min    int not null default 30 check (duree_min > 0),
  intensite    int not null default 2 check (intensite between 1 and 3),
  distance_km  numeric(7,2),
  ressenti     int check (ressenti between 1 and 5),
  notes        text,
  proprietaire uuid references auth.users(id) on delete cascade default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists idx_seances_jour on bforcompta.seances_sport(jour);

-- ---------------------------------------------------------------- Règles d'accès (partage au foyer)
do $$ declare t text;
begin
  foreach t in array array['membres_foyer','menus','activites_sport','seances_sport'] loop
    execute format('alter table bforcompta.%I enable row level security', t);
    execute format('drop policy if exists foyer_acces on bforcompta.%I', t);
    execute format('create policy foyer_acces on bforcompta.%I for all to authenticated using (bforcompta.meme_foyer(proprietaire)) with check (bforcompta.peut_utiliser() and bforcompta.meme_foyer(proprietaire))', t);
  end loop;
end $$;
alter table bforcompta.foyer_parametres enable row level security;
drop policy if exists foyer_param on bforcompta.foyer_parametres;
create policy foyer_param on bforcompta.foyer_parametres for all to authenticated
  using (bforcompta.meme_foyer(proprietaire)) with check (proprietaire = auth.uid());
alter table bforcompta.recettes enable row level security;
drop policy if exists recettes_lecture on bforcompta.recettes;
drop policy if exists recettes_ecriture on bforcompta.recettes;
create policy recettes_lecture on bforcompta.recettes for select to authenticated using (proprietaire is null or bforcompta.meme_foyer(proprietaire));
create policy recettes_ecriture on bforcompta.recettes for all to authenticated
  using (proprietaire is not null and bforcompta.meme_foyer(proprietaire)) with check (bforcompta.peut_utiliser() and proprietaire = auth.uid());

grant all on bforcompta.foyer_parametres, bforcompta.membres_foyer, bforcompta.recettes, bforcompta.menus, bforcompta.activites_sport, bforcompta.seances_sport to authenticated, service_role;
do $$ declare t text;
begin
  foreach t in array array['membres_foyer','menus','seances_sport','activites_sport'] loop
    begin execute format('alter publication supabase_realtime add table bforcompta.%I', t); exception when duplicate_object then null; end;
  end loop;
end $$;

select 'ok' as foyer_cuisine_sport, (select count(*) from bforcompta.recettes where proprietaire is null) as recettes_de_base;
