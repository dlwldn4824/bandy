import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBandy } from '../store'
import { feedEvents, hasExchangeWith } from '../repo'
import { APP_NAME, Empty, EventCard, FakeMap } from '../components'
import { distanceKm } from '../format'
import { EventCategory } from '../types'

const CATEGORIES: Array<EventCategory | '전체'> = ['전체', '공연', '해커톤', '학술회', '네트워킹']

function useFeed() {
  const { db, me } = useBandy()
  return useMemo(() => feedEvents(db, me?.id ?? null), [db, me])
}

export function HomePage() {
  const { db, me } = useBandy()
  const all = useFeed()
  const [category, setCategory] = useState<EventCategory | '전체'>('전체')
  const events = all.filter((e) => category === '전체' || e.category === category)
  const unread = me ? db.notifications.filter((n) => n.user_id === me.id && !n.read_at).length : 0

  return (
    <div className="b-page">
      <header className="b-top">
        <span className="b-logo">{APP_NAME}</span>
        <span className="b-row">
          <span className="b-sub">노원구 월계동</span>
          <Link to="/app/my" className="b-bell" aria-label={`알림 ${unread}개`}>알림{unread > 0 && <i>{unread}</i>}</Link>
        </span>
      </header>
      <h1 className="b-hero">근처에서 열리는<br />대학 행사 <em>{all.length}개</em></h1>
      <div className="b-chips">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className={`b-chip${category === c ? ' active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>
      <div className="b-map-wrap">
        <FakeMap events={events} />
        <Link to="/app/map" className="b-map-more">지도 크게 보기</Link>
      </div>
      <div className="b-list">
        {events.map((e) => <EventCard key={e.id} event={e} connected={hasExchangeWith(db, me?.id ?? null, e.club_id)} />)}
        {events.length === 0 && <Empty>이 분류의 행사가 아직 없어요.</Empty>}
      </div>
    </div>
  )
}

export function MapPage() {
  const { db, me } = useBandy()
  const all = useFeed()
  const sorted = [...all].sort((a, b) => (distanceKm(a.latitude, a.longitude) ?? 99) - (distanceKm(b.latitude, b.longitude) ?? 99))
  return (
    <div className="b-page">
      <header className="b-top"><span className="b-title">지도</span><span className="b-sub">가까운 순</span></header>
      <FakeMap events={all} tall />
      <p className="b-note">카카오 지도 연결 전 임시 지도입니다. 핀 위치는 공연 좌표 기준입니다.</p>
      <div className="b-list">
        {sorted.map((e) => <EventCard key={e.id} event={e} connected={hasExchangeWith(db, me?.id ?? null, e.club_id)} />)}
      </div>
    </div>
  )
}
