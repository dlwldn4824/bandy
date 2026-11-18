import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useBandy } from '../store'
import { DEFAULT_ONSITE_HOURS, durationMinutes, eventEnd, isClubManager, isEventOver, isOverdue, isPastEvent, onsiteEnd, onsiteOpen, presaleEnd } from '../repo'
import { Backend } from '../backend'
import { loginHref } from '../convenience'
import { Empty, ImageInput, PageHeader } from '../components'
import { dateLabel, timeRange, won } from '../format'
import { EventCategory, EventRow } from '../types'

const STATUS_LABEL: Record<EventRow['status'], string> = { DRAFT: '초안', PUBLISHED: '공개', ENDED: '종료', CANCELLED: '취소' }
type Tab = 'events' | 'new' | 'profile' | 'members'
const ROLE_LABEL = { OWNER: '회장', MANAGER: '운영진', MEMBER: '부원' } as const

// 구조도(동아리): 공연 관리(수정 · 삭제 · 예매자 목록 · 입장 관리) / 공연 등록 / 동아리 등록·수정
export function ManagePage() {
  const { clubId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { db, me } = useBandy()
  const q = params.get('tab')
  const [tab, setTab] = useState<Tab>(q === 'new' || q === 'profile' || q === 'members' ? q : 'events')
  const club = db.clubs.find((c) => c.id === clubId)

  if (!club || !isClubManager(db, me?.id ?? null, clubId)) {
    return <div className="b-page"><PageHeader back title="동아리 관리" /><Empty>이 동아리의 운영진만 볼 수 있어요. <Link to={loginHref()}>역할 바꾸기</Link></Empty></div>
  }

  const events = db.events.filter((e) => e.club_id === club.id).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const selectedId = params.get('event') ?? events[0]?.id
  const selected = events.find((e) => e.id === selectedId)

  return (
    <div className="b-page">
      <PageHeader back title={`${club.name} 관리`} />
      {club.status !== 'ACTIVE' && (
        <p className="b-warn">{{
          PENDING: '운영자 승인 대기 중이에요. 승인되면 공연을 올리고 교류를 신청할 수 있어요.',
          SUSPENDED: '운영이 정지된 동아리예요. 공연 등록·공개·입금 확인이 멈춰요. (이미 발급된 티켓의 입장 처리는 돼요)',
          REJECTED: '승인이 거절됐어요.',
          ACTIVE: '',
        }[club.status]}</p>
      )}
      <div className="b-seg">
        <button type="button" className={tab === 'events' ? 'on' : ''} onClick={() => setTab('events')}>공연 관리</button>
        <button type="button" className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>공연 등록</button>
        <button type="button" className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>동아리 정보</button>
        <button type="button" className={tab === 'members' ? 'on' : ''} onClick={() => setTab('members')}>부원</button>
      </div>

      {tab === 'events' && (
        <>
          <select value={selectedId ?? ''} onChange={(e) => setParams({ event: e.target.value })} aria-label="공연 선택">
            {events.map((e) => <option key={e.id} value={e.id}>[{STATUS_LABEL[e.status]}] {e.title}</option>)}
          </select>
          {selected ? <EventManage key={selected.id} eventId={selected.id} onDeleted={() => setParams({})} /> : <Empty>등록한 공연이 없어요. 공연 등록에서 올려 주세요.</Empty>}
        </>
      )}
      {tab === 'new' && <EventForm clubId={club.id} onDone={(id) => { setTab('events'); setParams({ event: id }) }} />}
      {tab === 'profile' && <ClubForm clubId={club.id} />}
      {tab === 'members' && <Members clubId={club.id} />}
    </div>
  )
}

function EventManage({ eventId, onDeleted }: { eventId: string; onDeleted: () => void }) {
  const { db, call, showToast, ask } = useBandy()
  const [mode, setMode] = useState<'bookings' | 'edit'>('bookings')
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const event = db.events.find((e) => e.id === eventId)!
  const bookings = db.bookings.filter((b) => b.event_id === eventId && b.status !== 'CANCELLED')
  const tickets = db.tickets.filter((t) => t.event_id === eventId && t.status !== 'CANCELLED')
  // '입금했어요'를 누른 예매를 먼저, 그다음 오래된 순
  const notifiedAt = (bookingId: string) => db.payments.find((p) => p.booking_id === bookingId)?.depositor_notified_at ?? null
  const pending = bookings.filter((b) => b.status === 'PENDING_PAYMENT')
    .sort((a, b) => (notifiedAt(a.id) ? 0 : 1) - (notifiedAt(b.id) ? 0 : 1) || a.created_at.localeCompare(b.created_at))
  const cancelled = event.status === 'CANCELLED'
  // 환불 요청(공연 취소·일정 변경 후 예매자가 요청)
  const refundPending = db.bookings.filter((b) => b.event_id === eventId)
    .map((b) => ({ b, p: db.payments.find((p) => p.booking_id === b.id && p.status === 'REFUND_PENDING') }))
    .filter((x): x is { b: typeof x.b; p: NonNullable<typeof x.p> } => !!x.p)
  const nameOf = (uid: string) => db.profiles.find((p) => p.id === uid)?.display_name ?? '-'
  const payOf = (bookingId: string) => db.payments.find((p) => p.booking_id === bookingId)
  const isOnsite = (bookingId: string) => db.bookings.find((b) => b.id === bookingId)?.channel === 'ONSITE'
  // 티켓 주인 이름: 현장 판매는 '현장 · 구매자 이름'
  const holderOf = (bookingId: string, uid: string) => isOnsite(bookingId) ? `현장${payOf(bookingId)?.depositor_name ? ` · ${payOf(bookingId)!.depositor_name}` : ''}` : nameOf(uid)
  // 판매 집계: 사전 예매(계좌이체) / 현장 현금 / 현장 이체
  const confirmed = bookings.filter((b) => b.status === 'CONFIRMED')
  const sum = (pred: (b: typeof confirmed[number]) => boolean) => {
    const list = confirmed.filter(pred)
    return { n: list.reduce((k, b) => k + (db.booking_items.find((i) => i.booking_id === b.id)?.quantity ?? 0), 0), won: list.reduce((k, b) => k + b.total_amount_krw, 0) }
  }
  const online = sum((b) => (b.channel ?? 'ONLINE') === 'ONLINE')
  const cash = sum((b) => payOf(b.id)?.provider === 'ONSITE_CASH')
  const transfer = sum((b) => payOf(b.id)?.provider === 'ONSITE_TRANSFER')
  const onsiteSales = confirmed.filter((b) => b.channel === 'ONSITE')
  const [sale, setSale] = useState<{ qty: number; method: 'CASH' | 'TRANSFER'; name: string }>({ qty: 1, method: 'CASH', name: '' })

  const act = async (fn: (b: Backend) => Promise<unknown>, ok: string) => {
    const r = await call(fn)
    showToast(r.ok ? ok : r.error)
    return r.ok
  }

  return (
    <div className="b-stack">
      <section className="b-card b-pad b-stack">
        <div className="b-row between">
          <strong>{event.title}</strong>
          <span className={`b-status${event.status === 'PUBLISHED' ? ' ok' : ''}`}>{STATUS_LABEL[event.status]}</span>
        </div>
        <p className="b-sub">{timeRange(event.starts_at, eventEnd(event))} · {event.venue_name}{isEventOver(event) ? ' · 지난 공연' : isPastEvent(event) ? ' · 진행 중' : ''}</p>
        <p className="b-sub">입금 대기 {pending.length}건 · 발급 티켓 {tickets.length}장 · 입장 {tickets.filter((t) => t.status === 'CHECKED_IN').length}장</p>
        <p className="b-sub">판매: 사전 예매 {online.n}장 {won(online.won)} · 현장 현금 {cash.n}장 {won(cash.won)} · 현장 이체 {transfer.n}장 {won(transfer.won)}</p>
        <p className="b-note">사전 예매 마감 {dateLabel(presaleEnd(event))} · 현장 판매 공연 당일 ~ {dateLabel(onsiteEnd(event))}</p>
        <div className="b-row">
          <Link className="b-btn small" to={`/app/scan/${event.id}`}>입장 관리 (QR)</Link>
          {!cancelled && (
            <button type="button" className="b-btn ghost small" onClick={() => act((b) => b.setEventStatus(event.id, event.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'), event.status === 'PUBLISHED' ? '비공개로 돌렸어요.' : '공개했어요.')}>
              {event.status === 'PUBLISHED' ? '비공개' : '공개'}
            </button>
          )}
          {!cancelled && <button type="button" className="b-btn ghost small" onClick={() => setMode(mode === 'edit' ? 'bookings' : 'edit')}>{mode === 'edit' ? '수정 닫기' : '수정'}</button>}
          {!cancelled && bookings.length > 0 && (
            <button type="button" className="b-btn ghost small" onClick={async () => { if (await ask('공연을 취소할까요? 입금 대기 예매는 취소되고 예매자 모두에게 알림이 가요. 되돌릴 수 없어요.')) act((b) => b.setEventStatus(event.id, 'CANCELLED'), '공연을 취소했어요.') }}>공연 취소</button>
          )}
          <button type="button" className="b-btn ghost small" onClick={async () => { if (await ask('이 공연을 삭제할까요?') && await act((b) => b.deleteEvent(event.id), '삭제했어요.')) onDeleted() }}>삭제</button>
          <Link className="b-link" to={`/app/e/${event.id}`}>공연 페이지</Link>
        </div>
      </section>

      {/* 현장 판매(11/18 팀 논의): 당일 0시 ~ 현장 판매 종료. 등록하면 바로 입장 처리 */}
      {!cancelled && event.status === 'PUBLISHED' && (
        <section className="b-card b-pad b-stack">
          <h2>현장 판매</h2>
          {onsiteOpen(event) ? (
            <>
              <div className="b-row between">
                <span className="b-stepper">
                  <button type="button" onClick={() => setSale({ ...sale, qty: Math.max(1, sale.qty - 1) })} aria-label="한 장 빼기">−</button>
                  <b>{sale.qty}</b>
                  <button type="button" onClick={() => setSale({ ...sale, qty: Math.min(20, sale.qty + 1) })} aria-label="한 장 더하기">+</button>
                </span>
                <span className="b-seg mini">
                  <button type="button" className={sale.method === 'CASH' ? 'on' : ''} onClick={() => setSale({ ...sale, method: 'CASH' })}>현금</button>
                  <button type="button" className={sale.method === 'TRANSFER' ? 'on' : ''} onClick={() => setSale({ ...sale, method: 'TRANSFER' })}>계좌이체</button>
                </span>
              </div>
              <input value={sale.name} onChange={(e) => setSale({ ...sale, name: e.target.value })} maxLength={20} placeholder="구매자 이름 (선택, 이체면 입금자명)" aria-label="구매자 이름" />
              <button type="button" className="b-btn" onClick={async () => {
                if (await act((x) => x.recordOnsiteSale(event.id, sale.qty, sale.method, sale.name), `현장 판매 ${sale.qty}장을 등록하고 입장 처리했어요.`)) setSale({ qty: 1, method: sale.method, name: '' })
              }}>현장 판매 등록 · 입장</button>
              {onsiteSales.map((b) => (
                <div key={b.id} className="b-row between">
                  <span className="b-sub">{holderOf(b.id, b.user_id)} · {db.booking_items.find((i) => i.booking_id === b.id)?.quantity}장 · {payOf(b.id)?.provider === 'ONSITE_CASH' ? '현금' : '이체'} · {won(b.total_amount_krw)}</span>
                  <button type="button" className="b-link" onClick={async () => { if (await ask('이 현장 판매를 취소할까요? 받은 돈은 현장에서 돌려주세요.')) act((x) => x.cancelOnsiteSale(b.id), '현장 판매를 취소했어요.') }}>취소</button>
                </div>
              ))}
            </>
          ) : <p className="b-sub">현장 판매는 공연 당일 0시부터 {dateLabel(onsiteEnd(event))}까지 등록할 수 있어요.</p>}
        </section>
      )}

      {refundPending.length > 0 && (
        <section className="b-stack">
          <h2 className="b-h2">환불 요청 {refundPending.length}</h2>
          {refundPending.map(({ b, p }) => (
            <article key={b.id} className="b-card b-pad b-stack b-signal">
              <div className="b-row between"><strong>{nameOf(b.user_id)} · {won(b.total_amount_krw)}</strong><span className="b-status wait">환불 대기</span></div>
              <p className="b-sub">환불 계좌: {p.refund_account} · 요청 {p.refund_requested_at ? dateLabel(p.refund_requested_at) : ''}</p>
              <button type="button" className="b-btn small" onClick={async () => { if (await ask(`${won(b.total_amount_krw)}을 보냈나요? 환불 완료로 바꾸고 예매자에게 알려요.`)) act((x) => x.markRefunded(b.id), '환불 완료로 바꿨어요.') }}>환불 완료</button>
            </article>
          ))}
        </section>
      )}

      {mode === 'edit' ? <EventForm clubId={event.club_id} event={event} onDone={() => setMode('bookings')} /> : (
        <>
          <div className="b-row between">
            <h2 className="b-h2">예매자 목록</h2>
            <span className="b-seg mini">
              <button type="button" className={filter === 'pending' ? 'on' : ''} onClick={() => setFilter('pending')}>입금 대기</button>
              <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>전체</button>
            </span>
          </div>
          {filter === 'pending' ? (
            <>
              {pending.map((b) => {
                const item = db.booking_items.find((i) => i.booking_id === b.id)
                const pay = db.payments.find((p) => p.booking_id === b.id)
                const overdue = isOverdue(b, db)
                return (
                  <article key={b.id} className="b-card b-pad b-stack">
                    <div className="b-row between"><strong>입금자명 {pay?.depositor_name}</strong><span className="b-status wait">{overdue ? '기한 지남' : pay?.depositor_notified_at ? '입금했다고 알림' : '입금 대기'}</span></div>
                    <p className="b-sub">{nameOf(b.user_id)} · {item?.ticket_type_name} {item?.quantity}매 · {won(b.total_amount_krw)} · 기한 {dateLabel(b.expires_at)}</p>
                    {overdue
                      ? <p className="b-note">입금 기한이 지나 입금 확인을 할 수 없어요. 자리는 자동으로 풀려요.</p>
                      : (
                        <div className="b-row">
                          <button type="button" className="b-btn small" onClick={async () => {
                            const r = await call((x) => x.confirmDeposit(b.id))
                            showToast(!r.ok ? r.error : r.value === 'EXPIRED' ? '입금 기한이 지나 만료된 예매예요. 자리가 풀렸어요.' : '입금 확인했어요. 티켓이 발급됐어요.')
                          }}>입금 확인</button>
                          <button type="button" className="b-btn ghost small" onClick={() => act((x) => x.cancelBooking(b.id), '예매를 취소했어요.')}>취소</button>
                        </div>
                      )}
                  </article>
                )
              })}
              {pending.length === 0 && <Empty>입금 대기 중인 예매가 없어요.</Empty>}
            </>
          ) : (
            // 구조도: 예매자 목록 = 이름 · ticketType · bookingStatus · checkInStatus (발급 티켓 기준)
            <table className="b-table">
              <thead><tr><th>입장번호</th><th>이름</th><th>티켓</th><th>예매</th><th>입장</th><th></th></tr></thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>{t.entry_number}</td>
                    <td>{holderOf(t.booking_id, t.user_id)}</td>
                    <td>{db.booking_items.find((i) => i.id === t.booking_item_id)?.ticket_type_name}</td>
                    <td><span className="b-status ok">확정</span></td>
                    <td>{t.status === 'CHECKED_IN' ? <span className="b-status ok">입장</span> : <span className="b-status">대기</span>}</td>
                    <td>{t.status === 'CHECKED_IN' && <button type="button" className="b-link" onClick={async () => { if (await ask(`입장번호 ${t.entry_number}번의 입장 처리를 취소할까요?`)) act((x) => x.undoCheckIn(t.id), '입장 처리를 취소했어요.') }}>입장 취소</button>}</td>
                  </tr>
                ))}
                {pending.map((b) => (
                  <tr key={b.id}>
                    <td>-</td>
                    <td>{nameOf(b.user_id)}</td>
                    <td>{db.booking_items.find((i) => i.booking_id === b.id)?.ticket_type_name}</td>
                    <td><span className="b-status wait">{isOverdue(b, db) ? '기한 지남' : '입금 대기'}</span></td>
                    <td>-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {filter === 'all' && bookings.length === 0 && <Empty>아직 예매가 없어요.</Empty>}
          {filter === 'all' && (
            <>
              {/* 실수 바로잡기: 잘못 누른 입금 확인 되돌리기, 기한 뒤 들어온 입금 확인 */}
              {bookings.filter((b) => b.status === 'CONFIRMED' && b.total_amount_krw > 0 && b.channel !== 'ONSITE').length > 0 && <h2 className="b-h2">확정된 사전 예매</h2>}
              {bookings.filter((b) => b.status === 'CONFIRMED' && b.total_amount_krw > 0 && b.channel !== 'ONSITE').map((b) => (
                <article key={b.id} className="b-card b-pad b-row between">
                  <span className="b-sub">{nameOf(b.user_id)} · 입금자명 {db.payments.find((p) => p.booking_id === b.id)?.depositor_name} · {won(b.total_amount_krw)}</span>
                  <button type="button" className="b-link" onClick={async () => { if (await ask('입금 확인을 취소할까요? 티켓이 무효가 되고 입금 대기로 돌아가요. 예매자에게 알림이 가요.')) act((x) => x.undoConfirmDeposit(b.id), '입금 확인을 취소했어요.') }}>입금 확인 취소</button>
                </article>
              ))}
              {db.bookings.filter((b) => b.event_id === eventId && b.status === 'EXPIRED').length > 0 && <h2 className="b-h2">기한 지나 만료된 예매</h2>}
              {db.bookings.filter((b) => b.event_id === eventId && b.status === 'EXPIRED').map((b) => (
                <article key={b.id} className="b-card b-pad b-row between">
                  <span className="b-sub">{nameOf(b.user_id)} · 입금자명 {db.payments.find((p) => p.booking_id === b.id)?.depositor_name} · {won(b.total_amount_krw)}</span>
                  <button type="button" className="b-btn ghost small" onClick={async () => { if (await ask('기한이 지난 뒤 입금이 들어왔나요? 자리가 남아 있으면 확정하고 티켓을 발급해요.')) act((x) => x.confirmLateDeposit(b.id), '늦은 입금을 확인했어요. 티켓이 발급됐어요.') }}>늦은 입금 확인</button>
                </article>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

// 구조도: 공연 정보 입력 = eventName · description · eventDate · location · ticketInfo · posterImage
function EventForm({ clubId, event, onDone }: { clubId: string; event?: EventRow; onDone: (id: string) => void }) {
  const { db, call, showToast } = useBandy()
  const tt = event ? db.ticket_types.find((t) => t.event_id === event.id) : undefined
  const toLocal = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 16)
  const [f, setF] = useState({
    title: event?.title ?? '', category: (event?.category ?? '공연') as EventCategory,
    starts_at: event ? toLocal(event.starts_at) : '', venue_name: event?.venue_name ?? '', address: event?.address ?? '',
    description: event?.description ?? '', price_krw: tt?.price_krw ?? 6000, capacity: tt?.capacity ?? 100,
    bank_name: event?.bank_name ?? '', account_number: event?.account_number ?? '', account_holder: event?.account_holder ?? '',
    duration_minutes: event ? durationMinutes(event) : 120,
    // 사전 예매 마감(빈 칸 = 공연 전날 24시), 현장 판매: 공연 시작 후 몇 시간까지(기본 3)
    presale_ends_at: event?.presale_ends_at ? toLocal(event.presale_ends_at) : '',
    onsite_hours: event?.onsite_ends_at ? Math.round((new Date(event.onsite_ends_at).getTime() - new Date(event.starts_at).getTime()) / 3600000) : DEFAULT_ONSITE_HOURS,
  })
  const [poster, setPoster] = useState<string | null>(event?.poster_path ?? null)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const save = async (publish: boolean) => {
    const input = {
      ...f, starts_at: f.starts_at ? `${f.starts_at}:00+09:00` : '', price_krw: Number(f.price_krw), capacity: Number(f.capacity),
      duration_minutes: Number(f.duration_minutes),
      presale_ends_at: f.presale_ends_at ? `${f.presale_ends_at}:00+09:00` : null,
      onsite_ends_at: f.starts_at && Number(f.onsite_hours) !== DEFAULT_ONSITE_HOURS
        ? new Date(new Date(`${f.starts_at}:00+09:00`).getTime() + Number(f.onsite_hours) * 3600000).toISOString() : null,
      poster_path: poster, publish,
    }
    const r = await call(async (b) => {
      if (event) { await b.updateEvent(event.id, input); return event.id }
      return b.createEvent(clubId, input)
    })
    if (!r.ok) { setError(r.error); return }
    showToast(event ? '수정했어요.' : publish ? '공개했어요.' : '초안으로 저장했어요.')
    onDone(r.value)
  }

  return (
    <section className="b-card b-pad b-stack">
      <label className="b-field"><span>공연명</span><input value={f.title} onChange={set('title')} maxLength={60} /></label>
      <div className="b-field">
        <span>분류</span>
        <div className="b-chips">
          {(['공연', '해커톤', '학술회', '네트워킹'] as EventCategory[]).map((c) => (
            <button key={c} type="button" className={`b-chip${f.category === c ? ' active' : ''}`} onClick={() => setF({ ...f, category: c })}>{c}</button>
          ))}
        </div>
      </div>
      <div className="b-row">
        <label className="b-field"><span>시작 일시</span><input type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /></label>
        <label className="b-field"><span>진행 시간 (분)</span><input type="number" min={10} max={1440} step={10} value={f.duration_minutes} onChange={set('duration_minutes')} /></label>
      </div>
      <div className="b-row">
        <label className="b-field"><span>사전 예매 마감 (비우면 공연 전날 24시)</span><input type="datetime-local" value={f.presale_ends_at} onChange={set('presale_ends_at')} /></label>
        <label className="b-field"><span>현장 판매: 공연 시작 후 몇 시간까지</span><input type="number" min={0} max={24} value={f.onsite_hours} onChange={set('onsite_hours')} /></label>
      </div>
      {event && <p className="b-note">일시나 장소를 바꾸면 예매자에게 알림이 가고, 예매자는 유지하거나 취소·환불을 요청할 수 있어요.</p>}
      <label className="b-field"><span>장소</span><input value={f.venue_name} onChange={set('venue_name')} maxLength={60} /></label>
      <label className="b-field"><span>주소 (지도 위치)</span><input value={f.address} onChange={set('address')} maxLength={120} /></label>
      <label className="b-field"><span>공연 소개</span><textarea value={f.description} onChange={set('description')} maxLength={2000} /></label>
      <ImageInput label="포스터" value={poster} onChange={setPoster} />
      <div className="b-row">
        <label className="b-field"><span>가격 (원, 무료는 0)</span><input type="number" min={0} step={500} value={f.price_krw} onChange={set('price_krw')} /></label>
        <label className="b-field"><span>정원</span><input type="number" min={1} value={f.capacity} onChange={set('capacity')} /></label>
      </div>
      <div className="b-row">
        <label className="b-field"><span>입금 은행</span><input value={f.bank_name} onChange={set('bank_name')} maxLength={20} /></label>
        <label className="b-field"><span>입금 계좌</span><input value={f.account_number} onChange={set('account_number')} maxLength={30} /></label>
      </div>
      <div className="b-row">
        <label className="b-field"><span>예금주 (비우면 동아리 이름)</span><input value={f.account_holder} onChange={set('account_holder')} maxLength={40} /></label>
      </div>
      {error && <p className="b-warn">{error}</p>}
      {event ? (
        <button type="button" className="b-btn" onClick={() => save(event.status === 'PUBLISHED')}>수정 저장</button>
      ) : (
        <div className="b-row" style={{ flexWrap: 'nowrap' }}>
          <button type="button" className="b-btn ghost" onClick={() => save(false)}>초안 저장</button>
          <button type="button" className="b-btn" onClick={() => save(true)}>공개하기</button>
        </div>
      )}
    </section>
  )
}

// 구조도: 동아리 정보 입력 = clubName · introduction · profileImage · snsLink (+ 11/1: 학교 · 장르 · 지역 · 교류 열림)
function ClubForm({ clubId }: { clubId: string }) {
  const { db, call, showToast } = useBandy()
  const navigate = useNavigate()
  const club = db.clubs.find((c) => c.id === clubId)!
  const [f, setF] = useState({
    name: club.name, school: club.school, genre: club.genre, region: club.region, introduction: club.introduction ?? '',
    sns_url: club.sns_url ?? '', open_chat_url: club.open_chat_url, exchange_open: club.exchange_open,
  })
  const [image, setImage] = useState<string | null>(club.profile_path)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    const r = await call((b) => b.updateClub(clubId, { ...f, sns_url: f.sns_url.trim() || null, profile_path: image }))
    if (!r.ok) { setError(r.error); return }
    setError('')
    showToast('동아리 정보를 저장했어요.')
  }
  return (
    <section className="b-card b-pad b-stack">
      <label className="b-field"><span>동아리 이름</span><input value={f.name} onChange={set('name')} maxLength={40} /></label>
      <ImageInput label="프로필 이미지" value={image} onChange={setImage} />
      <div className="b-row">
        <label className="b-field"><span>학교</span><input value={f.school} onChange={set('school')} maxLength={30} /></label>
        <label className="b-field"><span>장르</span><input value={f.genre} onChange={set('genre')} maxLength={30} /></label>
      </div>
      <label className="b-field"><span>지역</span><input value={f.region} onChange={set('region')} maxLength={30} /></label>
      <label className="b-field"><span>소개</span><textarea value={f.introduction} onChange={set('introduction')} maxLength={1000} /></label>
      <label className="b-field"><span>SNS 링크</span><input value={f.sns_url} onChange={set('sns_url')} placeholder="https://instagram.com/..." /></label>
      <label className="b-field"><span>오픈채팅 링크 (교류가 수락된 동아리에만 보여요)</span><input value={f.open_chat_url} onChange={set('open_chat_url')} /></label>
      <label className="b-check"><input type="checkbox" checked={f.exchange_open} onChange={(e) => setF({ ...f, exchange_open: e.target.checked })} /> 다른 동아리의 교류 신청 받기</label>
      {error && <p className="b-warn">{error}</p>}
      <button type="button" className="b-btn" onClick={save}>저장</button>
      <button type="button" className="b-link" onClick={() => navigate(`/app/c/${clubId}`)}>동아리 페이지 보기</button>
    </section>
  )
}

// 부원 · 운영진: 가입 신청 수락, 회장이 운영진 지정(운영진은 입금 확인·입장 처리 가능)
function Members({ clubId }: { clubId: string }) {
  const { db, me, call, showToast, ask } = useBandy()
  const members = db.club_memberships.filter((m) => m.club_id === clubId && m.status !== 'LEFT')
  const iAmOwner = members.some((m) => m.user_id === me?.id && m.role === 'OWNER' && m.status === 'ACTIVE')
  const nameOf = (uid: string) => db.profiles.find((p) => p.id === uid)?.display_name ?? '(이름 비공개)'
  const act = async (fn: (b: Backend) => Promise<unknown>, ok: string) => {
    const r = await call(fn)
    showToast(r.ok ? ok : r.error)
  }
  const requests = members.filter((m) => m.status === 'PENDING')
  const active = members.filter((m) => m.status === 'ACTIVE')
  return (
    <div className="b-stack">
      <h2 className="b-h2">가입 신청</h2>
      {requests.map((m) => (
        <article key={m.id} className="b-card b-pad b-row between">
          <strong>{nameOf(m.user_id)}</strong>
          <span className="b-row">
            <button type="button" className="b-btn small" onClick={() => act((b) => b.respondClubJoin(m.id, true), '가입을 수락했어요.')}>수락</button>
            <button type="button" className="b-btn ghost small" onClick={() => act((b) => b.respondClubJoin(m.id, false), '가입 신청을 거절했어요.')}>거절</button>
          </span>
        </article>
      ))}
      {requests.length === 0 && <Empty>새 가입 신청이 없어요.</Empty>}
      <h2 className="b-h2">부원</h2>
      <p className="b-note">운영진은 입금 확인·입장 처리·공연 관리를 함께 할 수 있어요. 운영진 지정은 회장만 할 수 있어요.</p>
      {active.map((m) => (
        <article key={m.id} className="b-card b-pad b-row between">
          <span className="b-stack tight"><strong>{nameOf(m.user_id)}</strong><span className="b-sub">{ROLE_LABEL[m.role]}</span></span>
          {iAmOwner && m.role !== 'OWNER' && (
            <span className="b-row">
              <button type="button" className="b-btn ghost small" onClick={() => act((b) => b.setMemberRole(m.id, m.role === 'MANAGER' ? 'MEMBER' : 'MANAGER'), '역할을 바꿨어요.')}>
                {m.role === 'MANAGER' ? '부원으로' : '운영진으로'}
              </button>
              <button type="button" className="b-btn ghost small" onClick={async () => { if (await ask('이 부원을 내보낼까요?')) act((b) => b.removeMember(m.id), '내보냈어요.') }}>내보내기</button>
              <button type="button" className="b-btn ghost small" onClick={async () => { if (await ask('회장을 넘길까요? 나는 운영진이 돼요.')) act((b) => b.transferOwnership(m.id), '회장을 넘겼어요.') }}>회장 넘기기</button>
            </span>
          )}
        </article>
      ))}
    </div>
  )
}
