import { mapShows } from '../../mocks/bandyLight.ts'
import { DEMO_CLUB_ID } from '../clubs/owner.ts'
import { getMyShow } from './myShows.ts'

/**
 * 공연 한 건의 두 가지 사실 — **언제**이고 **누구 것**인가.
 *
 * 왜 한 자리에 모았나
 * -------------------
 * 두 값이 화면마다 따로 구해지면서 화면끼리 답이 달라졌습니다.
 *
 * `D1Show` 는 날짜를 찾아 단계를 읽고 어제 끝난 공연에 「끝난 공연이에요」 를
 * 그립니다. 그런데 같은 공연의 `/book` 과 `/deposit` 은 날짜를 안 찾아서
 * **예매가 끝까지 되고 입금 기한이 23:54 남았다고 셉니다.** 링크·초대장·
 * 북마크는 전부 그 주소로 바로 들어갑니다.
 *
 * 주인도 같은 모양이었습니다. 입금 안내는 **공연을 연 동아리**의 계좌를
 * 보여 줘야 하는데 보는 사람(예매자)의 소속에서 찾고 있었습니다. 그래서
 * 테스트밴드 운영진이 멜로딕 공연을 예매하면 **테스트밴드 계좌**가 떴습니다.
 * 남의 공연 티켓값이 내 계좌로 들어옵니다.
 *
 * 어디서 찾나
 * -----------
 * 1. 우리가 만든 공연 — `myShows` 에 날짜와 `clubId` 가 둘 다 있습니다
 * 2. 적어 둔 공연 — `mapShows` 에 날짜가 있고, 주인은 데모 동아리입니다
 * 3. 모르는 공연 — 날짜 없음, 주인은 데모 동아리
 *
 * MOCK: 서버가 붙으면 공연 문서 한 번 읽기로 바뀝니다. 지금 두 곳을 뒤지는
 * 것도 그래서 여기 한 함수 안에만 있습니다.
 */

export interface ShowFacts {
  /** `YYYY-MM-DDTHH:mm` — 모르면 undefined (단계가 날짜로 안 넘어갑니다) */
  at?: string
  /** 공연을 연 동아리 — 계좌와 정산이 이 값을 따릅니다 */
  clubId: string
}

export function showFacts(showId: string): ShowFacts {
  const mine = getMyShow(showId)
  if (mine) return { at: mine.at, clubId: mine.clubId }
  const listed = mapShows.find((show) => show.id === showId)
  return { at: listed?.at, clubId: DEMO_CLUB_ID }
}
