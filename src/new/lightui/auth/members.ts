import { useSyncExternalStore } from 'react'
import { clubMembers, me, type ClubMember } from '../../mocks/bandyLight.ts'
import { useIsDemoClub } from '../clubs/owner.ts'

/**
 * 부원과 권한.
 *
 * 운영진은 고르는 값이 아니라 **기존 운영진이 올려 주는** 값입니다. 첫 한 명은
 * 동아리를 만들 때 사람이 확인하고(`clubJoin.ts`), 그 뒤로는 그 사람이 넘깁니다.
 *
 * 올리고 내리는 데 규칙이 하나 있습니다 — **운영진은 0명이 될 수 없습니다.**
 * 대학 동아리는 집행부가 해마다 바뀌는데, 마지막 운영진이 졸업하면서 그냥
 * 나가 버리면 공연도 못 올리고 정산도 못 받는 동아리가 남습니다.
 *
 * MOCK: 기기에만 저장합니다. 실제로는 멤버 문서의 역할 필드를 고칩니다.
 */

const KEY = 'bandy.lightui.members'
const listeners = new Set<() => void>()

function read(): ClubMember[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as ClubMember[]
  } catch {
    /* 사생활 보호 모드 등 */
  }
  return clubMembers
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

/** 오늘 만든 동아리의 부원 목록 — 나 하나입니다 */
const alone: ClubMember[] = [
  { id: 'me', initial: me.initial, name: me.name, sub: '동아리를 만든 사람', role: 'manager', joined: '방금', me: true },
]

export function useMembers() {
  const stored = useSyncExternalStore(subscribe, get, get)
  /**
   * 적어 둔 다섯은 멜로딕 부원입니다. 다른 동아리로 들어온 사람에게
   * 남의 부원을 보여 주면 거기서 운영진을 올릴 수도 있게 됩니다.
   */
  const demo = useIsDemoClub()
  const members = demo || stored !== clubMembers ? stored : alone
  const managers = members.filter((m) => m.role === 'manager')

  return {
    members,
    managers,
    /** 운영진이 한 명뿐이면 그 사람이 사라질 때 동아리가 잠깁니다 */
    alone: managers.length === 1,

    promote(id: string) {
      current = current.map((m) => (m.id === id ? { ...m, role: 'manager' as const } : m))
      publish()
    },

    /** 마지막 운영진은 내릴 수 없습니다 */
    demote(id: string) {
      if (managers.length <= 1) return false
      current = current.map((m) => (m.id === id ? { ...m, role: 'member' as const } : m))
      publish()
      return true
    },

    /**
     * 받아 준 신청자를 부원 목록에 넣습니다 (S27 에서 부릅니다).
     * 역할은 언제나 부원입니다 — 운영진은 사람이 따로 올립니다.
     */
    add(m: { id: string; initial: string; name: string; sub: string }) {
      if (current.some((x) => x.id === m.id)) return
      const now = new Date()
      current = [
        ...current,
        {
          ...m,
          role: 'member' as const,
          joined: `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`,
        },
      ]
      publish()
    },

    /** 넘기고 나가기 — 한 명을 올리고 나를 뺍니다 */
    handOverAndLeave(toId: string) {
      current = current
        .map((m) => (m.id === toId ? { ...m, role: 'manager' as const } : m))
        .filter((m) => !m.me)
      publish()
    },
  }
}
