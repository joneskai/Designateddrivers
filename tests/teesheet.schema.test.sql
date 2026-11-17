-- Security & integrity checks for migrations/002_tee_sheet.sql
-- (run after supabase-shim.sql + supabase-schema.sql + 002_tee_sheet.sql on a scratch database).
\set ON_ERROR_STOP 0
\pset tuples_only on
\set admin '11111111-1111-1111-1111-111111111111'
\set fitz  '22222222-2222-2222-2222-222222222222'
\set pirie '33333333-3333-3333-3333-333333333333'
\set forr  '44444444-4444-4444-4444-444444444444'
\set nobody '55555555-5555-5555-5555-555555555555'
insert into auth.users values (:'admin','jones@example.com'), (:'fitz','fitz@example.com'), (:'pirie','pirie@example.com'), (:'forr','forrest@example.com'), (:'nobody','stranger@example.com');
insert into public.admins (user_id, email) values (:'admin','jones@example.com');
insert into public.player_accounts (user_id, player_id) values (:'admin','jones'), (:'fitz','fitz'), (:'pirie','pirie'), (:'forr','forrest');
\echo '--- a login maps to exactly one player, a player to one login'
insert into public.player_accounts (user_id, player_id) values (:'nobody','jones');
insert into public.player_accounts (user_id, player_id) values (:'fitz','pirie');
select 'fixtures before=' || count(*) from fixtures;
select id as fx5 from fixtures where round_number = 5 \gset
select id as fx6 from fixtures where round_number = 6 \gset

\echo '--- visitors and players cannot open a poll'
set role anon;
select create_poll(:'fx5', null, null, 'Australia/Perth', false, '[{"date":"2026-12-05","window":"morning"}]');
reset role;
set role authenticated; set request.jwt.claim.sub = :'fitz';
select create_poll(:'fx5', null, null, 'Australia/Perth', false, '[{"date":"2026-12-05","window":"morning"}]');
reset role;

\echo '--- admin opens a poll; a duplicate is refused'
set role authenticated; set request.jwt.claim.sub = :'admin';
select create_poll(:'fx5', '2026-12-04 18:00+08', 'Bring sunscreen', 'Australia/Perth', false,
  '[{"date":"2026-12-05","window":"morning"},{"date":"2026-12-06","window":"afternoon"},{"date":"2026-12-12","window":"time","start_time":"07:40"},{"date":"2026-12-13","window":"anytime"}]') as poll \gset
select create_poll(:'fx5', null, null, 'Australia/Perth', false, '[{"date":"2026-12-20","window":"morning"}]');
select create_poll(:'fx6', null, null, 'Mars/Olympus', false, '[{"date":"2026-12-20","window":"morning"}]');
select add_poll_slot(:'poll', '2026-12-05', 'morning');
reset role;
select 'polls=' || count(*) || ' slots=' || (select count(*) from scheduling_slots) from scheduling_polls;
select 'deadline stored as instant (UTC)=' || to_char(voting_deadline at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from scheduling_polls;
select id as s1 from scheduling_slots where proposed_date = '2026-12-05' \gset
select id as s2 from scheduling_slots where proposed_date = '2026-12-06' \gset
select id as s4 from scheduling_slots where proposed_date = '2026-12-13' \gset

\echo '--- voting: own vote only'
set role anon;
select cast_vote(:'s1', 'available');
select 'anon can read votes: ' || (count(*) >= 0) from scheduling_votes;
reset role;
set role authenticated; set request.jwt.claim.sub = :'nobody';
select cast_vote(:'s1', 'available');
reset role;
set role authenticated; set request.jwt.claim.sub = :'fitz';
select cast_vote(:'s1', 'available'); select cast_vote(:'s1', 'maybe'); select cast_vote(:'s1', 'available');
select cast_vote(:'s2', 'unavailable'); select cast_vote(:'s4', 'maybe');
select cast_vote(:'s1', 'definitely');
-- impersonation attempts
insert into scheduling_votes (slot_id, player_id, status) values (:'s1', 'pirie', 'available');
update scheduling_votes set status = 'unavailable' where player_id = 'fitz';
delete from scheduling_votes;
select admin_set_vote(:'s1', 'pirie', 'available');
select lock_in_date(:'poll', :'s1');
select confirm_tee_time(:'poll', 'Wembley', '2026-12-05', '07:40');
update fixtures set tee_time = '06:00', course = 'hacked' where id = :'fx5';
update scheduling_polls set status = 'confirmed';
reset role;
select 'fitz rows for slot 1 (no duplicates)=' || count(*) from scheduling_votes where slot_id = :'s1' and player_id = 'fitz';
select 'votes by anyone but fitz=' || count(*) from scheduling_votes where player_id <> 'fitz';
set role authenticated; set request.jwt.claim.sub = :'pirie';  select cast_vote(:'s1', 'available'); select cast_vote(:'s2', 'available'); select cast_vote(:'s4', 'available'); reset role;
set role authenticated; set request.jwt.claim.sub = :'forr';   select cast_vote(:'s1', 'available'); select cast_vote(:'s2', 'available'); select cast_vote(:'s4', 'available'); reset role;
set role authenticated; set request.jwt.claim.sub = :'admin';  select cast_vote(:'s1', 'available'); select cast_vote(:'s2', 'available'); select cast_vote(:'s4', 'available');

\echo '--- lock in: refused with an Unavailable vote; Maybe players must confirm'
select lock_in_date(:'poll', :'s2');
select lock_in_date(:'poll', :'s4');
select 'status=' || status from scheduling_polls where id = :'poll';
select 'agreed so far=' || string_agg(player_id, ',' order by player_id) from scheduling_agreements;
select confirm_tee_time(:'poll', 'Wembley Golf Course', '2026-12-13', '07:40');
select cast_vote(:'s1', 'maybe');
reset role;
set role authenticated; set request.jwt.claim.sub = :'pirie'; select admin_confirm_attendance(:'poll', 'fitz'); reset role;
set role authenticated; set request.jwt.claim.sub = :'fitz';  select confirm_attendance(:'poll'); select confirm_attendance(:'poll'); reset role;
select 'agreed now=' || count(*) || ' fitz via=' || (select via from scheduling_agreements where player_id='fitz') from scheduling_agreements;

\echo '--- confirm tee time: admin only, updates the EXISTING fixture'
set role authenticated; set request.jwt.claim.sub = :'fitz'; select confirm_tee_time(:'poll', 'Wembley Golf Course', '2026-12-13', '07:40'); reset role;
set role authenticated; set request.jwt.claim.sub = :'admin';
select confirm_tee_time(:'poll', '', '2026-12-13', '07:40');
select confirm_tee_time(:'poll', 'Wembley Golf Course', '2026-12-13', '07:40', 'WGC-4471', 'Carts booked', 270);
reset role;
select 'poll=' || status || ' fixture=' || scheduled_date || ' ' || f.tee_time || ' ' || f.course from scheduling_polls p join fixtures f on f.id = p.fixture_id where p.id = :'poll';
select 'fixtures after=' || count(*) from fixtures;
set role authenticated; set request.jwt.claim.sub = :'admin';
select confirm_tee_time(:'poll', 'Lake Karrinyup', '2026-12-13', '08:10', 'LK-9', null, 300);
reset role;
select 'amended fixture=' || f.tee_time || ' ' || f.course from fixtures f where id = :'fx5';

\echo '--- reopen keeps every vote and the history'
set role authenticated; set request.jwt.claim.sub = :'fitz'; select reopen_poll(:'poll'); reset role;
set role authenticated; set request.jwt.claim.sub = :'admin'; select reopen_poll(:'poll'); reset role;
select 'status=' || status || ' votes kept=' || (select count(*) from scheduling_votes) || ' fixture tee_time is null=' || (select tee_time is null from fixtures where id = :'fx5') from scheduling_polls where id = :'poll';
select 'history=' || string_agg(event_type, ' > ' order by created_at, id) from scheduling_events;
\echo '--- strict deadline rule'
set role authenticated; set request.jwt.claim.sub = :'admin'; select update_poll(:'poll', now() - interval '1 hour', true, null); reset role;
set role authenticated; set request.jwt.claim.sub = :'fitz'; select cast_vote(:'s1', 'maybe'); reset role;
set role authenticated; set request.jwt.claim.sub = :'admin'; select update_poll(:'poll', now() - interval '1 hour', false, null); reset role;
set role authenticated; set request.jwt.claim.sub = :'fitz'; select cast_vote(:'s1', 'maybe'); reset role;
select 'vote after soft deadline=' || status from scheduling_votes where slot_id = :'s1' and player_id = 'fitz';
\echo '--- cancel then open a fresh poll for the same round; championship data untouched'
set role authenticated; set request.jwt.claim.sub = :'admin';
select cancel_poll(:'poll');
select 'new poll ok=' || (create_poll(:'fx5', null, null, 'Australia/Perth', false, '[{"date":"2027-01-09","window":"morning"}]') is not null);
reset role;
select 'polls=' || count(*) || ' active for round 5=' || count(*) filter (where status <> 'cancelled') from scheduling_polls;
select 'results=' || (select count(*) from results) || ' fines=' || (select count(*) from fines) || ' fixtures=' || (select count(*) from fixtures);
