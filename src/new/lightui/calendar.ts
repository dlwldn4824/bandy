/**
 * 달력 계산.
 *
 * `new Date('2026-11-22')` 는 UTC 자정으로 읽혀서 한국에서는 하루 밀립니다.
 * 그래서 문자열을 직접 잘라 씁니다 — 시간대를 타지 않습니다.
 */

export interface YearMonth {
  y: number
  m: number // 1~12
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

export const WEEKDAY_LABELS = WEEKDAYS

/** '2026-11-22T19:00' → { y, m, d, hh, mm } */
export function parseAt(at: string) {
  const [date, time = ''] = at.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return { y, m, d, hh: hh || 0, mm: mm || 0 }
}

export function ymOf(at: string): YearMonth {
  const { y, m } = parseAt(at)
  return { y, m }
}

export function sameMonth(a: YearMonth, b: YearMonth) {
  return a.y === b.y && a.m === b.m
}

export function shiftMonth({ y, m }: YearMonth, by: number): YearMonth {
  const n = y * 12 + (m - 1) + by
  return { y: Math.floor(n / 12), m: (n % 12) + 1 }
}

export function daysInMonth({ y, m }: YearMonth) {
  return new Date(y, m, 0).getDate()
}

/** 그 달 1일의 요일 (0 = 일요일) */
export function firstWeekday({ y, m }: YearMonth) {
  return new Date(y, m - 1, 1).getDay()
}

export function weekdayOf(y: number, m: number, d: number) {
  return new Date(y, m - 1, d).getDay()
}

/** 오늘 (기기 시각 기준) */
export function today(): { y: number; m: number; d: number } {
  const t = new Date()
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() }
}

export function monthLabel({ y, m }: YearMonth) {
  return `${y}년 ${m}월`
}

/** '11월 22일 (토)' */
export function dayLabel(y: number, m: number, d: number) {
  return `${m}월 ${d}일 (${WEEKDAYS[weekdayOf(y, m, d)]})`
}

/** '19:00' */
export function timeLabel(at: string) {
  const { hh, mm } = parseAt(at)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
