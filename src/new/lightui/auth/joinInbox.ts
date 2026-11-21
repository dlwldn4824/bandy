import { useSyncExternalStore } from 'react'
import { useClubJoin, type ClubJoinRequest } from './clubJoin.ts'
import { joinRequests, me, type JoinRequest } from '../../mocks/bandyLight.ts'

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

function agoOf(at: string): string {
  const min = Math.floor((Date.now() - new Date(at).getTime()) / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.floor(hr / 24)}일 전`
}

/**
 * 이 기기에서 보낸 참여 신청을 목록의 한 줄로 만듭니다.
 *
 * 지금 신청은 서버가 아니라 기기에 쌓입니다. 그래서 받는 쪽을 만들어도
 * 「진짜로 승인되는지」 를 볼 방법이 이 한 줄밖에 없습니다. 목 세 줄과
 * 섞이면 헷갈리니 어느 것이 진짜인지 화면에 적습니다.
 *
 * 생성 신청은 넣지 않습니다 — 그건 동아리가 아니라 밴디가 확인합니다.
 */
function localRow(r: ClubJoinRequest): JoinRequest {
  return {
    // 자리표를 쓰지 않습니다 — approveJoin 이 이 id 로 맞춰 봅니다
    id: r.id,
    initial: me.initial,
    name: me.name,
    sub: '이 기기에서 보낸 신청',
    school: r.school,
    ago: agoOf(r.at),
    state: r.state,
    why: r.reason,
  }
}

function set(id: string, patch: Partial<JoinRequest>) {
  current = current.map((r) => (r.id === id ? { ...r, ...patch } : r))
  publish()
}

export function useJoinInbox() {
  const mock = useSyncExternalStore(subscribe, get, get)
  const mine = useClubJoin()
  // 진짜 신청을 맨 위에 둡니다 — 눌러서 확인할 수 있는 유일한 줄입니다
  const joined = mine && mine.kind === 'join'
  const all = joined ? [localRow(mine), ...mock] : mock
  return {
    all,
    /** 이 기기가 보낸 신청의 id. 그 줄만 진짜로 소속을 만듭니다 */
    mineId: joined ? mine.id : null,
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
