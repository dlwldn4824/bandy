import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { EventRow } from './types'
import { dateLabel, distanceKm, HERE, shortDate, timeOf } from './format'
import { useBandy } from './store'
import { activeManagerClubIds } from './repo'
import { useLoginPath } from './convenience'

export const APP_NAME = 'BANDY' // 서비스 이름 확정 전(BANDY / RE:CONNECT). 여기만 바꾸면 된다.

// 포스터 · 프로필 이미지 자리. 이미지가 없으면 빈 칸
export function Thumb({ src, label = '이미지', className = '' }: { src: string | null | undefined; label?: string; className?: string }) {
  return <span className={`b-thumb ${className}`}>{src ? <img src={src} alt="" /> : label}</span>
}

// 이미지 업로드 [POST 이미지 업로드]. 프로토타입은 브라우저에서 줄여 data URL로 저장한다.
export function ImageInput({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const [error, setError] = useState('')
  const pick = (file: File | undefined) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError('PNG, JPG, WebP만 올릴 수 있어요.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('5MB 이하 이미지만 올릴 수 있어요.'); return }
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 640 / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      onChange(canvas.toDataURL('image/jpeg', 0.8))
      setError('')
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  }
  return (
    <div className="b-field">
      <span>{label}</span>
      <div className="b-row">
        <Thumb src={value} />
        <label className="b-btn ghost small">
          이미지 선택
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {value && <button type="button" className="b-link" onClick={() => onChange(null)}>지우기</button>}
      </div>
      {error && <p className="b-warn">{error}</p>}
    </div>
  )
}

export function dateBadge(event: EventRow) {
  const start = new Date(event.starts_at).getTime()
  const now = Date.now()
  if (now >= start && now < start + 3 * 3600000) return '진행 중'
  if (shortDate(event.starts_at) === shortDate(new Date().toISOString())) return `오늘 ${timeOf(event.starts_at)}`
  return dateLabel(event.starts_at)
}

// 공연 한 줄: 포스터 · 일시 · 공연명 · 동아리 · 공연장
export function EventItem({ event, extra }: { event: EventRow; extra?: string }) {
  const { db } = useBandy()
  const club = db.clubs.find((c) => c.id === event.club_id)
  const live = dateBadge(event) === '진행 중'
  return (
    <Link to={`/app/e/${event.id}`} className="b-row-item">
      <span className="b-row-body">
        <span className={`b-status${live ? ' red' : ''}`}>{dateBadge(event)}</span>
        <strong>{event.title}</strong>
        <span className="b-sub">{club?.name} · {event.venue_name}{extra ? ` · ${extra}` : ''}</span>
      </span>
      <span className="b-chev" aria-hidden>›</span>
    </Link>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="b-empty">{children}</p>
}

export function NeedLogin({ what }: { what: string }) {
  const login = useLoginPath()
  return (
    <div className="b-card b-pad b-center b-stack">
      <p className="b-sub">{what}은(는) 로그인한 뒤에 볼 수 있어요.</p>
      <Link to={login} className="b-btn">로그인</Link>
    </div>
  )
}

export function PageHeader({ title, back = false, right }: { title?: string; back?: boolean; right?: React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="b-top">
      <span className="b-row">
        {back && <button type="button" className="b-back" aria-label="뒤로 가기" onClick={() => navigate(-1)}>←</button>}
        {title && <span className="b-title">{title}</span>}
      </span>
      {right}
    </header>
  )
}

// 지도 자리. 카카오 지도 연결 전이라 좌표만 점으로 찍는다(내 위치 기준 반경 표시).
const BOUNDS = { latMin: 37.605, latMax: 37.64, lngMin: 127.045, lngMax: 127.095 }
function project(lat: number, lng: number) {
  return {
    x: Math.min(94, Math.max(6, ((lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)) * 100)),
    y: Math.min(92, Math.max(8, (1 - (lat - BOUNDS.latMin) / (BOUNDS.latMax - BOUNDS.latMin)) * 100)),
  }
}
export function MapBox({ events, radiusKm }: { events: EventRow[]; radiusKm: number }) {
  const navigate = useNavigate()
  const me = project(HERE.lat, HERE.lng)
  // 경도 0.05도 ≈ 4.4km → 지도 폭 100%
  const radiusPct = (radiusKm / 4.4) * 100
  return (
    <div className="b-map" role="img" aria-label="공연 위치">
      <span className="b-map-caption">지도 자리 (카카오 지도 연결 예정)</span>
      <span className="b-map-radius" style={{ left: `${me.x}%`, top: `${me.y}%`, width: `${radiusPct * 2}%`, aspectRatio: '1' }} />
      <span className="b-map-me" style={{ left: `${me.x}%`, top: `${me.y}%` }} title="내 위치" />
      {events.map((e) => {
        if (e.latitude == null || e.longitude == null) return null
        const p = project(e.latitude, e.longitude)
        return (
          <button key={e.id} type="button" className="b-pin" style={{ left: `${p.x}%`, top: `${p.y}%` }} onClick={() => navigate(`/app/e/${e.id}`)}>
            {e.title.length > 8 ? `${e.title.slice(0, 8)}…` : e.title}
          </button>
        )
      })}
    </div>
  )
}

export function within(e: EventRow, radiusKm: number) {
  const d = distanceKm(e.latitude, e.longitude)
  return d != null && d <= radiusKm
}

// 하단 바: 홈 / 지도·캘린더 / 가운데(개인=내 티켓, 동아리=+공연 등록 메뉴) / 동아리 찾기 / 마이페이지
// '동아리'는 승인된 동아리의 운영진. 승인 대기·정지 동아리만 있으면 개인 하단 바(내 티켓)를 쓴다
export function BottomBar() {
  const { db, me } = useBandy()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menu, setMenu] = useState(false)
  const clubId = activeManagerClubIds(db, me?.id ?? null)[0]
  const tab = (to: string, label: string, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => `b-tab${isActive ? ' active' : ''}`} onClick={() => setMenu(false)}>{label}</NavLink>
  )
  return (
    <>
      {menu && <div className="b-menu-dim" onClick={() => setMenu(false)} />}
      {menu && clubId && (
        <div className="b-fab-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); navigate(`/app/manage/${clubId}?tab=new`) }}>공연 등록</button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); navigate(`/app/manage/${clubId}?tab=profile`) }}>동아리 등록·수정</button>
        </div>
      )}
      <nav className="b-tabs" aria-label="하단 메뉴">
        {tab('/app', '홈', true)}
        {tab('/app/map', '지도·캘린더')}
        {clubId ? (
          <button type="button" className="b-tab b-tab-center" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <span>{menu ? '닫기' : '+ 공연 등록'}</span>
          </button>
        ) : (
          <button type="button" className={`b-tab b-tab-center${pathname.startsWith('/app/tickets') ? ' active' : ''}`} onClick={() => navigate('/app/tickets')}>
            <span>내 티켓</span>
          </button>
        )}
        {tab('/app/clubs', '동아리 찾기')}
        {tab('/app/my', '마이페이지')}
      </nav>
    </>
  )
}
