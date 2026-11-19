-- Tee Time database checks. Run on a scratch database after
-- supabase-shim.sql + supabase-schema.sql (see README → Tests).
\set ON_ERROR_STOP 0
\pset tuples_only on
select id as season from seasons where number = 1 \gset
select id as fx1 from fixtures where round_number = 1 and season_id = :'season' \gset
select id as fx2 from fixtures where round_number = 2 and season_id = :'season' \gset
-- a Friday a few weeks out, whatever day the test runs
select (current_date + 21 + ((5 - extract(isodow from current_date + 21)::int + 7) % 7))::date as fri \gset

set role anon;
\echo '--- availability: visitors can read but never write the table directly'
insert into availability (player_id, weekend, mask) values ('jones', :'fri', 1);
update availability set mask = 0;
\echo '--- availability through the guarded function'
select set_availability('jones', jsonb_build_array(jsonb_build_object('w', :'fri', 's', 1 + 2, 'c', 0)));
select set_availability('jones', jsonb_build_array(jsonb_build_object('w', :'fri', 's', 32, 'c', 2)));
select 'jones mask=' || mask from availability where player_id = 'jones' and weekend = :'fri';
select set_availability('fitz', jsonb_build_array(jsonb_build_object('w', :'fri', 's', 0, 'c', 32767)));
select 'fitz answered with nothing ticked: mask=' || mask from availability where player_id = 'fitz';
select set_availability('forrest', jsonb_build_array(jsonb_build_object('w', :'fri', 's', 32768, 'c', 32767)));   -- "can't make it"
select 'forrest can''t make it: mask=' || mask from availability where player_id = 'forrest';
select set_availability('forrest', jsonb_build_array(jsonb_build_object('w', :'fri', 's', 2, 'c', 32768)));       -- then ticks a time
select 'forrest ticked a time: mask=' || mask from availability where player_id = 'forrest';
select set_availability('forrest', jsonb_build_array(jsonb_build_object('w', :'fri', 's', 65536)));               -- out of range
select set_availability('jones', jsonb_build_array(jsonb_build_object('w', (:'fri'::date + 1)::text, 's', 1)));   -- a Saturday
select set_availability('jones', jsonb_build_array(jsonb_build_object('w', :'fri', 's', 99999)));
select set_availability('jones', jsonb_build_array(jsonb_build_object('w', 'not-a-date', 's', 1)));
select set_availability('nobody', jsonb_build_array(jsonb_build_object('w', :'fri', 's', 1)));
select set_availability('jones', '[]'::jsonb);
\echo '--- two phones at once: cell-level changes merge instead of overwriting'
select set_availability('pirie', jsonb_build_array(jsonb_build_object('w', :'fri', 's', 1)));     -- phone A ticks Fri Early AM
select set_availability('pirie', jsonb_build_array(jsonb_build_object('w', :'fri', 's', 64)));    -- phone B ticks Sat Late AM
select 'pirie mask (both kept)=' || mask from availability where player_id = 'pirie';
\echo '--- extend the window'
select 'weeks now=' || extend_availability(:'fx2');
reset role;
select 'availability logged=' || count(*) from dd_activity where action = 'availability';

set role anon;
\echo '--- propose, respond, schedule'
select propose_round(:'fx2', :'fri'::date + 1, 0, 'jones') as prop \gset
select propose_round(:'fx2', :'fri'::date + 2, 1, 'fitz');                                   -- second proposal for the same round
select propose_round(:'fx1', (:'fri'::date - 2), 0, null);                                   -- a Wednesday
select propose_round(:'fx1', :'fri', 7, null);                                               -- bad window
select 'jones auto-confirmed: ' || response from tee_responses where proposal_id = :'prop' and player_id = 'jones';
select respond_proposal(:'prop', 'fitz', 'yes');
select respond_proposal(:'prop', 'pirie', 'no');
select respond_proposal(:'prop', 'nobody', 'yes');
select respond_proposal(:'prop', 'forrest', 'maybe');
select schedule_fixture(:'prop', '07:40', 'Wembley Golf Course');                             -- Pirie said no, Forrest waiting
select respond_proposal(:'prop', 'pirie', 'yes');
select respond_proposal(:'prop', 'forrest', 'yes');
select schedule_fixture(:'prop', null, 'Wembley Golf Course');
select schedule_fixture(:'prop', '07:40', '');
select schedule_fixture(:'prop', '07:40', 'Wembley Golf Course');
select 'proposal=' || status || ' | fixture date=' || (scheduled_date = :'fri'::date + 1) || ' tee=' || f.tee_time || ' course=' || f.course
  from tee_proposals p join fixtures f on f.id = p.fixture_id where p.id = :'prop';
select respond_proposal(:'prop', 'jones', 'no');                                              -- closed once scheduled
select schedule_fixture(:'prop', '08:10', 'Wembley Golf Course');                             -- amend the time
select 'amended tee=' || tee_time from fixtures where id = :'fx2';
select 'fixtures still=' || count(*) from fixtures where season_id = :'season';
\echo '--- withdraw clears the fixture date and lets a new proposal be made'
select withdraw_proposal(:'prop');
select 'after withdraw: date null=' || (scheduled_date is null) || ' tee null=' || (tee_time is null) from fixtures where id = :'fx2';
select 'new proposal ok=' || (propose_round(:'fx2', :'fri', 4, 'pirie') is not null);
\echo '--- a played round cannot be proposed or scheduled'
select save_result(:'fx1', current_date, 'Wembley', 78, 83, null, 'create') is not null as saved \gset
select propose_round(:'fx1', :'fri', 0, null);
reset role;
\echo '--- availability taps have their own limit and do not use up the results/fines limit'
delete from dd_activity;
set role anon;
do $$ declare i int; begin for i in 1..60 loop perform set_availability('forrest', jsonb_build_array(jsonb_build_object('w', (select (current_date + 21 + ((5 - extract(isodow from current_date + 21)::int + 7) % 7))::date), 's', i % 2))); end loop; end $$;
select 'result after 60 availability saves ok=' || (save_result(:'fx2', current_date, 'Wembley', 80, 80, null, 'create') is not null);
reset role;
