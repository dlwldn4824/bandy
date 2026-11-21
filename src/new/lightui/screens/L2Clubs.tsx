import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import DarkCard from '../components/DarkCard.tsx'
import Button from '../components/Button.tsx'
import Icon from '../components/Icon.tsx'
import { P } from '../paths.ts'
import { useMembership } from '../auth/membership.ts'
import { clubFeed, showRun } from '../../mocks/bandyLight.ts'
import { clubFacts, myFacts } from '../../mocks/auth.ts'
import { recommendClubs } from '../recommend.ts'
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
  // 「같은 장르 · 3km」 를 목에 적어 두는 대신 사실에서 계산합니다.
  // 근거가 모자라면 이유를 지어내지 않고 「아직 아는 게 적어서」 라고 말합니다.
  const suggestions = useMemo(() => recommendClubs(clubFacts, myFacts), [])

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
              {/* 하나뿐인 「내 것」 이라 유일하게 어두운 덩어리로 둡니다 —
                  아래 블록들과 섞이지 않게. */}
              <DarkCard>
                <button
                  type="button"
                  className="lui-darkcard__hit"
                  onClick={() => navigate(P.club(membership.clubId))}
                >
                  <span className="lui-darkcard__head">
                    <span className="lui-darkcard__avatar">
                      {membership.clubName.slice(0, 1)}
                    </span>
                    <span className="lui-darkcard__main">
                      <span className="lui-darkcard__name">{membership.clubName}</span>
                      <span className="lui-darkcard__sub">
                        {isManager ? '운영진' : '부원'} · 우리 동아리
                      </span>
                    </span>
                    <Icon name="chevron-right" size={18} className="lui-darkcard__chev" />
                  </span>
                </button>

                <span className="lui-darkcard__line" />
                <button
                  type="button"
                  className="lui-darkcard__foot lui-darkcard__hit"
                  // 「다음 공연」 은 부원도 보는 줄입니다. P.run 은 운영진
                  // 전용이라 부원이 누르면 게이트를 만납니다 — B1 을 고치기
                  // 전에는 부원이 아예 없어서 드러나지 않던 자리입니다.
                  onClick={() =>
                    navigate(isManager ? P.run(showRun.showId) : P.show(showRun.showId))
                  }
                >
                  <span className="lui-darkcard__foot-text">
                    <span className="lui-darkcard__strong">다음 공연</span> · {showRun.when}
                  </span>
                  <Icon name="chevron-right" size={18} className="lui-darkcard__chev" />
                </button>

                {isManager && (
                  <>
                    <span className="lui-darkcard__line" />
                    <button
                      type="button"
                      className="lui-darkcard__foot lui-darkcard__hit"
                      onClick={() => navigate(P.clubOps)}
                    >
                      <span className="lui-darkcard__foot-text">
                        <span className="lui-darkcard__strong">함께 설 팀 구하기</span> · 모집 · 제안
                      </span>
                      <Icon name="chevron-right" size={18} className="lui-darkcard__chev" />
                    </button>
                  </>
                )}
              </DarkCard>
            </>
          )}

          <div className="l2__gap-26" />
          {/* 우리 동아리와 찜한 동아리에서 무슨 일이 있었나 — 이 탭에서 제일 자주 볼 것 */}
          <SectionHeader title="소식" aside="우리 · 찜한 동아리" />
          <div className="l2__gap-12" />
          {/* 카드도 아바타도 없이 — 읽는 것이라 글이 앞에 섭니다 */}
          <div className="l2__news">
            {clubFeed.news.map((n) => (
              <button
                key={n.id}
                type="button"
                className="l2-news"
                onClick={() =>
                  navigate(n.to === 'show' ? P.show(showRun.showId) : P.club('melodic'))
                }
              >
                <span className="l2-news__rail" aria-hidden />
                <span className="l2-news__body">
                  <span className="l2-news__text">{n.text}</span>
                  <span className="l2-news__who">
                    <span
                      className={`l2-news__from${n.source === 'mine' ? ' l2-news__from--mine' : ''}`}
                    >
                      {n.source === 'mine' ? '우리 동아리' : '찜한 동아리'}
                    </span>
                    {n.club} · {n.at}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="l2__gap-26" />
          <SectionHeader
            title={clubFeed.suggestTitle}
            aside="더보기"
            onAside={() => navigate(P.search)}
          />
          <p className="l2__note">{clubFeed.suggestNote}</p>
          <div className="l2__gap-12" />
          <div className="l2__sug">
            {suggestions.map(({ club, reasons, sub }) => (
              <button
                key={club.id}
                type="button"
                className="l2-sug"
                onClick={() => navigate(P.club(club.id))}
              >
                <span className="l2-sug__head">
                  <span className="l2-sug__avatar">{club.initial}</span>
                  <span className="l2-sug__who">
                    <span className="l2-sug__name">{club.name}</span>
                    <span className="l2-sug__sub">{sub}</span>
                  </span>
                </span>
                {/* 근거는 한 줄로 이어 붙이지 않고 하나씩 세웁니다 — 그래야 읽힙니다 */}
                <span className="l2-sug__why">
                  {reasons.map((r) => (
                    <span key={r} className="l2-sug__reason">
                      {r}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
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
            /* 홈의 공연 줄과 같은 가로 흐름 — 다음 공연 포스터가 주인공입니다 */
            <div className="l2__fav">
              {following.map((club) => (
                <button
                  key={club.id}
                  type="button"
                  className="l2-fav"
                  onClick={() => navigate(P.club(club.id))}
                >
                  <span className={`l2-fav__poster${club.next ? '' : ' l2-fav__poster--none'}`}>
                    {club.next?.poster ? (
                      <img src={club.next.poster} alt="" />
                    ) : (
                      <span className="l2-fav__soon">{clubFeed.noNext}</span>
                    )}
                    <span className="l2-fav__badge">{club.initial}</span>
                  </span>
                  <span className="l2-fav__name">{club.name}</span>
                  <span className="l2-fav__when">
                    {club.next ? `${club.next.when.split(' ')[0]} · ${club.next.venue}` : club.sub}
                  </span>
                </button>
              ))}
            </div>
          )}


          <div className="l2__gap-26" />
        </div>
      </div>
      <TabBar active="club" />
    </Phone>
  )
}

export default L2Clubs
