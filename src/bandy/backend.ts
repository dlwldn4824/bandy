// 화면이 부르는 기능 목록. 두 가지 구현이 있다.
//  - SupabaseBackend: VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY가 있으면 실제 Supabase(DB 함수)를 부른다.
//  - LocalBackend: 없으면 브라우저 저장소로 도는 데모. 규칙은 repo.ts(= supabase/migrations의 DB 함수와 같은 규칙).
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Club, Db, EventRow, ExchangeKind, HomeState } from './types'
import * as repo from './repo'
import { BandyError, initialDb, loadDb, saveDb } from './repo'

// 서버 오류를 코드와 함께 들고 다닌다(사용자 메시지는 friendlyError에서 만든다)
export class BackendError extends BandyError {
  constructor(message: string, public code?: string) { super(message) }
}

const HANGUL = /[가-힣]/
// 알 수 없는 영어 오류·네트워크 오류를 사용자용 한국어 메시지로 바꾼다. DB 함수가 낸 한국어 메시지는 그대로 쓴다.
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  const code = e instanceof BackendError ? e.code : undefined
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) return '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'
  if (/Invalid login credentials/i.test(msg)) return '이메일 또는 비밀번호가 맞지 않아요.'
  if (/already registered|already been registered/i.test(msg)) return '이미 가입된 이메일이에요.'
  if (/Email not confirmed/i.test(msg)) return '메일 인증을 먼저 완료해 주세요.'
  if (/Password should be at least/i.test(msg)) return '비밀번호는 6자 이상이어야 해요.'
  if (/rate limit/i.test(msg)) return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'
  if (code === 'PGRST301' || /JWT expired|invalid JWT/i.test(msg)) return '로그인이 만료됐어요. 다시 로그인해 주세요.'
  if (code === 'PGRST202' || /Could not find the function/i.test(msg)) return '서버 기능이 아직 설치되지 않았어요. (DB migration 적용 필요)'
  if (code === '42P01' || /relation .* does not exist/i.test(msg)) return '서버 테이블이 아직 없어요. (DB migration 적용 필요)'
  if (HANGUL.test(msg)) return msg
  if (code === '42501' || /permission denied/i.test(msg)) return '권한이 없어요.'
  if (code === '23505') return '이미 처리된 요청이에요.'
  return `알 수 없는 오류가 발생했어요.${msg ? ` (${msg})` : ''}`
}

export type CheckResult = {
  result: 'valid' | 'already_checked_in' | 'invalid'
  ticket_id?: string; entry_number?: number | null; owner_name?: string; ticket_type?: string; depositor_name?: string
}

export type EventInput = {
  title: string; category: EventRow['category']; starts_at: string; venue_name: string; address: string; description: string
  price_krw: number; capacity: number; bank_name: string; account_number: string; poster_path: string | null; publish?: boolean
  duration_minutes?: number // 진행 시간(분). 진행 중 판단·QR 유효시간·홈 신호의 기준
  account_holder?: string // 입금 계좌의 실제 예금주(비우면 동아리 이름)
}
export type ClubInput = {
  name: string; school: string; genre: string; region: string; introduction: string; sns_url: string
  open_chat_url: string; exchange_open: boolean; profile_path: string | null
}
export type ClubPatch = Partial<Omit<ClubInput, 'sns_url'> & { sns_url: string | null }>

export interface Backend {
  mode: 'local' | 'supabase'
  load(): Promise<Db>
  currentUserId(): Promise<string | null>
  onAuthChange(cb: () => void): () => void
  // 인증
  signInPersona(userId: string): Promise<void>
  signInEmail(email: string, password: string): Promise<void>
  signUpEmail(email: string, password: string, name: string): Promise<void>
  signInKakao(next?: string): Promise<void>
  signOut(): Promise<void>
  // 비밀번호 재설정: 메일 보내기 → 메일의 링크로 돌아오면 새 비밀번호 저장
  sendPasswordReset(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  reset(): Promise<void>
  // 기능 (구조도 + 11/1)
  updateProfile(name: string): Promise<void>
  createClub(input: ClubInput): Promise<string>
  updateClub(clubId: string, patch: ClubPatch): Promise<void>
  setClubStatus(clubId: string, status: Club['status']): Promise<void>
  createEvent(clubId: string, input: EventInput): Promise<string>
  updateEvent(eventId: string, input: EventInput): Promise<void>
  setEventStatus(eventId: string, status: EventRow['status']): Promise<void>
  deleteEvent(eventId: string): Promise<void>
  createBooking(ticketTypeId: string, quantity: number, depositor: string, idempotencyKey: string): Promise<string>
  confirmDeposit(bookingId: string): Promise<'CONFIRMED' | 'EXPIRED'>
  cancelBooking(bookingId: string): Promise<void>
  issueTicketQr(ticketId: string): Promise<string>
  verifyTicket(eventId: string, token: string): Promise<CheckResult>
  checkIn(eventId: string, token: string): Promise<CheckResult>
  requestExchange(fromClubId: string, toClubId: string, kind: ExchangeKind, message: string): Promise<string>
  respondExchange(requestId: string, accept: boolean): Promise<void>
  cancelExchange(requestId: string): Promise<void>
  markNotificationsRead(id?: string): Promise<void>
  // 부원 · 운영진
  requestClubJoin(clubId: string): Promise<void>
  respondClubJoin(membershipId: string, accept: boolean): Promise<void>
  setMemberRole(membershipId: string, role: 'MANAGER' | 'MEMBER'): Promise<void>
  removeMember(membershipId: string): Promise<void>
  // 모바일 편의: 홈 신호(앱을 열 때 바로 띄울 창), 입금했어요 알림
  homeState(): Promise<HomeState>
  markDepositSent(bookingId: string): Promise<void>
  // 일정 변경·공연 취소 후: 유지 / 취소·환불 요청, 운영진의 환불 완료
  ackEventChange(bookingId: string): Promise<void>
  requestRefund(bookingId: string, refundAccount: string): Promise<void>
  markRefunded(bookingId: string): Promise<void>
  // 오타 · 실수 바로잡기
  updateDepositorName(bookingId: string, name: string): Promise<void>
  updateRefundAccount(bookingId: string, account: string): Promise<void>
  undoConfirmDeposit(bookingId: string): Promise<void>
  confirmLateDeposit(bookingId: string): Promise<void>
  undoCheckIn(ticketId: string): Promise<void>
  transferOwnership(membershipId: string): Promise<void>
}

// ───────────────────────── 브라우저 데모 ─────────────────────────
const SESSION_KEY = 'bandy-prototype-session'

class LocalBackend implements Backend {
  mode = 'local' as const
  private db: Db = loadDb()
  private listeners = new Set<() => void>()

  private uid() {
    try { return localStorage.getItem(SESSION_KEY) } catch { return null }
  }
  private mutate<T>(fn: (db: Db, uid: string | null) => T): T {
    const draft = structuredClone(this.db)
    const value = fn(draft, this.uid())
    this.db = draft
    saveDb(draft)
    return value
  }
  private info(db: Db, r: repo.CheckInResult): CheckResult {
    if (r.result === 'invalid') return { result: 'invalid' }
    const t = r.ticket
    return {
      result: r.result, ticket_id: t.id, entry_number: t.entry_number,
      owner_name: db.profiles.find((p) => p.id === t.user_id)?.display_name,
      ticket_type: db.booking_items.find((i) => i.id === t.booking_item_id)?.ticket_type_name,
      depositor_name: db.payments.find((p) => p.booking_id === t.booking_id)?.depositor_name,
    }
  }

  async load() { return this.db }
  async currentUserId() { return this.uid() }
  onAuthChange(cb: () => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb) } }
  private emit() { this.listeners.forEach((cb) => cb()) }

  async signInPersona(userId: string) {
    try { localStorage.setItem(SESSION_KEY, userId) } catch { /* 무시 */ }
    this.emit()
  }
  async signInEmail() { throw new BandyError('데모 모드에서는 시연 역할로 로그인해요.') }
  async signUpEmail() { throw new BandyError('데모 모드에서는 시연 역할로 로그인해요.') }
  async signInKakao() { throw new BandyError('데모 모드에서는 시연 역할로 로그인해요.') }
  async signOut() {
    try { localStorage.removeItem(SESSION_KEY) } catch { /* 무시 */ }
    this.emit()
  }
  async sendPasswordReset() { throw new BandyError('데모 모드에서는 비밀번호가 없어요.') }
  async updatePassword() { throw new BandyError('데모 모드에서는 비밀번호가 없어요.') }
  async reset() {
    this.db = initialDb()
    saveDb(this.db)
    await this.signOut()
  }

  async updateProfile(name: string) { this.mutate((d, u) => repo.updateProfile(d, u, name)) }
  async createClub(input: ClubInput) {
    return this.mutate((d, u) => {
      const c = repo.createClub(d, u, input)
      c.profile_path = input.profile_path
      return c.id
    })
  }
  async updateClub(clubId: string, patch: ClubPatch) { this.mutate((d, u) => repo.updateClub(d, u, clubId, patch)) }
  async setClubStatus(clubId: string, status: Club['status']) { this.mutate((d, u) => repo.setClubStatus(d, u, clubId, status)) }
  async createEvent(clubId: string, input: EventInput) {
    return this.mutate((d, u) => repo.createEvent(d, u, clubId, { ...input, publish: !!input.publish }).id)
  }
  async updateEvent(eventId: string, input: EventInput) { this.mutate((d, u) => repo.updateEvent(d, u, eventId, input)) }
  async setEventStatus(eventId: string, status: EventRow['status']) { this.mutate((d, u) => repo.setEventStatus(d, u, eventId, status)) }
  async deleteEvent(eventId: string) { this.mutate((d, u) => repo.deleteEvent(d, u, eventId)) }
  async createBooking(ticketTypeId: string, quantity: number, depositor: string, idempotencyKey: string) {
    return this.mutate((d, u) => repo.createBooking(d, u, ticketTypeId, quantity, depositor, idempotencyKey).id)
  }
  async confirmDeposit(bookingId: string) { return this.mutate((d, u) => repo.confirmDeposit(d, u, bookingId)) }
  async cancelBooking(bookingId: string) { this.mutate((d, u) => repo.cancelBooking(d, u, bookingId)) }
  async issueTicketQr(ticketId: string) { return this.mutate((d, u) => repo.issueTicketQr(d, u, ticketId)) }
  async verifyTicket(eventId: string, token: string) { return this.mutate((d, u) => this.info(d, repo.verifyTicket(d, u, eventId, token))) }
  async checkIn(eventId: string, token: string) { return this.mutate((d, u) => this.info(d, repo.checkIn(d, u, eventId, token))) }
  async requestExchange(fromClubId: string, toClubId: string, kind: ExchangeKind, message: string) {
    return this.mutate((d, u) => repo.requestExchange(d, u, fromClubId, toClubId, kind, message).id)
  }
  async respondExchange(requestId: string, accept: boolean) { this.mutate((d, u) => repo.respondExchange(d, u, requestId, accept)) }
  async cancelExchange(requestId: string) { this.mutate((d, u) => repo.cancelExchange(d, u, requestId)) }
  async markNotificationsRead(id?: string) {
    this.mutate((d, u) => (id ? repo.markNotificationRead(d, u, id) : repo.markNotificationsRead(d, u)))
  }
  async requestClubJoin(clubId: string) { this.mutate((d, u) => { repo.requestClubJoin(d, u, clubId) }) }
  async respondClubJoin(membershipId: string, accept: boolean) { this.mutate((d, u) => repo.respondClubJoin(d, u, membershipId, accept)) }
  async setMemberRole(membershipId: string, role: 'MANAGER' | 'MEMBER') { this.mutate((d, u) => repo.setMemberRole(d, u, membershipId, role)) }
  async removeMember(membershipId: string) { this.mutate((d, u) => repo.removeMember(d, u, membershipId)) }
  async homeState() { return repo.homeState(this.db, this.uid()) }
  async markDepositSent(bookingId: string) { this.mutate((d, u) => repo.markDepositSent(d, u, bookingId)) }
  async ackEventChange(bookingId: string) { this.mutate((d, u) => repo.ackEventChange(d, u, bookingId)) }
  async requestRefund(bookingId: string, refundAccount: string) { this.mutate((d, u) => repo.requestRefund(d, u, bookingId, refundAccount)) }
  async markRefunded(bookingId: string) { this.mutate((d, u) => repo.markRefunded(d, u, bookingId)) }
  async updateDepositorName(bookingId: string, name: string) { this.mutate((d, u) => repo.updateDepositorName(d, u, bookingId, name)) }
  async updateRefundAccount(bookingId: string, account: string) { this.mutate((d, u) => repo.updateRefundAccount(d, u, bookingId, account)) }
  async undoConfirmDeposit(bookingId: string) { this.mutate((d, u) => repo.undoConfirmDeposit(d, u, bookingId)) }
  async confirmLateDeposit(bookingId: string) { this.mutate((d, u) => repo.confirmLateDeposit(d, u, bookingId)) }
  async undoCheckIn(ticketId: string) { this.mutate((d, u) => repo.undoCheckIn(d, u, ticketId)) }
  async transferOwnership(membershipId: string) { this.mutate((d, u) => repo.transferOwnership(d, u, membershipId)) }
}

// ───────────────────────── Supabase ─────────────────────────
class SupabaseBackend implements Backend {
  mode = 'supabase' as const
  constructor(private sb: SupabaseClient) {}

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args)
    if (error) throw new BackendError(error.message, error.code)
    return data as T
  }
  private async rows<T>(table: string): Promise<T[]> {
    const { data, error } = await this.sb.from(table).select('*')
    if (error) {
      // 로그인 전에는 볼 수 없는 테이블이 있다
      if (error.code === '42501') return []
      throw new BackendError(error.message, error.code)
    }
    return (data ?? []) as T[]
  }

  async load(): Promise<Db> {
    const names = ['profiles', 'clubs', 'club_private', 'club_memberships', 'events', 'ticket_types', 'bookings',
      'booking_items', 'payments', 'tickets', 'event_staff', 'notifications', 'exchange_requests'] as const
    const loaded = await Promise.all(names.map((n) => this.rows<Record<string, unknown>>(n)))
    const t = Object.fromEntries(names.map((n, i) => [n, loaded[i]])) as Record<(typeof names)[number], Record<string, unknown>[]>
    const chat = new Map(t.club_private.map((r) => [r.club_id as string, r.open_chat_url as string]))
    const num = (v: unknown) => Number(v ?? 0)
    return {
      profiles: t.profiles as unknown as Db['profiles'],
      clubs: t.clubs.map((c) => ({ ...c, open_chat_url: chat.get(c.id as string) ?? '' })) as unknown as Db['clubs'],
      club_memberships: t.club_memberships as unknown as Db['club_memberships'],
      events: t.events as unknown as Db['events'],
      ticket_types: t.ticket_types.map((r) => ({ ...r, price_krw: num(r.price_krw) })) as unknown as Db['ticket_types'],
      bookings: t.bookings.map((r) => ({ ...r, total_amount_krw: num(r.total_amount_krw) })) as unknown as Db['bookings'],
      booking_items: t.booking_items.map((r) => ({ ...r, unit_price_krw: num(r.unit_price_krw) })) as unknown as Db['booking_items'],
      payments: t.payments as unknown as Db['payments'], // 금액 칸 없음
      tickets: t.tickets as unknown as Db['tickets'],
      qr_credentials: [], // 해시만 있어 앱에서 읽지 않는다. QR은 issueTicketQr로 받는다
      event_staff: t.event_staff as unknown as Db['event_staff'],
      notifications: t.notifications as unknown as Db['notifications'],
      exchange_requests: t.exchange_requests as unknown as Db['exchange_requests'],
    }
  }
  async currentUserId() {
    const { data } = await this.sb.auth.getSession()
    return data.session?.user.id ?? null
  }
  onAuthChange(cb: () => void) {
    // INITIAL_SESSION은 첫 화면 로딩과 겹치고, TOKEN_REFRESHED는 데이터가 바뀌지 않으니 다시 읽지 않는다
    const { data } = this.sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') cb()
    })
    return () => data.subscription.unsubscribe()
  }

  async signInPersona() { throw new BandyError('Supabase 모드에서는 이메일 또는 카카오로 로그인해요.') }
  async signInEmail(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password })
    if (error) throw new BackendError(error.message, error.code)
  }
  async signUpEmail(email: string, password: string, name: string) {
    // 인증 메일의 링크를 누르면 로그인 화면으로 돌아온다(Supabase Auth의 Redirect URLs에 등록 필요)
    const { error } = await this.sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: `${window.location.origin}/app/login` } })
    if (error) throw new BackendError(error.message, error.code)
  }
  async signInKakao(next = '/app') {
    // 카카오 로그인 후 보던 화면으로 돌아온다(Supabase Auth의 Redirect URLs에 이 사이트 주소가 등록돼 있어야 함)
    const { error } = await this.sb.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: `${window.location.origin}${next}` } })
    if (error) throw new BackendError(error.message, error.code)
  }
  async signOut() { await this.sb.auth.signOut() }
  async sendPasswordReset(email: string) {
    // 메일의 링크를 누르면 /app/login?reset=1 로 돌아온다(Supabase Auth의 Redirect URLs에 이 주소가 있어야 함)
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/app/login?reset=1` })
    if (error) throw new BackendError(error.message, error.code)
  }
  async updatePassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password })
    if (error) throw new BackendError(error.message, error.code)
  }
  async reset() { throw new BandyError('Supabase 모드에서는 데이터를 초기화하지 않아요.') }

  async updateProfile(name: string) { await this.rpc('update_profile', { p_display_name: name }) }
  async createClub(input: ClubInput) { return this.rpc<string>('create_club', { p_input: input }) }
  async updateClub(clubId: string, patch: ClubPatch) { await this.rpc('update_club', { p_club_id: clubId, p_patch: patch }) }
  async setClubStatus(clubId: string, status: Club['status']) { await this.rpc('set_club_status', { p_club_id: clubId, p_status: status }) }
  async createEvent(clubId: string, input: EventInput) { return this.rpc<string>('create_event', { p_club_id: clubId, p_input: input }) }
  async updateEvent(eventId: string, input: EventInput) { await this.rpc('update_event', { p_event_id: eventId, p_input: input }) }
  async setEventStatus(eventId: string, status: EventRow['status']) { await this.rpc('set_event_status', { p_event_id: eventId, p_status: status }) }
  async deleteEvent(eventId: string) { await this.rpc('delete_event', { p_event_id: eventId }) }
  async createBooking(ticketTypeId: string, quantity: number, depositor: string, idempotencyKey: string) {
    return this.rpc<string>('create_booking', {
      p_ticket_type_id: ticketTypeId, p_quantity: quantity, p_depositor_name: depositor, p_idempotency_key: idempotencyKey,
    })
  }
  async confirmDeposit(bookingId: string) { return this.rpc<'CONFIRMED' | 'EXPIRED'>('confirm_deposit', { p_booking_id: bookingId }) }
  async cancelBooking(bookingId: string) { await this.rpc('cancel_booking', { p_booking_id: bookingId }) }
  async issueTicketQr(ticketId: string) { return this.rpc<string>('issue_ticket_qr', { p_ticket_id: ticketId }) }
  async verifyTicket(eventId: string, token: string) { return this.rpc<CheckResult>('verify_ticket', { p_event_id: eventId, p_token: token }) }
  async checkIn(eventId: string, token: string) { return this.rpc<CheckResult>('check_in', { p_event_id: eventId, p_token: token }) }
  async requestExchange(fromClubId: string, toClubId: string, kind: ExchangeKind, message: string) {
    return this.rpc<string>('request_exchange', { p_from_club_id: fromClubId, p_to_club_id: toClubId, p_kind: kind, p_message: message })
  }
  async respondExchange(requestId: string, accept: boolean) { await this.rpc('respond_exchange', { p_request_id: requestId, p_accept: accept }) }
  async cancelExchange(requestId: string) { await this.rpc('cancel_exchange', { p_request_id: requestId }) }
  async markNotificationsRead(id?: string) { await this.rpc('mark_notifications_read', { p_id: id ?? null }) }
  async requestClubJoin(clubId: string) { await this.rpc('request_club_join', { p_club_id: clubId }) }
  async respondClubJoin(membershipId: string, accept: boolean) { await this.rpc('respond_club_join', { p_membership_id: membershipId, p_accept: accept }) }
  async setMemberRole(membershipId: string, role: 'MANAGER' | 'MEMBER') { await this.rpc('set_member_role', { p_membership_id: membershipId, p_role: role }) }
  async removeMember(membershipId: string) { await this.rpc('remove_member', { p_membership_id: membershipId }) }
  async homeState() {
    const s = await this.rpc<HomeState>('my_home_state', {})
    // bigint 금액은 숫자로
    s.pending_payments = s.pending_payments?.map((p) => ({ ...p, total_amount_krw: Number(p.total_amount_krw) }))
    s.refund_requests = s.refund_requests?.map((p) => ({ ...p, total_amount_krw: Number(p.total_amount_krw) }))
    return s
  }
  async markDepositSent(bookingId: string) { await this.rpc('mark_deposit_sent', { p_booking_id: bookingId }) }
  async ackEventChange(bookingId: string) { await this.rpc('ack_event_change', { p_booking_id: bookingId }) }
  async requestRefund(bookingId: string, refundAccount: string) { await this.rpc('request_refund', { p_booking_id: bookingId, p_refund_account: refundAccount }) }
  async markRefunded(bookingId: string) { await this.rpc('mark_refunded', { p_booking_id: bookingId }) }
  async updateDepositorName(bookingId: string, name: string) { await this.rpc('update_depositor_name', { p_booking_id: bookingId, p_name: name }) }
  async updateRefundAccount(bookingId: string, account: string) { await this.rpc('update_refund_account', { p_booking_id: bookingId, p_refund_account: account }) }
  async undoConfirmDeposit(bookingId: string) { await this.rpc('undo_confirm_deposit', { p_booking_id: bookingId }) }
  async confirmLateDeposit(bookingId: string) { await this.rpc('confirm_late_deposit', { p_booking_id: bookingId }) }
  async undoCheckIn(ticketId: string) { await this.rpc('undo_check_in', { p_ticket_id: ticketId }) }
  async transferOwnership(membershipId: string) { await this.rpc('transfer_ownership', { p_membership_id: membershipId }) }
}

export function createBackend(): Backend {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  // 로그인 유지: 세션을 이 기기(localStorage)에 저장하고 토큰을 자동 갱신한다. 카카오 로그인 후 돌아온 주소에서 세션을 읽는다
  if (url && key) {
    return new SupabaseBackend(createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'bandy-auth', flowType: 'pkce' },
    }))
  }
  // 운영 빌드에서 키가 빠지면 조용히 데모(가짜 데이터)로 열리지 않게 막는다. 데모 배포는 VITE_BANDY_DEMO=true로 명시
  if (import.meta.env.PROD && import.meta.env.VITE_BANDY_DEMO !== 'true') {
    throw new BandyError('서버 설정이 빠졌어요. (VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY 또는 데모 배포면 VITE_BANDY_DEMO=true)')
  }
  return new LocalBackend()
}

// 설정 오류 화면을 띄우는 동안 쓰는 빈 데모(아무 화면도 그리지 않음)
export function createFallbackBackend(): Backend { return new LocalBackend() }
