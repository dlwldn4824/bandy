import { useSyncExternalStore } from 'react'

/**
 * 내가 어느 동아리에 속해 있는지.
 *
 * 예전에는 「운영진이냐 부원이냐」 만 들고 있었는데, 그건 소속에서 나오는 값이지
 * 따로 고르는 값이 아닙니다. 지금은 소속을 들고 있고 권한은 거기서 읽습니다.
 *
 *   동아리를 만든 사람  → 운영진
 *   참여 코드로 들어온 사람 → 부원
 *   아무 데도 안 든 사람  → 관객 (운영 화면이 아예 안 보입니다)
 *
 * MOCK: 기기에만 저장합니다. 실제로는 동아리 멤버 문서를 읽게 됩니다.
 * 첫 실행은 데모가 비어 보이지 않게 멜로딕 운영진으로 시작합니다 —
 * 마이에서 나가거나 바꿀 수 있습니다.
 */

export type ClubRole = 'manager' | 'member'

export interface Membership {
  clubId: string
  clubName: string
  role: ClubRole
  /** 참여 코드 — 운영진이 부원에게 알려 주는 값 */
  code: string
}

/** MOCK: 처음 들어온 사람에게 보여 줄 소속 */
export const DEMO_MEMBERSHIP: Membership = {
  clubId: 'melodic',
  clubName: '멜로딕',
  role: 'manager',
  code: 'MELODIC26',
}

const KEY = 'bandy.lightui.membership'
const listeners = new Set<() => void>()

function read(): Membership | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === 'none') return null
    if (raw) return JSON.parse(raw) as Membership
  } catch {
    /* 사생활 보호 모드 등 */
  }
  return DEMO_MEMBERSHIP
}

let current: Membership | null = read()

export function getMembership() {
  return current
}

export function setMembership(next: Membership | null) {
  current = next
  try {
    localStorage.setItem(KEY, next ? JSON.stringify(next) : 'none')
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

export function useMembership() {
  const m = useSyncExternalStore(subscribe, getMembership, getMembership)
  return {
    membership: m,
    /** 동아리에 들어 있는가 — 아니면 관객입니다 */
    inClub: m !== null,
    isManager: m?.role === 'manager',
    setMembership,
  }
}

/** 참여 코드 만들기 — 보고 불러 주기 쉬운 글자만 씁니다 (0/O, 1/I 제외) */
export function makeJoinCode(seed: string) {
  const letters = seed.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) || 'BAND'
  const chars = '23456789ACDEFGHJKLMNPQRSTUVWXYZ'
  let tail = ''
  for (let i = 0; i < 4; i++) tail += chars[Math.floor(Math.random() * chars.length)]
  return `${letters}${tail}`
}
