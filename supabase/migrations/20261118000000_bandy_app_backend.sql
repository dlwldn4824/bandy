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
-- [편의] 일시·장소가 바뀐 시각. 이보다 먼저 예매한 사람은 유지 또는 취소·환불 요청을 고를 수 있다
alter table public.events add column if not exists schedule_changed_at timestamptz;
-- 바뀌기 전 일시·장소(예매자가 무엇이 바뀌었는지 비교)
alter table public.events add column if not exists previous_starts_at timestamptz;
alter table public.events add column if not exists previous_venue_name text;
-- [11/18 팀 논의] 사전 예매(온라인) 마감과 현장 판매 종료. 비우면 기본값(사전: 공연 전날 24시 / 현장: 공연 시작 + 3시간)
alter table public.events add column if not exists presale_ends_at timestamptz;
alter table public.events add column if not exists onsite_ends_at timestamptz;
-- 끝 시각은 시작보다 뒤
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'events_ends_after_starts') then
    alter table public.events add constraint events_ends_after_starts check (ends_at is null or ends_at > starts_at) not valid;
  end if;
end $$;

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
-- [편의] 예매자가 일정 변경을 확인하고 '유지'를 고른 시각
alter table public.bookings add column if not exists change_ack_at timestamptz;
-- 판매 경로: ONLINE(사전 예매) / ONSITE(운영진이 현장 판매 등록. 예매자 계정 없음, 등록한 운영진 이름으로 기록)
alter table public.bookings add column if not exists channel text not null default 'ONLINE';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_channel_check') then
    alter table public.bookings add constraint bookings_channel_check check (channel in ('ONLINE', 'ONSITE'));
  end if;
end $$;

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
-- [편의] 환불 요청(공연 취소 또는 일정 변경 때): 예매자가 적은 환불 계좌, 요청·완료 시각
alter table public.payments add column if not exists refund_account text not null default '';
alter table public.payments add column if not exists refund_requested_at timestamptz;
alter table public.payments add column if not exists refunded_at timestamptz;
alter table public.payments add column if not exists depositor_notify_count integer not null default 0;  -- '입금했어요' 누른 횟수(최대 3)
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
-- [11/18] 티켓을 다시 열어도 이전 QR을 무효로 하지 않는다(티켓은 한 번만 입장 처리되므로 안전). 그래서 '티켓당 유효 QR 1개' 인덱스는 없앤다
drop index if exists public.qr_one_active;

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
  using (exists (select 1 from public.bookings b join public.events e on e.id = b.event_id
                 where b.id = booking_id and (b.user_id = auth.uid() or public.is_club_manager(e.club_id))));
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
  -- 'instagram.com/abc'처럼 앞부분 없이 쓴 주소는 https://를 붙여 준다(javascript: 같은 다른 스킴은 그대로 거부)
  if v <> '' and v !~* '^[a-z][a-z0-9+.-]*:' and v ~* '^[a-z0-9-]+(\.[a-z0-9-]+)+(/|$)' then v := 'https://' || v; end if;
  if v <> '' and (v !~* '^https?://[^\s/]+' or length(v) > 300) then
    raise exception '% 주소를 확인해 주세요. (http:// 또는 https://로 시작하는 주소)', p_label using errcode = '22023';
  end if;
  return v;
end;
$$;

-- 동아리 이름 정리: 보이지 않는 문자(폭 없는 공백 등) 제거, 공백 하나로. 비교용 키는 공백 없이 소문자
create or replace function public._club_name(p_name text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(btrim(regexp_replace(coalesce(p_name, ''), '[\u200B-\u200D\u2060\uFEFF\u00AD]', '', 'g')), '\s+', ' ', 'g');
$$;
create or replace function public._club_key(p_name text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(public._club_name(p_name), '\s', '', 'g'));
$$;

-- 글자 수 제한: 너무 긴 입력(붙여넣기 실수 등)을 한국어로 막는다. p_limits = {"칸 이름": [최대 글자, "화면 이름"]}
create or replace function public._check_lengths(p_input jsonb, p_limits jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb;
begin
  for k, v in select * from jsonb_each(p_limits) loop
    if p_input ? k and length(coalesce(p_input ->> k, '')) > (v ->> 0)::integer then
      raise exception '%은(는) %자까지 쓸 수 있어요.', v ->> 1, v ->> 0 using errcode = '22023';
    end if;
  end loop;
end;
$$;

create or replace function public._event_limits() returns jsonb language sql immutable set search_path = '' as $$
  select '{"title":[60,"공연명"],"venue_name":[60,"장소"],"address":[120,"주소"],"description":[2000,"공연 소개"],
           "bank_name":[20,"입금 은행"],"account_number":[30,"입금 계좌"],"account_holder":[40,"예금주"],"category":[20,"분류"]}'::jsonb;
$$;
create or replace function public._club_limits() returns jsonb language sql immutable set search_path = '' as $$
  select '{"name":[40,"동아리 이름"],"school":[30,"학교"],"genre":[30,"장르"],"region":[30,"지역"],"introduction":[1000,"소개"]}'::jsonb;
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
    left join public.payments p on p.booking_id = b.id and p.status = 'PENDING'
    where i.ticket_type_id = p_ticket_type and b.status = 'PENDING_PAYMENT'
      -- '입금했어요'를 누른 예매는 운영진이 확인할 시간을 조금 더 준다(_hold_until)
      and public._hold_until(b.expires_at, p.depositor_notified_at, public._event_end(e.starts_at, e.ends_at)) <= now()
    for update of b
  loop
    update public.bookings set status = 'EXPIRED', updated_at = now() where id = r.id;
    update public.payments set status = 'FAILED', failure_code = 'EXPIRED', updated_at = now() where booking_id = r.id and status = 'PENDING';
    update public.ticket_types set reserved_quantity = reserved_quantity - r.quantity, updated_at = now() where id = p_ticket_type;
    perform public._notify(r.user_id, r.event_id, 'BOOKING_EXPIRED',
      '[' || r.title || '] 입금 확인이 안 돼 예매가 취소됐어요. 이미 입금했다면 주최 동아리에 문의해 주세요.', 'booking-expired-' || r.id);
  end loop;
end;
$$;

-- ───────────────────────── RPC: 회원 · 동아리 ─────────────────────────
create or replace function public.update_profile(p_display_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_login();
  if length(btrim(coalesce(p_display_name, ''))) = 0 then raise exception '이름을 입력하세요.' using errcode = '22023'; end if;
  if length(btrim(p_display_name)) > 20 then raise exception '이름은 20자까지예요.' using errcode = '22023'; end if;
  update public.profiles set display_name = left(btrim(p_display_name), 20), updated_at = now() where id = auth.uid();
end;
$$;

create or replace function public.create_club(p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_active_profile(); v_id uuid; v_name text := public._club_name(p_input ->> 'name'); v_old public.clubs;
begin
  if v_name = '' then raise exception '동아리 이름을 입력하세요.' using errcode = '22023'; end if;
  perform public._check_lengths(p_input, public._club_limits());
  -- 거절된 내 동아리를 같은 이름으로 다시 신청하면 그 동아리를 승인 대기로 되돌린다(재심사)
  select * into v_old from public.clubs where public._club_key(name) = public._club_key(v_name) and status = 'REJECTED' and created_by = v_uid;
  if found then
    update public.clubs set status = 'PENDING', name = v_name, introduction = p_input ->> 'introduction',
      sns_url = nullif(public._check_url(p_input ->> 'sns_url', 'SNS 링크'), ''), school = btrim(coalesce(p_input ->> 'school', '')),
      genre = btrim(coalesce(p_input ->> 'genre', '')), region = btrim(coalesce(p_input ->> 'region', '')), updated_at = now() where id = v_old.id;
    return v_old.id;
  end if;
  if exists (select 1 from public.clubs where public._club_key(name) = public._club_key(v_name)) then
    raise exception '이미 등록된 동아리 이름입니다. (띄어쓰기·대소문자만 다른 이름도 같은 이름으로 봐요)' using errcode = '23505';
  end if;
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
  perform public._check_lengths(p_patch, public._club_limits());
  if exists (select 1 from public.clubs where id = p_club_id and status = 'SUSPENDED') then
    raise exception '운영이 정지된 동아리는 정보를 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  if p_patch ? 'name' then
    v_name := public._club_name(p_patch ->> 'name');
    if v_name = '' then raise exception '동아리 이름을 입력하세요.' using errcode = '22023'; end if;
    if length(v_name) > 40 then raise exception '동아리 이름은 40자까지입니다.' using errcode = '22023'; end if;
    if exists (select 1 from public.clubs where public._club_key(name) = public._club_key(v_name) and id <> p_club_id) then raise exception '이미 등록된 동아리 이름입니다.' using errcode = '23505'; end if;
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
  -- 정지·거절되면 아직 끝나지 않은 공연의 예매자에게 알린다(환불 요청 가능)
  if p_status in ('SUSPENDED', 'REJECTED') then
    perform public._notify(x.user_id, x.event_id, 'CLUB_SUSPENDED',
      '[' || x.title || '] 주최 동아리 운영이 중지돼 입금 확인·입장이 어려울 수 있어요. 내 티켓에서 환불을 요청할 수 있어요.',
      'club-suspended-' || x.event_id || '-' || x.user_id || '-' || gen_random_uuid())
    from (select distinct b.user_id, e.id as event_id, e.title from public.bookings b join public.events e on e.id = b.event_id
          where e.club_id = p_club_id and b.status in ('PENDING_PAYMENT', 'CONFIRMED') and b.channel = 'ONLINE'
            and public._event_end(e.starts_at, e.ends_at) > now()) x;
  end if;
end;
$$;

-- ───────────────────────── RPC: 공연 ─────────────────────────
-- 공연이 끝나는 시각: 주최 측이 입력한 진행 시간(ends_at). 예전 행처럼 비어 있으면 시작 + 2시간으로 본다
create or replace function public._event_end(p_starts timestamptz, p_ends timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select coalesce(p_ends, p_starts + interval '2 hours');
$$;

-- 입금 대기 예매를 잡아 두는 마지막 시각.
--   보통: 입금 기한(expires_at = 예매 후 3일과 공연 끝 중 빠른 쪽)
--   기한 안에 '입금했어요'를 누른 예매: 운영진이 확인할 시간으로 기한 + 24시간(단, 공연 끝까지)
-- 이 시각이 지나면 자동 만료된다. '입금했어요'만 누르고 입금하지 않아도 자리를 영원히 잡지 못한다
create or replace function public._hold_until(p_expires timestamptz, p_notified timestamptz, p_event_end timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select case when p_notified is null then p_expires else greatest(p_expires, least(p_expires + interval '24 hours', p_event_end)) end;
$$;

-- 장소 비교용: 앞뒤·중복 공백과 대소문자 차이는 같은 장소로 본다(띄어쓰기만 고쳐도 '일정 변경'이 되지 않게)
create or replace function public._norm(p_text text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;

-- 사전 예매 마감 기본값: 공연 전날 24시(= 공연 당일 0시, 한국 시간)
create or replace function public._default_presale_end(p_starts timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select (date_trunc('day', p_starts at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';
$$;
-- 현장 판매 창: 공연 당일 0시 ~ (입력값 또는 공연 시작 + 3시간)
create or replace function public._onsite_end(p_starts timestamptz, p_onsite_ends timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select coalesce(p_onsite_ends, p_starts + interval '3 hours');
$$;

-- 진행 시간(분) 입력 검사: 10분 ~ 24시간
create or replace function public._duration(p_text text, p_default integer) returns interval
language plpgsql immutable set search_path = '' as $$
declare v bigint := coalesce(public._to_bigint(p_text, '진행 시간'), p_default);
begin
  if v is null then return null; end if;
  if v < 10 or v > 1440 then raise exception '진행 시간은 10분 ~ 24시간(1440분) 사이로 입력하세요.' using errcode = '22023'; end if;
  return make_interval(mins => v::integer);
end;
$$;

-- 공개 조건: 장소, 앞으로의 일시, 유료면 입금 계좌. 공개 등록 · 공개 전환 · 공개 중 수정에 똑같이 적용한다
create or replace function public._check_publishable(p_venue text, p_starts timestamptz, p_price bigint, p_account text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if btrim(coalesce(p_venue, '')) = '' then raise exception '공개하려면 장소가 필요합니다.' using errcode = '22023'; end if;
  if p_starts <= now() then raise exception '이미 지난 일시로는 공개할 수 없습니다.' using errcode = '22023'; end if;
  if p_starts > now() + interval '2 years' then raise exception '2년 안의 일시만 공개할 수 있어요. 연도를 확인해 주세요.' using errcode = '22023'; end if;
  if p_price > 0 and btrim(coalesce(p_account, '')) = '' then raise exception '유료 공연은 입금 계좌가 필요합니다.' using errcode = '22023'; end if;
  if p_price > 0 and length(regexp_replace(p_account, '[^0-9]', '', 'g')) < 6 then
    raise exception '입금 계좌번호를 확인해 주세요. (숫자 6자리 이상)' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.create_event(p_club_id uuid, p_input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_active_profile();
  v_id uuid;
  v_publish boolean := coalesce((p_input ->> 'publish')::boolean, false);
  v_price bigint := public._to_bigint(p_input ->> 'price_krw', '가격');
  v_capacity bigint := coalesce(public._to_bigint(p_input ->> 'capacity', '정원'), 0);
  v_starts timestamptz := public._to_ts(p_input ->> 'starts_at');
  v_duration interval := public._duration(p_input ->> 'duration_minutes', 120);  -- 진행 시간(기본 2시간)
  v_presale timestamptz := public._to_ts(p_input ->> 'presale_ends_at');
  v_onsite timestamptz := public._to_ts(p_input ->> 'onsite_ends_at');
  v_club public.clubs;
begin
  perform public._require_active_manager(p_club_id, '동아리 운영진만 공연을 올릴 수 있습니다.');
  select * into v_club from public.clubs where id = p_club_id;
  if btrim(coalesce(p_input ->> 'title', '')) = '' then raise exception '공연명을 입력하세요.' using errcode = '22023'; end if;
  perform public._check_lengths(p_input, public._event_limits());
  if v_starts is null then raise exception '일시를 입력하세요.' using errcode = '22023'; end if;
  if v_capacity <= 0 or v_capacity > 100000 then raise exception '정원은 1~100000 사이여야 합니다.' using errcode = '22023'; end if;
  if v_price is null then raise exception '가격을 입력하세요. (무료면 0)' using errcode = '22023'; end if;
  if v_price < 0 then raise exception '가격은 0원 이상이어야 합니다.' using errcode = '22023'; end if;
  if v_publish then perform public._check_publishable(p_input ->> 'venue_name', v_starts, v_price, p_input ->> 'account_number'); end if;
  -- 좌표: 실제로는 주소 → 좌표 변환(카카오 Local) 결과를 받는다. 없으면 null
  insert into public.events (club_id, created_by, title, description, category, starts_at, ends_at, venue_name, address, latitude, longitude,
    poster_path, status, published_at, bank_name, account_number, account_holder)
  values (p_club_id, v_uid, btrim(p_input ->> 'title'), p_input ->> 'description', p_input ->> 'category', v_starts, v_starts + v_duration,
    btrim(coalesce(p_input ->> 'venue_name', '')), btrim(coalesce(p_input ->> 'address', '')),
    public._to_coord(p_input ->> 'latitude', -90, 90), public._to_coord(p_input ->> 'longitude', -180, 180),
    p_input ->> 'poster_path', case when v_publish then 'PUBLISHED' else 'DRAFT' end, case when v_publish then now() end,
    btrim(coalesce(p_input ->> 'bank_name', '')), btrim(coalesce(p_input ->> 'account_number', '')),
    -- 예금주: 입력한 실제 예금주(개인 계좌일 수 있음). 없으면 동아리 이름
    left(coalesce(nullif(btrim(coalesce(p_input ->> 'account_holder', '')), ''), v_club.name), 40))
  returning id into v_id;
  if v_presale is not null and v_presale > v_starts then raise exception '사전 예매 마감은 공연 시작 전이어야 해요.' using errcode = '22023'; end if;
  if v_onsite is not null and v_onsite < v_starts then raise exception '현장 판매 종료는 공연 시작 뒤여야 해요.' using errcode = '22023'; end if;
  update public.events set presale_ends_at = v_presale, onsite_ends_at = v_onsite where id = v_id;
  -- 티켓 종류의 판매 마감 = 사전 예매 마감(입력값 또는 공연 전날 24시)
  insert into public.ticket_types (event_id, name, price_krw, capacity, sales_ends_at)
  values (v_id, case when v_price > 0 then '일반' else '참가 신청' end, v_price, v_capacity, coalesce(v_presale, public._default_presale_end(v_starts)));
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
  v_venue text; v_account text; v_ends timestamptz;
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
  -- 진행 시간을 보내면 그대로, 안 보내면 기존 진행 시간을 유지한 채 시작 시각에 맞춰 옮긴다
  v_ends := v_starts + coalesce(public._duration(p_input ->> 'duration_minutes', null),
                                public._event_end(v_event.starts_at, v_event.ends_at) - v_event.starts_at);
  -- 사전 예매 마감 · 현장 판매 종료: 보내면 그 값(빈 값 = 기본), 안 보내면 그대로
  if p_input ? 'presale_ends_at' then v_event.presale_ends_at := public._to_ts(p_input ->> 'presale_ends_at'); end if;
  if p_input ? 'onsite_ends_at' then v_event.onsite_ends_at := public._to_ts(p_input ->> 'onsite_ends_at'); end if;
  if v_event.presale_ends_at is not null and v_event.presale_ends_at > v_starts then raise exception '사전 예매 마감은 공연 시작 전이어야 해요.' using errcode = '22023'; end if;
  if v_event.onsite_ends_at is not null and v_event.onsite_ends_at < v_starts then raise exception '현장 판매 종료는 공연 시작 뒤여야 해요.' using errcode = '22023'; end if;
  v_venue := case when p_input ? 'venue_name' then regexp_replace(btrim(coalesce(p_input ->> 'venue_name', '')), '\s+', ' ', 'g') else v_event.venue_name end;
  v_account := case when p_input ? 'account_number' then btrim(coalesce(p_input ->> 'account_number', '')) else v_event.account_number end;
  if p_input ? 'title' and btrim(coalesce(p_input ->> 'title', '')) = '' then raise exception '공연명을 입력하세요.' using errcode = '22023'; end if;
  perform public._check_lengths(p_input, public._event_limits());
  if v_price < 0 then raise exception '가격은 0원 이상이어야 합니다.' using errcode = '22023'; end if;
  if v_capacity <= 0 or v_capacity > 100000 then raise exception '정원은 1~100000 사이여야 합니다.' using errcode = '22023'; end if;
  if v_price <> v_tt.price_krw and exists (select 1 from public.bookings where event_id = p_event_id and status in ('PENDING_PAYMENT', 'CONFIRMED')) then
    raise exception '예매가 있는 공연은 가격을 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_capacity < v_tt.reserved_quantity + v_tt.sold_quantity then raise exception '이미 예매된 수량보다 정원을 줄일 수 없습니다.' using errcode = 'P0001'; end if;
  if v_event.status = 'PUBLISHED' then
    if v_starts is distinct from v_event.starts_at or public._norm(v_venue) <> public._norm(v_event.venue_name)
       or v_price <> v_tt.price_krw or v_account is distinct from v_event.account_number then
      if v_starts is distinct from v_event.starts_at then
        perform public._check_publishable(v_venue, v_starts, v_price, v_account);
      else
        perform public._check_publishable(v_venue, greatest(v_starts, now() + interval '1 minute'), v_price, v_account);
      end if;
    end if;
  end if;
  update public.events set
    title = case when p_input ? 'title' then btrim(p_input ->> 'title') else title end,
    description = case when p_input ? 'description' then p_input ->> 'description' else description end,
    category = case when p_input ? 'category' then p_input ->> 'category' else category end,
    starts_at = v_starts, ends_at = v_ends, venue_name = v_venue,
    presale_ends_at = v_event.presale_ends_at, onsite_ends_at = v_event.onsite_ends_at,
    previous_starts_at = case when v_starts is distinct from v_event.starts_at or public._norm(v_venue) <> public._norm(v_event.venue_name)
      then v_event.starts_at else previous_starts_at end,
    previous_venue_name = case when v_starts is distinct from v_event.starts_at or public._norm(v_venue) <> public._norm(v_event.venue_name)
      then v_event.venue_name else previous_venue_name end,
    schedule_changed_at = case when (v_starts is distinct from v_event.starts_at or public._norm(v_venue) <> public._norm(v_event.venue_name))
      and exists (select 1 from public.bookings where event_id = p_event_id and status in ('PENDING_PAYMENT', 'CONFIRMED'))
      then now() else schedule_changed_at end,
    address = case when p_input ? 'address' then btrim(coalesce(p_input ->> 'address', '')) else address end,
    bank_name = case when p_input ? 'bank_name' then btrim(coalesce(p_input ->> 'bank_name', '')) else bank_name end,
    account_holder = case when p_input ? 'account_holder' and btrim(coalesce(p_input ->> 'account_holder', '')) <> ''
      then left(btrim(p_input ->> 'account_holder'), 40) else account_holder end,
    account_number = v_account,
    poster_path = case when p_input ? 'poster_path' then p_input ->> 'poster_path' else poster_path end,
    updated_at = now()
  where id = p_event_id;
  update public.ticket_types set price_krw = v_price, capacity = v_capacity,
    sales_ends_at = coalesce(v_event.presale_ends_at, public._default_presale_end(v_starts)), updated_at = now() where id = v_tt.id;
  if v_starts is distinct from v_event.starts_at or public._norm(v_venue) <> public._norm(v_event.venue_name) then
    -- 공연을 앞당기면 입금 기한도 새 공연 끝을 넘지 않게(예매 시각보다는 뒤)
    update public.bookings set expires_at = greatest(least(expires_at, v_ends), created_at + interval '1 minute'), updated_at = now()
    where event_id = p_event_id and status = 'PENDING_PAYMENT' and expires_at > v_ends;
    -- 예매자에게 일정·장소 변경 알림(같은 변경은 한 번만)
    perform public._notify(b.user_id, p_event_id, 'EVENT_CHANGED',
      '[' || btrim(coalesce(p_input ->> 'title', v_event.title)) || '] 공연 ' ||
      case when v_starts is distinct from v_event.starts_at then '일시가 ' || to_char(v_starts at time zone 'Asia/Seoul', 'MM.DD HH24:MI') || '(으)로' else '' end ||
      case when v_starts is distinct from v_event.starts_at and public._norm(v_venue) <> public._norm(v_event.venue_name) then ', ' else '' end ||
      case when public._norm(v_venue) <> public._norm(v_event.venue_name) then '장소가 ' || coalesce(nullif(v_venue, ''), '미정') || '(으)로' else '' end || ' 바뀌었어요. 내 티켓에서 유지하거나 취소·환불을 요청할 수 있어요.',
      'event-changed-' || p_event_id || '-' || b.user_id || '-' || gen_random_uuid())
    from (select distinct user_id from public.bookings where event_id = p_event_id and status in ('PENDING_PAYMENT', 'CONFIRMED')) b;
  end if;
  -- 입금 계좌를 고치면(오타 수정 등) 아직 입금 전인 예매자에게 새 계좌를 알린다
  if v_account is distinct from v_event.account_number
     or (p_input ? 'bank_name' and btrim(coalesce(p_input ->> 'bank_name', '')) is distinct from v_event.bank_name) then
    perform public._notify(b.user_id, p_event_id, 'ACCOUNT_CHANGED',
      '[' || v_event.title || '] 입금 계좌가 바뀌었어요. 입금 전이면 내 티켓에서 새 계좌를 확인해 주세요.',
      'account-changed-' || b.id || '-' || md5(coalesce(v_account, '') || coalesce(p_input ->> 'bank_name', '')))
    from public.bookings b where b.event_id = p_event_id and b.status = 'PENDING_PAYMENT';
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
  if p_status = 'CANCELLED' and public._event_end(v_event.starts_at, v_event.ends_at) <= now() then
    raise exception '이미 끝난 공연은 취소할 수 없어요. 개별 환불은 예매자와 따로 정해 주세요.' using errcode = 'P0001';
  end if;
  if p_status = 'DRAFT' and v_event.status = 'PUBLISHED' then
    perform public._notify(b.user_id, p_event_id, 'EVENT_HIDDEN', '[' || v_event.title || '] 공연 페이지가 비공개로 바뀌었어요. 예매와 티켓은 그대로예요.',
      'event-hidden-' || p_event_id || '-' || b.user_id || '-' || gen_random_uuid())
    from (select distinct user_id from public.bookings where event_id = p_event_id and status in ('PENDING_PAYMENT', 'CONFIRMED') and channel = 'ONLINE') b;
  end if;
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
        then '공연이 취소됐어요. 내 티켓에서 환불받을 계좌를 적어 환불을 요청해 주세요.' else '공연이 취소돼 예매도 취소됐어요.' end,
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
  if now() >= v_tt.sales_ends_at or now() >= v_event.starts_at then
    raise exception '온라인 사전 예매가 마감됐어요. 현장에서 구매해 주세요.' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_depositor_name, ''))) > 20 then raise exception '입금자명은 20자까지입니다.' using errcode = '22023'; end if;
  perform public._expire_bookings(v_tt.id);
  -- 한 공연에 입금 대기 예매는 한 사람당 1건(입금 안 하고 여러 건으로 자리를 잡지 못하게)
  if exists (select 1 from public.bookings where user_id = v_uid and event_id = v_event.id and status = 'PENDING_PAYMENT') then
    raise exception '이 공연에 입금 대기 중인 예매가 있어요. 입금하거나 취소한 뒤 다시 예매해 주세요.' using errcode = 'P0001';
  end if;
  if (select coalesce(sum(i.quantity), 0) from public.bookings b join public.booking_items i on i.booking_id = b.id
      where b.user_id = v_uid and b.event_id = v_event.id and b.status in ('PENDING_PAYMENT', 'CONFIRMED') and b.channel = 'ONLINE') + p_quantity > 10 then
    raise exception '한 사람이 한 공연에 예매할 수 있는 표는 10장까지예요.' using errcode = 'P0001';
  end if;
  select * into v_tt from public.ticket_types where id = p_ticket_type_id;
  if v_tt.capacity - v_tt.reserved_quantity - v_tt.sold_quantity < p_quantity then raise exception '남은 자리가 부족합니다.' using errcode = 'P0001'; end if;
  if v_tt.price_krw > 0 and btrim(coalesce(p_depositor_name, '')) = '' then raise exception '입금자명을 입력하세요.' using errcode = '22023'; end if;

  insert into public.bookings (user_id, event_id, total_amount_krw, expires_at, idempotency_key, request_hash)
  values (v_uid, v_event.id, v_tt.price_krw * p_quantity, least(now() + interval '3 days', public._event_end(v_event.starts_at, v_event.ends_at)), v_key, v_hash) returning id into v_booking;  -- 입금 기한: 3일 또는 공연 끝 중 빠른 쪽(현장 입금도 공연 중 확인 가능). 예매 자체는 공연 시작에 마감. 이전 주석: 3일 또는 공연 시작 중 빠른 쪽
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
declare v_b public.bookings; v_i public.booking_items; v_next integer; v_title text; v_seq integer;
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
  -- 입금 확인을 되돌렸다가 다시 확인하면 새 티켓을 이어서 발급(무효가 된 이전 티켓 번호와 겹치지 않게)
  select coalesce(max(issue_sequence), 0) into v_seq from public.tickets where booking_item_id = v_i.id;
  insert into public.tickets (booking_id, booking_item_id, user_id, event_id, issue_sequence, entry_number)
  select v_b.id, v_i.id, v_b.user_id, v_b.event_id, v_seq + g, v_next + g - 1 from generate_series(1, v_i.quantity) g;
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
  -- 무료 신청은 확정 뒤에도 취소할 수 있다(돈이 오가지 않음, 입장 전). 노쇼를 줄이고 자리를 다른 사람에게
  if v_b.status = 'CONFIRMED' and v_b.total_amount_krw = 0 and v_b.channel = 'ONLINE' then
    perform 1 from public.tickets where booking_id = p_booking_id order by id for update;
    if exists (select 1 from public.tickets where booking_id = p_booking_id and status = 'CHECKED_IN') then
      raise exception '이미 입장한 신청은 취소할 수 없어요.' using errcode = 'P0001';
    end if;
    update public.bookings set status = 'CANCELLED', cancelled_at = now(), updated_at = now() where id = p_booking_id;
    update public.tickets set status = 'CANCELLED', updated_at = now() where booking_id = p_booking_id;
    update public.ticket_types set sold_quantity = sold_quantity - v_i.quantity, updated_at = now() where id = v_i.ticket_type_id;
    return;
  end if;
  if v_b.status <> 'PENDING_PAYMENT' then raise exception '입금 확인 전 예매만 취소할 수 있습니다. 확정된 예매는 주최 동아리에 문의해 주세요.' using errcode = 'P0001'; end if;
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
  if exists (select 1 from public.events where id = v_t.event_id and public._event_end(starts_at, ends_at) <= now()) then
    raise exception '이미 끝난 공연의 티켓입니다.' using errcode = 'P0001';
  end if;
  insert into public.qr_credentials (ticket_id, token_hash, expires_at)
  -- 유효시간: 24시간과 '공연 끝 시각' 중 긴 쪽(최대 7일). 전날 받아 둔 QR도 공연장에서 쓸 수 있게
  values (p_ticket_id, encode(extensions.digest(v_token, 'sha256'), 'hex'),
          greatest(now() + interval '24 hours',
                   least((select public._event_end(starts_at, ends_at) from public.events where id = v_t.event_id), now() + interval '7 days')));
  return v_token;
end;
$$;

create or replace function public._ticket_by_token(p_event_id uuid, p_token text) returns public.tickets
language sql stable security definer set search_path = '' as $$
  select t.* from public.qr_credentials q join public.tickets t on t.id = q.ticket_id
  where q.token_hash = encode(extensions.digest(lower(regexp_replace(coalesce(p_token, ''), '^\s+|\s+$', '', 'g')), 'sha256'), 'hex')
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
    if v_t.id is null or v_t.status <> 'CHECKED_IN' then return jsonb_build_object('result', 'invalid'); end if;  -- 그사이 환불·취소됨(QR도 폐기됨)
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
             join public.events e on e.id = b.event_id left join public.payments p on p.booking_id = b.id and p.status = 'PENDING'
           where b.status = 'PENDING_PAYMENT'
             and public._hold_until(b.expires_at, p.depositor_notified_at, public._event_end(e.starts_at, e.ends_at)) <= now()
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
  if exists (select 1 from public.exchange_requests where from_club_id = p_from_club_id and to_club_id = p_to_club_id and status = 'REJECTED'
             and responded_at > now() - interval '7 days') then
    raise exception '거절된 신청은 7일 뒤에 다시 보낼 수 있어요.' using errcode = 'P0001';
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
  if v_r.created_by = auth.uid() then raise exception '신청한 사람이 직접 수락할 수는 없어요. 상대 동아리의 다른 운영진이 처리해 주세요.' using errcode = 'P0001'; end if;
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
  -- 대기 중인 신청은 보낸 쪽이 취소, 수락된 교류는 양쪽 누구나 끊기(오픈채팅 링크가 다시 안 보임)
  if not found or not (public.is_club_manager(v_r.from_club_id) or (v_r.status = 'ACCEPTED' and public.is_club_manager(v_r.to_club_id))) then
    raise exception '신청을 찾지 못했습니다.' using errcode = 'P0002';
  end if;
  if v_r.status not in ('PENDING', 'ACCEPTED') then raise exception '이미 처리한 신청입니다.' using errcode = 'P0001'; end if;
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
  if v_b.status = 'PENDING_PAYMENT' and v_b.expires_at <= now() then
    raise exception '입금 기한이 지났어요. 이미 입금했다면 주최 동아리에 문의해 주세요.' using errcode = 'P0001';
  end if;
  if v_b.status <> 'PENDING_PAYMENT' then raise exception '입금 대기 중인 예매가 아니에요.' using errcode = 'P0001'; end if;
  select * into v_pay from public.payments where booking_id = p_booking_id and status = 'PENDING' for update;
  if v_pay.depositor_notify_count > 0 and v_pay.updated_at > now() - interval '10 minutes' then
    raise exception '이미 알렸어요. 잠시 후 다시 눌러 주세요.' using errcode = 'P0001';
  end if;
  if v_pay.depositor_notify_count >= 3 then raise exception '이미 여러 번 알렸어요. 주최 동아리에 직접 문의해 주세요.' using errcode = 'P0001'; end if;
  -- 처음 누른 시각을 남긴다(잡아 두는 시간 계산 기준이 바뀌지 않게)
  update public.payments set depositor_notified_at = coalesce(depositor_notified_at, now()), depositor_notify_count = depositor_notify_count + 1,
    updated_at = now() where id = v_pay.id;
  select title, club_id into v_title, v_club from public.events where id = v_b.event_id;
  for m in select user_id from public.club_memberships where club_id = v_club and status = 'ACTIVE' and role in ('OWNER', 'MANAGER') loop
    perform public._notify(m.user_id, v_b.event_id, 'DEPOSIT_SENT',
      '[' || v_title || '] ' || v_pay.depositor_name || '님이 입금했다고 알렸어요. 입금 확인해 주세요.', 'deposit-sent-' || v_pay.id || '-' || m.user_id || '-' || gen_random_uuid());
  end loop;
end;
$$;

-- 일정 변경 확인: '유지'를 고르면 다시 묻지 않는다
create or replace function public.ack_event_change(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_login();
  update public.bookings set change_ack_at = now(), updated_at = now() where id = p_booking_id and user_id = auth.uid();
  if not found then raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002'; end if;
end;
$$;

-- 확정 예매의 취소·환불 요청: 공연이 취소됐거나, 예매한 뒤 일시·장소가 바뀐 경우에만(그 밖의 환불 정책은 팀 결정 전).
-- 공연 시작 전까지, 입장한 티켓이 없을 때. 예매 취소 + 티켓 무효 + 자리 반환, 결제는 환불 대기(REFUND_PENDING)
create or replace function public.request_refund(p_booking_id uuid, p_refund_account text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_e public.events; v_i public.booking_items; v_acct text := btrim(coalesce(p_refund_account, ''));
begin
  perform public._require_login();
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or v_b.user_id <> auth.uid() then raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002'; end if;
  select * into v_e from public.events where id = v_b.event_id;
  if not (v_e.status = 'CANCELLED' or (v_e.schedule_changed_at is not null and v_e.schedule_changed_at > v_b.created_at)
          or exists (select 1 from public.clubs c where c.id = v_e.club_id and c.status in ('SUSPENDED', 'REJECTED'))) then
    raise exception '공연이 취소되거나 일정이 바뀐 경우에만 환불을 요청할 수 있어요. 그 밖에는 주최 동아리에 문의해 주세요.' using errcode = 'P0001';
  end if;
  if v_e.status <> 'CANCELLED' and v_e.starts_at <= now() then raise exception '공연이 이미 시작됐어요.' using errcode = 'P0001'; end if;
  if v_b.total_amount_krw > 0 and (length(v_acct) < 5 or length(v_acct) > 60 or length(regexp_replace(v_acct, '[^0-9]', '', 'g')) < 6) then
    raise exception '환불받을 계좌(은행 · 계좌번호 · 예금주)를 적어 주세요.' using errcode = '22023';
  end if;
  select * into v_i from public.booking_items where booking_id = p_booking_id;
  perform 1 from public.ticket_types where id = v_i.ticket_type_id for update;  -- 잠금 순서: 티켓 종류 → 예매
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.status <> 'CONFIRMED' then raise exception '확정된 예매만 환불을 요청할 수 있어요. 입금 전이면 예매 취소를 눌러 주세요.' using errcode = 'P0001'; end if;
  perform 1 from public.tickets where booking_id = p_booking_id order by id for update;  -- 입장 처리와 동시에 와도 한쪽만
  if exists (select 1 from public.tickets where booking_id = p_booking_id and status = 'CHECKED_IN') then
    raise exception '이미 입장한 티켓이 있어 환불을 요청할 수 없어요.' using errcode = 'P0001';
  end if;
  update public.bookings set status = 'CANCELLED', cancelled_at = now(), updated_at = now() where id = p_booking_id;
  update public.tickets set status = 'CANCELLED', updated_at = now() where booking_id = p_booking_id and status = 'ISSUED';
  update public.qr_credentials set revoked_at = now() where revoked_at is null and ticket_id in (select id from public.tickets where booking_id = p_booking_id);
  update public.ticket_types set sold_quantity = sold_quantity - v_i.quantity, updated_at = now() where id = v_i.ticket_type_id;
  update public.payments set status = case when v_b.total_amount_krw > 0 then 'REFUND_PENDING' else 'REFUNDED' end,
    refund_account = v_acct, refund_requested_at = now(), refunded_at = case when v_b.total_amount_krw > 0 then null else now() end, updated_at = now()
  where booking_id = p_booking_id and status = 'SUCCEEDED';
  if v_b.total_amount_krw > 0 then
    perform public._notify(m.user_id, v_e.id, 'REFUND_REQUESTED', '[' || v_e.title || '] 환불 요청이 왔어요. ' || v_b.total_amount_krw || '원을 보내고 환불 완료를 눌러 주세요.',
      'refund-req-' || p_booking_id || '-' || m.user_id)
    from public.club_memberships m where m.club_id = v_e.club_id and m.status = 'ACTIVE' and m.role in ('OWNER', 'MANAGER');
  end if;
  perform public._audit(v_e.id, 'REQUEST_REFUND', 'booking', p_booking_id);
end;
$$;

-- 운영진의 '환불 완료'(계좌로 돈을 돌려준 뒤). 동아리가 정지돼도 환불 처리는 된다
create or replace function public.mark_refunded(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_title text;
begin
  perform public._require_active_profile();
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or not public.is_club_manager((select club_id from public.events where id = v_b.event_id)) then
    raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002';
  end if;
  -- 환불을 마치면 환불 계좌는 지운다(개인정보 최소 보관)
  update public.payments set status = 'REFUNDED', refunded_at = now(), refund_account = '', updated_at = now()
  where booking_id = p_booking_id and status = 'REFUND_PENDING';
  if not found then raise exception '환불 대기 중인 예매가 아닙니다.' using errcode = 'P0001'; end if;
  select title into v_title from public.events where id = v_b.event_id;
  perform public._notify(v_b.user_id, v_b.event_id, 'REFUNDED', '[' || v_title || '] 환불이 완료됐어요. 계좌를 확인해 주세요.', 'refunded-' || p_booking_id);
  perform public._audit(v_b.event_id, 'REFUNDED', 'booking', p_booking_id);
end;
$$;

-- ───── 현장 판매 (11/18 팀 논의: 사전 예매는 하루 전까지, 현장은 당일) ─────
-- 운영진이 입구에서 현장 판매를 등록: 결제 수단(현장 현금 / 현장 이체)을 기록하고, 티켓을 바로 입장 처리한다.
-- 판매 창: 공연 당일 0시 ~ 현장 판매 종료(기본 공연 시작 + 3시간). 정원은 사전 예매와 함께 센다
create or replace function public.record_onsite_sale(p_event_id uuid, p_quantity integer, p_method text, p_buyer_name text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_e public.events; v_tt public.ticket_types; v_b uuid; v_i uuid; v_next integer;
begin
  perform public._require_login();
  select * into v_e from public.events where id = p_event_id;
  if not found then raise exception '공연을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  perform public._require_active_manager(v_e.club_id, '공연을 찾지 못했습니다.');
  if p_method not in ('CASH', 'TRANSFER') then raise exception '결제 수단(현금 · 이체)을 골라 주세요.' using errcode = '22023'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then raise exception '수량은 1~20장이에요.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_buyer_name, ''))) > 20 then raise exception '구매자 이름은 20자까지예요.' using errcode = '22023'; end if;
  if v_e.status <> 'PUBLISHED' then raise exception '공개 중인 공연만 현장 판매할 수 있어요.' using errcode = 'P0001'; end if;
  if now() < public._default_presale_end(v_e.starts_at) then raise exception '현장 판매는 공연 당일부터 할 수 있어요.' using errcode = 'P0001'; end if;
  if now() > public._onsite_end(v_e.starts_at, v_e.onsite_ends_at) then raise exception '현장 판매 시간이 끝났어요.' using errcode = 'P0001'; end if;
  select * into v_tt from public.ticket_types where event_id = p_event_id order by created_at limit 1 for update;  -- 잠금 순서: 티켓 종류 → 공연
  perform public._expire_bookings(v_tt.id);
  select * into v_tt from public.ticket_types where id = v_tt.id;
  if v_tt.capacity - v_tt.reserved_quantity - v_tt.sold_quantity < p_quantity then raise exception '남은 자리가 부족해요.' using errcode = 'P0001'; end if;
  perform 1 from public.events where id = p_event_id for update;
  insert into public.bookings (user_id, event_id, status, total_amount_krw, expires_at, confirmed_at, idempotency_key, request_hash, channel)
  values (v_uid, p_event_id, 'CONFIRMED', v_tt.price_krw * p_quantity, now() + interval '1 minute', now(), 'onsite-' || gen_random_uuid(), 'onsite', 'ONSITE')
  returning id into v_b;
  insert into public.booking_items (booking_id, event_id, user_id, ticket_type_id, quantity, unit_price_krw, ticket_type_name)
  values (v_b, p_event_id, v_uid, v_tt.id, p_quantity, v_tt.price_krw, '현장 판매') returning id into v_i;
  insert into public.payments (booking_id, provider, provider_order_id, status, depositor_name, confirmed_by, approved_at)
  values (v_b, case p_method when 'CASH' then 'ONSITE_CASH' else 'ONSITE_TRANSFER' end, 'BANDY-ON-' || upper(left(replace(v_b::text, '-', ''), 12)),
          'SUCCEEDED', btrim(coalesce(p_buyer_name, '')), v_uid, now());
  update public.ticket_types set sold_quantity = sold_quantity + p_quantity, updated_at = now() where id = v_tt.id;
  select coalesce(max(entry_number), 0) + 1 into v_next from public.tickets where event_id = p_event_id;
  insert into public.tickets (booking_id, booking_item_id, user_id, event_id, issue_sequence, entry_number, status, checked_in_at, checked_in_by)
  select v_b, v_i, v_uid, p_event_id, g, v_next + g - 1, 'CHECKED_IN', now(), v_uid from generate_series(1, p_quantity) g;
  perform public._audit(p_event_id, 'ONSITE_SALE', 'booking', v_b);
  return v_b;
end;
$$;

-- 잘못 등록한 현장 판매 취소(현장 판매 시간 안에서). 돈은 현장에서 돌려준다
create or replace function public.cancel_onsite_sale(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_i public.booking_items; v_e public.events;
begin
  perform public._require_login();
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or v_b.channel <> 'ONSITE' then raise exception '현장 판매 기록을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  select * into v_e from public.events where id = v_b.event_id;
  perform public._require_active_manager(v_e.club_id, '현장 판매 기록을 찾지 못했습니다.');
  select * into v_i from public.booking_items where booking_id = p_booking_id;
  perform 1 from public.ticket_types where id = v_i.ticket_type_id for update;
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.status <> 'CONFIRMED' then raise exception '이미 취소한 기록이에요.' using errcode = 'P0001'; end if;
  update public.bookings set status = 'CANCELLED', cancelled_at = now(), updated_at = now() where id = p_booking_id;
  update public.tickets set status = 'CANCELLED', updated_at = now() where booking_id = p_booking_id;
  update public.payments set status = 'REFUNDED', refunded_at = now(), updated_at = now() where booking_id = p_booking_id;
  update public.ticket_types set sold_quantity = sold_quantity - v_i.quantity, updated_at = now() where id = v_i.ticket_type_id;
  perform public._audit(v_e.id, 'CANCEL_ONSITE_SALE', 'booking', p_booking_id);
end;
$$;

-- ───── 오타 · 실수 바로잡기 ─────
-- 예매자: 입금 전 예매의 입금자명 고치기(운영진이 통장과 맞춰 볼 이름)
create or replace function public.update_depositor_name(p_booking_id uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_name text := btrim(coalesce(p_name, ''));
begin
  perform public._require_login();
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or v_b.user_id <> auth.uid() then raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002'; end if;
  if v_b.status <> 'PENDING_PAYMENT' then raise exception '입금 확인 전 예매만 입금자명을 고칠 수 있어요.' using errcode = 'P0001'; end if;
  if v_name = '' or length(v_name) > 20 then raise exception '입금자명은 1~20자로 입력하세요.' using errcode = '22023'; end if;
  update public.payments set depositor_name = v_name, updated_at = now() where booking_id = p_booking_id and status = 'PENDING';
end;
$$;

-- 예매자: 환불 대기 중인 환불 계좌 고치기
create or replace function public.update_refund_account(p_booking_id uuid, p_refund_account text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_acct text := btrim(coalesce(p_refund_account, ''));
begin
  perform public._require_login();
  select * into v_b from public.bookings where id = p_booking_id;
  if not found or v_b.user_id <> auth.uid() then raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002'; end if;
  if length(v_acct) < 5 or length(v_acct) > 60 or length(regexp_replace(v_acct, '[^0-9]', '', 'g')) < 6 then raise exception '환불받을 계좌(은행 · 계좌번호 · 예금주)를 적어 주세요.' using errcode = '22023'; end if;
  update public.payments set refund_account = v_acct, updated_at = now() where booking_id = p_booking_id and status = 'REFUND_PENDING';
  if not found then raise exception '환불 대기 중인 예매만 계좌를 고칠 수 있어요.' using errcode = 'P0001'; end if;
end;
$$;

-- 운영진: 잘못 누른 '입금 확인' 되돌리기(입장한 티켓이 없을 때). 예매는 입금 대기로, 티켓은 무효
create or replace function public.undo_confirm_deposit(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_i public.booking_items; v_title text;
begin
  perform public._require_login();
  select * into v_b from public.bookings where id = p_booking_id;
  if not found then raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002'; end if;
  perform public._require_active_manager((select club_id from public.events where id = v_b.event_id), '예매를 찾지 못했습니다.');
  select * into v_i from public.booking_items where booking_id = p_booking_id;
  perform 1 from public.ticket_types where id = v_i.ticket_type_id for update;  -- 잠금 순서: 티켓 종류 → 예매 → 티켓
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.status <> 'CONFIRMED' or v_b.total_amount_krw = 0 or v_b.channel <> 'ONLINE' then raise exception '입금 확인된 유료 사전 예매만 되돌릴 수 있어요.' using errcode = 'P0001'; end if;
  perform 1 from public.tickets where booking_id = p_booking_id order by id for update;
  if exists (select 1 from public.tickets where booking_id = p_booking_id and status = 'CHECKED_IN') then
    raise exception '이미 입장한 티켓이 있어 되돌릴 수 없어요.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.payments where booking_id = p_booking_id and status = 'SUCCEEDED') then
    raise exception '환불이 진행 중인 예매는 되돌릴 수 없어요.' using errcode = 'P0001';
  end if;
  update public.tickets set status = 'CANCELLED', updated_at = now() where booking_id = p_booking_id and status = 'ISSUED';
  update public.qr_credentials set revoked_at = now() where revoked_at is null and ticket_id in (select id from public.tickets where booking_id = p_booking_id);
  update public.bookings set status = 'PENDING_PAYMENT', confirmed_at = null,
    expires_at = greatest(expires_at, least(now() + interval '24 hours', public._event_end((select starts_at from public.events where id = v_b.event_id), (select ends_at from public.events where id = v_b.event_id)))),
    updated_at = now() where id = p_booking_id;
  update public.payments set status = 'PENDING', approved_at = null, confirmed_by = null, updated_at = now() where booking_id = p_booking_id and status = 'SUCCEEDED';
  update public.ticket_types set sold_quantity = sold_quantity - v_i.quantity, reserved_quantity = reserved_quantity + v_i.quantity, updated_at = now()
  where id = v_i.ticket_type_id;
  select title into v_title from public.events where id = v_b.event_id;
  perform public._notify(v_b.user_id, v_b.event_id, 'DEPOSIT_UNCONFIRMED', '[' || v_title || '] 입금 확인이 취소됐어요(운영진 확인 착오). 입금했다면 주최 동아리에 문의해 주세요.',
    'deposit-undo-' || p_booking_id || '-' || gen_random_uuid());
  perform public._audit(v_b.event_id, 'UNDO_CONFIRM_DEPOSIT', 'booking', p_booking_id);
end;
$$;

-- 운영진: 기한이 지나 만료된 뒤 들어온 입금을 확인(자리가 남아 있고 공연이 끝나기 전)
create or replace function public.confirm_late_deposit(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings; v_i public.booking_items; v_tt public.ticket_types; v_e public.events;
begin
  perform public._require_login();
  select * into v_b from public.bookings where id = p_booking_id;
  if not found then raise exception '예매를 찾지 못했습니다.' using errcode = 'P0002'; end if;
  select * into v_e from public.events where id = v_b.event_id;
  perform public._require_active_manager(v_e.club_id, '예매를 찾지 못했습니다.');
  select * into v_i from public.booking_items where booking_id = p_booking_id;
  select * into v_tt from public.ticket_types where id = v_i.ticket_type_id for update;
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.status <> 'EXPIRED' then raise exception '만료된 예매만 늦은 입금으로 확인할 수 있어요.' using errcode = 'P0001'; end if;
  if v_e.status = 'CANCELLED' or public._event_end(v_e.starts_at, v_e.ends_at) <= now() then
    raise exception '취소됐거나 끝난 공연이에요. 입금액은 돌려주세요.' using errcode = 'P0001';
  end if;
  if v_tt.capacity - v_tt.reserved_quantity - v_tt.sold_quantity < v_i.quantity then
    raise exception '남은 자리가 없어 확인할 수 없어요. 입금액은 돌려주세요.' using errcode = 'P0001';
  end if;
  update public.ticket_types set reserved_quantity = reserved_quantity + v_i.quantity, updated_at = now() where id = v_tt.id;
  update public.bookings set status = 'PENDING_PAYMENT', updated_at = now() where id = p_booking_id;
  update public.payments set status = 'PENDING', failure_code = null, updated_at = now() where booking_id = p_booking_id and status = 'FAILED' and failure_code = 'EXPIRED';
  perform public._confirm_booking(p_booking_id, auth.uid());
  perform public._audit(v_e.id, 'CONFIRM_LATE_DEPOSIT', 'booking', p_booking_id);
end;
$$;

-- 예매자: 이 티켓의 QR을 모두 무효로(휴대폰 분실·QR 사진이 퍼졌을 때). 다음에 열면 새 QR
create or replace function public.revoke_ticket_qrs(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_login();
  if not exists (select 1 from public.tickets where id = p_ticket_id and user_id = auth.uid()) then raise exception '티켓을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  update public.qr_credentials set revoked_at = now() where ticket_id = p_ticket_id and revoked_at is null;
end;
$$;

-- 운영진: 잘못 누른 입장 처리 되돌리기(공연이 끝나기 전)
create or replace function public.undo_check_in(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_t public.tickets;
begin
  perform public._require_active_profile();
  select * into v_t from public.tickets where id = p_ticket_id for update;
  if not found or not public.is_event_staff(v_t.event_id) then raise exception '티켓을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  if v_t.status <> 'CHECKED_IN' then raise exception '입장 처리된 티켓이 아니에요.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.events where id = v_t.event_id and public._event_end(starts_at, ends_at) <= now()) then
    raise exception '끝난 공연의 입장 기록은 바꿀 수 없어요.' using errcode = 'P0001';
  end if;
  update public.tickets set status = 'ISSUED', checked_in_at = null, checked_in_by = null, updated_at = now() where id = p_ticket_id;
  perform public._audit(v_t.event_id, 'UNDO_CHECK_IN', 'ticket', p_ticket_id);
end;
$$;

-- 회장 넘기기: 회장이 다른 부원(운영진 포함)에게 회장을 넘기고 자신은 운영진이 된다(회장 계정 분실·교체 대비)
create or replace function public.transfer_ownership(p_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m public.club_memberships; v_me public.club_memberships; v_name text;
begin
  perform public._require_active_profile();
  select * into v_m from public.club_memberships where id = p_membership_id for update;
  if not found then raise exception '부원을 찾지 못했습니다.' using errcode = 'P0002'; end if;
  select * into v_me from public.club_memberships where club_id = v_m.club_id and user_id = auth.uid() and role = 'OWNER' and status = 'ACTIVE' for update;
  if not found then raise exception '회장만 넘길 수 있습니다.' using errcode = '42501'; end if;
  if v_m.id = v_me.id then raise exception '이미 회장이에요.' using errcode = 'P0001'; end if;
  if v_m.status <> 'ACTIVE' then raise exception '가입한 부원에게만 넘길 수 있어요.' using errcode = 'P0001'; end if;
  update public.club_memberships set role = 'MANAGER', updated_at = now() where id = v_me.id;
  update public.club_memberships set role = 'OWNER', updated_at = now() where id = v_m.id;
  select name into v_name from public.clubs where id = v_m.club_id;
  perform public._notify(v_m.user_id, null, 'CLUB_ROLE', v_name || ' 회장이 됐어요.', 'owner-' || v_m.id || '-' || gen_random_uuid());
end;
$$;

-- 앱을 열 때 한 번 부르는 '홈 신호'. 화면은 prompt를 보고 바로 띄울 창을 정한다.
--   TICKET_NOW  : 3시간 안에 시작하거나 진행 중(시작 + 6시간까지)인 공연의 미사용 티켓 → 티켓 QR 바로 열기
--   STAFF_TODAY : 내가 운영하는 공연이 24시간 안에 있음 → 입장 관리 바로 가기
--   PAYMENT_DUE : 입금 기한이 24시간 안에 끝나는 입금 대기 예매 → 계좌 안내
--   EVENT_CHANGED: 예매한 공연의 일시·장소가 바뀜(가장 먼저) → 유지 또는 취소·환불 요청
-- 그 밖에 배지·배너용 숫자(안 읽은 알림, 입금 대기, 가입 신청, 받은 교류 신청)를 함께 준다. 비로그인이면 {"signed_in": false}
create or replace function public.my_home_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_ticket jsonb; v_staff jsonb; v_pay jsonb; v_changed jsonb; v_refund jsonb; v_prompt text;
begin
  if v_uid is null then return jsonb_build_object('signed_in', false); end if;
  select to_jsonb(x) into v_ticket from (
    select t.id as ticket_id, e.id as event_id, e.title, e.starts_at, e.venue_name, t.entry_number,
           (select count(*) from public.tickets t2 where t2.event_id = e.id and t2.user_id = v_uid and t2.status = 'ISSUED') as ticket_count
    from public.tickets t join public.events e on e.id = t.event_id join public.bookings bk on bk.id = t.booking_id and bk.channel = 'ONLINE'
    where t.user_id = v_uid and t.status = 'ISSUED' and e.status in ('PUBLISHED', 'DRAFT', 'ENDED')
      and e.starts_at <= now() + interval '24 hours' and public._event_end(e.starts_at, e.ends_at) > now()  -- 공연이 끝날 때까지
    order by e.starts_at, t.entry_number limit 1) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at), '[]'::jsonb) into v_staff from (
    select e.id as event_id, e.title, e.starts_at,
           (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'CHECKED_IN') as checked_in,
           (select count(*) from public.tickets t where t.event_id = e.id and t.status <> 'CANCELLED') as issued,
           (select count(*) from public.bookings b join public.payments p on p.booking_id = b.id and p.status = 'PENDING'
             where b.event_id = e.id and b.status = 'PENDING_PAYMENT'
               and public._hold_until(b.expires_at, p.depositor_notified_at, public._event_end(e.starts_at, e.ends_at)) > now()) as pending_deposits
    from public.events e
    where e.status = 'PUBLISHED' and public.is_club_manager(e.club_id)
      and exists (select 1 from public.clubs c where c.id = e.club_id and c.status = 'ACTIVE')
      and exists (select 1 from public.profiles pr where pr.id = v_uid and pr.status = 'ACTIVE')
      and e.starts_at <= now() + interval '24 hours' and public._event_end(e.starts_at, e.ends_at) > now()) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.expires_at), '[]'::jsonb) into v_pay from (
    select b.id as booking_id, e.id as event_id, e.title, b.total_amount_krw, b.expires_at,
           e.bank_name, e.account_number, e.account_holder, p.depositor_name, p.depositor_notified_at
    from public.bookings b join public.events e on e.id = b.event_id join public.payments p on p.booking_id = b.id and p.status = 'PENDING'
    where b.user_id = v_uid and b.status = 'PENDING_PAYMENT'
      and public._hold_until(b.expires_at, p.depositor_notified_at, public._event_end(e.starts_at, e.ends_at)) > now()
    order by b.expires_at limit 20) x;
  -- 일정·장소가 바뀐 뒤 아직 '유지'를 고르지 않은 내 예매(공연 시작 전까지)
  select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at), '[]'::jsonb) into v_changed from (
    select b.id as booking_id, e.id as event_id, e.title, e.starts_at, e.ends_at, e.venue_name, b.status, e.schedule_changed_at,
           e.previous_starts_at, e.previous_venue_name
    from public.bookings b join public.events e on e.id = b.event_id
    where b.user_id = v_uid and b.status in ('PENDING_PAYMENT', 'CONFIRMED') and e.status <> 'CANCELLED'
      and e.schedule_changed_at > coalesce(b.change_ack_at, b.created_at) and e.starts_at > now()) x;
  -- 운영진: 처리할 환불 요청
  select coalesce(jsonb_agg(to_jsonb(x) order by x.refund_requested_at), '[]'::jsonb) into v_refund from (
    select b.id as booking_id, e.id as event_id, e.club_id, e.title, b.total_amount_krw, p.refund_requested_at
    from public.payments p join public.bookings b on b.id = p.booking_id join public.events e on e.id = b.event_id
    where p.status = 'REFUND_PENDING' and public.is_club_manager(e.club_id)) x;
  v_prompt := case
    when jsonb_array_length(v_changed) > 0 then 'EVENT_CHANGED'
    when v_ticket is not null and (v_ticket ->> 'starts_at')::timestamptz <= now() + interval '3 hours' then 'TICKET_NOW'
    when jsonb_array_length(v_staff) > 0 then 'STAFF_TODAY'
    when exists (select 1 from jsonb_array_elements(v_pay) p where (p ->> 'expires_at')::timestamptz <= now() + interval '24 hours'
                 and p ->> 'depositor_notified_at' is null) then 'PAYMENT_DUE'
  end;
  return jsonb_build_object(
    'signed_in', true, 'now', now(), 'prompt', v_prompt,
    'next_ticket', v_ticket, 'staff_events', v_staff, 'pending_payments', v_pay,
    'changed_bookings', v_changed, 'refund_requests', v_refund,
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
grant execute on function public.record_onsite_sale(uuid, integer, text, text), public.cancel_onsite_sale(uuid) to authenticated;
grant execute on function public.mark_deposit_sent(uuid), public.ack_event_change(uuid), public.request_refund(uuid, text),
  public.mark_refunded(uuid), public.update_depositor_name(uuid, text), public.update_refund_account(uuid, text),
  public.undo_confirm_deposit(uuid), public.confirm_late_deposit(uuid), public.undo_check_in(uuid), public.transfer_ownership(uuid),
  public.revoke_ticket_qrs(uuid) to authenticated;
