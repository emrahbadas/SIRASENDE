-- Phase 5: watch progress ("continue watching"). Written through an RPC so the
-- series is derived from the episode and clients cannot store arbitrary rows.

create table public.watch_progress (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  episode_id uuid not null references public.episodes (id) on delete cascade,
  series_id uuid not null references public.series (id) on delete cascade,
  position_seconds int not null default 0 check (position_seconds >= 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id, episode_id)
);

create index idx_watch_progress_recent on public.watch_progress (profile_id, updated_at desc);
create index idx_watch_progress_series on public.watch_progress (series_id);

alter table public.watch_progress enable row level security;

create policy "watch_progress_self_read" on public.watch_progress
  for select using (profile_id = (select auth.uid()));

create policy "watch_progress_self_delete" on public.watch_progress
  for delete using (profile_id = (select auth.uid()));

-- Upsert the caller's position; only for episodes they are allowed to watch.
create or replace function public.save_watch_progress(
  p_episode_id uuid,
  p_position_seconds int,
  p_completed boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_series uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_watch_episode(p_episode_id) then
    raise exception 'episode_locked';
  end if;

  select series_id into v_series from public.episode_context(p_episode_id);

  insert into public.watch_progress (profile_id, episode_id, series_id, position_seconds, completed, updated_at)
  values (v_uid, p_episode_id, v_series, greatest(0, p_position_seconds), p_completed, now())
  on conflict (profile_id, episode_id) do update
    set position_seconds = excluded.position_seconds,
        completed = public.watch_progress.completed or excluded.completed,
        updated_at = now();
end;
$$;

-- Latest episode per series the caller has been watching, newest first.
create or replace function public.my_continue_watching(p_limit int default 10)
returns table (
  series_id uuid,
  episode_id uuid,
  episode_number int,
  season_number int,
  position_seconds int,
  completed boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select distinct on (wp.series_id)
      wp.series_id, wp.episode_id, e.episode_number, se.season_number,
      wp.position_seconds, wp.completed, wp.updated_at
    from public.watch_progress wp
    join public.episodes e on e.id = wp.episode_id
    join public.seasons se on se.id = e.season_id
    join public.series s on s.id = wp.series_id
    where wp.profile_id = auth.uid()
      and s.status = 'published' and s.deleted_at is null
      and e.status = 'published'
    order by wp.series_id, wp.updated_at desc
  ) latest
  order by latest.updated_at desc
  limit greatest(1, least(p_limit, 50));
$$;

revoke all on function public.save_watch_progress(uuid, int, boolean) from public, anon;
grant execute on function public.save_watch_progress(uuid, int, boolean) to authenticated, service_role;
revoke all on function public.my_continue_watching(int) from public, anon;
grant execute on function public.my_continue_watching(int) to authenticated, service_role;
