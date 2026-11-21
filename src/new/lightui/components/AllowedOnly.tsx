import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Phone from './Phone.tsx'
import TopBar from './TopBar.tsx'
import Button from './Button.tsx'
import { MANAGER_ONLY, VENUE_ONLY, useRole } from '../auth/role.ts'
import { topicParticle } from '../korean.ts'
import { useGoBack } from '../useGoBack.ts'
import { P } from '../paths.ts'

/**
 * 권한이 있어야 들어올 수 있는 화면을 감쌉니다.
 *
 * 전에는 「동아리 운영진이냐」 하나만 물었습니다. 그래서 두 가지가 같이
 * 망가졌습니다.
 *
 *   공연장은 동아리가 아니라서 **자기 일**(지원 팀 수락·정산)을 못 했고,
 *   `/ui/venue` 에는 물음 자체가 없어서 **관객이 남의 공연장 운영 화면**을
 *   열었습니다 — 거절하기·공개 내리기까지 있는 화면입니다.
 *
 * 그래서 「운영진이냐」 가 아니라 **「무엇이 필요한가」** 를 묻습니다.
 */
export type Need = 'club-manager' | 'venue'

const COPY: Record<Need, { title: string; who: string }> = {
  'club-manager': { title: MANAGER_ONLY, who: '동아리 운영진' },
  venue: { title: VENUE_ONLY, who: '등록된 공연장' },
}

const AllowedOnly = ({
  need,
  title,
  what,
  children,
}: {
  need: Need
  title: string
  /** 「…은 동아리 운영진만 할 수 있어요」 */
  what: string
  children: ReactNode
}) => {
  const { isManager, isVenue } = useRole()
  const navigate = useNavigate()
  const goBack = useGoBack()

  const allowed = need === 'venue' ? isVenue : isManager
  if (allowed) return <>{children}</>

  const copy = COPY[need]

  return (
    <Phone>
      <TopBar title={title} />
      <div className="lui-body">
        <div className="lui-gate">
          <p className="lui-gate__title">{copy.title}</p>
          <p className="lui-gate__sub">
            {what}
            {topicParticle(what)} {copy.who}만 할 수 있습니다.{' '}
            {need === 'venue'
              ? '공연장으로 등록하면 비는 날을 올리고 지원한 팀을 받을 수 있어요.'
              : '필요하면 운영진에게 권한을 받아 주세요.'}
          </p>
          {/* 막아 두기만 하면 주최자 화면을 아무도 못 봅니다 — 가는 길을 둡니다 */}
          <button type="button" className="lui-gate__switch" onClick={() => navigate(P.me)}>
            {need === 'venue' ? '마이에서 공연장으로 등록하기' : '마이에서 권한 바꾸기'}
          </button>
        </div>
      </div>

      {/* 다른 화면과 같은 자리에 같은 모양으로 — 가운데 떠 있는 작은 버튼은 어색합니다 */}
      <div className="lui-bottombar">
        <Button block onClick={() => goBack()}>
          돌아가기
        </Button>
      </div>
    </Phone>
  )
}

export default AllowedOnly
