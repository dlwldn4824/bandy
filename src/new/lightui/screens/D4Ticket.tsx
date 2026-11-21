import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import MoreMenu from '../components/MoreMenu.tsx'
import TopBar from '../components/TopBar.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import SummaryBox from '../components/SummaryBox.tsx'
import ListRow from '../components/ListRow.tsx'
import Button from '../components/Button.tsx'
import Icon from '../components/Icon.tsx'
import Sheet from '../components/Sheet.tsx'
import DirectionsSheet from '../components/DirectionsSheet.tsx'
import { P } from '../paths.ts'
import { ticketFor, ticketMissing, showLive } from '../../mocks/bandyLight.ts'
import { useTicketState } from '../pay/ticketState.ts'
import qr from '../assets/ticket-qr.svg'
import './D4Ticket.css'

/** D4 티켓 · QR 입장 — Figma 186:2 */
const REFUND =
  '공연 3일 전까지는 전액 환불됩니다. 입금하신 계좌로 영업일 기준 2~3일 안에 돌려드려요. 그 뒤에는 운영진과 대화로 처리합니다.'

const D4Ticket = () => {
  const navigate = useNavigate()
  const { showId = 'glow' } = useParams()
  // 공연마다 다른 티켓입니다 — 예전에는 어느 티켓을 눌러도 같은 화면이 나왔습니다
  const t = ticketFor(showId)
  /**
   * QR 과 입장 번호는 **돈이 확인된 뒤에만** 엽니다.
   * 예전에는 입금 대기인 티켓에서도 열려서, 입금 안 한 사람이 입구까지
   * 갔다가 거기서 막혔습니다. 막을 거면 집에서 알려 줘야 합니다.
   */
  const { state, canEnter, copy } = useTicketState(showId)
  const [refund, setRefund] = useState(false)
  const [dirs, setDirs] = useState(false)

  // 없는 티켓이면 없다고 말합니다 — 남의 티켓을 보여 주지 않습니다
  if (!t) {
    return (
      <Phone>
        <TopBar title="내 티켓" />
        <div className="lui-body">
          <div className="d4">
            <div className="d4__gap-26" />
            <div className="lui-card d4-missing">
              <p className="d4-missing__title">{ticketMissing.title}</p>
              <p className="d4-missing__body">{ticketMissing.body}</p>
              <Button variant="ghost" onClick={() => navigate(P.tickets)}>
                {ticketMissing.cta}
              </Button>
            </div>
          </div>
        </div>
        <TabBar active="ticket" />
      </Phone>
    )
  }

  return (
    <Phone>
      <TopBar
        title="내 티켓"
        right={
          <MoreMenu
            items={[
              { label: '친구 초대하기', sub: '링크 · 문자 · 초대 카드', to: P.invite },
              {
                label: '취소 · 환불',
                danger: true,
                note: REFUND,
              },
            ]}
          />
        }
      />
      <div className="lui-body">
        <div className="d4">
          <div className="d4__gap-14" />
          <div className="d4__status">
            <span className="lui-pill lui-pill--ink">{copy.pill}</span>
            {/* 입장 번호는 확인된 티켓에만 있습니다 */}
            {canEnter && <span className="lui-pill lui-pill--soft">{t.entry}</span>}
          </div>

          <div className="d4__gap-14" />
          <div className="d4__ticket">
            <div className="d4__ticket-head">
              <span className="d4__ticket-title">{t.title}</span>
              <span className="d4__ticket-sub">{t.sub}</span>
            </div>
            <div className="d4__notch" />
            <div className="d4__ticket-body">
              {canEnter ? (
                <div className="d4__qr">
                  <img src={qr} alt="입장 QR" />
                </div>
              ) : (
                /* 빈 네모만 두면 고장으로 읽힙니다 — 왜 닫혀 있는지 적습니다 */
                <div className="d4__qr d4__qr--locked">
                  <span className="d4__locked-title">
                    {state === 'cancelled' ? '취소한 예매예요' : 'QR 은 아직 닫혀 있어요'}
                  </span>
                  <span className="d4__locked-body">{copy.short}</span>
                </div>
              )}
              <div className="d4__facts">
                {t.facts.map((f) => (
                  <div key={f.k} className="d4__fact">
                    <span className="d4__fact-k">{f.k}</span>
                    <span className="d4__fact-v">{f.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="d4__gap-26" />
          <p className="d4__guide">{canEnter ? t.guide : copy.guide}</p>

          {/* MOCK: 입구 단말이 QR 을 읽으면 서버가 알려 줄 자리입니다.
              붙기 전까지는 이 버튼으로 입장 완료(P3) 를 볼 수 있게 둡니다.
              입장할 수 없는 티켓에는 두지 않습니다 — 막아 둔 걸 옆에서 열어
              주면 막은 적이 없는 것입니다. */}
          {canEnter && (
          <button
            type="button"
            className="d4__demo"
            onClick={() => navigate(P.liveEntered(showId))}
          >
            입장 처리됨 (데모)
          </button>
          )}

          {/* 예매하고 나면 다음으로 궁금한 건 「누가 언제 나오나」 입니다.
              예전에는 화면 맨 아래 작은 글씨 링크뿐이라 아무도 거기까지 안 갔습니다. */}
          <div className="d4__gap-26" />
          <SectionHeader
            title="공연 정보 · 셋리스트"
            // 입장 줄은 팀이 아닙니다
            aside={`${showLive.timeline.filter((x) => !x.title.includes('입장')).length}팀`}
            onAside={() => navigate(P.live(showId))}
          />
          <button type="button" className="lui-card d4-lineup" onClick={() => navigate(P.live(showId))}>
            <span className="d4-lineup__rows">
              {showLive.timeline.slice(0, 3).map((row) => (
                <span key={row.at} className="d4-lineup__row">
                  <span className="d4-lineup__at">{row.at}</span>
                  <span className="d4-lineup__title">{row.title}</span>
                  <span className="d4-lineup__sub">{row.sub}</span>
                </span>
              ))}
            </span>
            <span className="d4-lineup__more">
              셋리스트와 남은 순서 보기
              <Icon name="chevron-right" size={15} />
            </span>
          </button>

          <div className="d4__gap-26" />
          <SectionHeader title="사전 구매" aside="현장 교환" />
          <div className="lui-card d4__addon">
            <ListRow
              avatar={t.addon.initial}
              title={t.addon.name}
              sub={t.addon.sub}
              slot={<span className="lui-pill lui-pill--soft">{t.addon.state}</span>}
            />
          </div>

          <div className="d4__gap-26" />
          <SummaryBox items={t.payment} />

          <div className="d4__gap-26" />
          <div className="d4__links">
            <button type="button" className="d4__link" onClick={() => navigate(P.legal('refund'))}>
              취소 · 환불 규정
            </button>
            <button type="button" className="d4__link" onClick={() => setRefund(true)}>
              이 공연 환불 안내
            </button>
          </div>
        </div>
      </div>

      <Sheet open={refund} title="취소 · 환불" onClose={() => setRefund(false)}>
        <p className="lui-menu__note">{REFUND}</p>
        <Button block onClick={() => setRefund(false)}>
          확인
        </Button>
      </Sheet>

      <DirectionsSheet venue={t.venue} open={dirs} onClose={() => setDirs(false)} />

      <div className="lui-bottombar">
        <Button block onClick={() => setDirs(true)}>
          공연장 길찾기
        </Button>
      </div>
      {/* 문자나 링크로 이 화면에 바로 들어오면 위쪽 뒤로가기 말고는 나갈 길이
          없었습니다. 티켓은 흐름의 중간이 아니라 도착지라 탭바를 둡니다. */}
      <TabBar active="ticket" />
    </Phone>
  )
}

export default D4Ticket
