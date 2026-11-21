import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import ListRow from '../components/ListRow.tsx'
import Button from '../components/Button.tsx'
import Icon from '../components/Icon.tsx'
import MoreMenu from '../components/MoreMenu.tsx'
import { P } from '../paths.ts'
import { useMembers } from '../auth/members.ts'
import { useJoinInbox } from '../auth/joinInbox.ts'
import { useMembership } from '../auth/membership.ts'
import { freshClub, useIsDemoClub } from '../clubs/owner.ts'
import { useMyShows } from '../shows/myShows.ts'
import { showWhen } from '../calendar.ts'
import { STAGE, useStages } from '../shows/stage.ts'
import { clubConsole as c } from '../../mocks/bandyLight.ts'
import './S18Console.css'

/**
 * S18 공연 관리 — 운영진의 출발점.
 *
 * 입금 관리·입장 관리·정산 화면은 전부터 있었는데 서로의 ⋯ 메뉴로만 이어져 있어서,
 * 주소를 직접 치지 않으면 들어갈 길이 없었습니다. 이 화면이 그 입구입니다.
 * 마이 > 내 동아리와 동아리 상세의 ⋯ 에서 들어옵니다.
 */

const MenuRow = ({
  title,
  value,
  onClick,
}: {
  title: string
  value?: string
  onClick: () => void
}) => (
  <button type="button" className="s18-menu-row" onClick={onClick}>
    <span className="s18-menu-row__title">{title}</span>
    {value && <span className="s18-menu-row__value">{value}</span>}
    <Icon name="chevron-right" size={18} className="s18-menu-row__chev" />
  </button>
)

const TO: Record<(typeof c.menu)[number]['key'], string> = {
  joins: P.joinRequests,
  members: P.clubMembers,
  teams: P.clubOps,
  // 「공연 당일」 은 다가오는 첫 공연을 엽니다. 전에는 인자가 없어
  // 기본값(멜로딕 glow)으로 갔습니다 — 다른 동아리도 거기로 갔습니다.
  run: P.run(c.upcoming[0]?.id ?? ''),
  deposits: P.deposits,
  entry: P.entry,
  settlement: P.settlement,
}

const S18Console = () => {
  const navigate = useNavigate()
  // 부원 수는 세어서 적습니다 — 목에 박아 두면 올리고 내려도 그대로입니다
  const { members, managers } = useMembers()
  const { pending } = useJoinInbox()
  // 공연이 지금 어디쯤인지 — 「입금 35/42」 만 있으면 아직 안 연 공연도 같아 보입니다
  const stageOf = useStages()
  /**
   * 머리에 쓰는 동아리는 **내 동아리**입니다 (M7).
   * 목에 「멜로딕 · 광운대」 가 박혀 있어서, 다른 동아리 운영진으로 들어와도
   * 멜로딕 운영 화면처럼 보였습니다. 아래 공연 목록은 아직 목이라 멜로딕
   * 것이지만, 적어도 이름이 거짓말을 하지는 않게 둡니다.
   */
  const { membership } = useMembership()
  /**
   * 적어 둔 공연·입금은 멜로딕 것입니다. 다른 동아리로 들어온 사람에게
   * 남의 42건을 보여 주느니 빈 화면이 낫습니다 — 그게 실제 모습입니다.
   */
  const demo = useIsDemoClub()
  /** 우리가 만든 공연이 먼저입니다 — 방금 만들었는데 안 보이면 안 만들어진 것입니다 */
  const made = useMyShows().map((show) => ({
    id: show.id,
    thumb: show.poster,
    title: show.title,
    when: `${showWhen(show.at)} · ${show.venue}`,
    at: show.at,
    paid: 0,
    total: 0,
    urgent: false,
  }))
  const upcoming = [...made, ...(demo ? c.upcoming : [])]
  const past = demo ? c.past : []

  return (
    <Phone>
      <TopBar
        title="공연 관리"
        right={
          <MoreMenu
            items={[
              { label: '공연 만들기', to: P.showNew },
              { label: '모집 글 쓰기', sub: '함께 설 팀 구하기', to: P.recruitNew },
            ]}
          />
        }
      />
      <div className="lui-body">
        <div className="s18">
          <p className="s18__club">{membership?.clubName ?? c.club.name}</p>
          <div className="s18__gap-6" />
          <p className="s18__line">
            {/* 셉니다 — 방금 만든 공연이 있는데 「없어요」 라고 하면 안 만들어진 줄 압니다 */}
            {demo
              ? c.summaryLine
              : upcoming.length === 0
                ? freshClub.shows
                : `다가오는 공연 ${upcoming.length}개`}
          </p>

          <div className="s18__gap-22" />
          <SectionHeader title="다가오는 공연" aside={String(upcoming.length)} />
          <div className="lui-card s18__group">
            {upcoming.length === 0 && (
              <div className="s18-empty">
                <p className="s18-empty__title">{freshClub.shows}</p>
                <p className="s18-empty__body">{freshClub.showsBody}</p>
              </div>
            )}
            {upcoming.map((show) => (
              <ListRow
                key={show.id}
                /* 포스터를 아직 안 올린 공연 — 남의 포스터를 빌려 쓰지 않습니다 */
                avatar={show.thumb ? <img src={show.thumb} alt="" /> : '공연'}
                title={show.title}
                sub={`${STAGE[stageOf(show)].label} · ${show.when}`}
                slot={
                  /* 아직 안 판 공연에 「입금 0/0」 은 셀 것이 없다는 뜻이 아닙니다 */
                  show.total > 0 ? (
                    /* 규칙 7 — 미입금이 남은 공연만 빨강 */
                    <span className={`lui-pill lui-pill--lg${show.urgent ? '' : ' lui-pill--outline'}`}>
                      입금 {show.paid}/{show.total}
                    </span>
                  ) : undefined
                }
                chevron
                onClick={() => navigate(P.showStage(show.id))}
              />
            ))}
          </div>

          <div className="s18__gap-26" />
          <SectionHeader title="끝난 공연" aside={String(past.length)} />
          <div className="lui-card s18__group">
            {past.length === 0 && <p className="s18-empty__line">{freshClub.past}</p>}
            {past.map((show) => (
              <ListRow
                key={show.id}
                /* 포스터를 아직 안 올린 공연 — 남의 포스터를 빌려 쓰지 않습니다 */
                avatar={show.thumb ? <img src={show.thumb} alt="" /> : '공연'}
                title={show.title}
                sub={show.when}
                slot={<span className="lui-pill lui-pill--lg lui-pill--outline">{show.state}</span>}
                chevron
                onClick={() => navigate(P.showStage(show.id))}
              />
            ))}
          </div>

          <div className="s18__gap-26" />
          <SectionHeader title="관리" />
          <div className="lui-card s18__menu">
            {c.menu.map((row) => (
              <MenuRow
                key={row.key}
                title={row.title}
                value={
                  row.key === 'members'
                    ? `${members.length}명 · 운영진 ${managers.length}명`
                    : row.key === 'joins'
                      ? pending.length > 0
                        ? `${pending.length}명 기다림`
                        : '없음'
                      : demo
                        ? row.value
                        : ''
                }
                onClick={() => navigate(TO[row.key])}
              />
            ))}
          </div>

          <div className="s18__gap-22" />
          <p className="s18__note">{c.note}</p>
        </div>
      </div>

      {/* 규칙 1 — 이 화면의 기본 버튼은 「공연 만들기」 하나 */}
      <div className="lui-bottombar">
        <Button block onClick={() => navigate(P.showNew)}>
          공연 만들기
        </Button>
      </div>
      {/* 운영 화면의 집은 마이 > 운영입니다 — 들어온 길과 켜진 탭이 같아야 합니다 */}
      <TabBar active="my" />
    </Phone>
  )
}

export default S18Console
