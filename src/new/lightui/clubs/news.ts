import { useSyncExternalStore } from 'react'
import { useMembership, getMembership } from '../auth/membership.ts'
import { DEMO_CLUB_ID } from './owner.ts'

/**
 * 한마디 — 동아리가 올리는 한 줄.
 *
 * 소식은 읽기만 할 수 있었습니다. 「셋리스트를 올렸어요」 같은 줄이 어디서
 * 오는지 보면 전부 적어 둔 값이고, 올리는 자리가 없었습니다.
 *
 * **글쓰기 화면을 따로 만들면 아무도 안 씁니다.** 제목·본문·사진을 요구하는
 * 순간 「나중에」 가 되고, 동아리 소식은 원래 한 줄짜리입니다 — 합주 끝,
 * 셋리스트 올림, 티켓 오픈. 그래서 소식 목록 **바로 위에 한 줄 칸**을 둡니다.
 *
 * MOCK: 기기에만, 동아리별로 저장합니다 (clubs/owner.ts 와 같은 이유).
 */

export interface Word {
  id: string
  clubId: string
  club: string
  initial: string
  text: string
  /** 올린 시각 (ISO) — 「방금」 은 그릴 때 셉니다 */
  at: string
}

const KEY = 'bandy.lightui.clubNews'
const listeners = new Set<() => void>()

function read(): Word[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Word[]
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

/** '방금' · '12분 전' · '3시간 전' · '2일 전' */
export function agoText(at: string): string {
  const min = Math.floor((Date.now() - new Date(at).getTime()) / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.floor(hr / 24)}일 전`
}

/** 한 줄이라 길이를 막습니다 — 길어지면 그건 글쓰기입니다 */
export const WORD_MAX = 60

export function useClubNews() {
  const all = useSyncExternalStore(subscribe, get, get)
  const { membership } = useMembership()
  const clubId = membership?.clubId ?? DEMO_CLUB_ID
  return {
    /** 우리 동아리가 올린 것, 새것부터 */
    mine: all.filter((w) => w.clubId === clubId).reverse(),
    post(text: string) {
      const body = text.trim()
      if (!body) return
      const m = getMembership()
      current = [
        ...current,
        {
          id: `w-${Date.now().toString(36)}`,
          clubId: m?.clubId ?? DEMO_CLUB_ID,
          club: m?.clubName ?? '우리 동아리',
          initial: (m?.clubName ?? '우').slice(0, 1),
          text: body.slice(0, WORD_MAX),
          at: new Date().toISOString(),
        },
      ]
      publish()
    },
    remove(id: string) {
      current = current.filter((w) => w.id !== id)
      publish()
    },
  }
}
