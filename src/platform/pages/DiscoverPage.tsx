import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Category } from '../model'
import { usePlatform } from '../store'

const CATEGORIES: Array<Category | '전체'> = ['전체', '밴드', '연극', '동아리', '페스티벌']

export default function DiscoverPage() {
  const { publicEvents, organizers } = usePlatform()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | '전체'>('전체')

  const events = useMemo(() => {
    const text = query.trim()
    return publicEvents.filter((event) => {
      const organizer = organizers.find((item) => item.id === event.organizerId)
      const haystack = `${event.title} ${event.venue} ${event.city} ${organizer?.name ?? ''}`
      const matchesText = !text || haystack.includes(text)
      const matchesCategory = category === '전체' || event.category === category
      return matchesText && matchesCategory
    })
  }, [category, organizers, publicEvents, query])

  return (
    <div>
      <h1 className="pf-page-title">다가오는 공연</h1>
      <p className="pf-lead">동아리와 팀이 올린 공연을 고르고, 그 공연만 예매합니다.</p>
      <input className="pf-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="공연, 장소, 동아리" />
      <div className="pf-chips">
        {CATEGORIES.map((item) => (
          <button key={item} type="button" className={`pf-chip${category === item ? ' active' : ''}`} onClick={() => setCategory(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="pf-grid cards">
        {events.map((event) => {
          const organizer = organizers.find((item) => item.id === event.organizerId)
          return (
            <Link key={event.id} className="pf-card" to={`/e/${event.id}`}>
              <img className="pf-poster" src={event.poster} alt="" />
              <div className="pf-card-body">
                <div className="pf-meta">{event.category} · {event.city}</div>
                <h2>{event.title}</h2>
                <p className="pf-meta">{event.dateLabel}<br />{event.venue}</p>
                <p className="pf-meta">{organizer?.name}</p>
                <p className="pf-price">사전 {event.price}</p>
              </div>
            </Link>
          )
        })}
      </div>
      {events.length === 0 && <p className="pf-lead">조건에 맞는 공연이 없습니다.</p>}
    </div>
  )
}
