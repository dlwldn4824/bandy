import { useMembership } from '../auth/membership.ts'
import { getSession } from '../auth/kakao.ts'
import { mockKakaoUser } from '../../mocks/auth.ts'

/**
 * 목 데이터에는 주인이 없습니다.
 *
 * 공연 42건, 부원 다섯, 입금 35건, 정산 694,000원 — 전부 **멜로딕 것**인데
 * 어디에도 그렇게 적혀 있지 않습니다. 그래서 블루노트를 새로 만들어 들어가면
 * 남의 예매 42건이 내 운영 화면에 뜨고, 「몽향」 으로 등록한 공연장은
 * 라디오가가의 일정을 봅니다.
 *
 * 목을 동아리별로 늘리는 대신 **주인을 한 줄 적습니다.** 주인이면 지금처럼
 * 보이고, 아니면 빈 화면입니다. 그게 실제 모습이기도 합니다 — 오늘 만든
 * 동아리는 공연 0개, 부원 1명(나), 입금 0건입니다. 남의 숫자를 보여 주는
 * 것보다 빈 화면이 낫습니다.
 *
 * 서버가 붙으면 이 파일은 사라지고 그 자리에 「내 동아리의 공연을 읽는다」 가
 * 들어갑니다.
 */

/** 적어 둔 목이 누구 것인지 */
export const DEMO_CLUB_ID = 'melodic'
export const DEMO_VENUE = '라디오가가'

/** 지금 보고 있는 사람이 그 동아리 사람인가 */
export function useIsDemoClub() {
  const { membership } = useMembership()
  return membership?.kind !== 'venue' && (membership?.clubId ?? DEMO_CLUB_ID) === DEMO_CLUB_ID
}

export function useIsDemoVenue() {
  const { membership } = useMembership()
  if (membership?.kind !== 'venue') return true
  return membership.clubName === DEMO_VENUE
}

/** 갓 만든 동아리가 보게 되는 말 */
export const freshClub = {
  shows: '아직 올린 공연이 없어요.',
  showsBody: '아래 「공연 만들기」 로 첫 공연을 올리면 여기에 섭니다.',
  past: '끝난 공연이 아직 없어요.',
  deposits: '아직 입금 받을 예매가 없어요.',
  depositsBody: '공연을 올리고 예매가 들어오면 여기서 입금을 확인합니다.',
  settlement: '정산할 공연이 아직 없어요.',
  settlementBody: '공연이 끝나면 티켓 매출에서 수수료와 공연장 몫을 뺀 금액을 여기서 봅니다.',
  entry: '오늘 입장할 공연이 없어요.',
  entryBody: '공연 당일에 이 화면에서 QR 을 읽고 이름으로 찾습니다.',
  joins: '아직 들어온 신청이 없어요.',
  joinsBody: '마이 > 내 동아리의 참여 코드를 동아리 단톡에 올리면 여기로 신청이 들어옵니다.',
}

/** 갓 등록한 공연장이 보게 되는 말 */
export const freshVenue = {
  title: '아직 올린 날이 없어요',
  body: '비어 있는 날을 공개하면 동아리가 지원할 수 있습니다. 지원이 들어오면 여기서 수락합니다.',
}

/**
 * 티켓은 **사람** 것입니다.
 *
 * 동아리 목은 `clubId` 로 주인을 잡았는데, 티켓·예매는 동아리가 아니라
 * 사람에게 붙습니다. 그래서 주인이 다릅니다 — 적어 둔 티켓 다섯 장은
 * 데모 계정(이지우) 것입니다.
 *
 *   세션 없음        둘러보는 사람 → 데모 그대로 (지금 데모의 기본 경로)
 *   데모 계정        → 데모 그대로
 *   진짜 카카오 계정 → 자기 것, 즉 빈 「내 티켓」
 *
 * 어제 가입한 사람에게 티켓이 없는 건 사실입니다. 남의 티켓을 보여 주면
 * 그 QR 을 입구에서 내밀게 됩니다.
 */
export function isDemoUser() {
  const me = getSession()
  return me === null || me.id === mockKakaoUser.id
}
