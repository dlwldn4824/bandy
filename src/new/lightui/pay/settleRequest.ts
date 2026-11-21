import { useSyncExternalStore } from 'react'
import { useMembership } from '../auth/membership.ts'
import { DEMO_CLUB_ID } from '../clubs/owner.ts'

/**
 * 정산 요청.
 *
 * 전에는 「정산 요청」 을 누르면 마이로 가고 끝이었습니다. 요청됐다는 말도,
 * 언제 들어온다는 말도 없었습니다. **돈을 달라고 한 자리에서 아무 말이
 * 없으면 눌렀는지도 모릅니다.** 다시 들어와서 또 누르게 됩니다.
 *
 * 그래서 요청한 때를 적어 둡니다. 화면 상태로만 들고 있으면 나갔다 오는
 * 순간 사라져서, 같은 돈을 두 번 요청하게 됩니다 — 입장 처리에서 겪은
 * 것과 같은 모양입니다.
 *
 * MOCK: 기기에만 저장합니다. 실제로는 정산 요청 문서가 생기고 밴디가 봅니다.
 */

const KEY = 'bandy.lightui.settleRequests'
const listeners = new Set<() => void>()

/** 동아리별 — 요청한 시각(ISO) */
type Requests = Record<string, string>

function readAll(): Requests {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Requests
  } catch {
    /* 사생활 보호 모드 등 */
  }
  return {}
}

let current = readAll()
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

export function useSettleRequest() {
  const all = useSyncExternalStore(subscribe, get, get)
  const { membership } = useMembership()
  const clubId = membership?.clubId ?? DEMO_CLUB_ID
  const at = all[clubId] ?? null

  return {
    /** 요청한 시각 — 없으면 null */
    at,
    requested: at !== null,
    request() {
      current = { ...current, [clubId]: new Date().toISOString() }
      publish()
    },
    /** 밴디가 보냈거나 취소되면 — 지금은 쓰는 곳이 없습니다 */
    clear() {
      const rest = { ...current }
      delete rest[clubId]
      current = rest
      publish()
    },
  }
}

/** 「11월 22일 04:12」 */
export function whenText(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`
}
