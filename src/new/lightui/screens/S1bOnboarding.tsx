import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import Button from '../components/Button.tsx'
import { P } from '../paths.ts'
import { getSession, saveSession } from '../auth/kakao.ts'
import { onboardingOptions } from '../../mocks/auth.ts'
import { forgetSide, readSide } from '../auth/side.ts'
import type { JoinSide } from '../../mocks/auth.ts'
import './S1bOnboarding.css'

/**
 * 온보딩 1스텝 — 최초 로그인 뒤 학교·학과·닉네임을 받습니다.
 *
 * Figma 에 이 프레임은 없습니다. 기존 입력·칩 스타일만 써서 한 화면으로 만들었고,
 * 디자인이 나오면 그대로 맞추면 됩니다.
 */
/** 띄어쓰기·대소문자는 무시하고 견줍니다 — 「서울 과기대」 로 쳐도 찾히게 */
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

/**
 * 검색해서 고르거나, 목록에 없으면 그대로 적는 칸.
 *
 * 학교와 학과를 칩 네댓 개로만 주면 그 밖의 사람은 넣을 자리가 없습니다.
 * 적은 대로 저장되니 목록은 거들 뿐입니다.
 */
const ComboField = ({
  label,
  value,
  onChange,
  options,
  top,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  top: string[]
  placeholder: string
}) => {
  const [open, setOpen] = useState(false)
  const q = norm(value)
  const matches = q
    ? options.filter((o) => norm(o).includes(q)).slice(0, 6)
    : []
  // 적은 것과 똑같은 항목 하나만 남으면 더 보여 줄 게 없습니다
  const showList = open && matches.length > 0 && !(matches.length === 1 && norm(matches[0]) === q)

  return (
    <>
      <span className="ob__label">{label}</span>
      <input
        className="lui-input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        // 목록을 누르는 사이에 닫히지 않게 한 박자 늦춥니다
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        autoComplete="off"
      />

      {showList && (
        <div className="lui-card ob__found">
          {matches.map((o) => (
            <button
              key={o}
              type="button"
              className="ob-found__row"
              onClick={() => {
                onChange(o)
                setOpen(false)
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}

      {!value && (
        <div className="ob__chips">
          {top.map((o) => (
            <button key={o} type="button" className="ob-chip" onClick={() => onChange(o)}>
              {o}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/**
 * 입장마다 받을 것도, 끝나고 갈 곳도 다릅니다.
 *
 * 동아리는 여기서 동아리를 정하지 않습니다 — 닉네임·학교까지만 받고 다음 화면(S24)에서
 * 만들지 코드로 들어갈지 고릅니다. 그래야 「운영진이세요 부원이세요」 를 묻지 않아도 됩니다.
 * 공연장은 학교·학과가 아예 해당이 없어서 공연장 이름과 주소를 대신 받습니다.
 *
 * 한 화면이 세 모습을 하는 게 화면을 셋으로 나누는 것보다 낫습니다 —
 * 공통인 닉네임·동의 부분이 셋으로 복사되지 않습니다.
 */
const SIDE_FORM: Record<
  JoinSide,
  {
    title: string
    lead: string
    /** 학교·학과를 받을지 (공연장은 안 받습니다) */
    school: boolean
    /** 공연장 이름처럼 한 칸 더 받을 때 */
    extraLabel?: string
    extraPlaceholder?: string
    extraHint?: string
    /** 끝나고 갈 곳 */
    to: string
  }
> = {
  audience: {
    title: '어디서 오셨어요?',
    lead: '가까운 공연을 찾고 동아리를 추천할 때만 씁니다.',
    school: true,
    to: P.home,
  },
  club: {
    title: '어디서 오셨어요?',
    lead: '다음 화면에서 우리 동아리를 찾습니다. 없으면 새로 만들 수 있어요.',
    school: true,
    to: P.clubPick(),
  },
  venue: {
    title: '어떤 공연장이세요?',
    lead: '비는 날을 올려 두면 설 팀을 찾아 넣습니다. 대관료 대신 티켓 매출의 일부를 받습니다.',
    school: false,
    extraLabel: '공연장 이름과 주소',
    extraPlaceholder: '예) 라디오가가 · 서울 노원구 …',
    extraHint: '확인 뒤 공연장 화면이 열립니다. 비는 날은 거기서 올립니다.',
    to: P.venue,
  },
}

const S1bOnboarding = () => {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const session = getSession()
  // S0 에서 고른 쪽 — 입장마다 받는 것과 갈 곳이 다릅니다
  const side = readSide(params.get('as')) ?? 'audience'
  const form = SIDE_FORM[side]
  const [nickname, setNickname] = useState(session?.nickname ?? '')
  const [school, setSchool] = useState(session?.school ?? '')
  const [department, setDepartment] = useState(session?.department ?? '')
  const [club, setClub] = useState('')

  // 「불쾌한 내용을 올리지 않겠다」 에 대한 동의는 이용자 글이 있는 앱이면
  // 받아야 합니다 (Apple 1.2). 약관 안에 묻어 두지 않고 따로 체크를 받습니다.
  const [agreed, setAgreed] = useState(false)

  // 공연장은 학교·학과가 해당 없고, 부원의 참여 코드는 비워 둬도 됩니다
  const ready =
    nickname.trim() &&
    (!form.school || (school.trim() && department.trim())) &&
    (side === 'venue' ? club.trim() : true) &&
    agreed

  const submit = () => {
    if (!ready || !session) return navigate(P.home)
    saveSession({
      ...session,
      nickname: nickname.trim(),
      school,
      department,
      initial: nickname.trim()[0],
    })
    forgetSide()
    // 동아리는 여기서 끝나지 않습니다 — 학교를 들고 「우리 동아리 찾기」 로 넘어갑니다.
    // 운영진인지 부원인지는 거기서 갈라집니다.
    navigate(form.to ?? P.clubPick(school))
  }

  return (
    <Phone>
      {/* Figma 는 뒤로가기를 그리지 않았지만, URL 로 바로 들어오면 빠져나갈 길이 없습니다 */}
      <TopBar title="처음이시네요" back={P.join} right={<span className="lui-topbar__side" />} />
      <div className="lui-body">
        <div className="ob">
          <div className="ob__gap-14" />
          <h1 className="ob__title">{form.title}</h1>
          <div className="ob__gap-14" />
          <p className="ob__lead">{form.lead}</p>

          <div className="ob__gap-26" />
          <span className="ob__label">닉네임</span>
          <input
            className="lui-input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="공연장에서 불릴 이름"
            maxLength={12}
          />

          {/* 공연장은 학교·학과가 해당 없습니다 */}
          {form.school && (
            <>
              <div className="ob__gap-26" />
              <ComboField
                label="학교"
                value={school}
                onChange={setSchool}
                options={onboardingOptions.schools}
                top={onboardingOptions.topSchools}
                placeholder="학교 이름을 적어 주세요"
              />

              <div className="ob__gap-26" />
              <ComboField
                label="학과"
                value={department}
                onChange={setDepartment}
                options={onboardingOptions.departments}
                top={onboardingOptions.topDepartments}
                placeholder="학과 이름을 적어 주세요"
              />
            </>
          )}

          {form.extraLabel && (
            <>
              <div className="ob__gap-26" />
              <span className="ob__label">{form.extraLabel}</span>
              <input
                className="lui-input"
                value={club}
                onChange={(e) => setClub(e.target.value)}
                placeholder={form.extraPlaceholder}
                maxLength={60}
              />
              <p className="ob__hint">{form.extraHint}</p>
            </>
          )}

          <div className="ob__gap-26" />
          <p className="ob__notice">목록에 없으면 그대로 적어 주세요. 나중에 마이에서 바꿀 수 있어요.</p>

          <div className="ob__gap-26" />
          <label className="ob-agree">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span className="ob-agree__text">
              <button type="button" onClick={() => navigate(P.legal('terms'))}>
                이용약관
              </button>
              과{' '}
              <button type="button" onClick={() => navigate(P.legal('privacy'))}>
                개인정보 처리방침
              </button>
              에 동의하고, 욕설 · 혐오 표현 · 괴롭힘 같은 불쾌한 내용을 올리지 않겠습니다.
            </span>
          </label>
        </div>
      </div>

      <div className="lui-bottombar lui-bottombar--stack">
        <Button block disabled={!ready} onClick={submit}>
          {side === 'club' ? '다음 — 우리 동아리 찾기' : '시작하기'}
        </Button>
        {/* 다 채우지 않아도 막히지 않게 — 마이에서 나중에 바꿀 수 있습니다 */}
        <button type="button" className="ob__later" onClick={() => navigate(P.home)}>
          나중에 할게요
        </button>
      </div>
    </Phone>
  )
}

export default S1bOnboarding
