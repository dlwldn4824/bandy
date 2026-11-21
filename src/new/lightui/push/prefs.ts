import { useSyncExternalStore } from 'react'

/**
 * 무엇을 받을지 — 알림 종류별 켜고 끔.
 *
 * 화면 상태(`useState`)로만 들고 있었습니다. 그래서 「주변 공연 소식」 을
 * 꺼도 **나갔다 오면 다시 켜져 있었습니다.** 끈 사람은 껐다고 알고
 * 있는데요.
 *
 * 설정은 눌린 자리에 남아야 합니다. 안 남으면 그 설정은 없는 것이고,
 * 없는 것을 있는 것처럼 보여 주는 셈입니다.
 *
 * MOCK: 기기에만 저장합니다. 실제로는 계정에 붙어서 기기를 바꿔도 따라옵니다.
 */

const KEY = 'bandy.lightui.pushPrefs'
const listeners = new Set<() => void>()

type Prefs = Record<string, boolean>

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Prefs
  } catch {
    /* 사생활 보호 모드 등 — 적어 둔 기본값으로 갑니다 */
  }
  return {}
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

/**
 * `defaults` 는 목에 적어 둔 기본값입니다. 한 번도 안 건드린 종류는
 * 그 값을 쓰고, 건드린 것만 기기에 남습니다.
 */
export function usePushPrefs(defaults: { id: string; on: boolean }[]) {
  const saved = useSyncExternalStore(subscribe, get, get)

  return {
    isOn: (id: string) => saved[id] ?? defaults.find((d) => d.id === id)?.on ?? false,
    set(id: string, on: boolean) {
      current = { ...current, [id]: on }
      publish()
    },
  }
}
