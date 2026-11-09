-- ============================================================
-- Amore's Doodle — Supabase schema. Run once in SQL Editor.
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Me' check (char_length(display_name) between 1 and 40),
  avatar_url text,
  theme text not null default 'navy' check (theme in ('navy','forest')),
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Doodle' check (char_length(name) between 1 and 60),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.room_invites (
  code text primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_by uuid references auth.users(id),
  used_at timestamptz
);

create table public.doodles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  title text check (char_length(title) <= 80),
  created_at timestamptz not null default now()
);
create index doodles_room_created on public.doodles (room_id, created_at desc);

create table public.canvas_checkpoints (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  strokes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text check (char_length(body) <= 2000),
  doodle_id uuid references public.doodles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (body is not null or doodle_id is not null)
);
create index messages_room_created on public.messages (room_id, created_at desc);

-- Phase 2 (guessing game) tables
create table public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  drawer_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'drawing' check (status in ('drawing','guessing','solved','revealed')),
  winner_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
-- Secret prompt lives in its own table so the guesser cannot SELECT it while active.
create table public.game_secrets (
  round_id uuid primary key references public.game_rounds(id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 60)
);
create table public.game_guesses (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  guesser_id uuid not null references auth.users(id) on delete cascade,
  guess text not null check (char_length(guess) between 1 and 60),
  is_correct boolean not null default false,
  created_at timestamptz not null default now()
);
create index game_guesses_round_created on public.game_guesses (round_id, created_at asc);

-- ---------- Helper functions ----------
create or replace function public.safe_cast_uuid(val text)
returns uuid language plpgsql immutable as $$
begin
  return val::uuid;
exception when others then
  return null;
end $$;

create or replace function public.is_room_member(rid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.room_members where room_id = rid and user_id = auth.uid());
$$;

create or replace function public.shares_room_with(uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.room_members a
    join public.room_members b on a.room_id = b.room_id
    where a.user_id = auth.uid() and b.user_id = uid);
$$;

-- Hard limit: max two members per room (row-locks the room to avoid races).
create or replace function public.enforce_two_members()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.rooms where id = new.room_id for update;
  if (select count(*) from public.room_members where room_id = new.room_id) >= 2 then
    raise exception 'This room already has two members';
  end if;
  return new;
end $$;
drop trigger if exists room_members_max_two on public.room_members;
create trigger room_members_max_two before insert on public.room_members
  for each row execute function public.enforce_two_members();

create or replace function public.create_room(room_name text default 'Our Doodle')
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.rooms (name, created_by) values (coalesce(nullif(trim(room_name),''),'Our Doodle'), auth.uid())
    returning id into rid;
  insert into public.room_members (room_id, user_id) values (rid, auth.uid());
  return rid;
end $$;

create or replace function public.create_invite(rid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_room_member(rid) then raise exception 'Not a member of this room'; end if;
  c := upper(encode(gen_random_bytes(5), 'hex'));
  insert into public.room_invites (code, room_id, created_by, expires_at)
    values (c, rid, auth.uid(), now() + interval '48 hours');
  return c;
end $$;

create or replace function public.join_room(invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.room_invites;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into inv from public.room_invites
    where code = upper(trim(invite_code)) and used_by is null and expires_at > now() for update;
  if not found then raise exception 'Invite is invalid, used or expired'; end if;
  if exists (select 1 from public.room_members where room_id = inv.room_id and user_id = auth.uid()) then
    raise exception 'You are already a member of this room';
  end if;
  insert into public.room_members (room_id, user_id) values (inv.room_id, auth.uid());
  update public.room_invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  return inv.room_id;
end $$;

-- Check a guess without ever exposing the prompt to the guesser while the round is unresolved.
create or replace function public.submit_guess(rid uuid, guess_text text)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.game_rounds; ok boolean; clean_guess text;
begin
  clean_guess := trim(guess_text);
  if clean_guess is null or char_length(clean_guess) = 0 then
    raise exception 'Guess cannot be empty';
  end if;
  select * into r from public.game_rounds where id = rid;
  if not found or not public.is_room_member(r.room_id) then raise exception 'No access'; end if;
  if r.drawer_id = auth.uid() then raise exception 'Drawer cannot guess'; end if;
  if r.status in ('solved', 'revealed') then raise exception 'Round already ended'; end if;

  select lower(trim(prompt)) = lower(clean_guess) into ok from public.game_secrets where round_id = rid;
  insert into public.game_guesses (round_id, guesser_id, guess, is_correct)
    values (rid, auth.uid(), left(clean_guess, 60), coalesce(ok, false));
  if ok then
    update public.game_rounds set status = 'solved', winner_id = auth.uid() where id = rid;
  end if;
  return coalesce(ok, false);
end $$;

-- Auto-create profile on sign up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''), nullif(trim(split_part(new.email,'@',1)),''), 'Me'), 40)
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_invites enable row level security;
alter table public.doodles enable row level security;
alter table public.canvas_checkpoints enable row level security;
alter table public.messages enable row level security;
alter table public.game_rounds enable row level security;
alter table public.game_secrets enable row level security;
alter table public.game_guesses enable row level security;

create policy "profiles read self or partner" on public.profiles for select
  using (id = auth.uid() or public.shares_room_with(id));
create policy "profiles insert self" on public.profiles for insert
  with check (id = auth.uid());
create policy "profiles update self" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy "rooms read members" on public.rooms for select using (public.is_room_member(id));
create policy "rooms rename members" on public.rooms for update using (public.is_room_member(id)) with check (public.is_room_member(id));
create policy "rooms delete creator" on public.rooms for delete using (created_by = auth.uid());

create policy "members read" on public.room_members for select using (user_id = auth.uid() or public.is_room_member(room_id));
create policy "members leave" on public.room_members for delete using (user_id = auth.uid());

create policy "doodles read" on public.doodles for select using (public.is_room_member(room_id));
create policy "doodles insert" on public.doodles for insert
  with check (public.is_room_member(room_id) and creator_id = auth.uid());
create policy "doodles delete own" on public.doodles for delete using (creator_id = auth.uid());

create policy "checkpoints read" on public.canvas_checkpoints for select using (public.is_room_member(room_id));
create policy "checkpoints insert" on public.canvas_checkpoints for insert with check (public.is_room_member(room_id));
create policy "checkpoints update" on public.canvas_checkpoints for update using (public.is_room_member(room_id)) with check (public.is_room_member(room_id));

create policy "messages read" on public.messages for select using (public.is_room_member(room_id));
create policy "messages insert" on public.messages for insert
  with check (public.is_room_member(room_id) and sender_id = auth.uid());

create policy "rounds read" on public.game_rounds for select using (public.is_room_member(room_id));
create policy "rounds insert" on public.game_rounds for insert
  with check (public.is_room_member(room_id) and drawer_id = auth.uid());
create policy "rounds update drawer" on public.game_rounds for update
  using (drawer_id = auth.uid()) with check (drawer_id = auth.uid());

-- Secret prompt: Drawer can read anytime. Guesser can only read after round is solved or revealed.
create policy "secrets read" on public.game_secrets for select
  using (
    exists (
      select 1 from public.game_rounds r
      where r.id = round_id
        and (
          r.drawer_id = auth.uid()
          or (public.is_room_member(r.room_id) and r.status in ('solved', 'revealed'))
        )
    )
  );
create policy "secrets insert drawer" on public.game_secrets for insert
  with check (exists (select 1 from public.game_rounds r where r.id = round_id and r.drawer_id = auth.uid()));

create policy "guesses read" on public.game_guesses for select
  using (exists (select 1 from public.game_rounds r where r.id = round_id and public.is_room_member(r.room_id)));
-- Guesses are inserted only through submit_guess()

grant execute on function public.create_room(text), public.create_invite(uuid),
  public.join_room(text), public.submit_guess(uuid, text) to authenticated;

-- ---------- Storage (private bucket, path = <room_id>/<file>.png) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('doodles', 'doodles', false, 2097152, array['image/png'])
on conflict (id) do nothing;

create policy "doodle files read" on storage.objects for select
  using (bucket_id = 'doodles' and public.is_room_member(public.safe_cast_uuid((storage.foldername(name))[1])));
create policy "doodle files insert" on storage.objects for insert
  with check (bucket_id = 'doodles' and public.is_room_member(public.safe_cast_uuid((storage.foldername(name))[1])));
create policy "doodle files delete" on storage.objects for delete
  using (bucket_id = 'doodles' and public.is_room_member(public.safe_cast_uuid((storage.foldername(name))[1])));

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.doodles;
alter publication supabase_realtime add table public.game_rounds;
alter publication supabase_realtime add table public.game_guesses;

alter table public.messages replica identity full;
alter table public.doodles replica identity full;
alter table public.game_rounds replica identity full;
alter table public.game_guesses replica identity full;
