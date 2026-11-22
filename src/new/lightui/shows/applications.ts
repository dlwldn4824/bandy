import { useSyncExternalStore } from 'react'
import { getMembership } from '../auth/membership.ts'
import { DEMO_CLUB_ID } from '../clubs/owner.ts'

/**
 * 공연장 빈 날에 보낸 지원.
 *
 * 공연장 쪽(L3)에는 지원 목록이 이미 있는데 **보내는 쪽이 없었습니다.**
 * 거기 적힌 지원 팀은 전부 적어 둔 값이라, 동아리가 아무리 눌러도 늘지
 * 않습니다.
 *
 * 받는 쪽과 이으려면 서버가 있어야 합니다. 여기서는 **보낸 것을 기억**해서
 * 같은 날에 두 번 지원하지 않게 하고, 어디에 보냈는지 보여 줍니다.
 *
 * MOCK: 기기에만, 동아리별로 저장합니다 (clubs/owner.ts 와 같은 이유).
 */

export interface Application {
  /** OpenDay.id */
  dayId: string
  clubId: string
  /** 어느 공연으로 서는지 */
  showTitle: string
  at: string
}

const KEY = 'bandy.lightui.venueApplications'
const listeners = new Set<() => void>()

function read(): Application[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Application[]
  } catch {
    /* 사생활 보호 모드 등 */
  }
  return []
}

let current = read()
let snapshot = current

function publish() {
  snapshot = current
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* 저장이 막혀도 이번 세션 동안은 동작합니다 */
  }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const get = () => snapshot

export function useApplications() {
  const all = useSyncExternalStore(subscribe, get, get)
  const clubId = getMembership()?.clubId ?? DEMO_CLUB_ID
  const mine = all.filter((a) => a.clubId === clubId)
  return {
    mine,
    applied: (dayId: string) => mine.some((a) => a.dayId === dayId),
    apply(dayId: string, showTitle: string) {
      if (mine.some((a) => a.dayId === dayId)) return
      current = [...current, { dayId, clubId, showTitle, at: new Date().toISOString() }]
      publish()
    },
  }
}
