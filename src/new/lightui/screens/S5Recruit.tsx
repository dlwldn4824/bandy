import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import Stepper from '../components/Stepper.tsx'
import SummaryBox from '../components/SummaryBox.tsx'
import Button from '../components/Button.tsx'
import { P } from '../paths.ts'
import { recruitForm as f } from '../../mocks/bandyLight.ts'
import './S5Recruit.css'

const man = (n: number) => `${(n / 10000).toLocaleString('ko-KR')}만 원`

/**
 * 적다 만 모집 글. 「임시 저장」 이 눌러도 아무 일 없는 버튼이었습니다 —
 * 공연장과 팀 수와 소개까지 적다가 나가면 전부 날아갔습니다.
 */
const DRAFT_KEY = 'bandy.lightui.recruitDraft'

interface Draft {
  title: string
  date: string
  venue: string
  teams: number
  about: string
}

function readDraft(): Partial<Draft> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Partial<Draft>) : {}
  } catch {
    return {}
  }
}

/** S5 모집 글 쓰기 — Figma 208:2 */
const S5Recruit = () => {
  const navigate = useNavigate()
  const draft = readDraft()
  const [title, setTitle] = useState(draft.title ?? f.title)
  const [date, setDate] = useState(draft.date ?? '')
  const [venue, setVenue] = useState(draft.venue ?? f.venueOptions[0].id)
  const [teams, setTeams] = useState(draft.teams ?? f.teams.initial)
  const [about, setAbout] = useState(draft.about ?? '')
  const [saved, setSaved] = useState(false)

  const needMore = Math.max(teams - f.teams.joined, 0)

  const save = () => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title, date, venue, teams, about }))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } catch {
      /* 저장이 막힌 기기에서는 조용히 넘어갑니다 — 적던 것은 화면에 그대로 있습니다 */
    }
  }

  return (
    <Phone>
      <TopBar title="모집 글 쓰기" />
      <div className="lui-body">
        <div className="s5">
          <div className="s5__gap-14" />

          <span className="s5__label">제목</span>
          <input
            className="lui-input"
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
          />

          <div className="s5__gap-14" />
          <span className="s5__label">공연 예정일</span>
          <input
            className="lui-input"
            value={date}
            onChange={(ev) => setDate(ev.target.value)}
            placeholder={f.datePlaceholder}
          />

          <div className="s5__gap-14" />
          <span className="s5__label">공연장</span>
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

          <div className="s5__gap-14" />
          <span className="s5__label">필요한 팀 수</span>
          <div className="lui-card s5__teams">
            <div className="s5__teams-row">
              <div className="s5__teams-main">
                <span className="s5__teams-title">{f.teams.title}</span>
                <span className="s5__teams-sub">
                  현재 {f.teams.joined}팀 · {needMore}팀 더 필요
                </span>
              </div>
              <Stepper value={teams} min={f.teams.joined} max={8} onChange={setTeams} label="팀" />
            </div>
          </div>

          <div className="s5__gap-14" />
          <span className="s5__label">팀당 비용</span>
          <SummaryBox
            items={[
              { k: '밴디 참가비', v: `팀당 ${man(f.feePerTeam)}` },
              { k: '대관료', v: '0원' },
              {
                k: '예상 합계',
                v: `${teams}팀 × ${man(f.feePerTeam)} = ${man(teams * f.feePerTeam)}`,
                accent: true,
              },
            ]}
          />

          <div className="s5__gap-14" />
          <span className="s5__label">소개</span>
          <textarea
            className="lui-input"
            value={about}
            onChange={(ev) => setAbout(ev.target.value)}
            placeholder={f.aboutPlaceholder}
          />

          <div className="s5__gap-26" />
          <p className="s5__notice">{f.notice}</p>
        </div>
      </div>

      <div className="lui-bottombar s5__bottom">
        {/* 규칙 1 — 기본 버튼은 「올리기」 하나 */}
        <Button variant="ghost" onClick={save}>
          {saved ? '저장했어요' : '임시 저장'}
        </Button>
        <Button
          onClick={() => {
            try {
              sessionStorage.removeItem(DRAFT_KEY)
            } catch {
              /* 무시 */
            }
            navigate(P.clubs)
          }}
        >
          올리기
        </Button>
      </div>
    </Phone>
  )
}

export default S5Recruit
