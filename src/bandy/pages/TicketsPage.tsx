import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useBandy } from '../store'
import { Empty, NeedLogin, PageHeader } from '../components'
import { dateLabel, won } from '../format'
import { Ticket } from '../types'

const IMMINENT_MS = 24 * 3600000 // [미정] 입장 임박 기준. 지금은 공연 시작 24시간 전부터 '입장 예정'
const LEGACY_SERVICE = '/performances' // 기존 서비스(공연 정보 · 셋리스트 · 채팅 · 방명록). 공연별 연결 방식은 미정

// 구조도: 내 티켓 = 입장 예정 → 이후 공연 → 사용 완료 / 티켓 선택 → 티켓 상세·QR (ticketId · qrToken · checkInStatus)
export function TicketsPage() {
  const { db, me, call, showToast } = useBandy()
  const [open, setOpen] = useState<Ticket | null>(null)
  const [qr, setQr] = useState<{ ticketId: string; token: string } | null>(null)
  // 티켓을 열 때마다 QR을 새로 받는다(서버에는 해시만 저장, 이전 QR은 폐기)
  useEffect(() => {
    if (!open) return
    let alive = true
    call((b) => b.issueTicketQr(open.id), { reload: false }).then((r) => {
      if (!alive) return
      if (r.ok) setQr({ ticketId: open.id, token: r.value })
      else showToast(r.error)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id])
  if (!me) return <div className="b-page"><PageHeader title="내 티켓" /><NeedLogin what="내 티켓" /></div>

  const eventOf = (id: string) => db.events.find((e) => e.id === id)!
  const tickets = db.tickets.filter((t) => t.user_id === me.id && t.status !== 'CANCELLED')
    .sort((a, b) => eventOf(a.event_id).starts_at.localeCompare(eventOf(b.event_id).starts_at) || a.issue_sequence - b.issue_sequence)
  const issued = tickets.filter((t) => t.status === 'ISSUED')
  const soon = issued.filter((t) => new Date(eventOf(t.event_id).starts_at).getTime() - Date.now() < IMMINENT_MS)
  const later = issued.filter((t) => !soon.includes(t))
  const used = tickets.filter((t) => t.status === 'CHECKED_IN')
  const pending = db.bookings.filter((b) => b.user_id === me.id && b.status === 'PENDING_PAYMENT')

  const cancel = async (bookingId: string) => {
    const r = await call((b) => b.cancelBooking(bookingId))
    showToast(r.ok ? '예매를 취소했어요.' : r.error)
  }

  const row = (t: Ticket, kind: 'soon' | 'later' | 'used') => {
    const ev = eventOf(t.event_id)
    const item = db.booking_items.find((i) => i.id === t.booking_item_id)
    return (
      <div key={t.id} className="b-stack">
        <button type="button" className={`b-ticket${kind === 'used' ? ' used' : ''}`} onClick={() => kind !== 'used' && setOpen(t)} disabled={kind === 'used'}>
          <span className="b-ticket-no">{t.entry_number}</span>
          <span className="b-grow b-stack tight">
            <strong>{ev.title}</strong>
            <span className="b-sub">{dateLabel(ev.starts_at)} · {item?.ticket_type_name}</span>
          </span>
          <span className={`b-status${kind === 'used' ? '' : ' red'}`}>{kind === 'used' ? '입장 완료' : 'QR'}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="b-page">
      <PageHeader title="내 티켓" right={<span className="b-sub">{me.display_name}</span>} />

      {pending.length > 0 && (
        <section className="b-stack">
          <h2 className="b-h2">입금 대기</h2>
          {pending.map((b) => {
            const ev = eventOf(b.event_id)
            const item = db.booking_items.find((i) => i.booking_id === b.id)!
            const pay = db.payments.find((p) => p.booking_id === b.id)!
            return (
              <article key={b.id} className="b-card b-pad b-stack">
                <div className="b-row between"><strong>{ev.title}</strong><span className="b-status wait">입금 대기</span></div>
                <p className="b-sub">{item.ticket_type_name} {item.quantity}매 · {won(b.total_amount_krw)} · 입금자명 {pay.depositor_name}</p>
                <p className="b-sub">{ev.bank_name} {ev.account_number} (예금주 {ev.account_holder})</p>
                <button type="button" className="b-btn ghost small" onClick={() => cancel(b.id)}>예매 취소</button>
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
              <p className="b-note">현장에서 운영진에게 이 QR을 보여 주세요.<br />코드: <code>{token}</code></p>
              <Link className="b-link" to={`/app/e/${ev.id}`}>공연 정보 확인</Link>
              <button type="button" className="b-btn ghost" onClick={() => setOpen(null)}>닫기</button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
