import { useNavigate, useSearchParams } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import Icon from '../components/Icon.tsx'
import { P } from '../paths.ts'
import { myTickets as t } from '../../mocks/bandyLight.ts'
import { useTicketStates } from '../pay/ticketState.ts'
import './S7Tickets.css'

type TabKey = 'upcoming' | 'past' | 'cancelled'

/**
 * S7 내 티켓 목록 — Figma 210:2
 *
 * 탭은 교류 탭과 같은 규칙입니다 — 이동이 아니라 같은 화면에서 목록만 바뀌고,
 * 어떤 탭인지는 `?tab=` 에 남아 뒤로가기로 돌아올 수 있습니다.
 */
const S7Tickets = () => {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const asked = params.get('tab') as TabKey | null
  const tab: TabKey = t.tabs.some((x) => x.key === asked) ? (asked as TabKey) : 'upcoming'
  /**
   * 취소한 예매는 「취소 · 환불」 로 옮겨 갑니다 — D3 에서 취소를 누르면서
   * 그렇게 말해 놓고 목록이 그대로면 취소가 안 된 것으로 보입니다.
   */
  const { stateOf } = useTicketStates()
  const all = t.items.map((item) =>
    stateOf(item.id) === 'cancelled'
      ? // 취소한 예매에 「오늘」 빨강 배지가 그대로 붙어 있으면 아직 가는 줄 압니다
        { ...item, tab: 'cancelled', badge: '취소함', urgent: false, today: false }
      : item,
  )
  const items = all.filter((item) => item.tab === tab)

  /**
   * 날짜별 예매 수는 적어 둔 값이었습니다 — 취소해도 그대로 남습니다.
   * 목록에서 셉니다. 「일반 2매 · 음료 1잔」 에서 매수만 꺼냅니다.
   */
  const counts = all
    .filter((item) => item.tab === 'upcoming')
    .map((item) => ({
      k: item.when.split(' ')[0],
      value: Number(/(\d+)매/.exec(item.what)?.[1] ?? 1),
    }))
  const countMax = Math.max(1, ...counts.map((c) => c.value))

  const goTab = (next: TabKey) => {
    const q = new URLSearchParams(params)
    if (next === 'upcoming') q.delete('tab')
    else q.set('tab', next)
    setParams(q)
  }

  return (
    <Phone>
      <div className="lui-body">
        <div className="s7">
          <div className="s7__gap-14" />
          <div className="s7__head">
            <h1 className="s7__title">내 티켓</h1>
            <span className="lui-pill lui-pill--lg lui-pill--outline">{t.count}</span>
          </div>

          <div className="s7__gap-14" />
          <div className="lui-utabs lui-utabs--accent" role="tablist">
            {t.tabs.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={x.key === tab}
                className={`lui-utab${x.key === tab ? ' lui-utab--on' : ''}`}
                onClick={() => goTab(x.key as TabKey)}
              >
                {x.label}
              </button>
            ))}
          </div>

          <div className="s7__gap-14" />
          <div className="s7__list">
            {items.length === 0 && <p className="s7__empty">{t.empty[tab]}</p>}
            {items.map((item) => (
              <div key={item.id} className="lui-card s7-item">
                <div className="s7-item__row">
                  <img className="s7-item__thumb" src={item.thumb} alt="" />
                  <button
                    type="button"
                    className="s7-item__main"
                    onClick={() =>
                      /* 공연 당일에는 티켓보다 「오늘 뭘 할 수 있는지」 가 먼저입니다 */
                      navigate('today' in item && item.today ? P.live(item.id) : P.ticket(item.id))
                    }
                  >
                    <span className="s7-item__title">{item.title}</span>
                    <span className="s7-item__sub">{item.when}</span>
                    <span className="s7-item__sub">{item.what}</span>
                  </button>
                  <span className="s7-item__side">
                    {/* 규칙 7 — 마감·입금처럼 꼭 봐야 하는 것만 빨강 */}
                    <span className={`lui-pill lui-pill--lg${item.urgent ? '' : ' lui-pill--outline'}`}>
                      {item.badge}
                    </span>
                    <Icon name="chevron-right" size={18} className="s7-item__chev" />
                  </span>
                </div>

                {/* 다가오는 공연에만 — 끝난 공연과 취소된 건에는 볼 순서가 없습니다 */}
                {tab === 'upcoming' && (
                  <button
                    type="button"
                    className="s7-item__more"
                    onClick={() => navigate(P.live(item.id))}
                  >
                    공연 정보 · 셋리스트
                    <Icon name="chevron-right" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="s7__gap-26" />
          <SectionHeader title="다가오는 공연 예매 수" />
          <div className="lui-meters">
            {counts.map((row, i) => (
              <div key={row.k} className="lui-meter">
                <span className="lui-meter__k">{row.k}</span>
                <span className="lui-meter__track">
                  <span
                    /* 규칙 7 — 제일 가까운 공연 하나만 빨강 */
                    className={`lui-meter__fill lui-meter__fill--${i === 0 ? 'accent' : 'soft'}`}
                    style={{ width: `${(row.value / countMax) * 100}%` }}
                  />
                </span>
                <span className="lui-meter__v">{row.value}매</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <TabBar active="ticket" />
    </Phone>
  )
}

export default S7Tickets
