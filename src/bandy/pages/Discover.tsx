import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useBandy } from '../store'
import { feedEvents, hasExchangeWith, managerClubIds } from '../repo'
import { APP_NAME, Empty, EventCard, FakeMap, Icon, LiveRow, PageHeader, Poster } from '../components'
import { dayKey, distanceKm, shortDate } from '../format'
import { EventCategory, EventRow } from '../types'

const CATEGORIES: Array<EventCategory | '전체'> = ['전체', '공연', '해커톤', '학술회', '네트워킹']

function useFeed() {
  const { db, me } = useBandy()
  return useMemo(() => feedEvents(db, me?.id ?? null), [db, me])
}

function matches(db: ReturnType<typeof useBandy>['db'], e: EventRow, q: string) {
  if (!q) return true
  const club = db.clubs.find((c) => c.id === e.club_id)
  return `${e.title} ${e.venue_name ?? ''} ${club?.name ?? ''}`.includes(q)
}

function SearchBox({ value, onChange, onSubmit, placeholder }: {
  value: string; onChange: (v: string) => void; onSubmit?: () => void; placeholder: string
}) {
  return (
    <form className="b-search" onSubmit={(e) => { e.preventDefault(); onSubmit?.() }} role="search">
      <Icon name="search" size={[15, 15]} className="muted" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="검색" />
    </form>
  )
}

// 와이어프레임 「02/03 홈」: 로고·(동아리명)·알림 / 검색 / 홍보 배너 / 실시간 공연 소식
export function HomePage() {
  const { db, me } = useBandy()
  const navigate = useNavigate()
  const feed = useFeed()
  const [q, setQ] = useState('')
  const [slide, setSlide] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const unread = me ? db.notifications.filter((n) => n.user_id === me.id && !n.read_at).length : 0
  const clubId = managerClubIds(db, me?.id ?? null)[0]
  const club = clubId ? db.clubs.find((c) => c.id === clubId) : undefined
  const promo = feed.filter((e) => e.poster_path).slice(0, 3)
  const promos = promo.length ? promo : feed.slice(0, 3)

  return (
    <div className="b-page">
      <header className="b-top">
        <span className="b-row">
          <span className="b-logo">{APP_NAME}</span>
          {club && <Link to={`/app/manage/${club.id}`} className="b-club-badge">{club.name}</Link>}
        </span>
        <Link to="/app/my#notices" className="b-icon-btn b-bell" aria-label={`알림 ${unread}개`}>
          <Icon name="tab-bell" size={18} />
          {unread > 0 && <i />}
        </Link>
      </header>
      <SearchBox value={q} onChange={setQ} placeholder="공연, 동아리, 장소 검색" onSubmit={() => navigate(`/app/events?q=${encodeURIComponent(q.trim())}`)} />

      {promos.length > 0 && (
        <div className="b-promo">
          <div
            className="b-promo-track"
            ref={track}
            onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          >
            {promos.map((e) => {
              const c = db.clubs.find((x) => x.id === e.club_id)
              return (
                <Link key={e.id} to={`/app/e/${e.id}`} className="b-promo-slide">
                  <Poster event={e} />
                  <span className="b-promo-text">
                    <strong>{e.title}</strong>
                    <span>{c?.name} · {shortDate(e.starts_at)}</span>
                  </span>
                </Link>
              )
            })}
          </div>
          <span className="b-promo-count">{Math.min(slide + 1, promos.length)} / {promos.length}</span>
        </div>
      )}

      <div className="b-row between">
        <h2 className="b-h2">실시간 공연 소식</h2>
        <Link to="/app/events" className="b-sub">전체 보기</Link>
      </div>
      <div className="b-live-list">
        {feed.slice(0, 5).map((e) => <LiveRow key={e.id} event={e} />)}
        {feed.length === 0 && <Empty>아직 올라온 공연이 없어요.</Empty>}
      </div>
    </div>
  )
}

// 피그마 「공연 찾기」: 검색 + 분류 칩 + 카드 + 공연 올리기
export function EventsPage() {
  const { db, me } = useBandy()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const feed = useFeed()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [category, setCategory] = useState<EventCategory | '전체'>('전체')
  const list = feed.filter((e) => (category === '전체' || e.category === category) && matches(db, e, q.trim()))
  const clubId = managerClubIds(db, me?.id ?? null)[0]

  return (
    <div className="b-page with-dock">
      <PageHeader title="공연 찾기" right={!me && <Link to="/app/login" className="b-ghost-chip">로그인</Link>} />
      <SearchBox value={q} onChange={setQ} placeholder="공연명, 동아리, 장소 검색" />
      <div className="b-chips">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className={`b-chip${category === c ? ' active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>
      <div className="b-list">
        {list.map((e) => <EventCard key={e.id} event={e} connected={hasExchangeWith(db, me?.id ?? null, e.club_id)} />)}
        {list.length === 0 && <Empty>조건에 맞는 공연이 없어요.</Empty>}
      </div>
      <div className="b-dock above-tabs">
        <button
          type="button"
          className="b-btn"
          onClick={() => navigate(clubId ? `/app/manage/${clubId}?tab=new` : me ? '/app/clubs/new' : '/app/login')}
        >
          <Icon name="plus" size={12} />공연 올리기
        </button>
      </div>
    </div>
  )
}

// 와이어프레임 「지도 / 캘린더」: 상단 탭 [지도][캘린더]
export function MapPage() {
  const { db, me } = useBandy()
  const feed = useFeed()
  const [view, setView] = useState<'map' | 'calendar'>('map')
  const byDistance = [...feed].sort((a, b) => (distanceKm(a.latitude, a.longitude) ?? 99) - (distanceKm(b.latitude, b.longitude) ?? 99))
  return (
    <div className="b-page">
      <PageHeader title="지도·캘린더" />
      <div className="b-seg">
        <button type="button" className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>지도</button>
        <button type="button" className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>캘린더</button>
      </div>
      {view === 'map' ? (
        <>
          <FakeMap events={feed} tall />
          <p className="b-note">카카오 지도 연결 전 임시 지도입니다. 핀 위치는 공연 좌표 기준이고, 가까운 순으로 보여 줘요.</p>
          <div className="b-live-list">{byDistance.map((e) => <LiveRow key={e.id} event={e} />)}</div>
        </>
      ) : <CalendarView events={feed} connected={(id) => hasExchangeWith(db, me?.id ?? null, id)} />}
    </div>
  )
}

function CalendarView({ events, connected }: { events: EventRow[]; connected: (clubId: string) => boolean }) {
  const today = dayKey(new Date())
  const firstEvent = events[0] ? dayKey(events[0].starts_at) : today
  const [month, setMonth] = useState(firstEvent.slice(0, 7)) // YYYY-MM
  const [selected, setSelected] = useState(firstEvent)
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = first.getUTCDay()
  const counts = new Map<string, number>()
  for (const e of events) counts.set(dayKey(e.starts_at), (counts.get(dayKey(e.starts_at)) ?? 0) + 1)
  const move = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    setMonth(d.toISOString().slice(0, 7))
  }
  const list = events.filter((e) => dayKey(e.starts_at) === selected)

  return (
    <>
      <section className="b-card b-pad b-cal">
        <div className="b-row between">
          <button type="button" className="b-icon-btn" onClick={() => move(-1)} aria-label="이전 달"><Icon name="back" size={14} /></button>
          <strong>{y}년 {m}월</strong>
          <button type="button" className="b-icon-btn flip" onClick={() => move(1)} aria-label="다음 달"><Icon name="back" size={14} /></button>
        </div>
        <div className="b-cal-grid">
          {['일', '월', '화', '수', '목', '금', '토'].map((d) => <span key={d} className="b-cal-head">{d}</span>)}
          {Array.from({ length: lead }).map((_, i) => <span key={`l${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const key = `${month}-${String(i + 1).padStart(2, '0')}`
            const n = counts.get(key) ?? 0
            return (
              <button
                key={key}
                type="button"
                className={`b-cal-day${key === selected ? ' on' : ''}${key === today ? ' today' : ''}`}
                onClick={() => setSelected(key)}
                aria-label={`${m}월 ${i + 1}일${n ? `, 공연 ${n}개` : ''}`}
              >
                {i + 1}
                {n > 0 && <i />}
              </button>
            )
          })}
        </div>
      </section>
      <h2 className="b-h2">{Number(selected.slice(5, 7))}월 {Number(selected.slice(8))}일 공연</h2>
      <div className="b-list">
        {list.map((e) => <EventCard key={e.id} event={e} connected={connected(e.club_id)} />)}
        {list.length === 0 && <Empty>이 날짜에는 공연이 없어요.</Empty>}
      </div>
    </>
  )
}
