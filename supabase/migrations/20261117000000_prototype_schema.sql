-- Bandy 프로토타입 스키마 (Supabase)
-- 기준: 2026-10-07 DB 설계(docs/db-design.md) + 2026-11-01 동아리 회의 결정
--   - 결제: 카드 결제 없이 입금자명 + 주최 동아리의 '입금 확인'
--   - 12월 전 필수: 동아리 찾기, 교류 신청, 공연 예매(손보기), QR 입장
--   - 동아리 인증: 운영자 수동 승인
--   - 채팅 대신 오픈채팅 링크를 교류가 연결된 동아리에게만 공개
-- 클라이언트는 anon / authenticated 키로 접근하고, 상태를 바꾸는 쓰기는 아래 RPC 함수로만 한다.

-- ───────────────────────── 타입 ─────────────────────────
create type public.club_verification as enum ('pending', 'approved', 'rejected');
create type public.member_role as enum ('owner', 'manager');
create type public.event_status as enum ('draft', 'published', 'closed');
create type public.booking_status as enum ('pending', 'confirmed', 'cancelled');
create type public.exchange_kind as enum ('joint_show', 'practice', 'watch_swap');
create type public.exchange_status as enum ('pending', 'accepted', 'rejected', 'cancelled');

-- ───────────────────────── 테이블 ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  school text not null default '',
  genre text not null default '',
  region text not null default '',
  instagram text not null default '',
  introduction text not null default '',
  exchange_open boolean not null default false,
  verification public.club_verification not null default 'pending',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 오픈채팅 링크는 공개 프로필과 분리한다. 같은 동아리 회원과 교류가 수락된 동아리만 본다.
create table public.club_private (
  club_id uuid primary key references public.clubs (id) on delete cascade,
  open_chat_url text not null default ''
);

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'manager',
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_idx on public.club_members (user_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  starts_at timestamptz,
  venue text not null default '',
  address text not null default '',
  price_krw integer not null default 0 check (price_krw >= 0),
  walk_in_price_krw integer check (walk_in_price_krw >= 0),
  capacity integer check (capacity > 0),
  bank_name text not null default '',
  account_number text not null default '',
  account_holder text not null default '',
  refund_policy text not null default '',
  contact_phone text not null default '',
  poster_url text not null default '',
  status public.event_status not null default 'draft',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 공개하려면 일시·장소가 있어야 하고, 유료면 입금 계좌가 있어야 한다.
  constraint events_publishable check (
    status = 'draft'
    or (
      starts_at is not null
      and length(btrim(venue)) > 0
      and (price_krw = 0 or length(btrim(account_number)) > 0)
    )
  )
);
create index events_club_idx on public.events (club_id);
create index events_status_starts_idx on public.events (status, starts_at);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  user_id uuid not null references public.profiles (id),
  depositor_name text not null check (length(btrim(depositor_name)) > 0),
  quantity integer not null check (quantity between 1 and 10),
  unit_price_krw integer not null check (unit_price_krw >= 0),
  total_amount_krw integer not null,
  status public.booking_status not null default 'pending',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  constraint bookings_total check (total_amount_krw = unit_price_krw * quantity),
  constraint bookings_confirmed_fields check (
    (status = 'confirmed') = (confirmed_at is not null and confirmed_by is not null)
  ),
  constraint bookings_cancelled_fields check ((status = 'cancelled') = (cancelled_at is not null))
);
create index bookings_event_idx on public.bookings (event_id, status);
create index bookings_user_idx on public.bookings (user_id);

-- 입금 확인 때 수량만큼 발급. 개인 티켓과 동아리 명단이 이 행을 같이 본다.
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  event_id uuid not null references public.events (id),
  user_id uuid not null references public.profiles (id),
  seq integer not null check (seq > 0),
  entry_number integer not null check (entry_number > 0),
  qr_token uuid not null unique default gen_random_uuid(),
  issued_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id),
  unique (booking_id, seq),
  unique (event_id, entry_number),
  constraint tickets_checkin_fields check ((checked_in_at is null) = (checked_in_by is null))
);
create index tickets_user_idx on public.tickets (user_id);

create table public.exchange_requests (
  id uuid primary key default gen_random_uuid(),
  from_club_id uuid not null references public.clubs (id) on delete cascade,
  to_club_id uuid not null references public.clubs (id) on delete cascade,
  kind public.exchange_kind not null,
  message text not null default '' check (length(message) <= 300),
  status public.exchange_status not null default 'pending',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  responded_by uuid references public.profiles (id),
  responded_at timestamptz,
  check (from_club_id <> to_club_id)
);
create unique index exchange_requests_one_pending
  on public.exchange_requests (from_club_id, to_club_id)
  where status = 'pending';
create index exchange_requests_to_idx on public.exchange_requests (to_club_id, status);

-- ───────────────────────── updated_at ─────────────────────────
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger clubs_touch before update on public.clubs
  for each row execute function public.touch_updated_at();
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- ───────────────────────── 가입 시 프로필 생성 ─────────────────────────
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── 권한 판정 함수 (RLS에서 사용) ─────────────────────────
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create function public.is_club_member(p_club_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id and m.user_id = auth.uid()
  );
$$;

create function public.is_event_staff(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    join public.club_members m on m.club_id = e.club_id
    where e.id = p_event_id and m.user_id = auth.uid()
  );
$$;

-- 내가 속한 동아리와 p_club_id 사이에 수락된 교류가 있는가
create function public.has_exchange_with(p_club_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.exchange_requests r
    join public.club_members m
      on m.user_id = auth.uid()
     and m.club_id in (r.from_club_id, r.to_club_id)
    where r.status = 'accepted'
      and p_club_id in (r.from_club_id, r.to_club_id)
      and m.club_id <> p_club_id
  );
$$;

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_private enable row level security;
alter table public.club_members enable row level security;
alter table public.events enable row level security;
alter table public.bookings enable row level security;
alter table public.tickets enable row level security;
alter table public.exchange_requests enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy clubs_select on public.clubs for select to anon, authenticated
  using (verification = 'approved' or public.is_club_member(id) or public.is_admin());
create policy clubs_update_member on public.clubs for update to authenticated
  using (public.is_club_member(id)) with check (public.is_club_member(id));

create policy club_private_select on public.club_private for select to authenticated
  using (public.is_club_member(club_id) or public.has_exchange_with(club_id));
create policy club_private_update_member on public.club_private for update to authenticated
  using (public.is_club_member(club_id)) with check (public.is_club_member(club_id));

create policy club_members_select on public.club_members for select to authenticated
  using (user_id = auth.uid() or public.is_club_member(club_id));

create policy events_select on public.events for select to anon, authenticated
  using (
    (status in ('published', 'closed')
      and exists (select 1 from public.clubs c where c.id = club_id and c.verification = 'approved'))
    or public.is_club_member(club_id)
  );
create policy events_insert_member on public.events for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_club_member(club_id)
    and exists (select 1 from public.clubs c where c.id = club_id and c.verification = 'approved')
  );
create policy events_update_member on public.events for update to authenticated
  using (public.is_club_member(club_id)) with check (public.is_club_member(club_id));
create policy events_delete_draft on public.events for delete to authenticated
  using (public.is_club_member(club_id) and status = 'draft');

create policy bookings_select on public.bookings for select to authenticated
  using (user_id = auth.uid() or public.is_event_staff(event_id));

create policy tickets_select on public.tickets for select to authenticated
  using (user_id = auth.uid() or public.is_event_staff(event_id));

create policy exchange_select on public.exchange_requests for select to authenticated
  using (public.is_club_member(from_club_id) or public.is_club_member(to_club_id));

-- Supabase는 public 테이블에 anon/authenticated 전체 권한을 기본으로 준다. 필요한 것만 다시 준다.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.clubs, public.events to anon;
grant select on public.profiles, public.clubs, public.club_private, public.club_members,
  public.events, public.bookings, public.tickets, public.exchange_requests to authenticated;

grant update (display_name) on public.profiles to authenticated;
grant update (name, school, genre, region, instagram, introduction, exchange_open)
  on public.clubs to authenticated;
grant update (open_chat_url) on public.club_private to authenticated;
grant insert (club_id, title, description, starts_at, venue, address, price_krw, walk_in_price_krw,
  capacity, bank_name, account_number, account_holder, refund_policy, contact_phone, poster_url,
  status, created_by) on public.events to authenticated;
grant update (title, description, starts_at, venue, address, price_krw, walk_in_price_krw,
  capacity, bank_name, account_number, account_holder, refund_policy, contact_phone, poster_url,
  status) on public.events to authenticated;
grant delete on public.events to authenticated;

-- ───────────────────────── RPC: 동아리 ─────────────────────────
create function public.create_club(
  p_name text,
  p_school text default '',
  p_genre text default '',
  p_region text default '',
  p_instagram text default '',
  p_introduction text default '',
  p_open_chat_url text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_club uuid;
begin
  if v_uid is null then
    raise exception 'login required' using errcode = '28000';
  end if;
  insert into public.clubs (name, school, genre, region, instagram, introduction, created_by)
  values (btrim(p_name), btrim(p_school), btrim(p_genre), btrim(p_region), btrim(p_instagram),
          p_introduction, v_uid)
  returning id into v_club;
  insert into public.club_members (club_id, user_id, role) values (v_club, v_uid, 'owner');
  insert into public.club_private (club_id, open_chat_url) values (v_club, btrim(p_open_chat_url));
  return v_club;
end;
$$;

create function public.set_club_verification(p_club_id uuid, p_status public.club_verification)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.clubs set verification = p_status where id = p_club_id;
  if not found then
    raise exception 'club not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ───────────────────────── RPC: 예매 · 입금 확인 ─────────────────────────
create function public.create_booking(p_event_id uuid, p_depositor_name text, p_quantity integer)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_held integer;
  v_booking public.bookings;
begin
  if v_uid is null then
    raise exception 'login required' using errcode = '28000';
  end if;

  -- 같은 공연의 정원 계산이 겹치지 않도록 공연 행을 잠근다.
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.status <> 'published'
     or not exists (select 1 from public.clubs c where c.id = v_event.club_id and c.verification = 'approved') then
    raise exception 'event not open for booking' using errcode = 'P0001';
  end if;

  if v_event.capacity is not null then
    select coalesce(sum(quantity), 0) into v_held
    from public.bookings
    where event_id = p_event_id and status in ('pending', 'confirmed');
    if v_held + p_quantity > v_event.capacity then
      raise exception 'sold out' using errcode = 'P0001';
    end if;
  end if;

  insert into public.bookings (event_id, user_id, depositor_name, quantity, unit_price_krw, total_amount_krw)
  values (p_event_id, v_uid, btrim(p_depositor_name), p_quantity, v_event.price_krw,
          v_event.price_krw * p_quantity)
  returning * into v_booking;
  return v_booking;
end;
$$;

-- 주최 동아리 운영진이 입금을 확인하면 예매 확정 + 수량만큼 티켓 발급(입장번호 순서대로).
-- 이미 확정된 예매는 그대로 둔다(중복 클릭 안전).
create function public.confirm_booking(p_booking_id uuid)
returns setof public.tickets
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_next integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found or not public.is_event_staff(v_booking.event_id) then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  -- 잠금 순서: 공연 → 예매 (create_booking과 같은 순서)
  perform 1 from public.events where id = v_booking.event_id for update;
  select * into v_booking from public.bookings where id = p_booking_id for update;

  if v_booking.status = 'pending' then
    select coalesce(max(entry_number), 0) + 1 into v_next
    from public.tickets where event_id = v_booking.event_id;

    update public.bookings
    set status = 'confirmed', confirmed_at = now(), confirmed_by = v_uid
    where id = p_booking_id;

    insert into public.tickets (booking_id, event_id, user_id, seq, entry_number)
    select v_booking.id, v_booking.event_id, v_booking.user_id, g, v_next + g - 1
    from generate_series(1, v_booking.quantity) as g;
  elsif v_booking.status = 'cancelled' then
    raise exception 'booking cancelled' using errcode = 'P0001';
  end if;

  return query select * from public.tickets where booking_id = p_booking_id order by seq;
end;
$$;

-- 입금 전 예매만 취소한다(본인 또는 주최 동아리). 확정 후 환불은 정책이 정해진 뒤에.
create function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or not (v_booking.user_id = auth.uid() or public.is_event_staff(v_booking.event_id)) then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'pending' then
    raise exception 'only pending bookings can be cancelled' using errcode = 'P0001';
  end if;
  update public.bookings set status = 'cancelled', cancelled_at = now() where id = p_booking_id;
end;
$$;

-- ───────────────────────── RPC: QR 입장 ─────────────────────────
-- 결과: valid(이번에 입장 처리) / already_checked_in / invalid(다른 공연·없는 QR)
create function public.check_in(p_event_id uuid, p_qr_token uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ticket public.tickets;
begin
  if not public.is_event_staff(p_event_id) then
    raise exception 'not event staff' using errcode = '42501';
  end if;

  update public.tickets
  set checked_in_at = now(), checked_in_by = auth.uid()
  where event_id = p_event_id and qr_token = p_qr_token and checked_in_at is null
  returning * into v_ticket;

  if found then
    return jsonb_build_object('result', 'valid', 'ticket_id', v_ticket.id,
      'entry_number', v_ticket.entry_number, 'checked_in_at', v_ticket.checked_in_at);
  end if;

  select * into v_ticket from public.tickets where event_id = p_event_id and qr_token = p_qr_token;
  if found then
    return jsonb_build_object('result', 'already_checked_in', 'ticket_id', v_ticket.id,
      'entry_number', v_ticket.entry_number, 'checked_in_at', v_ticket.checked_in_at);
  end if;
  return jsonb_build_object('result', 'invalid');
end;
$$;

-- ───────────────────────── RPC: 교류 신청 ─────────────────────────
create function public.request_exchange(
  p_from_club_id uuid, p_to_club_id uuid, p_kind public.exchange_kind, p_message text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.is_club_member(p_from_club_id) then
    raise exception 'not a member of the requesting club' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clubs where id = p_from_club_id and verification = 'approved') then
    raise exception 'requesting club is not approved' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.clubs where id = p_to_club_id
                 and verification = 'approved' and exchange_open) then
    raise exception 'target club is not open for exchange' using errcode = 'P0001';
  end if;
  insert into public.exchange_requests (from_club_id, to_club_id, kind, message, created_by)
  values (p_from_club_id, p_to_club_id, p_kind, coalesce(p_message, ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create function public.respond_exchange(p_request_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.exchange_requests;
begin
  select * into v_req from public.exchange_requests where id = p_request_id for update;
  if not found or not public.is_club_member(v_req.to_club_id) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request already handled' using errcode = 'P0001';
  end if;
  update public.exchange_requests
  set status = case when p_accept then 'accepted'::public.exchange_status else 'rejected'::public.exchange_status end,
      responded_by = auth.uid(), responded_at = now()
  where id = p_request_id;
end;
$$;

create function public.cancel_exchange(p_request_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.exchange_requests;
begin
  select * into v_req from public.exchange_requests where id = p_request_id for update;
  if not found or not public.is_club_member(v_req.from_club_id) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request already handled' using errcode = 'P0001';
  end if;
  update public.exchange_requests set status = 'cancelled' where id = p_request_id;
end;
$$;

-- ───────────────────────── 피드: 교류 연결된 동아리 공연을 위로 ─────────────────────────
create function public.feed_events()
returns table (event_id uuid, club_id uuid, connected boolean, starts_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.club_id, public.has_exchange_with(e.club_id), e.starts_at
  from public.events e
  where e.status = 'published'
  order by public.has_exchange_with(e.club_id) desc, e.starts_at nulls last;
$$;

-- ───────────────────────── 함수 실행 권한 ─────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin(), public.is_club_member(uuid), public.is_event_staff(uuid),
  public.has_exchange_with(uuid), public.feed_events() to anon, authenticated;
grant execute on function
  public.create_club(text, text, text, text, text, text, text),
  public.set_club_verification(uuid, public.club_verification),
  public.create_booking(uuid, text, integer),
  public.confirm_booking(uuid),
  public.cancel_booking(uuid),
  public.check_in(uuid, uuid),
  public.request_exchange(uuid, uuid, public.exchange_kind, text),
  public.respond_exchange(uuid, boolean),
  public.cancel_exchange(uuid)
to authenticated;
