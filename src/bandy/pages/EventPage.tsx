import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBandy } from '../store'
import { createBooking, isEventStaff, publicEvents, remaining, ticketTypesOf } from '../repo'
import { CATEGORY_COLOR, Empty } from '../components'
import { dateLabel, won } from '../format'

export function EventPage() {
  const { eventId = '' } = useParams()
  const { db, me, run, showToast } = useBandy()
  const navigate = useNavigate()
  const event = db.events.find((e) => e.id === eventId)
  const staff = isEventStaff(db, me?.id ?? null, eventId)
  const visible = event && (publicEvents(db).some((e) => e.id === eventId) || staff)
  const types = event ? ticketTypesOf(db, event.id) : []
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const [qty, setQty] = useState(1)
  const [depositor, setDepositor] = useState(me?.display_name ?? '')
  const [error, setError] = useState('')

  if (!event || !visible) return <div className="b-page"><Empty>공개된 행사가 아니에요.</Empty></div>

  const club = db.clubs.find((c) => c.id === event.club_id)!
  const selected = types.find((t) => t.id === typeId) ?? types[0]
  const free = selected?.price_krw === 0
  const myBookings = me ? db.bookings.filter((b) => b.user_id === me.id && b.event_id === event.id && b.status !== 'CANCELLED') : []

  const book = () => {
    if (!me) {
      navigate('/app/login')
      return
    }
    const r = run((d) => createBooking(d, me.id, selected.id, qty, depositor))
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError('')
    showToast(free ? '신청이 확정됐어요. 내 티켓에서 QR을 확인하세요.' : '예매했어요. 계좌로 입금하면 동아리가 확인 후 티켓을 발급해요.')
    navigate('/app/tickets')
  }

  return (
    <div className="b-page">
      <header className="b-top">
        <button type="button" className="b-back" onClick={() => navigate(-1)}>뒤로</button>
        {staff && <span className="b-badge">내 동아리 행사</span>}
      </header>
      <div className="b-poster" style={{ ['--accent' as string]: CATEGORY_COLOR[event.category ?? '공연'] }}>
        <span>{event.category}</span>
        <strong>{event.title}</strong>
      </div>
      <section className="b-section">
        <p className="b-sub">{dateLabel(event.starts_at)}</p>
        <p className="b-sub">{event.venue_name}{event.address ? ` · ${event.address}` : ''}</p>
        <Link className="b-link" to={`/app/c/${club.id}`}>{club.name} · {club.school} 동아리 보기</Link>
        {event.description && <p className="b-body">{event.description}</p>}
        {event.status !== 'PUBLISHED' && <p className="b-warn">아직 공개 전인 초안이에요. 동아리 운영진에게만 보여요.</p>}
      </section>

      {staff && (
        <section className="b-card b-pad b-stack">
          <h2>운영진 메뉴</h2>
          <Link className="b-btn ghost" to={`/app/manage/${club.id}?event=${event.id}`}>예매자 명단 · 입금 확인</Link>
          <Link className="b-btn" to={`/app/scan/${event.id}`}>QR 입장 스캔</Link>
        </section>
      )}

      {myBookings.length > 0 && (
        <section className="b-card b-pad">
          <h2>내 예매</h2>
          {myBookings.map((b) => (
            <p key={b.id} className="b-sub">
              {b.status === 'CONFIRMED' ? '입장 확정' : '입금 대기'} · {won(b.total_amount_krw)}
            </p>
          ))}
          <Link className="b-link" to="/app/tickets">내 티켓에서 보기</Link>
        </section>
      )}

      {event.status === 'PUBLISHED' && selected && (
        <section className="b-card b-pad b-stack">
          <h2>{free ? '참가 신청' : '예매'}</h2>
          {types.map((t) => (
            <label key={t.id} className={`b-option${t.id === selected.id ? ' on' : ''}`}>
              <input type="radio" name="tt" checked={t.id === selected.id} onChange={() => setTypeId(t.id)} />
              <span>{t.name}</span>
              <span className="b-sub">{won(t.price_krw)} · 남은 {remaining(t)}석</span>
            </label>
          ))}
          <div className="b-row between">
            <span>수량</span>
            <span className="b-stepper">
              <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="한 장 빼기">−</button>
              <b>{qty}</b>
              <button type="button" onClick={() => setQty(Math.min(10, qty + 1))} aria-label="한 장 더하기">+</button>
            </span>
          </div>
          {!free && (
            <>
              <label className="b-field">
                <span>입금자명</span>
                <input value={depositor} onChange={(e) => setDepositor(e.target.value)} placeholder="입금할 때 쓰는 이름" />
              </label>
              <p className="b-note">입금 계좌: {event.bank_name} {event.account_number} ({event.account_holder})<br />
                입금하면 주최 동아리가 입금자명을 확인하고 티켓을 발급해요.</p>
            </>
          )}
          {error && <p className="b-warn">{error}</p>}
          <button type="button" className="b-btn" onClick={book}>
            {me ? `${won(selected.price_krw * qty)} ${free ? '신청하기' : '예매하기'}` : '로그인하고 예매하기'}
          </button>
        </section>
      )}
    </div>
  )
}
