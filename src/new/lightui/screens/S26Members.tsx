import { useState } from 'react'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import ListRow from '../components/ListRow.tsx'
import Button from '../components/Button.tsx'
import Sheet from '../components/Sheet.tsx'
import { useMembers } from '../auth/members.ts'
import { useMembership } from '../auth/membership.ts'
import { membersCopy as t, type ClubMember } from '../../mocks/bandyLight.ts'
import './S26Members.css'

/**
 * S26 부원 — 운영진 권한을 주고 거두는 자리.
 *
 * 톡켓은 「스토어 관리자 등록」 에서 사람을 더해 권한을 줍니다. 대학 동아리는
 * 집행부가 해마다 바뀌는 게 다릅니다. 그래서 더하기만 있으면 안 되고 **넘기기**
 * 가 있어야 합니다 — 졸업하는 사람이 다음 사람에게 넘기고 빠지는 길.
 *
 * 규칙 하나만 지킵니다. 운영진은 0명이 될 수 없습니다. 마지막 한 명을 내리는
 * 길은 막고, 나가려는 사람에게는 넘길 사람을 먼저 고르게 합니다(S14).
 */
const S26Members = () => {
  const { members, managers, alone, promote, demote } = useMembers()
  const { membership, setMembership } = useMembership()
  /** 확인 시트에 올려 둔 사람. 올릴 건지 내릴 건지도 같이 */
  const [ask, setAsk] = useState<{ m: ClubMember; to: 'manager' | 'member' } | null>(null)

  const mates = members.filter((m) => m.role === 'member')
  const lastOne = managers.length <= 1

  const row = (m: ClubMember) => {
    const isManager = m.role === 'manager'
    // 마지막 운영진은 내릴 수 없습니다 — 버튼을 두고 막는 대신 까닭을 적습니다
    const blocked = isManager && lastOne
    return (
      <ListRow
        key={m.id}
        avatar={m.initial}
        title={
          <>
            {m.name}
            {m.me && <span className="s26__me">나</span>}
          </>
        }
        sub={`${m.sub} · ${m.joined}`}
        slot={
          blocked ? (
            <span className="s26__locked">{t.lastManager}</span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="s26__act"
              onClick={() => setAsk({ m, to: isManager ? 'member' : 'manager' })}
            >
              {isManager ? (m.me ? '부원으로 돌아가기' : t.demote) : t.promote}
            </Button>
          )
        }
      />
    )
  }

  return (
    <Phone>
      <TopBar title={t.title} />
      <div className="lui-body">
        <div className="s26">
          <div className="s26__gap-14" />

          {/* 운영진이 한 명이면 그 사람이 사라질 때 동아리가 잠깁니다.
              겁주려는 게 아니라 졸업 시즌마다 실제로 일어나는 일입니다 */}
          {alone && (
            <>
              <div className="lui-card s26-alone">
                <p className="s26-alone__title">{t.aloneTitle}</p>
                <p className="s26-alone__body">{t.aloneBody}</p>
              </div>
              <div className="s26__gap-26" />
            </>
          )}

          <SectionHeader title="운영진" aside={`${managers.length}명`} />
          <div className="lui-card s26__group">{managers.map(row)}</div>

          <div className="s26__gap-26" />
          <SectionHeader title="부원" aside={`${mates.length}명`} />
          {mates.length === 0 ? (
            <div className="lui-card s26-empty">
              <p className="s26-empty__body">
                아직 부원이 없습니다. 마이 &gt; 내 동아리의 참여 코드를 동아리 단톡에 올려 주세요.
              </p>
            </div>
          ) : (
            <div className="lui-card s26__group">{mates.map(row)}</div>
          )}

          <div className="s26__gap-22" />
          <p className="s26__note">{t.note}</p>
        </div>
      </div>

      {/* 돈이 오가는 권한이라 한 번 묻습니다 — 무엇이 열리고 닫히는지까지 적습니다 */}
      <Sheet
        open={ask !== null}
        title={
          ask ? (ask.to === 'manager' ? t.promoteAsk(ask.m.name) : t.demoteAsk(ask.m.name)) : ''
        }
        onClose={() => setAsk(null)}
      >
        <p className="lui-menu__note">
          {ask?.to === 'manager' ? t.promoteBody : t.demoteBody}
        </p>
        <div className="s26__ask">
          <Button variant="ghost" onClick={() => setAsk(null)}>
            그대로 두기
          </Button>
          <Button
            /* 규칙 7 — 내리는 쪽만 빨강. 올리는 건 되돌릴 수 있습니다 */
            variant={ask?.to === 'manager' ? 'primary' : 'danger'}
            onClick={() => {
              if (!ask) return
              if (ask.to === 'manager') promote(ask.m.id)
              else {
                demote(ask.m.id)
                // 내가 내려왔으면 이 화면도 닫혀야 합니다 — 운영 권한은 하나의 값입니다
                if (ask.m.me && membership) setMembership({ ...membership, role: 'member' })
              }
              setAsk(null)
            }}
          >
            {ask?.to === 'manager' ? '올리기' : '내리기'}
          </Button>
        </div>
      </Sheet>
      <TabBar active="club" />
    </Phone>
  )
}

export default S26Members
