import { useSyncExternalStore } from 'react'
import { BANK_READY } from '../pay/deposit.ts'

/**
 * 공연이 지금 어디쯤인지.
 *
 * 공연을 만들면 곧바로 끝이었습니다. 「올렸다」 와 「판다」 와 「닫았다」 가
 * 구분되지 않아서, 아직 팀도 안 모인 공연이 예매를 받고 있었고 마감한
 * 공연을 다시 열 길이 없었습니다.
 *
 *   초안 → 팀 모으는 중 → 예매 중 ⇄ 마감 → 당일 → 정산
 *
 * **누가 정하느냐가 둘로 갈립니다.** 초안·팀 모으는 중·예매 중·마감은
 * 운영진이 누르고, 당일과 정산은 공연 날짜에서 나옵니다. 시계가 정하는
 * 것을 버튼으로 두면 눌러도 아무 일 없는 버튼이 또 생깁니다.
 *
 * 그리고 **예매 중 ⇄ 마감은 되돌릴 수 있어야 합니다.** 자리가 남았는데
 * 실수로 닫았다고 공연을 다시 만들 수는 없습니다.
 *
 * MOCK: 기기에만 저장합니다. 실제로는 공연 문서의 상태 필드입니다.
 */

export type Stage = 'draft' | 'gathering' | 'selling' | 'closed' | 'today' | 'settling'

/** 운영진이 직접 고를 수 있는 단계 */
export type SetStage = 'draft' | 'gathering' | 'selling' | 'closed'

export const STAGES: { key: Stage; label: string; what: string }[] = [
  { key: 'draft', label: '초안', what: '우리만 봅니다. 아직 아무에게도 안 보여요.' },
  { key: 'gathering', label: '팀 모으는 중', what: '공연은 보이지만 표는 아직 안 팝니다.' },
  { key: 'selling', label: '예매 중', what: '누구나 보고 예매할 수 있습니다.' },
  { key: 'closed', label: '마감', what: '보이기는 하지만 더 못 삽니다. 다시 열 수 있어요.' },
  { key: 'today', label: '당일', what: '오늘입니다. 입장과 타임라인을 봅니다.' },
  { key: 'settling', label: '정산', what: '끝났습니다. 남은 건 정산입니다.' },
]

export const STAGE = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<
  Stage,
  (typeof STAGES)[number]
>

const KEY = 'bandy.lightui.showStage'
const listeners = new Set<() => void>()

function read(): Record<string, SetStage> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Record<string, SetStage>
  } catch {
    /* 사생활 보호 모드 등 */
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

/** `2026-11-22T19:00` — UTC 로 새기면 하루가 밀립니다 */
function parseAt(at: string): Date {
  const [date, time = '00:00'] = at.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

/**
 * 시계가 먼저입니다. 공연 날이 지났으면 무엇을 눌러 뒀든 정산이고,
 * 오늘이면 당일입니다 — 날짜는 운영진이 고를 수 있는 것이 아닙니다.
 */
export function resolve(at: string | undefined, set: SetStage | undefined): Stage {
  const chosen: SetStage = set ?? 'selling'
  if (!at) return chosen
  const when = parseAt(at)
  const now = new Date()
  if (sameDay(when, now)) return 'today'
  if (when.getTime() < now.getTime()) return 'settling'
  return chosen
}

/** 예매를 열기 전에 갖춰야 하는 것 */
export function openChecklist(show: { at?: string; venue?: string }) {
  return [
    { k: '공연 날짜', ok: Boolean(show.at), how: '공연 정보에서 날짜를 정하세요.' },
    { k: '공연장', ok: show.venue !== undefined ? Boolean(show.venue) : true, how: '설 자리를 먼저 잡으세요.' },
    {
      k: '입금 계좌',
      ok: BANK_READY,
      // 계좌 없이 표를 팔면 돈 낼 길이 없는 공연을 파는 것입니다
      how: '동아리 계좌를 등록해야 예매자가 돈을 보낼 수 있습니다.',
    },
  ]
}

export function useStage(showId: string, at?: string) {
  const all = useSyncExternalStore(subscribe, get, get)
  const set = all[showId]
  const stage = resolve(at, set)
  return {
    stage,
    /** 날짜가 정한 단계는 운영진이 못 바꿉니다 */
    locked: stage === 'today' || stage === 'settling',
    move(next: SetStage) {
      current = { ...current, [showId]: next }
      publish()
    },
  }
}

/** 목록에서 여러 공연의 단계를 한꺼번에 읽을 때 */
export function useStages() {
  const all = useSyncExternalStore(subscribe, get, get)
  return (show: { id: string; at?: string }) => resolve(show.at, all[show.id])
}
