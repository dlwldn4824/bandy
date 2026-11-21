import { useSyncExternalStore } from 'react'

/**
 * 동아리 참여 · 생성 신청.
 *
 * 운영진인지 자동으로 알아낼 방법이 없습니다. 「이 사람이 멜로딕 운영진이다」
 * 를 증명해 주는 외부 신원이 없어서, 학교 이메일로도 *그 학교 학생* 까지만
 * 증명됩니다. 그래서 첫 한 명만 사람이 확인하고 나머지는 그 사람이 올립니다.
 *
 *   있는 동아리  → 참여 신청 → 그 동아리 운영진이 받아 주면 부원
 *   없는 동아리  → 생성 신청 → 밴디가 확인하면 첫 운영진
 *
 * 생성을 바로 승인하지 않는 이유는 **이름 선점** 때문입니다. 자동이면
 * 아무나 「멜로딕」 을 먼저 등록해 버릴 수 있고, 그 계정으로 티켓값을
 * 받게 됩니다. 승인 전까지는 이름만 잡아 두고 공연은 못 올립니다.
 *
 * MOCK: 지금은 이 기기에만 저장합니다. 실제로는 서버에 신청이 쌓이고
 * 운영자 화면에서 승인합니다.
 */

const KEY = 'bandy.lightui.clubJoin'

export type JoinKind = 'join' | 'create'

export interface ClubJoinRequest {
  kind: JoinKind
  /** 있는 동아리에 들어갈 때만 */
  clubId?: string
  clubName: string
  school: string
  at: string
  /** 생성 신청일 때 확인용으로 주는 코드 */
  code?: string
  state: 'pending' | 'approved' | 'rejected'
}

const listeners = new Set<() => void>()

function read(): ClubJoinRequest | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ClubJoinRequest) : null
  } catch {
    return null
  }
}

let current = read()
let snapshot = current

function publish() {
  snapshot = current
  listeners.forEach((fn) => fn())
}

/** 확인용 코드 — 동아리 공식 계정에서 이 코드를 보내 달라고 합니다 */
function newCode(): string {
  const n = Math.floor(Math.random() * 1_000_000)
  return `BANDY-${String(n).padStart(6, '0')}`
}

export function rememberClubJoin(req: {
  kind: JoinKind
  clubId?: string
  clubName: string
  school: string
}) {
  current = {
    ...req,
    at: new Date().toISOString(),
    state: 'pending',
    code: req.kind === 'create' ? newCode() : undefined,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* 저장이 막혀도 이번 화면에서는 보입니다 */
  }
  publish()
  // TODO: 서버로 보내야 운영자가 봅니다. 지금은 이 기기에만 남습니다.
}

export function forgetClubJoin() {
  current = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 무시 */
  }
  publish()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const get = () => snapshot

export function useClubJoin() {
  return useSyncExternalStore(subscribe, get, get)
}
