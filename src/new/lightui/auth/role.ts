import { useMembership, type ClubRole } from './membership.ts'

/**
 * 권한 — 소속에서 읽습니다.
 *
 * 모집 글 쓰기·제안 보내기·공연 만들기·입금·입장·정산은 운영진만 합니다.
 * 동아리에 안 든 사람(관객)에게는 그런 자리가 아예 없습니다.
 *
 * 예전에는 여기서 'manager' / 'member' 를 직접 들고 있었는데, 그건 고르는 값이
 * 아니라 소속에서 나오는 값이라 `membership.ts` 로 옮겼습니다. 이 파일은
 * 쓰던 곳이 많아 그대로 두고, 값만 소속에서 읽어 옵니다.
 */

export type { ClubRole }

export function useRole() {
  const { membership, inClub, isVenue, isManager } = useMembership()
  return { role: membership?.role, inClub, isVenue, isManager }
}

/** 권한이 없을 때 버튼 자리에 대신 두는 문구 */
export const MANAGER_ONLY = '운영진만 할 수 있어요'

/** 공연장 화면에서 같은 자리에 쓰는 문구 */
export const VENUE_ONLY = '공연장만 볼 수 있어요'
