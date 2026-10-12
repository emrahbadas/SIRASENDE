-- Episode-level moderation: a published series can get new episodes that are
-- reviewed on their own, while the rest of the series stays on air.
--
-- Status flow (series and episodes):
--   draft / rejected / needs_changes → moderating        (creator submits)
--   moderating → published / rejected / needs_changes   (staff decides)
--   published ⇄ paused                                   (creator pauses/resumes)
--   any → blocked, blocked → published                  (staff takedown/restore)

alter table public.episodes add column moderation_note text;

-- Owners can update their rows through RLS (titles, poster, …). This trigger
-- keeps them from changing status in ways only moderation may (e.g. publishing
-- their own episode). Staff, the service role and migrations are not limited.
create or replace function public.guard_content_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_new text := new.status::text;
begin
  if auth.uid() is null or public.has_role('admin') or public.has_role('moderator') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_new <> 'draft' then
      raise exception 'status_not_allowed';
    end if;
    return new;
  end if;

  v_old := old.status::text;
  if v_new = v_old
     or (v_old in ('draft', 'rejected', 'needs_changes') and v_new = 'moderating')
     or (v_old = 'published' and v_new = 'paused')
     or (v_old = 'paused' and v_new = 'published') then
    return new;
  end if;

  raise exception 'status_transition_not_allowed: % -> %', v_old, v_new;
end;
$$;

revoke all on function public.guard_content_status() from public, anon, authenticated;

create trigger trg_series_guard_status before insert or update of status on public.series
  for each row execute function public.guard_content_status();

create trigger trg_episodes_guard_status before insert or update of status on public.episodes
  for each row execute function public.guard_content_status();

-- Series already under review: their draft episodes are part of that review
update public.episodes e
set status = 'moderating'
from public.seasons se
join public.series s on s.id = se.series_id
where e.season_id = se.id and s.status = 'moderating' and e.status = 'draft';
