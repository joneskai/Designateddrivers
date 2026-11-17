-- Security & integrity checks for supabase-schema.sql (run after shim + schema).
\set ON_ERROR_STOP 0
\pset tuples_only on
insert into auth.users values ('11111111-1111-1111-1111-111111111111','admin@example.com'), ('22222222-2222-2222-2222-222222222222','mate@example.com');
insert into public.admins (user_id, email) values ('11111111-1111-1111-1111-111111111111','admin@example.com');

\echo '--- seed: fixtures, balance, zero results'
select 'fixtures=' || count(*) from fixtures;
select 'results=' || count(*) from results;
select 'every fixture has 4 distinct players: ' || bool_and(n = 4) from (select fixture_id, count(distinct player_id) n from team_members group by fixture_id) x;
select 'partnership counts: ' || string_agg(c::text, ',') from (
  select count(*) c from (select ft.id, string_agg(player_id, '+' order by player_id) k from fixture_teams ft join team_members tm on tm.fixture_team_id = ft.id group by ft.id) t group by k) y;

\echo '--- anon (visitor): can read, cannot write'
set role anon;
select 'anon reads fixtures: ' || count(*) from fixtures;
insert into fines (season_id, player_id, category_id, amount) select (select id from seasons limit 1), 'jones', (select id from fine_categories limit 1), 5;
update fixtures set course = 'hacked';
select save_result((select id from fixtures where round_number=1), current_date, 'X', 70, 80, null, 'create');
select 'anon is_admin: ' || is_admin();
reset role;

\echo '--- signed-in NON-admin: cannot write'
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'mate is_admin: ' || is_admin();
select save_result((select id from fixtures where round_number=1), current_date, 'X', 70, 80, null, 'create');
insert into results (fixture_id, score_a, score_b, played_on) select id, 70, 80, current_date from fixtures where round_number = 1;
update fixtures set course = 'hacked' where round_number = 1;
select 'rows changed by mate: ' || count(*) from fixtures where course = 'hacked';
insert into fines (season_id, player_id, category_id, amount) select (select id from seasons limit 1), 'jones', (select id from fine_categories limit 1), 5;
select 'admins visible to mate: ' || count(*) from admins;
reset role;

\echo '--- admin: can write, duplicates refused, validation enforced'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'admin is_admin: ' || is_admin();
select 'save ok: ' || (save_result((select id from fixtures where round_number=1), current_date, 'Wembley Golf Course', 78, 83, 'nice', 'create') is not null);
select save_result((select id from fixtures where round_number=1), current_date, 'Wembley', 70, 80, null, 'create'); -- duplicate -> error
select save_result((select id from fixtures where round_number=2), current_date, 'Wembley', 5, 80, null, 'create');   -- bad score -> error
select save_result((select id from fixtures where round_number=2), current_date + 10, 'Wembley', 70, 80, null, 'create'); -- future -> error
select save_result((select id from fixtures where round_number=2), current_date, 'Wembley', 70, 80, null, 'update'); -- nothing to edit -> error
select 'edit ok: ' || (save_result((select id from fixtures where round_number=1), current_date, 'Wembley Golf Course', 90, 70, null, 'update') is not null);
select 'r1 now: ' || score_a || '-' || score_b from results;
insert into fines (season_id, player_id, category_id, fixture_id, amount) select (select id from seasons limit 1), 'pirie', (select id from fine_categories where name='Lost ball'), (select id from fixtures where round_number=1), 2;
insert into fine_payments (fine_id, amount) select id, amount from fines;
select 'fines=' || count(*) from fines;
select 'payments=' || count(*) from fine_payments;
-- swap two unplayed rounds keeps balance
select swap_fixture_pairings((select id from fixtures where round_number=2), (select id from fixtures where round_number=3));
select swap_fixture_pairings((select id from fixtures where round_number=1), (select id from fixtures where round_number=3)); -- played -> error
reset role;
select 'balance after swap: ' || string_agg(c::text, ',') from (
  select count(*) c from (select ft.id, string_agg(player_id, '+' order by player_id) k from fixture_teams ft join team_members tm on tm.fixture_team_id = ft.id group by ft.id) t group by k) y;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'new season: ' || (create_season('Season 02', 2027) is not null);
select 'seasons=' || count(*) || ' fixtures=' || (select count(*) from fixtures) from seasons;
select delete_result((select id from fixtures where round_number=1 and season_id=(select id from seasons where number=1)));
select 'results after delete=' || count(*) from results;
select 'fines kept after delete=' || count(*) from fines;
reset role;
\echo '--- direct integrity: player twice in a fixture refused'
insert into team_members (fixture_team_id, fixture_id, player_id) select ft.id, ft.fixture_id, 'jones' from fixture_teams ft join fixtures f on f.id=ft.fixture_id where f.round_number=1 and ft.side='b' limit 1;
