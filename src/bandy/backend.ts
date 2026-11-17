// 화면이 부르는 기능 목록. 두 가지 구현이 있다.
//  - SupabaseBackend: VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY가 있으면 실제 Supabase(DB 함수)를 부른다.
//  - LocalBackend: 없으면 브라우저 저장소로 도는 데모. 규칙은 repo.ts(= supabase/migrations의 DB 함수와 같은 규칙).
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Club, Db, EventRow, ExchangeKind } from './types'
import * as repo from './repo'
import { BandyError, initialDb, loadDb, saveDb } from './repo'

export type CheckResult = {
  result: 'valid' | 'already_checked_in' | 'invalid'
  ticket_id?: string; entry_number?: number | null; owner_name?: string; ticket_type?: string; depositor_name?: string
}

export type EventInput = {
  title: string; category: EventRow['category']; starts_at: string; venue_name: string; address: string; description: string
  price_krw: number; capacity: number; bank_name: string; account_number: string; poster_path: string | null; publish?: boolean
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
  signInKakao(): Promise<void>
  signOut(): Promise<void>
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
  confirmDeposit(bookingId: string): Promise<void>
  cancelBooking(bookingId: string): Promise<void>
  issueTicketQr(ticketId: string): Promise<string>
  verifyTicket(eventId: string, token: string): Promise<CheckResult>
  checkIn(eventId: string, token: string): Promise<CheckResult>
  requestExchange(fromClubId: string, toClubId: string, kind: ExchangeKind, message: string): Promise<string>
  respondExchange(requestId: string, accept: boolean): Promise<void>
  cancelExchange(requestId: string): Promise<void>
  markNotificationsRead(id?: string): Promise<void>
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
  async createBooking(ticketTypeId: string, quantity: number, depositor: string) {
    return this.mutate((d, u) => repo.createBooking(d, u, ticketTypeId, quantity, depositor).id)
  }
  async confirmDeposit(bookingId: string) { this.mutate((d, u) => repo.confirmDeposit(d, u, bookingId)) }
  async cancelBooking(bookingId: string) { this.mutate((d, u) => repo.cancelBooking(d, u, bookingId)) }
  async issueTicketQr(ticketId: string) {
    const t = this.db.tickets.find((x) => x.id === ticketId && x.user_id === this.uid())
    const qr = t && repo.qrOf(this.db, t.id)
    if (!qr) throw new BandyError('티켓을 찾지 못했습니다.')
    return qr.token
  }
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
}

// ───────────────────────── Supabase ─────────────────────────
class SupabaseBackend implements Backend {
  mode = 'supabase' as const
  constructor(private sb: SupabaseClient) {}

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args)
    if (error) throw new BandyError(error.message)
    return data as T
  }
  private async rows<T>(table: string): Promise<T[]> {
    const { data, error } = await this.sb.from(table).select('*')
    if (error) {
      // 로그인 전에는 볼 수 없는 테이블이 있다
      if (error.code === '42501') return []
      throw new BandyError(error.message)
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
      payments: t.payments as unknown as Db['payments'],
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
    const { data } = this.sb.auth.onAuthStateChange(() => cb())
    return () => data.subscription.unsubscribe()
  }

  async signInPersona() { throw new BandyError('Supabase 모드에서는 이메일 또는 카카오로 로그인해요.') }
  async signInEmail(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password })
    if (error) throw new BandyError(error.message)
  }
  async signUpEmail(email: string, password: string, name: string) {
    const { error } = await this.sb.auth.signUp({ email, password, options: { data: { name } } })
    if (error) throw new BandyError(error.message)
  }
  async signInKakao() {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: `${window.location.origin}/app` } })
    if (error) throw new BandyError(error.message)
  }
  async signOut() { await this.sb.auth.signOut() }
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
  async confirmDeposit(bookingId: string) { await this.rpc('confirm_deposit', { p_booking_id: bookingId }) }
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
}

export function createBackend(): Backend {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (url && key) return new SupabaseBackend(createClient(url, key))
  return new LocalBackend()
}
