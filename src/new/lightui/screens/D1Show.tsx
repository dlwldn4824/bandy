import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import ListRow from '../components/ListRow.tsx'
import Button from '../components/Button.tsx'
import Icon from '../components/Icon.tsx'
import DirectionsSheet from '../components/DirectionsSheet.tsx'
import { P } from '../paths.ts'
import { useLikes } from '../likes.ts'
import { useGoBack } from '../useGoBack.ts'
import { showDetailFor, showMissing, mapShows } from '../../mocks/bandyLight.ts'
import { useStage } from '../shows/stage.ts'
import { getMyShow } from '../shows/myShows.ts'
import mapVenue from '../assets/map-venue.svg'
import './D1Show.css'

/**
 * D1 공연 상세 — Figma 183:2
 *
 * 어느 공연을 눌러도 「멜로딕 단독 공연」 이 나왔습니다. 부산 공연을 눌러도
 * 라디오가가가 뜨고 가격도 잔여석도 멜로딕 것이었습니다 — 주소의 id 로
 * 찾습니다.
 *
 * 아래 버튼은 **공연 단계**를 따릅니다. 아직 열지 않은 공연에 「예매하기」 가
 * 있으면 눌러서 입금 안내까지 가 버립니다.
 */
const D1Show = () => {
  const navigate = useNavigate()
  const goBack = useGoBack()
  const { showId = 'glow' } = useParams()
  const { isLiked, toggleLike } = useLikes()
  const [dirs, setDirs] = useState(false)
  /**
   * 우리가 만든 공연도 상세가 있어야 합니다. 예매를 열어 놓고 관객이
   * 눌렀더니 「그 공연을 찾을 수 없어요」 면 연 적이 없는 것과 같습니다.
   * 아직 적은 것이 제목·일시·공연장뿐이라 그만큼만 그립니다.
   */
  const mine = getMyShow(showId)
  const s = mine
    ? {
        id: mine.id,
        hero: mine.poster ?? '',
        badges: ['우리 공연'],
        titleLines: [mine.title, ''] as [string, string],
        host: mine.clubName,
        info: [
          { k: '일시', v: mine.at.replace('T', ' ') },
          { k: '장소', v: mine.venue },
        ],
        lineup: [],
        about: [],
        venue: { name: mine.venue, address: '', lat: 37.5665, lng: 126.978 },
        notice: '아직 자세한 내용을 올리지 않았습니다.',
        price: '가격 미정',
        priceValue: 0,
        remain: '',
        thin: true,
      }
    : showDetailFor(showId)
  const at = mine?.at ?? mapShows.find((show) => show.id === showId)?.at
  const { stage } = useStage(showId, at)

  // 모르는 공연이면 없다고 말합니다 — 남의 공연을 보여 주지 않습니다
  if (!s) {
    return (
      <Phone>
        <TopBar title="공연" />
        <div className="lui-body">
          <div className="d1__body">
            <div className="d1__gap-26" />
            <div className="lui-card d1-missing">
              <p className="d1-missing__title">{showMissing.title}</p>
              <p className="d1-missing__body">{showMissing.body}</p>
              <Button variant="ghost" onClick={() => navigate(P.home)}>
                {showMissing.cta}
              </Button>
            </div>
          </div>
        </div>
        <TabBar active="home" />
      </Phone>
    )
  }

  /**
   * 단계마다 아래 버튼이 할 수 있는 일이 다릅니다.
   * 얇은 상세(지도에만 있는 공연)는 가격도 좌석도 모르니 팔 수 없습니다 —
   * 「예매하기」 를 두면 가격 미정인 채로 입금 안내까지 가 버립니다.
   */
  const BOTTOM = s.thin
    ? { label: '아직 예매를 받지 않아요', on: false }
    : {
    draft: { label: '아직 열지 않았어요', on: false },
    gathering: { label: '함께 설 팀을 모으는 중', on: false },
    selling: { label: '예매하기', on: true },
    closed: { label: '예매가 마감됐어요', on: false },
    today: { label: '오늘 공연이에요', on: true },
    settling: { label: '끝난 공연이에요', on: false },
      }[stage]

  return (
    <Phone>
      <div className="lui-body">
        <div className={`d1__hero${s.hero ? '' : ' d1__hero--none'}`}>
          {s.hero ? <img src={s.hero} alt="" /> : <span className="d1__hero-blank">포스터 없음</span>}
          <button type="button" className="d1__round" onClick={() => goBack()} aria-label="뒤로">
            <Icon name="chevron-left" size={20} />
          </button>
          <div className="d1__hero-right">
            <button
              type="button"
              className={`d1__round${isLiked(showId) ? ' d1__round--on' : ''}`}
              aria-label="찜하기"
              aria-pressed={isLiked(showId)}
              onClick={() => toggleLike(showId)}
            >
              <Icon name="heart" size={18} />
            </button>
            <button
              type="button"
              className="d1__round"
              onClick={() => navigate(P.invite)}
              aria-label="공유하기"
            >
              <Icon name="share" size={18} />
            </button>
          </div>
        </div>

        <div className="d1__body">
          <div className="d1__gap-20" />

          <div className="d1__badges">
            {s.badges.map((b, i) => (
              <span key={b} className={`d1-badge${i === 0 ? ' d1-badge--accent' : ''}`}>
                {b}
              </span>
            ))}
          </div>

          <div className="d1__gap-14" />
          <h1 className="d1__title">
            {s.titleLines[0]}
            {s.titleLines[1] && (
              <>
                <br />
                {s.titleLines[1]}
              </>
            )}
          </h1>

          <div className="d1__gap-14" />
          <p className="d1__host">{s.host}</p>

          <div className="d1__gap-26" />
          <div className="d1__info">
            {s.info.map((row) => (
              <div key={row.k} className="d1__info-row">
                <span className="d1__info-k">{row.k}</span>
                <span className="d1__info-v">{row.v}</span>
              </div>
            ))}
          </div>

          {/* 지도에서 만든 얇은 상세에는 출연 팀도 소개도 없습니다.
              빈 제목만 두면 아직 안 불러온 것처럼 보입니다 */}
          {s.lineup.length > 0 && (
            <>
              <div className="d1__gap-26" />
              <SectionHeader title="출연 팀" aside={`${s.lineup.length}팀`} />
              <div className="lui-card d1__lineup">
                {s.lineup.map((team) => (
                  <ListRow
                    key={team.name}
                    avatar={team.initial}
                    title={team.name}
                    sub={team.sub}
                    chevron
                    onClick={() => navigate(P.club(team.name))}
                  />
                ))}
              </div>
            </>
          )}

          {s.about.length > 0 && (
            <>
              <div className="d1__gap-26" />
              <SectionHeader title="공연 소개" />
              <p className="d1__about">{s.about.join('\n')}</p>
            </>
          )}

          <div className="d1__gap-26" />
          <SectionHeader title="공연장" aside="길찾기" onAside={() => setDirs(true)} />
          <div className="lui-card d1__venue">
            <div className="d1__venue-map">
              <img src={mapVenue} alt="" />
            </div>
            <ListRow
              title={s.venue.name}
              sub={s.venue.address}
              chevron
              onClick={() => setDirs(true)}
            />
          </div>

          <div className="d1__gap-26" />
          <p className="d1__notice">{s.notice}</p>
        </div>
      </div>

      <DirectionsSheet venue={s.venue} open={dirs} onClose={() => setDirs(false)} />

      <div className="lui-bottombar">
        <div className="lui-bottombar__info">
          <span className="lui-bottombar__value">{s.price}</span>
          <span className="lui-bottombar__label">{s.remain}</span>
        </div>
        <Button
          disabled={!BOTTOM.on}
          onClick={() => navigate(stage === 'today' ? P.live(s.id) : P.book(s.id))}
        >
          {BOTTOM.label}
        </Button>
      </div>
    </Phone>
  )
}

export default D1Show
