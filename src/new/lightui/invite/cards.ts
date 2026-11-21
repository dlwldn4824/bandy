import { inviteCard } from '../../mocks/bandyLight.ts'

/**
 * 초대장 — 코드로 찾습니다.
 *
 * 전에는 `/ui/i/abc999` 처럼 **아무 코드로 들어가도** 언제나 멜로딕 11.22
 * 초대장이 떴습니다. 화면이 `useParams` 를 안 읽고 `P.book('glow')` 를
 * 박아 두고 있었습니다. 다른 공연에 초대받은 사람이 **엉뚱한 공연을 예매**
 * 하게 됩니다 — 초대 링크로 들어온 889명 전원이 지나는 자리였습니다.
 *
 * 못 찾는 코드는 못 찾았다고 해야 합니다. 아무거나 보여 주면 틀린 표를
 * 삽니다.
 *
 * MOCK: 실제로는 초대 코드 문서를 읽습니다. 여기서는 몇 개만 둡니다.
 */

export interface InviteCard {
  /** 예매·공연 정보가 가리킬 공연 */
  showId: string
  headline: [string, string]
  host: string
  facts: { k: string; v: string; accent?: boolean }[]
  sender: { initial: string; name: string; role: string }
  message: string
  social: string
  notice: string
}

const CARDS: Record<string, InviteCard> = {
  glow: { ...inviteCard, showId: 'glow', headline: ['이지우님이', '공연에 초대했어요'] },
  union: {
    showId: 'union',
    headline: ['한소은님이', '공연에 초대했어요'],
    host: '렉사 · 한양대학교 밴드 동아리',
    facts: [
      { k: '공연', v: '렉사 X 멜로딕 연합' },
      { k: '일시', v: '11.29 (일) 18:00' },
      { k: '장소', v: '몽향 · 노원구 공릉동' },
      { k: '출연', v: '렉사 · 멜로딕' },
      { k: '티켓', v: '12,000원 · 잔여 8석', accent: true },
    ],
    sender: { initial: '한', name: '한소은', role: '렉사 · 보컬' },
    message: '“이번엔 멜로딕이랑 같이 서. 앞자리 맡아 둘게!”',
    social: '이 초대로 벌써 3명이 왔어요',
    notice: '로그인 없이 먼저 둘러볼 수 있어요.',
  },
}

/** 없는 코드면 null — 아무 초대장이나 대신 보여 주지 않습니다 */
export function inviteFor(code?: string): InviteCard | null {
  if (!code) return null
  return CARDS[code] ?? null
}
