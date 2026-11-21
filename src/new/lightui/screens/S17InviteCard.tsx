import { useNavigate, useParams } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import SummaryBox from '../components/SummaryBox.tsx'
import Button from '../components/Button.tsx'
import Logo from '../components/Logo.tsx'
import { P } from '../paths.ts'
import { inviteFor } from '../invite/cards.ts'
import inviteTicket from '../assets/invite-ticket.png'
import './S17InviteCard.css'

/**
 * S17 초대장 (링크 열면) — Figma 237:2
 *
 * 코드마다 다른 초대장입니다. 전에는 주소의 코드를 안 읽고 멜로딕 11.22
 * 초대장을 박아 뒀습니다 — 다른 공연에 초대받은 사람이 엉뚱한 공연을
 * 예매하게 됩니다.
 *
 * 로그인 전에 처음 보는 화면이라 뒤로가기도 탭바도 없습니다. 그래서
 * 「밴디 둘러보기」 를 한 줄 둡니다. 초대를 안 받아들여도 나갈 길은
 * 있어야 합니다.
 */
const S17InviteCard = () => {
  const navigate = useNavigate()
  const { code } = useParams()
  const c = inviteFor(code)

  if (!c) {
    return (
      <Phone>
        <div className="lui-body">
          <div className="s17 s17--none">
            <Logo kind="mark" className="s17__mark" />
            <h1 className="s17__title">초대장을 찾지 못했어요</h1>
            <p className="s17__lead">
              링크가 잘못됐거나 공연이 내려갔을 수 있어요. 보내 준 분에게 다시 받아 주세요.
            </p>
          </div>
        </div>
        <div className="lui-bottombar lui-bottombar--stack">
          <Button flat onClick={() => navigate(P.home)}>
            밴디 둘러보기
          </Button>
        </div>
      </Phone>
    )
  }

  return (
    <Phone>
      <div className="lui-body">
        <div className="s17">
          <div className="s17__head">
            <Logo kind="mark" className="s17__mark" />
            <h1 className="s17__title">
              {c.headline[0]}
              <br />
              {c.headline[1]}
            </h1>
            <p className="s17__host">{c.host}</p>
          </div>

          <img className="s17__ticket" src={inviteTicket} alt="" />

          <div className="s17__gap-14" />
          <SummaryBox items={c.facts} />

          <div className="s17__gap-26" />
          <div className="s17__sender">
            <span className="s17__sender-avatar">{c.sender.initial}</span>
            <span className="s17__sender-main">
              <span className="s17__sender-name">{c.sender.name}</span>
              <span className="s17__sender-role">{c.sender.role}</span>
            </span>
          </div>

          <div className="s17__gap-14" />
          <p className="s17__quote">{c.message}</p>

          <div className="s17__gap-26" />
          <span className="s17__social">{c.social}</span>

          <div className="s17__gap-26" />
          <p className="s17__notice">{c.notice}</p>
        </div>
      </div>

      <div className="lui-bottombar lui-bottombar--stack">
        {/* 규칙 1 — 기본 버튼 하나. Figma 가 평평하게 그린 버튼입니다 */}
        <Button flat onClick={() => navigate(P.book(c.showId))}>
          초대 받고 예매하기
        </Button>
        <Button variant="ghost" onClick={() => navigate(P.show(c.showId))}>
          공연 정보 먼저 보기
        </Button>
        {/* 초대를 안 받아들여도 나갈 길 — 이 화면엔 뒤로가기도 탭바도 없습니다 */}
        <button type="button" className="s17__browse" onClick={() => navigate(P.home)}>
          밴디 둘러보기
        </button>
      </div>
    </Phone>
  )
}

export default S17InviteCard
