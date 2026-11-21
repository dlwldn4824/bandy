import { useCallback, useSyncExternalStore } from 'react'

/**
 * 사용자가 한 일을 기기에 남깁니다.
 *
 * 화면 상태(`useState`)로만 들고 있던 결정이 여럿이었습니다. 알림을 「모두
 * 읽음으로」 해도 다시 들어오면 안 읽음 점이 돌아왔고, 공연장이 거절한 팀이
 * 다시 지원 목록에 섰습니다. **한 일이 남지 않으면 안 한 것과 같습니다** —
 * 그리고 사용자는 자기가 안 했다고 생각하는 게 아니라, 앱이 안 먹었다고
 * 생각하고 한 번 더 누릅니다. 입장 처리에서 겪은 그 문제입니다.
 *
 * 같은 모양을 화면마다 다시 쓰지 않으려고 한 자리에 뒀습니다.
 *
 * MOCK: 기기에만 남습니다. 실제로는 계정이나 문서에 붙습니다.
 */

const PREFIX = 'bandy.lightui.r.'
const listeners = new Set<() => void>()
/** 읽은 값을 들고 있습니다 — useSyncExternalStore 는 같은 참조를 돌려줘야 합니다 */
const cache = new Map<string, unknown>()

function readKey<T>(key: string, initial: T): T {
  if (cache.has(key)) return cache.get(key) as T
  let v = initial
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw !== null) v = JSON.parse(raw) as T
  } catch {
    /* 사생활 보호 모드 등 — 기본값으로 갑니다 */
  }
  cache.set(key, v)
  return v
}

function writeKey<T>(key: string, value: T) {
  cache.set(key, value)
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
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

/** `useState` 처럼 쓰되, 다시 들어와도 그대로입니다 */
export function useRemembered<T>(key: string, initial: T): [T, (next: T) => void] {
  const get = useCallback(() => readKey(key, initial), [key, initial])
  const value = useSyncExternalStore(subscribe, get, get)
  const set = useCallback((next: T) => writeKey(key, next), [key])
  return [value, set]
}
