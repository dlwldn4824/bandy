import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useBandy } from '../store'
import { cancelBooking, qrOf } from '../repo'
import { Empty, Icon, NeedLogin, PageHeader, Poster } from '../components'
import { dateLabel, dayKey, won } from '../format'
import { Ticket } from '../types'

const IMMINENT_MS = 24 * 3600000 // [미정] '입장 예정'으로 묶는 기준: 공연 시작 24시간 전부터

// 와이어프레임 IA: 내 티켓 = 입장 예정 → 이후 공연 → 사용 완료 / 티켓 선택 시 QR 바로 표시
export function TicketsPage() {
  const { db, me, run, showToast } = useBandy()
  const [open, setOpen] = useState<Ticket | null>(null)
  if (!me) return <div className="b-page"><PageHeader title="내 티켓" /><NeedLogin what="내 티켓" /></div>

  const eventOf = (id: string) => db.events.find((e) => e.id === id)!
  const tickets = db.tickets.filter((t) => t.user_id === me.id && t.status !== 'CANCELLED')
    .sort((a, b) => eventOf(a.event_id).starts_at.localeCompare(eventOf(b.event_id).starts_at) || a.issue_sequence - b.issue_sequence)
  const issued = tickets.filter((t) => t.status === 'ISSUED')
  const soon = issued.filter((t) => new Date(eventOf(t.event_id).starts_at).getTime() - Date.now() < IMMINENT_MS)
  const later = issued.filter((t) => !soon.includes(t))
  const used = tickets.filter((t) => t.status === 'CHECKED_IN')
  const pending = db.bookings.filter((b) => b.user_id === me.id && b.status === 'PENDING_PAYMENT')

  const cancel = (bookingId: string) => {
    const r = run((d) => cancelBooking(d, me.id, bookingId))
    showToast(r.ok ? '예매를 취소했어요.' : r.error)
  }

  const pass = (t: Ticket, dim = false) => {
    const ev = eventOf(t.event_id)
    return (
      <button key={t.id} type="button" className={`b-pass${dim ? ' used' : ''}`} onClick={() => !dim && setOpen(t)} disabled={dim}>
        <span className="b-pass-head">
          <span className="b-pass-text">
            <span className="b-eyebrow red">MOBILE LIVE PASS</span>
            <strong>{ev.title}</strong>
            <span className="b-meta-row"><Icon name="calendar" size={[12, 13]} />{dateLabel(ev.starts_at)}</span>
          </span>
          <Poster event={ev} className="mini" />
        </span>
        <span className="b-pass-entry">
          <span className="b-entry-badge"><small>{dim ? '입장 완료' : '입금 확인 · 확정'}</small>입장번호 {t.entry_number}번</span>
          {!dim && <span className="b-accent-link">QR 보기</span>}
        </span>
      </button>
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
                <div className="b-row between"><strong>{ev.title}</strong><span className="b-status wait">입금 확인 대기 중</span></div>
                <p className="b-sub">{item.ticket_type_name} {item.quantity}매 · {won(b.total_amount_krw)} · 입금자명 {pay.depositor_name}</p>
                <p className="b-note">{ev.bank_name} {ev.account_number} ({ev.account_holder})로 입금하면 주최 동아리가 확인 후 티켓을 발급해요.</p>
                <button type="button" className="b-btn ghost small" onClick={() => cancel(b.id)}>예매 취소</button>
              </article>
            )
          })}
        </section>
      )}

      <section className="b-stack">
        <h2 className="b-h2">입장 예정</h2>
        {soon.map((t) => pass(t))}
        {soon.length === 0 && <Empty>24시간 안에 시작하는 공연이 없어요.</Empty>}
      </section>

      <section className="b-stack">
        <h2 className="b-h2">이후 공연</h2>
        {later.map((t) => pass(t))}
        {later.length === 0 && <Empty>예정된 티켓이 없어요. <Link to="/app/events">공연 찾기</Link></Empty>}
      </section>

      {used.length > 0 && (
        <section className="b-stack">
          <h2 className="b-h2">사용 완료</h2>
          {used.map((t) => pass(t, true))}
        </section>
      )}

      {open && (() => {
        const ev = eventOf(open.event_id)
        const qr = qrOf(db, open.id)
        const live = db.tickets.find((t) => t.id === open.id)
        return (
          <div className="b-modal" onClick={() => setOpen(null)}>
            <div className="b-sheet b-center" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="입장 QR">
              <span className="b-eyebrow">VIP DIGITAL ENTRY · {dayKey(ev.starts_at)}</span>
              <h2>{ev.title}</h2>
              <p className="b-sub">{dateLabel(ev.starts_at)} · {ev.venue_name}</p>
              {live?.status === 'CHECKED_IN'
                ? <p className="b-status ok big">입장 완료</p>
                : qr && <div className="b-qr"><QRCodeSVG value={qr.token} size={208} level="M" /></div>}
              <span className="b-entry-badge"><small>사전예약 확정</small>입장번호 {open.entry_number}번</span>
              <p className="b-note">현장에서 운영진에게 이 QR을 보여 주세요.<br />코드: <code>{qr?.token}</code></p>
              <Link className="b-accent-link" to={`/app/e/${ev.id}`}>공연 정보 확인</Link>
              <button type="button" className="b-btn ghost" onClick={() => setOpen(null)}>닫기</button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
