// 노션 「밴디_Supabase_DB_설계초안_SQL기준」(202610140001_bandy_initial_schema.sql)의 테이블과 같은 모양.
// 필드 이름은 DB 컬럼(snake_case) 그대로 둔다. 나중에 Supabase 응답을 그대로 넣을 수 있게 하려는 것.
// [11/1 추가] 표시가 붙은 것은 초기 SQL에 없고 11/1 회의 결정으로 더한 항목이다(새 migration 필요).
// 상태값 대문자 단어는 노션 문서에 나온 것을 따랐다. 문서에 보이지 않은 값은 [확인 필요]로 표시했다.

export type Uuid = string
export type Timestamp = string // ISO8601

export type ProfileStatus = 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN'
export interface Profile {
  id: Uuid
  display_name: string
  profile_path: string | null
  status: ProfileStatus
  is_admin: boolean // [11/1 추가] 동아리 수동 승인을 할 운영자
  created_at: Timestamp
  updated_at: Timestamp
}

export type ClubStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'
export interface Club {
  id: Uuid
  name: string
  introduction: string | null
  city: string | null
  profile_path: string | null
  sns_url: string | null
  status: ClubStatus
  // [11/1 추가] 동아리 찾기 프로필
  school: string
  genre: string
  region: string
  exchange_open: boolean
  open_chat_url: string // 교류가 수락된 동아리끼리만 보여 준다
  created_at: Timestamp
  updated_at: Timestamp
}

export type MembershipRole = 'OWNER' | 'MANAGER' | 'MEMBER'
export interface ClubMembership {
  id: Uuid
  user_id: Uuid
  club_id: Uuid
  role: MembershipRole
  status: 'ACTIVE' | 'PENDING' | 'LEFT' // PENDING = 가입 신청 대기, LEFT = 탈퇴·거절
  created_at: Timestamp
  updated_at: Timestamp
}

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'ENDED' | 'CANCELLED'
export type EventCategory = '공연' | '해커톤' | '학술회' | '네트워킹'
export interface EventRow {
  id: Uuid
  club_id: Uuid
  created_by: Uuid
  title: string
  description: string | null
  category: EventCategory | null
  starts_at: Timestamp
  ends_at: Timestamp | null
  admission_starts_at: Timestamp | null
  admission_ends_at: Timestamp | null
  timezone: string
  venue_name: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  poster_path: string | null
  status: EventStatus
  published_at: Timestamp | null
  schedule_changed_at?: Timestamp | null // [편의] 일시·장소가 바뀐 시각(이전 예매자는 유지 또는 환불 요청 선택)
  previous_starts_at?: Timestamp | null // 바뀌기 전 일시
  previous_venue_name?: string | null // 바뀌기 전 장소
  // [11/1 추가] 입금자명 방식 결제 안내
  bank_name: string
  account_number: string
  account_holder: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface TicketType {
  id: Uuid
  event_id: Uuid
  name: string
  price_krw: number
  capacity: number
  reserved_quantity: number
  sold_quantity: number
  sales_starts_at: Timestamp
  sales_ends_at: Timestamp
  status: 'ACTIVE' | 'INACTIVE'
  created_at: Timestamp
  updated_at: Timestamp
}

export type BookingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'
export interface Booking {
  id: Uuid
  user_id: Uuid
  event_id: Uuid
  status: BookingStatus
  total_amount_krw: number
  expires_at: Timestamp
  confirmed_at: Timestamp | null
  change_ack_at?: Timestamp | null // [편의] 일정 변경을 확인하고 '유지'를 고른 시각
  cancelled_at: Timestamp | null
  idempotency_key: string
  request_hash: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface BookingItem {
  id: Uuid
  booking_id: Uuid
  event_id: Uuid
  user_id: Uuid
  ticket_type_id: Uuid
  quantity: number
  unit_price_krw: number
  ticket_type_name: string
  created_at: Timestamp
}

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED' // SUCCEEDED·REFUND_PENDING만 문서 확인
export interface Payment {
  id: Uuid
  booking_id: Uuid
  provider: 'BANK_TRANSFER' | 'TOSS' // [11/1 추가] 12월 공연은 BANK_TRANSFER
  environment: 'TEST' | 'LIVE'
  provider_order_id: string
  provider_payment_key: string | null
  status: PaymentStatus
  depositor_name: string // [11/1 추가] 입금자명
  confirmed_by: Uuid | null // [11/1 추가] 입금 확인한 동아리 운영진
  depositor_notified_at?: Timestamp | null // [편의] 예매자가 '입금했어요'를 누른 시각
  refund_account?: string // [편의] 환불받을 계좌(예매자 입력)
  refund_requested_at?: Timestamp | null
  refunded_at?: Timestamp | null
  depositor_notify_count?: number // '입금했어요' 누른 횟수(최대 3)
  approved_at: Timestamp | null
  failure_code: string | null
  reconciliation_required: boolean
  created_at: Timestamp
  updated_at: Timestamp
}

export type TicketStatus = 'ISSUED' | 'CHECKED_IN' | 'CANCELLED' // CHECKED_IN만 문서 확인
export interface Ticket {
  id: Uuid
  booking_id: Uuid
  booking_item_id: Uuid
  user_id: Uuid
  event_id: Uuid
  issue_sequence: number
  entry_number: number | null
  status: TicketStatus
  seat_info: string | null
  issued_at: Timestamp
  ticket_received_at: Timestamp | null
  checked_in_at: Timestamp | null
  checked_in_by: Uuid | null
  created_at: Timestamp
  updated_at: Timestamp
}

// DB에는 token_hash만 둔다. 프로토타입은 화면에 QR을 그려야 해서 원문 token을 같이 들고 있다.
export interface QrCredential {
  id: Uuid
  ticket_id: Uuid
  token_hash: string
  token: string // 프로토타입 전용. 실제 DB 컬럼 아님
  expires_at: Timestamp
  revoked_at: Timestamp | null
  created_at: Timestamp
}

export interface EventStaff {
  id: Uuid
  event_id: Uuid
  user_id: Uuid
  role: 'MANAGER' | 'SCANNER' // [확인 필요]
  status: 'ACTIVE'
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Notification {
  id: Uuid
  user_id: Uuid
  event_id: Uuid | null
  type: string
  message: string
  source_key: string
  read_at: Timestamp | null
  created_at: Timestamp
}

// [11/1 추가] 교류 신청. 초기 SQL에 없는 테이블
export type ExchangeKind = 'JOINT_SHOW' | 'PRACTICE' | 'WATCH_SWAP'
export type ExchangeStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED'
export interface ExchangeRequest {
  id: Uuid
  from_club_id: Uuid
  to_club_id: Uuid
  kind: ExchangeKind
  message: string
  status: ExchangeStatus
  created_by: Uuid
  responded_by: Uuid | null
  responded_at: Timestamp | null
  created_at: Timestamp
}

export interface Db {
  profiles: Profile[]
  clubs: Club[]
  club_memberships: ClubMembership[]
  events: EventRow[]
  ticket_types: TicketType[]
  bookings: Booking[]
  booking_items: BookingItem[]
  payments: Payment[]
  tickets: Ticket[]
  qr_credentials: QrCredential[]
  event_staff: EventStaff[]
  notifications: Notification[]
  exchange_requests: ExchangeRequest[]
}

// 앱을 열 때 받는 '홈 신호'(서버 my_home_state와 같은 모양). prompt로 바로 띄울 창을 정한다
export type HomePrompt = 'EVENT_CHANGED' | 'TICKET_NOW' | 'STAFF_TODAY' | 'PAYMENT_DUE' | null
export interface HomeState {
  signed_in: boolean
  now?: Timestamp
  prompt?: HomePrompt
  next_ticket?: {
    ticket_id: Uuid; event_id: Uuid; title: string; starts_at: Timestamp; venue_name: string | null
    entry_number: number | null; ticket_count: number
  } | null
  staff_events?: Array<{ event_id: Uuid; title: string; starts_at: Timestamp; checked_in: number; issued: number; pending_deposits: number }>
  pending_payments?: Array<{
    booking_id: Uuid; event_id: Uuid; title: string; total_amount_krw: number; expires_at: Timestamp
    bank_name: string; account_number: string; account_holder: string; depositor_name: string; depositor_notified_at: Timestamp | null
  }>
  changed_bookings?: Array<{
    booking_id: Uuid; event_id: Uuid; title: string; starts_at: Timestamp; ends_at: Timestamp | null; venue_name: string | null
    status: 'PENDING_PAYMENT' | 'CONFIRMED'; schedule_changed_at: Timestamp
    previous_starts_at: Timestamp | null; previous_venue_name: string | null
  }>
  refund_requests?: Array<{ booking_id: Uuid; event_id: Uuid; club_id: Uuid; title: string; total_amount_krw: number; refund_requested_at: Timestamp }>
  unread_notifications?: number
  join_requests?: number
  exchange_requests?: number
}

export const EXCHANGE_KIND_LABEL: Record<ExchangeKind, string> = {
  JOINT_SHOW: '합동 공연',
  PRACTICE: '연습 교류',
  WATCH_SWAP: '관람 교환',
}
