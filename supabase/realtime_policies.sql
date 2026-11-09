-- ============================================================
-- Amore's Doodle — Realtime Authorization Policies
-- ============================================================
-- NOTE: Do NOT include "ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;"
-- RLS is already enabled by Supabase by default on realtime.messages.
-- Attempting to ALTER it as the 'postgres' role throws error 42501.

-- 1. Remove existing policies if re-running
drop policy if exists "realtime_canvas_members_only" on realtime.messages;
drop policy if exists "realtime_game_members_only" on realtime.messages;
drop policy if exists "realtime_presence_members_only" on realtime.messages;

-- 2. Canvas channel: topic format "canvas:<room_id>"
create policy "realtime_canvas_members_only"
on realtime.messages
for all
to authenticated
using (
  realtime.topic() like 'canvas:%'
  and public.is_room_member(public.safe_cast_uuid(split_part(realtime.topic(), ':', 2)))
)
with check (
  realtime.topic() like 'canvas:%'
  and public.is_room_member(public.safe_cast_uuid(split_part(realtime.topic(), ':', 2)))
);

-- 3. Guessing game channel: topic format "game:<round_id>"
create policy "realtime_game_members_only"
on realtime.messages
for all
to authenticated
using (
  realtime.topic() like 'game:%'
  and exists (
    select 1 from public.game_rounds r
    where r.id = public.safe_cast_uuid(split_part(realtime.topic(), ':', 2))
      and public.is_room_member(r.room_id)
  )
)
with check (
  realtime.topic() like 'game:%'
  and exists (
    select 1 from public.game_rounds r
    where r.id = public.safe_cast_uuid(split_part(realtime.topic(), ':', 2))
      and public.is_room_member(r.room_id)
  )
);

-- 4. Room Presence channel: topic format "presence:<room_id>"
create policy "realtime_presence_members_only"
on realtime.messages
for all
to authenticated
using (
  realtime.topic() like 'presence:%'
  and public.is_room_member(public.safe_cast_uuid(split_part(realtime.topic(), ':', 2)))
)
with check (
  realtime.topic() like 'presence:%'
  and public.is_room_member(public.safe_cast_uuid(split_part(realtime.topic(), ':', 2)))
);
