import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useBandy } from '../store'
import { bookingCount, feedEvents, managerClubIds } from '../repo'
import { APP_NAME, Empty, EventItem, MapBox, NeedLogin, PageHeader, Thumb, within } from '../components'
import { dayKey, distanceKm, shortDate } from '../format'
import { EventCategory, EventRow } from '../types'

const CATEGORIES: Array<EventCategory | '전체'> = ['전체', '공연', '해커톤', '학술회', '네트워킹']

function useFeed() {
  const { db, me } = useBandy()
  return useMemo(() => feedEvents(db, me?.id ?? null), [db, me])
}

function SearchForm({ initial = '', onSearch }: { initial?: string; onSearch: (q: string) => void }) {
  const [q, setQ] = useState(initial)
  return (
    <form className="b-row" role="search" onSubmit={(e) => { e.preventDefault(); onSearch(q.trim()) }} style={{ flexWrap: 'nowrap' }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="공연, 동아리, 장소 검색" aria-label="검색어" />
      <button type="submit" className="b-btn small" style={{ height: 44 }}>검색</button>
    </form>
  )
}

// 구조도 ② 홈: 검색창 · 알림 버튼 · 공연 홍보 · 실시간 공연 소식(→ 전체 보기)
export function HomePage() {
  const { db, me } = useBandy()
  const navigate = useNavigate()
  const feed = useFeed()
  const [slide, setSlide] = useState(0)
  const unread = me ? db.notifications.filter((n) => n.user_id === me.id && !n.read_at).length : 0
  const clubId = managerClubIds(db, me?.id ?? null)[0]
  const club = clubId ? db.clubs.find((c) => c.id === clubId) : undefined
  const promos = feed.slice(0, 3) // [미정] 홍보 선정 기준. 지금은 피드 상위 3개

  return (
    <div className="b-page">
      <header className="b-top">
        <span className="b-row">
          <span className="b-logo">{APP_NAME}</span>
          {club && <Link to={`/app/manage/${club.id}`} className="b-club-badge">{club.name}</Link>}
        </span>
        <Link to="/app/notifications" className="b-text-btn">알림{unread > 0 && <span className="b-count">{unread}</span>}</Link>
      </header>
      <SearchForm onSearch={(q) => navigate(`/app/events?q=${encodeURIComponent(q)}`)} />

      {promos.length > 0 && (
        <section className="b-stack">
          <div className="b-promo" onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
            {promos.map((e) => (
              <Link key={e.id} to={`/app/e/${e.id}`} className="b-promo-item">
                {e.poster_path && <Thumb src={e.poster_path} className="wide" />}
                <span className="b-promo-meta">
                  <span className="b-stack tight">
                    <strong>{e.title}</strong>
                    <span className="b-sub">{db.clubs.find((c) => c.id === e.club_id)?.name} · {shortDate(e.starts_at)}</span>
                  </span>
                  <span className="b-sub">{Math.min(slide + 1, promos.length)} / {promos.length}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="b-row between">
        <h2 className="b-h2">실시간 공연 소식</h2>
        <Link to="/app/events" className="b-link">전체 보기</Link>
      </div>
      <div>
        {feed.slice(0, 5).map((e) => <EventItem key={e.id} event={e} />)}
        {feed.length === 0 && <Empty>아직 올라온 공연이 없어요.</Empty>}
      </div>
    </div>
  )
}

type Sort = 'date' | 'new' | 'popular' | 'near'
const SORT_LABEL: Record<Sort, string> = { date: '공연일 빠른 순', new: '최신 등록순', popular: '예매 많은 순', near: '가까운 순' }

// 구조도: 공연 검색 결과(query) · 전체 공연 목록(정렬 · 선택 → 공연 상세)
export function EventsPage() {
  const { db } = useBandy()
  const [params, setParams] = useSearchParams()
  const feed = useFeed()
  const q = params.get('q') ?? ''
  const [category, setCategory] = useState<EventCategory | '전체'>('전체')
  const [sort, setSort] = useState<Sort>('date') // [미정] 노출 순서 규칙
  const matches = (e: EventRow) => {
    if (!q) return true
    const club = db.clubs.find((c) => c.id === e.club_id)
    return `${e.title} ${e.venue_name ?? ''} ${e.address ?? ''} ${club?.name ?? ''}`.includes(q)
  }
  const list = feed.filter((e) => (category === '전체' || e.category === category) && matches(e))
  const sorted = [...list].sort((a, b) => {
    if (sort === 'new') return (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at)
    if (sort === 'popular') return bookingCount(db, b.id) - bookingCount(db, a.id)
    if (sort === 'near') return (distanceKm(a.latitude, a.longitude) ?? 99) - (distanceKm(b.latitude, b.longitude) ?? 99)
    return a.starts_at.localeCompare(b.starts_at)
  })

  return (
    <div className="b-page">
      <PageHeader back title={q ? `'${q}' 검색 결과` : '전체 공연'} />
      <SearchForm initial={q} onSearch={(v) => setParams(v ? { q: v } : {})} />
      <div className="b-chips">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className={`b-chip${category === c ? ' active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>
      <div className="b-row between">
        <span className="b-sub">{sorted.length}개</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬" style={{ width: 'auto', height: 34, fontSize: 13 }}>
          {(Object.keys(SORT_LABEL) as Sort[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
        </select>
      </div>
      <div>
        {sorted.map((e) => <EventItem key={e.id} event={e} extra={sort === 'popular' ? `예매 ${bookingCount(db, e.id)}건` : sort === 'near' ? `${distanceKm(e.latitude, e.longitude)}km` : undefined} />)}
        {sorted.length === 0 && <Empty>조건에 맞는 공연이 없어요.</Empty>}
      </div>
    </div>
  )
}

// 구조도: 지도 / 캘린더 (상단 탭). 지도 = lat · lng · radius, 캘린더 = 날짜 선택 → 공연 목록
export function MapPage() {
  const feed = useFeed()
  const [view, setView] = useState<'map' | 'calendar'>('map')
  const [radius, setRadius] = useState(3)
  const near = feed.filter((e) => within(e, radius))
    .sort((a, b) => (distanceKm(a.latitude, a.longitude) ?? 99) - (distanceKm(b.latitude, b.longitude) ?? 99))
  return (
    <div className="b-page">
      <PageHeader title="지도·캘린더" />
      <div className="b-seg">
        <button type="button" className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>지도</button>
        <button type="button" className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>캘린더</button>
      </div>
      {view === 'map' ? (
        <>
          <div className="b-row between">
            <span className="b-label">내 위치에서</span>
            <div className="b-chips">
              {[1, 3, 5].map((r) => <button key={r} type="button" className={`b-chip${radius === r ? ' active' : ''}`} onClick={() => setRadius(r)}>{r}km</button>)}
            </div>
          </div>
          <MapBox events={near} radiusKm={radius} />
          <div>
            {near.map((e) => <EventItem key={e.id} event={e} extra={`${distanceKm(e.latitude, e.longitude)}km`} />)}
            {near.length === 0 && <Empty>{radius}km 안에 공연이 없어요.</Empty>}
          </div>
        </>
      ) : <CalendarView events={feed} />}
    </div>
  )
}

function CalendarView({ events }: { events: EventRow[] }) {
  const today = dayKey(new Date())
  const first = events[0] ? dayKey(events[0].starts_at) : today
  const [month, setMonth] = useState(first.slice(0, 7))
  const [selected, setSelected] = useState(first)
  const [y, m] = month.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const counts = new Map<string, number>()
  for (const e of events) counts.set(dayKey(e.starts_at), (counts.get(dayKey(e.starts_at)) ?? 0) + 1)
  const move = (delta: number) => setMonth(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7))
  const list = events.filter((e) => dayKey(e.starts_at) === selected)

  return (
    <>
      <section className="b-card b-pad">
        <div className="b-row between">
          <button type="button" className="b-text-btn" onClick={() => move(-1)} aria-label="이전 달">‹</button>
          <strong>{y}년 {m}월</strong>
          <button type="button" className="b-text-btn" onClick={() => move(1)} aria-label="다음 달">›</button>
        </div>
        <div className="b-cal-grid">
          {['일', '월', '화', '수', '목', '금', '토'].map((d) => <span key={d} className="b-cal-head">{d}</span>)}
          {Array.from({ length: lead }).map((_, i) => <span key={`l${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const key = `${month}-${String(i + 1).padStart(2, '0')}`
            const n = counts.get(key) ?? 0
            return (
              <button key={key} type="button" className={`b-cal-day${key === selected ? ' on' : ''}${key === today ? ' today' : ''}`}
                onClick={() => setSelected(key)} aria-label={`${m}월 ${i + 1}일${n ? `, 공연 ${n}개` : ''}`}>
                {i + 1}{n > 0 && <i />}
              </button>
            )
          })}
        </div>
      </section>
      <h2 className="b-h2">{Number(selected.slice(5, 7))}월 {Number(selected.slice(8))}일</h2>
      <div>
        {list.map((e) => <EventItem key={e.id} event={e} />)}
        {list.length === 0 && <Empty>이 날짜에는 공연이 없어요.</Empty>}
      </div>
    </>
  )
}

// 구조도: 알림 목록 (userId)
export function NotificationsPage() {
  const { db, me, call } = useBandy()
  if (!me) return <div className="b-page"><PageHeader back title="알림" /><NeedLogin what="알림" /></div>
  const notes = db.notifications.filter((n) => n.user_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const unread = notes.filter((n) => !n.read_at).length
  return (
    <div className="b-page">
      <PageHeader back title="알림" right={unread > 0 && <button type="button" className="b-link" onClick={() => call((b) => b.markNotificationsRead())}>모두 읽음</button>} />
      {notes.map((n) => {
        const to = n.event_id ? `/app/e/${n.event_id}` : n.type.startsWith('EXCHANGE') ? '/app/clubs?tab=inbox' : '/app/my'
        return (
          <Link key={n.id} to={to} className={`b-card b-pad b-notice${n.read_at ? '' : ' unread'}`} onClick={() => call((b) => b.markNotificationsRead(n.id))}>
            <p>{n.message}</p>
            <p className="b-sub">{shortDate(n.created_at)}</p>
          </Link>
        )
      })}
      {notes.length === 0 && <Empty>알림이 없어요.</Empty>}
    </div>
  )
}
