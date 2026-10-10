-- Auth: auto-create profile + viewer role on signup; creator onboarding RPC

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_username text;
begin
  v_base := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if v_base is null or length(v_base) < 3 then
    v_base := 'user';
  end if;
  -- id suffix keeps it unique and within the 30-char constraint
  v_username := substr(v_base, 1, 20) || '_' || substr(replace(new.id::text, '-', ''), 1, 6);

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, split_part(new.email, '@', 1));

  insert into public.user_roles (profile_id, role)
  values (new.id, 'viewer');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Creator onboarding: creates creator profile and grants creator role for the current user
create or replace function public.become_creator(p_creator_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creator_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_creator_name is null or length(trim(p_creator_name)) < 2 or length(trim(p_creator_name)) > 60 then
    raise exception 'invalid_creator_name';
  end if;

  select id into v_creator_id from public.creator_profiles where profile_id = v_uid;
  if v_creator_id is not null then
    return v_creator_id;
  end if;

  insert into public.creator_profiles (profile_id, creator_name)
  values (v_uid, trim(p_creator_name))
  returning id into v_creator_id;

  insert into public.user_roles (profile_id, role)
  values (v_uid, 'creator')
  on conflict do nothing;

  return v_creator_id;
end;
$$;

revoke all on function public.become_creator(text) from public;
grant execute on function public.become_creator(text) to authenticated;
