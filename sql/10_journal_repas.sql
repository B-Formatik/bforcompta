-- =====================================================================
--  B-S@fe — Petit-déjeuner et goûter dans les menus + journal « ce que j'ai mangé » (analyse et conseils nutrition)
-- =====================================================================
set search_path = bforcompta, extensions, public;

create table if not exists bforcompta.repas_journal (
  id           uuid primary key default gen_random_uuid(),
  jour         date not null default current_date,
  repas        text not null default 'dejeuner' check (repas in ('petit_dejeuner','dejeuner','gouter','diner','collation')),
  membre_id    uuid references bforcompta.membres_foyer(id) on delete cascade,   -- null = moi
  recette_id   uuid references bforcompta.recettes(id) on delete set null,
  description  text not null,
  quantite     text not null default 'normale' check (quantite in ('petite','normale','grande')),
  notes        text,
  proprietaire uuid references auth.users(id) on delete cascade default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists idx_journal_jour on bforcompta.repas_journal(jour);
alter table bforcompta.repas_journal enable row level security;
drop policy if exists foyer_acces on bforcompta.repas_journal;
create policy foyer_acces on bforcompta.repas_journal for all to authenticated
  using (bforcompta.meme_foyer(proprietaire)) with check (bforcompta.peut_utiliser() and bforcompta.meme_foyer(proprietaire));
grant all on bforcompta.repas_journal to authenticated, service_role;
do $$ begin alter publication supabase_realtime add table bforcompta.repas_journal; exception when duplicate_object then null; end $$;

-- Petits-déjeuners et goûters équilibrés (pour 4)
insert into bforcompta.recettes (nom, icone, type_repas, proteine, temps_min, difficulte, tags, legumes, feculent, ingredients, instructions, proprietaire)
select v.nom, v.icone, v.type_repas, v.proteine, v.temps, 1, v.tags, false, v.fec, v.ing::jsonb, v.instr, null from (values
 ('Porridge à la banane et à la cannelle', '🥣', 'petit_dejeuner', 'vegetal', 10, '{rapide,vegetarien,sans_porc}'::text[], true,
  '[{"q":200,"u":"g","n":"Flocons d''avoine","k":"avoine"},{"q":80,"u":"cl","n":"Lait","k":"lait"},{"q":2,"u":"pièce","n":"Bananes","k":"banane"},{"q":1,"u":"c. à c.","n":"Cannelle","k":"cannelle","b":1}]',
  E'Chauffer le lait avec les flocons 5 min en remuant.\nAjouter la banane écrasée et la cannelle. Pas besoin de sucre.'),
 ('Tartines de pain complet, fromage blanc et fruit', '🍞', 'petit_dejeuner', 'vegetal', 5, '{rapide,vegetarien,sans_porc,enfants}'::text[], true,
  '[{"q":300,"u":"g","n":"Pain complet","k":"pain"},{"q":400,"u":"g","n":"Fromage blanc","k":"fromage blanc"},{"q":4,"u":"pièce","n":"Fruits de saison","k":"fruit"}]',
  E'Toaster le pain.\nServir avec le fromage blanc et un fruit entier par personne.'),
 ('Œufs brouillés, pain complet et tomate', '🍳', 'petit_dejeuner', 'oeufs', 10, '{rapide,vegetarien,sans_porc}'::text[], true,
  '[{"q":6,"u":"pièce","n":"Œufs","k":"oeuf"},{"q":250,"u":"g","n":"Pain complet","k":"pain"},{"q":2,"u":"pièce","n":"Tomates","k":"tomate"}]',
  E'Battre les œufs, les cuire à feu doux en remuant.\nServir avec le pain et la tomate en tranches.'),
 ('Yaourt, muesli sans sucre et mangue', '🥭', 'petit_dejeuner', 'vegetal', 5, '{rapide,vegetarien,sans_porc,enfants}'::text[], true,
  '[{"q":4,"u":"pièce","n":"Yaourts nature","k":"yaourt"},{"q":160,"u":"g","n":"Muesli sans sucre ajouté","k":"muesli"},{"q":1,"u":"pièce","n":"Mangue","k":"mangue"},{"q":0.5,"u":"pièce","n":"Papaye","k":"papaye"}]',
  E'Couper les fruits en dés.\nMélanger yaourt, muesli et fruits.'),
 ('Chocolat chaud peu sucré, pain et ananas', '☕', 'petit_dejeuner', 'vegetal', 10, '{antillais,vegetarien,sans_porc,enfants}'::text[], true,
  '[{"q":80,"u":"cl","n":"Lait","k":"lait"},{"q":4,"u":"c. à s.","n":"Cacao pur non sucré","k":"cacao"},{"q":250,"u":"g","n":"Pain","k":"pain"},{"q":0.5,"u":"pièce","n":"Ananas","k":"ananas"}]',
  E'Chauffer le lait avec le cacao (1 c. à c. de sucre maximum par tasse).\nServir avec le pain et l''ananas.'),
 ('Smoothie banane-mangue et tartine', '🥤', 'petit_dejeuner', 'vegetal', 5, '{rapide,vegetarien,sans_porc,enfants}'::text[], true,
  '[{"q":2,"u":"pièce","n":"Bananes","k":"banane"},{"q":1,"u":"pièce","n":"Mangue","k":"mangue"},{"q":50,"u":"cl","n":"Lait ou yaourt","k":"lait"},{"q":200,"u":"g","n":"Pain complet","k":"pain"}]',
  E'Mixer les fruits avec le lait.\nServir avec une tartine de pain complet.'),
 ('Fruit et yaourt nature', '🍌', 'gouter', 'vegetal', 2, '{rapide,vegetarien,sans_porc,sans_gluten,enfants}'::text[], false,
  '[{"q":4,"u":"pièce","n":"Fruits de saison","k":"fruit"},{"q":4,"u":"pièce","n":"Yaourts nature","k":"yaourt"}]', E'Servir un fruit entier et un yaourt par personne.'),
 ('Pain et deux carrés de chocolat noir', '🍫', 'gouter', 'vegetal', 2, '{rapide,vegetarien,sans_porc,enfants}'::text[], true,
  '[{"q":200,"u":"g","n":"Pain","k":"pain"},{"q":8,"u":"pièce","n":"Carrés de chocolat noir","k":"chocolat"},{"q":4,"u":"pièce","n":"Fruits","k":"fruit"}]', E'Un morceau de pain avec 2 carrés de chocolat et un fruit.'),
 ('Compote sans sucre ajouté et biscuits secs', '🍎', 'gouter', 'vegetal', 2, '{rapide,vegetarien,sans_porc,enfants}'::text[], true,
  '[{"q":4,"u":"pièce","n":"Compotes sans sucre ajouté","k":"compote"},{"q":8,"u":"pièce","n":"Biscuits secs","k":"biscuit"},{"q":50,"u":"cl","n":"Lait","k":"lait"}]', E'Une compote, deux biscuits secs et un verre de lait.')
) v(nom, icone, type_repas, proteine, temps, tags, fec, ing, instr)
where not exists (select 1 from bforcompta.recettes r where r.nom = v.nom);

select 'ok' as journal_repas, (select count(*) from bforcompta.recettes where type_repas in ('petit_dejeuner','gouter')) as petits_dejeuners_gouters;
