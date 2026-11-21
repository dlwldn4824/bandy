import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import ListRow from '../components/ListRow.tsx'
import Icon from '../components/Icon.tsx'
import Logo from '../components/Logo.tsx'
import RadarMap from '../components/RadarMap.tsx'
import CountUp from '../components/CountUp.tsx'
import { P } from '../paths.ts'
import { useLikes } from '../likes.ts'
import { weekShows, nearby } from '../../mocks/bandyLight.ts'
import './L1Home.css'

/** L1 홈 (포스터) — Figma 181:2 */
const L1Home = () => {
  const navigate = useNavigate()
  // 레이더 스윕이 끝나면 아래 줄의 숫자가 올라갑니다
  const [counted, setCounted] = useState(false)
  const { isLiked, toggleLike } = useLikes()

  return (
    <Phone>
      <div className="lui-body">
        <div className="l1">
          <div className="l1__top">
            <Logo className="l1__logo" alt="BANDY" />
            {/* 규칙 3 — 사진 위가 아니라 원형 배경 없이 아이콘만 */}
            <button
              type="button"
              className="l1__bell"
              onClick={() => navigate(P.notifications)}
              aria-label="알림"
            >
              <Icon name="bell" size={18} />
            </button>
          </div>

          <h1 className="l1__heading">
            오늘은 어떤
            <br />
            밴드와 연결할까요?
          </h1>

          {/* 이번 주만 보여 주면 다음 달 공연을 찾을 곳이 없습니다 */}
          <SectionHeader
            title="이번 주 열리는 행사"
            aside="달력으로"
            onAside={() => navigate(P.calendar)}
          />

          <div className="l1__shows">
            {weekShows.map((show) => (
              /* 하트가 카드 버튼 안에 있으면 눌러도 카드가 열립니다 —
                 카드를 div 로 두고 둘을 따로 둡니다 */
              <div key={show.id} className="l1-show">
                <button
                  type="button"
                  className="l1-show__hit"
                  onClick={() => navigate(P.show(show.id))}
                >
                  <span className="l1-show__poster">
                    {show.poster && <img src={show.poster} alt="" />}
                  </span>
                  <span className="l1-show__meta">
                    <span className="lui-pill">{show.genre}</span>
                    <span className="l1-show__name">{show.title}</span>
                    <span className="l1-show__where">
                      {show.venue} · {show.date}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`l1-show__like${isLiked(show.id) ? ' l1-show__like--on' : ''}`}
                  aria-label={`${show.title} 찜하기`}
                  aria-pressed={isLiked(show.id)}
                  onClick={() => toggleLike(show.id)}
                >
                  <Icon name="heart" size={18} />
                </button>
              </div>
            ))}
          </div>

          <div className="l1__gap" />

          <SectionHeader title="내 주변" aside="지도로 보기" onAside={() => navigate(P.map)} />

          <div className="lui-card l1__map">
            <RadarMap className="l1__map-canvas" onDone={() => setCounted(true)} />
            <ListRow
              className="l1__map-row"
              title={
                <>
                  주변 밴드 <CountUp to={nearby.bands} run={counted} />팀 · 공연{' '}
                  <CountUp to={nearby.shows} run={counted} />개
                </>
              }
              sub={nearby.sub}
              chevron
              onClick={() => navigate(P.map)}
            />
          </div>
        </div>
      </div>
      <TabBar active="home" />
    </Phone>
  )
}

export default L1Home
