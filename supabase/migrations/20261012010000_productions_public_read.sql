-- Productions behind a published series are public (creator, age rating,
-- content warnings, production type are shown on the vitrine and in the app).
-- Without this, signed-out viewers saw series without those fields.

create policy "productions_public_read" on public.productions
  for select using (
    deleted_at is null
    and exists (
      select 1 from public.series s
      where s.production_id = productions.id
        and s.status = 'published'
        and s.deleted_at is null
    )
  );
