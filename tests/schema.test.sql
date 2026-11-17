-- Security & integrity checks for supabase-schema.sql (no-login edition).
-- Run on a scratch database after supabase-shim.sql + supabase-schema.sql.
\set ON_ERROR_STOP 0
\pset tuples_only on
select id as season from seasons where number = 1 \gset
select id as fx1 from fixtures where round_number = 1 and season_id = :'season' \gset
select id as fx2 from fixtures where round_number = 2 and season_id = :'season' \gset
select id as fx3 from fixtures where round_number = 3 and season_id = :'season' \gset
select id as lostball from fine_categories where name = 'Lost ball' \gset

\echo '--- seed'
select 'fixtures=' || count(*) || ' results=' || (select count(*) from results) from fixtures where season_id = :'season';
select 'partnership counts: ' || string_agg(c::text, ',') from (
  select count(*) c from (select ft.id, string_agg(player_id, '+' order by player_id) k from fixture_teams ft join team_members tm on tm.fixture_team_id = ft.id join fixtures f on f.id = ft.fixture_id where f.season_id = :'season' group by ft.id) t group by k) y;

set role anon;
\echo '--- visitor: reads work, DIRECT table writes are all refused'
select 'reads fixtures: ' || count(*) from fixtures where season_id = :'season';
insert into results (fixture_id, score_a, score_b, played_on) values (:'fx1', 70, 80, current_date);
update fixtures set course = 'hacked';
delete from fixtures;
insert into fines (season_id, player_id, category_id, amount) values (:'season', 'jones', :'lostball', 5);
update players set name = 'hacked';
delete from fine_categories;
truncate results;
select count(*) from dd_activity;
select * from dd_settings;
\echo '--- visitor: internal functions are not callable'
select dd_guard('x', null);
select create_season('Spam', 2030);
select set_club_code('letmein');
select generate_season_fixtures(:'season');

\echo '--- visitor: results through the guarded function'
select 'save ok: ' || (save_result(:'fx1', current_date, 'Wembley Golf Course', 78, 83, 'nice', 'create') is not null);
select save_result(:'fx1', current_date, 'Wembley', 70, 80, null, 'create');                 -- duplicate
select save_result(:'fx2', current_date, 'Wembley', 5, 80, null, 'create');                  -- bad score
select save_result(:'fx2', current_date, 'Wembley', 70, 80.5, null, 'create');               -- not a whole number
select save_result(:'fx2', current_date + 10, 'Wembley', 70, 80, null, 'create');            -- future
select save_result(:'fx2', current_date, '', 70, 80, null, 'create');                        -- no course
select save_result(:'fx2', current_date, repeat('x', 200), 70, 80, null, 'create');          -- oversized text
select save_result(:'fx2', current_date, 'Wembley', 70, 80, null, 'update');                 -- nothing to edit
select save_result('00000000-0000-0000-0000-000000000000', current_date, 'Wembley', 70, 80, null, 'create');
select 'edit ok: ' || (save_result(:'fx1', current_date, 'Wembley Golf Course', 90, 70, null, 'update') is not null);
select 'r1 now: ' || score_a || '-' || score_b from results where fixture_id = :'fx1';
select update_fixture(:'fx2', current_date + 14, 'Lake Karrinyup');
select 'fx2: ' || scheduled_date || ' ' || course from fixtures where id = :'fx2';
select update_fixture(:'fx2', date '1990-01-01', 'Lake Karrinyup');
select swap_fixture_pairings(:'fx2', :'fx3');
select swap_fixture_pairings(:'fx1', :'fx3');                                                -- played round

\echo '--- visitor: fines through the guarded functions'
select add_fine(:'season', 'pirie', :'lostball', :'fx1') as fine \gset
select 'fine amount defaults from tariff: ' || amount from fines where id = :'fine';
select add_fine(:'season', 'pirie', :'lostball', :'fx1');                                    -- double tap
select add_fine(:'season', 'nobody', :'lostball');                                           -- unknown player
select add_fine(:'season', 'jones', :'lostball', null, 99999);                               -- silly amount
select add_fine(:'season', 'jones', :'lostball', null, -1);
select 'second fine ok: ' || (add_fine(:'season', 'forrest', :'lostball', null, 10, 'late again', true) is not null);
select 'fines=' || count(*) || ' paid=' || (select count(*) from fine_payments) from fines;
select set_fine_paid(:'fine', true);
select update_fine(:'fine', 'fitz', :'lostball', :'fx1', 4, 'actually Fitz');
select 'corrected fine: ' || player_id || ' $' || amount || ' paid $' || (select sum(amount) from fine_payments where fine_id = :'fine') from fines where id = :'fine';
select set_fine_paid(:'fine', false);
select delete_fine(:'fine');
select 'fines after delete=' || count(*) from fines;
select 'new offence ok: ' || (save_fine_category(null, 'Hits the cart path', 3) is not null);
select save_fine_category(null, 'hits the CART path', 3);                                    -- duplicate name
select save_fine_category(null, '', 3);
select delete_result(:'fx1');
select 'results after delete=' || (select count(*) from results) || ' fines kept=' || (select count(*) from fines);
reset role;

\echo '--- every change was recorded with its previous values (not visible to visitors)'
select 'activity: ' || string_agg(action, ' > ' order by id) from dd_activity;
select 'undo info for the edit: ' || (detail->'previous')::text from dd_activity where action = 'result_update';
select 'balance after swap: ' || string_agg(c::text, ',') from (
  select count(*) c from (select ft.id, string_agg(player_id, '+' order by player_id) k from fixture_teams ft join team_members tm on tm.fixture_team_id = ft.id join fixtures f on f.id = ft.fixture_id where f.season_id = :'season' group by ft.id) t group by k) y;

\echo '--- optional club code'
select set_club_code('birdie24');
set role anon;
select save_result(:'fx1', current_date, 'Wembley', 78, 83, null, 'create');                 -- no code
select save_result(:'fx1', current_date, 'Wembley', 78, 83, null, 'create', 'wrong');        -- wrong code
select 'with code: ' || (save_result(:'fx1', current_date, 'Wembley', 78, 83, null, 'create', 'birdie24') is not null);
select 'reads still open: ' || count(*) from results;
reset role;
select set_club_code(null);

\echo '--- rate limit (30 changes per 10 minutes)'
delete from dd_activity;
set role anon;
do $$ declare i int; f uuid; begin
  select id into f from fines limit 1;
  for i in 1..30 loop perform set_fine_paid(f, i % 2 = 0); end loop;
end $$;
select set_fine_paid((select id from fines limit 1), true);                                  -- the 31st
reset role;
select 'changes recorded=' || count(*) from dd_activity;
delete from dd_activity;
\echo '--- SQL-editor-only: new season'
select 'new season: ' || (create_season('Season 02', 2027) is not null);
select 'seasons=' || count(*) || ' fixtures=' || (select count(*) from fixtures) from seasons;
