import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useBandy } from '../store'
import { cancelBooking, qrOf } from '../repo'
import { Empty, NeedLogin } from '../components'
import { dateLabel, won } from '../format'
import { Ticket } from '../types'

export function TicketsPage() {
  const { db, me, run, showToast } = useBandy()
  const [open, setOpen] = useState<Ticket | null>(null)
  if (!me) return <div className="b-page"><header className="b-top"><span className="b-title">내 티켓</span></header><NeedLogin what="내 티켓" /></div>

  const eventOf = (id: string) => db.events.find((e) => e.id === id)!
  const tickets = db.tickets.filter((t) => t.user_id === me.id && t.status !== 'CANCELLED')
    .sort((a, b) => eventOf(a.event_id).starts_at.localeCompare(eventOf(b.event_id).starts_at) || a.issue_sequence - b.issue_sequence)
  const upcoming = tickets.filter((t) => t.status === 'ISSUED')
  const used = tickets.filter((t) => t.status === 'CHECKED_IN')
  const pending = db.bookings.filter((b) => b.user_id === me.id && b.status === 'PENDING_PAYMENT')

  const cancel = (bookingId: string) => {
    const r = run((d) => cancelBooking(d, me.id, bookingId))
    showToast(r.ok ? '예매를 취소했어요.' : r.error)
  }

  return (
    <div className="b-page">
      <header className="b-top"><span className="b-title">내 티켓</span><span className="b-sub">{me.display_name}</span></header>

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
                <p className="b-sub">{item.ticket_type_name} {item.quantity}장 · {won(b.total_amount_krw)} · 입금자명 {pay.depositor_name}</p>
                <p className="b-note">{ev.bank_name} {ev.account_number} ({ev.account_holder})로 입금하면<br />주최 동아리가 확인 후 티켓을 발급해요.</p>
                <button type="button" className="b-btn ghost small" onClick={() => cancel(b.id)}>예매 취소</button>
              </article>
            )
          })}
        </section>
      )}

      <section className="b-stack">
        <h2 className="b-h2">입장 예정</h2>
        {upcoming.map((t) => {
          const ev = eventOf(t.event_id)
          return (
            <button key={t.id} type="button" className="b-card b-ticket" onClick={() => setOpen(t)}>
              <span className="b-ticket-no">{t.entry_number ?? '-'}</span>
              <span className="b-ticket-body">
                <strong>{ev.title}</strong>
                <span className="b-sub">{dateLabel(ev.starts_at)} · {ev.venue_name}</span>
              </span>
              <span className="b-cta">QR</span>
            </button>
          )
        })}
        {upcoming.length === 0 && <Empty>입장할 티켓이 없어요. <Link to="/app">행사 찾기</Link></Empty>}
      </section>

      {used.length > 0 && (
        <section className="b-stack">
          <h2 className="b-h2">입장 완료</h2>
          {used.map((t) => {
            const ev = eventOf(t.event_id)
            return (
              <div key={t.id} className="b-card b-ticket used">
                <span className="b-ticket-no">{t.entry_number}</span>
                <span className="b-ticket-body"><strong>{ev.title}</strong><span className="b-sub">입장 {t.checked_in_at ? dateLabel(t.checked_in_at) : ''}</span></span>
              </div>
            )
          })}
        </section>
      )}

      {open && (() => {
        const ev = eventOf(open.event_id)
        const qr = qrOf(db, open.id)
        const live = db.tickets.find((t) => t.id === open.id)
        return (
          <div className="b-modal" onClick={() => setOpen(null)}>
            <div className="b-sheet b-center" onClick={(e) => e.stopPropagation()}>
              <p className="b-kicker">입장번호 {open.entry_number}</p>
              <h2>{ev.title}</h2>
              <p className="b-sub">{dateLabel(ev.starts_at)}</p>
              {live?.status === 'CHECKED_IN'
                ? <p className="b-status ok big">입장 완료</p>
                : qr && <div className="b-qr"><QRCodeSVG value={qr.token} size={208} level="M" /></div>}
              <p className="b-note">현장에서 운영진에게 이 QR을 보여 주세요.<br />코드: <code>{qr?.token}</code></p>
              <button type="button" className="b-btn ghost" onClick={() => setOpen(null)}>닫기</button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
