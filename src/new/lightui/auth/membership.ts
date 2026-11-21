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
 *
 * 가입을 한 번도 안 한 기기에서만 데모용으로 멜로딕 운영진을 보여 줍니다.
 * 가입을 거친 사람은 **실제로 든 동아리만** 따릅니다 — 관객으로 가입했는데
 * 「우리 동아리」 가 보이면 가입 때 고른 것이 무시된 셈이니까요.
 */

export type ClubRole = 'manager' | 'member'

/**
 * 어떤 소속인가.
 *
 * 권한이 「동아리 운영진」 하나뿐이어서 생긴 문제가 둘 있습니다. 공연장은
 * 동아리가 아니라 자기 지원 팀 수락과 정산을 못 하고, 반대로 `/ui/venue` 에는
 * 게이트가 없어 **관객이 남의 공연장 운영 화면을 엽니다.** 종류를 나눠 둬야
 * 게이트를 「무엇이 필요한가」 로 물을 수 있습니다.
 */
export type MemberKind = 'club' | 'venue'

export interface Membership {
  /** 없으면 'club' 으로 읽습니다 — 이 칸이 생기기 전에 저장된 기기가 있습니다 */
  kind: MemberKind
  clubId: string
  clubName: string
  role: ClubRole
  /** 참여 코드 — 운영진이 부원에게 알려 주는 값 */
  code: string
}

/** MOCK: 처음 들어온 사람에게 보여 줄 소속 */
export const DEMO_MEMBERSHIP: Membership = {
  kind: 'club',
  clubId: 'melodic',
  clubName: '멜로딕',
  role: 'manager',
  code: 'MELODIC26',
}

const KEY = 'bandy.lightui.membership'
const listeners = new Set<() => void>()

/** 가입을 거친 기기인지 — 로그인 세션이 있으면 거친 것입니다 */
const SESSION_KEY = 'bandy.lightui.user'

function read(): Membership | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === 'none') return null
    if (raw) return JSON.parse(raw) as Membership
    // 가입은 했는데 동아리에 든 적이 없다 = 관객. 데모를 끼워 넣지 않습니다.
    if (localStorage.getItem(SESSION_KEY)) return null
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
