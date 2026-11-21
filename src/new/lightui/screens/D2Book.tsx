import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import Steps from '../components/Steps.tsx'
import Stepper from '../components/Stepper.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import SummaryBox from '../components/SummaryBox.tsx'
import Button from '../components/Button.tsx'
import { P } from '../paths.ts'
import { getSession, saveSession } from '../auth/kakao.ts'
import { booking } from '../../mocks/bandyLight.ts'
import './D2Book.css'

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

/** D2 예매 · 매수와 옵션 — Figma 184:2 */
const D2Book = () => {
  const navigate = useNavigate()
  const { showId = 'glow' } = useParams()

  // 공연을 만든 쪽이 연 것만 팝니다
  const offered = booking.addons.filter((a) => a.open)

  const [tickets, setTickets] = useState(booking.initialTickets)
  // 아무것도 안 담긴 상태에서 시작합니다
  const [addons, setAddons] = useState<Record<string, number>>({})

  // 로그인해 두었으면 이름과 연락처를 채워 둡니다
  const saved = getSession()
  const [name, setName] = useState(saved?.nickname ?? '')
  const [phone, setPhone] = useState(saved?.phone ?? '')
  const [depositor, setDepositor] = useState('')
  const [tried, setTried] = useState(false)

  // 입금자를 못 찾으면 자리를 확정할 수 없어서, 둘은 반드시 받습니다
  const digits = phone.replace(/\D/g, '')
  const ready = name.trim().length > 0 && digits.length >= 10

  const ticketTotal = tickets * booking.ticket.price
  const addonTotal = offered.reduce((sum, a) => sum + a.price * (addons[a.id] ?? 0), 0)
  const fee = tickets * booking.feePerTicket
  const total = ticketTotal + addonTotal + fee

  return (
    <Phone>
      <TopBar title="예매" />
      <div className="lui-body">
        <div className="d2">
          <Steps current={1} />

          <div className="lui-card d2__show">
            <div className="d2__show-row">
              <img className="d2__thumb" src={booking.summary.thumb} alt="" />
              <div className="d2__show-main">
                <span className="d2__show-title">{booking.summary.title}</span>
                <span className="d2__show-sub">{booking.summary.sub}</span>
              </div>
            </div>
          </div>

          <div className="d2__gap" />
          <SectionHeader title="매수" aside={`1인 최대 ${booking.maxPerPerson}매`} />
          <div className="lui-card d2__option">
            <div className="d2__opt-row">
              <div className="d2__opt-main">
                <span className="d2__opt-name">{booking.ticket.name}</span>
                <span className="d2__opt-sub">{booking.ticket.priceLabel}</span>
              </div>
              <Stepper
                value={tickets}
                min={1}
                max={booking.maxPerPerson}
                onChange={setTickets}
                label="티켓"
              />
            </div>
          </div>

          <div className="d2__gap" />
          {/* 여기서 안 고르고 넘어가도 공연 당일에 P2 에서 담을 수 있습니다 */}
          <SectionHeader
            title="사전 구매"
            aside="나중에 추가하기"
            onAside={() => navigate(P.liveStore(showId))}
          />
          {offered.length === 0 ? (
            <p className="lui-note d2__none">{booking.addonsNone}</p>
          ) : (
            <div className="lui-card d2__option d2__option--multi">
              {offered.map((a, i) => (
                <div key={a.id} style={{ display: 'contents' }}>
                  {i > 0 && <span className="d2__opt-line" />}
                  <div className="d2__opt-row">
                    <div className="d2__opt-main">
                      <span className="d2__opt-name">{a.name}</span>
                      <span className="d2__opt-sub">{a.sub}</span>
                    </div>
                    <Stepper
                      value={addons[a.id] ?? 0}
                      min={0}
                      /* 몇 개까지 팔지도 공연자가 정합니다 */
                      max={a.max}
                      onChange={(n) => setAddons((prev) => ({ ...prev, [a.id]: n }))}
                      label={a.name}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="d2__gap" />
          <SectionHeader title="예매자 정보" aside="입금자명으로 확인해요" />
          <div className="d2__fields">
            <label className="lui-field">
              <span className="lui-field__label">{booking.buyer.nameLabel}</span>
              <input
                className={`lui-input${tried && !name.trim() ? ' lui-input--bad' : ''}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={booking.buyer.namePlaceholder}
                autoComplete="name"
              />
            </label>
            <label className="lui-field">
              <span className="lui-field__label">{booking.buyer.phoneLabel}</span>
              <input
                className={`lui-input${tried && digits.length < 10 ? ' lui-input--bad' : ''}`}
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={booking.buyer.phonePlaceholder}
                autoComplete="tel"
              />
            </label>
            <label className="lui-field">
              <span className="lui-field__label">{booking.buyer.depositorLabel}</span>
              <input
                className="lui-input"
                value={depositor}
                onChange={(e) => setDepositor(e.target.value)}
                placeholder={booking.buyer.depositorPlaceholder}
                autoComplete="off"
              />
            </label>
            {tried && !ready && (
              <p className="d2__bad" role="alert">
                {booking.buyerRequired}
              </p>
            )}
          </div>

          <div className="d2__gap" />
          <SummaryBox
            items={[
              { k: `티켓 ${tickets}매`, v: won(ticketTotal) },
              ...offered
                .filter((a) => (addons[a.id] ?? 0) > 0)
                .map((a) => ({
                  k: `${a.name}${(addons[a.id] ?? 0) > 1 ? ` ×${addons[a.id]}` : ''}`,
                  v: won(a.price * (addons[a.id] ?? 0)),
                })),
              { k: '예매 수수료', v: won(fee) },
              { k: '결제 금액', v: won(total), total: true, accent: true, divider: true },
            ]}
          />
        </div>
      </div>

      <div className="lui-bottombar">
        <Button
          block
          onClick={() => {
            if (!ready) {
              setTried(true)
              return
            }
            // 다음 예매에서 다시 적지 않도록 연락처를 남겨 둡니다
            if (saved) saveSession({ ...saved, phone })
            navigate(P.deposit(showId))
          }}
        >
          {won(total)} · 계좌 받기
        </Button>
      </div>
    </Phone>
  )
}

export default D2Book
