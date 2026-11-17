import { Link, useNavigate } from 'react-router-dom'
import { EventRow } from './types'
import { dateLabel, distanceKm, HERE, won } from './format'
import { useBandy } from './store'
import { minPrice } from './repo'

export const APP_NAME = 'BANDY' // 서비스 이름 확정 전(BANDY / RE:CONNECT). 여기만 바꾸면 된다.

export const CATEGORY_COLOR: Record<string, string> = {
  공연: 'var(--b-red)',
  해커톤: 'var(--b-blue)',
  학술회: 'var(--b-green)',
  네트워킹: 'var(--b-amber)',
}

const BOUNDS = { latMin: 37.605, latMax: 37.64, lngMin: 127.045, lngMax: 127.095 }

function project(lat: number, lng: number) {
  const x = ((lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)) * 100
  const y = (1 - (lat - BOUNDS.latMin) / (BOUNDS.latMax - BOUNDS.latMin)) * 100
  return { x: Math.min(94, Math.max(6, x)), y: Math.min(92, Math.max(8, y)) }
}

// 카카오 지도 연결 전 임시 지도. 좌표 → 화면 위치만 맞춘다.
export function FakeMap({ events, tall = false }: { events: EventRow[]; tall?: boolean }) {
  const navigate = useNavigate()
  const me = project(HERE.lat, HERE.lng)
  return (
    <div className={`b-map${tall ? ' tall' : ''}`} role="img" aria-label="공연 위치 지도">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="b-map-bg" aria-hidden>
        <path d="M0 62 C 25 55, 40 72, 60 64 S 90 58, 100 66 L100 74 C 85 66, 70 76, 55 72 S 25 64, 0 70 Z" className="b-map-river" />
        {[12, 30, 48, 70, 88].map((x) => <line key={`v${x}`} x1={x} y1="0" x2={x + 4} y2="100" className="b-map-road" />)}
        {[15, 38, 52, 84].map((y) => <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y + 3} className="b-map-road" />)}
        <rect x="62" y="20" width="9" height="8" className="b-map-park" />
        <rect x="20" y="78" width="10" height="7" className="b-map-park" />
      </svg>
      <span className="b-map-me" style={{ left: `${me.x}%`, top: `${me.y}%` }} title="내 위치" />
      {events.filter((e) => e.latitude != null && e.longitude != null).map((e) => {
        const p = project(e.latitude!, e.longitude!)
        return (
          <button
            key={e.id}
            type="button"
            className="b-pin"
            style={{ left: `${p.x}%`, top: `${p.y}%`, ['--pin' as string]: CATEGORY_COLOR[e.category ?? '공연'] }}
            onClick={() => navigate(`/app/e/${e.id}`)}
          >
            <span className="b-pin-label">{e.title.length > 10 ? `${e.title.slice(0, 10)}…` : e.title}</span>
            <span className="b-pin-dot" />
          </button>
        )
      })}
    </div>
  )
}

export function EventCard({ event, connected }: { event: EventRow; connected?: boolean }) {
  const { db } = useBandy()
  const club = db.clubs.find((c) => c.id === event.club_id)
  const km = distanceKm(event.latitude, event.longitude)
  const price = minPrice(db, event.id)
  return (
    <Link to={`/app/e/${event.id}`} className="b-card b-event">
      <div className="b-event-main">
        <p className="b-kicker" style={{ color: CATEGORY_COLOR[event.category ?? '공연'] }}>
          {event.category}{km != null ? ` · ${km}km` : ''}{connected ? ' · 교류 동아리' : ''}
        </p>
        <h3>{event.title}</h3>
        <p className="b-sub">{dateLabel(event.starts_at)} · {event.venue_name}</p>
        <p className="b-sub">{club?.name} · {won(price)}</p>
      </div>
      <span className="b-cta">{price === 0 ? '신청' : '예매'}</span>
    </Link>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="b-empty">{children}</p>
}

export function NeedLogin({ what }: { what: string }) {
  return (
    <div className="b-card b-pad b-center">
      <p className="b-sub">{what}은(는) 로그인한 뒤에 볼 수 있어요.</p>
      <Link to="/app/login" className="b-btn">카카오로 시작하기</Link>
    </div>
  )
}
