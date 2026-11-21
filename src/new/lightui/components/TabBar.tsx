import { Link } from 'react-router-dom'
import Icon from './Icon.tsx'
import { P } from '../paths.ts'

/** 규칙 4 — 탭 5개, solid 아이콘 26px + 라벨 11px */
export type TabKey = 'home' | 'noti' | 'ticket' | 'club' | 'my'

/**
 * 지도는 탭에서 내렸습니다 — 목록·지도·달력은 같은 공연을 보는 세 방식이라
 * 「둘러보기」 안의 보기 전환으로 접었습니다. 그 자리를 알림이 받습니다.
 * 새 공연과 입금 기한은 놓치면 자리가 날아가는 것이라 한 번에 닿아야 합니다.
 */
const TABS: { key: TabKey; label: string; to: string }[] = [
  { key: 'home', label: '둘러보기', to: P.home },
  { key: 'club', label: '동아리', to: P.clubs },
  { key: 'ticket', label: '내 티켓', to: P.tickets },
  { key: 'noti', label: '알림', to: P.notifications },
  { key: 'my', label: '마이', to: P.me },
]

const TabBar = ({ active }: { active: TabKey }) => (
  <nav className="lui-tabbar">
    {TABS.map((tab) => {
      const on = tab.key === active
      return (
        <Link
          key={tab.key}
          to={tab.to}
          className={`lui-tabbar__item${on ? ' lui-tabbar__item--on' : ''}`}
          aria-current={on ? 'page' : undefined}
        >
          <Icon name={`tab-${tab.key}`} size={26} />
          <span className="lui-tabbar__label">{tab.label}</span>
        </Link>
      )
    })}
  </nav>
)

export default TabBar
