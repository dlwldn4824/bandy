import { mockKakaoUser, type BandyUser } from '../../mocks/auth.ts'

/**
 * 카카오 로그인.
 *
 * 흐름은 이렇습니다.
 *   1. `signInWithKakao()` → Kakao SDK 의 `Kakao.Auth.authorize()` 가 카카오 동의 화면으로 보냅니다
 *   2. 카카오가 `/ui/auth/kakao?code=…` 로 돌려보냅니다
 *   3. 그 화면이 `completeKakaoSignIn(code)` 로 코드를 우리 서버에 넘깁니다
 *   4. 서버(`/api/auth/kakao`)가 토큰을 받아 프로필만 돌려줍니다 — 액세스 토큰은 브라우저로 오지 않습니다
 *
 * 토큰 요청에는 REST API 키와 클라이언트 시크릿이 필요해서 브라우저만으로는 끝낼 수 없습니다.
 * 그래서 3~4번이 있습니다.
 *
 * `VITE_KAKAO_JS_KEY` 가 없으면 예전처럼 목으로 동작합니다 — 키를 넣기 전에도 화면이 돌아가게.
 */

/** 카카오 JavaScript SDK (2026.11 기준 최신) */
const SDK_SRC = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js'
const STATE_KEY = 'bandy.lightui.kakaoState'

interface KakaoSdk {
  init: (key: string) => void
  isInitialized: () => boolean
  Auth: { authorize: (o: { redirectUri: string; state?: string; scope?: string }) => void }
}
declare global {
  interface Window {
    Kakao?: KakaoSdk
  }
}

export function kakaoJsKey(): string | undefined {
  const key = import.meta.env.VITE_KAKAO_JS_KEY
  return typeof key === 'string' && key.length > 0 ? key : undefined
}

/** 카카오가 돌아올 주소 — 카카오 개발자 콘솔에 이 값 그대로 등록해야 합니다 */
export function kakaoRedirectUri() {
  return `${window.location.origin}/ui/auth/kakao`
}

/**
 * 스크립트가 **차단되면 onload 도 onerror 도 오지 않습니다.**
 *
 * 사내망·광고 차단기·인앱 브라우저에서 그렇습니다. 그러면 약속이 영원히
 * 끝나지 않고 버튼은 「카카오 연결 중…」 인 채로 멈춥니다 — 눌린 것도
 * 아니고 실패한 것도 아닌 상태라 사용자는 계속 누릅니다.
 *
 * 기다리다 포기하는 쪽이 낫습니다. 포기하면 S1Start 가 「이메일로 시작해
 * 보세요」 를 띄웁니다.
 */
const SDK_WAIT_MS = 8000

function loadSdk(): Promise<KakaoSdk> {
  if (window.Kakao) return Promise.resolve(window.Kakao)
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (fn: () => void) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      fn()
    }
    const timer = window.setTimeout(
      () => finish(() => reject(new Error('sdk_timeout'))),
      SDK_WAIT_MS,
    )

    const el = document.createElement('script')
    el.src = SDK_SRC
    el.crossOrigin = 'anonymous'
    el.onload = () =>
      finish(() =>
        window.Kakao ? resolve(window.Kakao) : reject(new Error('sdk_missing')),
      )
    el.onerror = () => finish(() => reject(new Error('sdk_load_failed')))
    document.head.appendChild(el)
  })
}

export type KakaoFailure = 'cancelled' | 'failed'

export class KakaoSignInError extends Error {
  code: KakaoFailure
  constructor(code: KakaoFailure, message: string) {
    super(message)
    this.name = 'KakaoSignInError'
    this.code = code
  }
}

const KEY = 'bandy.lightui.user'

/**
 * MOCK: 성공 말고 다른 길도 한 번은 타 볼 수 있게 열어 둔 스위치.
 * 주소에 `?kakao=cancel` 또는 `?kakao=fail` 을 붙이면 그 경로로 갑니다.
 */
function mockOutcome(): KakaoFailure | 'ok' {
  if (typeof window === 'undefined') return 'ok'
  const v = new URLSearchParams(window.location.search).get('kakao')
  if (v === 'cancel') return 'cancelled'
  if (v === 'fail') return 'failed'
  return 'ok'
}

/** 저장된 로그인 — 없으면 null */
export function getSession(): BandyUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as BandyUser) : null
  } catch {
    return null
  }
}

function write(user: BandyUser) {
  try {
    localStorage.setItem(KEY, JSON.stringify(user))
  } catch {
    /* 저장이 막혀도 이번 세션 동안은 동작합니다 */
  }
}

/**
 * 로그인한 뒤 부릅니다.
 *
 * **같은 사람이 다시 들어온 것이면 적어 둔 것을 덮지 않습니다.** 로그인은
 * 이름과 이메일만 알고 학교·학과는 모릅니다. 그대로 저장하면 이메일로 다시
 * 들어올 때마다 학교와 학과가 지워지고, 온보딩이 처음부터 다시 떴습니다.
 *
 * 다른 사람이면 통째로 갈아 끼웁니다 — 기기를 넘겨받은 사람에게 앞사람의
 * 학교가 남아 있으면 안 됩니다.
 */
export function saveSession(user: BandyUser) {
  const prev = getSession()
  if (!prev || prev.id !== user.id) return write(user)

  write({
    ...prev,
    ...user,
    // 로그인이 모르는 것들 — 빈 값으로 덮지 않습니다
    school: user.school || prev.school,
    department: user.department || prev.department,
    phone: user.phone ?? prev.phone,
    onboarded: user.onboarded ?? prev.onboarded,
  })
}

/**
 * 온보딩에서 적은 것을 그대로 씁니다.
 *
 * `saveSession` 과 달리 빈 값도 그대로 받습니다 — 학생이었다가 직장인으로
 * 고치면 학교가 비어야 하는데, 합치는 쪽은 옛 학교를 되살려 버립니다.
 */
export function saveProfile(user: BandyUser) {
  write(user)
}

export function signOut() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 무시 */
  }
}

/**
 * 「처음이시네요」 를 보여 줘야 하는 사용자인지.
 *
 * 학교·학과가 찼는지로 보면 안 됩니다. 직장인·그 외·공연장에게는 학교를
 * 묻지 않아서 그 칸이 영영 비고, 앱을 다시 열 때마다 온보딩이 처음부터
 * 다시 떴습니다 — 시뮬레이션에서 2,021명(40.4%)이 여기 걸렸습니다.
 */
export function needsOnboarding(user: BandyUser) {
  if (user.onboarded) return false
  // onboarded 가 생기기 전에 끝낸 기기 — 학교·학과가 차 있으면 끝낸 것으로 봅니다
  return !(user.school && user.department)
}

/**
 * 카카오로 로그인합니다.
 *
 * 키가 있으면 카카오 동의 화면으로 **이동**하므로 이 함수는 끝나지 않습니다.
 * 키가 없으면 예전처럼 목 사용자를 돌려줍니다.
 */
export async function signInWithKakao(): Promise<BandyUser> {
  const key = kakaoJsKey()
  if (key) {
    let Kakao: KakaoSdk
    try {
      Kakao = await loadSdk()
    } catch {
      // 차단·시간 초과 — 어느 쪽이든 사용자가 할 수 있는 일은 같습니다
      throw new KakaoSignInError(
        'failed',
        '카카오가 열리지 않아요. 이메일로 시작해 보세요.',
      )
    }
    if (!Kakao.isInitialized()) Kakao.init(key)

    // 돌아왔을 때 우리가 보낸 요청이 맞는지 확인할 값
    const state = Math.random().toString(36).slice(2)
    try {
      sessionStorage.setItem(STATE_KEY, state)
    } catch {
      /* 저장이 막히면 state 검사만 건너뜁니다 */
    }

    Kakao.Auth.authorize({ redirectUri: kakaoRedirectUri(), state })
    // 여기서 페이지가 카카오로 넘어갑니다
    return new Promise<BandyUser>(() => {})
  }

  // MOCK: 키가 없을 때만 — 잠깐 기다렸다가 결과를 돌려줍니다
  await new Promise((r) => setTimeout(r, 600))

  const outcome = mockOutcome()
  if (outcome === 'cancelled') {
    throw new KakaoSignInError('cancelled', '카카오 로그인을 취소했어요.')
  }
  if (outcome === 'failed') {
    throw new KakaoSignInError('failed', '카카오 로그인에 실패했어요. 잠시 뒤 다시 시도해 주세요.')
  }

  // MOCK: 실제로는 카카오 프로필 + Firebase 커스텀 토큰으로 만든 사용자
  const saved = getSession()
  const user = saved ?? { ...mockKakaoUser }
  saveSession(user)
  return user
}

/**
 * 카카오에서 돌아온 뒤 — 인가 코드를 서버에 넘겨 프로필을 받습니다.
 * 성공하면 저장까지 하고 사용자를 돌려줍니다.
 */
export async function completeKakaoSignIn(code: string, state?: string | null): Promise<BandyUser> {
  let expected: string | null = null
  try {
    expected = sessionStorage.getItem(STATE_KEY)
    sessionStorage.removeItem(STATE_KEY)
  } catch {
    /* 저장이 막혀 있었다면 검사를 건너뜁니다 */
  }
  if (expected && state && expected !== state) {
    throw new KakaoSignInError('failed', '로그인 요청이 확인되지 않았어요. 다시 시도해 주세요.')
  }

  let res: Response
  try {
    res = await fetch('/api/auth/kakao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri: kakaoRedirectUri() }),
    })
  } catch {
    throw new KakaoSignInError('failed', '서버에 닿지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    if (data.error === 'kakao_not_configured') {
      throw new KakaoSignInError('failed', '서버에 카카오 키가 아직 없어요.')
    }
    throw new KakaoSignInError('failed', '카카오 로그인에 실패했어요. 잠시 뒤 다시 시도해 주세요.')
  }

  const saved = getSession()
  const user: BandyUser = {
    id: data.user.id,
    provider: 'kakao',
    nickname: data.user.nickname,
    // 학교·학과는 온보딩에서 받습니다. 이미 받아 둔 게 있으면 지키고요.
    school: saved?.school ?? '',
    department: saved?.department ?? '',
    initial: data.user.nickname.slice(0, 1),
    // 서버는 처음부터 사진 주소를 돌려주고 있었는데 여기서 버리고 있었습니다.
    profileImage: data.user.profileImage ?? null,
    role: saved?.role ?? 'member',
  }
  saveSession(user)
  return user
}
