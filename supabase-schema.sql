-- =====================================================================
--  DESIGNATED DRIVERS — Supabase schema
--  Run once in Supabase → SQL Editor → New query → paste → Run.
--  Safe to re-run: tables use IF NOT EXISTS, seeds use ON CONFLICT,
--  functions/policies are replaced.
--
--  Production starts with ZERO completed rounds. Demo data lives only in
--  the browser (demo mode) and is never written here.
-- =====================================================================

set client_min_messages = warning;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- TABLES
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

-- Authorised administrators. Managed ONLY from the SQL editor / dashboard.
create table if not exists public.admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now()
);

create index if not exists fixtures_season_idx      on public.fixtures(season_id);
create index if not exists team_members_player_idx  on public.team_members(player_id);
create index if not exists fines_season_idx         on public.fines(season_id);
create index if not exists fines_player_idx         on public.fines(player_id);
create index if not exists fine_payments_fine_idx   on public.fine_payments(fine_id);

-- ---------------------------------------------------------------------
-- INTEGRITY TRIGGERS
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
-- HELPER + RPC FUNCTIONS
-- SECURITY DEFINER functions re-check is_admin() themselves.
-- ---------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

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

create or replace function public.create_season(p_name text default null, p_year int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_num int; v_id uuid;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select coalesce(max(number), 0) + 1 into v_num from public.seasons;
  insert into public.seasons (number, name, year)
  values (v_num, coalesce(nullif(trim(p_name), ''), 'Season ' || lpad(v_num::text, 2, '0')), coalesce(p_year, extract(year from now())::int))
  returning id into v_id;
  perform public.generate_season_fixtures(v_id);
  return v_id;
end $$;

-- Record or edit a result atomically. p_mode = 'create' refuses duplicates;
-- p_mode = 'update' requires an existing result.
create or replace function public.save_result(
  p_fixture_id uuid, p_played_on date, p_course text,
  p_score_a int, p_score_b int, p_notes text default null, p_mode text default 'create'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_exists boolean; v_id uuid;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  if p_mode not in ('create', 'update') then raise exception 'Invalid mode'; end if;
  if p_played_on is null then raise exception 'Date played is required'; end if;
  if p_played_on > current_date + 1 then raise exception 'A result cannot be recorded for a future date'; end if;
  if coalesce(trim(p_course), '') = '' then raise exception 'Golf course is required'; end if;
  if p_score_a is null or p_score_b is null or p_score_a not between 18 and 200 or p_score_b not between 18 and 200 then
    raise exception 'Gross strokes must be whole numbers between 18 and 200';
  end if;
  perform 1 from public.fixtures where id = p_fixture_id for update;  -- serialise concurrent submissions
  if not found then raise exception 'Fixture not found'; end if;
  select exists (select 1 from public.results where fixture_id = p_fixture_id) into v_exists;
  if p_mode = 'create' and v_exists then raise exception 'This round already has a result. Edit it from the Fixtures page instead.'; end if;
  if p_mode = 'update' and not v_exists then raise exception 'No existing result to edit'; end if;

  update public.fixtures set course = trim(p_course) where id = p_fixture_id;
  insert into public.results (fixture_id, score_a, score_b, played_on, notes, recorded_by)
  values (p_fixture_id, p_score_a, p_score_b, p_played_on, nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  on conflict (fixture_id) do update
    set score_a = excluded.score_a, score_b = excluded.score_b, played_on = excluded.played_on,
        notes = excluded.notes, recorded_by = excluded.recorded_by
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_result(p_fixture_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  delete from public.results where fixture_id = p_fixture_id;
end $$;

-- Swap the pairings of two UNPLAYED rounds in the same season. Swapping whole
-- pairings keeps every partnership count unchanged, so the season stays balanced.
create or replace function public.swap_fixture_pairings(p_fixture_a uuid, p_fixture_b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sa uuid; sb uuid; ma record;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select season_id into sa from public.fixtures where id = p_fixture_a for update;
  select season_id into sb from public.fixtures where id = p_fixture_b for update;
  if sa is null or sb is null or sa <> sb then raise exception 'Both rounds must belong to the same season'; end if;
  if exists (select 1 from public.results where fixture_id in (p_fixture_a, p_fixture_b)) then
    raise exception 'Only unplayed rounds can swap pairings';
  end if;
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

-- Function permissions: nothing executable by anonymous visitors except is_admin().
revoke all on function public.generate_season_fixtures(uuid) from public, anon, authenticated;
revoke all on function public.create_season(text, int) from public, anon;
revoke all on function public.save_result(uuid, date, text, int, int, text, text) from public, anon;
revoke all on function public.delete_result(uuid) from public, anon;
revoke all on function public.swap_fixture_pairings(uuid, uuid) from public, anon;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.create_season(text, int) to authenticated;
grant execute on function public.save_result(uuid, date, text, int, int, text, text) to authenticated;
grant execute on function public.delete_result(uuid) to authenticated;
grant execute on function public.swap_fixture_pairings(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Visitors (anon) may READ published data. Only admins may WRITE.
-- results / team_members / fixture_teams have NO write policies: they can
-- only change through the admin-checked RPC functions above.
-- ---------------------------------------------------------------------

alter table public.players          enable row level security;
alter table public.seasons          enable row level security;
alter table public.fixtures         enable row level security;
alter table public.fixture_teams    enable row level security;
alter table public.team_members     enable row level security;
alter table public.results          enable row level security;
alter table public.fine_categories  enable row level security;
alter table public.fines            enable row level security;
alter table public.fine_payments    enable row level security;
alter table public.admins           enable row level security;

create or replace function public.season_is_visible(p_season uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seasons where id = p_season and (is_published or public.is_admin()));
$$;
create or replace function public.fixture_is_visible(p_fixture uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fixtures f where f.id = p_fixture and public.season_is_visible(f.season_id));
$$;
grant execute on function public.season_is_visible(uuid) to anon, authenticated;
grant execute on function public.fixture_is_visible(uuid) to anon, authenticated;

do $$
declare t text;
begin
  -- drop old policies so the script can be re-run
  for t in select unnest(array['players','seasons','fixtures','fixture_teams','team_members','results','fine_categories','fines','fine_payments','admins']) loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('drop policy if exists "admin insert" on public.%I', t);
    execute format('drop policy if exists "admin update" on public.%I', t);
    execute format('drop policy if exists "admin delete" on public.%I', t);
    execute format('drop policy if exists "read own admin row" on public.%I', t);
  end loop;
end $$;

create policy "public read" on public.players         for select to anon, authenticated using (true);
create policy "public read" on public.seasons         for select to anon, authenticated using (is_published or public.is_admin());
create policy "public read" on public.fixtures        for select to anon, authenticated using (public.season_is_visible(season_id));
create policy "public read" on public.fixture_teams   for select to anon, authenticated using (public.fixture_is_visible(fixture_id));
create policy "public read" on public.team_members    for select to anon, authenticated using (public.fixture_is_visible(fixture_id));
create policy "public read" on public.results         for select to anon, authenticated using (public.fixture_is_visible(fixture_id));
create policy "public read" on public.fine_categories for select to anon, authenticated using (true);
create policy "public read" on public.fines           for select to anon, authenticated using (public.season_is_visible(season_id));
create policy "public read" on public.fine_payments   for select to anon, authenticated using (exists (select 1 from public.fines f where f.id = fine_id));
create policy "read own admin row" on public.admins   for select to authenticated using (user_id = auth.uid());

-- Admin writes (authenticated + listed in admins)
create policy "admin update" on public.players         for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin update" on public.seasons         for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin update" on public.fixtures        for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin insert" on public.fine_categories for insert to authenticated with check (public.is_admin());
create policy "admin update" on public.fine_categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin insert" on public.fines           for insert to authenticated with check (public.is_admin());
create policy "admin update" on public.fines           for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete" on public.fines           for delete to authenticated using (public.is_admin());
create policy "admin insert" on public.fine_payments   for insert to authenticated with check (public.is_admin());
create policy "admin delete" on public.fine_payments   for delete to authenticated using (public.is_admin());

-- Defence in depth: anonymous visitors get read-only table privileges.
revoke insert, update, delete, truncate on all tables in schema public from anon;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on public.players, public.seasons, public.fixtures, public.fine_categories, public.fines, public.fine_payments to authenticated;
revoke insert, update, delete on public.results, public.team_members, public.fixture_teams, public.admins from authenticated;

-- ---------------------------------------------------------------------
-- SEED DATA (production starts with zero completed rounds)
-- ---------------------------------------------------------------------

insert into public.players (id, name, color, image_url, sort_order) values
  ('jones',   'Jones',   '#D8AF55', 'assets/jones.png',   1),
  ('fitz',    'Fitz',    '#1F5A3D', 'assets/fitz.png',    2),
  ('pirie',   'Pirie',   '#7C9FCB', 'assets/pirie.png',   3),
  ('forrest', 'Forrest', '#EC8A78', 'assets/forrest.png', 4)
on conflict (id) do nothing;

insert into public.fine_categories (name, default_amount, sort_order) values
  ('Fails to pass the forward tees', 5, 1),
  ('Late to tee-off', 10, 2),
  ('Lost ball', 2, 3),
  ('Three-putt', 2, 4),
  ('Club thrown in anger', 5, 5),
  ('Water hazard', 2, 6),
  ('Air swing', 5, 7),
  ('Blames equipment', 2, 8),
  ('Incorrect score reported', 10, 9),
  ('No-show', 20, 10)
on conflict (name) do nothing;

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

-- ---------------------------------------------------------------------
-- OPTIONAL: live updates across devices (Supabase Realtime)
-- Uncomment to push changes to open browsers instantly. Without it, the
-- site still refreshes whenever a tab regains focus.
-- ---------------------------------------------------------------------
-- alter publication supabase_realtime add table public.results, public.fixtures, public.team_members,
--   public.fines, public.fine_payments, public.fine_categories, public.seasons;

-- ---------------------------------------------------------------------
-- FIRST ADMINISTRATOR (run separately after creating the user in
-- Authentication → Users → Add user):
--
--   insert into public.admins (user_id, email)
--   select id, email from auth.users where email = 'you@example.com';
-- ---------------------------------------------------------------------
