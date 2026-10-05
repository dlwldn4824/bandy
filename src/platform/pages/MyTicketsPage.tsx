import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { TICKET_IMAGE, formatPhone, samePhone } from '../model'
import { usePlatform } from '../store'

export default function MyTicketsPage() {
  const { isAuthenticated, isLoading, user } = useAuth()
  const { events, guests } = usePlatform()

  if (isLoading) return null

  if (!isAuthenticated || !user || user.phone === 'admin') {
    return (
      <section className="pf-card pf-pad pf-stack" style={{ maxWidth: 420, margin: '0 auto' }}>
        <h1>로그인 해주세요</h1>
        <p className="pf-lead" style={{ textAlign: 'left' }}>내 티켓은 로그인한 뒤에 볼 수 있습니다.</p>
        <Link className="pf-btn" to="/login">로그인</Link>
      </section>
    )
  }

  const booked = events.filter((event) => {
    const mine = guests.some((guest) => guest.eventId === event.id && guest.name === user.name && samePhone(guest.phone, user.phone))
    const currentShow = event.id === 'summer'
    return mine || currentShow
  })

  return (
    <div className="pf-ticket-page">
      <h1 className="pf-page-title">내 티켓</h1>
      <p className="pf-lead">{user.name} · {formatPhone(user.phone)} 님이 예매한 공연입니다.</p>
      <div className="pf-ticket-list">
        {booked.map((event) => {
          const guest = guests.find((item) => item.eventId === event.id && item.name === user.name && samePhone(item.phone, user.phone))
          const confirmed = guest ? guest.paymentConfirmed : user.paymentConfirmed === true
          return (
            <Link key={event.id} className="pf-ticket-row" to={`/e/${event.id}`}>
              <img src={TICKET_IMAGE} alt="" />
              <span className="pf-ticket-copy">
                <span className="pf-ticket-title">
                  <strong>{event.title}</strong>
                  <span className={`pf-status ${confirmed ? 'ok' : 'wait'}`}>
                    {confirmed ? '입장 확정' : '입금 대기'}
                  </span>
                </span>
                <span className="pf-meta">{event.dateLabel} · {event.venue}{guest ? ` · ${guest.kind}` : ''}</span>
              </span>
              <span className="pf-ticket-go">들어가기</span>
            </Link>
          )
        })}
      </div>
      {booked.length === 0 && <p className="pf-lead">예매한 공연이 없습니다.</p>}
    </div>
  )
}
