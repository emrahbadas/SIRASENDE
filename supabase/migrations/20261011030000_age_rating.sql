-- Content classification: mandatory age rating on productions

alter table public.productions
  add column age_rating text not null default '13+'
  check (age_rating in ('7+', '13+', '16+', '18+'));
