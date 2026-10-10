-- Seed: initial categories from the blueprint (idempotent)
insert into public.categories (slug, name_tr, name_en) values
  ('romance', 'Romantik', 'Romance'),
  ('drama', 'Dram', 'Drama'),
  ('crime', 'Suç', 'Crime'),
  ('thriller', 'Gerilim', 'Thriller'),
  ('horror', 'Korku', 'Horror'),
  ('sci-fi', 'Bilim Kurgu', 'Sci-Fi'),
  ('comedy', 'Komedi', 'Comedy'),
  ('mystery', 'Gizem', 'Mystery'),
  ('fantasy', 'Fantastik', 'Fantasy'),
  ('action', 'Aksiyon', 'Action')
on conflict (slug) do nothing;
