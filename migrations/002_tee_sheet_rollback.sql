-- =====================================================================
--  DESIGNATED DRIVERS — ROLLBACK of Migration 002 (The Tee Sheet)
--
--  ⚠️  This permanently deletes every scheduling poll, vote, agreement,
--  history entry and player login link. It does NOT touch results, fines,
--  seasons, administrators, or any fixture's date and course.
--
--  Before running, consider exporting the scheduling tables
--  (Table Editor → table → Export to CSV).
--  Also redeploy the previous version of the website (or leave the new one:
--  it detects the missing tables and simply shows the Tee Sheet as unavailable).
-- =====================================================================
begin;

drop function if exists public.cancel_poll(uuid);
drop function if exists public.reopen_poll(uuid);
drop function if exists public.confirm_tee_time(uuid, text, date, time, text, text, int);
drop function if exists public.admin_confirm_attendance(uuid, text);
drop function if exists public.confirm_attendance(uuid);
drop function if exists public.tee_record_agreement(uuid, text, text);
drop function if exists public.lock_in_date(uuid, uuid);
drop function if exists public.admin_set_vote(uuid, text, text);
drop function if exists public.cast_vote(uuid, text);
drop function if exists public.tee_write_vote(uuid, text, text);
drop function if exists public.update_poll(uuid, timestamptz, boolean, text);
drop function if exists public.set_slot_preferred(uuid, boolean);
drop function if exists public.remove_poll_slot(uuid);
drop function if exists public.add_poll_slot(uuid, date, text, time, text);
drop function if exists public.create_poll(uuid, timestamptz, text, text, boolean, jsonb);
drop function if exists public.tee_add_slot(uuid, date, text, time, text);
drop function if exists public.tee_log(uuid, text, jsonb);

alter table if exists public.scheduling_polls drop constraint if exists polls_agreed_slot_fk;
drop table if exists public.scheduling_events;
drop table if exists public.scheduling_agreements;
drop table if exists public.scheduling_votes;
drop table if exists public.scheduling_slots;
drop table if exists public.scheduling_polls;

drop function if exists public.current_player_id();
drop table if exists public.player_accounts;

-- The confirmed tee-off TIME lives only in this column; dates and courses stay on the fixture.
alter table public.fixtures drop column if exists tee_time;

commit;
