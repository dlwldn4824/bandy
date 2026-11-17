// 프로토타입 데이터 계층. 지금은 브라우저 메모리 + localStorage.
// 함수 하나가 나중의 Supabase RPC(DB 함수) 하나에 대응한다. 규칙은 supabase/reference SQL에서 검증한 것과 같다.
// Supabase 연결 때는 이 파일의 함수 본문만 supabase.rpc(...) / select 호출로 바꾸면 된다.
import {
  Booking, Club, Db, EventRow, ExchangeKind, ExchangeRequest, QrCredential, Ticket, TicketType, Uuid,
} from './types'
import { seedDb } from './seed'

export class BandyError extends Error {}

const STORAGE_KEY = 'bandy-prototype-v3'
const BOOKING_HOLD_DAYS = 3 // [미정] 입금 대기 기간. 11/1 기준 팀 결정 전 임시값
const MAX_QUANTITY = 10 // [미정] 1회 최대 구매 수량

let counter = 0
export function uid(prefix: string) {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 7)}`
}

function now() {
  return new Date().toISOString()
}

// 프로토타입용 간단 해시(실제로는 서버에서 SHA-256 등으로 저장)
function fakeHash(text: string) {
  let h = 0
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0
  return `h${(h >>> 0).toString(16)}`
}

// ───────────── 저장 ─────────────
export function loadDb(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    /* 저장소를 못 쓰면 처음 데이터로 */
  }
  return initialDb()
}

export function saveDb(db: Db) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    /* 비공개 창 등에서는 저장 없이 진행 */
  }
}

export function initialDb(): Db {
  const db = seedDb()
  // 시연 상태: 관객은 연합 공연 2장 입금 확인 완료, 이준은 입금 대기
  const b1 = createBooking(db, 'u-audience', 'tt-rexa', 2, '김관객')
  confirmDeposit(db, 'u-rexa', b1.id)
  createBooking(db, 'u-jun', 'tt-rexa', 1, '이준')
  createBooking(db, 'u-audience', 'tt-sound', 1, '김관객')
  return db
}

// ───────────── 권한 판정 ─────────────
export function managerClubIds(db: Db, userId: Uuid | null) {
  if (!userId) return []
  return db.club_memberships
    .filter((m) => m.user_id === userId && m.status === 'ACTIVE' && (m.role === 'OWNER' || m.role === 'MANAGER'))
    .map((m) => m.club_id)
}

export function isClubManager(db: Db, userId: Uuid | null, clubId: Uuid) {
  return managerClubIds(db, userId).includes(clubId)
}

export function isEventStaff(db: Db, userId: Uuid | null, eventId: Uuid) {
  const event = db.events.find((e) => e.id === eventId)
  if (!event || !userId) return false
  return isClubManager(db, userId, event.club_id)
    || db.event_staff.some((s) => s.event_id === eventId && s.user_id === userId && s.status === 'ACTIVE')
}

function isAdmin(db: Db, userId: Uuid | null) {
  return db.profiles.some((p) => p.id === userId && p.is_admin)
}

// 내 동아리와 clubId 사이에 수락된 교류가 있는가 → 오픈채팅 링크 공개
export function hasExchangeWith(db: Db, userId: Uuid | null, clubId: Uuid) {
  const mine = managerClubIds(db, userId)
  return db.exchange_requests.some((r) => r.status === 'ACCEPTED'
    && ((r.from_club_id === clubId && mine.includes(r.to_club_id))
      || (r.to_club_id === clubId && mine.includes(r.from_club_id))))
}

export function canSeeOpenChat(db: Db, userId: Uuid | null, clubId: Uuid) {
  return isClubManager(db, userId, clubId) || hasExchangeWith(db, userId, clubId)
}

// ───────────── 조회 ─────────────
export function publicClubs(db: Db) {
  return db.clubs.filter((c) => c.status === 'ACTIVE')
}

export function publicEvents(db: Db) {
  const active = new Set(publicClubs(db).map((c) => c.id))
  return db.events.filter((e) => e.status === 'PUBLISHED' && active.has(e.club_id))
}

// 교류로 연결된 동아리 공연을 위로, 그다음 날짜순
export function feedEvents(db: Db, userId: Uuid | null) {
  return [...publicEvents(db)].sort((a, b) => {
    const ca = hasExchangeWith(db, userId, a.club_id) ? 0 : 1
    const cb = hasExchangeWith(db, userId, b.club_id) ? 0 : 1
    return ca - cb || a.starts_at.localeCompare(b.starts_at)
  })
}

export function ticketTypesOf(db: Db, eventId: Uuid) {
  return db.ticket_types.filter((t) => t.event_id === eventId && t.status === 'ACTIVE')
}

export function remaining(t: TicketType) {
  return t.capacity - t.reserved_quantity - t.sold_quantity
}

export function minPrice(db: Db, eventId: Uuid) {
  const prices = ticketTypesOf(db, eventId).map((t) => t.price_krw)
  return prices.length ? Math.min(...prices) : 0
}

export function qrOf(db: Db, ticketId: Uuid): QrCredential | undefined {
  return db.qr_credentials.find((q) => q.ticket_id === ticketId && !q.revoked_at)
}

// ───────────── 동아리 ─────────────
export function createClub(db: Db, userId: Uuid | null, input: {
  name: string; school: string; genre: string; region: string; introduction: string
  sns_url: string; open_chat_url: string; exchange_open: boolean
}): Club {
  if (!userId) throw new BandyError('로그인이 필요합니다.')
  const name = input.name.trim()
  if (!name) throw new BandyError('동아리 이름을 입력하세요.')
  if (db.clubs.some((c) => c.name === name)) throw new BandyError('이미 등록된 동아리 이름입니다.')
  const club: Club = {
    id: uid('club'), name, school: input.school.trim(), genre: input.genre.trim(), region: input.region.trim(),
    introduction: input.introduction.trim(), city: '서울', profile_path: null,
    sns_url: input.sns_url.trim() || null, open_chat_url: input.open_chat_url.trim(),
    exchange_open: input.exchange_open, status: 'PENDING', created_at: now(), updated_at: now(),
  }
  db.clubs.push(club)
  db.club_memberships.push({
    id: uid('m'), user_id: userId, club_id: club.id, role: 'OWNER', status: 'ACTIVE', created_at: now(), updated_at: now(),
  })
  return club
}

export function setClubStatus(db: Db, userId: Uuid | null, clubId: Uuid, status: Club['status']) {
  if (!isAdmin(db, userId)) throw new BandyError('운영자만 승인할 수 있습니다.')
  const club = db.clubs.find((c) => c.id === clubId)
  if (!club) throw new BandyError('동아리를 찾지 못했습니다.')
  club.status = status
  club.updated_at = now()
  const owner = db.club_memberships.find((m) => m.club_id === clubId && m.role === 'OWNER')
  if (owner) {
    notify(db, owner.user_id, null, 'CLUB_STATUS', status === 'ACTIVE'
      ? `${club.name} 동아리가 승인됐어요. 이제 공연을 올리고 교류를 신청할 수 있어요.`
      : `${club.name} 동아리 승인이 거절됐어요.`, `club-status-${clubId}-${status}`)
  }
}

export function updateClub(db: Db, userId: Uuid | null, clubId: Uuid, patch: Partial<Pick<Club,
  'name' | 'introduction' | 'school' | 'genre' | 'region' | 'sns_url' | 'open_chat_url' | 'exchange_open' | 'profile_path'>>) {
  if (patch.name !== undefined) {
    patch.name = patch.name.trim()
    if (!patch.name) throw new BandyError('동아리 이름을 입력하세요.')
    if (db.clubs.some((c) => c.id !== clubId && c.name === patch.name)) throw new BandyError('이미 등록된 동아리 이름입니다.')
  }
  if (!isClubManager(db, userId, clubId)) throw new BandyError('동아리 운영진만 수정할 수 있습니다.')
  const club = db.clubs.find((c) => c.id === clubId)!
  Object.assign(club, patch, { updated_at: now() })
}

// ───────────── 공연 ─────────────
export function createEvent(db: Db, userId: Uuid | null, clubId: Uuid, input: {
  title: string; category: EventRow['category']; starts_at: string; venue_name: string; address: string
  description: string; price_krw: number; capacity: number; account_number: string; bank_name: string
  publish: boolean; poster_path?: string | null
}): EventRow {
  if (!isClubManager(db, userId, clubId)) throw new BandyError('동아리 운영진만 공연을 올릴 수 있습니다.')
  const club = db.clubs.find((c) => c.id === clubId)!
  if (club.status !== 'ACTIVE') throw new BandyError('승인된 동아리만 공연을 올릴 수 있습니다.')
  if (!input.title.trim()) throw new BandyError('공연명을 입력하세요.')
  if (!input.starts_at) throw new BandyError('일시를 입력하세요.')
  if (input.publish && !input.venue_name.trim()) throw new BandyError('공개하려면 장소가 필요합니다.')
  if (input.publish && input.price_krw > 0 && !input.account_number.trim()) {
    throw new BandyError('유료 공연은 입금 계좌가 필요합니다.')
  }
  if (input.capacity <= 0) throw new BandyError('정원은 1 이상이어야 합니다.')
  if (input.price_krw < 0) throw new BandyError('가격은 0원 이상이어야 합니다.')
  // 지도 좌표: 실제로는 카카오 Local로 주소 → 좌표 변환. 프로토타입은 노원구 근처 임의 좌표
  const event: EventRow = {
    id: uid('ev'), club_id: clubId, created_by: userId!, title: input.title.trim(), description: input.description.trim(),
    category: input.category, starts_at: new Date(input.starts_at).toISOString(), ends_at: null,
    admission_starts_at: null, admission_ends_at: null, timezone: 'Asia/Seoul',
    venue_name: input.venue_name.trim(), address: input.address.trim(),
    latitude: 37.615 + Math.random() * 0.03, longitude: 127.055 + Math.random() * 0.03,
    poster_path: input.poster_path ?? null, status: input.publish ? 'PUBLISHED' : 'DRAFT', published_at: input.publish ? now() : null,
    bank_name: input.bank_name.trim(), account_number: input.account_number.trim(), account_holder: club.name,
    created_at: now(), updated_at: now(),
  }
  db.events.push(event)
  db.ticket_types.push({
    id: uid('tt'), event_id: event.id, name: input.price_krw > 0 ? '일반' : '참가 신청',
    price_krw: input.price_krw, capacity: input.capacity, reserved_quantity: 0, sold_quantity: 0,
    sales_starts_at: now(), sales_ends_at: event.starts_at, status: 'ACTIVE', created_at: now(), updated_at: now(),
  })
  return event
}

export function setEventStatus(db: Db, userId: Uuid | null, eventId: Uuid, status: EventRow['status']) {
  const event = db.events.find((e) => e.id === eventId)
  if (!event || !isClubManager(db, userId, event.club_id)) throw new BandyError('공연을 찾지 못했습니다.')
  if (status === 'PUBLISHED' && !event.venue_name) throw new BandyError('공개하려면 장소가 필요합니다.')
  event.status = status
  event.published_at = status === 'PUBLISHED' ? (event.published_at ?? now()) : event.published_at
  event.updated_at = now()
}

// 공연 수정 [PATCH]. 예매가 있으면 가격은 못 바꾸고, 정원은 이미 잡힌 수량 아래로 못 줄인다.
export function updateEvent(db: Db, userId: Uuid | null, eventId: Uuid, input: {
  title: string; category: EventRow['category']; starts_at: string; venue_name: string; address: string
  description: string; bank_name: string; account_number: string; poster_path: string | null
  price_krw: number; capacity: number
}) {
  const event = db.events.find((e) => e.id === eventId)
  if (!event || !isClubManager(db, userId, event.club_id)) throw new BandyError('공연을 찾지 못했습니다.')
  if (!input.title.trim()) throw new BandyError('공연명을 입력하세요.')
  if (!input.starts_at) throw new BandyError('일시를 입력하세요.')
  const tt = db.ticket_types.find((t) => t.event_id === eventId)!
  const hasBookings = db.bookings.some((b) => b.event_id === eventId && b.status !== 'CANCELLED')
  if (hasBookings && input.price_krw !== tt.price_krw) throw new BandyError('예매가 있는 공연은 가격을 바꿀 수 없습니다.')
  if (input.capacity < tt.reserved_quantity + tt.sold_quantity) throw new BandyError('이미 예매된 수량보다 정원을 줄일 수 없습니다.')
  if (event.status === 'PUBLISHED' && !input.venue_name.trim()) throw new BandyError('공개 중인 공연은 장소가 필요합니다.')
  Object.assign(event, {
    title: input.title.trim(), category: input.category, starts_at: new Date(input.starts_at).toISOString(),
    venue_name: input.venue_name.trim(), address: input.address.trim(), description: input.description.trim(),
    bank_name: input.bank_name.trim(), account_number: input.account_number.trim(), poster_path: input.poster_path,
    updated_at: now(),
  })
  Object.assign(tt, { price_krw: input.price_krw, capacity: input.capacity, updated_at: now() })
}

// 공연 삭제 [DELETE]. [미정] 예매가 있는 공연의 삭제·환불 정책이 정해지기 전에는 예매가 없을 때만 지운다.
export function deleteEvent(db: Db, userId: Uuid | null, eventId: Uuid) {
  const event = db.events.find((e) => e.id === eventId)
  if (!event || !isClubManager(db, userId, event.club_id)) throw new BandyError('공연을 찾지 못했습니다.')
  if (db.bookings.some((b) => b.event_id === eventId)) throw new BandyError('예매 기록이 있는 공연은 삭제할 수 없습니다. 비공개로 돌려 주세요.')
  db.events = db.events.filter((e) => e.id !== eventId)
  db.ticket_types = db.ticket_types.filter((t) => t.event_id !== eventId)
}

export function bookingCount(db: Db, eventId: Uuid) {
  return db.bookings.filter((b) => b.event_id === eventId && b.status !== 'CANCELLED').length
}

// 계정 설정: 표시명 수정 [PATCH 회원 정보]
export function updateProfile(db: Db, userId: Uuid | null, displayName: string) {
  const p = db.profiles.find((x) => x.id === userId)
  if (!p) throw new BandyError('로그인이 필요합니다.')
  if (!displayName.trim()) throw new BandyError('이름을 입력하세요.')
  p.display_name = displayName.trim().slice(0, 20)
  p.updated_at = now()
}

// ───────────── 예매 · 입금 확인 ─────────────
export function createBooking(db: Db, userId: Uuid | null, ticketTypeId: Uuid, quantity: number, depositorName: string): Booking {
  if (!userId) throw new BandyError('로그인이 필요합니다.')
  const tt = db.ticket_types.find((t) => t.id === ticketTypeId && t.status === 'ACTIVE')
  const event = tt && db.events.find((e) => e.id === tt.event_id)
  const club = event && db.clubs.find((c) => c.id === event.club_id)
  if (!tt || !event || event.status !== 'PUBLISHED' || club?.status !== 'ACTIVE') {
    throw new BandyError('지금 예매할 수 없는 공연입니다.')
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new BandyError(`수량은 1~${MAX_QUANTITY}장입니다.`)
  }
  if (remaining(tt) < quantity) throw new BandyError('남은 자리가 부족합니다.')
  const free = tt.price_krw === 0
  if (!free && !depositorName.trim()) throw new BandyError('입금자명을 입력하세요.')

  const total = tt.price_krw * quantity
  const booking: Booking = {
    id: uid('bk'), user_id: userId, event_id: event.id, status: 'PENDING_PAYMENT', total_amount_krw: total,
    expires_at: new Date(Date.now() + BOOKING_HOLD_DAYS * 86400000).toISOString(),
    confirmed_at: null, cancelled_at: null, idempotency_key: uid('idem'),
    request_hash: fakeHash(`${userId}:${tt.id}:${quantity}`), created_at: now(), updated_at: now(),
  }
  db.bookings.push(booking)
  db.booking_items.push({
    id: uid('bi'), booking_id: booking.id, event_id: event.id, user_id: userId, ticket_type_id: tt.id,
    quantity, unit_price_krw: tt.price_krw, ticket_type_name: tt.name, created_at: now(),
  })
  db.payments.push({
    id: uid('pay'), booking_id: booking.id, provider: 'BANK_TRANSFER', environment: 'TEST',
    provider_order_id: `BANDY-${booking.id.slice(-8).toUpperCase()}`, provider_payment_key: null,
    status: 'PENDING', depositor_name: depositorName.trim(), confirmed_by: null, approved_at: null,
    failure_code: null, reconciliation_required: false, created_at: now(), updated_at: now(),
  })
  tt.reserved_quantity += quantity

  // [미정] 무료 공연은 입금 확인 없이 바로 확정하는 안
  if (free) confirmBookingInternal(db, booking, null)
  return booking
}

function confirmBookingInternal(db: Db, booking: Booking, confirmedBy: Uuid | null) {
  const item = db.booking_items.find((i) => i.booking_id === booking.id)!
  const tt = db.ticket_types.find((t) => t.id === item.ticket_type_id)!
  const payment = db.payments.find((p) => p.booking_id === booking.id)!
  booking.status = 'CONFIRMED'
  booking.confirmed_at = now()
  booking.updated_at = now()
  payment.status = 'SUCCEEDED'
  payment.approved_at = now()
  payment.confirmed_by = confirmedBy
  payment.updated_at = now()
  tt.reserved_quantity -= item.quantity
  tt.sold_quantity += item.quantity

  const used = db.tickets.filter((t) => t.event_id === booking.event_id).map((t) => t.entry_number ?? 0)
  let next = (used.length ? Math.max(...used) : 0) + 1
  for (let seq = 1; seq <= item.quantity; seq += 1) {
    const ticket: Ticket = {
      id: uid('tk'), booking_id: booking.id, booking_item_id: item.id, user_id: booking.user_id,
      event_id: booking.event_id, issue_sequence: seq, entry_number: next, status: 'ISSUED', seat_info: null,
      issued_at: now(), ticket_received_at: null, checked_in_at: null, checked_in_by: null,
      created_at: now(), updated_at: now(),
    }
    next += 1
    db.tickets.push(ticket)
    const token = `${ticket.id}.${Math.random().toString(36).slice(2, 12)}`
    db.qr_credentials.push({
      id: uid('qr'), ticket_id: ticket.id, token, token_hash: fakeHash(token),
      expires_at: new Date(Date.now() + 90 * 86400000).toISOString(), revoked_at: null, created_at: now(),
    })
  }
  const event = db.events.find((e) => e.id === booking.event_id)!
  notify(db, booking.user_id, event.id, 'BOOKING_CONFIRMED',
    booking.total_amount_krw === 0
      ? `${event.title} 신청이 확정돼 티켓 ${item.quantity}장이 발급됐어요.`
      : `${event.title} 입금이 확인돼 티켓 ${item.quantity}장이 발급됐어요.`, `booking-confirmed-${booking.id}`)
}

// 주최 동아리 운영진의 '입금 확인'. 두 번 눌러도 티켓이 중복 발급되지 않는다.
export function confirmDeposit(db: Db, userId: Uuid | null, bookingId: Uuid) {
  const booking = db.bookings.find((b) => b.id === bookingId)
  if (!booking || !isEventStaff(db, userId, booking.event_id)) throw new BandyError('예매를 찾지 못했습니다.')
  if (booking.status === 'CONFIRMED') return
  if (booking.status !== 'PENDING_PAYMENT') throw new BandyError('취소된 예매입니다.')
  confirmBookingInternal(db, booking, userId)
}

// 입금 전 예매만 취소(본인 또는 주최 동아리). 확정 후 환불은 정책 결정 뒤에.
export function cancelBooking(db: Db, userId: Uuid | null, bookingId: Uuid) {
  const booking = db.bookings.find((b) => b.id === bookingId)
  if (!booking || !(booking.user_id === userId || isEventStaff(db, userId, booking.event_id))) {
    throw new BandyError('예매를 찾지 못했습니다.')
  }
  if (booking.status !== 'PENDING_PAYMENT') throw new BandyError('입금 확인 전 예매만 취소할 수 있습니다.')
  const item = db.booking_items.find((i) => i.booking_id === booking.id)!
  const tt = db.ticket_types.find((t) => t.id === item.ticket_type_id)!
  const payment = db.payments.find((p) => p.booking_id === booking.id)!
  booking.status = 'CANCELLED'
  booking.cancelled_at = now()
  booking.updated_at = now()
  payment.status = 'FAILED'
  payment.failure_code = 'CANCELLED_BEFORE_DEPOSIT'
  payment.updated_at = now()
  tt.reserved_quantity -= item.quantity
}

// ───────────── QR 입장 ─────────────
export type CheckInResult =
  | { result: 'valid'; ticket: Ticket }
  | { result: 'already_checked_in'; ticket: Ticket }
  | { result: 'invalid' }

function findTicket(db: Db, eventId: Uuid, token: string) {
  const qr = db.qr_credentials.find((q) => q.token_hash === fakeHash(token.trim()) && q.token === token.trim())
  return qr && !qr.revoked_at && new Date(qr.expires_at) > new Date()
    ? db.tickets.find((t) => t.id === qr.ticket_id && t.event_id === eventId)
    : undefined
}

// QR 검증(읽기만). 운영자 흐름: 검증 → 관객 정보 확인 → 입장 처리
export function verifyTicket(db: Db, userId: Uuid | null, eventId: Uuid, token: string): CheckInResult {
  if (!isEventStaff(db, userId, eventId)) throw new BandyError('이 공연의 운영진만 입장 처리할 수 있습니다.')
  const ticket = findTicket(db, eventId, token)
  if (!ticket || ticket.status === 'CANCELLED') return { result: 'invalid' }
  if (ticket.status === 'CHECKED_IN') return { result: 'already_checked_in', ticket }
  return { result: 'valid', ticket }
}

export function checkIn(db: Db, userId: Uuid | null, eventId: Uuid, token: string): CheckInResult {
  if (!isEventStaff(db, userId, eventId)) throw new BandyError('이 공연의 운영진만 입장 처리할 수 있습니다.')
  const ticket = findTicket(db, eventId, token)
  if (!ticket || ticket.status === 'CANCELLED') return { result: 'invalid' }
  if (ticket.status === 'CHECKED_IN') return { result: 'already_checked_in', ticket }
  ticket.status = 'CHECKED_IN'
  ticket.checked_in_at = now()
  ticket.checked_in_by = userId
  ticket.updated_at = now()
  return { result: 'valid', ticket }
}

// ───────────── 교류 신청 ─────────────
export function requestExchange(db: Db, userId: Uuid | null, fromClubId: Uuid, toClubId: Uuid, kind: ExchangeKind, message: string) {
  if (!isClubManager(db, userId, fromClubId)) throw new BandyError('동아리 운영진만 교류를 신청할 수 있습니다.')
  const from = db.clubs.find((c) => c.id === fromClubId)
  const to = db.clubs.find((c) => c.id === toClubId)
  if (from?.status !== 'ACTIVE') throw new BandyError('승인된 동아리만 교류를 신청할 수 있습니다.')
  if (!to || to.status !== 'ACTIVE' || !to.exchange_open) throw new BandyError('지금은 교류를 받지 않는 동아리입니다.')
  if (fromClubId === toClubId) throw new BandyError('같은 동아리에는 신청할 수 없습니다.')
  if (db.exchange_requests.some((r) => r.from_club_id === fromClubId && r.to_club_id === toClubId && r.status === 'PENDING')) {
    throw new BandyError('이미 보낸 신청이 처리 대기 중입니다.')
  }
  const req: ExchangeRequest = {
    id: uid('ex'), from_club_id: fromClubId, to_club_id: toClubId, kind, message: message.trim().slice(0, 300),
    status: 'PENDING', created_by: userId!, responded_by: null, responded_at: null, created_at: now(),
  }
  db.exchange_requests.push(req)
  for (const m of db.club_memberships.filter((x) => x.club_id === toClubId)) {
    notify(db, m.user_id, null, 'EXCHANGE_REQUESTED', `${from.name}에서 교류를 신청했어요.`, `ex-req-${req.id}-${m.user_id}`)
  }
  return req
}

export function respondExchange(db: Db, userId: Uuid | null, requestId: Uuid, accept: boolean) {
  const req = db.exchange_requests.find((r) => r.id === requestId)
  if (!req || !isClubManager(db, userId, req.to_club_id)) throw new BandyError('신청을 찾지 못했습니다.')
  if (req.status !== 'PENDING') throw new BandyError('이미 처리한 신청입니다.')
  req.status = accept ? 'ACCEPTED' : 'REJECTED'
  req.responded_by = userId
  req.responded_at = now()
  const to = db.clubs.find((c) => c.id === req.to_club_id)!
  for (const m of db.club_memberships.filter((x) => x.club_id === req.from_club_id)) {
    notify(db, m.user_id, null, 'EXCHANGE_RESPONDED', accept
      ? `${to.name}이(가) 교류를 수락했어요. 오픈채팅 링크가 열렸어요.`
      : `${to.name}이(가) 교류를 거절했어요.`, `ex-res-${req.id}-${m.user_id}`)
  }
}

export function cancelExchange(db: Db, userId: Uuid | null, requestId: Uuid) {
  const req = db.exchange_requests.find((r) => r.id === requestId)
  if (!req || !isClubManager(db, userId, req.from_club_id)) throw new BandyError('신청을 찾지 못했습니다.')
  if (req.status !== 'PENDING') throw new BandyError('이미 처리한 신청입니다.')
  req.status = 'CANCELLED'
}

// ───────────── 알림 ─────────────
function notify(db: Db, userId: Uuid, eventId: Uuid | null, type: string, message: string, sourceKey: string) {
  if (db.notifications.some((n) => n.source_key === sourceKey)) return
  db.notifications.push({
    id: uid('nt'), user_id: userId, event_id: eventId, type, message, source_key: sourceKey, read_at: null, created_at: now(),
  })
}

export function markNotificationRead(db: Db, userId: Uuid | null, id: Uuid) {
  const n = db.notifications.find((x) => x.id === id && x.user_id === userId)
  if (n && !n.read_at) n.read_at = now()
}

export function markNotificationsRead(db: Db, userId: Uuid | null) {
  for (const n of db.notifications) if (n.user_id === userId && !n.read_at) n.read_at = now()
}
