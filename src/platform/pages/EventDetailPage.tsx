import { Link, useParams } from 'react-router-dom'
import { MAP_IMAGE } from '../model'
import { usePlatform } from '../store'

export default function EventDetailPage() {
  const { eventId = '' } = useParams()
  const { eventById, organizerById } = usePlatform()
  const event = eventById(eventId)
  if (!event || event.status !== '공개') {
    return <p className="pf-lead">공개된 공연이 없습니다. 공연 찾기에서 다시 골라 주세요.</p>
  }
  const organizer = organizerById(event.organizerId)

  return (
    <div className="pf-split">
      <img className="pf-poster detail" src={event.poster} alt="" />
      <div className="pf-stack">
        <div>
          <p className="pf-meta">{event.category} · {event.city}</p>
          <h1 className="pf-page-title" style={{ textAlign: 'left' }}>{event.title}</h1>
          <p className="pf-meta">{event.dateLabel}<br />{event.venue}</p>
          <p className="pf-price">사전 {event.price} · 현장 {event.walkInPrice}</p>
        </div>
        <p className="pf-center-copy">{event.summary}</p>
        {organizer && (
          <Link className="pf-link" to={`/o/${organizer.id}`}>{organizer.name} 동아리 페이지</Link>
        )}
        <div className="pf-card">
          <img className="pf-map" src={MAP_IMAGE} alt="" />
          <div className="pf-card-body">
            <h2>위치</h2>
            <p className="pf-meta">{event.venue}<br />{event.address}</p>
          </div>
        </div>
        <div className="pf-card pf-pad">
          <h2>타임라인</h2>
          {event.timeline.map((item) => (
            <p key={item.id} className="pf-meta" style={{ marginTop: '0.45rem' }}>{item.time} {item.title} · {item.description}</p>
          ))}
        </div>
        <Link className="pf-btn" to={`/e/${event.id}/book`}>예매하기</Link>
        <div className="pf-row">
          <Link className="pf-link" to={`/e/${event.id}/onsite`}>현장 예매</Link>
          <Link className="pf-link" to={`/e/${event.id}/staff`}>운영진 로그인</Link>
        </div>
      </div>
    </div>
  )
}
