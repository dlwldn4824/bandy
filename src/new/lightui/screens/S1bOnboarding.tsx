import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import Button from '../components/Button.tsx'
import Icon from '../components/Icon.tsx'
import Sheet from '../components/Sheet.tsx'
import { P } from '../paths.ts'
import { getSession, saveProfile } from '../auth/kakao.ts'
import { makeJoinCode, setMembership } from '../auth/membership.ts'
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
/**
 * 눌러서 고르는 칸.
 *
 * 전에는 그냥 입력칸이었습니다. 치기 전에는 목록이 안 나와서, 학교가
 * 171개나 들어 있어도 화면만 보면 칩 네 개가 전부로 보였습니다. 무엇을
 * 칠 수 있는지 모르는 채로 치라는 꼴이라, 아무도 검색을 못 썼습니다.
 *
 * 그래서 누르면 목록이 통째로 열리는 시트로 바꿉니다. 위에서 좁히고,
 * 눌러서 고르고, 목록에 없으면 적은 그대로 씁니다.
 */
const PickerField = ({
  label,
  value,
  onChange,
  options,
  placeholder,
  sheetTitle,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
  sheetTitle: string
}) => {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const nq = norm(q)
  const matches = nq ? options.filter((o) => norm(o).includes(nq)) : options
  // 적은 것과 똑같은 항목이 목록에 없으면 「그대로 쓰기」 를 내어 줍니다
  const typed = q.trim()
  const exact = matches.some((o) => norm(o) === nq)

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setQ('')
  }

  return (
    <>
      <span className="ob__label">{label}</span>
      <button
        type="button"
        className={`ob-pick${value ? ' ob-pick--filled' : ''}`}
        onClick={() => setOpen(true)}
      >
        <span className="ob-pick__value">{value || placeholder}</span>
        <Icon name="chevron-right" size={17} className="ob-pick__chev" />
      </button>

      <Sheet open={open} title={sheetTitle} onClose={() => setOpen(false)}>
        <input
          className="lui-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름으로 찾기"
          autoComplete="off"
          autoFocus
        />
        <p className="ob-pick__count">
          {nq ? `${matches.length}개` : `전체 ${options.length}개`}
        </p>

        <div className="ob-pick__list">
          {matches.slice(0, 80).map((o) => (
            <button
              key={o}
              type="button"
              className={`ob-pick__row${o === value ? ' ob-pick__row--on' : ''}`}
              onClick={() => pick(o)}
            >
              {o}
            </button>
          ))}

          {matches.length > 80 && (
            <p className="ob-pick__more">
              {matches.length - 80}개 더 있습니다. 이름을 더 적어 좁혀 주세요.
            </p>
          )}

          {typed && !exact && (
            <button type="button" className="ob-pick__row ob-pick__row--new" onClick={() => pick(typed)}>
              목록에 없어요 — <b>{typed}</b> 그대로 쓰기
            </button>
          )}

          {matches.length === 0 && !typed && <p className="ob-pick__more">목록이 비어 있습니다.</p>}
        </div>
      </Sheet>
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
/**
 * 어떤 분인지.
 *
 * 처음에는 모두 대학생이라고 보고 학교·학과를 필수로 받았습니다. 그런데
 * 졸업생도 동아리에 남아 있고, 공연장 쪽은 아예 학생이 아니고, 관객 중에는
 * 직장인이 많습니다. 학교 칸을 비울 수 없어서 아무 학교나 적고 넘어가면
 * 그 데이터는 쓸모가 없어집니다.
 *
 * 그래서 먼저 묻고, 답에 따라 학교를 묻거나 묻지 않습니다.
 */
const WHO = [
  { key: 'student', label: '대학생', needsSchool: true, hint: '재학 중' },
  { key: 'alumni', label: '졸업생', needsSchool: true, hint: '동아리에 남아 있어요' },
  { key: 'worker', label: '직장인', needsSchool: false, hint: '' },
  { key: 'other', label: '그 외', needsSchool: false, hint: '' },
] as const

type WhoKey = (typeof WHO)[number]['key']

/**
 * 적던 것을 잠깐 적어 둡니다.
 *
 * 약관이나 개인정보 처리방침을 보려면 이 화면을 떠나야 하는데, 돌아오면
 * 컴포넌트가 새로 그려져서 닉네임부터 다시 적어야 했습니다. 읽어 보라고
 * 링크를 걸어 놓고 읽으면 벌을 주는 꼴이라, 떠날 때 적어 두고 돌아오면
 * 되살립니다.
 *
 * sessionStorage 라 탭을 닫으면 사라집니다 — 남의 기기에 남길 값이 아닙니다.
 */
const DRAFT_KEY = 'bandy.lightui.onboardingDraft'

interface Draft {
  nickname: string
  who: string | null
  school: string
  department: string
  club: string
  agreed: boolean
}

function readDraft(): Partial<Draft> {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}') as Partial<Draft>
  } catch {
    return {}
  }
}

function writeDraft(d: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d))
  } catch {
    /* 저장이 막히면 예전처럼 사라집니다 — 흐름 자체는 막지 않습니다 */
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* 무시 */
  }
}

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
    extraHint: '공연장 화면이 바로 열립니다. 비는 날을 남들에게 공개하기 전에 밴디가 한 번 확인합니다.',
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
  // 약관을 보러 나갔다 돌아왔을 때 적던 것을 되살립니다
  const draft = readDraft()
  const [nickname, setNickname] = useState(draft.nickname ?? session?.nickname ?? '')
  // 공연장으로 들어온 사람에게는 신분을 묻지 않습니다 — 학생인지가 상관없는 쪽입니다
  const [who, setWho] = useState<WhoKey | null>(
    (draft.who as WhoKey | null | undefined) ?? (side === 'venue' ? 'other' : null),
  )
  const needsSchool = form.school && (WHO.find((w) => w.key === who)?.needsSchool ?? false)
  const [school, setSchool] = useState(draft.school ?? session?.school ?? '')
  const [department, setDepartment] = useState(draft.department ?? session?.department ?? '')
  const [club, setClub] = useState(draft.club ?? '')

  // 「불쾌한 내용을 올리지 않겠다」 에 대한 동의는 이용자 글이 있는 앱이면
  // 받아야 합니다 (Apple 1.2). 약관 안에 묻어 두지 않고 따로 체크를 받습니다.
  const [agreed, setAgreed] = useState(draft.agreed ?? false)

  // 공연장은 학교·학과가 해당 없고, 부원의 참여 코드는 비워 둬도 됩니다
  const ready =
    nickname.trim() &&
    who !== null &&
    (!needsSchool || (school.trim() && department.trim())) &&
    (side === 'venue' ? club.trim() : true) &&
    agreed

  // 적을 때마다 적어 둡니다. 약관을 보러 나갔다 와도 그대로 남습니다.
  useEffect(() => {
    writeDraft({ nickname, who, school, department, club, agreed })
  }, [nickname, who, school, department, club, agreed])

  const submit = () => {
    if (!ready || !session) return navigate(P.home)
    saveProfile({
      ...session,
      nickname: nickname.trim(),
      // 학교를 안 묻는 사람(직장인·그 외·공연장)은 비워 둡니다. 빈 값이
      // 맞는 답이라 적어 두고, 끝냈다는 것은 onboarded 로 따로 남깁니다.
      school: needsSchool ? school : '',
      department: needsSchool ? department : '',
      initial: nickname.trim()[0],
      onboarded: true,
    })
    // 공연장은 여기서 소속이 생깁니다. 동아리처럼 「찾아서 들어가는」 자리가
    // 없고, 적은 그 공연장이 곧 자기 것이라서요. /ui/venue 가 공연장 권한을
    // 물으므로 이게 없으면 등록을 마치고도 자기 화면에 못 들어갑니다.
    //
    // 공개 전 확인은 서버의 몫입니다. 지금은 콘솔만 열어 두고, 비는 날이
    // 남들에게 보이는 것은 확인을 거친 뒤입니다.
    if (side === 'venue') {
      const name = club.trim()
      setMembership({
        kind: 'venue',
        clubId: `venue-${Date.now().toString(36)}`,
        clubName: name,
        role: 'manager',
        code: makeJoinCode(name),
      })
    }

    forgetSide()
    clearDraft()
    // 동아리는 여기서 끝나지 않습니다 — 방금 고른 학교를 들고 「우리 동아리
    // 찾기」 로 넘어갑니다. SIDE_FORM 의 to 는 학교를 모르는 채로 만들어 둔
    // 주소라, 그것만 쓰면 다음 화면이 학교를 못 받습니다.
    navigate(side === 'club' ? P.clubPick(needsSchool ? school : undefined) : form.to)
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

          {side !== 'venue' && (
            <>
              <div className="ob__gap-26" />
              <span className="ob__label">어떤 분이세요?</span>
              <div className="ob-who">
                {WHO.map((w) => (
                  <button
                    key={w.key}
                    type="button"
                    className={`ob-who__opt${w.key === who ? ' ob-who__opt--on' : ''}`}
                    aria-pressed={w.key === who}
                    onClick={() => setWho(w.key)}
                  >
                    <span className="ob-who__label">{w.label}</span>
                    {w.hint && <span className="ob-who__hint">{w.hint}</span>}
                  </button>
                ))}
              </div>
              {who && !needsSchool && form.school && (
                <p className="ob__hint">
                  학교는 묻지 않습니다. 가까운 공연을 찾을 때만 쓰는 값이라, 없으면
                  지도에서 직접 고르시면 돼요.
                </p>
              )}
            </>
          )}

          {/* 공연장은 학교·학과가 해당 없습니다 */}
          {needsSchool && (
            <>
              <div className="ob__gap-26" />
              <PickerField
                label="학교"
                sheetTitle="학교 찾기"
                value={school}
                onChange={setSchool}
                options={onboardingOptions.schools}
                placeholder="학교 이름을 적어 주세요"
              />

              <div className="ob__gap-26" />
              <PickerField
                label="학과"
                sheetTitle="학과 찾기"
                value={department}
                onChange={setDepartment}
                options={onboardingOptions.departments}
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
