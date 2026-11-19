-- =====================================================================
--  DESIGNATED DRIVERS — Supabase schema (no-login edition)
--  Supabase → SQL Editor → New query → paste this whole file → Run.
--
--  • New project: creates everything and seeds Season 01 (zero results).
--  • Existing project: UPGRADES it in place. Every result, fixture, fine,
--    payment, season and player is kept. It removes the old login model
--    (administrators list) and the Tee Sheet tables, which the site no
--    longer uses.
--  Safe to run again at any time.
--
--  HOW WRITES ARE PROTECTED WITHOUT LOGINS
--  Row Level Security stays ON for every table and visitors have NO direct
--  insert/update/delete rights. The website can only change data by calling
--  the functions in section 4. Each one validates its input, is rate
--  limited, refuses duplicates, and records what it changed (including the
--  previous values) in dd_activity so a mistake or vandalism can be undone.
--  An optional shared "club code" can be switched on at any time (section 7).
-- =====================================================================

set client_min_messages = warning;
begin;

-- ---------------------------------------------------------------------
-- 1. TABLES (created only if missing — existing data is never touched)
-- ---------------------------------------------------------------------

create table if not exists public.players (
  id          text primary key check (id ~ '^[a-z0-9-]+$'),
  name        text not null unique check (length(trim(name)) > 0),
  color       text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  image_url   text,
  sort_order  int  not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.seasons (
  id            uuid primary key default gen_random_uuid(),
  number        int  not null unique check (number > 0),
  name          text not null,
  year          int  check (year between 2000 and 2200),
  total_rounds  int  not null default 12 check (total_rounds > 0 and total_rounds % 3 = 0),
  status        text not null default 'active' check (status in ('active', 'completed')),
  is_published  boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.fixtures (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references public.seasons(id) on delete cascade,
  round_number    int  not null check (round_number > 0),
  scheduled_date  date,
  course          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (season_id, round_number)
);

-- A fixture always has exactly two sides: 'a' and 'b'.
create table if not exists public.fixture_teams (
  id          uuid primary key default gen_random_uuid(),
  fixture_id  uuid not null references public.fixtures(id) on delete cascade,
  side        text not null check (side in ('a', 'b')),
  unique (fixture_id, side),
  unique (id, fixture_id)
);

-- Team memberships. (fixture_id, player_id) is unique, so a player can
-- appear only once per fixture; a trigger caps each team at two players.
create table if not exists public.team_members (
  id               uuid primary key default gen_random_uuid(),
  fixture_team_id  uuid not null,
  fixture_id       uuid not null,
  player_id        text not null references public.players(id) on update cascade,
  foreign key (fixture_team_id, fixture_id) references public.fixture_teams(id, fixture_id) on delete cascade,
  unique (fixture_id, player_id)
);

-- One result per fixture (UNIQUE fixture_id = server-side duplicate prevention).
-- Scores are TEAM gross strokes (Ambrose). Championship points are derived,
-- never stored, so editing any result recalculates everything after it.
create table if not exists public.results (
  id           uuid primary key default gen_random_uuid(),
  fixture_id   uuid not null unique references public.fixtures(id) on delete cascade,
  score_a      int  not null check (score_a between 18 and 200),
  score_b      int  not null check (score_b between 18 and 200),
  played_on    date not null,
  notes        text,
  recorded_by  uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.fine_categories (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique check (length(trim(name)) > 0),
  default_amount  numeric(8,2) not null check (default_amount >= 0),
  active          boolean not null default true,
  sort_order      int not null default 100,
  created_at      timestamptz not null default now()
);

create table if not exists public.fines (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references public.seasons(id) on delete cascade,
  player_id    text not null references public.players(id) on update cascade,
  category_id  uuid not null references public.fine_categories(id) on delete restrict,
  fixture_id   uuid references public.fixtures(id) on delete set null,
  amount       numeric(8,2) not null check (amount >= 0),
  notes        text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.fine_payments (
  id          uuid primary key default gen_random_uuid(),
  fine_id     uuid not null references public.fines(id) on delete cascade,
  amount      numeric(8,2) not null check (amount > 0),
  paid_on     date not null default current_date,
  created_at  timestamptz not null default now()
);

-- Player card shown on each profile (editable from the site).
alter table public.players add column if not exists bio text;            -- older free-text bio, no longer shown
alter table public.players add column if not exists quote text;
alter table public.players add column if not exists best_shot text;
alter table public.players add column if not exists strength text;
alter table public.players add column if not exists weakness text;

-- Settings (currently only the optional club code). Never readable by visitors.
create table if not exists public.dd_settings (
  key    text primary key,
  value  text
);

-- Every change made through the website: what, when, and the values it replaced.
-- Used for rate limiting and for undoing mistakes. Never readable by visitors.
create table if not exists public.dd_activity (
  id          bigint generated always as identity primary key,
  action      text not null,
  detail      jsonb not null default '{}'::jsonb,
  ip_hash     text,
  created_at  timestamptz not null default now()
);
create index if not exists dd_activity_created_idx on public.dd_activity(created_at);

-- Tee Time ------------------------------------------------------------
-- The agreed tee-off time lives on the fixture itself (next to its date and
-- course), so there is only ever one record of when a round is being played.
alter table public.fixtures add column if not exists tee_time time;
-- How many weekends the Tee Time calendar shows for this round (starts at 4, +2 when extended).
alter table public.fixtures add column if not exists tee_weeks smallint not null default 4;

-- Availability: one row per player per weekend (keyed by its Friday).
-- mask bits 0–14: Fri/Sat/Sun × Early AM, Late AM, Lunch, Early PM, Twilight
-- (bit = day*5 + window); bit 15: "Can't make it" pressed for the weekend.
-- A weekend is answered once any time is ticked or bit 15 is set; otherwise
-- it's "no response yet", which is never treated as "can't play".
create table if not exists public.availability (
  player_id   text not null references public.players(id) on update cascade on delete cascade,
  weekend     date not null check (extract(isodow from weekend) = 5),
  mask        int  not null default 0 check (mask between 0 and 65535),
  updated_at  timestamptz not null default now(),
  primary key (player_id, weekend)
);

-- Existing projects: allow the "Can't make it" bit (bit 15).
alter table public.availability drop constraint if exists availability_mask_check;
alter table public.availability add constraint availability_mask_check check (mask between 0 and 65535);

-- A proposed date for a fixture, the four confirmations, and the final tee time.
create table if not exists public.tee_proposals (
  id           uuid primary key default gen_random_uuid(),
  fixture_id   uuid not null references public.fixtures(id) on delete cascade,
  play_date    date not null,
  slot         smallint not null check (slot between 0 and 4),
  status       text not null default 'open' check (status in ('open', 'scheduled', 'withdrawn')),
  proposed_by  text references public.players(id) on update cascade on delete set null,
  tee_time     time,
  course       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- At most one live (open or scheduled) proposal per fixture; withdrawn ones are kept as history.
create unique index if not exists tee_proposals_one_live on public.tee_proposals (fixture_id) where status <> 'withdrawn';

create table if not exists public.tee_responses (
  proposal_id  uuid not null references public.tee_proposals(id) on delete cascade,
  player_id    text not null references public.players(id) on update cascade on delete cascade,
  response     text not null check (response in ('yes', 'no')),
  updated_at   timestamptz not null default now(),
  primary key (proposal_id, player_id)
);

create index if not exists fixtures_season_idx      on public.fixtures(season_id);
create index if not exists team_members_player_idx  on public.team_members(player_id);
create index if not exists fines_season_idx         on public.fines(season_id);
create index if not exists fines_player_idx         on public.fines(player_id);
create index if not exists fine_payments_fine_idx   on public.fine_payments(fine_id);

-- ---------------------------------------------------------------------
-- 1b. INTEGRITY TRIGGERS
-- ---------------------------------------------------------------------

create or replace function public.tg_set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists set_updated_at on public.fixtures;
create trigger set_updated_at before update on public.fixtures for each row execute function public.tg_set_updated_at();
drop trigger if exists set_updated_at on public.results;
create trigger set_updated_at before update on public.results for each row execute function public.tg_set_updated_at();
drop trigger if exists set_updated_at on public.fines;
create trigger set_updated_at before update on public.fines for each row execute function public.tg_set_updated_at();

-- Max two players per team.
create or replace function public.tg_team_size() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.team_members where fixture_team_id = new.fixture_team_id and id <> new.id) >= 2 then
    raise exception 'A team can only have two players';
  end if;
  return new;
end $$;
drop trigger if exists team_size on public.team_members;
create trigger team_size before insert or update on public.team_members for each row execute function public.tg_team_size();

-- A result can only be recorded for a complete 2v2 fixture, within the season's rounds.
create or replace function public.tg_result_requires_full_fixture() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.team_members where fixture_id = new.fixture_id) <> 4 then
    raise exception 'Fixture must have four players (2v2) before a result is recorded';
  end if;
  return new;
end $$;
drop trigger if exists result_full_fixture on public.results;
create trigger result_full_fixture before insert or update on public.results for each row execute function public.tg_result_requires_full_fixture();

-- ---------------------------------------------------------------------
-- 2. UPGRADE: remove the old login model and the Tee Sheet (if present)
--    Nothing here touches results, fixtures, fines, seasons or players.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  -- every old policy on our tables (they are recreated in section 5)
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
           and tablename in ('players','seasons','fixtures','fixture_teams','team_members','results','fine_categories','fines','fine_payments','admins','dd_settings','dd_activity','availability','tee_proposals','tee_responses') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
  -- every old version of the website's functions, whatever their arguments were
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'save_result','delete_result','swap_fixture_pairings','create_season','update_fixture',
             'add_fine','update_fine','set_fine_paid','delete_fine','save_fine_category','set_club_code','dd_guard','dd_text','update_player_profile',
             'set_availability','extend_availability','propose_round','respond_proposal','withdraw_proposal','schedule_fixture',
             'cancel_poll','reopen_poll','confirm_tee_time','admin_confirm_attendance','confirm_attendance','tee_record_agreement',
             'lock_in_date','admin_set_vote','cast_vote','tee_write_vote','update_poll','set_slot_preferred','remove_poll_slot',
             'add_poll_slot','create_poll','tee_add_slot','tee_log','current_player_id') loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

alter table if exists public.scheduling_polls drop constraint if exists polls_agreed_slot_fk;
drop table if exists public.scheduling_events;
drop table if exists public.scheduling_agreements;
drop table if exists public.scheduling_votes;
drop table if exists public.scheduling_slots;
drop table if exists public.scheduling_polls;
drop table if exists public.player_accounts;

-- ---------------------------------------------------------------------
-- 3. READ HELPERS
-- ---------------------------------------------------------------------
create or replace function public.season_is_visible(p_season uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seasons where id = p_season and is_published);
$$;
create or replace function public.fixture_is_visible(p_fixture uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fixtures f where f.id = p_fixture and public.season_is_visible(f.season_id));
$$;
drop function if exists public.is_admin() cascade;
drop table if exists public.admins;

-- ---------------------------------------------------------------------
-- 4. WRITE FUNCTIONS — the ONLY way the website can change anything
-- ---------------------------------------------------------------------

-- Trim, collapse to null when empty, and refuse over-long text.
create or replace function public.dd_text(p_value text, p_max int, p_label text) returns text
language plpgsql immutable as $$
declare v text := nullif(trim(coalesce(p_value, '')), '');
begin
  if v is not null and length(v) > p_max then raise exception '% is too long (max % characters)', p_label, p_max; end if;
  return v;
end $$;

-- Gatekeeper called first by every write function:
--   1. optional club code   2. rate limits   3. activity record
create or replace function public.dd_guard(p_action text, p_code text, p_detail jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_required text;
  v_ip text;
  v_ip_hash text;
begin
  select value into v_required from public.dd_settings where key = 'club_code_md5';
  if v_required is not null and (p_code is null or md5(trim(p_code)) <> v_required) then
    raise exception 'CLUB_CODE_REQUIRED' using errcode = '42501';
  end if;
  begin
    v_ip := split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then v_ip := '';
  end;
  v_ip_hash := case when coalesce(trim(v_ip), '') <> '' then md5(trim(v_ip)) end;
  if p_action = 'availability' then
    -- availability is saved a few taps at a time, so it gets its own, roomier limits
    if (select count(*) from public.dd_activity where action = 'availability' and created_at > now() - interval '10 minutes' and ip_hash is not distinct from v_ip_hash) >= 240 then
      raise exception 'Too many availability changes in a short time. Try again in a few minutes.';
    end if;
    if (select count(*) from public.dd_activity where action = 'availability' and created_at > now() - interval '1 day') >= 3000 then
      raise exception 'The daily limit for availability changes has been reached. Try again tomorrow.';
    end if;
  else
    if (select count(*) from public.dd_activity where action <> 'availability' and created_at > now() - interval '10 minutes' and ip_hash is not distinct from v_ip_hash) >= 30 then
      raise exception 'Too many changes in a short time. Try again in a few minutes.';
    end if;
    if (select count(*) from public.dd_activity where action <> 'availability' and created_at > now() - interval '1 day') >= 300 then
      raise exception 'The daily limit for changes has been reached. Try again tomorrow.';
    end if;
  end if;
  insert into public.dd_activity (action, detail, ip_hash) values (p_action, coalesce(p_detail, '{}'::jsonb), v_ip_hash);
end $$;

-- Internal: creates the balanced schedule for a season.
-- Splits rotate (1,2 v 3,4) → (1,3 v 2,4) → (1,4 v 2,3), so in 12 rounds every
-- split occurs 4 times and every player partners every other player 4 times.
create or replace function public.generate_season_fixtures(p_season_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  ps text[];
  splits text[][] ;
  n int; r int; s int; fx uuid; ta uuid; tb uuid;
begin
  select array_agg(id order by sort_order) into ps from public.players;
  if array_length(ps, 1) <> 4 then raise exception 'Exactly four players are required (found %)', coalesce(array_length(ps,1),0); end if;
  if exists (select 1 from public.fixtures where season_id = p_season_id) then raise exception 'Season already has fixtures'; end if;
  select total_rounds into n from public.seasons where id = p_season_id;
  for r in 1..n loop
    s := ((r - 1) % 3);
    insert into public.fixtures (season_id, round_number) values (p_season_id, r) returning id into fx;
    insert into public.fixture_teams (fixture_id, side) values (fx, 'a') returning id into ta;
    insert into public.fixture_teams (fixture_id, side) values (fx, 'b') returning id into tb;
    insert into public.team_members (fixture_team_id, fixture_id, player_id) values
      (ta, fx, ps[1]),
      (ta, fx, case s when 0 then ps[2] when 1 then ps[3] else ps[4] end),
      (tb, fx, case s when 0 then ps[3] when 1 then ps[2] else ps[2] end),
      (tb, fx, case s when 0 then ps[4] when 1 then ps[4] else ps[3] end);
  end loop;
end $$;


-- New seasons are created from the SQL editor only:  select public.create_season('Season 02', 2027);
create or replace function public.create_season(p_name text default null, p_year int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_num int; v_id uuid;
begin
  select coalesce(max(number), 0) + 1 into v_num from public.seasons;
  insert into public.seasons (number, name, year)
  values (v_num, coalesce(nullif(trim(p_name), ''), 'Season ' || lpad(v_num::text, 2, '0')), coalesce(p_year, extract(year from now())::int))
  returning id into v_id;
  perform public.generate_season_fixtures(v_id);
  return v_id;
end $$;

-- Record or correct a result. p_mode 'create' refuses a round that already has
-- one (duplicate protection); 'update' requires an existing result.
create or replace function public.save_result(
  p_fixture_id uuid, p_played_on date, p_course text, p_score_a int, p_score_b int,
  p_notes text default null, p_mode text default 'create', p_code text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_old record; v_id uuid; v_course text := public.dd_text(p_course, 80, 'Golf course'); v_notes text := public.dd_text(p_notes, 300, 'Notes');
begin
  if p_mode not in ('create', 'update') then raise exception 'Invalid mode'; end if;
  if p_played_on is null then raise exception 'Date played is required'; end if;
  if p_played_on > current_date + 1 then raise exception 'A result cannot be recorded for a future date'; end if;
  if p_played_on < date '2000-01-01' then raise exception 'That date looks wrong'; end if;
  if v_course is null then raise exception 'Golf course is required'; end if;
  if p_score_a is null or p_score_b is null or p_score_a not between 18 and 200 or p_score_b not between 18 and 200 then
    raise exception 'Gross strokes must be whole numbers between 18 and 200';
  end if;
  perform 1 from public.fixtures where id = p_fixture_id for update;   -- serialise double submissions
  if not found then raise exception 'Fixture not found'; end if;
  select * into v_old from public.results where fixture_id = p_fixture_id;
  if p_mode = 'create' and found then raise exception 'This round already has a result. Edit it from the Fixtures page instead.'; end if;
  if p_mode = 'update' and not found then raise exception 'No existing result to edit'; end if;
  perform public.dd_guard('result_' || p_mode, p_code, jsonb_build_object('fixture_id', p_fixture_id, 'score_a', p_score_a, 'score_b', p_score_b, 'played_on', p_played_on, 'course', v_course,
    'previous', case when p_mode = 'update' then jsonb_build_object('score_a', v_old.score_a, 'score_b', v_old.score_b, 'played_on', v_old.played_on, 'notes', v_old.notes) end));
  update public.fixtures set course = v_course where id = p_fixture_id;
  insert into public.results (fixture_id, score_a, score_b, played_on, notes)
  values (p_fixture_id, p_score_a, p_score_b, p_played_on, v_notes)
  on conflict (fixture_id) do update set score_a = excluded.score_a, score_b = excluded.score_b, played_on = excluded.played_on, notes = excluded.notes
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_result(p_fixture_id uuid, p_code text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_old record;
begin
  select * into v_old from public.results where fixture_id = p_fixture_id;
  if not found then return; end if;
  perform public.dd_guard('result_delete', p_code, jsonb_build_object('fixture_id', p_fixture_id, 'previous',
    jsonb_build_object('score_a', v_old.score_a, 'score_b', v_old.score_b, 'played_on', v_old.played_on, 'notes', v_old.notes)));
  delete from public.results where fixture_id = p_fixture_id;
end $$;

-- Change a round's date and course.
create or replace function public.update_fixture(p_fixture_id uuid, p_date date, p_course text, p_code text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_old record; v_course text := public.dd_text(p_course, 80, 'Golf course');
begin
  if p_date is not null and (p_date < date '2000-01-01' or p_date > current_date + 1100) then raise exception 'That date looks wrong'; end if;
  select * into v_old from public.fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found'; end if;
  perform public.dd_guard('fixture_update', p_code, jsonb_build_object('fixture_id', p_fixture_id, 'date', p_date, 'course', v_course,
    'previous', jsonb_build_object('date', v_old.scheduled_date, 'course', v_old.course)));
  update public.fixtures set scheduled_date = p_date, course = v_course where id = p_fixture_id;
end $$;

-- Swap the pairings of two UNPLAYED rounds in the same season. Swapping whole
-- pairings keeps every partnership count unchanged, so the season stays balanced.
create or replace function public.swap_fixture_pairings(p_fixture_a uuid, p_fixture_b uuid, p_code text default null) returns void
language plpgsql security definer set search_path = public as $$
declare sa uuid; sb uuid;
begin
  select season_id into sa from public.fixtures where id = p_fixture_a for update;
  select season_id into sb from public.fixtures where id = p_fixture_b for update;
  if sa is null or sb is null or sa <> sb or p_fixture_a = p_fixture_b then raise exception 'Both rounds must be different rounds of the same season'; end if;
  if exists (select 1 from public.results where fixture_id in (p_fixture_a, p_fixture_b)) then
    raise exception 'Only unplayed rounds can swap pairings';
  end if;
  perform public.dd_guard('pairing_swap', p_code, jsonb_build_object('a', p_fixture_a, 'b', p_fixture_b));
  create temporary table _swap on commit drop as
    select tm.fixture_id, ft.side, tm.player_id
    from public.team_members tm join public.fixture_teams ft on ft.id = tm.fixture_team_id
    where tm.fixture_id in (p_fixture_a, p_fixture_b);
  delete from public.team_members where fixture_id in (p_fixture_a, p_fixture_b);
  insert into public.team_members (fixture_team_id, fixture_id, player_id)
    select ft.id, ft.fixture_id, s.player_id
    from _swap s
    join public.fixture_teams ft
      on ft.fixture_id = case when s.fixture_id = p_fixture_a then p_fixture_b else p_fixture_a end
     and ft.side = s.side;
  drop table _swap;
end $$;

-- Fines ---------------------------------------------------------------
create or replace function public.add_fine(
  p_season_id uuid, p_player_id text, p_category_id uuid, p_fixture_id uuid default null,
  p_amount numeric default null, p_notes text default null, p_paid boolean default false, p_code text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_amount numeric; v_notes text := public.dd_text(p_notes, 300, 'Notes');
begin
  if not exists (select 1 from public.seasons where id = p_season_id) then raise exception 'Season not found'; end if;
  if not exists (select 1 from public.players where id = p_player_id) then raise exception 'Choose a player'; end if;
  select coalesce(p_amount, default_amount) into v_amount from public.fine_categories where id = p_category_id and active;
  if not found then raise exception 'Choose an offence from the tariff'; end if;
  if v_amount is null or v_amount < 0 or v_amount > 500 then raise exception 'The amount must be between $0 and $500'; end if;
  if p_fixture_id is not null and not exists (select 1 from public.fixtures where id = p_fixture_id and season_id = p_season_id) then raise exception 'That round is not part of this season'; end if;
  -- double-tap protection: the identical fine twice within ten seconds
  if exists (select 1 from public.fines where player_id = p_player_id and category_id = p_category_id and fixture_id is not distinct from p_fixture_id
             and amount = v_amount and created_at > now() - interval '10 seconds') then
    raise exception 'That fine was recorded a moment ago — not adding it twice.';
  end if;
  perform public.dd_guard('fine_add', p_code, jsonb_build_object('player', p_player_id, 'category_id', p_category_id, 'amount', v_amount, 'fixture_id', p_fixture_id));
  insert into public.fines (season_id, player_id, category_id, fixture_id, amount, notes)
  values (p_season_id, p_player_id, p_category_id, p_fixture_id, v_amount, v_notes) returning id into v_id;
  if coalesce(p_paid, false) and v_amount > 0 then insert into public.fine_payments (fine_id, amount) values (v_id, v_amount); end if;
  return v_id;
end $$;

create or replace function public.update_fine(
  p_fine_id uuid, p_player_id text, p_category_id uuid, p_fixture_id uuid, p_amount numeric, p_notes text default null, p_code text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_old record; v_notes text := public.dd_text(p_notes, 300, 'Notes');
begin
  select * into v_old from public.fines where id = p_fine_id for update;
  if not found then raise exception 'Fine not found'; end if;
  if not exists (select 1 from public.players where id = p_player_id) then raise exception 'Choose a player'; end if;
  if not exists (select 1 from public.fine_categories where id = p_category_id) then raise exception 'Choose an offence'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 500 then raise exception 'The amount must be between $0 and $500'; end if;
  if p_fixture_id is not null and not exists (select 1 from public.fixtures where id = p_fixture_id and season_id = v_old.season_id) then raise exception 'That round is not part of this season'; end if;
  perform public.dd_guard('fine_update', p_code, jsonb_build_object('fine_id', p_fine_id, 'player', p_player_id, 'amount', p_amount,
    'previous', jsonb_build_object('player', v_old.player_id, 'category_id', v_old.category_id, 'fixture_id', v_old.fixture_id, 'amount', v_old.amount, 'notes', v_old.notes)));
  update public.fines set player_id = p_player_id, category_id = p_category_id, fixture_id = p_fixture_id, amount = p_amount, notes = v_notes where id = p_fine_id;
  -- keep a paid fine paid when its amount changes
  if exists (select 1 from public.fine_payments where fine_id = p_fine_id) then
    delete from public.fine_payments where fine_id = p_fine_id;
    if p_amount > 0 then insert into public.fine_payments (fine_id, amount) values (p_fine_id, p_amount); end if;
  end if;
end $$;

create or replace function public.set_fine_paid(p_fine_id uuid, p_paid boolean, p_code text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_amount numeric;
begin
  select amount into v_amount from public.fines where id = p_fine_id for update;
  if not found then raise exception 'Fine not found'; end if;
  perform public.dd_guard('fine_paid', p_code, jsonb_build_object('fine_id', p_fine_id, 'paid', coalesce(p_paid, false)));
  delete from public.fine_payments where fine_id = p_fine_id;
  if coalesce(p_paid, false) and v_amount > 0 then insert into public.fine_payments (fine_id, amount) values (p_fine_id, v_amount); end if;
end $$;

create or replace function public.delete_fine(p_fine_id uuid, p_code text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_old record;
begin
  select * into v_old from public.fines where id = p_fine_id;
  if not found then return; end if;
  perform public.dd_guard('fine_delete', p_code, jsonb_build_object('fine_id', p_fine_id, 'previous',
    jsonb_build_object('season_id', v_old.season_id, 'player', v_old.player_id, 'category_id', v_old.category_id, 'fixture_id', v_old.fixture_id, 'amount', v_old.amount, 'notes', v_old.notes,
      'paid', exists (select 1 from public.fine_payments where fine_id = p_fine_id))));
  delete from public.fines where id = p_fine_id;
end $$;

-- Add an offence to the tariff (p_id null) or edit one.
create or replace function public.save_fine_category(p_id uuid, p_name text, p_amount numeric, p_active boolean default true, p_code text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text := public.dd_text(p_name, 60, 'Offence');
begin
  if v_name is null then raise exception 'Name the offence'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 500 then raise exception 'The amount must be between $0 and $500'; end if;
  if exists (select 1 from public.fine_categories where lower(name) = lower(v_name) and id is distinct from p_id) then raise exception 'That offence already exists'; end if;
  if p_id is null and (select count(*) from public.fine_categories) >= 60 then raise exception 'The tariff is full'; end if;
  perform public.dd_guard('category_save', p_code, jsonb_build_object('id', p_id, 'name', v_name, 'amount', p_amount, 'active', p_active));
  if p_id is null then
    insert into public.fine_categories (name, default_amount, sort_order)
    values (v_name, p_amount, (select coalesce(max(sort_order), 0) + 1 from public.fine_categories)) returning id into v_id;
  else
    update public.fine_categories set name = v_name, default_amount = p_amount, active = coalesce(p_active, true) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Offence not found'; end if;
  end if;
  return v_id;
end $$;

-- Player card: favourite quote, best shot, biggest strength, biggest weakness.
create or replace function public.update_player_profile(
  p_player_id text, p_quote text, p_best_shot text, p_strength text, p_weakness text, p_code text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old record;
  v_quote text := public.dd_text(p_quote, 140, 'Favourite quote');
  v_shot text := public.dd_text(p_best_shot, 140, 'Best shot');
  v_strength text := public.dd_text(p_strength, 140, 'Biggest strength');
  v_weakness text := public.dd_text(p_weakness, 140, 'Biggest weakness');
begin
  select * into v_old from public.players where id = p_player_id for update;
  if not found then raise exception 'Player not found'; end if;
  perform public.dd_guard('player_profile', p_code, jsonb_build_object('player', p_player_id,
    'previous', jsonb_build_object('quote', v_old.quote, 'best_shot', v_old.best_shot, 'strength', v_old.strength, 'weakness', v_old.weakness)));
  update public.players set quote = v_quote, best_shot = v_shot, strength = v_strength, weakness = v_weakness where id = p_player_id;
end $$;

-- Tee Time ------------------------------------------------------------

drop trigger if exists set_updated_at on public.tee_proposals;
create trigger set_updated_at before update on public.tee_proposals for each row execute function public.tg_set_updated_at();

-- Save availability for one player. p_changes is a batch of
--   [{"w": "2027-01-08", "s": bits_to_set, "c": bits_to_clear}, …]
-- applied to the stored bits on the server, so two phones editing at the same
-- time merge cell by cell instead of overwriting each other.
create or replace function public.set_availability(p_player_id text, p_changes jsonb, p_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ch jsonb; v_w date; v_s int; v_c int; v_prev jsonb; v_out jsonb := '[]'::jsonb; v_new int;
begin
  if not exists (select 1 from public.players where id = p_player_id) then raise exception 'Choose a player'; end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) = 0 or jsonb_array_length(p_changes) > 30 then
    raise exception 'Nothing to save';
  end if;
  for ch in select * from jsonb_array_elements(p_changes) loop
    begin
      v_w := (ch->>'w')::date; v_s := coalesce((ch->>'s')::int, 0); v_c := coalesce((ch->>'c')::int, 0);
    exception when others then raise exception 'Invalid availability change';
    end;
    if v_w is null or extract(isodow from v_w) <> 5 then raise exception 'Availability is saved by weekend, starting Friday'; end if;
    if v_w < current_date - 14 or v_w > current_date + 400 then raise exception 'That weekend is out of range'; end if;
    if v_s not between 0 and 65535 or v_c not between 0 and 65535 then raise exception 'Invalid availability change'; end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('w', a.weekend, 'mask', a.mask)), '[]'::jsonb) into v_prev
    from public.availability a where a.player_id = p_player_id and a.weekend in (select (e->>'w')::date from jsonb_array_elements(p_changes) e);
  perform public.dd_guard('availability', p_code, jsonb_build_object('player', p_player_id, 'changes', p_changes, 'previous', v_prev));
  for ch in select * from jsonb_array_elements(p_changes) loop
    v_w := (ch->>'w')::date; v_s := coalesce((ch->>'s')::int, 0); v_c := coalesce((ch->>'c')::int, 0);
    insert into public.availability as a (player_id, weekend, mask) values (p_player_id, v_w, v_s & ~v_c)
    on conflict (player_id, weekend) do update set mask = (a.mask | v_s) & ~v_c, updated_at = now()
    returning a.mask into v_new;
    v_out := v_out || jsonb_build_array(jsonb_build_object('w', v_w, 'mask', v_new));
  end loop;
  return v_out;
end $$;

-- Show two more weekends for a round (up to 26 in total).
create or replace function public.extend_availability(p_fixture_id uuid, p_code text default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_weeks int;
begin
  perform 1 from public.fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found'; end if;
  perform public.dd_guard('availability_extend', p_code, jsonb_build_object('fixture_id', p_fixture_id));
  update public.fixtures set tee_weeks = least(coalesce(tee_weeks, 4) + 2, 26) where id = p_fixture_id returning tee_weeks into v_weeks;
  return v_weeks;
end $$;

-- Propose a date and window for a fixture. The proposer (if given) is marked as in.
create or replace function public.propose_round(p_fixture_id uuid, p_date date, p_slot int, p_player_id text default null, p_code text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform 1 from public.fixtures where id = p_fixture_id for update;   -- one proposal at a time, even with two phones
  if not found then raise exception 'Fixture not found'; end if;
  if exists (select 1 from public.results where fixture_id = p_fixture_id) then raise exception 'That round has already been played'; end if;
  if p_date is null or extract(isodow from p_date) not in (5, 6, 7) then raise exception 'Rounds are played Friday to Sunday'; end if;
  if p_date < current_date - 1 or p_date > current_date + 400 then raise exception 'That date is out of range'; end if;
  if p_slot is null or p_slot not between 0 and 4 then raise exception 'Choose a time window'; end if;
  if p_player_id is not null and not exists (select 1 from public.team_members where fixture_id = p_fixture_id and player_id = p_player_id) then raise exception 'Unknown player'; end if;
  if exists (select 1 from public.tee_proposals where fixture_id = p_fixture_id and status <> 'withdrawn') then
    raise exception 'This round has already been proposed — refresh to see it.';
  end if;
  perform public.dd_guard('tee_propose', p_code, jsonb_build_object('fixture_id', p_fixture_id, 'date', p_date, 'slot', p_slot, 'by', p_player_id));
  insert into public.tee_proposals (fixture_id, play_date, slot, proposed_by) values (p_fixture_id, p_date, p_slot, p_player_id) returning id into v_id;
  if p_player_id is not null then insert into public.tee_responses (proposal_id, player_id, response) values (v_id, p_player_id, 'yes'); end if;
  return v_id;
end $$;

-- A player says they're in ('yes') or can't make it ('no').
create or replace function public.respond_proposal(p_proposal_id uuid, p_player_id text, p_response text, p_code text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_prop record;
begin
  select * into v_prop from public.tee_proposals where id = p_proposal_id for update;
  if not found then raise exception 'That proposal no longer exists — refresh.'; end if;
  if v_prop.status <> 'open' then raise exception 'This proposal is no longer open for replies.'; end if;
  if p_response not in ('yes', 'no') then raise exception 'Answer yes or no'; end if;
  if not exists (select 1 from public.team_members where fixture_id = v_prop.fixture_id and player_id = p_player_id) then raise exception 'Unknown player'; end if;
  perform public.dd_guard('tee_respond', p_code, jsonb_build_object('proposal_id', p_proposal_id, 'player', p_player_id, 'response', p_response,
    'previous', (select response from public.tee_responses where proposal_id = p_proposal_id and player_id = p_player_id)));
  insert into public.tee_responses as r (proposal_id, player_id, response) values (p_proposal_id, p_player_id, p_response)
  on conflict (proposal_id, player_id) do update set response = excluded.response, updated_at = now();
end $$;

-- Withdraw a proposal. If it had been scheduled, the fixture's date and tee time are cleared.
create or replace function public.withdraw_proposal(p_proposal_id uuid, p_code text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_prop record; v_fx record;
begin
  select * into v_prop from public.tee_proposals where id = p_proposal_id for update;
  if not found or v_prop.status = 'withdrawn' then return; end if;
  select * into v_fx from public.fixtures where id = v_prop.fixture_id for update;
  perform public.dd_guard('tee_withdraw', p_code, jsonb_build_object('proposal_id', p_proposal_id, 'previous',
    jsonb_build_object('status', v_prop.status, 'date', v_fx.scheduled_date, 'tee_time', v_fx.tee_time, 'course', v_fx.course)));
  update public.tee_proposals set status = 'withdrawn' where id = p_proposal_id;
  if v_prop.status = 'scheduled' and not exists (select 1 from public.results where fixture_id = v_prop.fixture_id) then
    update public.fixtures set scheduled_date = null, tee_time = null where id = v_prop.fixture_id;
  end if;
end $$;

-- Once all four are in: record the tee-off time and course on the fixture.
-- Also used to change them later. (This records the plan; it doesn't book the course.)
create or replace function public.schedule_fixture(p_proposal_id uuid, p_tee_time time, p_course text, p_code text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_prop record; v_waiting text; v_course text := public.dd_text(p_course, 80, 'Golf course');
begin
  select * into v_prop from public.tee_proposals where id = p_proposal_id for update;
  if not found then raise exception 'That proposal no longer exists — refresh.'; end if;
  if v_prop.status = 'withdrawn' then raise exception 'That proposal was withdrawn — refresh.'; end if;
  if exists (select 1 from public.results where fixture_id = v_prop.fixture_id) then raise exception 'That round has already been played'; end if;
  if p_tee_time is null then raise exception 'Enter the tee-off time'; end if;
  if v_course is null then raise exception 'Golf course is required'; end if;
  select string_agg(p.name, ', ' order by p.sort_order) into v_waiting
    from public.team_members tm join public.players p on p.id = tm.player_id
    where tm.fixture_id = v_prop.fixture_id
      and not exists (select 1 from public.tee_responses r where r.proposal_id = p_proposal_id and r.player_id = tm.player_id and r.response = 'yes');
  if v_waiting is not null then raise exception 'Still waiting for % to confirm', v_waiting; end if;
  perform public.dd_guard('tee_schedule', p_code, jsonb_build_object('proposal_id', p_proposal_id, 'tee_time', p_tee_time, 'course', v_course,
    'previous', (select jsonb_build_object('date', scheduled_date, 'tee_time', tee_time, 'course', course) from public.fixtures where id = v_prop.fixture_id)));
  update public.tee_proposals set status = 'scheduled', tee_time = p_tee_time, course = v_course where id = p_proposal_id;
  update public.fixtures set scheduled_date = v_prop.play_date, tee_time = p_tee_time, course = v_course where id = v_prop.fixture_id;
end $$;

-- SQL editor only. Switch the optional club code on:  select public.set_club_code('1234');
-- and off again:                                      select public.set_club_code(null);
create or replace function public.set_club_code(p_code text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_code), '') = '' then
    delete from public.dd_settings where key = 'club_code_md5';
    return 'Club code switched off — anyone with the link can make changes.';
  end if;
  if length(trim(p_code)) < 4 then raise exception 'Use at least four characters'; end if;
  insert into public.dd_settings (key, value) values ('club_code_md5', md5(trim(p_code)))
  on conflict (key) do update set value = excluded.value;
  return 'Club code switched on. Each phone will be asked for it once.';
end $$;

-- ---------------------------------------------------------------------
-- 5. PERMISSIONS
-- ---------------------------------------------------------------------
-- Functions: internal helpers are callable by nobody from the website.
revoke all on function public.dd_guard(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.dd_text(text, int, text) from public, anon, authenticated;
revoke all on function public.generate_season_fixtures(uuid) from public, anon, authenticated;
revoke all on function public.create_season(text, int) from public, anon, authenticated;
revoke all on function public.set_club_code(text) from public, anon, authenticated;

revoke all on function public.save_result(uuid, date, text, int, int, text, text, text) from public;
revoke all on function public.delete_result(uuid, text) from public;
revoke all on function public.update_fixture(uuid, date, text, text) from public;
revoke all on function public.swap_fixture_pairings(uuid, uuid, text) from public;
revoke all on function public.add_fine(uuid, text, uuid, uuid, numeric, text, boolean, text) from public;
revoke all on function public.update_fine(uuid, text, uuid, uuid, numeric, text, text) from public;
revoke all on function public.set_fine_paid(uuid, boolean, text) from public;
revoke all on function public.delete_fine(uuid, text) from public;
revoke all on function public.save_fine_category(uuid, text, numeric, boolean, text) from public;
revoke all on function public.update_player_profile(text, text, text, text, text, text) from public;

grant execute on function public.season_is_visible(uuid) to anon, authenticated;
grant execute on function public.fixture_is_visible(uuid) to anon, authenticated;
grant execute on function public.save_result(uuid, date, text, int, int, text, text, text) to anon, authenticated;
grant execute on function public.delete_result(uuid, text) to anon, authenticated;
grant execute on function public.update_fixture(uuid, date, text, text) to anon, authenticated;
grant execute on function public.swap_fixture_pairings(uuid, uuid, text) to anon, authenticated;
grant execute on function public.add_fine(uuid, text, uuid, uuid, numeric, text, boolean, text) to anon, authenticated;
grant execute on function public.update_fine(uuid, text, uuid, uuid, numeric, text, text) to anon, authenticated;
grant execute on function public.set_fine_paid(uuid, boolean, text) to anon, authenticated;
grant execute on function public.delete_fine(uuid, text) to anon, authenticated;
grant execute on function public.save_fine_category(uuid, text, numeric, boolean, text) to anon, authenticated;
grant execute on function public.update_player_profile(text, text, text, text, text, text) to anon, authenticated;
revoke all on function public.set_availability(text, jsonb, text) from public;
revoke all on function public.extend_availability(uuid, text) from public;
revoke all on function public.propose_round(uuid, date, int, text, text) from public;
revoke all on function public.respond_proposal(uuid, text, text, text) from public;
revoke all on function public.withdraw_proposal(uuid, text) from public;
revoke all on function public.schedule_fixture(uuid, time, text, text) from public;
grant execute on function public.set_availability(text, jsonb, text) to anon, authenticated;
grant execute on function public.extend_availability(uuid, text) to anon, authenticated;
grant execute on function public.propose_round(uuid, date, int, text, text) to anon, authenticated;
grant execute on function public.respond_proposal(uuid, text, text, text) to anon, authenticated;
grant execute on function public.withdraw_proposal(uuid, text) to anon, authenticated;
grant execute on function public.schedule_fixture(uuid, time, text, text) to anon, authenticated;

-- Tables: Row Level Security ON everywhere. Visitors can READ the championship
-- and have no direct write access to anything.
alter table public.players          enable row level security;
alter table public.seasons          enable row level security;
alter table public.fixtures         enable row level security;
alter table public.fixture_teams    enable row level security;
alter table public.team_members     enable row level security;
alter table public.results          enable row level security;
alter table public.fine_categories  enable row level security;
alter table public.fines            enable row level security;
alter table public.fine_payments    enable row level security;
alter table public.dd_settings      enable row level security;
alter table public.dd_activity      enable row level security;
alter table public.availability     enable row level security;
alter table public.tee_proposals    enable row level security;
alter table public.tee_responses    enable row level security;

create policy "public read" on public.players         for select to anon, authenticated using (true);
create policy "public read" on public.seasons         for select to anon, authenticated using (is_published);
create policy "public read" on public.fixtures        for select to anon, authenticated using (public.season_is_visible(season_id));
create policy "public read" on public.fixture_teams   for select to anon, authenticated using (public.fixture_is_visible(fixture_id));
create policy "public read" on public.team_members    for select to anon, authenticated using (public.fixture_is_visible(fixture_id));
create policy "public read" on public.results         for select to anon, authenticated using (public.fixture_is_visible(fixture_id));
create policy "public read" on public.fine_categories for select to anon, authenticated using (true);
create policy "public read" on public.fines           for select to anon, authenticated using (public.season_is_visible(season_id));
create policy "public read" on public.fine_payments   for select to anon, authenticated using (exists (select 1 from public.fines f where f.id = fine_id));
create policy "public read" on public.availability    for select to anon, authenticated using (true);
create policy "public read" on public.tee_proposals   for select to anon, authenticated using (public.fixture_is_visible(fixture_id));
create policy "public read" on public.tee_responses   for select to anon, authenticated using (exists (select 1 from public.tee_proposals tp where tp.id = proposal_id));
-- dd_settings and dd_activity deliberately have NO policies: invisible to the website.

revoke all on public.players, public.seasons, public.fixtures, public.fixture_teams, public.team_members, public.results,
  public.fine_categories, public.fines, public.fine_payments, public.dd_settings, public.dd_activity,
  public.availability, public.tee_proposals, public.tee_responses from anon, authenticated;
grant select on public.players, public.seasons, public.fixtures, public.fixture_teams, public.team_members, public.results,
  public.fine_categories, public.fines, public.fine_payments, public.availability, public.tee_proposals, public.tee_responses to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. SEED DATA (only added when missing; a new project starts with zero results)
-- ---------------------------------------------------------------------

insert into public.players (id, name, color, image_url, sort_order) values
  ('jones',   'Jones',   '#D8AF55', 'assets/jones.png',   1),
  ('fitz',    'Fitz',    '#1F5A3D', 'assets/fitz.png',    2),
  ('pirie',   'Pirie',   '#7C9FCB', 'assets/pirie.png',   3),
  ('forrest', 'Forrest', '#EC8A78', 'assets/forrest.png', 4)
on conflict (id) do nothing;

-- The tariff of fines. Existing offences that match are renamed (so fines
-- already recorded against them keep their link and their recorded amount),
-- any missing ones are added, and every other offence is retired: it stays in
-- the database for past fines but can't be chosen for new ones.
do $$
declare r record;
begin
  for r in select * from (values
      ('Late to tee-off',                'Not at course 10 mins before tee-off'),
      ('Water hazard',                   'Ball in water'),
      ('Fails to pass the forward tees', 'Fails to pass ladies'' tees')) as m(old_name, new_name) loop
    if not exists (select 1 from public.fine_categories where name = r.new_name) then
      update public.fine_categories set name = r.new_name where name = r.old_name;
    end if;
  end loop;
end $$;

insert into public.fine_categories (name, default_amount, sort_order, active) values
  ('Not at course 10 mins before tee-off', 5, 1, true),
  ('No-show', 20, 2, true),
  ('Ball in water', 2, 3, true),
  ('Fails to pass ladies'' tees', 5, 4, true),
  ('Air swing', 5, 5, true)
on conflict (name) do update set default_amount = excluded.default_amount, sort_order = excluded.sort_order, active = true;

update public.fine_categories set active = false
where name not in ('Not at course 10 mins before tee-off', 'No-show', 'Ball in water', 'Fails to pass ladies'' tees', 'Air swing');

do $$
declare v_id uuid;
begin
  if not exists (select 1 from public.seasons where number = 1) then
    insert into public.seasons (number, name, year, total_rounds)
    values (1, 'Season 01', extract(year from now())::int, 12)
    returning id into v_id;
    perform public.generate_season_fixtures(v_id);
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------
-- 7. OPTIONAL EXTRAS (run separately, any time)
-- ---------------------------------------------------------------------
-- Club code — if strangers ever start messing with the scoreboard:
--   select public.set_club_code('birdie24');   -- on  (each phone is asked once)
--   select public.set_club_code(null);         -- off
--
-- See or undo recent changes (previous values are stored with each change):
--   select created_at, action, detail from public.dd_activity order by created_at desc limit 50;
--
-- Player cards (quote, best shot, strength, weakness) are edited on each
-- player's profile page. To clear one from here:
--   update public.players set quote = null, best_shot = null, strength = null, weakness = null where id = 'jones';
--
-- Start another season (12 balanced fixtures):
--   select public.create_season('Season 02', 2027);
-- Mark a season finished:
--   update public.seasons set status = 'completed' where number = 1;
--
-- Instant updates across phones (otherwise pages refresh when reopened):
--   alter publication supabase_realtime add table public.results, public.fixtures, public.team_members,
--     public.fines, public.fine_payments, public.fine_categories, public.seasons,
--     public.availability, public.tee_proposals, public.tee_responses;
-- (The Tee Time page also checks for changes every 15 seconds while it is open.)
