import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Phone from '../components/Phone'
import TopBar from '../components/TopBar'
import Button from '../components/Button'
import Icon from '../components/Icon'
import { P } from '../paths'
import { findClubs, clubPlace, type KnownClub } from '../../mocks/auth'
import { rememberClubJoin } from '../auth/clubJoin'
import './S1cClubPick.css'

/**
 * 우리 동아리 찾기 — 가입에서 동아리를 고른 사람이 보는 화면.
 *
 * 입구에서 「운영진이세요, 부원이세요」 를 묻지 않습니다. 사람들은 자기를
 * 그렇게 생각하지 않고 「우리 동아리」 로 생각합니다. 학교와 이름을 받고
 * 나서 갈라집니다 —
 *
 *   이미 있는 동아리  → 부원으로 들어가기 (운영진이 받아 주면 끝)
 *   없는 동아리      → 새로 만들기 (만든 사람이 첫 운영진 신청자)
 *
 * 학교로 먼저 좁히는 이유는 같은 이름이 학교마다 있어서입니다. 「소리」 라는
 * 동아리는 어느 학교에나 하나씩 있습니다.
 */
const S1cClubPick = () => {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const school = params.get('school') ?? ''

  const [query, setQuery] = useState('')
  const matches = useMemo(() => findClubs(school, query), [school, query])
  const typed = query.trim()

  // 적은 이름과 똑같은 동아리가 이미 있으면 「새로 만들기」 를 권하지 않습니다
  const exact = matches.some((c) => c.name.replace(/\s+/g, '') === typed.replace(/\s+/g, ''))

  const joinExisting = (club: KnownClub) => {
    rememberClubJoin({
      kind: 'join',
      clubId: club.id,
      clubName: club.name,
      school: club.school ?? clubPlace(club),
    })
    navigate(P.clubJoinSent)
  }

  const createNew = () => {
    if (!typed) return
    rememberClubJoin({ kind: 'create', clubName: typed, school })
    navigate(P.clubJoinSent)
  }

  return (
    <Phone>
      <TopBar title="우리 동아리" back={P.onboarding('club')} />
      <div className="lui-body">
        <div className="s1c">
          <p className="s1c__lead">
            {school ? (
              <>
                {/* 조사 앞에 공백이 끼지 않게 붙여 씁니다 */}
                <b>{school}</b>의 동아리를 찾습니다.
              </>
            ) : (
              '동아리 이름을 적어 주세요.'
            )}
          </p>

          <input
            className="lui-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="동아리 이름 (예: 멜로딕)"
            maxLength={30}
            autoFocus
          />

          {/* 학교로 좁히면 학교 밖 동아리가 영영 안 나옵니다 — 이름을 적으면
              같이 찾는다는 걸 말해 줍니다. 연합 · 직장인 · 지역 밴드도 있습니다. */}
          {school && (
            <p className="s1c__hint">
              연합 동아리나 직장인 밴드처럼 학교가 없는 곳은 <b>이름을 적으면</b> 같이
              나옵니다.
            </p>
          )}

          <div className="s1c__gap" />

          {matches.length > 0 && (
            <>
              <p className="s1c__label">{typed ? '찾은 동아리' : '이 학교의 동아리'}</p>
              <div className="lui-card s1c__list">
                {matches.map((club) => (
                  <button
                    key={club.id}
                    type="button"
                    className="s1c-row"
                    onClick={() => joinExisting(club)}
                  >
                    <span className="s1c-row__avatar">{club.name.slice(0, 1)}</span>
                    <span className="s1c-row__main">
                      <span className="s1c-row__name">{club.name}</span>
                      <span className="s1c-row__sub">
                        {clubPlace(club)} · 부원 {club.members}명 · {club.since}년 창단
                      </span>
                    </span>
                    <span className="s1c-row__go">부원으로</span>
                    <Icon name="chevron-right" size={16} className="s1c-row__chev" />
                  </button>
                ))}
              </div>
            </>
          )}

          {typed && !exact && (
            <>
              <div className="s1c__gap" />
              <p className="s1c__label">찾는 동아리가 없나요</p>
              <button type="button" className="lui-card s1c-new" onClick={createNew}>
                <span className="s1c-new__title">
                  <b>{typed}</b> 새로 만들기
                </span>
                <span className="s1c-new__sub">
                  {school ? `${school} · ` : ''}만든 사람이 첫 운영진이 됩니다. 확인을 거친 뒤
                  공연을 올릴 수 있어요.
                </span>
              </button>
            </>
          )}

          {!typed && matches.length === 0 && (
            <p className="s1c__empty">
              아직 이 학교에 등록된 동아리가 없습니다.
              <br />
              이름을 적으면 새로 만들 수 있어요.
            </p>
          )}

          <div className="s1c__gap" />
          <p className="s1c__note">
            동아리는 나중에 바꿀 수 있습니다. 지금 모르겠으면 건너뛰고 둘러보셔도 돼요.
          </p>
        </div>
      </div>

      <div className="lui-bottombar">
        <Button variant="ghost" block onClick={() => navigate(P.home)}>
          나중에 할게요
        </Button>
      </div>
    </Phone>
  )
}

export default S1cClubPick
