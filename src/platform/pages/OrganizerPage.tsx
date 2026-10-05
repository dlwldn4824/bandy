import { Link, useParams } from 'react-router-dom'
import { usePlatform } from '../store'

export default function OrganizerPage() {
  const { organizerId = '' } = useParams()
  const { organizerById, events, session } = usePlatform()
  const organizer = organizerById(organizerId)
  if (!organizer) return <p className="pf-lead">동아리를 찾지 못했습니다.</p>

  const shows = events.filter((event) => event.organizerId === organizer.id && event.status === '공개')
  const isOwner = session?.role === 'host' && session.organizerId === organizer.id

  return (
    <div className="pf-stack">
      <div>
        <p className="pf-meta">{organizer.city}</p>
        <h1 className="pf-page-title" style={{ textAlign: 'left' }}>{organizer.name}</h1>
        <p className="pf-lead" style={{ textAlign: 'left' }}>{organizer.summary}</p>
        {isOwner && <Link className="pf-link" to="/host/settings">프로필 수정</Link>}
      </div>
      <div className="pf-grid cards">
        {shows.map((event) => (
          <Link key={event.id} className="pf-card" to={`/e/${event.id}`}>
            <img className="pf-poster" src={event.poster} alt="" />
            <div className="pf-card-body">
              <h2>{event.title}</h2>
              <p className="pf-meta">{event.dateLabel}<br />{event.venue}</p>
            </div>
          </Link>
        ))}
      </div>
      {shows.length === 0 && <p className="pf-muted">공개된 공연이 없습니다.</p>}
    </div>
  )
}
