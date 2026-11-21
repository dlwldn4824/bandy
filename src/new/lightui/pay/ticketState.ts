import { useSyncExternalStore } from 'react'
import { ticketFor } from '../../mocks/bandyLight.ts'

/**
 * 티켓 하나의 상태 — 예매부터 입장까지.
 *
 * 화면마다 따로 판단하고 있었습니다. 그래서 이렇게 됐습니다.
 *
 *   「입금했어요」 를 누르면 → 운영진이 확인하기도 전에 **「입금 확인됨」 티켓**
 *   입금 대기인 티켓에서도 → **QR 과 입장 번호가 열림**
 *   「예매 취소」 → 아무 일도 안 일어남
 *
 * 셋 다 상태가 한 군데 없어서 생깁니다. 상태를 여기 두고 화면은 읽기만 합니다.
 *
 *   기다림 → (관객) 입금했어요 → 신고함 → (운영진) 확인 → 확인됨 → 입장함
 *                                              └ 취소함
 *
 * **확인은 운영진이 누르는 것이지 관객이 누르는 것이 아닙니다.** 관객이 할 수
 * 있는 말은 「보냈어요」 까지입니다. 그 둘을 같은 것으로 치면, 돈이 안 들어온
 * 자리를 확정으로 세어 놓고 공연 날 입구에서 싸우게 됩니다.
 *
 * MOCK: 기기에만 저장합니다. 실제로는 예매 문서의 상태 필드입니다.
 */

export type PayState = 'waiting' | 'reported' | 'confirmed' | 'entered' | 'cancelled'

const KEY = 'bandy.lightui.ticketState'
const listeners = new Set<() => void>()

type Map = Record<string, PayState>

function read(): Map {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Map
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

/** 목에 적힌 글자에서 처음 상태를 읽습니다 — 바꾼 적이 없는 티켓용 */
function seed(showId: string): PayState {
  return ticketFor(showId).status === '입금 확인됨' ? 'confirmed' : 'waiting'
}

export function set(showId: string, next: PayState) {
  current = { ...current, [showId]: next }
  publish()
}

export const COPY: Record<PayState, { pill: string; short: string; guide: string }> = {
  waiting: {
    pill: '입금 전',
    short: '입금이 확인되면 열립니다',
    guide: '아직 입금 전이에요. 입금하고 「입금했어요」 를 눌러 주세요.',
  },
  reported: {
    pill: '입금 확인 중',
    short: '운영진이 확인하면 열립니다',
    guide:
      '보냈다고 알렸어요. 운영진이 통장을 보고 확인하면 QR 이 열립니다 — 보통 한 시간 안에 끝납니다.',
  },
  confirmed: {
    pill: '입금 확인됨',
    short: '',
    guide: '입구에서 이 화면을 보여 주세요.',
  },
  entered: { pill: '입장함', short: '', guide: '입장이 끝났습니다. 공연 잘 보세요.' },
  cancelled: {
    pill: '취소함',
    short: '취소한 예매라 입장할 수 없습니다',
    guide: '취소한 예매입니다. 다시 보려면 공연 화면에서 새로 예매해 주세요.',
  },
}

export function useTicketState(showId: string) {
  const all = useSyncExternalStore(subscribe, get, get)
  const state = all[showId] ?? seed(showId)
  return {
    state,
    /** QR 과 입장 번호는 돈이 확인된 뒤에만 */
    canEnter: state === 'confirmed' || state === 'entered',
    copy: COPY[state],
    /** 관객이 할 수 있는 말은 여기까지입니다 */
    report: () => set(showId, 'reported'),
    cancel: () => set(showId, 'cancelled'),
  }
}

/** 운영진 쪽 — 목록에서 여러 건을 다루느라 훅 밖에서도 읽고 씁니다 */
export function stateOf(showId: string): PayState {
  return snapshot[showId] ?? seed(showId)
}

export function useTicketStates() {
  const all = useSyncExternalStore(subscribe, get, get)
  return {
    all,
    stateOf: (showId: string) => all[showId] ?? seed(showId),
    confirm: (showId: string) => set(showId, 'confirmed'),
  }
}
