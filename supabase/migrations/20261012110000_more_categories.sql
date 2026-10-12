-- Categories beyond scripted drama, still in the short vertical episode format:
-- faith-themed series, stage (theatre sketches / plays split into episodes)
-- and talk / mini-lesson series. Empty categories are not shown to viewers.
insert into public.categories (slug, name_tr, name_en) values
  ('faith', 'Manevi', 'Faith'),
  ('stage', 'Sahne', 'Stage'),
  ('talk', 'Bilgi & Sohbet', 'Talks & Learning')
on conflict (slug) do nothing;
