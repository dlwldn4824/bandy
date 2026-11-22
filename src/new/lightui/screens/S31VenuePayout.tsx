import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import Button from '../components/Button.tsx'
import { P } from '../paths.ts'
import { showWhen } from '../calendar.ts'
import { useBankAccount } from '../pay/bankAccount.ts'
import { useIsDemoVenue } from '../clubs/owner.ts'
import { venuePayouts, venuePayoutCopy as t, type VenuePayout } from '../../mocks/bandyLight.ts'
import './S31VenuePayout.css'

/**
 * S31 공연장 정산.
 *
 * 공연장이 자기 돈을 보러 가면 **동아리 정산 화면**으로 갔고, 거기는
 * 동아리 운영진 게이트라 「운영진만 할 수 있어요」 를 만났습니다. 그 뒤로는
 * 「아직 준비 중」 이라고 말해 두었는데(964009e), 빈 날 화면에서 「티켓
 * 매출 20%」 를 약속해 놓고 그 돈이 어떻게 들어오는지 볼 데가 없는 건
 * 반쪽입니다.
 *
 * 동아리 정산과 계산이 다릅니다. 동아리는 매출에서 수수료·공연장 몫·참가비를
 * **빼고 남는 것**이고, 공연장은 매출에 비율을 **곱한 것**입니다. 그래서
 * 화면도 단순합니다 — 판 표, 티켓 매출, 거기에 우리 비율.
 */
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
const cutOf = (p: VenuePayout) => Math.round((p.sales * p.cut) / 100)

const S31VenuePayout = () => {
  const navigate = useNavigate()
  const { ready } = useBankAccount()
  // 적어 둔 둘은 라디오가가의 공연입니다 (clubs/owner.ts)
  const demo = useIsDemoVenue()
  const rows = demo ? venuePayouts : []

  const waiting = rows.filter((p) => p.state === 'waiting')
  const paid = rows.filter((p) => p.state === 'paid')
  const sum = (list: VenuePayout[]) => list.reduce((n, p) => n + cutOf(p), 0)

  const card = (p: VenuePayout) => (
    <div key={p.id} className="lui-card s31-row">
      <div className="s31-row__head">
        <span className="s31-row__show">{p.show}</span>
        <span className={`lui-pill lui-pill--lg${p.state === 'paid' ? ' lui-pill--outline' : ''}`}>
          {p.state === 'paid' ? `${t.paid} · ${p.paidAt}` : t.waiting}
        </span>
      </div>
      <p className="s31-row__sub">
        {p.club} · {showWhen(p.at)}
      </p>
      <div className="s31-row__box">
        <div className="s31-row__line">
          <span className="s31-row__k">{t.rows.tickets}</span>
          <span className="s31-row__v">{p.tickets}매</span>
        </div>
        <div className="s31-row__line">
          <span className="s31-row__k">{t.rows.sales}</span>
          <span className="s31-row__v">{won(p.sales)}</span>
        </div>
        <div className="s31-row__line s31-row__line--total">
          <span className="s31-row__k">
            {t.rows.cut} <span className="s31-row__cut">{p.cut}%</span>
          </span>
          <span className="s31-row__v s31-row__v--accent">{won(cutOf(p))}</span>
        </div>
      </div>
    </div>
  )

  return (
    <Phone>
      <TopBar title={t.title} back={P.venue} />
      <div className="lui-body">
        <div className="s31">
          <div className="s31__gap-14" />

          {rows.length === 0 ? (
            <div className="lui-card s31-empty">
              <p className="s31-empty__title">{t.empty}</p>
              <p className="s31-empty__body">{t.emptyBody}</p>
              <Button variant="ghost" onClick={() => navigate(P.venue)}>
                일정으로
              </Button>
            </div>
          ) : (
            <>
              {/* 제일 먼저 보는 것은 받을 돈입니다 */}
              <div className="s31__sum">
                <span className="s31__sum-k">{t.waitingLabel}</span>
                <span className="s31__sum-v">{won(sum(waiting))}</span>
                <span className="s31__sum-sub">{t.how}</span>
              </div>

              {/* 계좌가 없으면 보낼 곳이 없습니다 — 「등록하세요」 로 끝내지 않습니다 */}
              {!ready && (
                <>
                  <div className="s31__gap-14" />
                  <button
                    type="button"
                    className="lui-card s31-noacct"
                    onClick={() => navigate(P.bankAccount)}
                  >
                    <span className="s31-noacct__title">{t.noAccount}</span>
                    <span className="s31-noacct__body">{t.noAccountBody}</span>
                    <span className="s31-noacct__go">계좌 등록하기</span>
                  </button>
                </>
              )}

              <div className="s31__gap-26" />
              <SectionHeader title={t.waitingLabel} aside={`${waiting.length}건`} />
              <div className="s31__list">
                {waiting.length === 0 ? (
                  <p className="s31__none">받을 정산이 없어요.</p>
                ) : (
                  waiting.map(card)
                )}
              </div>

              <div className="s31__gap-26" />
              <SectionHeader title={t.paidLabel} aside={won(sum(paid))} />
              <div className="s31__list">
                {paid.length === 0 ? <p className="s31__none">아직 없어요.</p> : paid.map(card)}
              </div>

              <div className="s31__gap-22" />
              <p className="s31__notice">{t.notice}</p>
            </>
          )}
          <div className="s31__gap-26" />
        </div>
      </div>
    </Phone>
  )
}

export default S31VenuePayout
