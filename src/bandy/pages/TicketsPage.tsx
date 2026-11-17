import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useBandy } from '../store'
import { Empty, NeedLogin, PageHeader } from '../components'
import { dateLabel, won } from '../format'
import { EventRow, Ticket } from '../types'
import { eventEnd, isEventOver, isOverdue } from '../repo'
import { useWakeLock } from '../convenience'
import { device } from '../device'

const IMMINENT_MS = 24 * 3600000 // [미정] 입장 임박 기준. 지금은 공연 시작 24시간 전부터 '입장 예정'
const LEGACY_SERVICE = '/performances' // 기존 서비스(공연 정보 · 셋리스트 · 채팅 · 방명록). 공연별 연결 방식은 미정

// 공연 정보를 못 읽는 경우(권한·삭제 등)에도 화면이 깨지지 않게 쓰는 자리 표시
const UNKNOWN_EVENT: Pick<EventRow, 'id' | 'title' | 'starts_at' | 'ends_at' | 'venue_name' | 'status' | 'bank_name' | 'account_number' | 'account_holder'> = {
  id: '', title: '(공연 정보를 불러오지 못했어요)', starts_at: '9999-12-31T00:00:00Z', ends_at: null, venue_name: '', status: 'PUBLISHED',
  bank_name: '', account_number: '', account_holder: '',
}

// 구조도: 내 티켓 = 입장 예정 → 이후 공연 → 사용 완료 / 티켓 선택 → 티켓 상세·QR (ticketId · qrToken · checkInStatus)
export function TicketsPage() {
  const { db, me, home, offline, call, showToast } = useBandy()
  const [refundFor, setRefundFor] = useState<string | null>(null)
  const [account, setAccount] = useState('')
  const [open, setOpen] = useState<Ticket | null>(null)
  const [qr, setQr] = useState<{ ticketId: string; token: string; offline?: boolean } | null>(null)
  const [params, setParams] = useSearchParams()
  // 홈 신호·알림에서 ?open=티켓ID 로 들어오면 그 티켓 QR을 바로 연다
  const openId = params.get('open')
  useEffect(() => {
    if (!openId || !me) return
    const t = db.tickets.find((x) => x.id === openId && x.user_id === me.id && x.status === 'ISSUED')
    const ev = t && db.events.find((e) => e.id === t.event_id)
    if (t && ev && ev.status !== 'CANCELLED' && !isEventOver(ev)) setOpen(t) // 끝났거나 취소된 공연 티켓은 열지 않음
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, me?.id, db.tickets.length])
  useWakeLock(!!open) // QR을 보여 주는 동안 화면이 꺼지지 않게
  // 티켓을 열 때마다 QR을 새로 받는다(서버에는 해시만 저장, 이전 QR은 폐기).
  // 공연장 전파가 약해 못 받으면 이 기기에 저장해 둔 마지막 QR(24시간 안)을 보여 준다
  useEffect(() => {
    if (!open) return
    let alive = true
    // 전파가 약하면 요청이 끝나지 않을 수 있어 6초 안에 못 받으면 저장된 QR로 넘어간다
    const timeout = new Promise<{ ok: false; error: string }>((res) => setTimeout(() => res({ ok: false, error: '서버에 연결하지 못했어요. (시간 초과)' }), 6000))
    Promise.race([call((b) => b.issueTicketQr(open.id), { reload: false }), timeout]).then((r) => {
      if (!alive) return
      const ev = eventOf(open.event_id)
      if (r.ok) {
        setQr({ ticketId: open.id, token: r.value })
        device.saveQr(open.id, r.value, eventEnd(ev), { title: ev.title, startsAt: ev.starts_at, entry: open.entry_number, venue: ev.venue_name })
        return
      }
      const cached = device.cachedQr(open.id)
      if (cached && /연결하지 못했|인터넷|시간 초과/.test(r.error)) setQr({ ticketId: open.id, token: cached, offline: true })
      else showToast(r.error)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id])
  // 인터넷이 끊겨 데이터를 못 읽었으면, 이 기기에 저장해 둔 QR(최근에 열어 본 티켓)을 보여 준다
  if (offline && (!me || db.tickets.length === 0)) {
    const saved = device.offlineTickets()
    return (
      <div className="b-page">
        <PageHeader title="내 티켓" />
        <p className="b-warn">인터넷에 연결되지 않아 최근에 열어 본 티켓만 보여 줘요. 연결되면 자동으로 새로 불러와요.</p>
        {saved.map((t) => (
          <article key={t.ticketId} className="b-card b-pad b-stack b-center">
            <strong>{t.title}</strong>
            <span className="b-sub">{t.startsAt ? dateLabel(t.startsAt) : ''} · {t.venue} · 입장번호 {t.entry}번</span>
            <div className="b-qr"><QRCodeSVG value={t.token} size={200} level="M" /></div>
          </article>
        ))}
        {saved.length === 0 && <Empty>저장된 티켓이 없어요. 공연장에 가기 전에 티켓을 한 번 열어 두면 인터넷이 약해도 보여 줄 수 있어요.</Empty>}
      </div>
    )
  }
  if (!me) return <div className="b-page"><PageHeader title="내 티켓" /><NeedLogin what="내 티켓" /></div>

  const eventOf = (id: string) => db.events.find((e) => e.id === id) ?? { ...UNKNOWN_EVENT, id }
  const tickets = db.tickets.filter((t) => t.user_id === me.id && t.status !== 'CANCELLED')
    .sort((a, b) => eventOf(a.event_id).starts_at.localeCompare(eventOf(b.event_id).starts_at) || a.issue_sequence - b.issue_sequence)
  // 취소된 공연·끝난 공연(입력한 진행 시간 기준)의 미사용 티켓은 '지난·취소'로 따로 모은다. 공연 중에 늦게 와도 QR을 열 수 있다
  const closed = (t: Ticket) => { const ev = eventOf(t.event_id); return ev.status === 'CANCELLED' || isEventOver(ev) }
  const issued = tickets.filter((t) => t.status === 'ISSUED' && !closed(t))
  const soon = issued.filter((t) => new Date(eventOf(t.event_id).starts_at).getTime() - Date.now() < IMMINENT_MS)
  const later = issued.filter((t) => !soon.includes(t))
  const used = tickets.filter((t) => t.status === 'CHECKED_IN')
  const missed = tickets.filter((t) => t.status === 'ISSUED' && closed(t))
  const pending = db.bookings.filter((b) => b.user_id === me.id && b.status === 'PENDING_PAYMENT')

  // 확인이 필요한 예매: 일정·장소가 바뀐 예매(서버 신호), 취소된 공연의 확정 예매(환불 요청), 환불 진행 중·완료
  const changed = home.changed_bookings ?? []
  const cancelledConfirmed = db.bookings.filter((b) => b.user_id === me.id && b.status === 'CONFIRMED' && eventOf(b.event_id).status === 'CANCELLED')
  const refunds = db.bookings.filter((b) => b.user_id === me.id)
    .map((b) => ({ b, p: db.payments.find((p) => p.booking_id === b.id && (p.status === 'REFUND_PENDING' || p.status === 'REFUNDED')) }))
    .filter((x) => !!x.p)
  const keep = async (bookingId: string) => {
    const r = await call((b) => b.ackEventChange(bookingId))
    showToast(r.ok ? '예매를 그대로 유지해요.' : r.error)
  }
  const refund = async (bookingId: string) => {
    const r = await call((b) => b.requestRefund(bookingId, account))
    if (!r.ok) { showToast(r.error); return }
    setRefundFor(null); setAccount('')
    showToast('환불을 요청했어요. 주최 동아리가 보내면 알려 드려요.')
  }
  // 환불 계좌 입력(공통)
  const refundForm = (bookingId: string, amount: number) => refundFor === bookingId ? (
    <div className="b-stack">
      {amount > 0 && <input value={account} onChange={(e) => setAccount(e.target.value)} maxLength={60} placeholder="환불받을 계좌 (예: 카카오뱅크 3333-01-1234567 김관객)" aria-label="환불받을 계좌" />}
      <div className="b-row">
        <button type="button" className="b-btn small" onClick={() => refund(bookingId)}>{amount > 0 ? '환불 요청' : '취소하기'}</button>
        <button type="button" className="b-btn ghost small" onClick={() => setRefundFor(null)}>닫기</button>
      </div>
    </div>
  ) : null

  const cancel = async (bookingId: string) => {
    const r = await call((b) => b.cancelBooking(bookingId))
    showToast(r.ok ? '예매를 취소했어요.' : r.error)
  }

  const row = (t: Ticket, kind: 'soon' | 'later' | 'used' | 'missed') => {
    const ev = eventOf(t.event_id)
    const item = db.booking_items.find((i) => i.id === t.booking_item_id)
    const inactive = kind === 'used' || kind === 'missed'
    const label = kind === 'used' ? '입장 완료' : kind === 'missed' ? (ev.status === 'CANCELLED' ? '공연 취소' : '지난 공연') : 'QR'
    return (
      <div key={t.id} className="b-stack">
        <button type="button" className={`b-ticket${inactive ? ' used' : ''}`} onClick={() => !inactive && setOpen(t)} disabled={inactive}>
          <span className="b-ticket-no">{t.entry_number}</span>
          <span className="b-grow b-stack tight">
            <strong>{ev.title}</strong>
            <span className="b-sub">{dateLabel(ev.starts_at)} · {item?.ticket_type_name}</span>
          </span>
          <span className={`b-status${inactive ? '' : ' red'}`}>{label}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="b-page">
      <PageHeader title="내 티켓" right={<span className="b-sub">{me.display_name}</span>} />

      {(changed.length > 0 || cancelledConfirmed.length > 0) && (
        <section className="b-stack">
          <h2 className="b-h2">확인이 필요해요</h2>
          {changed.map((c) => {
            const b = db.bookings.find((x) => x.id === c.booking_id)
            return (
              <article key={c.booking_id} className="b-card b-pad b-stack b-signal">
                <div className="b-row between"><strong>{c.title}</strong><span className="b-status red">일정 변경</span></div>
                {(c.previous_starts_at || c.previous_venue_name) && (
                  <p className="b-sub">이전: {c.previous_starts_at ? dateLabel(c.previous_starts_at) : ''} · {c.previous_venue_name}</p>
                )}
                <p className="b-sub"><b>변경: {dateLabel(c.starts_at)} · {c.venue_name}</b></p>
                {refundFor !== c.booking_id && (
                  <div className="b-row">
                    <button type="button" className="b-btn small" onClick={() => keep(c.booking_id)}>그대로 유지</button>
                    {c.status === 'CONFIRMED'
                      ? <button type="button" className="b-btn ghost small" onClick={() => setRefundFor(c.booking_id)}>취소·환불 요청</button>
                      : <button type="button" className="b-btn ghost small" onClick={() => cancel(c.booking_id)}>예매 취소</button>}
                  </div>
                )}
                {refundForm(c.booking_id, b?.total_amount_krw ?? 0)}
              </article>
            )
          })}
          {cancelledConfirmed.map((b) => (
            <article key={b.id} className="b-card b-pad b-stack b-signal">
              <div className="b-row between"><strong>{eventOf(b.event_id).title}</strong><span className="b-status red">공연 취소</span></div>
              <p className="b-sub">{won(b.total_amount_krw)} · 환불받을 계좌를 적어 주세요.</p>
              {refundFor !== b.id && <button type="button" className="b-btn small" onClick={() => setRefundFor(b.id)}>환불 요청</button>}
              {refundForm(b.id, b.total_amount_krw)}
            </article>
          ))}
        </section>
      )}

      {pending.length > 0 && (
        <section className="b-stack">
          <h2 className="b-h2">입금 대기</h2>
          {pending.map((b) => {
            const ev = eventOf(b.event_id)
            const item = db.booking_items.find((i) => i.booking_id === b.id)
            const pay = db.payments.find((p) => p.booking_id === b.id)
            const overdue = isOverdue(b, db)
            return (
              <article key={b.id} className="b-card b-pad b-stack">
                <div className="b-row between"><strong>{ev.title}</strong><span className="b-status wait">{overdue ? '기한 지남' : '입금 대기'}</span></div>
                <p className="b-sub">{item?.ticket_type_name} {item?.quantity}매 · {won(b.total_amount_krw)} · 입금자명 {pay?.depositor_name}</p>
                {overdue
                  ? <p className="b-note">입금 기한({dateLabel(b.expires_at)})이 지나 예매가 취소돼요. 다시 예매해 주세요.</p>
                  : (
                    <>
                      <p className="b-sub">{ev.bank_name} {ev.account_number} (예금주 {ev.account_holder}) · 기한 {dateLabel(b.expires_at)}</p>
                      <div className="b-row">
                        {pay?.depositor_notified_at
                          ? <span className="b-sub">입금했다고 알렸어요 · 확인을 기다리는 중</span>
                          : <button type="button" className="b-btn small" onClick={async () => { const r = await call((x) => x.markDepositSent(b.id)); showToast(r.ok ? '주최 동아리에 입금했다고 알렸어요.' : r.error) }}>입금했어요</button>}
                        <button type="button" className="b-btn ghost small" onClick={() => cancel(b.id)}>예매 취소</button>
                      </div>
                    </>
                  )}
              </article>
            )
          })}
        </section>
      )}

      <section className="b-stack">
        <h2 className="b-h2">입장 예정</h2>
        {soon.map((t) => row(t, 'soon'))}
        {soon.length > 0 && <Link className="b-btn ghost" to={LEGACY_SERVICE}>공연 정보 · 셋리스트 · 채팅 (기존 서비스)</Link>}
        {soon.length === 0 && <Empty>곧 시작하는 공연이 없어요.</Empty>}
      </section>

      <section className="b-stack">
        <h2 className="b-h2">이후 공연</h2>
        {later.map((t) => row(t, 'later'))}
        {later.length === 0 && <Empty>예정된 티켓이 없어요. <Link to="/app/events">공연 찾기</Link></Empty>}
      </section>

      <section className="b-stack">
        <h2 className="b-h2">사용 완료</h2>
        {used.map((t) => row(t, 'used'))}
        {used.length === 0 && <Empty>입장한 티켓이 없어요.</Empty>}
      </section>

      {refunds.length > 0 && (
        <section className="b-stack">
          <h2 className="b-h2">환불</h2>
          {refunds.map(({ b, p }) => (
            <article key={b.id} className="b-card b-pad b-row between">
              <span className="b-stack tight"><strong>{eventOf(b.event_id).title}</strong><span className="b-sub">{won(b.total_amount_krw)} · {p!.refund_account}</span></span>
              <span className={`b-status${p!.status === 'REFUNDED' ? ' ok' : ' wait'}`}>{p!.status === 'REFUNDED' ? '환불 완료' : '환불 대기'}</span>
            </article>
          ))}
        </section>
      )}

      {missed.length > 0 && (
        <section className="b-stack">
          <h2 className="b-h2">지난·취소된 공연</h2>
          {missed.map((t) => row(t, 'missed'))}
        </section>
      )}

      {open && (() => {
        const ev = eventOf(open.event_id)
        const token = qr?.ticketId === open.id ? qr.token : null
        const live = db.tickets.find((t) => t.id === open.id)
        return (
          <div className="b-modal" onClick={() => setOpen(null)}>
            <div className="b-sheet b-center" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="입장 QR">
              <h2>{ev.title}</h2>
              <p className="b-sub">{dateLabel(ev.starts_at)} · {ev.venue_name}</p>
              <p><b>입장번호 {open.entry_number}번</b></p>
              {live?.status === 'CHECKED_IN'
                ? <p className="b-status ok">입장 완료</p>
                : token ? <div className="b-qr"><QRCodeSVG value={token} size={200} level="M" /></div> : <p className="b-sub">QR을 불러오는 중…</p>}
              {qr?.offline && qr.ticketId === open.id && <p className="b-warn">인터넷 연결이 약해 이 기기에 저장된 QR을 보여 줘요.</p>}
              <p className="b-note">현장에서 운영진에게 이 QR을 보여 주세요. 화면 밝기를 높이면 잘 찍혀요.<br />코드: <code>{token}</code></p>
              {ev.id && <Link className="b-link" to={`/app/e/${ev.id}`}>공연 정보 확인</Link>}
              <button type="button" className="b-btn ghost" onClick={() => setOpen(null)}>닫기</button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
