import { type BandyUser } from '../../mocks/auth'

/**
 * 이메일 로그인.
 *
 * 카카오 말고 하나가 더 필요한 이유는 둘입니다.
 *  1. 애플 심사자는 카카오 계정이 없습니다. 카카오뿐이면 로그인 화면에서
 *     막혀 「기능이 동작하지 않음」 으로 떨어집니다 (가이드라인 2.1).
 *  2. 소셜 로그인으로 계정을 만들게 하면 같은 수준의 다른 로그인을 하나 더
 *     두라고 요구합니다 (가이드라인 4.8).
 *
 * 코드는 **서버가 만들고 서버가 맞춰 봅니다** (`/api/auth/email/*`).
 * 브라우저가 코드를 쥐고 있으면 아는 척만 하면 누구나 들어올 수 있습니다.
 *
 * 서버가 없을 때(로컬에서 API 를 안 띄웠을 때)는 예전처럼 흉내만 냅니다 —
 * 화면 흐름은 끊기지 않아야 하니까요.
 */

export class EmailSignInError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

/** 서버가 없을 때만 쓰는 자리 */
const FALLBACK_KEY = 'bandy.lightui.emailCode'

interface SendResult {
  /** 메일이 실제로 갔는지. false 면 화면이 코드를 보여 줘야 합니다 */
  delivered: boolean
  /** 메일을 못 보낼 때만 옵니다 */
  code?: string
}

const MESSAGES: Record<string, string> = {
  invalid_email: '이메일 주소를 다시 확인해 주세요.',
  too_many_requests: '요청이 너무 잦습니다. 잠시 뒤에 다시 해 주세요.',
  send_failed: '메일을 보내지 못했어요. 잠시 뒤에 다시 해 주세요.',
  no_pending_code: '코드를 먼저 받아 주세요.',
  expired: '코드가 만료됐어요. 다시 받아 주세요.',
  too_many_attempts: '여러 번 틀렸습니다. 코드를 다시 받아 주세요.',
  wrong_code: '코드가 맞지 않아요.',
  invalid_input: '6자리 숫자를 넣어 주세요.',
}

async function callApi(path: string, body: unknown) {
  const res = await fetch(`/api/auth/email/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  // API 가 아예 없으면 SPA 폴백이 HTML 을 돌려줍니다 — JSON 파싱이 터집니다
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(text)
  } catch {
    throw new NoServerError()
  }
  return { ok: res.ok, status: res.status, data }
}

class NoServerError extends Error {}

/** 서버 없이 돌 때 — 브라우저가 코드를 만들고 들고 있습니다 */
function fallbackSend(email: string): SendResult {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  try {
    sessionStorage.setItem(FALLBACK_KEY, JSON.stringify({ email, code, at: Date.now() }))
  } catch {
    /* 저장이 막혀도 화면이 코드를 보여 주므로 흐름은 이어집니다 */
  }
  return { delivered: false, code }
}

function fallbackVerify(email: string, code: string) {
  let saved: { email?: string; code?: string; at?: number } = {}
  try {
    saved = JSON.parse(sessionStorage.getItem(FALLBACK_KEY) || '{}')
  } catch {
    /* 무시 */
  }
  const fresh = Date.now() - (saved.at ?? 0) < 10 * 60 * 1000
  if (!fresh || saved.email !== email) throw new EmailSignInError(MESSAGES.expired)
  if (saved.code !== code) throw new EmailSignInError(MESSAGES.wrong_code)
  try {
    sessionStorage.removeItem(FALLBACK_KEY)
  } catch {
    /* 무시 */
  }
}

export async function sendEmailCode(email: string): Promise<SendResult> {
  const addr = email.trim().toLowerCase()
  if (!isEmail(addr)) throw new EmailSignInError(MESSAGES.invalid_email)

  try {
    const { ok, data } = await callApi('send', { email: addr })
    if (!ok) {
      const key = String(data.error ?? '')
      if (key === 'server_not_configured') return fallbackSend(addr)
      if (key === 'cooldown') {
        const sec = Number(data.retryAfterSec ?? 60)
        throw new EmailSignInError(`${sec}초 뒤에 다시 받을 수 있어요.`)
      }
      throw new EmailSignInError(MESSAGES[key] ?? '코드를 보내지 못했어요.')
    }
    return {
      delivered: Boolean(data.delivered),
      code: typeof data.devCode === 'string' ? data.devCode : undefined,
    }
  } catch (e) {
    if (e instanceof NoServerError) return fallbackSend(addr)
    throw e
  }
}

export async function verifyEmailCode(email: string, code: string): Promise<BandyUser> {
  const addr = email.trim().toLowerCase()
  const entered = code.trim()
  if (!/^\d{6}$/.test(entered)) throw new EmailSignInError(MESSAGES.invalid_input)

  try {
    const { ok, data } = await callApi('verify', { email: addr, code: entered })
    if (!ok) {
      const key = String(data.error ?? '')
      if (key === 'server_not_configured') {
        fallbackVerify(addr, entered)
      } else {
        throw new EmailSignInError(MESSAGES[key] ?? '확인하지 못했어요.')
      }
    }
  } catch (e) {
    if (e instanceof NoServerError) fallbackVerify(addr, entered)
    else throw e
  }

  /*
   * 이름·학교는 다음 단계(온보딩)에서 받습니다.
   *
   * 전에는 `{ ...mockKakaoUser, … }` 로 만들었습니다. 그러면 처음 들어온
   * 사람이 **이지우의 머리글자(「이」)와 운영진 권한**을 그대로 물려받습니다.
   * 아바타에 남의 글자가 뜨고, 온보딩을 「나중에 할게요」 로 건너뛰면 그대로
   * 남습니다. 남의 것을 내 것처럼 보여 주지 않습니다.
   */
  return {
    id: `email:${addr}`,
    provider: 'email',
    email: addr,
    nickname: '',
    school: '',
    department: '',
    initial: '',
    role: 'member',
  }
}
