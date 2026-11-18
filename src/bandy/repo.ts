// 프로토타입 데이터 계층. 지금은 브라우저 메모리 + localStorage.
// 함수 하나가 나중의 Supabase RPC(DB 함수) 하나에 대응한다. 규칙은 supabase/reference SQL에서 검증한 것과 같다.
// Supabase 연결 때는 이 파일의 함수 본문만 supabase.rpc(...) / select 호출로 바꾸면 된다.
import {
  Booking, Club, Db, EventRow, ExchangeKind, ExchangeRequest, HomeState, Ticket, TicketType, Uuid,
} from './types'
import { seedDb } from './seed'
import { dateLabel } from './format'

export class BandyError extends Error {}

const STORAGE_KEY = 'bandy-prototype-v4' // v4: 시연 날짜를 오늘 기준으로 바꿈(옛 저장 데이터는 새로 시작)
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
  // 처음 연 시연 데이터도 바로 저장한다. 안 그러면 새로고침마다 티켓·QR이 새로 만들어져 다른 탭의 운영진이 검증할 수 없다
  const db = initialDb()
  saveDb(db)
  return db
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

// ───────────── 공통 규칙 ─────────────
const MAX_DEPOSITOR = 20 // 입금자명 최대 글자 수
const URL_RE = /^https?:\/\/[^\s/]+/i

// 링크는 http(s) 주소만. 화면에서 그릴 때도 이 검사를 통과한 것만 링크로 만든다
export function safeUrl(url: string | null | undefined) {
  const v = (url ?? '').trim()
  return URL_RE.test(v) ? v : null
}

// 글자 수 제한(서버 _event_limits · _club_limits와 같음)
export const LIMITS = {
  event: { title: [60, '공연명'], venue_name: [60, '장소'], address: [120, '주소'], description: [2000, '공연 소개'], bank_name: [20, '입금 은행'], account_number: [30, '입금 계좌'], account_holder: [40, '예금주'] },
  club: { name: [40, '동아리 이름'], school: [30, '학교'], genre: [30, '장르'], region: [30, '지역'], introduction: [1000, '소개'] },
} as const
function checkLengths(input: Record<string, unknown>, limits: Record<string, readonly [number, string]>) {
  for (const [k, [max, label]] of Object.entries(limits)) {
    const v = input[k]
    if (typeof v === 'string' && v.length > max) throw new BandyError(`${label}은(는) ${max}자까지 쓸 수 있어요.`)
  }
}

function checkUrl(url: string | null | undefined, label: string) {
  let v = (url ?? '').trim()
  // 'instagram.com/abc'처럼 앞부분 없이 쓴 주소는 https://를 붙인다(다른 스킴은 그대로 거부)
  if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(v)) v = `https://${v}`
  if (v && (!URL_RE.test(v) || v.length > 300)) throw new BandyError(`${label}은(는) http:// 또는 https://로 시작하는 주소만 쓸 수 있습니다.`)
  return v
}

export function isPastEvent(e: Pick<EventRow, 'starts_at'>) {
  return new Date(e.starts_at).getTime() <= Date.now()
}

// 입금 기한이 지났는가(시각만 봄)
function pastDeadline(b: Booking) {
  return b.status === 'PENDING_PAYMENT' && new Date(b.expires_at).getTime() <= Date.now()
}

// 장소 비교·저장용: 앞뒤·중복 공백, 대소문자 차이는 같은 장소(서버 _norm과 같음)
function venueText(v: string) { return v.trim().replace(/\s+/g, ' ') }
function sameVenue(a: string | null, b: string | null) { return venueText(a ?? '').toLowerCase() === venueText(b ?? '').toLowerCase() }

// 입금 대기 예매를 잡아 두는 마지막 시각(서버 _hold_until과 같음)
//   보통: 입금 기한 / '입금했어요'를 누른 예매: 기한 + 24시간(단, 공연 끝까지) — 버튼만 누르고 입금하지 않아도 자리를 영원히 잡지 못한다
export function holdUntil(b: Booking, db: Db) {
  const exp = new Date(b.expires_at).getTime()
  const notified = db.payments.find((p) => p.booking_id === b.id && p.status === 'PENDING')?.depositor_notified_at
  if (!notified) return exp
  const ev = db.events.find((e) => e.id === b.event_id)
  const end = ev ? new Date(eventEnd(ev)).getTime() : exp
  return Math.max(exp, Math.min(exp + 24 * 3600000, end))
}

// 만료 대상인가: 입금 대기인데 잡아 두는 시각이 지남
export function isOverdue(b: Booking, db: Db) {
  return b.status === 'PENDING_PAYMENT' && holdUntil(b, db) <= Date.now()
}

// 공연이 끝나는 시각: 주최 측이 입력한 진행 시간(ends_at). 비어 있으면 시작 + 2시간(서버 _event_end와 같음)
export const DEFAULT_DURATION_MIN = 120
export function eventEnd(e: Pick<EventRow, 'starts_at' | 'ends_at'>) {
  return e.ends_at ?? new Date(new Date(e.starts_at).getTime() + DEFAULT_DURATION_MIN * 60000).toISOString()
}
export function durationMinutes(e: Pick<EventRow, 'starts_at' | 'ends_at'>) {
  return Math.round((new Date(eventEnd(e)).getTime() - new Date(e.starts_at).getTime()) / 60000)
}
// 끝났는가: 끝 시각 전까지는 '진행 중'이라 티켓 QR을 열 수 있다
export function isEventOver(e: Pick<EventRow, 'starts_at' | 'ends_at'>) {
  return new Date(eventEnd(e)).getTime() <= Date.now()
}

function checkDuration(min: number | undefined, fallback: number) {
  const v = min ?? fallback
  if (!Number.isFinite(v) || v < 10 || v > 1440) throw new BandyError('진행 시간은 10분 ~ 24시간(1440분) 사이로 입력하세요.')
  return v
}

function checkPublishable(venue: string, startsAt: string, price: number, account: string) {
  if (!venue.trim()) throw new BandyError('공개하려면 장소가 필요합니다.')
  if (isPastEvent({ starts_at: startsAt })) throw new BandyError('이미 지난 일시로는 공개할 수 없습니다.')
  if (price > 0 && !account.trim()) throw new BandyError('유료 공연은 입금 계좌가 필요합니다.')
}

function requireLogin(_db: Db, userId: Uuid | null): Uuid {
  if (!userId) throw new BandyError('로그인이 필요합니다.')
  return userId
}

// 정지·탈퇴 회원은 새로 만드는 일과 운영진 업무를 못 한다(이미 산 티켓 QR·본인 예매 취소·이름 수정은 됨). 서버 _require_active_profile과 같음
function requireActiveProfile(db: Db, userId: Uuid | null): Uuid {
  requireLogin(db, userId)
  const p = db.profiles.find((x) => x.id === userId)
  if (p && p.status !== 'ACTIVE') throw new BandyError('이용이 제한된 계정입니다.')
  return userId!
}

// 쓰기 권한: 운영진 + 동아리 승인(ACTIVE). 정지된 동아리는 공연 등록·수정·공개·입금 확인이 멈춘다
function requireActiveManager(db: Db, userId: Uuid | null, clubId: Uuid, notFound: string) {
  requireActiveProfile(db, userId)
  if (!isClubManager(db, userId, clubId)) throw new BandyError(notFound)
  if (db.clubs.find((c) => c.id === clubId)?.status !== 'ACTIVE') throw new BandyError('승인된 동아리만 할 수 있습니다. (정지 또는 승인 전)')
}

function isOwner(db: Db, userId: Uuid | null, clubId: Uuid) {
  return db.club_memberships.some((m) => m.club_id === clubId && m.user_id === userId && m.role === 'OWNER' && m.status === 'ACTIVE')
}

// ───────────── 권한 판정 ─────────────
// 하단 바 '+ 공연 등록' 등 공연을 올릴 수 있는 동아리(승인된 동아리의 운영진)
export function activeManagerClubIds(db: Db, userId: Uuid | null) {
  return managerClubIds(db, userId).filter((id) => db.clubs.find((c) => c.id === id)?.status === 'ACTIVE')
}

export function hasBookingFor(db: Db, userId: Uuid | null, eventId: Uuid) {
  return !!userId && db.bookings.some((b) => b.event_id === eventId && b.user_id === userId)
}

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

// 교류로 연결된 동아리 공연을 위로, 그다음 날짜순. 이미 시작한 공연은 피드·지도·캘린더에서 뺀다
export function feedEvents(db: Db, userId: Uuid | null) {
  return publicEvents(db).filter((e) => !isPastEvent(e)).sort((a, b) => {
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


// ───────────── 동아리 ─────────────
export function createClub(db: Db, userId: Uuid | null, input: {
  name: string; school: string; genre: string; region: string; introduction: string
  sns_url: string; open_chat_url: string; exchange_open: boolean
}): Club {
  requireActiveProfile(db, userId)
  const name = input.name.trim()
  if (!name) throw new BandyError('동아리 이름을 입력하세요.')
  checkLengths(input as Record<string, unknown>, LIMITS.club)
  if (db.clubs.some((c) => c.name === name)) throw new BandyError('이미 등록된 동아리 이름입니다.')
  // [임시] 승인 대기 중인 등록은 한 사람당 1건
  if (db.clubs.some((c) => c.status === 'PENDING' && isOwner(db, userId, c.id))) {
    throw new BandyError('승인 대기 중인 동아리가 있어요. 승인 후에 추가로 등록할 수 있어요.')
  }
  const sns = checkUrl(input.sns_url, 'SNS 링크')
  const chat = checkUrl(input.open_chat_url, '오픈채팅 링크')
  const club: Club = {
    id: uid('club'), name, school: input.school.trim(), genre: input.genre.trim(), region: input.region.trim(),
    introduction: input.introduction.trim(), city: '서울', profile_path: null,
    sns_url: sns || null, open_chat_url: chat,
    exchange_open: input.exchange_open, status: 'PENDING', created_at: now(), updated_at: now(),
  }
  db.clubs.push(club)
  db.club_memberships.push({
    id: uid('m'), user_id: userId!, club_id: club.id, role: 'OWNER', status: 'ACTIVE', created_at: now(), updated_at: now(),
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
    const message = {
      ACTIVE: `${club.name} 동아리가 승인됐어요. 이제 공연을 올리고 교류를 신청할 수 있어요.`,
      SUSPENDED: `${club.name} 동아리 운영이 정지됐어요. 공연 공개와 입금 확인이 멈춰요.`,
      REJECTED: `${club.name} 동아리 승인이 거절됐어요.`,
      PENDING: `${club.name} 동아리가 승인 대기 상태로 바뀌었어요.`,
    }[status]
    notify(db, owner.user_id, null, 'CLUB_STATUS', message, `club-status-${clubId}-${status}-${uid('n')}`)
  }
}

export function updateClub(db: Db, userId: Uuid | null, clubId: Uuid, patch: Partial<Pick<Club,
  'name' | 'introduction' | 'school' | 'genre' | 'region' | 'sns_url' | 'open_chat_url' | 'exchange_open' | 'profile_path'>>) {
  if (patch.name !== undefined) {
    patch.name = patch.name.trim()
    if (!patch.name) throw new BandyError('동아리 이름을 입력하세요.')
    if (patch.name.length > 40) throw new BandyError('동아리 이름은 40자까지입니다.')
    if (db.clubs.some((c) => c.id !== clubId && c.name === patch.name)) throw new BandyError('이미 등록된 동아리 이름입니다.')
  }
  requireActiveProfile(db, userId)
  if (!isClubManager(db, userId, clubId)) throw new BandyError('동아리 운영진만 수정할 수 있습니다.')
  checkLengths(patch as Record<string, unknown>, LIMITS.club)
  if (db.clubs.find((c) => c.id === clubId)?.status === 'SUSPENDED') throw new BandyError('운영이 정지된 동아리는 정보를 바꿀 수 없습니다.')
  if (patch.sns_url !== undefined) patch.sns_url = checkUrl(patch.sns_url, 'SNS 링크') || null
  if (patch.open_chat_url !== undefined) patch.open_chat_url = checkUrl(patch.open_chat_url, '오픈채팅 링크')
  const club = db.clubs.find((c) => c.id === clubId)!
  Object.assign(club, patch, { updated_at: now() })
}

// ───────────── 공연 ─────────────
export function createEvent(db: Db, userId: Uuid | null, clubId: Uuid, input: {
  title: string; category: EventRow['category']; starts_at: string; venue_name: string; address: string
  description: string; price_krw: number; capacity: number; account_number: string; bank_name: string
  publish: boolean; poster_path?: string | null; duration_minutes?: number; account_holder?: string
}): EventRow {
  requireActiveProfile(db, userId)
  requireActiveManager(db, userId, clubId, '동아리 운영진만 공연을 올릴 수 있습니다.')
  const club = db.clubs.find((c) => c.id === clubId)!
  if (!input.title.trim()) throw new BandyError('공연명을 입력하세요.')
  checkLengths(input as Record<string, unknown>, LIMITS.event)
  if (!input.starts_at) throw new BandyError('일시를 입력하세요.')
  if (Number.isNaN(new Date(input.starts_at).getTime())) throw new BandyError('일시 형식이 올바르지 않습니다.')
  if (!Number.isFinite(input.capacity) || input.capacity <= 0 || input.capacity > 100000) throw new BandyError('정원은 1~100000 사이여야 합니다.')
  if (!Number.isFinite(input.price_krw) || input.price_krw < 0) throw new BandyError('가격은 0원 이상이어야 합니다.')
  if (input.publish) checkPublishable(input.venue_name, input.starts_at, input.price_krw, input.account_number)
  // 지도 좌표: 실제로는 카카오 Local로 주소 → 좌표 변환. 프로토타입은 노원구 근처 임의 좌표
  const event: EventRow = {
    id: uid('ev'), club_id: clubId, created_by: userId!, title: input.title.trim(), description: input.description.trim(),
    category: input.category, starts_at: new Date(input.starts_at).toISOString(),
    ends_at: new Date(new Date(input.starts_at).getTime() + checkDuration(input.duration_minutes, DEFAULT_DURATION_MIN) * 60000).toISOString(),
    admission_starts_at: null, admission_ends_at: null, timezone: 'Asia/Seoul',
    venue_name: input.venue_name.trim(), address: input.address.trim(),
    latitude: 37.615 + Math.random() * 0.03, longitude: 127.055 + Math.random() * 0.03,
    poster_path: input.poster_path ?? null, status: input.publish ? 'PUBLISHED' : 'DRAFT', published_at: input.publish ? now() : null,
    bank_name: input.bank_name.trim(), account_number: input.account_number.trim(),
    account_holder: (input.account_holder?.trim() || club.name).slice(0, 40), // 실제 예금주. 없으면 동아리 이름
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
  requireActiveProfile(db, userId)
  const event = db.events.find((e) => e.id === eventId)
  if (!event || !isClubManager(db, userId, event.club_id)) throw new BandyError('공연을 찾지 못했습니다.')
  // 공개는 승인된 동아리만. 비공개·종료·취소(판매를 멈추는 쪽)는 정지된 동아리도 할 수 있다
  if (status === 'PUBLISHED') requireActiveManager(db, userId, event.club_id, '공연을 찾지 못했습니다.')
  if (event.status === status) return
  if (event.status === 'CANCELLED') throw new BandyError('취소된 공연은 다시 열 수 없습니다. 새로 등록해 주세요.')
  const maxPrice = Math.max(0, ...db.ticket_types.filter((t) => t.event_id === eventId).map((t) => t.price_krw))
  if (status === 'PUBLISHED') checkPublishable(event.venue_name ?? '', event.starts_at, maxPrice, event.account_number)
  event.status = status
  event.published_at = status === 'PUBLISHED' ? (event.published_at ?? now()) : event.published_at
  event.updated_at = now()
  // 공연 취소: 입금 대기 예매는 취소하고, 예매자 모두에게 알린다(입금 완료분 환불은 정책 결정 뒤 동아리가 직접)
  if (status === 'CANCELLED') {
    for (const b of db.bookings.filter((x) => x.event_id === eventId && (x.status === 'PENDING_PAYMENT' || x.status === 'CONFIRMED'))) {
      const wasConfirmed = b.status === 'CONFIRMED'
      if (!wasConfirmed) releaseBooking(db, b, 'CANCELLED', 'EVENT_CANCELLED')
      notify(db, b.user_id, eventId, 'EVENT_CANCELLED', wasConfirmed
        ? `[${event.title}] 공연이 취소됐어요. 내 티켓에서 환불받을 계좌를 적어 환불을 요청해 주세요.`
        : `[${event.title}] 공연이 취소돼 예매도 취소됐어요.`, `event-cancelled-${b.id}`)
    }
  }
}

// 공연 수정 [PATCH]. 예매가 있으면 가격은 못 바꾸고, 정원은 이미 잡힌 수량 아래로 못 줄인다.
export function updateEvent(db: Db, userId: Uuid | null, eventId: Uuid, input: {
  title: string; category: EventRow['category']; starts_at: string; venue_name: string; address: string
  description: string; bank_name: string; account_number: string; poster_path: string | null
  price_krw: number; capacity: number; duration_minutes?: number; account_holder?: string
}) {
  requireLogin(db, userId)
  const event = db.events.find((e) => e.id === eventId)
  if (!event) throw new BandyError('공연을 찾지 못했습니다.')
  requireActiveManager(db, userId, event.club_id, '공연을 찾지 못했습니다.')
  if (event.status === 'CANCELLED') throw new BandyError('취소된 공연은 수정할 수 없습니다.')
  if (!input.title.trim()) throw new BandyError('공연명을 입력하세요.')
  checkLengths(input as Record<string, unknown>, LIMITS.event)
  if (!input.starts_at) throw new BandyError('일시를 입력하세요.')
  if (Number.isNaN(new Date(input.starts_at).getTime())) throw new BandyError('일시 형식이 올바르지 않습니다.')
  if (!Number.isFinite(input.capacity) || input.capacity <= 0 || input.capacity > 100000) throw new BandyError('정원은 1~100000 사이여야 합니다.')
  if (!Number.isFinite(input.price_krw) || input.price_krw < 0) throw new BandyError('가격은 0원 이상이어야 합니다.')
  const tt = db.ticket_types.find((t) => t.event_id === eventId)!
  const before = { starts_at: event.starts_at, venue_name: event.venue_name, account_number: event.account_number, bank_name: event.bank_name }
  // 진행 시간: 보내면 그대로, 안 보내면 기존 진행 시간 유지
  const duration = checkDuration(input.duration_minutes, durationMinutes(event))
  const hasBookings = db.bookings.some((b) => b.event_id === eventId && b.status !== 'CANCELLED')
  if (hasBookings && input.price_krw !== tt.price_krw) throw new BandyError('예매가 있는 공연은 가격을 바꿀 수 없습니다.')
  if (input.capacity < tt.reserved_quantity + tt.sold_quantity) throw new BandyError('이미 예매된 수량보다 정원을 줄일 수 없습니다.')
  const startsIso = new Date(input.starts_at).toISOString()
  if (event.status === 'PUBLISHED' && (startsIso !== event.starts_at || !sameVenue(input.venue_name, event.venue_name)
    || input.price_krw !== tt.price_krw || input.account_number.trim() !== event.account_number)) {
    checkPublishable(input.venue_name, startsIso, input.price_krw, input.account_number)
  }
  Object.assign(event, {
    title: input.title.trim(), category: input.category, starts_at: new Date(input.starts_at).toISOString(),
    venue_name: venueText(input.venue_name), address: input.address.trim(), description: input.description.trim(),
    bank_name: input.bank_name.trim(), account_number: input.account_number.trim(), poster_path: input.poster_path,
    account_holder: (input.account_holder?.trim() || event.account_holder).slice(0, 40),
    updated_at: now(),
  })
  event.ends_at = new Date(new Date(event.starts_at).getTime() + duration * 60000).toISOString()
  Object.assign(tt, { price_krw: input.price_krw, capacity: input.capacity, sales_ends_at: event.starts_at, updated_at: now() })
  // 입금 계좌를 고치면 아직 입금 전인 예매자에게 새 계좌를 알린다
  if (event.account_number !== before.account_number || event.bank_name !== before.bank_name) {
    for (const b of db.bookings.filter((x) => x.event_id === eventId && x.status === 'PENDING_PAYMENT')) {
      notify(db, b.user_id, eventId, 'ACCOUNT_CHANGED', `[${event.title}] 입금 계좌가 바뀌었어요. 입금 전이면 내 티켓에서 새 계좌를 확인해 주세요.`,
        `account-changed-${b.id}-${event.bank_name}-${event.account_number}`)
    }
  }
  const venueChanged = !sameVenue(event.venue_name, before.venue_name)
  if (event.starts_at !== before.starts_at || venueChanged) {
    event.previous_starts_at = before.starts_at
    event.previous_venue_name = before.venue_name
    // 이보다 먼저 예매한 사람은 유지 또는 취소·환불 요청을 고를 수 있다
    if (db.bookings.some((x) => x.event_id === eventId && (x.status === 'PENDING_PAYMENT' || x.status === 'CONFIRMED'))) event.schedule_changed_at = now()
    // 공연을 앞당기면 입금 기한도 새 시작 시각을 넘지 않게, 예매자에게 일정·장소 변경 알림(서버 update_event와 같음)
    const end = eventEnd(event)
    for (const b of db.bookings.filter((x) => x.event_id === eventId && x.status === 'PENDING_PAYMENT' && x.expires_at > end)) {
      b.expires_at = new Date(Math.max(new Date(end).getTime(), new Date(b.created_at).getTime() + 60000)).toISOString()
    }
    const parts = [
      event.starts_at !== before.starts_at ? `일시가 ${dateLabel(event.starts_at)}(으)로` : '',
      venueChanged ? `장소가 ${event.venue_name || '미정'}(으)로` : '',
    ].filter(Boolean).join(', ')
    const users = new Set(db.bookings.filter((x) => x.event_id === eventId && (x.status === 'PENDING_PAYMENT' || x.status === 'CONFIRMED')).map((x) => x.user_id))
    for (const u of users) {
      notify(db, u, eventId, 'EVENT_CHANGED', `[${event.title}] 공연 ${parts} 바뀌었어요. 내 티켓에서 유지하거나 취소·환불을 요청할 수 있어요.`, `event-changed-${eventId}-${u}-${event.starts_at}-${event.venue_name}`)
    }
  }
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
export function createBooking(db: Db, userId: Uuid | null, ticketTypeId: Uuid, quantity: number, depositorName: string,
  idempotencyKey?: string): Booking {
  requireActiveProfile(db, userId)
  const hash = fakeHash(`${ticketTypeId}:${quantity}:${depositorName}`)
  // 같은 요청 재전송(더블 클릭·네트워크 재시도)이면 같은 예매를 돌려준다
  const existing = idempotencyKey ? db.bookings.find((b) => b.user_id === userId && b.idempotency_key === idempotencyKey) : undefined
  if (existing) {
    if (existing.request_hash !== hash) throw new BandyError('같은 요청 키로 다른 예매를 만들 수 없습니다.')
    return existing
  }
  const tt = db.ticket_types.find((t) => t.id === ticketTypeId && t.status === 'ACTIVE')
  const event = tt && db.events.find((e) => e.id === tt.event_id)
  const club = event && db.clubs.find((c) => c.id === event.club_id)
  if (!tt || !event || event.status !== 'PUBLISHED' || club?.status !== 'ACTIVE') {
    throw new BandyError('지금 예매할 수 없는 공연입니다.')
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new BandyError(`수량은 1~${MAX_QUANTITY}장입니다.`)
  }
  if (Date.now() < new Date(tt.sales_starts_at).getTime()) throw new BandyError('아직 예매가 열리지 않았습니다.')
  if (Date.now() >= new Date(tt.sales_ends_at).getTime() || isPastEvent(event)) throw new BandyError('예매가 마감된 공연입니다.')
  if (depositorName.trim().length > MAX_DEPOSITOR) throw new BandyError(`입금자명은 ${MAX_DEPOSITOR}자까지입니다.`)
  expireBookings(db, tt.id)
  // 한 공연에 입금 대기 예매는 한 사람당 1건
  if (db.bookings.some((b) => b.user_id === userId && b.event_id === event.id && b.status === 'PENDING_PAYMENT')) {
    throw new BandyError('이 공연에 입금 대기 중인 예매가 있어요. 입금하거나 취소한 뒤 다시 예매해 주세요.')
  }
  if (remaining(tt) < quantity) throw new BandyError('남은 자리가 부족합니다.')
  const free = tt.price_krw === 0
  if (!free && !depositorName.trim()) throw new BandyError('입금자명을 입력하세요.')

  const total = tt.price_krw * quantity
  const booking: Booking = {
    id: uid('bk'), user_id: userId!, event_id: event.id, status: 'PENDING_PAYMENT', total_amount_krw: total,
    // 입금 기한: 3일 또는 공연 끝 중 빠른 쪽(현장 입금도 공연 중 확인 가능). 예매 자체는 공연 시작에 마감
    expires_at: new Date(Math.min(Date.now() + BOOKING_HOLD_DAYS * 86400000, new Date(eventEnd(event)).getTime())).toISOString(),
    confirmed_at: null, cancelled_at: null, idempotency_key: idempotencyKey || uid('idem'),
    request_hash: hash, created_at: now(), updated_at: now(),
  }
  db.bookings.push(booking)
  db.booking_items.push({
    id: uid('bi'), booking_id: booking.id, event_id: event.id, user_id: userId!, ticket_type_id: tt.id,
    quantity, unit_price_krw: tt.price_krw, ticket_type_name: tt.name, created_at: now(),
  })
  db.payments.push({
    id: uid('pay'), booking_id: booking.id, provider: 'BANK_TRANSFER', environment: 'TEST',
    provider_order_id: `BANDY-${booking.id.slice(-8).toUpperCase()}`, provider_payment_key: null,
    status: 'PENDING', depositor_name: depositorName.trim(), confirmed_by: null, depositor_notified_at: null, approved_at: null,
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
  // 입금 확인을 되돌렸다가 다시 확인하면 순번을 이어서 발급
  const seqBase = Math.max(0, ...db.tickets.filter((t) => t.booking_item_id === item.id).map((t) => t.issue_sequence))
  for (let seq = 1; seq <= item.quantity; seq += 1) {
    const ticket: Ticket = {
      id: uid('tk'), booking_id: booking.id, booking_item_id: item.id, user_id: booking.user_id,
      event_id: booking.event_id, issue_sequence: seqBase + seq, entry_number: next, status: 'ISSUED', seat_info: null,
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
// 입금 확인은 주최 동아리 운영진(OWNER·MANAGER)만, 동아리가 승인 상태일 때만
export function confirmDeposit(db: Db, userId: Uuid | null, bookingId: Uuid): 'CONFIRMED' | 'EXPIRED' {
  requireLogin(db, userId)
  const booking = db.bookings.find((b) => b.id === bookingId)
  const event = booking && db.events.find((e) => e.id === booking.event_id)
  if (!booking || !event) throw new BandyError('예매를 찾지 못했습니다.')
  requireActiveManager(db, userId, event.club_id, '예매를 찾지 못했습니다.')
  if (booking.status === 'CONFIRMED') return 'CONFIRMED'
  // 기한이 지났으면 확인 대신 만료로 처리하고 알려 준다(서버와 같음)
  expireBookings(db, db.booking_items.find((i) => i.booking_id === booking.id)!.ticket_type_id)
  if (booking.status === 'EXPIRED') return 'EXPIRED'
  if (booking.status !== 'PENDING_PAYMENT') throw new BandyError('취소된 예매입니다.')
  confirmBookingInternal(db, booking, userId)
  return 'CONFIRMED'
}

// 예매를 풀고 잡아 둔 자리를 돌려준다(취소·만료 공통)
function releaseBooking(db: Db, booking: Booking, status: 'CANCELLED' | 'EXPIRED', failureCode: string) {
  const item = db.booking_items.find((i) => i.booking_id === booking.id)!
  const tt = db.ticket_types.find((t) => t.id === item.ticket_type_id)!
  const payment = db.payments.find((p) => p.booking_id === booking.id)
  booking.status = status
  if (status === 'CANCELLED') booking.cancelled_at = now()
  booking.updated_at = now()
  if (payment && payment.status === 'PENDING') {
    payment.status = 'FAILED'
    payment.failure_code = failureCode
    payment.updated_at = now()
  }
  tt.reserved_quantity -= item.quantity
}

// 입금 기한이 지난 예매 정리 + 알림(서버 _expire_bookings와 같은 규칙)
function expireBookings(db: Db, ticketTypeId: Uuid) {
  const ids = new Set(db.booking_items.filter((i) => i.ticket_type_id === ticketTypeId).map((i) => i.booking_id))
  for (const b of db.bookings.filter((x) => ids.has(x.id) && isOverdue(x, db))) {
    releaseBooking(db, b, 'EXPIRED', 'EXPIRED')
    const ev = db.events.find((e) => e.id === b.event_id)
    notify(db, b.user_id, b.event_id, 'BOOKING_EXPIRED', `[${ev?.title ?? '공연'}] 입금 확인이 안 돼 예매가 취소됐어요. 이미 입금했다면 주최 동아리에 문의해 주세요.`, `booking-expired-${b.id}`)
  }
}

// 입금 전 예매만 취소(본인 또는 주최 동아리). 확정 후 환불은 정책 결정 뒤에.
export function cancelBooking(db: Db, userId: Uuid | null, bookingId: Uuid) {
  requireLogin(db, userId)
  const booking = db.bookings.find((b) => b.id === bookingId)
  const event = booking && db.events.find((e) => e.id === booking.event_id)
  if (!booking || !event) throw new BandyError('예매를 찾지 못했습니다.')
  const byHost = booking.user_id !== userId
  if (byHost && !isClubManager(db, userId, event.club_id)) throw new BandyError('예매를 찾지 못했습니다.')
  const item = db.booking_items.find((i) => i.booking_id === booking.id)!
  expireBookings(db, item.ticket_type_id)
  if (booking.status === 'EXPIRED') return // 기한이 지나 방금 만료됨(자리 반환 완료). 취소와 결과가 같다
  if (booking.status !== 'PENDING_PAYMENT') throw new BandyError('입금 확인 전 예매만 취소할 수 있습니다.')
  releaseBooking(db, booking, 'CANCELLED', 'CANCELLED_BEFORE_DEPOSIT')
  // 입금했다고 알린 뒤 본인이 취소하면 운영진에게 환불 확인 알림
  if (!byHost && db.payments.find((p) => p.booking_id === booking.id)?.depositor_notified_at) {
    for (const m of clubManagers(db, event.club_id)) {
      notify(db, m.user_id, event.id, 'BOOKING_CANCELLED_AFTER_DEPOSIT', `[${event.title}] 입금했다고 알린 예매가 취소됐어요. 입금 내역을 확인하고 환불해 주세요.`, `cancel-after-deposit-${booking.id}-${m.user_id}`)
    }
  }
  if (byHost) {
    notify(db, booking.user_id, event.id, 'BOOKING_CANCELLED', `${event.title} 예매가 주최 동아리에 의해 취소됐어요.`, `booking-cancelled-${booking.id}`)
  }
}

// ───────────── QR 입장 ─────────────
export type CheckInResult =
  | { result: 'valid'; ticket: Ticket }
  | { result: 'already_checked_in'; ticket: Ticket }
  | { result: 'invalid' }

function findTicket(db: Db, eventId: Uuid, token: string) {
  const qr = db.qr_credentials.find((q) => q.token_hash === fakeHash(token.trim()) && q.token === token.trim())
  const event = db.events.find((e) => e.id === eventId)
  return qr && !qr.revoked_at && new Date(qr.expires_at) > new Date() && event?.status !== 'CANCELLED'
    ? db.tickets.find((t) => t.id === qr.ticket_id && t.event_id === eventId)
    : undefined
}

// 티켓을 열 때마다 새 QR 발급(이전 QR 폐기). [미정] 유효시간 24시간 — 서버 issue_ticket_qr과 같은 규칙
export function issueTicketQr(db: Db, userId: Uuid | null, ticketId: Uuid) {
  requireLogin(db, userId)
  const t = db.tickets.find((x) => x.id === ticketId && x.user_id === userId)
  if (!t) throw new BandyError('티켓을 찾지 못했습니다.')
  if (t.status !== 'ISSUED') throw new BandyError('사용할 수 없는 티켓입니다.')
  const tev = db.events.find((e) => e.id === t.event_id)
  if (tev && tev.status !== 'CANCELLED' && isEventOver(tev)) throw new BandyError('이미 끝난 공연의 티켓입니다.')
  if (db.events.find((e) => e.id === t.event_id)?.status === 'CANCELLED') throw new BandyError('취소된 공연의 티켓입니다.')
  for (const q of db.qr_credentials) if (q.ticket_id === ticketId && !q.revoked_at) q.revoked_at = now()
  const token = `${t.id}.${Math.random().toString(36).slice(2, 12)}`
  db.qr_credentials.push({
    id: uid('qr'), ticket_id: t.id, token, token_hash: fakeHash(token),
    // 24시간과 '공연 끝 시각' 중 긴 쪽(최대 7일) — 서버와 같음
    expires_at: new Date(Math.max(Date.now() + 24 * 3600000,
      Math.min(new Date(eventEnd(db.events.find((e) => e.id === t.event_id)!)).getTime(), Date.now() + 7 * 86400000))).toISOString(),
    revoked_at: null, created_at: now(),
  })
  return token
}

// QR 검증(읽기만). 운영자 흐름: 검증 → 관객 정보 확인 → 입장 처리
export function verifyTicket(db: Db, userId: Uuid | null, eventId: Uuid, token: string): CheckInResult {
  requireActiveProfile(db, userId)
  if (!isEventStaff(db, userId, eventId)) throw new BandyError('이 공연의 운영진만 입장 처리할 수 있습니다.')
  const ticket = findTicket(db, eventId, token)
  if (!ticket || ticket.status === 'CANCELLED') return { result: 'invalid' }
  if (ticket.status === 'CHECKED_IN') return { result: 'already_checked_in', ticket }
  return { result: 'valid', ticket }
}

export function checkIn(db: Db, userId: Uuid | null, eventId: Uuid, token: string): CheckInResult {
  requireActiveProfile(db, userId)
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
  requireActiveProfile(db, userId)
  if (!isClubManager(db, userId, fromClubId)) throw new BandyError('동아리 운영진만 교류를 신청할 수 있습니다.')
  if (fromClubId === toClubId) throw new BandyError('같은 동아리에는 신청할 수 없습니다.')
  const from = db.clubs.find((c) => c.id === fromClubId)
  const to = db.clubs.find((c) => c.id === toClubId)
  if (from?.status !== 'ACTIVE') throw new BandyError('승인된 동아리만 교류를 신청할 수 있습니다.')
  if (!to || to.status !== 'ACTIVE' || !to.exchange_open) throw new BandyError('지금은 교류를 받지 않는 동아리입니다.')
  if (db.exchange_requests.some((r) => r.from_club_id === fromClubId && r.to_club_id === toClubId && r.status === 'PENDING')) {
    throw new BandyError('이미 보낸 신청이 처리 대기 중입니다.')
  }
  if (db.exchange_requests.some((r) => r.from_club_id === toClubId && r.to_club_id === fromClubId && r.status === 'PENDING')) {
    throw new BandyError('상대 동아리가 보낸 신청이 이미 있어요. 받은 신청에서 수락해 주세요.')
  }
  if (db.exchange_requests.some((r) => r.status === 'ACCEPTED'
    && ((r.from_club_id === fromClubId && r.to_club_id === toClubId) || (r.from_club_id === toClubId && r.to_club_id === fromClubId)))) {
    throw new BandyError('이미 교류 중인 동아리입니다. 오픈채팅으로 연락해 주세요.')
  }
  const req: ExchangeRequest = {
    id: uid('ex'), from_club_id: fromClubId, to_club_id: toClubId, kind, message: message.trim().slice(0, 300),
    status: 'PENDING', created_by: userId!, responded_by: null, responded_at: null, created_at: now(),
  }
  db.exchange_requests.push(req)
  for (const m of clubManagers(db, toClubId)) {
    notify(db, m.user_id, null, 'EXCHANGE_REQUESTED', `${from.name}에서 교류를 신청했어요.`, `ex-req-${req.id}-${m.user_id}`)
  }
  return req
}

export function respondExchange(db: Db, userId: Uuid | null, requestId: Uuid, accept: boolean) {
  requireLogin(db, userId)
  const req = db.exchange_requests.find((r) => r.id === requestId)
  if (!req) throw new BandyError('신청을 찾지 못했습니다.')
  requireActiveManager(db, userId, req.to_club_id, '신청을 찾지 못했습니다.')
  if (req.status !== 'PENDING') throw new BandyError('이미 처리한 신청입니다.')
  req.status = accept ? 'ACCEPTED' : 'REJECTED'
  req.responded_by = userId
  req.responded_at = now()
  const to = db.clubs.find((c) => c.id === req.to_club_id)!
  for (const m of clubManagers(db, req.from_club_id)) {
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

// ───────────── 부원 · 운영진 ─────────────
// 가입 신청 → 운영진이 수락 → 회장(OWNER)이 운영진(MANAGER)으로 지정. 운영진은 입금 확인·입장 처리·공연 관리를 함께 한다.
function clubManagers(db: Db, clubId: Uuid) {
  return db.club_memberships.filter((m) => m.club_id === clubId && m.status === 'ACTIVE' && (m.role === 'OWNER' || m.role === 'MANAGER'))
}

export function requestClubJoin(db: Db, userId: Uuid | null, clubId: Uuid) {
  requireActiveProfile(db, userId)
  const club = db.clubs.find((c) => c.id === clubId && c.status === 'ACTIVE')
  if (!club) throw new BandyError('승인된 동아리에만 가입 신청할 수 있습니다.')
  let m = db.club_memberships.find((x) => x.club_id === clubId && x.user_id === userId)
  if (m?.status === 'ACTIVE') throw new BandyError('이미 가입한 동아리입니다.')
  if (m?.status === 'PENDING') return m
  if (m) Object.assign(m, { status: 'PENDING', role: 'MEMBER', updated_at: now() })
  else {
    m = { id: uid('m'), user_id: userId!, club_id: clubId, role: 'MEMBER', status: 'PENDING', created_at: now(), updated_at: now() }
    db.club_memberships.push(m)
  }
  for (const x of clubManagers(db, clubId)) {
    notify(db, x.user_id, null, 'CLUB_JOIN_REQUESTED', `${club.name}에 가입 신청이 왔어요.`, `join-req-${m.id}-${x.user_id}-${uid('n')}`)
  }
  return m
}

export function respondClubJoin(db: Db, userId: Uuid | null, membershipId: Uuid, accept: boolean) {
  requireLogin(db, userId)
  const m = db.club_memberships.find((x) => x.id === membershipId)
  if (!m) throw new BandyError('신청을 찾지 못했습니다.')
  requireActiveManager(db, userId, m.club_id, '신청을 찾지 못했습니다.')
  if (m.status !== 'PENDING') throw new BandyError('이미 처리한 신청입니다.')
  m.status = accept ? 'ACTIVE' : 'LEFT'
  m.updated_at = now()
  const club = db.clubs.find((c) => c.id === m.club_id)!
  notify(db, m.user_id, null, 'CLUB_JOIN_RESPONDED', `${club.name}${accept ? ' 가입이 수락됐어요.' : ' 가입 신청이 거절됐어요.'}`,
    `join-res-${m.id}-${uid('n')}`)
}

export function setMemberRole(db: Db, userId: Uuid | null, membershipId: Uuid, role: 'MANAGER' | 'MEMBER') {
  requireLogin(db, userId)
  const m = db.club_memberships.find((x) => x.id === membershipId)
  if (!m || !isOwner(db, userId, m.club_id)) throw new BandyError('회장만 역할을 바꿀 수 있습니다.')
  if (m.role === 'OWNER') throw new BandyError('회장의 역할은 바꿀 수 없습니다.')
  if (m.status !== 'ACTIVE') throw new BandyError('가입한 부원만 역할을 바꿀 수 있습니다.')
  if (m.role === role) return
  m.role = role
  m.updated_at = now()
  const club = db.clubs.find((c) => c.id === m.club_id)!
  notify(db, m.user_id, null, 'CLUB_ROLE', role === 'MANAGER'
    ? `${club.name} 운영진이 됐어요. 입금 확인과 입장 처리를 할 수 있어요.`
    : `${club.name} 운영진에서 부원으로 바뀌었어요.`, `role-${m.id}-${role}-${uid('n')}`)
}

// 내보내기(회장) 또는 탈퇴(본인). 회장은 탈퇴하지 않는다
export function removeMember(db: Db, userId: Uuid | null, membershipId: Uuid) {
  requireLogin(db, userId)
  const m = db.club_memberships.find((x) => x.id === membershipId)
  if (!m || !(m.user_id === userId || isOwner(db, userId, m.club_id))) throw new BandyError('부원을 찾지 못했습니다.')
  if (m.role === 'OWNER') throw new BandyError('회장은 탈퇴하거나 내보낼 수 없습니다.')
  Object.assign(m, { status: 'LEFT', role: 'MEMBER', updated_at: now() })
}

// ───────────── 오타 · 실수 바로잡기 (서버 함수와 같은 규칙) ─────────────
export function updateDepositorName(db: Db, userId: Uuid | null, bookingId: Uuid, name: string) {
  requireLogin(db, userId)
  const b = db.bookings.find((x) => x.id === bookingId)
  if (!b || b.user_id !== userId) throw new BandyError('예매를 찾지 못했습니다.')
  if (b.status !== 'PENDING_PAYMENT') throw new BandyError('입금 확인 전 예매만 입금자명을 고칠 수 있어요.')
  const v = name.trim()
  if (!v || v.length > 20) throw new BandyError('입금자명은 1~20자로 입력하세요.')
  const pay = db.payments.find((p) => p.booking_id === b.id && p.status === 'PENDING')
  if (pay) Object.assign(pay, { depositor_name: v, updated_at: now() })
}

export function updateRefundAccount(db: Db, userId: Uuid | null, bookingId: Uuid, account: string) {
  requireLogin(db, userId)
  const b = db.bookings.find((x) => x.id === bookingId)
  if (!b || b.user_id !== userId) throw new BandyError('예매를 찾지 못했습니다.')
  const v = account.trim()
  if (v.length < 5 || v.length > 60) throw new BandyError('환불받을 계좌(은행 · 계좌번호 · 예금주)를 적어 주세요.')
  const pay = db.payments.find((p) => p.booking_id === b.id && p.status === 'REFUND_PENDING')
  if (!pay) throw new BandyError('환불 대기 중인 예매만 계좌를 고칠 수 있어요.')
  Object.assign(pay, { refund_account: v, updated_at: now() })
}

// 운영진: 잘못 누른 입금 확인 되돌리기(입장한 티켓이 없을 때)
export function undoConfirmDeposit(db: Db, userId: Uuid | null, bookingId: Uuid) {
  requireLogin(db, userId)
  const b = db.bookings.find((x) => x.id === bookingId)
  const e = b && db.events.find((x) => x.id === b.event_id)
  if (!b || !e) throw new BandyError('예매를 찾지 못했습니다.')
  requireActiveManager(db, userId, e.club_id, '예매를 찾지 못했습니다.')
  if (b.status !== 'CONFIRMED' || b.total_amount_krw === 0) throw new BandyError('입금 확인된 유료 예매만 되돌릴 수 있어요.')
  const tickets = db.tickets.filter((t) => t.booking_id === b.id)
  if (tickets.some((t) => t.status === 'CHECKED_IN')) throw new BandyError('이미 입장한 티켓이 있어 되돌릴 수 없어요.')
  const pay = db.payments.find((p) => p.booking_id === b.id && p.status === 'SUCCEEDED')
  if (!pay) throw new BandyError('환불이 진행 중인 예매는 되돌릴 수 없어요.')
  const item = db.booking_items.find((i) => i.booking_id === b.id)!
  const tt = db.ticket_types.find((t) => t.id === item.ticket_type_id)!
  for (const t of tickets) if (t.status === 'ISSUED') Object.assign(t, { status: 'CANCELLED', updated_at: now() })
  for (const q of db.qr_credentials) if (tickets.some((t) => t.id === q.ticket_id) && !q.revoked_at) q.revoked_at = now()
  const keep = Math.max(new Date(b.expires_at).getTime(), Math.min(Date.now() + 24 * 3600000, new Date(eventEnd(e)).getTime()))
  Object.assign(b, { status: 'PENDING_PAYMENT', confirmed_at: null, expires_at: new Date(keep).toISOString(), updated_at: now() })
  Object.assign(pay, { status: 'PENDING', approved_at: null, confirmed_by: null, updated_at: now() })
  tt.sold_quantity -= item.quantity
  tt.reserved_quantity += item.quantity
  notify(db, b.user_id, e.id, 'DEPOSIT_UNCONFIRMED', `[${e.title}] 입금 확인이 취소됐어요(운영진 확인 착오). 입금했다면 주최 동아리에 문의해 주세요.`, `deposit-undo-${b.id}-${uid('n')}`)
}

// 운영진: 기한이 지나 만료된 뒤 들어온 입금 확인(자리가 남고 공연이 끝나기 전)
export function confirmLateDeposit(db: Db, userId: Uuid | null, bookingId: Uuid) {
  requireLogin(db, userId)
  const b = db.bookings.find((x) => x.id === bookingId)
  const e = b && db.events.find((x) => x.id === b.event_id)
  if (!b || !e) throw new BandyError('예매를 찾지 못했습니다.')
  requireActiveManager(db, userId, e.club_id, '예매를 찾지 못했습니다.')
  if (b.status !== 'EXPIRED') throw new BandyError('만료된 예매만 늦은 입금으로 확인할 수 있어요.')
  if (e.status === 'CANCELLED' || isEventOver(e)) throw new BandyError('취소됐거나 끝난 공연이에요. 입금액은 돌려주세요.')
  const item = db.booking_items.find((i) => i.booking_id === b.id)!
  const tt = db.ticket_types.find((t) => t.id === item.ticket_type_id)!
  if (remaining(tt) < item.quantity) throw new BandyError('남은 자리가 없어 확인할 수 없어요. 입금액은 돌려주세요.')
  tt.reserved_quantity += item.quantity
  b.status = 'PENDING_PAYMENT'
  const pay = db.payments.find((p) => p.booking_id === b.id && p.status === 'FAILED' && p.failure_code === 'EXPIRED')
  if (pay) Object.assign(pay, { status: 'PENDING', failure_code: null })
  confirmBookingInternal(db, b, userId)
}

// 운영진: 잘못 누른 입장 처리 되돌리기(공연이 끝나기 전)
export function undoCheckIn(db: Db, userId: Uuid | null, ticketId: Uuid) {
  requireActiveProfile(db, userId)
  const t = db.tickets.find((x) => x.id === ticketId)
  if (!t || !isEventStaff(db, userId, t.event_id)) throw new BandyError('티켓을 찾지 못했습니다.')
  if (t.status !== 'CHECKED_IN') throw new BandyError('입장 처리된 티켓이 아니에요.')
  const e = db.events.find((x) => x.id === t.event_id)
  if (e && isEventOver(e)) throw new BandyError('끝난 공연의 입장 기록은 바꿀 수 없어요.')
  Object.assign(t, { status: 'ISSUED', checked_in_at: null, checked_in_by: null, updated_at: now() })
}

// 회장 넘기기: 다른 부원에게 회장을 넘기고 자신은 운영진이 된다
export function transferOwnership(db: Db, userId: Uuid | null, membershipId: Uuid) {
  requireActiveProfile(db, userId)
  const m = db.club_memberships.find((x) => x.id === membershipId)
  if (!m) throw new BandyError('부원을 찾지 못했습니다.')
  const me = db.club_memberships.find((x) => x.club_id === m.club_id && x.user_id === userId && x.role === 'OWNER' && x.status === 'ACTIVE')
  if (!me) throw new BandyError('회장만 넘길 수 있습니다.')
  if (m.id === me.id) throw new BandyError('이미 회장이에요.')
  if (m.status !== 'ACTIVE') throw new BandyError('가입한 부원에게만 넘길 수 있어요.')
  Object.assign(me, { role: 'MANAGER', updated_at: now() })
  Object.assign(m, { role: 'OWNER', updated_at: now() })
  const club = db.clubs.find((c) => c.id === m.club_id)!
  notify(db, m.user_id, null, 'CLUB_ROLE', `${club.name} 회장이 됐어요.`, `owner-${m.id}-${uid('n')}`)
}

// ───────────── 사용자 편의(모바일) ─────────────
// 예매자의 '입금했어요' → 주최 운영진 알림. 10분에 한 번까지 (서버 mark_deposit_sent와 같음)
export function markDepositSent(db: Db, userId: Uuid | null, bookingId: Uuid) {
  requireLogin(db, userId)
  const b = db.bookings.find((x) => x.id === bookingId)
  if (!b || b.user_id !== userId) throw new BandyError('예매를 찾지 못했습니다.')
  if (b.status !== 'PENDING_PAYMENT' || pastDeadline(b)) throw new BandyError('입금 대기 중인 예매가 아닙니다.')
  const pay = db.payments.find((p) => p.booking_id === b.id && p.status === 'PENDING')!
  if ((pay.depositor_notify_count ?? 0) > 0 && Date.now() - new Date(pay.updated_at).getTime() < 10 * 60000) {
    throw new BandyError('이미 알렸어요. 잠시 후 다시 눌러 주세요.')
  }
  if ((pay.depositor_notify_count ?? 0) >= 3) throw new BandyError('이미 여러 번 알렸어요. 주최 동아리에 직접 문의해 주세요.')
  pay.depositor_notified_at = pay.depositor_notified_at ?? now() // 처음 누른 시각 유지
  pay.depositor_notify_count = (pay.depositor_notify_count ?? 0) + 1
  pay.updated_at = now()
  const ev = db.events.find((e) => e.id === b.event_id)!
  for (const m of clubManagers(db, ev.club_id)) {
    notify(db, m.user_id, ev.id, 'DEPOSIT_SENT', `[${ev.title}] ${pay.depositor_name}님이 입금했다고 알렸어요. 입금 확인해 주세요.`, `deposit-sent-${pay.id}-${m.user_id}-${uid('n')}`)
  }
}

// 일정 변경 확인: '유지'
export function ackEventChange(db: Db, userId: Uuid | null, bookingId: Uuid) {
  requireLogin(db, userId)
  const b = db.bookings.find((x) => x.id === bookingId && x.user_id === userId)
  if (!b) throw new BandyError('예매를 찾지 못했습니다.')
  b.change_ack_at = now()
  b.updated_at = now()
}

// 확정 예매의 취소·환불 요청: 공연 취소 또는 예매 뒤 일시·장소 변경일 때만(서버 request_refund와 같음)
export function requestRefund(db: Db, userId: Uuid | null, bookingId: Uuid, refundAccount: string) {
  requireLogin(db, userId)
  const b = db.bookings.find((x) => x.id === bookingId)
  if (!b || b.user_id !== userId) throw new BandyError('예매를 찾지 못했습니다.')
  const e = db.events.find((x) => x.id === b.event_id)!
  if (!(e.status === 'CANCELLED' || (e.schedule_changed_at && e.schedule_changed_at > b.created_at))) {
    throw new BandyError('공연이 취소되거나 일정이 바뀐 경우에만 환불을 요청할 수 있어요. 그 밖에는 주최 동아리에 문의해 주세요.')
  }
  if (e.status !== 'CANCELLED' && isPastEvent(e)) throw new BandyError('공연이 이미 시작됐어요.')
  const acct = refundAccount.trim()
  if (b.total_amount_krw > 0 && (acct.length < 5 || acct.length > 60)) throw new BandyError('환불받을 계좌(은행 · 계좌번호 · 예금주)를 적어 주세요.')
  if (b.status !== 'CONFIRMED') throw new BandyError('확정된 예매만 환불을 요청할 수 있어요. 입금 전이면 예매 취소를 눌러 주세요.')
  const tickets = db.tickets.filter((x) => x.booking_id === b.id)
  if (tickets.some((x) => x.status === 'CHECKED_IN')) throw new BandyError('이미 입장한 티켓이 있어 환불을 요청할 수 없어요.')
  const item = db.booking_items.find((i) => i.booking_id === b.id)!
  const tt = db.ticket_types.find((x) => x.id === item.ticket_type_id)!
  Object.assign(b, { status: 'CANCELLED', cancelled_at: now(), updated_at: now() })
  for (const tk of tickets) if (tk.status === 'ISSUED') Object.assign(tk, { status: 'CANCELLED', updated_at: now() })
  for (const q of db.qr_credentials) if (tickets.some((tk) => tk.id === q.ticket_id) && !q.revoked_at) q.revoked_at = now()
  tt.sold_quantity -= item.quantity
  const pay = db.payments.find((p) => p.booking_id === b.id && p.status === 'SUCCEEDED')
  if (pay) {
    Object.assign(pay, {
      status: b.total_amount_krw > 0 ? 'REFUND_PENDING' : 'REFUNDED', refund_account: acct, refund_requested_at: now(),
      refunded_at: b.total_amount_krw > 0 ? null : now(), updated_at: now(),
    })
  }
  if (b.total_amount_krw > 0) {
    for (const m of clubManagers(db, e.club_id)) {
      notify(db, m.user_id, e.id, 'REFUND_REQUESTED', `[${e.title}] 환불 요청이 왔어요. ${b.total_amount_krw}원을 보내고 환불 완료를 눌러 주세요.`, `refund-req-${b.id}-${m.user_id}`)
    }
  }
}

// 운영진의 '환불 완료'. 동아리가 정지돼도 환불 처리는 된다
export function markRefunded(db: Db, userId: Uuid | null, bookingId: Uuid) {
  requireActiveProfile(db, userId)
  const b = db.bookings.find((x) => x.id === bookingId)
  const e = b && db.events.find((x) => x.id === b.event_id)
  if (!b || !e || !isClubManager(db, userId, e.club_id)) throw new BandyError('예매를 찾지 못했습니다.')
  const pay = db.payments.find((p) => p.booking_id === b.id && p.status === 'REFUND_PENDING')
  if (!pay) throw new BandyError('환불 대기 중인 예매가 아닙니다.')
  Object.assign(pay, { status: 'REFUNDED', refunded_at: now(), refund_account: '', updated_at: now() }) // 환불을 마치면 계좌 삭제
  notify(db, b.user_id, e.id, 'REFUNDED', `[${e.title}] 환불이 완료됐어요. 계좌를 확인해 주세요.`, `refunded-${b.id}`)
}

// 앱을 열 때 받는 '홈 신호' (서버 my_home_state와 같은 규칙)
export function homeState(db: Db, userId: Uuid | null): HomeState {
  if (!userId) return { signed_in: false }
  const t = Date.now()
  const H = 3600000
  const evOf = (id: Uuid) => db.events.find((e) => e.id === id)
  const mine = db.tickets.filter((x) => x.user_id === userId && x.status === 'ISSUED')
    .map((x) => ({ x, e: evOf(x.event_id) }))
    .filter(({ e }) => e && e.status !== 'CANCELLED' && !isEventOver(e) && new Date(e.starts_at).getTime() <= t + 24 * H)
    .sort((a, b) => a.e!.starts_at.localeCompare(b.e!.starts_at) || (a.x.entry_number ?? 0) - (b.x.entry_number ?? 0))
  const first = mine[0]
  const nextTicket = first ? {
    ticket_id: first.x.id, event_id: first.e!.id, title: first.e!.title, starts_at: first.e!.starts_at, venue_name: first.e!.venue_name,
    entry_number: first.x.entry_number, ticket_count: mine.filter((m) => m.e!.id === first.e!.id).length,
  } : null
  const staffEvents = db.events
    .filter((e) => e.status === 'PUBLISHED' && isClubManager(db, userId, e.club_id)
      && db.clubs.find((c) => c.id === e.club_id)?.status === 'ACTIVE' && db.profiles.find((p) => p.id === userId)?.status !== 'SUSPENDED'
      && !isEventOver(e) && new Date(e.starts_at).getTime() <= t + 24 * H)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((e) => ({
      event_id: e.id, title: e.title, starts_at: e.starts_at,
      checked_in: db.tickets.filter((x) => x.event_id === e.id && x.status === 'CHECKED_IN').length,
      issued: db.tickets.filter((x) => x.event_id === e.id && x.status !== 'CANCELLED').length,
      pending_deposits: db.bookings.filter((b) => b.event_id === e.id && b.status === 'PENDING_PAYMENT' && !isOverdue(b, db)).length,
    }))
  const pendingPayments = db.bookings
    .filter((b) => b.user_id === userId && b.status === 'PENDING_PAYMENT' && !isOverdue(b, db))
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at))
    .map((b) => {
      const e = evOf(b.event_id)!
      const p = db.payments.find((x) => x.booking_id === b.id)
      return {
        booking_id: b.id, event_id: e.id, title: e.title, total_amount_krw: b.total_amount_krw, expires_at: b.expires_at,
        bank_name: e.bank_name, account_number: e.account_number, account_holder: e.account_holder,
        depositor_name: p?.depositor_name ?? '', depositor_notified_at: p?.depositor_notified_at ?? null,
      }
    })
  // 일정·장소가 바뀐 뒤 아직 '유지'를 고르지 않은 내 예매(공연 시작 전까지)
  const changedBookings = db.bookings
    .filter((b) => b.user_id === userId && (b.status === 'PENDING_PAYMENT' || b.status === 'CONFIRMED'))
    .map((b) => ({ b, e: evOf(b.event_id) }))
    .filter(({ b, e }) => e && e.status !== 'CANCELLED' && e.schedule_changed_at && e.schedule_changed_at > (b.change_ack_at ?? b.created_at)
      && new Date(e.starts_at).getTime() > t)
    .map(({ b, e }) => ({
      booking_id: b.id, event_id: e!.id, title: e!.title, starts_at: e!.starts_at, ends_at: e!.ends_at, venue_name: e!.venue_name,
      status: b.status as 'PENDING_PAYMENT' | 'CONFIRMED', schedule_changed_at: e!.schedule_changed_at!,
      previous_starts_at: e!.previous_starts_at ?? null, previous_venue_name: e!.previous_venue_name ?? null,
    }))
  const managedClubs = managerClubIds(db, userId)
  const refundRequests = db.payments.filter((p) => p.status === 'REFUND_PENDING').map((p) => {
    const b = db.bookings.find((x) => x.id === p.booking_id)!
    const e = evOf(b.event_id)!
    return { booking_id: b.id, event_id: e.id, club_id: e.club_id, title: e.title, total_amount_krw: b.total_amount_krw, refund_requested_at: p.refund_requested_at ?? '' }
  }).filter((r) => managedClubs.includes(r.club_id))
  const prompt = changedBookings.length > 0 ? 'EVENT_CHANGED'
    : nextTicket && new Date(nextTicket.starts_at).getTime() <= t + 3 * H ? 'TICKET_NOW'
    : staffEvents.length > 0 ? 'STAFF_TODAY'
      : pendingPayments.some((p) => new Date(p.expires_at).getTime() <= t + 24 * H && !p.depositor_notified_at) ? 'PAYMENT_DUE'
        : null
  const managed = managerClubIds(db, userId)
  return {
    signed_in: true, now: new Date(t).toISOString(), prompt, next_ticket: nextTicket, staff_events: staffEvents, pending_payments: pendingPayments,
    changed_bookings: changedBookings, refund_requests: refundRequests,
    unread_notifications: db.notifications.filter((n) => n.user_id === userId && !n.read_at).length,
    join_requests: db.club_memberships.filter((m) => m.status === 'PENDING' && managed.includes(m.club_id)).length,
    exchange_requests: db.exchange_requests.filter((r) => r.status === 'PENDING' && managed.includes(r.to_club_id)).length,
  }
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
