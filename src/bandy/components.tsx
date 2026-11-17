import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { EventRow } from './types'
import { dateLabel, distanceKm, HERE, shortDate, timeOf, won } from './format'
import { useBandy } from './store'
import { managerClubIds, minPrice } from './repo'

export const APP_NAME = 'BANDY' // 서비스 이름 확정 전(BANDY / RE:CONNECT). 여기만 바꾸면 된다.

// 피그마에서 내려받은 아이콘(src/bandy/icons). 색은 currentColor를 따르도록 마스크로 쓴다.
const ICONS = import.meta.glob('./icons/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export function Icon({ name, size = 16, className = '' }: { name: string; size?: number | [number, number]; className?: string }) {
  const url = ICONS[`./icons/${name}.svg`]
  const [w, h] = Array.isArray(size) ? size : [size, size]
  return (
    <span
      aria-hidden
      className={`b-icon ${className}`}
      style={{ width: w, height: h, WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")` }}
    />
  )
}

export const CATEGORY_COLOR: Record<string, string> = {
  공연: 'var(--b-red)',
  해커톤: 'var(--b-blue)',
  학술회: 'var(--b-mint)',
  네트워킹: 'var(--b-amber)',
}

// 포스터가 없으면 분류 색 그라데이션
export function Poster({ event, className = '' }: { event: EventRow; className?: string }) {
  return (
    <div className={`b-poster-img ${className}`} style={{ ['--accent' as string]: CATEGORY_COLOR[event.category ?? '공연'] }}>
      {event.poster_path ? <img src={event.poster_path} alt="" loading="lazy" /> : <span className="b-poster-fallback">{event.category}</span>}
    </div>
  )
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

// 피그마 「공연 찾기」 카드: 포스터 + 동아리 배지 + 예매중 + 일시·장소 + 티켓 정보
export function EventCard({ event, connected }: { event: EventRow; connected?: boolean }) {
  const { db } = useBandy()
  const club = db.clubs.find((c) => c.id === event.club_id)
  const km = distanceKm(event.latitude, event.longitude)
  const price = minPrice(db, event.id)
  return (
    <Link to={`/app/e/${event.id}`} className="b-card b-event">
      <div className="b-event-poster">
        <Poster event={event} />
        <span className="b-overlay-chip"><i style={{ background: connected ? 'var(--b-mint)' : 'var(--b-red)' }} />{club?.name}</span>
        {event.status === 'PUBLISHED' && <span className="b-tag-red">{price === 0 ? '신청중' : '예매중'}</span>}
        <div className="b-event-title">
          <span className="b-eyebrow">{event.category}{connected ? ' · 교류 동아리' : ''}</span>
          <h3>{event.title}</h3>
        </div>
      </div>
      <div className="b-event-meta">
        <span className="b-meta-row"><Icon name="calendar" size={[12, 13]} />{dateLabel(event.starts_at)}</span>
        <span className="b-meta-row"><Icon name="pin" size={[11, 13]} />{event.venue_name}{km != null ? ` · ${km}km` : ''}</span>
        <span className="b-ticket-strip"><span>티켓 정보</span><b>{price === 0 ? '무료 신청' : `사전예매 ${won(price)}`}</b></span>
      </div>
    </Link>
  )
}

// 와이어프레임 「실시간 공연 소식」 한 줄
export function LiveRow({ event }: { event: EventRow }) {
  const { db } = useBandy()
  const club = db.clubs.find((c) => c.id === event.club_id)
  const start = new Date(event.starts_at).getTime()
  const now = Date.now()
  const live = now >= start && now < start + 3 * 3600000
  const today = shortDate(event.starts_at) === shortDate(new Date().toISOString())
  const badge = live ? '진행 중' : today ? `오늘 ${timeOf(event.starts_at)}` : dateLabel(event.starts_at)
  return (
    <Link to={`/app/e/${event.id}`} className="b-live-row">
      <Poster event={event} className="thumb" />
      <span className="b-live-body">
        <span className={`b-live-badge${live ? ' on' : ''}`}>{badge}</span>
        <strong>{event.title}</strong>
        <span className="b-sub">{club?.name} · {event.venue_name}</span>
      </span>
      <Icon name="chev" size={[7, 12]} className="muted" />
    </Link>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="b-empty">{children}</p>
}

export function NeedLogin({ what }: { what: string }) {
  return (
    <div className="b-card b-pad b-center b-stack">
      <p className="b-sub">{what}은(는) 로그인한 뒤에 볼 수 있어요.</p>
      <Link to="/app/login" className="b-btn">로그인</Link>
    </div>
  )
}

export function PageHeader({ title, back = false, right }: { title?: string; back?: boolean; right?: React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="b-top">
      <span className="b-row">
        {back
          ? <button type="button" className="b-icon-btn" aria-label="뒤로 가기" onClick={() => navigate(-1)}><Icon name="back" size={16} /></button>
          : <i className="b-dot" />}
        {title && <span className="b-title">{title}</span>}
      </span>
      {right}
    </header>
  )
}

// 와이어프레임 v3 하단 바: 홈 / 지도·캘린더 / 가운데(개인=내 티켓, 동아리=+공연 등록) / 동아리 찾기 / 마이페이지
export function BottomBar() {
  const { db, me } = useBandy()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menu, setMenu] = useState(false)
  const clubIds = managerClubIds(db, me?.id ?? null)
  const isClub = clubIds.length > 0
  const club = isClub ? db.clubs.find((c) => c.id === clubIds[0]) : undefined
  const tab = (to: string, label: string, icon: string, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => `b-tab${isActive ? ' active' : ''}`} onClick={() => setMenu(false)}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </NavLink>
  )
  const ticketsActive = pathname.startsWith('/app/tickets')

  return (
    <>
      {menu && <div className="b-menu-dim" onClick={() => setMenu(false)} />}
      {menu && club && (
        <div className="b-fab-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); navigate(`/app/manage/${club.id}?tab=new`) }}>
            <Icon name="menu-cal" size={16} />공연 등록
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); navigate(`/app/manage/${club.id}?tab=profile`) }}>
            <Icon name="menu-useradd" size={16} />동아리 등록·수정
          </button>
        </div>
      )}
      <nav className="b-tabs" aria-label="하단 메뉴">
        {tab('/app', '홈', 'tab-home', true)}
        {tab('/app/map', '지도·캘린더', 'tab-map')}
        {isClub ? (
          <button type="button" className={`b-tab b-tab-center club${menu ? ' active' : ''}`} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <span className="b-fab">{menu ? <Icon name="tab-x" size={14} /> : <Icon name="plus" size={14} />}</span>
            <span>공연 등록</span>
          </button>
        ) : (
          <button type="button" className={`b-tab b-tab-center${ticketsActive ? ' active' : ''}`} onClick={() => navigate('/app/tickets')}>
            <span className="b-fab"><Icon name="tab-qr" size={18} /></span>
            <span>내 티켓</span>
          </button>
        )}
        {tab('/app/clubs', '동아리 찾기', 'tab-users')}
        {tab('/app/my', '마이페이지', 'tab-user')}
      </nav>
    </>
  )
}
