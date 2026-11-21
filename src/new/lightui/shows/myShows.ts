import { useSyncExternalStore } from 'react'
import { useMembership, getMembership } from '../auth/membership.ts'
import { DEMO_CLUB_ID } from '../clubs/owner.ts'
import { setStage } from './stage.ts'

/**
 * 우리가 만든 공연.
 *
 * 「공연 만들기」 는 끝에서 **멜로딕 단독 공연 상세**로 보냈습니다. 주소에
 * `glow` 가 박혀 있었거든요. 그래서 새 동아리가 공연을 만들면 남의 공연이
 * 열리고, 자기가 적은 것은 어디에도 안 남았습니다.
 *
 * 만든 공연이 실제로 생겨야 합니다 — 콘솔 목록에 서고, 공연 상태에서 예매를
 * 열 수 있고, 열면 관객이 상세를 봅니다. 그 셋이 안 이어지면 만들기는
 * 화면일 뿐입니다.
 *
 * MOCK: 기기에만 저장합니다. 동아리별로 나눠 두는 것은 `clubs/owner.ts` 와
 * 같은 이유입니다 — 주인 없는 데이터는 남의 화면에 섭니다.
 */

export interface MyShow {
  id: string
  clubId: string
  /** 우리 동아리 이름 — 만들 때의 이름을 그대로 둡니다 */
  clubName: string
  title: string
  /** `YYYY-MM-DDTHH:mm` */
  at: string
  venue: string
  /** 고른 포스터의 미리 보기 주소. 새로고침하면 사라집니다 */
  poster?: string
}

const KEY = 'bandy.lightui.myShows'
const listeners = new Set<() => void>()

function read(): MyShow[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as MyShow[]
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

function myClubId() {
  return getMembership()?.clubId ?? DEMO_CLUB_ID
}

/** 만든 공연 하나 — 주소로 찾습니다 */
export function getMyShow(id: string): MyShow | null {
  return snapshot.find((show) => show.id === id) ?? null
}

export function createShow(draft: { title: string; at: string; venue: string; poster?: string }) {
  const m = getMembership()
  const show: MyShow = {
    id: `own-${Date.now().toString(36)}`,
    clubId: m?.clubId ?? DEMO_CLUB_ID,
    clubName: m?.clubName ?? '우리 동아리',
    ...draft,
  }
  current = [...current, show]
  publish()
  /**
   * 만들자마자 파는 게 아닙니다. 적어 두지 않으면 단계가 「예매 중」 으로
   * 시작하는데, 그러면 갖춘 것도 없는 공연이 곧바로 둘러보기에 섭니다 —
   * 「공연을 만들면 곧바로 끝」 이던 그 문제입니다.
   */
  setStage(show.id, 'draft')
  return show
}

export function useMyShows() {
  const all = useSyncExternalStore(subscribe, get, get)
  const { membership } = useMembership()
  const clubId = membership?.clubId ?? myClubId()
  return all.filter((show) => show.clubId === clubId)
}
