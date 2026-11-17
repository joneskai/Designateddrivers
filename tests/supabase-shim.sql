-- Stand-in for Supabase's built-in roles, used ONLY to test supabase-schema.sql
-- on a plain local PostgreSQL. Never run this on Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;
-- Supabase gives new tables/functions to these roles by default; mimic that so the schema's revokes are really tested.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
