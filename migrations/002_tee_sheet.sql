-- =====================================================================
--  DESIGNATED DRIVERS — Migration 002: The Tee Sheet
--  Run ONCE in Supabase → SQL Editor, AFTER supabase-schema.sql.
--
--  Purely additive: it adds one nullable column (fixtures.tee_time), six
--  new tables and their functions/policies. It does not modify or delete
--  any existing result, fixture, fine, season or administrator.
--  Safe to re-run. To undo it, run 002_tee_sheet_rollback.sql.
-- =====================================================================

set client_min_messages = warning;
begin;

-- ---------------------------------------------------------------------
-- 1. Existing table: one new, nullable column
-- ---------------------------------------------------------------------
alter table public.fixtures add column if not exists tee_time time;

-- ---------------------------------------------------------------------
-- 2. Player logins. Each auth user maps to exactly ONE player and each
--    player to at most one login. Managed only from the SQL editor.
-- ---------------------------------------------------------------------
create table if not exists public.player_accounts (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  player_id   text not null unique references public.players(id) on update cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Scheduling tables
-- ---------------------------------------------------------------------
create table if not exists public.scheduling_polls (
  id                 uuid primary key default gen_random_uuid(),
  season_id          uuid not null references public.seasons(id) on delete cascade,
  fixture_id         uuid not null references public.fixtures(id) on delete cascade,
  status             text not null default 'polling' check (status in ('polling', 'agreed', 'confirmed', 'cancelled')),
  timezone           text not null default 'Australia/Perth',
  voting_deadline    timestamptz,
  close_at_deadline  boolean not null default false,   -- only when true does voting stop at the deadline
  notes              text,
  -- stage 2: date agreed
  agreed_slot_id     uuid,
  agreed_at          timestamptz,
  agreed_by          uuid,
  -- stage 3: tee time confirmed (wall-clock date + time in `timezone`)
  tee_date           date,
  tee_time           time,
  course             text,
  booking_ref        text,
  booking_notes      text,
  duration_minutes   int not null default 270 check (duration_minutes between 60 and 720),
  confirmed_at       timestamptz,
  confirmed_by       uuid,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint polls_agreed_has_slot check (status <> 'agreed' or agreed_slot_id is not null),
  constraint polls_confirmed_complete check (status <> 'confirmed' or (tee_date is not null and tee_time is not null and coalesce(trim(course), '') <> ''))
);
-- A round can have at most ONE live poll (cancelled polls are kept as history).
create unique index if not exists scheduling_polls_one_active_per_fixture
  on public.scheduling_polls (fixture_id) where status <> 'cancelled';

create table if not exists public.scheduling_slots (
  id             uuid primary key default gen_random_uuid(),
  poll_id        uuid not null references public.scheduling_polls(id) on delete cascade,
  proposed_date  date not null,
  time_window    text not null default 'anytime' check (time_window in ('morning', 'midday', 'afternoon', 'anytime', 'time')),
  start_time     time,
  notes          text,
  preferred      boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint slots_time_needs_start check (time_window <> 'time' or start_time is not null),
  unique (id, poll_id)
);
create unique index if not exists scheduling_slots_no_duplicates
  on public.scheduling_slots (poll_id, proposed_date, time_window, coalesce(start_time, '00:00'));

-- The agreed slot must belong to the same poll.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'polls_agreed_slot_fk') then
    alter table public.scheduling_polls add constraint polls_agreed_slot_fk
      foreign key (agreed_slot_id, id) references public.scheduling_slots (id, poll_id);
  end if;
end $$;

-- One current vote per player per slot (latest vote replaces the previous one).
create table if not exists public.scheduling_votes (
  id          uuid primary key default gen_random_uuid(),
  slot_id     uuid not null references public.scheduling_slots(id) on delete cascade,
  player_id   text not null references public.players(id) on update cascade,
  status      text not null check (status in ('available', 'maybe', 'unavailable')),
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (slot_id, player_id)
);

-- Who has agreed to the locked-in date ("via": their Available vote, an explicit
-- confirmation, or an administrator recording it on their behalf).
create table if not exists public.scheduling_agreements (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.scheduling_polls(id) on delete cascade,
  player_id   text not null references public.players(id) on update cascade,
  via         text not null check (via in ('vote', 'confirmation', 'admin')),
  agreed_at   timestamptz not null default now(),
  unique (poll_id, player_id)
);

-- Append-only history of everything that happened to a poll.
create table if not exists public.scheduling_events (
  id               uuid primary key default gen_random_uuid(),
  poll_id          uuid not null references public.scheduling_polls(id) on delete cascade,
  event_type       text not null,
  actor_id         uuid,
  actor_player_id  text references public.players(id) on update cascade,
  event_data       jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists scheduling_slots_poll_idx       on public.scheduling_slots(poll_id);
create index if not exists scheduling_votes_slot_idx       on public.scheduling_votes(slot_id);
create index if not exists scheduling_agreements_poll_idx  on public.scheduling_agreements(poll_id);
create index if not exists scheduling_events_poll_idx      on public.scheduling_events(poll_id, created_at);

drop trigger if exists set_updated_at on public.scheduling_polls;
create trigger set_updated_at before update on public.scheduling_polls for each row execute function public.tg_set_updated_at();
drop trigger if exists set_updated_at on public.scheduling_votes;
create trigger set_updated_at before update on public.scheduling_votes for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Functions. All writes go through these; each re-checks permissions.
-- ---------------------------------------------------------------------

-- The player this login is linked to (null for visitors / unlinked logins).
create or replace function public.current_player_id() returns text
language sql stable security definer set search_path = public as $$
  select player_id from public.player_accounts where user_id = auth.uid();
$$;

create or replace function public.tee_log(p_poll uuid, p_type text, p_data jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.scheduling_events (poll_id, event_type, actor_id, actor_player_id, event_data)
  values (p_poll, p_type, auth.uid(), public.current_player_id(), coalesce(p_data, '{}'::jsonb));
$$;

create or replace function public.tee_add_slot(p_poll uuid, p_date date, p_window text, p_start time, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_window text := coalesce(nullif(trim(p_window), ''), 'anytime');
begin
  if p_date is null then raise exception 'Each proposed slot needs a date'; end if;
  if v_window not in ('morning', 'midday', 'afternoon', 'anytime', 'time') then raise exception 'Unknown time window'; end if;
  if v_window = 'time' and p_start is null then raise exception 'A set-time slot needs a start time'; end if;
  if exists (select 1 from public.scheduling_slots where poll_id = p_poll and proposed_date = p_date and time_window = v_window
             and coalesce(start_time, '00:00') = coalesce(case when v_window = 'time' then p_start end, '00:00')) then
    raise exception 'That date and time is already on the tee sheet';
  end if;
  insert into public.scheduling_slots (poll_id, proposed_date, time_window, start_time, notes)
  values (p_poll, p_date, v_window, case when v_window = 'time' then p_start end, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Open a poll for a round. p_slots: [{"date":"2026-12-05","window":"morning","start_time":null,"notes":null}, …]
create or replace function public.create_poll(
  p_fixture_id uuid, p_deadline timestamptz default null, p_notes text default null,
  p_timezone text default 'Australia/Perth', p_close_at_deadline boolean default false, p_slots jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_season uuid; v_id uuid; s jsonb; v_tz text := coalesce(nullif(trim(p_timezone), ''), 'Australia/Perth');
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select season_id into v_season from public.fixtures where id = p_fixture_id for update;   -- serialise double-clicks / two organisers
  if not found then raise exception 'Fixture not found'; end if;
  if exists (select 1 from public.results where fixture_id = p_fixture_id) then raise exception 'That round has already been played'; end if;
  if exists (select 1 from public.scheduling_polls where fixture_id = p_fixture_id and status <> 'cancelled') then
    raise exception 'This round already has a scheduling poll';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then raise exception 'Unknown time zone: %', v_tz; end if;
  if jsonb_typeof(coalesce(p_slots, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_slots, '[]'::jsonb)) = 0 then
    raise exception 'Propose at least one date';
  end if;
  insert into public.scheduling_polls (season_id, fixture_id, voting_deadline, close_at_deadline, notes, timezone, created_by)
  values (v_season, p_fixture_id, p_deadline, coalesce(p_close_at_deadline, false), nullif(trim(coalesce(p_notes, '')), ''), v_tz, auth.uid())
  returning id into v_id;
  for s in select * from jsonb_array_elements(p_slots) loop
    perform public.tee_add_slot(v_id, (s->>'date')::date, s->>'window', nullif(s->>'start_time', '')::time, s->>'notes');
  end loop;
  perform public.tee_log(v_id, 'poll_opened', jsonb_build_object('slots', jsonb_array_length(p_slots)));
  return v_id;
end $$;

create or replace function public.add_poll_slot(p_poll_id uuid, p_date date, p_window text default 'anytime', p_start_time time default null, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  perform 1 from public.scheduling_polls where id = p_poll_id and status = 'polling' for update;
  if not found then raise exception 'Dates can only be added while voting is open'; end if;
  v_id := public.tee_add_slot(p_poll_id, p_date, p_window, p_start_time, p_notes);
  perform public.tee_log(p_poll_id, 'slot_added', jsonb_build_object('date', p_date, 'window', p_window, 'start_time', p_start_time));
  return v_id;
end $$;

create or replace function public.remove_poll_slot(p_slot_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_poll uuid; v_slot record;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select s.* into v_slot from public.scheduling_slots s where s.id = p_slot_id;
  if not found then raise exception 'Slot not found'; end if;
  select id into v_poll from public.scheduling_polls where id = v_slot.poll_id and status = 'polling' for update;
  if not found then raise exception 'Dates can only be removed while voting is open'; end if;
  perform public.tee_log(v_poll, 'slot_removed', jsonb_build_object('date', v_slot.proposed_date, 'window', v_slot.time_window, 'start_time', v_slot.start_time,
    'votes', (select coalesce(jsonb_object_agg(player_id, status), '{}'::jsonb) from public.scheduling_votes where slot_id = p_slot_id)));
  delete from public.scheduling_slots where id = p_slot_id;
end $$;

create or replace function public.set_slot_preferred(p_slot_id uuid, p_preferred boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  update public.scheduling_slots set preferred = coalesce(p_preferred, false) where id = p_slot_id;
end $$;

create or replace function public.update_poll(p_poll_id uuid, p_deadline timestamptz, p_close_at_deadline boolean, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  update public.scheduling_polls set voting_deadline = p_deadline, close_at_deadline = coalesce(p_close_at_deadline, false),
    notes = nullif(trim(coalesce(p_notes, '')), '') where id = p_poll_id and status = 'polling';
  if not found then raise exception 'Poll is not open'; end if;
  perform public.tee_log(p_poll_id, 'poll_updated', jsonb_build_object('deadline', p_deadline));
end $$;

-- Internal: write one vote (upsert — never a duplicate row).
create or replace function public.tee_write_vote(p_slot uuid, p_player text, p_status text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_poll record;
begin
  if p_status not in ('available', 'maybe', 'unavailable') then raise exception 'Unknown availability'; end if;
  select p.* into v_poll from public.scheduling_slots s join public.scheduling_polls p on p.id = s.poll_id where s.id = p_slot;
  if not found then raise exception 'That date is no longer on the tee sheet'; end if;
  if v_poll.status <> 'polling' then raise exception 'Voting is closed for this round'; end if;
  insert into public.scheduling_votes (slot_id, player_id, status, updated_by) values (p_slot, p_player, p_status, auth.uid())
  on conflict (slot_id, player_id) do update set status = excluded.status, updated_by = excluded.updated_by;
  return v_poll.id;
end $$;

-- A player votes for THEMSELVES. There is no player parameter: identity comes
-- only from the login, so nobody can vote on someone else's behalf.
create or replace function public.cast_vote(p_slot_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_player text := public.current_player_id(); v_poll record;
begin
  if v_player is null then raise exception 'Your login is not linked to a player' using errcode = '42501'; end if;
  select p.* into v_poll from public.scheduling_slots s join public.scheduling_polls p on p.id = s.poll_id where s.id = p_slot_id;
  if found and v_poll.close_at_deadline and v_poll.voting_deadline is not null and now() > v_poll.voting_deadline then
    raise exception 'The voting deadline has passed';
  end if;
  perform public.tee_write_vote(p_slot_id, v_player, p_status);
end $$;

-- Administrators may correct a vote; every correction is logged.
create or replace function public.admin_set_vote(p_slot_id uuid, p_player_id text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_poll uuid;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  if not exists (select 1 from public.players where id = p_player_id) then raise exception 'Unknown player'; end if;
  v_poll := public.tee_write_vote(p_slot_id, p_player_id, p_status);
  perform public.tee_log(v_poll, 'vote_corrected', jsonb_build_object('player', p_player_id, 'status', p_status,
    'date', (select proposed_date from public.scheduling_slots where id = p_slot_id)));
end $$;

-- Stage 2: lock in a date. Refused if anyone is explicitly Unavailable.
-- Players who voted Available are recorded as agreed; everyone else must confirm.
create or replace function public.lock_in_date(p_poll_id uuid, p_slot_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_slot record;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  perform 1 from public.scheduling_polls where id = p_poll_id and status = 'polling' for update;
  if not found then raise exception 'A date can only be locked in while voting is open'; end if;
  select * into v_slot from public.scheduling_slots where id = p_slot_id and poll_id = p_poll_id;
  if not found then raise exception 'That date is not part of this poll'; end if;
  if exists (select 1 from public.scheduling_votes where slot_id = p_slot_id and status = 'unavailable') then
    raise exception 'Someone is unavailable on that date — it cannot be locked in';
  end if;
  update public.scheduling_polls set status = 'agreed', agreed_slot_id = p_slot_id, agreed_at = now(), agreed_by = auth.uid() where id = p_poll_id;
  delete from public.scheduling_agreements where poll_id = p_poll_id;
  insert into public.scheduling_agreements (poll_id, player_id, via)
    select p_poll_id, player_id, 'vote' from public.scheduling_votes where slot_id = p_slot_id and status = 'available';
  perform public.tee_log(p_poll_id, 'date_agreed', jsonb_build_object('date', v_slot.proposed_date, 'window', v_slot.time_window, 'start_time', v_slot.start_time,
    'votes', (select coalesce(jsonb_object_agg(player_id, status), '{}'::jsonb) from public.scheduling_votes where slot_id = p_slot_id)));
end $$;

create or replace function public.tee_record_agreement(p_poll uuid, p_player text, p_via text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.scheduling_polls where id = p_poll and status = 'agreed' for update;
  if not found then raise exception 'There is no agreed date to confirm'; end if;
  insert into public.scheduling_agreements (poll_id, player_id, via) values (p_poll, p_player, p_via) on conflict (poll_id, player_id) do nothing;
  if found then perform public.tee_log(p_poll, 'player_confirmed', jsonb_build_object('player', p_player, 'via', p_via)); end if;
end $$;

-- A "Maybe" (or silent) player explicitly says "I'm in" — for themselves only.
create or replace function public.confirm_attendance(p_poll_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_player text := public.current_player_id();
begin
  if v_player is null then raise exception 'Your login is not linked to a player' using errcode = '42501'; end if;
  perform public.tee_record_agreement(p_poll_id, v_player, 'confirmation');
end $$;

create or replace function public.admin_confirm_attendance(p_poll_id uuid, p_player_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  if not exists (select 1 from public.players where id = p_player_id) then raise exception 'Unknown player'; end if;
  perform public.tee_record_agreement(p_poll_id, p_player_id, 'admin');
end $$;

-- Stage 3: the course is booked. Also used to amend a confirmed booking.
-- Updates the EXISTING fixture row in the same transaction (no second fixture).
create or replace function public.confirm_tee_time(
  p_poll_id uuid, p_course text, p_tee_date date, p_tee_time time,
  p_booking_ref text default null, p_notes text default null, p_duration_minutes int default 270
) returns void
language plpgsql security definer set search_path = public as $$
declare v_poll record; v_missing text; v_players int;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select * into v_poll from public.scheduling_polls where id = p_poll_id for update;
  if not found then raise exception 'Poll not found'; end if;
  if v_poll.status not in ('agreed', 'confirmed') then raise exception 'Lock in a date before confirming the tee time'; end if;
  if coalesce(trim(p_course), '') = '' then raise exception 'Golf course is required'; end if;
  if p_tee_date is null or p_tee_time is null then raise exception 'Tee-off date and time are required'; end if;
  if coalesce(p_duration_minutes, 270) not between 60 and 720 then raise exception 'Duration must be between 1 and 12 hours'; end if;
  if exists (select 1 from public.results where fixture_id = v_poll.fixture_id) then raise exception 'That round has already been played'; end if;
  if v_poll.status = 'agreed' then
    select count(*) into v_players from public.players;
    select string_agg(pl.name, ', ' order by pl.sort_order) into v_missing from public.players pl
      where not exists (select 1 from public.scheduling_agreements a where a.poll_id = p_poll_id and a.player_id = pl.id);
    if v_missing is not null then raise exception 'Still awaiting confirmation from %', v_missing; end if;
  end if;
  update public.scheduling_polls set status = 'confirmed', course = trim(p_course), tee_date = p_tee_date, tee_time = p_tee_time,
    booking_ref = nullif(trim(coalesce(p_booking_ref, '')), ''), booking_notes = nullif(trim(coalesce(p_notes, '')), ''),
    duration_minutes = coalesce(p_duration_minutes, 270),
    confirmed_at = now(), confirmed_by = auth.uid() where id = p_poll_id;
  update public.fixtures set scheduled_date = p_tee_date, tee_time = p_tee_time, course = trim(p_course) where id = v_poll.fixture_id;
  perform public.tee_log(p_poll_id, case when v_poll.status = 'confirmed' then 'booking_amended' else 'tee_time_confirmed' end,
    jsonb_build_object('course', trim(p_course), 'tee_date', p_tee_date, 'tee_time', p_tee_time, 'booking_ref', nullif(trim(coalesce(p_booking_ref, '')), ''),
      'previous', case when v_poll.status = 'confirmed' then jsonb_build_object('course', v_poll.course, 'tee_date', v_poll.tee_date, 'tee_time', v_poll.tee_time) end));
end $$;

-- Plans changed: go back to voting. Votes are kept; the old agreement / booking is preserved in the history.
create or replace function public.reopen_poll(p_poll_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_poll record;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select * into v_poll from public.scheduling_polls where id = p_poll_id for update;
  if not found then raise exception 'Poll not found'; end if;
  if v_poll.status not in ('agreed', 'confirmed') then raise exception 'Only an agreed or confirmed round can be reopened'; end if;
  if exists (select 1 from public.results where fixture_id = v_poll.fixture_id) then raise exception 'That round has already been played'; end if;
  perform public.tee_log(p_poll_id, 'reopened', jsonb_build_object('from', v_poll.status, 'course', v_poll.course, 'tee_date', v_poll.tee_date, 'tee_time', v_poll.tee_time,
    'booking_ref', v_poll.booking_ref, 'agreed_date', (select proposed_date from public.scheduling_slots where id = v_poll.agreed_slot_id),
    'agreed_by', (select coalesce(jsonb_agg(player_id), '[]'::jsonb) from public.scheduling_agreements where poll_id = p_poll_id)));
  delete from public.scheduling_agreements where poll_id = p_poll_id;
  update public.scheduling_polls set status = 'polling', agreed_slot_id = null, agreed_at = null, agreed_by = null,
    tee_date = null, tee_time = null, booking_ref = null, booking_notes = null, confirmed_at = null, confirmed_by = null where id = p_poll_id;
  if v_poll.status = 'confirmed' then update public.fixtures set tee_time = null where id = v_poll.fixture_id; end if;
end $$;

create or replace function public.cancel_poll(p_poll_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_poll record;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select * into v_poll from public.scheduling_polls where id = p_poll_id for update;
  if not found then raise exception 'Poll not found'; end if;
  if v_poll.status = 'cancelled' then return; end if;
  if v_poll.status = 'confirmed' and not exists (select 1 from public.results where fixture_id = v_poll.fixture_id) then
    update public.fixtures set tee_time = null where id = v_poll.fixture_id;
  end if;
  perform public.tee_log(p_poll_id, 'cancelled', jsonb_build_object('from', v_poll.status));
  update public.scheduling_polls set status = 'cancelled' where id = p_poll_id;
end $$;

-- ---------------------------------------------------------------------
-- 5. Permissions
-- ---------------------------------------------------------------------
revoke all on function public.tee_log(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.tee_add_slot(uuid, date, text, time, text) from public, anon, authenticated;
revoke all on function public.tee_write_vote(uuid, text, text) from public, anon, authenticated;
revoke all on function public.tee_record_agreement(uuid, text, text) from public, anon, authenticated;

revoke all on function public.create_poll(uuid, timestamptz, text, text, boolean, jsonb) from public, anon;
revoke all on function public.add_poll_slot(uuid, date, text, time, text) from public, anon;
revoke all on function public.remove_poll_slot(uuid) from public, anon;
revoke all on function public.set_slot_preferred(uuid, boolean) from public, anon;
revoke all on function public.update_poll(uuid, timestamptz, boolean, text) from public, anon;
revoke all on function public.cast_vote(uuid, text) from public, anon;
revoke all on function public.admin_set_vote(uuid, text, text) from public, anon;
revoke all on function public.lock_in_date(uuid, uuid) from public, anon;
revoke all on function public.confirm_attendance(uuid) from public, anon;
revoke all on function public.admin_confirm_attendance(uuid, text) from public, anon;
revoke all on function public.confirm_tee_time(uuid, text, date, time, text, text, int) from public, anon;
revoke all on function public.reopen_poll(uuid) from public, anon;
revoke all on function public.cancel_poll(uuid) from public, anon;

grant execute on function public.current_player_id() to anon, authenticated;
grant execute on function public.create_poll(uuid, timestamptz, text, text, boolean, jsonb) to authenticated;
grant execute on function public.add_poll_slot(uuid, date, text, time, text) to authenticated;
grant execute on function public.remove_poll_slot(uuid) to authenticated;
grant execute on function public.set_slot_preferred(uuid, boolean) to authenticated;
grant execute on function public.update_poll(uuid, timestamptz, boolean, text) to authenticated;
grant execute on function public.cast_vote(uuid, text) to authenticated;
grant execute on function public.admin_set_vote(uuid, text, text) to authenticated;
grant execute on function public.lock_in_date(uuid, uuid) to authenticated;
grant execute on function public.confirm_attendance(uuid) to authenticated;
grant execute on function public.admin_confirm_attendance(uuid, text) to authenticated;
grant execute on function public.confirm_tee_time(uuid, text, date, time, text, text, int) to authenticated;
grant execute on function public.reopen_poll(uuid) to authenticated;
grant execute on function public.cancel_poll(uuid) to authenticated;

-- Row Level Security: everyone may READ the tee sheet (like the rest of the
-- site). There are NO write policies — the only way to change scheduling data
-- is through the permission-checked functions above.
alter table public.player_accounts        enable row level security;
alter table public.scheduling_polls       enable row level security;
alter table public.scheduling_slots       enable row level security;
alter table public.scheduling_votes       enable row level security;
alter table public.scheduling_agreements  enable row level security;
alter table public.scheduling_events      enable row level security;

drop policy if exists "public read" on public.scheduling_polls;
drop policy if exists "public read" on public.scheduling_slots;
drop policy if exists "public read" on public.scheduling_votes;
drop policy if exists "public read" on public.scheduling_agreements;
drop policy if exists "public read" on public.scheduling_events;
drop policy if exists "read own link or admin" on public.player_accounts;

create policy "public read" on public.scheduling_polls      for select to anon, authenticated using (public.season_is_visible(season_id));
create policy "public read" on public.scheduling_slots      for select to anon, authenticated using (true);
create policy "public read" on public.scheduling_votes      for select to anon, authenticated using (true);
create policy "public read" on public.scheduling_agreements for select to anon, authenticated using (true);
create policy "public read" on public.scheduling_events     for select to anon, authenticated using (true);
create policy "read own link or admin" on public.player_accounts for select to authenticated using (user_id = auth.uid() or public.is_admin());

revoke all on public.player_accounts, public.scheduling_polls, public.scheduling_slots, public.scheduling_votes,
  public.scheduling_agreements, public.scheduling_events from anon, authenticated;
grant select on public.scheduling_polls, public.scheduling_slots, public.scheduling_votes,
  public.scheduling_agreements, public.scheduling_events to anon, authenticated;
grant select on public.player_accounts to authenticated;

commit;

-- ---------------------------------------------------------------------
-- OPTIONAL: instant updates across phones (Supabase Realtime). Without it
-- the tee sheet still refreshes whenever the page regains focus.
-- ---------------------------------------------------------------------
-- alter publication supabase_realtime add table public.scheduling_polls, public.scheduling_slots,
--   public.scheduling_votes, public.scheduling_agreements;

-- ---------------------------------------------------------------------
-- LINK EACH PLAYER'S LOGIN (run separately, once per player, after creating
-- the user in Authentication → Users):
--
--   insert into public.player_accounts (user_id, player_id)
--   select id, 'jones' from auth.users where email = 'jones@example.com';
--
-- player_id is one of: jones, fitz, pirie, forrest.
-- An administrator who also plays needs BOTH an admins row and a player_accounts row.
-- ---------------------------------------------------------------------
