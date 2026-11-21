import { useSyncExternalStore } from 'react'
import { joinRequests, type JoinRequest } from '../../mocks/bandyLight.ts'

/**
 * 들어온 신청함 — 우리 동아리로 들어온 참여 신청.
 *
 * `clubJoin.ts` 는 **내가 보낸** 신청이고 이쪽은 **받는 쪽**입니다. 지금까지
 * 받는 화면이 없어서, 신청을 보낸 사람은 영영 승인되지 않았습니다.
 *
 * 거절도 반드시 알립니다. 조용히 사라지면 보낸 사람은 고장 난 줄 알고 다시
 * 보냅니다 — 그래서 까닭 없이는 거절되지 않게 두었습니다.
 *
 * MOCK: 기기에만 저장합니다. 실제로는 신청 문서의 상태를 바꾸고 신청자에게
 * 알림을 보냅니다.
 */

const KEY = 'bandy.lightui.joinInbox'
const listeners = new Set<() => void>()

function read(): JoinRequest[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as JoinRequest[]
  } catch {
    /* 사생활 보호 모드 등 */
  }
  return joinRequests
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

function set(id: string, patch: Partial<JoinRequest>) {
  current = current.map((r) => (r.id === id ? { ...r, ...patch } : r))
  publish()
}

export function useJoinInbox() {
  const all = useSyncExternalStore(subscribe, get, get)
  return {
    all,
    pending: all.filter((r) => r.state === 'pending'),
    done: all.filter((r) => r.state !== 'pending'),
    accept(id: string) {
      set(id, { state: 'approved' })
    },
    /** 까닭 없이는 거절되지 않습니다 */
    reject(id: string, why: string) {
      if (!why.trim()) return false
      set(id, { state: 'rejected', why: why.trim() })
      return true
    },
  }
}
