import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import ListRow from '../components/ListRow.tsx'
import Button from '../components/Button.tsx'
import Icon from '../components/Icon.tsx'
import { P } from '../paths.ts'
import { useMembership } from '../auth/membership.ts'
import { clubFeed, suggestedClubs, showRun } from '../../mocks/bandyLight.ts'
import './L2Clubs.css'

/**
 * L2 동아리 — 관객이 따라다니는 밴드.
 *
 * 전에는 이 탭이 모집 글과 받은 제안으로 채워져 있었습니다. 그건 운영진이
 * 하는 일이라 마이 > 운영 아래(S25)로 옮겼습니다. 탭이 다섯 칸뿐이라,
 * 관객이면서 부원인 사람이 「어느 탭에서 찾지」 하고 헤맸습니다.
 *
 * 그래서 이 탭은 관객 기준으로 다시 짰습니다 — 찜한 동아리, 그 동아리의
 * 다음 공연, 활동 소식, 추천. 부원·운영진에게는 맨 위에 우리 동아리로
 * 들어가는 줄 하나만 더 둡니다.
 */
const L2Clubs = () => {
  const navigate = useNavigate()
  const { membership, inClub, isManager } = useMembership()

  const following = clubFeed.following

  return (
    <Phone>
      <div className="lui-body">
        <div className="l2">
          <div className="l2__gap-14" />
          <div className="l2__head">
            <h1 className="l2__title">동아리</h1>
            <button
              type="button"
              className="l2__more"
              onClick={() => navigate(P.search)}
              aria-label="동아리 찾기"
            >
              <Icon name="search" size={18} />
            </button>
          </div>

          {/* 동아리에 든 사람에게만 — 관객에게는 운영 자리를 아예 안 그립니다.
              「운영진만 할 수 있어요」 를 띄우는 것보다 낫습니다. 가입 입구에서
              이미 고르고 들어온 사람들이라서요. */}
          {inClub && membership && (
            <>
              <div className="l2__gap-14" />
              <div className="lui-card l2__mine">
                <ListRow
                  avatar={membership.clubName.slice(0, 1)}
                  title={membership.clubName}
                  sub={isManager ? '운영진 · 우리 동아리' : '부원 · 우리 동아리'}
                  chevron
                  onClick={() => navigate(P.club(membership.clubId))}
                />
                <ListRow
                  avatar="공"
                  title="다음 공연"
                  sub={showRun.when}
                  chevron
                  onClick={() => navigate(P.run(showRun.showId))}
                />
                {isManager && (
                  <ListRow
                    avatar="팀"
                    title="함께 설 팀 구하기"
                    sub="모집 글 · 받은 제안 · 보낸 제안"
                    chevron
                    onClick={() => navigate(P.clubOps)}
                  />
                )}
              </div>
            </>
          )}

          <div className="l2__gap-26" />
          <SectionHeader
            title="찜한 동아리"
            aside={following.length > 0 ? String(following.length) : undefined}
          />

          {following.length === 0 ? (
            <div className="lui-card l2-empty">
              <p className="l2-empty__title">{clubFeed.emptyTitle}</p>
              <p className="l2-empty__body">{clubFeed.emptyBody}</p>
              <Button variant="ghost" onClick={() => navigate(P.search)}>
                {clubFeed.emptyCta}
              </Button>
            </div>
          ) : (
            <div className="lui-card l2__group">
              {following.map((club) => (
                <ListRow
                  key={club.id}
                  avatar={club.initial}
                  title={club.name}
                  sub={
                    club.next
                      ? `${club.next.when} · ${club.next.venue}`
                      : `${club.sub} · 예정된 공연 없음`
                  }
                  slot={
                    club.next ? (
                      <span className="lui-pill lui-pill--lg">{club.next.title}</span>
                    ) : undefined
                  }
                  chevron
                  onClick={() => navigate(P.club(club.id))}
                />
              ))}
            </div>
          )}

          <div className="l2__gap-26" />
          <SectionHeader title="소식" />
          <div className="lui-card l2__group">
            {clubFeed.news.map((n) => (
              <ListRow
                key={n.id}
                avatar={n.initial}
                title={n.text}
                sub={`${n.club} · ${n.at}`}
                chevron
                onClick={() =>
                  navigate(n.to === 'show' ? P.show(showRun.showId) : P.club('melodic'))
                }
              />
            ))}
          </div>

          <div className="l2__gap-26" />
          <SectionHeader
            title={clubFeed.suggestTitle}
            aside="더보기"
            onAside={() => navigate(P.search)}
          />
          <p className="l2__note">{clubFeed.suggestNote}</p>
          <div className="lui-card l2__group">
            {suggestedClubs.map((club) => (
              <ListRow
                key={club.name}
                avatar={club.initial}
                title={club.name}
                sub={club.lines.join(' · ')}
                chevron
                onClick={() => navigate(P.club(club.name))}
              />
            ))}
          </div>

          <div className="l2__gap-26" />
        </div>
      </div>
      <TabBar active="club" />
    </Phone>
  )
}

export default L2Clubs
