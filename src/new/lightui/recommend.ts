/**
 * 이런 동아리는 어때요 — 왜 그 동아리가 나왔는지 셀 수 있게.
 *
 * 전에는 목 데이터에 「같은 장르 · 3km」 같은 문구가 박혀 있었습니다. 그건
 * 계산한 게 아니라 적어 둔 것이라, 동아리가 늘면 손으로 고쳐야 하고 틀려도
 * 아무도 모릅니다.
 *
 * 임베딩 같은 걸 쓸 수도 있지만 지금은 쓸 데이터가 없습니다. 동아리 수십
 * 곳에 공연 기록 몇 건으로는 학습할 게 없고, 무엇보다 **왜 추천됐는지
 * 설명할 수 없게 됩니다.** 그래서 세는 쪽으로 갑니다 — 신호마다 점수를
 * 주고, 제일 크게 기여한 신호를 그대로 이유로 적습니다.
 *
 * 신호가 거의 없으면 억지로 순위를 매기지 않고 섞어서 보여 줍니다.
 * 「3km」 처럼 그럴듯한 이유를 붙이면 믿게 되는데, 근거가 없으면 거짓말입니다.
 */

export interface ClubFacts {
  id: string
  name: string
  initial: string
  /** 학교. 연합·직장인 밴드는 없습니다 */
  school: string | null
  /** 밴드 · 아카펠라 · 재즈 … */
  genre: string
  /** 우리와의 거리 (km). 모르면 null */
  km: number | null
  /** 함께 무대에 선 횟수 */
  together: number
  /** 우리 공연에 응원하러 온 횟수 */
  cameToOurs: number
  /** 겹치는 레퍼토리 곡 수 */
  sharedSongs: number
  thisYearShows: number
}

export interface MyFacts {
  school: string | null
  genre: string
}

export interface Suggestion {
  club: ClubFacts
  score: number
  /** 화면에 그대로 적는 한 줄 */
  reason: string
  /** 보조 — 올해 공연 수 같은 것 */
  sub: string
}

/** 신호 하나하나. 점수가 클수록 「그래서 추천한다」 고 말하기 좋은 근거입니다. */
function signals(c: ClubFacts, me: MyFacts): { score: number; reason: string }[] {
  const out: { score: number; reason: string }[] = []

  // 함께 선 적이 있으면 그게 제일 센 근거입니다 — 이미 아는 사이니까요
  if (c.together > 0) {
    out.push({ score: 5 + c.together, reason: `함께 선 공연 ${c.together}회` })
  }
  // 우리 공연에 와 준 쪽도 셉니다. 먼저 온 쪽이 먼저 불러 주기 쉽습니다
  if (c.cameToOurs > 0) {
    out.push({ score: 4 + c.cameToOurs, reason: `우리 공연에 ${c.cameToOurs}번 왔어요` })
  }
  // 같은 곡을 한다는 건 합주가 된다는 뜻입니다
  if (c.sharedSongs >= 2) {
    out.push({ score: 3 + c.sharedSongs, reason: `같은 곡 ${c.sharedSongs}개를 해요` })
  }
  if (me.school && c.school === me.school) {
    out.push({ score: 4, reason: '같은 학교' })
  }
  if (c.km !== null && c.km <= 5) {
    out.push({ score: c.km <= 2 ? 4 : 3, reason: `${c.km}km` })
  }
  if (c.genre === me.genre) {
    out.push({ score: 2, reason: `같은 ${c.genre}` })
  }
  return out
}

/** 근거가 이만큼은 돼야 「추천」 이라고 말합니다 */
const ENOUGH = 3

export function recommendClubs(all: ClubFacts[], me: MyFacts, limit = 3): Suggestion[] {
  const scored = all.map((club) => {
    const sig = signals(club, me)
    const score = sig.reduce((n, s) => n + s.score, 0)
    // 제일 센 신호를 이유로 삼고, 두 번째가 있으면 한 번 더 붙입니다
    const sorted = [...sig].sort((a, b) => b.score - a.score)
    const reason = sorted.length
      ? sorted.slice(0, 2).map((s) => s.reason).join(' · ')
      : ''
    return {
      club,
      score,
      reason,
      sub: club.thisYearShows > 0 ? `올해 공연 ${club.thisYearShows}회` : '올해 공연 없음',
    }
  })

  const solid = scored.filter((s) => s.score >= ENOUGH)

  if (solid.length >= limit) {
    return solid.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  // 근거가 모자랍니다. 있는 것부터 보여 주고 나머지는 섞어서 채웁니다 —
  // 없는 이유를 지어내지 않습니다.
  const rest = scored
    .filter((s) => s.score < ENOUGH)
    .sort(() => Math.random() - 0.5)
    .map((s) => ({ ...s, reason: s.reason || '아직 아는 게 적어서 골라 봤어요' }))

  return [...solid.sort((a, b) => b.score - a.score), ...rest].slice(0, limit)
}
