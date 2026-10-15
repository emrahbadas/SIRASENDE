-- Animated series (classic cartoons, 2D/3D animation) get their own category.
-- How a work was made (human / AI) stays in productions.production_type.
insert into public.categories (slug, name_tr, name_en) values
  ('animation', 'Animasyon', 'Animation')
on conflict (slug) do nothing;
