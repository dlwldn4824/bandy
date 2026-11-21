import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import Icon from '../components/Icon.tsx'
import { P } from '../paths.ts'
import { mapShows, type MapShow } from '../../mocks/bandyLight.ts'
import {
  WEEKDAY_LABELS,
  dayLabel,
  daysInMonth,
  firstWeekday,
  monthLabel,
  parseAt,
  sameMonth,
  shiftMonth,
  timeLabel,
  today,
  ymOf,
  type YearMonth,
} from '../calendar.ts'
import './S23Calendar.css'

/**
 * 공연 일정 (월 단위) — Figma 프레임 없음.
 *
 * 홈에는 「이번 주 열리는 행사」밖에 없어서 이번 달·다음 달을 훑을 곳이 없다는
 * 사용자 피드백으로 만든 화면입니다. 날짜 계산은 `calendar.ts` 에 모아 두었습니다.
 */
const S23Calendar = () => {
  const navigate = useNavigate()
  const now = today()

  // 처음 열면 오늘이 든 달. 그 달에 공연이 없으면 가장 가까운 다음 공연이 있는 달.
  const [month, setMonth] = useState<YearMonth>(() => {
    const here = { y: now.y, m: now.m }
    if (mapShows.some((s) => sameMonth(ymOf(s.at), here))) return here
    const next = [...mapShows].sort((a, b) => a.at.localeCompare(b.at)).find((s) => {
      const { y, m } = ymOf(s.at)
      return y * 12 + m >= here.y * 12 + here.m
    })
    return next ? ymOf(next.at) : here
  })
  const [picked, setPicked] = useState<number | null>(null)

  /** 이 달의 공연을 날짜별로 */
  const byDay = useMemo(() => {
    const map = new Map<number, MapShow[]>()
    for (const show of mapShows) {
      const { y, m, d } = parseAt(show.at)
      if (y !== month.y || m !== month.m) continue
      const list = map.get(d) ?? []
      list.push(show)
      map.set(d, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.at.localeCompare(b.at))
    return map
  }, [month])

  const monthShows = useMemo(
    () =>
      mapShows
        .filter((s) => sameMonth(ymOf(s.at), month))
        .sort((a, b) => a.at.localeCompare(b.at)),
    [month],
  )

  const shown = picked === null ? monthShows : (byDay.get(picked) ?? [])
  const isThisMonth = month.y === now.y && month.m === now.m

  const go = (by: number) => {
    setMonth((m) => shiftMonth(m, by))
    setPicked(null)
  }

  // 1일 앞의 빈 칸 + 날짜 칸
  const blanks = firstWeekday(month)
  const total = daysInMonth(month)

  return (
    <Phone>
      <TopBar
        title="공연 일정"
        back={P.home}
        right={
          isThisMonth ? (
            <span className="lui-topbar__side" />
          ) : (
            <button
              type="button"
              className="cal__today"
              onClick={() => {
                setMonth({ y: now.y, m: now.m })
                setPicked(null)
              }}
            >
              오늘
            </button>
          )
        }
      />
      <div className="lui-body">
        <div className="cal">
          <div className="cal__gap-14" />

          <div className="cal__nav">
            <button type="button" className="cal__arrow" aria-label="이전 달" onClick={() => go(-1)}>
              <Icon name="chevron-left" size={16} />
            </button>
            <span className="cal__month">{monthLabel(month)}</span>
            <button type="button" className="cal__arrow" aria-label="다음 달" onClick={() => go(1)}>
              <Icon name="chevron-right" size={16} />
            </button>
            <span className="cal__count">
              {monthShows.length > 0 ? `공연 ${monthShows.length}개` : '공연 없음'}
            </span>
          </div>

          <div className="lui-card cal__grid">
            <div className="cal__week">
              {WEEKDAY_LABELS.map((w) => (
                <span key={w} className="cal__wd">
                  {w}
                </span>
              ))}
            </div>

            <div className="cal__days">
              {Array.from({ length: blanks }, (_, i) => (
                <span key={`b${i}`} className="cal__day cal__day--blank" />
              ))}
              {Array.from({ length: total }, (_, i) => {
                const d = i + 1
                const count = byDay.get(d)?.length ?? 0
                const isToday = isThisMonth && d === now.d
                const on = picked === d
                return (
                  <button
                    key={d}
                    type="button"
                    className={[
                      'cal__day',
                      count > 0 ? 'cal__day--has' : '',
                      isToday ? 'cal__day--today' : '',
                      on ? 'cal__day--on' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={on}
                    aria-label={`${dayLabel(month.y, month.m, d)} 공연 ${count}개`}
                    disabled={count === 0}
                    onClick={() => setPicked(on ? null : d)}
                  >
                    <span className="cal__dnum">{d}</span>
                    {/* 공연이 있는 날에만 점. 여러 개면 두 개까지 (규칙 7 — 빨강은 데이터) */}
                    {count > 0 && (
                      <span className="cal__dots">
                        {Array.from({ length: Math.min(count, 2) }, (_, k) => (
                          <span key={k} className="cal__dot" />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="cal__gap-26" />
          <SectionHeader
            title={picked === null ? `${month.m}월 공연` : dayLabel(month.y, month.m, picked)}
            aside={picked === null ? undefined : '이 달 전체'}
            onAside={picked === null ? undefined : () => setPicked(null)}
          />

          <div className="cal__gap-12" />
          {shown.length === 0 ? (
            <p className="lui-note cal__empty">
              {monthShows.length === 0
                ? '이 달에는 아직 올라온 공연이 없어요. 다른 달을 넘겨 보세요.'
                : '이 날에는 공연이 없어요.'}
            </p>
          ) : (
            <div className="cal__list">
              {shown.map((show) => {
                const { m, d } = parseAt(show.at)
                return (
                  <button
                    key={show.id}
                    type="button"
                    className="lui-card cal-row"
                    onClick={() => navigate(P.show(show.id))}
                  >
                    <span className="cal-row__when">
                      <span className="cal-row__date">
                        {m}.{d}
                      </span>
                      <span className="cal-row__time">{timeLabel(show.at)}</span>
                    </span>
                    <span className="cal-row__poster">
                      {show.poster && <img src={show.poster} alt="" />}
                    </span>
                    <span className="cal-row__main">
                      <span className="cal-row__title">{show.title}</span>
                      <span className="cal-row__sub">
                        {show.venue} · {show.region}
                      </span>
                    </span>
                    {show.free && <span className="lui-pill lui-pill--soft">무료</span>}
                    <Icon name="chevron-right" size={18} className="cal-row__chev" />
                  </button>
                )
              })}
            </div>
          )}

          <div className="cal__gap-26" />
        </div>
      </div>
      <TabBar active="home" />
    </Phone>
  )
}

export default S23Calendar
