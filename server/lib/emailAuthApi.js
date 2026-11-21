import crypto from 'node:crypto'
import nodemailer from 'nodemailer'
import { getAdminDb } from './firebaseAdmin.js'
import { getClientIp, checkRateLimit, recordRateLimitFailure, resetRateLimit } from './rateLimit.js'

/**
 * 이메일 로그인 — 인증 코드 보내기 · 맞춰 보기.
 *
 * 예매 안내 메일(sendEmailApi)은 관리자 토큰이 있어야 쓰는데, 가입 인증은
 * 로그인 전에 불러야 해서 따로 둡니다. 로그인 없이 열려 있는 입구라
 * 막아야 할 게 셋입니다.
 *
 *  1. **코드를 그대로 저장하지 않습니다.** 해시만 둡니다. DB 를 들여다봐도
 *     남의 코드로 들어갈 수 없게.
 *  2. **보내는 횟수를 제한합니다.** 같은 주소로 1분에 한 번, 같은 IP 에서
 *     한 시간에 열 번. 안 막으면 남의 메일함에 코드를 퍼부을 수 있습니다.
 *  3. **맞춰 보는 횟수도 제한합니다.** 다섯 번 틀리면 그 코드는 버립니다.
 *     여섯 자리는 100만 가지뿐이라 무제한이면 금방 뚫립니다.
 *
 * 코드는 응답으로 돌려주지 않습니다 — 메일을 받은 사람만 알아야 합니다.
 * 다만 메일 설정이 없으면 화면 흐름이 막히므로, 그때만 돌려줍니다.
 */

const COLLECTION = 'emailAuthCodes'
const CODE_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 60 * 1000

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const mailConfigured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)

function hashCode(email, code) {
  // 주소를 같이 넣어, 다른 주소의 같은 코드로는 맞지 않게 합니다
  return crypto.createHash('sha256').update(`${email}:${code}`).digest('hex')
}

function newCode() {
  // Math.random 은 예측 가능합니다. 인증 코드에는 쓰면 안 됩니다.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

/** 주소를 문서 id 로 — 그대로 쓰면 점·슬래시가 경로가 됩니다 */
const docIdFor = (email) => crypto.createHash('sha256').update(email).digest('hex').slice(0, 40)

function transporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  })
}

function mailBody(code) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;color:#17181c">
  <p style="margin:0 0 6px;font-size:13px;color:#8a8f98">BANDY · 밴디</p>
  <h1 style="margin:0 0 20px;font-size:22px;letter-spacing:-0.5px">인증 코드</h1>
  <p style="margin:0 0 18px;font-size:14px;line-height:1.8;color:#5c616b">
    아래 여섯 자리를 밴디 화면에 넣어 주세요.
  </p>
  <p style="margin:0 0 18px;padding:16px;background:#f5f5f6;border-radius:14px;
            font-size:30px;font-weight:800;letter-spacing:8px;text-align:center">${code}</p>
  <p style="margin:0;font-size:12.5px;line-height:1.75;color:#8a8f98">
    10분 안에 넣어야 합니다. 요청한 적이 없다면 이 메일은 그냥 버리셔도 됩니다 —
    누군가 주소를 잘못 적었을 뿐이고, 이 메일만으로는 아무 일도 일어나지 않습니다.
  </p>
</div>`
}

async function sendCode(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, error: 'invalid_email' })
  }

  const ip = getClientIp(req)
  const ipGate = await checkRateLimit('emailAuthSendIp', ip, {
    maxFailures: 10,
    windowMs: 60 * 60 * 1000,
  })
  if (!ipGate.allowed) {
    return res.status(429).json({ success: false, error: 'too_many_requests' })
  }

  let db
  try {
    db = getAdminDb()
  } catch {
    return res.status(503).json({ success: false, error: 'server_not_configured' })
  }

  const ref = db.collection(COLLECTION).doc(docIdFor(email))
  const now = Date.now()

  const existing = await ref.get()
  if (existing.exists) {
    const sentAt = existing.data()?.sentAt ?? 0
    if (now - sentAt < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - sentAt)) / 1000)
      return res.status(429).json({ success: false, error: 'cooldown', retryAfterSec: waitSec })
    }
  }

  const code = newCode()
  await ref.set({
    email,
    codeHash: hashCode(email, code),
    sentAt: now,
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
  })

  // 메일 설정이 없으면 보내지 못합니다. 화면이 막히지 않게 코드를 돌려주되,
  // 설정이 없다는 사실을 같이 알려 화면이 「아직 메일이 안 간다」 고 말할 수 있게 합니다.
  if (!mailConfigured()) {
    await recordRateLimitFailure('emailAuthSendIp', ip, { windowMs: 60 * 60 * 1000 })
    return res.status(200).json({ success: true, delivered: false, devCode: code })
  }

  try {
    await transporter().sendMail({
      from: `BANDY 밴디 <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `[밴디] 인증 코드 ${code}`,
      html: mailBody(code),
      text: `밴디 인증 코드: ${code}\n10분 안에 넣어 주세요.`,
    })
  } catch {
    return res.status(502).json({ success: false, error: 'send_failed' })
  }

  await recordRateLimitFailure('emailAuthSendIp', ip, { windowMs: 60 * 60 * 1000 })
  return res.status(200).json({ success: true, delivered: true })
}

async function verifyCode(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const code = String(req.body?.code || '').trim()
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, error: 'invalid_input' })
  }

  let db
  try {
    db = getAdminDb()
  } catch {
    return res.status(503).json({ success: false, error: 'server_not_configured' })
  }

  const ref = db.collection(COLLECTION).doc(docIdFor(email))
  const snap = await ref.get()
  if (!snap.exists) {
    return res.status(400).json({ success: false, error: 'no_pending_code' })
  }

  const data = snap.data() || {}
  if (Date.now() > (data.expiresAt ?? 0)) {
    await ref.delete()
    return res.status(400).json({ success: false, error: 'expired' })
  }
  if ((data.attempts ?? 0) >= MAX_ATTEMPTS) {
    await ref.delete()
    return res.status(429).json({ success: false, error: 'too_many_attempts' })
  }

  // 길이가 같은 두 해시를 시간 일정하게 견줍니다 — 글자별로 비교하면
  // 걸린 시간으로 몇 자리까지 맞았는지가 새어 나갑니다.
  const given = Buffer.from(hashCode(email, code), 'hex')
  const want = Buffer.from(String(data.codeHash || ''), 'hex')
  const ok = given.length === want.length && crypto.timingSafeEqual(given, want)

  if (!ok) {
    await ref.update({ attempts: (data.attempts ?? 0) + 1 })
    return res.status(400).json({ success: false, error: 'wrong_code' })
  }

  // 한 번 쓴 코드는 바로 버립니다
  await ref.delete()
  await resetRateLimit('emailAuthSendIp', getClientIp(req))

  return res.status(200).json({ success: true, email })
}

export async function handleEmailAuthRequest(req, res, action) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'method_not_allowed' })
  }
  if (action === 'send') return sendCode(req, res)
  if (action === 'verify') return verifyCode(req, res)
  return res.status(404).json({ success: false, error: 'not_found' })
}
