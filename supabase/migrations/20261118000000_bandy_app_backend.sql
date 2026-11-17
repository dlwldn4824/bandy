-- Bandy 앱 백엔드 (Supabase)
-- 기준: 노션 「밴디_Supabase_DB_설계초안_SQL기준」의 13개 테이블(202610140001_bandy_initial_schema.sql)
--       + 11/1 동아리 회의 결정(동아리 찾기 · 교류 신청 · 입금자명 예매와 입금 확인)
--
-- 팀 초기 SQL이 이미 실행된 DB와 빈 DB 모두에서 돌도록 `if not exists`로 만든다.
-- 초기 SQL 원문은 이 저장소에 없어서, 노션 문서에 보인 테이블·컬럼 이름에 맞춰 다시 적었다.
-- 초기 SQL과 상태값(CHECK) 단어가 다르면 아래 함수가 막힐 수 있으니 적용 전에 원문과 대조해야 한다.
--
-- 쓰기는 모두 아래 RPC 함수(security definer)로만 한다. 앱 역할(anon/authenticated)은 테이블에 직접 쓰지 못한다.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── 테이블 (노션 13개 + 11/1 추가) ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id),
  display_name text not null default '',
  profile_path text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'WITHDRAWN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists is_admin boolean not null default false; -- [11/1] 동아리 수동 승인 운영자

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  introduction text,
  city text,
  profile_path text,
  sns_url text,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- [11/1] 동아리 찾기 프로필
alter table public.clubs add column if not exists school text not null default '';
alter table public.clubs add column if not exists genre text not null default '';
alter table public.clubs add column if not exists region text not null default '';
alter table public.clubs add column if not exists exchange_open boolean not null default false;
alter table public.clubs add column if not exists created_by uuid references public.profiles (id);
create unique index if not exists clubs_name_key on public.clubs (name);

-- [11/1] 오픈채팅 링크는 공개 프로필과 분리(교류 수락된 동아리와 자기 동아리만 조회)
create table if not exists public.club_private (
  club_id uuid primary key references public.clubs (id),
  open_chat_url text not null default ''
);

create table if not exists public.club_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  club_id uuid not null references public.clubs (id),
  role text not null check (role in ('OWNER', 'MANAGER', 'MEMBER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PENDING', 'LEFT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, club_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id),
  created_by uuid not null references public.profiles (id),
  title text not null,
  description text,
  category text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  admission_starts_at timestamptz,
  admission_ends_at timestamptz,
  timezone text not null default 'Asia/Seoul',
  venue_name text,
  address text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  poster_path text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ENDED', 'CANCELLED')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- [11/1] 입금자명 방식 결제 안내
alter table public.events add column if not exists bank_name text not null default '';
alter table public.events add column if not exists account_number text not null default '';
alter table public.events add column if not exists account_holder text not null default '';
create index if not exists events_club_idx on public.events (club_id);

create table if not exists public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  name text not null,
  price_krw bigint not null check (price_krw >= 0),
  capacity integer not null check (capacity > 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  sold_quantity integer not null default 0 check (sold_quantity >= 0),
  sales_starts_at timestamptz not null default now(),
  sales_ends_at timestamptz not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reserved_quantity + sold_quantity <= capacity),
  unique (id, event_id)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  event_id uuid not null references public.events (id),
  status text not null default 'PENDING_PAYMENT' check (status in ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  total_amount_krw bigint not null check (total_amount_krw >= 0),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  idempotency_key text not null,
  request_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  unique (user_id, idempotency_key)
);
create index if not exists bookings_event_idx on public.bookings (event_id, status);

create table if not exists public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  event_id uuid not null references public.events (id),
  user_id uuid not null references public.profiles (id),
  ticket_type_id uuid not null,
  quantity integer not null check (quantity > 0),
  unit_price_krw bigint not null check (unit_price_krw >= 0),
  ticket_type_name text not null,
  created_at timestamptz not null default now(),
  foreign key (ticket_type_id, event_id) references public.ticket_types (id, event_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  provider text not null,
  environment text not null default 'TEST' check (environment in ('TEST', 'LIVE')),
  provider_order_id text not null unique,
  provider_payment_key text unique,
  status text not null default 'PENDING' check (status in ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUND_PENDING', 'REFUNDED')),
  approved_at timestamptz,
  failure_code text,
  reconciliation_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- [11/1] 12월 공연은 카드 결제 없이 계좌이체 + 동아리의 입금 확인
alter table public.payments add column if not exists depositor_name text not null default '';
alter table public.payments add column if not exists confirmed_by uuid references public.profiles (id);
create unique index if not exists payments_one_success on public.payments (booking_id) where status in ('SUCCEEDED', 'REFUND_PENDING');

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  booking_item_id uuid not null references public.booking_items (id),
  user_id uuid not null references public.profiles (id),
  event_id uuid not null references public.events (id),
  issue_sequence integer not null check (issue_sequence > 0),
  entry_number integer check (entry_number > 0),
  status text not null default 'ISSUED' check (status in ('ISSUED', 'CHECKED_IN', 'CANCELLED')),
  seat_info text,
  issued_at timestamptz not null default now(),
  ticket_received_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_item_id, issue_sequence),
  check ((checked_in_at is null) = (checked_in_by is null)),
  check (status <> 'CHECKED_IN' or checked_in_at is not null)
);
create unique index if not exists tickets_entry_number_key on public.tickets (event_id, entry_number) where entry_number is not null;

create table if not exists public.qr_credentials (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create unique index if not exists qr_one_active on public.qr_credentials (ticket_id) where revoked_at is null;

create table if not exists public.event_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  user_id uuid not null references public.profiles (id),
  role text not null default 'SCANNER',
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  event_id uuid references public.events (id),
  type text not null,
  message text not null,
  source_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles (id),
  event_id uuid references public.events (id),
  action text not null,
  resource_type text not null,
  resource_id text not null,
  request_id text,
  created_at timestamptz not null default now()
);

-- [11/1] 교류 신청
create table if not exists public.exchange_requests (
  id uuid primary key default gen_random_uuid(),
  from_club_id uuid not null references public.clubs (id),
  to_club_id uuid not null references public.clubs (id),
  kind text not null check (kind in ('JOINT_SHOW', 'PRACTICE', 'WATCH_SWAP')),
  message text not null default '' check (length(message) <= 300),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
  created_by uuid not null references public.profiles (id),
  responded_by uuid references public.profiles (id),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_club_id <> to_club_id)
);
create unique index if not exists exchange_one_pending on public.exchange_requests (from_club_id, to_club_id) where status = 'PENDING';

-- ───────────────────────── 가입 시 프로필 생성 ─────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name',
                           new.raw_user_meta_data ->> 'nickname', split_part(coalesce(new.email, ''), '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists bandy_on_auth_user_created on auth.users;
create trigger bandy_on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── 권한 판정 ─────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.is_club_manager(p_club_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.club_memberships m
    where m.club_id = p_club_id and m.user_id = auth.uid() and m.status = 'ACTIVE' and m.role in ('OWNER', 'MANAGER'));
$$;

create or replace function public.is_event_staff(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event_id and public.is_club_manager(e.club_id))
      or exists (select 1 from public.event_staff s where s.event_id = p_event_id and s.user_id = auth.uid() and s.status = 'ACTIVE');
$$;

create or replace function public.has_exchange_with(p_club_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.exchange_requests r
    join public.club_memberships m on m.user_id = auth.uid() and m.status = 'ACTIVE' and m.role in ('OWNER', 'MANAGER')
      and m.club_id in (r.from_club_id, r.to_club_id) and m.club_id <> p_club_id
    where r.status = 'ACCEPTED' and p_club_id in (r.from_club_id, r.to_club_id));
$$;

-- 예매자 명단에 표시명을 보여 주기 위해: 내 공연을 예매한 사람의 프로필
create or replace function public.can_view_profile(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_profile_id = auth.uid() or public.is_admin()
      or exists (select 1 from public.bookings b where b.user_id = p_profile_id and public.is_event_staff(b.event_id));
$$;

-- ───────────────────────── RLS (읽기만 허용) ─────────────────────────
alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_private enable row level security;
alter table public.club_memberships enable row level security;
alter table public.events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.payments enable row level security;
alter table public.tickets enable row level security;
alter table public.qr_credentials enable row level security;
alter table public.event_staff enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.exchange_requests enable row level security;

drop policy if exists bandy_profiles_select on public.profiles;
create policy bandy_profiles_select on public.profiles for select to authenticated using (public.can_view_profile(id));
drop policy if exists bandy_clubs_select on public.clubs;
create policy bandy_clubs_select on public.clubs for select to anon, authenticated
  using (status = 'ACTIVE' or public.is_club_manager(id) or public.is_admin());
drop policy if exists bandy_club_private_select on public.club_private;
create policy bandy_club_private_select on public.club_private for select to authenticated
  using (public.is_club_manager(club_id) or public.has_exchange_with(club_id));
drop policy if exists bandy_memberships_select on public.club_memberships;
create policy bandy_memberships_select on public.club_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_club_manager(club_id));
drop policy if exists bandy_events_select on public.events;
create policy bandy_events_select on public.events for select to anon, authenticated
  using ((status in ('PUBLISHED', 'ENDED') and exists (select 1 from public.clubs c where c.id = club_id and c.status = 'ACTIVE'))
         or public.is_club_manager(club_id));
drop policy if exists bandy_ticket_types_select on public.ticket_types;
create policy bandy_ticket_types_select on public.ticket_types for select to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id));
drop policy if exists bandy_bookings_select on public.bookings;
create policy bandy_bookings_select on public.bookings for select to authenticated
  using (user_id = auth.uid() or public.is_event_staff(event_id));
drop policy if exists bandy_booking_items_select on public.booking_items;
create policy bandy_booking_items_select on public.booking_items for select to authenticated
  using (user_id = auth.uid() or public.is_event_staff(event_id));
-- 계좌이체 결제는 비밀값이 없어 예매자 본인과 주최 운영진에게 입금자명·주문번호를 보여 준다(노션 초안은 직접 조회 금지 → 팀 확인 필요)
drop policy if exists bandy_payments_select on public.payments;
create policy bandy_payments_select on public.payments for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and (b.user_id = auth.uid() or public.is_event_staff(b.event_id))));
drop policy if exists bandy_tickets_select on public.tickets;
create policy bandy_tickets_select on public.tickets for select to authenticated
  using (user_id = auth.uid() or public.is_event_staff(event_id));
drop policy if exists bandy_event_staff_select on public.event_staff;
create policy bandy_event_staff_select on public.event_staff for select to authenticated
  using (user_id = auth.uid() or public.is_event_staff(event_id));
drop policy if exists bandy_notifications_select on public.notifications;
create policy bandy_notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists bandy_exchange_select on public.exchange_requests;
create policy bandy_exchange_select on public.exchange_requests for select to authenticated
  using (public.is_club_manager(from_club_id) or public.is_club_manager(to_club_id));
-- qr_credentials, audit_logs: 앱에서 직접 조회하지 않는다(정책 없음)

revoke all on all tables in schema public from anon, authenticated;
grant select on public.clubs, public.events, public.ticket_types to anon;
grant select on public.profiles, public.clubs, public.club_private, public.club_memberships, public.events, public.ticket_types,
  public.bookings, public.booking_items, public.payments, public.tickets, public.event_staff, public.notifications,
  public.exchange_requests to authenticated;

-- ───────────────────────── 내부 도구 ─────────────────────────
create or replace function public._notify(p_user uuid, p_event uuid, p_type text, p_message text, p_key text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, event_id, type, message, source_key)
  values (p_user, p_event, p_type, p_message, p_key) on conflict (source_key) do nothing;
$$;

create or replace function public._audit(p_event uuid, p_action text, p_type text, p_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_user_id, event_id, action, resource_type, resource_id)
  values (auth.uid(), p_event, p_action, p_type, p_id::text);
$$;

create or replace function public._require_login() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.' using errcode = '28000'; end if;
  return auth.uid();
end;
$$;

-- 입금 기한이 지난 예매를 정리하고 잡아 둔 수량을 돌려준다(예매 시점에 그 티켓 종류만 정리)
create or replace function public._expire_bookings(p_ticket_type uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select b.id, i.quantity from public.bookings b join public.booking_items i on i.booking_id = b.id
    where i.ticket_type_id = p_ticket_type and b.status = 'PENDING_PAYMENT' and b.expires_at <= now()
    for update of b
  loop
    update public.bookings set status = 'EXPIRED', updated_at = now() where id = r.id;
    update public.payments set status = 'FAILED', failure_code = 'EXPIRED', updated_at = now() where booking_id = r.id and status = 'PENDING';
    update public.ticket_types set reserved_quantity = reserved_quantity - r.quantity, updated_at = now() where id = p_ticket_type;
  end loop;
end;
$$;

-- ───────────────────────── RPC: 회원 · 동아리 ─────────────────────────
create or replace function public.update_profile(p_display_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_login();
  if length(btrim(p_display_name)) = 0 then raise exception '이름을 입력하세요.' using errcode = '22023'; end if;
  update public.profiles set display_name = left(btrim(p_display_name), 20), updated_at = now() where id = auth.uid();
end;
$$;

create or replace function public.create_club(p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_login(); v_id uuid; v_name text := btrim(coalesce(p_input ->> 'name', ''));
begin
  if v_name = '' then raise exception '동아리 이름을 입력하세요.' using errcode = '22023'; end if;
  if exists (select 1 from public.clubs where name = v_name) then raise exception '이미 등록된 동아리 이름입니다.' using errcode = '23505'; end if;
  insert into public.clubs (name, introduction, city, profile_path, sns_url, school, genre, region, exchange_open, created_by)
  values (v_name, p_input ->> 'introduction', '서울', p_input ->> 'profile_path', nullif(btrim(coalesce(p_input ->> 'sns_url', '')), ''),
          btrim(coalesce(p_input ->> 'school', '')), btrim(coalesce(p_input ->> 'genre', '')), btrim(coalesce(p_input ->> 'region', '')),
          coalesce((p_input ->> 'exchange_open')::boolean, false), v_uid)
  returning id into v_id;
  insert into public.club_memberships (user_id, club_id, role) values (v_uid, v_id, 'OWNER');
  insert into public.club_private (club_id, open_chat_url) values (v_id, btrim(coalesce(p_input ->> 'open_chat_url', '')));
  return v_id;
end;
$$;

create or replace function public.update_club(p_club_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not public.is_club_manager(p_club_id) then raise exception '동아리 운영진만 수정할 수 있습니다.' using errcode = '42501'; end if;
  if p_patch ? 'name' then
    v_name := btrim(p_patch ->> 'name');
    if v_name = '' then raise exception '동아리 이름을 입력하세요.' using errcode = '22023'; end if;
    if exists (select 1 from public.clubs where name = v_name and id <> p_club_id) then raise exception '이미 등록된 동아리 이름입니다.' using errcode = '23505'; end if;
  end if;
  update public.clubs set
    name = coalesce(v_name, name),
    introduction = case when p_patch ? 'introduction' then p_patch ->> 'introduction' else introduction end,
    profile_path = case when p_patch ? 'profile_path' then p_patch ->> 'profile_path' else profile_path end,
    sns_url = case when p_patch ? 'sns_url' then nullif(btrim(coalesce(p_patch ->> 'sns_url', '')), '') else sns_url end,
    school = case when p_patch ? 'school' then btrim(p_patch ->> 'school') else school end,
    genre = case when p_patch ? 'genre' then btrim(p_patch ->> 'genre') else genre end,
    region = case when p_patch ? 'region' then btrim(p_patch ->> 'region') else region end,
    exchange_open = case when p_patch ? 'exchange_open' then (p_patch ->> 'exchange_open')::boolean else exchange_open end,
    updated_at = now()
  where id = p_club_id;
  if p_patch ? 'open_chat_url' then
    insert into public.club_private (club_id, open_chat_url) values (p_club_id, btrim(p_patch ->> 'open_chat_url'))
    on conflict (club_id) do update set open_chat_url = excluded.open_chat_url;
  end if;
end;
$$;

create or replace function public.set_club_status(p_club_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_club public.clubs; v_owner uuid;
begin
  if not public.is_admin() then raise exception '운영자만 승인할 수 있습니다.' using errcode = '42501'; end if;
  update public.clubs set status = p_status, updated_at = now() where id = p_club_id returning * into v_club;
  if not found then raise exception '동아리를 찾지 못했습니다.' using errcode = 'P0002'; end if;
  select user_id into v_owner from public.club_memberships where club_id = p_club_id and role = 'OWNER' limit 1;
  if v_owner is not null then
    perform public._notify(v_owner, null, 'CLUB_STATUS', case when p_status = 'ACTIVE'
      then v_club.name || ' 동아리가 승인됐어요. 이제 공연을 올리고 교류를 신청할 수 있어요.'
      else v_club.name || ' 동아리 승인이 거절됐어요.' end, 'club-status-' || p_club_id || '-' || p_status);
  end if;
end;
$$;

-- ───────────────────────── RPC: 공연 ─────────────────────────
create or replace function public.create_event(p_club_id uuid, p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_login();
  v_id uuid;
  v_publish boolean := coalesce((p_input ->> 'publish')::boolean, false);
  v_price bigint := coalesce((p_input ->> 'price_krw')::bigint, 0);
  v_capacity integer := coalesce((p_input ->> 'capacity')::integer, 0);
  v_starts timestamptz := nullif(p_input ->> 'starts_at', '')::timestamptz;
  v_club public.clubs;
begin
  if not public.is_club_manager(p_club_id) then raise exception '동아리 운영진만 공연을 올릴 수 있습니다.' using errcode = '42501'; end if;
  select * into v_club from public.clubs where id = p_club_id;
  if v_club.status <> 'ACTIVE' then raise exception '승인된 동아리만 공연을 올릴 수 있습니다.' using errcode = 'P0001'; end if;
  if btrim(coalesce(p_input ->> 'title', '')) = '' then raise exception '공연명을 입력하세요.' using errcode = '22023'; end if;
  if v_starts is null then raise exception '일시를 입력하세요.' using errcode = '22023'; end if;
  if v_capacity <= 0 then raise exception '정원은 1 이상이어야 합니다.' using errcode = '22023'; end if;
  if v_price < 0 then raise exception '가격은 0원 이상이어야 합니다.' using errcode = '22023'; end if;
  if v_publish and btrim(coalesce(p_input ->> 'venue_name', '')) = '' then raise exception '공개하려면 장소가 필요합니다.' using errcode = '22023'; end if;
  if v_publish and v_price > 0 and btrim(coalesce(p_input ->> 'account_number', '')) = '' then raise exception '유료 공연은 입금 계좌가 필요합니다.' using errcode = '22023'; end if;
  -- 좌표: 실제로는 주소 → 좌표 변환(카카오 Local) 결과를 받는다. 없으면 null
  insert into public.events (club_id, created_by, title, description, category, starts_at, venue_name, address, latitude, longitude,
    poster_path, status, published_at, bank_name, account_number, account_holder)
  values (p_club_id, v_uid, btrim(p_input ->> 'title'), p_input ->> 'description', p_input ->> 'category', v_starts,
    btrim(coalesce(p_input ->> 'venue_name', '')), btrim(coalesce(p_input ->> 'address', '')),
    nullif(p_input ->> 'latitude', '')::double precision, nullif(p_input ->> 'longitude', '')::double precision,
    p_input ->> 'poster_path', case when v_publish then 'PUBLISHED' else 'DRAFT' end, case when v_publish then now() end,
    btrim(coalesce(p_input ->> 'bank_name', '')), btrim(coalesce(p_input ->> 'account_number', '')), v_club.name)
  returning id into v_id;
  insert into public.ticket_types (event_id, name, price_krw, capacity, sales_ends_at)
  values (v_id, case when v_price > 0 then '일반' else '참가 신청' end, v_price, v_capacity, v_starts);
  perform public._audit(v_id, 'CREATE', 'event', v_id);
  return v_id;
end;
$$;

create or replace function public.update_event(p_event_id uuid, p_input jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events; v_tt public.ticket_types;
  v_price bigint := coalesce((p_input ->> 'price_krw')::bigint, 0);
  v_capacity integer := coalesce((p_input ->> 'capacity')::integer, 0);
  v_starts timestamptz := nullif(p_input ->> 'starts_at', '')::timestamptz;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found or not public.is_club_manager(v_event.club_id) then raise exception '공연을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  if btrim(coalesce(p_input ->> 'title', '')) = '' then raise exception '공연명을 입력하세요.' using errcode = '22023'; end if;
  if v_starts is null then raise exception '일시를 입력하세요.' using errcode = '22023'; end if;
  select * into v_tt from public.ticket_types where event_id = p_event_id order by created_at limit 1 for update;
  if v_price <> v_tt.price_krw and exists (select 1 from public.bookings where event_id = p_event_id and status <> 'CANCELLED') then
    raise exception '예매가 있는 공연은 가격을 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_capacity < v_tt.reserved_quantity + v_tt.sold_quantity then raise exception '이미 예매된 수량보다 정원을 줄일 수 없습니다.' using errcode = 'P0001'; end if;
  if v_event.status = 'PUBLISHED' and btrim(coalesce(p_input ->> 'venue_name', '')) = '' then raise exception '공개 중인 공연은 장소가 필요합니다.' using errcode = '22023'; end if;
  update public.events set title = btrim(p_input ->> 'title'), description = p_input ->> 'description', category = p_input ->> 'category',
    starts_at = v_starts, venue_name = btrim(coalesce(p_input ->> 'venue_name', '')), address = btrim(coalesce(p_input ->> 'address', '')),
    bank_name = btrim(coalesce(p_input ->> 'bank_name', '')), account_number = btrim(coalesce(p_input ->> 'account_number', '')),
    poster_path = p_input ->> 'poster_path', updated_at = now()
  where id = p_event_id;
  update public.ticket_types set price_krw = v_price, capacity = v_capacity, sales_ends_at = v_starts, updated_at = now() where id = v_tt.id;
  perform public._audit(p_event_id, 'UPDATE', 'event', p_event_id);
end;
$$;

create or replace function public.set_event_status(p_event_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event public.events;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found or not public.is_club_manager(v_event.club_id) then raise exception '공연을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  if p_status = 'PUBLISHED' and btrim(coalesce(v_event.venue_name, '')) = '' then raise exception '공개하려면 장소가 필요합니다.' using errcode = '22023'; end if;
  update public.events set status = p_status, published_at = case when p_status = 'PUBLISHED' then coalesce(published_at, now()) else published_at end,
    updated_at = now() where id = p_event_id;
end;
$$;

-- [미정] 예매가 있는 공연의 삭제·환불 정책 전까지는 예매 기록이 없을 때만 지운다
create or replace function public.delete_event(p_event_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event public.events;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found or not public.is_club_manager(v_event.club_id) then raise exception '공연을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.bookings where event_id = p_event_id) then
    raise exception '예매 기록이 있는 공연은 삭제할 수 없습니다. 비공개로 돌려 주세요.' using errcode = 'P0001';
  end if;
  delete from public.ticket_types where event_id = p_event_id;
  delete from public.event_staff where event_id = p_event_id;
  update public.notifications set event_id = null where event_id = p_event_id;
  update public.audit_logs set event_id = null where event_id = p_event_id;
  delete from public.events where id = p_event_id;
end;
$$;

-- ───────────────────────── RPC: 예매 · 입금 확인 ─────────────────────────
-- [미정] 입금 대기 3일, 1회 최대 10장
create or replace function public.create_booking(p_ticket_type_id uuid, p_quantity integer, p_depositor_name text, p_idempotency_key text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_login();
  v_key text := coalesce(nullif(p_idempotency_key, ''), gen_random_uuid()::text);
  v_hash text := encode(extensions.digest(p_ticket_type_id::text || ':' || p_quantity || ':' || coalesce(p_depositor_name, ''), 'sha256'), 'hex');
  v_tt public.ticket_types; v_event public.events; v_existing public.bookings; v_booking uuid; v_item uuid;
begin
  -- 같은 요청 재전송이면 같은 예매를 돌려준다
  select * into v_existing from public.bookings where user_id = v_uid and idempotency_key = v_key;
  if found then
    if v_existing.request_hash <> v_hash then raise exception '같은 요청 키로 다른 예매를 만들 수 없습니다.' using errcode = '23505'; end if;
    return v_existing.id;
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 then raise exception '수량은 1~10장입니다.' using errcode = '22023'; end if;
  select * into v_tt from public.ticket_types where id = p_ticket_type_id for update;  -- 잠금 순서: 티켓 종류 → 예매
  select * into v_event from public.events where id = v_tt.event_id;
  if v_tt.id is null or v_tt.status <> 'ACTIVE' or v_event.status <> 'PUBLISHED'
     or not exists (select 1 from public.clubs where id = v_event.club_id and status = 'ACTIVE') then
    raise exception '지금 예매할 수 없는 공연입니다.' using errcode = 'P0001';
  end if;
  perform public._expire_bookings(v_tt.id);
  select * into v_tt from public.ticket_types where id = p_ticket_type_id;
  if v_tt.capacity - v_tt.reserved_quantity - v_tt.sold_quantity < p_quantity then raise exception '남은 자리가 부족합니다.' using errcode = 'P0001'; end if;
  if v_tt.price_krw > 0 and btrim(coalesce(p_depositor_name, '')) = '' then raise exception '입금자명을 입력하세요.' using errcode = '22023'; end if;

  insert into public.bookings (user_id, event_id, total_amount_krw, expires_at, idempotency_key, request_hash)
  values (v_uid, v_event.id, v_tt.price_krw * p_quantity, now() + interval '3 days', v_key, v_hash) returning id into v_booking;
  insert into public.booking_items (booking_id, event_id, user_id, ticket_type_id, quantity, unit_price_krw, ticket_type_name)
  values (v_booking, v_event.id, v_uid, v_tt.id, p_quantity, v_tt.price_krw, v_tt.name) returning id into v_item;
  insert into public.payments (booking_id, provider, provider_order_id, depositor_name)
  values (v_booking, 'BANK_TRANSFER', 'BANDY-' || upper(left(replace(v_booking::text, '-', ''), 12)), btrim(coalesce(p_depositor_name, '')));
  update public.ticket_types set reserved_quantity = reserved_quantity + p_quantity, updated_at = now() where id = v_tt.id;

  -- [미정] 무료 공연은 입금 확인 없이 바로 확정
  if v_tt.price_krw = 0 then perform public._confirm_booking(v_booking, null); end if;
  return v_booking;
end;
$$;

-- 예매 확정 + 수량만큼 티켓 발급(입장번호는 공연 안에서 순서대로)
create or replace function public._confirm_booking(p_booking_id uuid, p_confirmed_by uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_i public.booking_items; v_next integer; v_title text;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  select * into v_i from public.booking_items where booking_id = p_booking_id;
  perform 1 from public.events where id = v_b.event_id for update;  -- 입장번호 순서를 위해 공연 단위로 잠금
  update public.bookings set status = 'CONFIRMED', confirmed_at = now(), updated_at = now() where id = p_booking_id;
  update public.payments set status = 'SUCCEEDED', approved_at = now(), confirmed_by = p_confirmed_by, updated_at = now()
    where booking_id = p_booking_id and status = 'PENDING';
  update public.ticket_types set reserved_quantity = reserved_quantity - v_i.quantity, sold_quantity = sold_quantity + v_i.quantity,
    updated_at = now() where id = v_i.ticket_type_id;
  select coalesce(max(entry_number), 0) + 1 into v_next from public.tickets where event_id = v_b.event_id;
  insert into public.tickets (booking_id, booking_item_id, user_id, event_id, issue_sequence, entry_number)
  select v_b.id, v_i.id, v_b.user_id, v_b.event_id, g, v_next + g - 1 from generate_series(1, v_i.quantity) g;
  select title into v_title from public.events where id = v_b.event_id;
  perform public._notify(v_b.user_id, v_b.event_id, 'BOOKING_CONFIRMED',
    v_title || case when v_b.total_amount_krw = 0 then ' 신청이 확정돼' else ' 입금이 확인돼' end || ' 티켓 ' || v_i.quantity || '장이 발급됐어요.',
    'booking-confirmed-' || p_booking_id);
end;
$$;

-- 주최 동아리의 '입금 확인'. 두 번 눌러도 티켓이 중복 발급되지 않는다.
create or replace function public.confirm_deposit(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_tt uuid;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or not public.is_event_staff(v_b.event_id) then raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002'; end if;
  select ticket_type_id into v_tt from public.booking_items where booking_id = p_booking_id;
  perform 1 from public.ticket_types where id = v_tt for update;  -- 잠금 순서: 티켓 종류 → 예매
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.status = 'CONFIRMED' then return; end if;
  if v_b.status <> 'PENDING_PAYMENT' then raise exception '취소되거나 만료된 예매입니다.' using errcode = 'P0001'; end if;
  perform public._confirm_booking(p_booking_id, auth.uid());
  perform public._audit(v_b.event_id, 'CONFIRM_DEPOSIT', 'booking', p_booking_id);
end;
$$;

-- 입금 전 예매만 취소(본인 또는 주최 동아리). 확정 후 환불은 정책 결정 뒤에.
create or replace function public.cancel_booking(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_i public.booking_items;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or not (v_b.user_id = auth.uid() or public.is_event_staff(v_b.event_id)) then raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002'; end if;
  select * into v_i from public.booking_items where booking_id = p_booking_id;
  perform 1 from public.ticket_types where id = v_i.ticket_type_id for update;
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.status <> 'PENDING_PAYMENT' then raise exception '입금 확인 전 예매만 취소할 수 있습니다.' using errcode = 'P0001'; end if;
  update public.bookings set status = 'CANCELLED', cancelled_at = now(), updated_at = now() where id = p_booking_id;
  update public.payments set status = 'FAILED', failure_code = 'CANCELLED_BEFORE_DEPOSIT', updated_at = now() where booking_id = p_booking_id and status = 'PENDING';
  update public.ticket_types set reserved_quantity = reserved_quantity - v_i.quantity, updated_at = now() where id = v_i.ticket_type_id;
end;
$$;

-- ───────────────────────── RPC: QR · 입장 ─────────────────────────
-- 티켓 QR 발급: 이전 QR은 폐기하고 새 토큰을 한 번만 돌려준다(DB에는 해시만 저장). [미정] 유효시간 24시간
create or replace function public.issue_ticket_qr(p_ticket_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_t public.tickets; v_token text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  select * into v_t from public.tickets where id = p_ticket_id for update;
  if not found or v_t.user_id <> auth.uid() then raise exception '티켓을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  if v_t.status <> 'ISSUED' then raise exception '사용할 수 없는 티켓입니다.' using errcode = 'P0001'; end if;
  update public.qr_credentials set revoked_at = now() where ticket_id = p_ticket_id and revoked_at is null;
  insert into public.qr_credentials (ticket_id, token_hash, expires_at)
  values (p_ticket_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '24 hours');
  return v_token;
end;
$$;

create or replace function public._ticket_by_token(p_event_id uuid, p_token text) returns public.tickets
language sql stable security definer set search_path = '' as $$
  select t.* from public.qr_credentials q join public.tickets t on t.id = q.ticket_id
  where q.token_hash = encode(extensions.digest(btrim(p_token), 'sha256'), 'hex')
    and q.revoked_at is null and q.expires_at > now() and t.event_id = p_event_id;
$$;

create or replace function public._ticket_info(v_t public.tickets, p_result text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('result', p_result, 'ticket_id', v_t.id, 'entry_number', v_t.entry_number,
    'checked_in_at', v_t.checked_in_at, 'owner_name', p.display_name, 'ticket_type', i.ticket_type_name, 'depositor_name', pay.depositor_name)
  from public.profiles p, public.booking_items i, public.payments pay
  where p.id = v_t.user_id and i.id = v_t.booking_item_id and pay.booking_id = v_t.booking_id and pay.status = 'SUCCEEDED';
$$;

-- QR 검증(읽기만): valid / already_checked_in / invalid + 관객 정보
create or replace function public.verify_ticket(p_event_id uuid, p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_t public.tickets;
begin
  if not public.is_event_staff(p_event_id) then raise exception '이 공연의 운영진만 입장 처리할 수 있습니다.' using errcode = '42501'; end if;
  v_t := public._ticket_by_token(p_event_id, p_token);
  if v_t.id is null or v_t.status = 'CANCELLED' then return jsonb_build_object('result', 'invalid'); end if;
  return public._ticket_info(v_t, case when v_t.status = 'CHECKED_IN' then 'already_checked_in' else 'valid' end);
end;
$$;

-- 입장 처리: 동시에 두 번 스캔해도 처음 한 번만 바뀐다
create or replace function public.check_in(p_event_id uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_t public.tickets;
begin
  if not public.is_event_staff(p_event_id) then raise exception '이 공연의 운영진만 입장 처리할 수 있습니다.' using errcode = '42501'; end if;
  v_t := public._ticket_by_token(p_event_id, p_token);
  if v_t.id is null or v_t.status = 'CANCELLED' then return jsonb_build_object('result', 'invalid'); end if;
  update public.tickets set status = 'CHECKED_IN', checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
  where id = v_t.id and status = 'ISSUED' returning * into v_t;
  if not found then
    select * into v_t from public.tickets where id = (public._ticket_by_token(p_event_id, p_token)).id;
    return public._ticket_info(v_t, 'already_checked_in');
  end if;
  perform public._audit(p_event_id, 'CHECK_IN', 'ticket', v_t.id);
  return public._ticket_info(v_t, 'valid');
end;
$$;

-- ───────────────────────── RPC: 교류 신청 ─────────────────────────
create or replace function public.request_exchange(p_from_club_id uuid, p_to_club_id uuid, p_kind text, p_message text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_from text; m record;
begin
  if not public.is_club_manager(p_from_club_id) then raise exception '동아리 운영진만 교류를 신청할 수 있습니다.' using errcode = '42501'; end if;
  select name into v_from from public.clubs where id = p_from_club_id and status = 'ACTIVE';
  if v_from is null then raise exception '승인된 동아리만 교류를 신청할 수 있습니다.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.clubs where id = p_to_club_id and status = 'ACTIVE' and exchange_open) then
    raise exception '지금은 교류를 받지 않는 동아리입니다.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.exchange_requests where from_club_id = p_from_club_id and to_club_id = p_to_club_id and status = 'PENDING') then
    raise exception '이미 보낸 신청이 처리 대기 중입니다.' using errcode = '23505';
  end if;
  insert into public.exchange_requests (from_club_id, to_club_id, kind, message, created_by)
  values (p_from_club_id, p_to_club_id, p_kind, left(coalesce(p_message, ''), 300), auth.uid()) returning id into v_id;
  for m in select user_id from public.club_memberships where club_id = p_to_club_id and status = 'ACTIVE' loop
    perform public._notify(m.user_id, null, 'EXCHANGE_REQUESTED', v_from || '에서 교류를 신청했어요.', 'ex-req-' || v_id || '-' || m.user_id);
  end loop;
  return v_id;
end;
$$;

create or replace function public.respond_exchange(p_request_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_r public.exchange_requests; v_to text; m record;
begin
  select * into v_r from public.exchange_requests where id = p_request_id for update;
  if not found or not public.is_club_manager(v_r.to_club_id) then raise exception '신청을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  if v_r.status <> 'PENDING' then raise exception '이미 처리한 신청입니다.' using errcode = 'P0001'; end if;
  update public.exchange_requests set status = case when p_accept then 'ACCEPTED' else 'REJECTED' end,
    responded_by = auth.uid(), responded_at = now() where id = p_request_id;
  select name into v_to from public.clubs where id = v_r.to_club_id;
  for m in select user_id from public.club_memberships where club_id = v_r.from_club_id and status = 'ACTIVE' loop
    perform public._notify(m.user_id, null, 'EXCHANGE_RESPONDED', case when p_accept
      then v_to || '이(가) 교류를 수락했어요. 오픈채팅 링크가 열렸어요.' else v_to || '이(가) 교류를 거절했어요.' end,
      'ex-res-' || p_request_id || '-' || m.user_id);
  end loop;
end;
$$;

create or replace function public.cancel_exchange(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_r public.exchange_requests;
begin
  select * into v_r from public.exchange_requests where id = p_request_id for update;
  if not found or not public.is_club_manager(v_r.from_club_id) then raise exception '신청을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  if v_r.status <> 'PENDING' then raise exception '이미 처리한 신청입니다.' using errcode = 'P0001'; end if;
  update public.exchange_requests set status = 'CANCELLED' where id = p_request_id;
end;
$$;

-- ───────────────────────── RPC: 알림 ─────────────────────────
create or replace function public.mark_notifications_read(p_id uuid default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_id is null or id = p_id);
$$;

-- ───────────────────────── 실행 권한 ─────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.is_club_manager(uuid), public.is_event_staff(uuid),
  public.has_exchange_with(uuid), public.can_view_profile(uuid) to anon, authenticated;
grant execute on function
  public.update_profile(text), public.create_club(jsonb), public.update_club(uuid, jsonb), public.set_club_status(uuid, text),
  public.create_event(uuid, jsonb), public.update_event(uuid, jsonb), public.set_event_status(uuid, text), public.delete_event(uuid),
  public.create_booking(uuid, integer, text, text), public.confirm_deposit(uuid), public.cancel_booking(uuid),
  public.issue_ticket_qr(uuid), public.verify_ticket(uuid, text), public.check_in(uuid, text),
  public.request_exchange(uuid, uuid, text, text), public.respond_exchange(uuid, boolean), public.cancel_exchange(uuid),
  public.mark_notifications_read(uuid)
to authenticated;
