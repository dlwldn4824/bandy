import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import Steps from '../components/Steps.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import SummaryBox from '../components/SummaryBox.tsx'
import Button from '../components/Button.tsx'
import Sheet from '../components/Sheet.tsx'
import { P } from '../paths.ts'
import { depositGuide as d, booking } from '../../mocks/bandyLight.ts'
import CardPay from '../pay/CardPay.tsx'
import { PAY_CONFIGURED } from '../pay/portone.ts'
import { useTicketState } from '../pay/ticketState.ts'
import { BANK_UNSET, deadlineFrom, dueText, remainText } from '../pay/deposit.ts'
import { useBankAccount } from '../pay/bankAccount.ts'
import glossSoft from '../assets/gloss-soft-accent.svg'
import glossSpec from '../assets/gloss-spec-accent.svg'
import './D3Deposit.css'

/**
 * D3 입금 안내 — Figma 185:2
 *
 * 실제로 쓰는 길은 계좌 복사 → 입금 기한 → 운영진 수동 확인입니다. PG 심사가
 * 끝나지 않아서 그대로 둡니다. 그 아래에 카드 결제를 테스트 모드로만 붙여
 * 뒀습니다 — 화면과 코드는 완성이고 돈은 빠지지 않습니다.
 */
const D3Deposit = () => {
  const navigate = useNavigate()
  const { showId = 'glow' } = useParams()
  const [copied, setCopied] = useState<'account' | 'name' | null>(null)
  // 결제 수단 탭. 카드가 준비되기 전에는 탭 자체를 그리지 않습니다 —
  // 고를 게 하나뿐인데 탭을 보여 주면 고를 수 있는 것처럼 보입니다.
  const [pay, setPay] = useState<'transfer' | 'card'>('transfer')
  // 운영진이 계좌를 적으면 그 자리에서 바뀝니다
  const { bank, ready: BANK_READY } = useBankAccount()
  const [cancelling, setCancelling] = useState(false)
  /**
   * 「입금했어요」 는 **보냈다고 알리는 것**이지 확인이 아닙니다.
   * 예전에는 누르면 바로 「입금 확인됨」 티켓이 나왔습니다 — 운영진이 통장을
   * 보기도 전에요.
   */
  const { state, report, cancel } = useTicketState(showId)
  const reported = state === 'reported'

  // 기한은 화면을 연 시각에서 계산하고, 남은 시간은 1초마다 다시 셉니다.
  // 적어 둔 「23:41:02」 는 어제 봐도 오늘 봐도 23:41:02 였습니다.
  const due = useMemo(() => deadlineFrom(), [])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const copy = async (what: 'account' | 'name', text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      /* 클립보드를 못 쓰는 환경에서는 조용히 넘어갑니다 */
    }
  }

  return (
    <Phone>
      <TopBar title="입금 안내" />
      <div className="lui-body">
        <div className="d3">
          <Steps current={3} />

          {PAY_CONFIGURED && (
            <div className="d3-pay" role="tablist" aria-label="결제 수단">
              <button
                type="button"
                role="tab"
                aria-selected={pay === 'transfer'}
                className={`d3-pay__tab${pay === 'transfer' ? ' d3-pay__tab--on' : ''}`}
                onClick={() => setPay('transfer')}
              >
                계좌이체
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pay === 'card'}
                className={`d3-pay__tab${pay === 'card' ? ' d3-pay__tab--on' : ''}`}
                onClick={() => setPay('card')}
              >
                카드 결제
              </button>
            </div>
          )}

          {/* 규칙 6 — 핵심 강조 카드라서 글로스를 씁니다 */}
          <div className="lui-banner">
            <span className="lui-gloss lui-gloss--soft" aria-hidden>
              <img src={glossSoft} alt="" />
            </span>
            <span className="lui-gloss lui-gloss--spec" aria-hidden>
              <img src={glossSpec} alt="" />
            </span>
            <p className="lui-banner__title">
              {reported ? '보냈다고 알렸어요' : '아직 입금 전이에요'}
            </p>
            <p className="lui-banner__body">
              {dueText(due)}
              <br />
              남은 시간{' '}
              <span className="lui-banner__strong">{remainText(due.getTime() - now)}</span>
            </p>
          </div>

          <div className="d3__amount">
            <span className="d3__amount-label">보내실 금액</span>
            <span className="d3__amount-value">{d.amount}</span>
          </div>

          {/* 계좌가 등록돼 있을 때만 숫자를 그립니다. 없으면 지어내지 않고
              「아직 등록 전」 이라고 말합니다 — 그럴듯한 번호를 띄워 두면
              누군가는 그리로 보냅니다. */}
          {pay === 'transfer' && BANK_READY && (
          <div className="lui-card d3__account">
            <div className="d3__row">
              <span className="d3__k">은행</span>
              <span className="d3__v">{bank?.name}</span>
            </div>
            <div className="d3__row">
              <span className="d3__k">계좌번호</span>
              <span className="d3__v">{bank?.account}</span>
            </div>
            <div className="d3__row">
              <span className="d3__k">예금주</span>
              <span className="d3__v">{bank?.holder}</span>
            </div>
            <div className="d3__row">
              <span className="d3__k">입금자명</span>
              <span className="d3__v d3__v--accent">{d.depositorName}</span>
            </div>
            <div className="d3__spacer" />
            <div className="d3__copy">
              <Button variant="ghost" onClick={() => copy('account', bank?.account ?? '')}>
                {copied === 'account' ? '복사했어요' : '계좌 복사'}
              </Button>
              <Button variant="ghost" onClick={() => copy('name', d.depositorName)}>
                {copied === 'name' ? '복사했어요' : '입금자명 복사'}
              </Button>
            </div>
          </div>
          )}

          {pay === 'transfer' && !BANK_READY && (
            <div className="lui-card d3__unset">
              <p className="d3__unset-title">{BANK_UNSET.title}</p>
              <p className="d3__unset-body">{BANK_UNSET.body}</p>
            </div>
          )}

          {/* 카드 탭을 골랐을 때. 키가 없으면 탭도 이 자리도 없습니다 —
              눌러도 아무 일이 없는 버튼이 스토어 빌드에 들어가면 미완성으로
              반려됩니다 (Apple 2.1). */}
          {PAY_CONFIGURED && pay === 'card' && (
            <>
              <div className="d3__gap" />
              <CardPay
                amount={d.amountValue}
                orderName={booking.summary.title}
                onPaid={() => navigate(P.ticket(showId))}
              />
            </>
          )}

          <div className="d3__gap" />
          <SectionHeader title="예매 내역" aside={d.bookingNo} />
          <SummaryBox items={d.detail} />

          <div className="d3__gap" />
          <button type="button" className="d3__refund" onClick={() => navigate(P.legal('refund'))}>
            취소 · 환불 규정 보기
          </button>

          <div className="d3__gap" />
          <p className="d3__notes">
            {d.notes.map((n) => (
              <span key={n}>
                {n}
                <br />
              </span>
            ))}
          </p>
        </div>
      </div>

      <div className="lui-bottombar d3__bottom">
        {/* 규칙 1 — 보조 동작(예매 취소)은 외곽선 */}
        <Button variant="ghost" onClick={() => setCancelling(true)}>
          예매 취소
        </Button>
        {/* 막는 까닭이 둘입니다 — 보낼 계좌가 없는 것과, 이미 알린 것.
            같은 버튼이라도 이유가 다르니 글자를 달리 적습니다 */}
        {pay === 'transfer' && (
          <Button
            disabled={!BANK_READY || reported}
            onClick={() => {
              report()
              navigate(P.ticket(showId))
            }}
          >
            {reported ? '확인 기다리는 중' : '입금했어요'}
          </Button>
        )}
      </div>
      <Sheet open={cancelling} title="예매를 취소할까요?" onClose={() => setCancelling(false)}>
        <p className="lui-menu__note">
          자리가 풀리고 티켓은 「취소 · 환불」 로 옮겨 갑니다. 이미 보낸 돈이 있으면 운영진이
          확인한 뒤 돌려줍니다. 같은 공연을 다시 예매할 수는 있지만 자리가 남아 있어야 합니다.
        </p>
        <div className="d3__pair">
          <Button variant="ghost" onClick={() => setCancelling(false)}>
            그대로 두기
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              cancel()
              setCancelling(false)
              navigate(P.show(showId))
            }}
          >
            예매 취소
          </Button>
        </div>
      </Sheet>
    </Phone>
  )
}

export default D3Deposit
