import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import MoreMenu from '../components/MoreMenu.tsx'
import TopBar from '../components/TopBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import SummaryBox from '../components/SummaryBox.tsx'
import ListRow from '../components/ListRow.tsx'
import Button from '../components/Button.tsx'
import { P } from '../paths.ts'
import { settlement as s } from '../../mocks/bandyLight.ts'
import { useBankAccount } from '../pay/bankAccount.ts'
import { freshClub, useIsDemoClub } from '../clubs/owner.ts'
import './S13Settlement.css'

/**
 * S13 정산 — Figma 216:2
 *
 * 정산 받을 계좌도 목에 적혀 있었습니다 — 「국민 123456-78-901234 · 멜로딕
 * (이지우)」. 입금 안내에서 걷어낸 것과 **같은 번호**가 여기 한 벌 더 살아
 * 있었습니다. 돈이 들어올 곳이라 틀리면 입금 안내보다 더 나쁩니다.
 *
 * 등록된 계좌가 없으면 지어내지 않고 등록하라고 말합니다.
 */
const S13Settlement = () => {
  const { bank, ready: BANK_READY } = useBankAccount()
  const navigate = useNavigate()
  // 적어 둔 694,000원은 멜로딕의 11.22 공연 것입니다 (clubs/owner.ts)
  const demo = useIsDemoClub()

  if (!demo) {
    return (
      <Phone>
        <TopBar title="정산" />
        <div className="lui-body">
          <div className="s13">
            <div className="s13__gap-26" />
            <div className="lui-card s13-empty">
              <p className="s13-empty__title">{freshClub.settlement}</p>
              <p className="s13-empty__body">{freshClub.settlementBody}</p>
              <Button variant="ghost" onClick={() => navigate(P.console)}>
                공연 관리로
              </Button>
            </div>
          </div>
        </div>
      </Phone>
    )
  }

  return (
    <Phone>
      <TopBar
        title="정산"
        right={
          <MoreMenu
            items={[
              { label: '입금 관리', to: P.deposits },
              {
                label: '정산 내역 내려받기',
                note: '정산 내역을 엑셀로 받습니다. 공연이 끝난 뒤에 열립니다.',
              },
            ]}
          />
        }
      />
      <div className="lui-body">
        <div className="s13">
          <div className="s13__gap-14" />
          <div className="lui-card s13__show">
            <ListRow
              avatar={<img src={s.show.thumb} alt="" />}
              title={s.show.title}
              sub={s.show.sub}
              chevron
              onClick={() => navigate(P.show('glow'))}
            />
          </div>

          <div className="s13__gap-26" />
          <div className="s13__payout">
            <span className="s13__payout-k">{s.payoutLabel}</span>
            <span className="s13__payout-v">{s.payout}</span>
          </div>

          <div className="s13__gap-14" />
          <SummaryBox items={s.breakdown} />

          <div className="s13__gap-26" />
          <SectionHeader title="어디로 얼마가 가나" />
          <div className="lui-meters">
            {s.shares.map((row) => (
              <div key={row.k} className="lui-meter">
                <span className="lui-meter__k">{row.k}</span>
                <span className="lui-meter__track">
                  <span
                    className={`lui-meter__fill${row.tone === 'accent' ? ' lui-meter__fill--accent' : ''}${
                      row.tone === 'mute' ? ' lui-meter__fill--mute' : ''
                    }`}
                    style={{ width: `${(row.value / s.totalValue) * 100}%` }}
                  />
                </span>
                <span className="lui-meter__v">{row.value.toLocaleString('ko-KR')}</span>
              </div>
            ))}
          </div>

          <div className="s13__gap-26" />
          <SectionHeader title="입금 계좌" />
          <div className="lui-card s13__account">
            <div className="s13__account-row">
              <span className="s13__account-main">
                <span className="s13__account-title">
                  {BANK_READY ? `${bank?.name} ${bank?.account}` : '등록된 계좌가 없어요'}
                </span>
                <span className="s13__account-sub">
                  {BANK_READY ? bank?.holder : '정산을 받으려면 계좌를 먼저 등록해 주세요.'}
                </span>
              </span>
              <span className="lui-pill lui-pill--lg lui-pill--outline">
                {BANK_READY ? '변경' : '등록'}
              </span>
            </div>
          </div>

          <div className="s13__gap-26" />
          <p className="s13__notice">{s.notice}</p>
        </div>
      </div>

      <div className="lui-bottombar">
        <Button block onClick={() => navigate(P.me)}>
          정산 요청
        </Button>
      </div>
    </Phone>
  )
}

export default S13Settlement
