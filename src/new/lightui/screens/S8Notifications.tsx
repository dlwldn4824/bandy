import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import MoreMenu from '../components/MoreMenu.tsx'
import TabBar from '../components/TabBar.tsx'
import TopBar from '../components/TopBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import ListRow from '../components/ListRow.tsx'
import Toggle from '../components/Toggle.tsx'
import Button from '../components/Button.tsx'
import { P } from '../paths.ts'
import { useRole } from '../auth/role.ts'
import { getSession } from '../auth/kakao.ts'
import PushRow from '../push/PushRow.tsx'
import { notifications as n } from '../../mocks/bandyLight.ts'
import './S8Notifications.css'

const dest: Record<string, string> = {
  joins: P.joinRequests,
  proposal: P.proposal('1'),
  ticket: P.ticket('glow'),
  venue: P.venue,
  show: P.show('glow'),
}

/**
 * S8 알림 — Figma 211:2
 *
 * 목이 고정이라 방금 관객으로 가입한 사람에게도 「입금이 확인됐어요」 와
 * 「하모닉이 제안을 수락했어요」 가 떴습니다. 알림마다 누구에게 갈 수 있는지를
 * 적어 두고(`who`) 걸러 냅니다 — 운영진 것은 운영진에게만, 예매 관련은
 * 예매한 사람에게만.
 *
 * 가입을 한 번도 안 한 기기에서는 전부 보여 줍니다. 데모로 둘러보는 자리라
 * 비어 있으면 아무것도 설명하지 못하니까요. membership 과 같은 규칙입니다.
 */
const S8Notifications = () => {
  const navigate = useNavigate()
  const { isManager } = useRole()
  const [settings, setSettings] = useState(n.settings)

  // 가입 전이면 데모, 가입했으면 내 상태에 맞는 것만
  const signedUp = getSession() !== null
  const canSee = (who: 'all' | 'manager' | 'ticket') => {
    if (!signedUp) return true
    if (who === 'manager') return isManager
    // 예매 기록을 아직 들고 있지 않습니다 — 없는 걸 있다고 하지 않습니다
    if (who === 'ticket') return false
    return true
  }

  const today = n.today.filter((i) => canSee(i.who))
  const thisWeek = n.thisWeek.filter((i) => canSee(i.who))
  const rows = settings.filter((r) => canSee(r.who))
  const nothing = today.length === 0 && thisWeek.length === 0
  // 「모두 읽음으로」 를 누르면 안 읽음 점을 전부 지웁니다
  const [allRead, setAllRead] = useState(false)

  return (
    <Phone>
      <TopBar
        title="알림"
        right={
          <MoreMenu
            items={[
              { label: '모두 읽음으로', onSelect: () => setAllRead(true) },
              { label: '알림 설정', note: '아래 토글에서 종류별로 끄고 켤 수 있어요.' },
            ]}
          />
        }
      />
      <div className="lui-body">
        <div className="s8">
          <div className="s8__gap-14" />
          {nothing ? (
            <div className="lui-card s8-empty">
              <p className="s8-empty__title">{n.empty.all}</p>
              <p className="s8-empty__body">{n.empty.allBody}</p>
              <Button variant="ghost" onClick={() => navigate(P.home)}>
                공연 둘러보기
              </Button>
            </div>
          ) : (
            <>
          <SectionHeader title="오늘" />
          <div className="lui-card s8__list">
            {today.length === 0 && <p className="s8-empty__line">{n.empty.today}</p>}
            {today.map((item) => (
              <ListRow
                key={item.title}
                avatar={item.initial}
                title={item.title}
                sub={item.sub}
                slot={item.unread && !allRead ? <span className="lui-unread" /> : undefined}
                chevron={!item.unread || allRead}
                onClick={() => item.to && navigate(dest[item.to])}
              />
            ))}
          </div>

          <div className="s8__gap-26" />
          <SectionHeader title="이번 주" />
          <div className="lui-card s8__list">
            {thisWeek.length === 0 && <p className="s8-empty__line">{n.empty.week}</p>}
            {thisWeek.map((item) => (
              <ListRow
                key={item.title}
                avatar={item.initial}
                title={item.title}
                sub={item.sub}
                chevron
                onClick={() => navigate(dest[item.to])}
              />
            ))}
          </div>
            </>
          )}

          <div className="s8__gap-26" />
          {/* 「받을 수 있는지」 와 「무엇을 받을지」 는 다른 이야기라 카드를 나눕니다 */}
          <SectionHeader title="알림 받기" />
          <PushRow />

          <div className="s8__gap-26" />
          <SectionHeader title="무엇을 받을지" />
          <div className="lui-card s8__list">
            {rows.map((row) => (
              <ListRow
                key={row.id}
                title={row.title}
                sub={row.sub}
                slot={
                  <Toggle
                    on={row.on}
                    label={row.title}
                    onChange={(next) =>
                      setSettings((prev) =>
                        prev.map((it) => (it.id === row.id ? { ...it, on: next } : it)),
                      )
                    }
                  />
                }
              />
            ))}
          </div>
        </div>
      </div>
      <TabBar active="noti" />
    </Phone>
  )
}

export default S8Notifications
