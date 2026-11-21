import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import Steps from '../components/Steps.tsx'
import ListRow from '../components/ListRow.tsx'
import Button from '../components/Button.tsx'
import { P } from '../paths.ts'
import { showForm as f } from '../../mocks/bandyLight.ts'
import { useMembership } from '../auth/membership.ts'
import { useIsDemoClub } from '../clubs/owner.ts'
import { createShow } from '../shows/myShows.ts'
import './S10ShowNew.css'

/**
 * S10 공연 만들기 — Figma 213:2
 *
 * 「다음」 이 `P.show('glow')` 로 갔습니다. 공연을 만들면 **멜로딕 단독
 * 공연 상세**가 열리고, 적은 것은 어디에도 안 남았습니다. 칸에 미리 적혀
 * 있던 「멜로딕 단독 공연 〈겨울의 소리〉」 도 남의 공연 이름입니다.
 *
 * 공연을 실제로 만들고 그 공연의 상태 화면으로 보냅니다 — 만들자마자
 * 파는 게 아니라 **초안**이고, 거기서 갖출 것을 채운 뒤 예매를 엽니다.
 */
const S10ShowNew = () => {
  const navigate = useNavigate()
  const { membership } = useMembership()
  const [venue, setVenue] = useState(f.venueOptions[0].id)
  const fileRef = useRef<HTMLInputElement>(null)
  const [poster, setPoster] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [at, setAt] = useState('')
  // 적어 둔 렉사·하모닉은 멜로딕이 부른 팀입니다 (clubs/owner.ts)
  const demo = useIsDemoClub()
  const ready = title.trim() !== '' && at !== ''

  return (
    <Phone>
      <TopBar title="공연 만들기" />
      <div className="lui-body">
        <div className="s10">
          {/* 이 화면의 단계는 정보 · 티켓 · 확인 입니다 */}
          <Steps current={1} labels={['정보', '티켓', '확인']} />

          {/* 포스터는 미리 보기만 브라우저에서 합니다 — 올리기는 서버가 붙은 뒤에 */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) setPoster(URL.createObjectURL(file))
            }}
          />
          <button
            type="button"
            className={`lui-upload${poster ? ' lui-upload--filled' : ''}`}
            onClick={() => fileRef.current?.click()}
          >
            {poster ? (
              <img className="lui-upload__preview" src={poster} alt="고른 포스터" />
            ) : (
              <>
                <span className="lui-upload__title">{f.upload.title}</span>
                <span className="lui-upload__sub">{f.upload.sub}</span>
              </>
            )}
          </button>

          <div className="s10__gap-14" />
          <span className="s10__label">공연명</span>
          <input
            className="lui-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={f.titlePlaceholder}
            maxLength={40}
          />

          <div className="s10__gap-14" />
          <span className="s10__label">주최 동아리</span>
          {/* 내 동아리입니다 — 고르는 값이 아닙니다 */}
          <p className="s10__fixed">{membership?.clubName ?? '우리 동아리'}</p>

          <div className="s10__gap-14" />
          <span className="s10__label">일시</span>
          {/* 날짜를 글로 받으면 「11.22 (토)」 처럼 요일이 어긋납니다 */}
          <input
            className="lui-input"
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />

          <div className="s10__gap-14" />
          <span className="s10__label">공연장</span>
          <div className="lui-radios">
            {f.venueOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`lui-radio${venue === opt.id ? ' lui-radio--on' : ''}`}
                onClick={() => setVenue(opt.id)}
                aria-pressed={venue === opt.id}
              >
                <span className="lui-radio__dot" />
                <span className="lui-radio__main">
                  <span className="lui-radio__title">{opt.title}</span>
                  <span className="lui-radio__sub">{opt.sub}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="s10__gap-14" />
          <span className="s10__label">함께 서는 팀</span>
          <div className="lui-card s10__lineup">
            {(demo ? f.lineup : []).map((team) => (
              <ListRow
                key={team.name}
                avatar={team.initial}
                title={team.name}
                sub={team.sub}
                slot={
                  <span className={`lui-pill lui-pill--lg${team.pending ? '' : ' lui-pill--outline'}`}>
                    {team.state}
                  </span>
                }
              />
            ))}
            <ListRow
              avatar={f.invite.initial}
              title={f.invite.title}
              sub={f.invite.sub}
              chevron
              onClick={() => navigate(P.recruitNew)}
            />
          </div>

          <div className="s10__gap-26" />
          <p className="s10__notice">{f.notice}</p>
        </div>
      </div>

      <div className="lui-bottombar">
        <Button
          block
          disabled={!ready}
          onClick={() => {
            const made = createShow({
              title: title.trim(),
              at,
              venue: f.venueOptions.find((o) => o.id === venue)?.title ?? '',
              poster: poster ?? undefined,
            })
            navigate(P.showStage(made.id))
          }}
        >
          {ready ? '만들기' : '공연명과 일시를 적어 주세요'}
        </Button>
      </div>
    </Phone>
  )
}

export default S10ShowNew
