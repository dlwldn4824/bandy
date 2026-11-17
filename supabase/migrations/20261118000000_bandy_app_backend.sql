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
-- [편의] 예매자가 '입금했어요'를 누른 시각. 운영진 입금 확인 목록에서 먼저 보여 준다
alter table public.payments add column if not exists depositor_notified_at timestamptz;
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

-- ───────────────────────── 인덱스 ─────────────────────────
-- RLS 판정 함수(is_club_manager · is_event_staff · can_view_profile)가 행마다 도는 조건과 화면의 주 조회 조건
create index if not exists club_memberships_club_idx on public.club_memberships (club_id, user_id) where status = 'ACTIVE';
create index if not exists bookings_user_idx on public.bookings (user_id);
create index if not exists booking_items_booking_idx on public.booking_items (booking_id);
create index if not exists booking_items_type_idx on public.booking_items (ticket_type_id);
create index if not exists payments_booking_idx on public.payments (booking_id);
create index if not exists tickets_user_idx on public.tickets (user_id);
create index if not exists tickets_event_idx on public.tickets (event_id, status);
create index if not exists tickets_booking_idx on public.tickets (booking_id);
create index if not exists ticket_types_event_idx on public.ticket_types (event_id);
create index if not exists event_staff_event_idx on public.event_staff (event_id, user_id);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists exchange_from_idx on public.exchange_requests (from_club_id, status);
create index if not exists exchange_to_idx on public.exchange_requests (to_club_id, status);
create index if not exists qr_ticket_idx on public.qr_credentials (ticket_id);

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

-- 내가 예매한 공연인가: 공연이 비공개·취소되거나 동아리가 정지돼도 예매자는 그 공연 정보를 계속 본다
create or replace function public.has_booking_for(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bookings b where b.event_id = p_event_id and b.user_id = auth.uid());
$$;

-- 예매자 명단·부원 명단에 표시명을 보여 주기 위해: 내 공연을 예매한 사람, 내 동아리에 가입했거나 신청한 사람의 프로필
create or replace function public.can_view_profile(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_profile_id = auth.uid() or public.is_admin()
      or exists (select 1 from public.bookings b where b.user_id = p_profile_id and public.is_event_staff(b.event_id))
      or exists (select 1 from public.club_memberships m where m.user_id = p_profile_id and m.status in ('ACTIVE', 'PENDING')
                 and public.is_club_manager(m.club_id));
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
         or public.is_club_manager(club_id) or public.has_booking_for(id));
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

-- 정지·탈퇴 회원은 새로 만드는 일(예매·동아리 등록·공연 등록·가입·교류 신청)과 운영진 업무(입금 확인·입장 처리 등)를 못 한다.
-- 이미 산 티켓의 QR 보기, 본인 입금 전 예매 취소, 이름 수정, 알림 읽기는 된다.
create or replace function public._require_active_profile() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_login();
  if exists (select 1 from public.profiles where id = auth.uid() and status <> 'ACTIVE') then
    raise exception '이용이 제한된 계정입니다.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- 입력값 변환: 형식이 틀리면 영어 DB 오류 대신 한국어 안내
create or replace function public._to_bigint(p_text text, p_label text) returns bigint
language plpgsql immutable set search_path = '' as $$
begin
  return nullif(btrim(coalesce(p_text, '')), '')::bigint;
exception when others then
  raise exception '%은(는) 숫자로 입력하세요.', p_label using errcode = '22023';
end;
$$;

create or replace function public._to_ts(p_text text) returns timestamptz
language plpgsql stable set search_path = '' as $$
begin
  return nullif(btrim(coalesce(p_text, '')), '')::timestamptz;
exception when others then
  raise exception '일시 형식이 올바르지 않습니다.' using errcode = '22023';
end;
$$;

create or replace function public._to_coord(p_text text, p_min double precision, p_max double precision) returns double precision
language plpgsql immutable set search_path = '' as $$
declare v double precision;
begin
  begin
    v := nullif(btrim(coalesce(p_text, '')), '')::double precision;
  exception when others then
    raise exception '좌표 형식이 올바르지 않습니다.' using errcode = '22023';
  end;
  if v is not null and (v < p_min or v > p_max) then raise exception '좌표 범위가 올바르지 않습니다.' using errcode = '22023'; end if;
  return v;
end;
$$;

-- 링크는 http(s) 주소만 저장한다(javascript: 등 차단). 빈 값은 허용
create or replace function public._check_url(p_url text, p_label text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := btrim(coalesce(p_url, ''));
begin
  if v <> '' and (v !~* '^https?://[^\s/]+' or length(v) > 300) then
    raise exception '%은(는) http:// 또는 https://로 시작하는 주소만 쓸 수 있습니다.', p_label using errcode = '22023';
  end if;
  return v;
end;
$$;

-- 쓰기 권한: 운영진이면서 동아리가 승인(ACTIVE) 상태여야 한다. 정지된 동아리는 공연 등록·수정·공개·입금 확인이 멈춘다
-- (이미 발급된 티켓의 입장 처리와 입금 전 예매 취소는 계속 된다)
create or replace function public._require_active_manager(p_club_id uuid, p_not_found text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_active_profile();
  if not public.is_club_manager(p_club_id) then raise exception '%', p_not_found using errcode = 'P0002'; end if;
  if not exists (select 1 from public.clubs where id = p_club_id and status = 'ACTIVE') then
    raise exception '승인된 동아리만 할 수 있습니다. (정지 또는 승인 전)' using errcode = 'P0001';
  end if;
end;
$$;

-- 입금 기한이 지난 예매를 정리하고 잡아 둔 수량을 돌려준다. 예매·입금 확인·취소 때마다 그 티켓 종류를 먼저 정리한다.
-- 호출하는 쪽이 티켓 종류 행을 먼저 잠근다(잠금 순서: 티켓 종류 → 예매 → 공연)
create or replace function public._expire_bookings(p_ticket_type uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select b.id, b.user_id, b.event_id, i.quantity, e.title from public.bookings b
    join public.booking_items i on i.booking_id = b.id join public.events e on e.id = b.event_id
    where i.ticket_type_id = p_ticket_type and b.status = 'PENDING_PAYMENT' and b.expires_at <= now()
      -- 기한 안에 '입금했어요'를 누른 예매는 돈이 오갔을 수 있으니 자동 만료하지 않고 운영진의 확인·취소를 기다린다
      and not exists (select 1 from public.payments p where p.booking_id = b.id and p.depositor_notified_at is not null)
    for update of b
  loop
    update public.bookings set status = 'EXPIRED', updated_at = now() where id = r.id;
    update public.payments set status = 'FAILED', failure_code = 'EXPIRED', updated_at = now() where booking_id = r.id and status = 'PENDING';
    update public.ticket_types set reserved_quantity = reserved_quantity - r.quantity, updated_at = now() where id = p_ticket_type;
    perform public._notify(r.user_id, r.event_id, 'BOOKING_EXPIRED',
      r.title || ' 예매가 입금 기한이 지나 취소됐어요.', 'booking-expired-' || r.id);
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
declare v_uid uuid := public._require_active_profile(); v_id uuid; v_name text := btrim(coalesce(p_input ->> 'name', ''));
begin
  if v_name = '' then raise exception '동아리 이름을 입력하세요.' using errcode = '22023'; end if;
  if length(v_name) > 40 then raise exception '동아리 이름은 40자까지입니다.' using errcode = '22023'; end if;
  if exists (select 1 from public.clubs where name = v_name) then raise exception '이미 등록된 동아리 이름입니다.' using errcode = '23505'; end if;
  -- [임시] 승인 대기 중인 등록은 한 사람당 1건(운영자가 수동 승인하므로 반복 등록 방지)
  if exists (select 1 from public.clubs where created_by = v_uid and status = 'PENDING') then
    raise exception '승인 대기 중인 동아리가 있어요. 승인 후에 추가로 등록할 수 있어요.' using errcode = 'P0001';
  end if;
  insert into public.clubs (name, introduction, city, profile_path, sns_url, school, genre, region, exchange_open, created_by)
  values (v_name, p_input ->> 'introduction', '서울', p_input ->> 'profile_path', nullif(public._check_url(p_input ->> 'sns_url', 'SNS 링크'), ''),
          btrim(coalesce(p_input ->> 'school', '')), btrim(coalesce(p_input ->> 'genre', '')), btrim(coalesce(p_input ->> 'region', '')),
          coalesce((p_input ->> 'exchange_open')::boolean, false), v_uid)
  returning id into v_id;
  insert into public.club_memberships (user_id, club_id, role) values (v_uid, v_id, 'OWNER');
  insert into public.club_private (club_id, open_chat_url) values (v_id, public._check_url(p_input ->> 'open_chat_url', '오픈채팅 링크'));
  return v_id;
end;
$$;

create or replace function public.update_club(p_club_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  perform public._require_active_profile();
  if not public.is_club_manager(p_club_id) then raise exception '동아리 운영진만 수정할 수 있습니다.' using errcode = '42501'; end if;
  if exists (select 1 from public.clubs where id = p_club_id and status = 'SUSPENDED') then
    raise exception '운영이 정지된 동아리는 정보를 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  if p_patch ? 'name' then
    v_name := btrim(p_patch ->> 'name');
    if v_name = '' then raise exception '동아리 이름을 입력하세요.' using errcode = '22023'; end if;
    if length(v_name) > 40 then raise exception '동아리 이름은 40자까지입니다.' using errcode = '22023'; end if;
    if exists (select 1 from public.clubs where name = v_name and id <> p_club_id) then raise exception '이미 등록된 동아리 이름입니다.' using errcode = '23505'; end if;
  end if;
  update public.clubs set
    name = coalesce(v_name, name),
    introduction = case when p_patch ? 'introduction' then p_patch ->> 'introduction' else introduction end,
    profile_path = case when p_patch ? 'profile_path' then p_patch ->> 'profile_path' else profile_path end,
    sns_url = case when p_patch ? 'sns_url' then nullif(public._check_url(p_patch ->> 'sns_url', 'SNS 링크'), '') else sns_url end,
    school = case when p_patch ? 'school' then btrim(p_patch ->> 'school') else school end,
    genre = case when p_patch ? 'genre' then btrim(p_patch ->> 'genre') else genre end,
    region = case when p_patch ? 'region' then btrim(p_patch ->> 'region') else region end,
    exchange_open = case when p_patch ? 'exchange_open' then (p_patch ->> 'exchange_open')::boolean else exchange_open end,
    updated_at = now()
  where id = p_club_id;
  if p_patch ? 'open_chat_url' then
    insert into public.club_private (club_id, open_chat_url) values (p_club_id, public._check_url(p_patch ->> 'open_chat_url', '오픈채팅 링크'))
    on conflict (club_id) do update set open_chat_url = excluded.open_chat_url;
  end if;
end;
$$;

create or replace function public.set_club_status(p_club_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_club public.clubs; v_owner uuid;
begin
  if not public.is_admin() then raise exception '운영자만 승인할 수 있습니다.' using errcode = '42501'; end if;
  if p_status not in ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED') then raise exception '알 수 없는 동아리 상태입니다.' using errcode = '22023'; end if;
  update public.clubs set status = p_status, updated_at = now() where id = p_club_id returning * into v_club;
  if not found then raise exception '동아리를 찾지 못했습니다.' using errcode = 'P0002'; end if;
  select user_id into v_owner from public.club_memberships where club_id = p_club_id and role = 'OWNER' limit 1;
  if v_owner is not null then
    perform public._notify(v_owner, null, 'CLUB_STATUS', case p_status
      when 'ACTIVE' then v_club.name || ' 동아리가 승인됐어요. 이제 공연을 올리고 교류를 신청할 수 있어요.'
      when 'SUSPENDED' then v_club.name || ' 동아리 운영이 정지됐어요. 공연 공개와 입금 확인이 멈춰요.'
      when 'REJECTED' then v_club.name || ' 동아리 승인이 거절됐어요.'
      else v_club.name || ' 동아리가 승인 대기 상태로 바뀌었어요.' end,
      'club-status-' || p_club_id || '-' || p_status || '-' || gen_random_uuid());
  end if;
end;
$$;

-- ───────────────────────── RPC: 공연 ─────────────────────────
-- 공개 조건: 장소, 앞으로의 일시, 유료면 입금 계좌. 공개 등록 · 공개 전환 · 공개 중 수정에 똑같이 적용한다
create or replace function public._check_publishable(p_venue text, p_starts timestamptz, p_price bigint, p_account text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if btrim(coalesce(p_venue, '')) = '' then raise exception '공개하려면 장소가 필요합니다.' using errcode = '22023'; end if;
  if p_starts <= now() then raise exception '이미 지난 일시로는 공개할 수 없습니다.' using errcode = '22023'; end if;
  if p_price > 0 and btrim(coalesce(p_account, '')) = '' then raise exception '유료 공연은 입금 계좌가 필요합니다.' using errcode = '22023'; end if;
end;
$$;

create or replace function public.create_event(p_club_id uuid, p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_active_profile();
  v_id uuid;
  v_publish boolean := coalesce((p_input ->> 'publish')::boolean, false);
  v_price bigint := coalesce(public._to_bigint(p_input ->> 'price_krw', '가격'), 0);
  v_capacity bigint := coalesce(public._to_bigint(p_input ->> 'capacity', '정원'), 0);
  v_starts timestamptz := public._to_ts(p_input ->> 'starts_at');
  v_club public.clubs;
begin
  perform public._require_active_manager(p_club_id, '동아리 운영진만 공연을 올릴 수 있습니다.');
  select * into v_club from public.clubs where id = p_club_id;
  if btrim(coalesce(p_input ->> 'title', '')) = '' then raise exception '공연명을 입력하세요.' using errcode = '22023'; end if;
  if v_starts is null then raise exception '일시를 입력하세요.' using errcode = '22023'; end if;
  if v_capacity <= 0 or v_capacity > 100000 then raise exception '정원은 1~100000 사이여야 합니다.' using errcode = '22023'; end if;
  if v_price < 0 then raise exception '가격은 0원 이상이어야 합니다.' using errcode = '22023'; end if;
  if v_publish then perform public._check_publishable(p_input ->> 'venue_name', v_starts, v_price, p_input ->> 'account_number'); end if;
  -- 좌표: 실제로는 주소 → 좌표 변환(카카오 Local) 결과를 받는다. 없으면 null
  insert into public.events (club_id, created_by, title, description, category, starts_at, venue_name, address, latitude, longitude,
    poster_path, status, published_at, bank_name, account_number, account_holder)
  values (p_club_id, v_uid, btrim(p_input ->> 'title'), p_input ->> 'description', p_input ->> 'category', v_starts,
    btrim(coalesce(p_input ->> 'venue_name', '')), btrim(coalesce(p_input ->> 'address', '')),
    public._to_coord(p_input ->> 'latitude', -90, 90), public._to_coord(p_input ->> 'longitude', -180, 180),
    p_input ->> 'poster_path', case when v_publish then 'PUBLISHED' else 'DRAFT' end, case when v_publish then now() end,
    btrim(coalesce(p_input ->> 'bank_name', '')), btrim(coalesce(p_input ->> 'account_number', '')), v_club.name)
  returning id into v_id;
  insert into public.ticket_types (event_id, name, price_krw, capacity, sales_ends_at)
  values (v_id, case when v_price > 0 then '일반' else '참가 신청' end, v_price, v_capacity, v_starts);
  perform public._audit(v_id, 'CREATE', 'event', v_id);
  return v_id;
end;
$$;

-- 공연 수정. 보내지 않은 칸은 그대로 둔다. 잠금 순서: 티켓 종류 → 공연(입금 확인과 같은 순서라 교착이 없다)
create or replace function public.update_event(p_event_id uuid, p_input jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events; v_tt public.ticket_types;
  v_price bigint; v_capacity bigint; v_starts timestamptz;
  v_venue text; v_account text;
begin
  perform public._require_login();
  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception '공연을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  perform public._require_active_manager(v_event.club_id, '공연을 찾지 못했습니다.');
  select * into v_tt from public.ticket_types where event_id = p_event_id order by created_at limit 1 for update;
  select * into v_event from public.events where id = p_event_id for update;
  if v_event.status = 'CANCELLED' then raise exception '취소된 공연은 수정할 수 없습니다.' using errcode = 'P0001'; end if;
  v_price := coalesce(public._to_bigint(p_input ->> 'price_krw', '가격'), v_tt.price_krw);
  v_capacity := coalesce(public._to_bigint(p_input ->> 'capacity', '정원'), v_tt.capacity);
  v_starts := coalesce(public._to_ts(p_input ->> 'starts_at'), v_event.starts_at);
  v_venue := case when p_input ? 'venue_name' then btrim(coalesce(p_input ->> 'venue_name', '')) else v_event.venue_name end;
  v_account := case when p_input ? 'account_number' then btrim(coalesce(p_input ->> 'account_number', '')) else v_event.account_number end;
  if p_input ? 'title' and btrim(coalesce(p_input ->> 'title', '')) = '' then raise exception '공연명을 입력하세요.' using errcode = '22023'; end if;
  if v_price < 0 then raise exception '가격은 0원 이상이어야 합니다.' using errcode = '22023'; end if;
  if v_capacity <= 0 or v_capacity > 100000 then raise exception '정원은 1~100000 사이여야 합니다.' using errcode = '22023'; end if;
  if v_price <> v_tt.price_krw and exists (select 1 from public.bookings where event_id = p_event_id and status <> 'CANCELLED') then
    raise exception '예매가 있는 공연은 가격을 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_capacity < v_tt.reserved_quantity + v_tt.sold_quantity then raise exception '이미 예매된 수량보다 정원을 줄일 수 없습니다.' using errcode = 'P0001'; end if;
  if v_event.status = 'PUBLISHED' then
    if v_starts is distinct from v_event.starts_at or v_venue is distinct from v_event.venue_name
       or v_price <> v_tt.price_krw or v_account is distinct from v_event.account_number then
      perform public._check_publishable(v_venue, v_starts, v_price, v_account);
    end if;
  end if;
  update public.events set
    title = case when p_input ? 'title' then btrim(p_input ->> 'title') else title end,
    description = case when p_input ? 'description' then p_input ->> 'description' else description end,
    category = case when p_input ? 'category' then p_input ->> 'category' else category end,
    starts_at = v_starts, venue_name = v_venue,
    address = case when p_input ? 'address' then btrim(coalesce(p_input ->> 'address', '')) else address end,
    bank_name = case when p_input ? 'bank_name' then btrim(coalesce(p_input ->> 'bank_name', '')) else bank_name end,
    account_number = v_account,
    poster_path = case when p_input ? 'poster_path' then p_input ->> 'poster_path' else poster_path end,
    updated_at = now()
  where id = p_event_id;
  update public.ticket_types set price_krw = v_price, capacity = v_capacity, sales_ends_at = v_starts, updated_at = now() where id = v_tt.id;
  if v_starts is distinct from v_event.starts_at or v_venue is distinct from v_event.venue_name then
    -- 공연을 앞당기면 입금 기한도 새 시작 시각을 넘지 않게(예매 시각보다는 뒤)
    update public.bookings set expires_at = greatest(least(expires_at, v_starts), created_at + interval '1 minute'), updated_at = now()
    where event_id = p_event_id and status = 'PENDING_PAYMENT' and expires_at > v_starts;
    -- 예매자에게 일정·장소 변경 알림(같은 변경은 한 번만)
    perform public._notify(b.user_id, p_event_id, 'EVENT_CHANGED',
      '[' || btrim(coalesce(p_input ->> 'title', v_event.title)) || '] 공연 ' ||
      case when v_starts is distinct from v_event.starts_at then '일시가 ' || to_char(v_starts at time zone 'Asia/Seoul', 'MM.DD HH24:MI') || '(으)로' else '' end ||
      case when v_starts is distinct from v_event.starts_at and v_venue is distinct from v_event.venue_name then ', ' else '' end ||
      case when v_venue is distinct from v_event.venue_name then '장소가 ' || v_venue || '(으)로' else '' end || ' 바뀌었어요.',
      'event-changed-' || p_event_id || '-' || b.user_id || '-' || md5(coalesce(v_starts::text, '') || v_venue))
    from (select distinct user_id from public.bookings where event_id = p_event_id and status in ('PENDING_PAYMENT', 'CONFIRMED')) b;
  end if;
  perform public._audit(p_event_id, 'UPDATE', 'event', p_event_id);
end;
$$;

-- 공연 상태 변경. 취소하면 입금 전 예매는 정리하고 예매자에게 알린다(입금 완료분 환불은 정책 결정 뒤 동아리가 직접)
create or replace function public.set_event_status(p_event_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event public.events; v_price bigint; r record;
begin
  perform public._require_active_profile();
  if p_status not in ('DRAFT', 'PUBLISHED', 'ENDED', 'CANCELLED') then raise exception '알 수 없는 공연 상태입니다.' using errcode = '22023'; end if;
  select * into v_event from public.events where id = p_event_id;
  if not found or not public.is_club_manager(v_event.club_id) then raise exception '공연을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  -- 공개는 승인된 동아리만. 비공개·종료·취소(판매를 멈추는 쪽)는 정지된 동아리도 할 수 있다
  if p_status = 'PUBLISHED' then perform public._require_active_manager(v_event.club_id, '공연을 찾지 못했습니다.'); end if;
  -- 잠금 순서: 티켓 종류(전부, id 순) → 공연 → 예매
  perform 1 from public.ticket_types where event_id = p_event_id order by id for update;
  select * into v_event from public.events where id = p_event_id for update;
  if v_event.status = p_status then return; end if;
  if v_event.status = 'CANCELLED' then raise exception '취소된 공연은 다시 열 수 없습니다. 새로 등록해 주세요.' using errcode = 'P0001'; end if;
  if p_status = 'PUBLISHED' then
    select max(price_krw) into v_price from public.ticket_types where event_id = p_event_id;
    perform public._check_publishable(v_event.venue_name, v_event.starts_at, coalesce(v_price, 0), v_event.account_number);
  end if;
  update public.events set status = p_status, published_at = case when p_status = 'PUBLISHED' then coalesce(published_at, now()) else published_at end,
    updated_at = now() where id = p_event_id;
  if p_status = 'CANCELLED' then
    for r in select b.id, b.user_id, b.status, i.quantity, i.ticket_type_id from public.bookings b join public.booking_items i on i.booking_id = b.id
             where b.event_id = p_event_id and b.status in ('PENDING_PAYMENT', 'CONFIRMED') order by b.id for update of b loop
      if r.status = 'PENDING_PAYMENT' then
        update public.bookings set status = 'CANCELLED', cancelled_at = now(), updated_at = now() where id = r.id;
        update public.payments set status = 'FAILED', failure_code = 'EVENT_CANCELLED', updated_at = now() where booking_id = r.id and status = 'PENDING';
        update public.ticket_types set reserved_quantity = reserved_quantity - r.quantity, updated_at = now() where id = r.ticket_type_id;
      end if;
      perform public._notify(r.user_id, p_event_id, 'EVENT_CANCELLED', '[' || v_event.title || '] ' || case when r.status = 'CONFIRMED'
        then '공연이 취소됐어요. 환불은 주최 동아리에 문의해 주세요.' else '공연이 취소돼 예매도 취소됐어요.' end,
        'event-cancelled-' || r.id);
    end loop;
  end if;
  perform public._audit(p_event_id, 'SET_STATUS_' || p_status, 'event', p_event_id);
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
  v_uid uuid := public._require_active_profile();
  v_key text := coalesce(nullif(p_idempotency_key, ''), gen_random_uuid()::text);
  v_hash text := encode(extensions.digest(p_ticket_type_id::text || ':' || p_quantity || ':' || coalesce(p_depositor_name, ''), 'sha256'), 'hex');
  v_tt public.ticket_types; v_event public.events; v_existing public.bookings; v_booking uuid; v_item uuid;
begin
  -- 같은 요청 재전송이면 같은 예매를 돌려준다. 동시에 같은 키가 두 번 와도 차례로 처리되게 키 단위로 잠근다
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_key, 0));
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
  if now() < v_tt.sales_starts_at then raise exception '아직 예매가 열리지 않았습니다.' using errcode = 'P0001'; end if;
  if now() >= v_tt.sales_ends_at or now() >= v_event.starts_at then raise exception '예매가 마감된 공연입니다.' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_depositor_name, ''))) > 20 then raise exception '입금자명은 20자까지입니다.' using errcode = '22023'; end if;
  perform public._expire_bookings(v_tt.id);
  select * into v_tt from public.ticket_types where id = p_ticket_type_id;
  if v_tt.capacity - v_tt.reserved_quantity - v_tt.sold_quantity < p_quantity then raise exception '남은 자리가 부족합니다.' using errcode = 'P0001'; end if;
  if v_tt.price_krw > 0 and btrim(coalesce(p_depositor_name, '')) = '' then raise exception '입금자명을 입력하세요.' using errcode = '22023'; end if;

  insert into public.bookings (user_id, event_id, total_amount_krw, expires_at, idempotency_key, request_hash)
  values (v_uid, v_event.id, v_tt.price_krw * p_quantity, least(now() + interval '3 days', v_event.starts_at), v_key, v_hash) returning id into v_booking;  -- 입금 기한: 3일 또는 공연 시작 중 빠른 쪽
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
-- 결과: 'CONFIRMED' 또는 'EXPIRED'(기한이 지나 이번 호출에서 만료 처리됨 — 오류로 되돌리지 않고 만료를 저장한다)
drop function if exists public.confirm_deposit(uuid);
create or replace function public.confirm_deposit(p_booking_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_tt uuid;
begin
  perform public._require_login();
  select * into v_b from public.bookings where id = p_booking_id;
  if not found then raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002'; end if;
  -- 입금 확인은 주최 동아리 운영진(OWNER·MANAGER)만, 동아리가 승인 상태일 때만
  perform public._require_active_manager((select club_id from public.events where id = v_b.event_id), '예매를 찾지 못했습니다.');
  select ticket_type_id into v_tt from public.booking_items where booking_id = p_booking_id;
  perform 1 from public.ticket_types where id = v_tt for update;  -- 잠금 순서: 티켓 종류 → 예매
  perform public._expire_bookings(v_tt);  -- 기한이 지난 예매는 여기서 먼저 만료(언제 눌러도 같은 결과)
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.status = 'CONFIRMED' then return 'CONFIRMED'; end if;
  if v_b.status = 'EXPIRED' then return 'EXPIRED'; end if;
  if v_b.status <> 'PENDING_PAYMENT' then raise exception '취소된 예매입니다.' using errcode = 'P0001'; end if;
  perform public._confirm_booking(p_booking_id, auth.uid());
  perform public._audit(v_b.event_id, 'CONFIRM_DEPOSIT', 'booking', p_booking_id);
  return 'CONFIRMED';
end;
$$;

-- 입금 전 예매만 취소(본인 또는 주최 동아리). 확정 후 환불은 정책 결정 뒤에.
create or replace function public.cancel_booking(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_i public.booking_items; v_by_host boolean; v_title text;
begin
  perform public._require_login();
  select * into v_b from public.bookings where id = p_booking_id;
  if not found then raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002'; end if;
  v_by_host := v_b.user_id <> auth.uid();
  if v_by_host and not public.is_club_manager((select club_id from public.events where id = v_b.event_id)) then
    raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002';
  end if;
  select * into v_i from public.booking_items where booking_id = p_booking_id;
  perform 1 from public.ticket_types where id = v_i.ticket_type_id for update;
  perform public._expire_bookings(v_i.ticket_type_id);
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.status = 'EXPIRED' then return; end if;  -- 기한이 지나 방금 만료됨(자리 반환 완료). 취소와 결과가 같다
  if v_b.status <> 'PENDING_PAYMENT' then raise exception '입금 확인 전 예매만 취소할 수 있습니다.' using errcode = 'P0001'; end if;
  update public.bookings set status = 'CANCELLED', cancelled_at = now(), updated_at = now() where id = p_booking_id;
  update public.payments set status = 'FAILED', failure_code = 'CANCELLED_BEFORE_DEPOSIT', updated_at = now() where booking_id = p_booking_id and status = 'PENDING';
  update public.ticket_types set reserved_quantity = reserved_quantity - v_i.quantity, updated_at = now() where id = v_i.ticket_type_id;
  if not v_by_host and exists (select 1 from public.payments where booking_id = p_booking_id and depositor_notified_at is not null) then
    select title into v_title from public.events where id = v_b.event_id;
    perform public._notify(m.user_id, v_b.event_id, 'BOOKING_CANCELLED_AFTER_DEPOSIT',
      '[' || v_title || '] 입금했다고 알린 예매가 취소됐어요. 입금 내역을 확인하고 환불해 주세요.', 'cancel-after-deposit-' || p_booking_id || '-' || m.user_id)
    from public.club_memberships m join public.events e on e.club_id = m.club_id
    where e.id = v_b.event_id and m.status = 'ACTIVE' and m.role in ('OWNER', 'MANAGER');
  end if;
  if v_by_host then
    select title into v_title from public.events where id = v_b.event_id;
    perform public._notify(v_b.user_id, v_b.event_id, 'BOOKING_CANCELLED', v_title || ' 예매가 주최 동아리에 의해 취소됐어요.', 'booking-cancelled-' || p_booking_id);
  end if;
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
  if exists (select 1 from public.events where id = v_t.event_id and status = 'CANCELLED') then
    raise exception '취소된 공연의 티켓입니다.' using errcode = 'P0001';
  end if;
  update public.qr_credentials set revoked_at = now() where ticket_id = p_ticket_id and revoked_at is null;
  insert into public.qr_credentials (ticket_id, token_hash, expires_at)
  -- 유효시간: 24시간과 '공연 시작 + 6시간' 중 긴 쪽(최대 7일). 전날 받아 둔 QR도 공연장에서 쓸 수 있게
  values (p_ticket_id, encode(extensions.digest(v_token, 'sha256'), 'hex'),
          greatest(now() + interval '24 hours', least((select starts_at from public.events where id = v_t.event_id) + interval '6 hours', now() + interval '7 days')));
  return v_token;
end;
$$;

create or replace function public._ticket_by_token(p_event_id uuid, p_token text) returns public.tickets
language sql stable security definer set search_path = '' as $$
  select t.* from public.qr_credentials q join public.tickets t on t.id = q.ticket_id
  where q.token_hash = encode(extensions.digest(regexp_replace(coalesce(p_token, ''), '^\s+|\s+$', '', 'g'), 'sha256'), 'hex')
    and q.revoked_at is null and q.expires_at > now() and t.event_id = p_event_id
    and exists (select 1 from public.events e where e.id = t.event_id and e.status <> 'CANCELLED');
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
  perform public._require_active_profile();
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
  perform public._require_active_profile();
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

-- ───────────────────────── RPC: 동아리 부원 · 운영진 ─────────────────────────
-- 가입 신청 → 운영진이 수락 → 회장(OWNER)이 운영진(MANAGER)으로 지정. 운영진은 입금 확인·입장 처리·공연 관리를 함께 한다.
create or replace function public.request_club_join(p_club_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_active_profile(); v_m public.club_memberships; v_name text; m record;
begin
  select name into v_name from public.clubs where id = p_club_id and status = 'ACTIVE';
  if v_name is null then raise exception '승인된 동아리에만 가입 신청할 수 있습니다.' using errcode = 'P0001'; end if;
  select * into v_m from public.club_memberships where club_id = p_club_id and user_id = v_uid for update;
  if found and v_m.status = 'ACTIVE' then raise exception '이미 가입한 동아리입니다.' using errcode = 'P0001'; end if;
  if found and v_m.status = 'PENDING' then return v_m.id; end if;
  if found then
    update public.club_memberships set status = 'PENDING', role = 'MEMBER', updated_at = now() where id = v_m.id;
  else
    insert into public.club_memberships (user_id, club_id, role, status) values (v_uid, p_club_id, 'MEMBER', 'PENDING') returning * into v_m;
  end if;
  for m in select user_id from public.club_memberships where club_id = p_club_id and status = 'ACTIVE' and role in ('OWNER', 'MANAGER') loop
    perform public._notify(m.user_id, null, 'CLUB_JOIN_REQUESTED', v_name || '에 가입 신청이 왔어요.',
      'join-req-' || v_m.id || '-' || m.user_id || '-' || gen_random_uuid());
  end loop;
  return v_m.id;
end;
$$;

create or replace function public.respond_club_join(p_membership_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m public.club_memberships; v_name text;
begin
  perform public._require_login();
  select * into v_m from public.club_memberships where id = p_membership_id for update;
  if not found then raise exception '신청을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  perform public._require_active_manager(v_m.club_id, '신청을 찾지 못했습니다.');
  if v_m.status <> 'PENDING' then raise exception '이미 처리한 신청입니다.' using errcode = 'P0001'; end if;
  update public.club_memberships set status = case when p_accept then 'ACTIVE' else 'LEFT' end, updated_at = now() where id = p_membership_id;
  select name into v_name from public.clubs where id = v_m.club_id;
  perform public._notify(v_m.user_id, null, 'CLUB_JOIN_RESPONDED',
    v_name || case when p_accept then ' 가입이 수락됐어요.' else ' 가입 신청이 거절됐어요.' end,
    'join-res-' || p_membership_id || '-' || gen_random_uuid());
end;
$$;

-- 회장만 운영진(MANAGER)·부원(MEMBER) 역할을 바꾼다. 회장 자신의 역할은 바꾸지 않는다
create or replace function public.set_member_role(p_membership_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m public.club_memberships; v_name text;
begin
  perform public._require_login();
  if p_role not in ('MANAGER', 'MEMBER') then raise exception '운영진 또는 부원만 지정할 수 있습니다.' using errcode = '22023'; end if;
  select * into v_m from public.club_memberships where id = p_membership_id for update;
  if not found or not exists (select 1 from public.club_memberships o where o.club_id = v_m.club_id and o.user_id = auth.uid()
                              and o.role = 'OWNER' and o.status = 'ACTIVE') then
    raise exception '회장만 역할을 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  if v_m.role = 'OWNER' then raise exception '회장의 역할은 바꿀 수 없습니다.' using errcode = 'P0001'; end if;
  if v_m.status <> 'ACTIVE' then raise exception '가입한 부원만 역할을 바꿀 수 있습니다.' using errcode = 'P0001'; end if;
  if v_m.role = p_role then return; end if;
  update public.club_memberships set role = p_role, updated_at = now() where id = p_membership_id;
  select name into v_name from public.clubs where id = v_m.club_id;
  perform public._notify(v_m.user_id, null, 'CLUB_ROLE', v_name || case when p_role = 'MANAGER'
    then ' 운영진이 됐어요. 입금 확인과 입장 처리를 할 수 있어요.' else ' 운영진에서 부원으로 바뀌었어요.' end,
    'role-' || p_membership_id || '-' || p_role || '-' || gen_random_uuid());
end;
$$;

-- 내보내기(회장) 또는 탈퇴(본인). 회장은 탈퇴하지 않는다(동아리에 회장이 항상 1명)
create or replace function public.remove_member(p_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m public.club_memberships;
begin
  perform public._require_login();
  select * into v_m from public.club_memberships where id = p_membership_id for update;
  if not found or not (v_m.user_id = auth.uid() or exists (select 1 from public.club_memberships o where o.club_id = v_m.club_id
                       and o.user_id = auth.uid() and o.role = 'OWNER' and o.status = 'ACTIVE')) then
    raise exception '부원을 찾지 못했습니다.' using errcode = 'P0002';
  end if;
  if v_m.role = 'OWNER' then raise exception '회장은 탈퇴하거나 내보낼 수 없습니다.' using errcode = 'P0001'; end if;
  update public.club_memberships set status = 'LEFT', role = 'MEMBER', updated_at = now() where id = p_membership_id;
end;
$$;

-- 입금 기한이 지난 예매를 한꺼번에 정리(예: pg_cron으로 10분마다). 앱 호출 없이도 만료·알림이 제때 되게 한다
create or replace function public.expire_overdue_bookings() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select distinct i.ticket_type_id from public.bookings b join public.booking_items i on i.booking_id = b.id
           where b.status = 'PENDING_PAYMENT' and b.expires_at <= now()
             and not exists (select 1 from public.payments p where p.booking_id = b.id and p.depositor_notified_at is not null)
           order by 1 loop
    perform 1 from public.ticket_types where id = r.ticket_type_id for update;
    perform public._expire_bookings(r.ticket_type_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ───────────────────────── RPC: 교류 신청 ─────────────────────────
create or replace function public.request_exchange(p_from_club_id uuid, p_to_club_id uuid, p_kind text, p_message text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_from text; m record;
begin
  perform public._require_active_profile();
  if not public.is_club_manager(p_from_club_id) then raise exception '동아리 운영진만 교류를 신청할 수 있습니다.' using errcode = '42501'; end if;
  if p_from_club_id = p_to_club_id then raise exception '같은 동아리에는 신청할 수 없습니다.' using errcode = '22023'; end if;
  if p_kind is null or p_kind not in ('JOINT_SHOW', 'PRACTICE', 'WATCH_SWAP') then raise exception '교류 종류를 골라 주세요.' using errcode = '22023'; end if;
  select name into v_from from public.clubs where id = p_from_club_id and status = 'ACTIVE';
  if v_from is null then raise exception '승인된 동아리만 교류를 신청할 수 있습니다.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.clubs where id = p_to_club_id and status = 'ACTIVE' and exchange_open) then
    raise exception '지금은 교류를 받지 않는 동아리입니다.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.exchange_requests where from_club_id = p_from_club_id and to_club_id = p_to_club_id and status = 'PENDING') then
    raise exception '이미 보낸 신청이 처리 대기 중입니다.' using errcode = '23505';
  end if;
  if exists (select 1 from public.exchange_requests where from_club_id = p_to_club_id and to_club_id = p_from_club_id and status = 'PENDING') then
    raise exception '상대 동아리가 보낸 신청이 이미 있어요. 받은 신청에서 수락해 주세요.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.exchange_requests where status = 'ACCEPTED'
             and ((from_club_id = p_from_club_id and to_club_id = p_to_club_id) or (from_club_id = p_to_club_id and to_club_id = p_from_club_id))) then
    raise exception '이미 교류 중인 동아리입니다. 오픈채팅으로 연락해 주세요.' using errcode = 'P0001';
  end if;
  insert into public.exchange_requests (from_club_id, to_club_id, kind, message, created_by)
  values (p_from_club_id, p_to_club_id, p_kind, left(coalesce(p_message, ''), 300), auth.uid()) returning id into v_id;
  for m in select user_id from public.club_memberships where club_id = p_to_club_id and status = 'ACTIVE' and role in ('OWNER', 'MANAGER') loop
    perform public._notify(m.user_id, null, 'EXCHANGE_REQUESTED', v_from || '에서 교류를 신청했어요.', 'ex-req-' || v_id || '-' || m.user_id);
  end loop;
  return v_id;
end;
$$;

create or replace function public.respond_exchange(p_request_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_r public.exchange_requests; v_to text; m record;
begin
  perform public._require_login();
  select * into v_r from public.exchange_requests where id = p_request_id for update;
  if not found then raise exception '신청을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  perform public._require_active_manager(v_r.to_club_id, '신청을 찾지 못했습니다.');
  if v_r.status <> 'PENDING' then raise exception '이미 처리한 신청입니다.' using errcode = 'P0001'; end if;
  update public.exchange_requests set status = case when p_accept then 'ACCEPTED' else 'REJECTED' end,
    responded_by = auth.uid(), responded_at = now() where id = p_request_id;
  select name into v_to from public.clubs where id = v_r.to_club_id;
  for m in select user_id from public.club_memberships where club_id = v_r.from_club_id and status = 'ACTIVE' and role in ('OWNER', 'MANAGER') loop
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

-- 입금 기한 정리를 10분마다(pg_cron 확장이 켜져 있을 때만. Supabase: Database → Extensions → pg_cron)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('bandy-expire-bookings', '*/10 * * * *', 'select public.expire_overdue_bookings()');
  end if;
end $$;

-- ───────────────────────── RPC: 사용자 편의(모바일) ─────────────────────────
-- 예매자의 '입금했어요' 알림. 주최 운영진에게 알림이 가고, 입금 확인 목록 위로 올라간다. 10분에 한 번까지
create or replace function public.mark_deposit_sent(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_pay public.payments; v_title text; v_club uuid; m record;
begin
  perform public._require_login();
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or v_b.user_id <> auth.uid() then raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002'; end if;
  if v_b.status <> 'PENDING_PAYMENT' or v_b.expires_at <= now() then raise exception '입금 대기 중인 예매가 아닙니다.' using errcode = 'P0001'; end if;
  select * into v_pay from public.payments where booking_id = p_booking_id and status = 'PENDING' for update;
  if v_pay.depositor_notified_at is not null and v_pay.depositor_notified_at > now() - interval '10 minutes' then
    raise exception '이미 알렸어요. 잠시 후 다시 눌러 주세요.' using errcode = 'P0001';
  end if;
  update public.payments set depositor_notified_at = now(), updated_at = now() where id = v_pay.id;
  select title, club_id into v_title, v_club from public.events where id = v_b.event_id;
  for m in select user_id from public.club_memberships where club_id = v_club and status = 'ACTIVE' and role in ('OWNER', 'MANAGER') loop
    perform public._notify(m.user_id, v_b.event_id, 'DEPOSIT_SENT',
      '[' || v_title || '] ' || v_pay.depositor_name || '님이 입금했다고 알렸어요. 입금 확인해 주세요.', 'deposit-sent-' || v_pay.id || '-' || m.user_id || '-' || gen_random_uuid());
  end loop;
end;
$$;

-- 앱을 열 때 한 번 부르는 '홈 신호'. 화면은 prompt를 보고 바로 띄울 창을 정한다.
--   TICKET_NOW  : 3시간 안에 시작하거나 진행 중(시작 + 6시간까지)인 공연의 미사용 티켓 → 티켓 QR 바로 열기
--   STAFF_TODAY : 내가 운영하는 공연이 24시간 안에 있음 → 입장 관리 바로 가기
--   PAYMENT_DUE : 입금 기한이 24시간 안에 끝나는 입금 대기 예매 → 계좌 안내
-- 그 밖에 배지·배너용 숫자(안 읽은 알림, 입금 대기, 가입 신청, 받은 교류 신청)를 함께 준다. 비로그인이면 {"signed_in": false}
create or replace function public.my_home_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_ticket jsonb; v_staff jsonb; v_pay jsonb; v_prompt text;
begin
  if v_uid is null then return jsonb_build_object('signed_in', false); end if;
  select to_jsonb(x) into v_ticket from (
    select t.id as ticket_id, e.id as event_id, e.title, e.starts_at, e.venue_name, t.entry_number,
           (select count(*) from public.tickets t2 where t2.event_id = e.id and t2.user_id = v_uid and t2.status = 'ISSUED') as ticket_count
    from public.tickets t join public.events e on e.id = t.event_id
    where t.user_id = v_uid and t.status = 'ISSUED' and e.status in ('PUBLISHED', 'DRAFT', 'ENDED')
      and e.starts_at between now() - interval '6 hours' and now() + interval '24 hours'  -- 공연 중(시작 + 6시간)까지
    order by e.starts_at, t.entry_number limit 1) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at), '[]'::jsonb) into v_staff from (
    select e.id as event_id, e.title, e.starts_at,
           (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'CHECKED_IN') as checked_in,
           (select count(*) from public.tickets t where t.event_id = e.id and t.status <> 'CANCELLED') as issued,
           (select count(*) from public.bookings b join public.payments p on p.booking_id = b.id and p.status = 'PENDING'
             where b.event_id = e.id and b.status = 'PENDING_PAYMENT' and (b.expires_at > now() or p.depositor_notified_at is not null)) as pending_deposits
    from public.events e
    where e.status = 'PUBLISHED' and public.is_club_manager(e.club_id)
      and e.starts_at between now() - interval '6 hours' and now() + interval '24 hours') x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.expires_at), '[]'::jsonb) into v_pay from (
    select b.id as booking_id, e.id as event_id, e.title, b.total_amount_krw, b.expires_at,
           e.bank_name, e.account_number, e.account_holder, p.depositor_name, p.depositor_notified_at
    from public.bookings b join public.events e on e.id = b.event_id join public.payments p on p.booking_id = b.id and p.status = 'PENDING'
    where b.user_id = v_uid and b.status = 'PENDING_PAYMENT' and (b.expires_at > now() or p.depositor_notified_at is not null)) x;
  v_prompt := case
    when v_ticket is not null and (v_ticket ->> 'starts_at')::timestamptz <= now() + interval '3 hours' then 'TICKET_NOW'
    when jsonb_array_length(v_staff) > 0 then 'STAFF_TODAY'
    when exists (select 1 from jsonb_array_elements(v_pay) p where (p ->> 'expires_at')::timestamptz <= now() + interval '24 hours'
                 and p ->> 'depositor_notified_at' is null) then 'PAYMENT_DUE'
  end;
  return jsonb_build_object(
    'signed_in', true, 'now', now(), 'prompt', v_prompt,
    'next_ticket', v_ticket, 'staff_events', v_staff, 'pending_payments', v_pay,
    'unread_notifications', (select count(*) from public.notifications where user_id = v_uid and read_at is null),
    'join_requests', (select count(*) from public.club_memberships m where m.status = 'PENDING' and public.is_club_manager(m.club_id)),
    'exchange_requests', (select count(*) from public.exchange_requests r where r.status = 'PENDING' and public.is_club_manager(r.to_club_id)));
end;
$$;

-- ───────────────────────── 실행 권한 ─────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.is_club_manager(uuid), public.is_event_staff(uuid),
  public.has_exchange_with(uuid), public.can_view_profile(uuid), public.has_booking_for(uuid) to anon, authenticated;
grant execute on function
  public.update_profile(text), public.create_club(jsonb), public.update_club(uuid, jsonb), public.set_club_status(uuid, text),
  public.create_event(uuid, jsonb), public.update_event(uuid, jsonb), public.set_event_status(uuid, text), public.delete_event(uuid),
  public.create_booking(uuid, integer, text, text), public.confirm_deposit(uuid), public.cancel_booking(uuid),
  public.issue_ticket_qr(uuid), public.verify_ticket(uuid, text), public.check_in(uuid, text),
  public.request_exchange(uuid, uuid, text, text), public.respond_exchange(uuid, boolean), public.cancel_exchange(uuid),
  public.mark_notifications_read(uuid),
  public.request_club_join(uuid), public.respond_club_join(uuid, boolean), public.set_member_role(uuid, text), public.remove_member(uuid)
to authenticated;
grant execute on function public.expire_overdue_bookings() to service_role;
grant execute on function public.my_home_state() to anon, authenticated;
grant execute on function public.mark_deposit_sent(uuid) to authenticated;
