-- 로컬 PostgreSQL에서 Supabase 환경을 흉내 내는 최소 준비 스크립트 (테스트 전용, 실제 Supabase에는 실행하지 않음)
-- Supabase에 이미 있는 것: anon / authenticated / service_role 역할, auth.users, auth.uid(),
-- public 테이블에 대한 anon·authenticated 기본 권한.

-- 역할은 클러스터 전체에 남으므로 이미 있으면 건너뛴다.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase처럼 public에 새로 만드는 테이블·함수에 기본 권한을 준다(마이그레이션이 다시 회수하는지 확인하기 위함).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
