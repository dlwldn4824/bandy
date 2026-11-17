// 이 기기(브라우저)에만 저장하는 편의 정보. 실패해도(비공개 창 등) 앱은 그대로 동작한다.
// 비밀번호·토큰 같은 민감 정보는 여기 두지 않는다(로그인 세션은 Supabase가 'bandy-auth' 키로 따로 관리).
const KEY = 'bandy-device'

type DeviceInfo = {
  lastEmail?: string // 마지막 로그인 이메일(다음 로그인 때 미리 채움)
  lastPersona?: string // 데모: 마지막 시연 역할
  depositorName?: string // 마지막 입금자명(다음 예매 때 미리 채움)
  dismissed?: Record<string, number> // 홈 신호 창을 닫은 기록(같은 창을 계속 띄우지 않기 위해)
  qr?: Record<string, { token: string; at: number; until?: number }> // 티켓별 마지막 QR(전파가 약한 공연장에서 다시 열 때 사용)
}

function read(): DeviceInfo {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as DeviceInfo } catch { return {} }
}

function write(patch: Partial<DeviceInfo>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })) } catch { /* 저장 못 해도 진행 */ }
}

export const device = {
  get: read,
  set: write,
  // 홈 신호 창: 같은 키는 닫은 뒤 hours 시간 동안 다시 띄우지 않는다
  wasDismissed(key: string, hours = 6) {
    const at = read().dismissed?.[key]
    return !!at && Date.now() - at < hours * 3600000
  },
  dismiss(key: string) {
    const d = read().dismissed ?? {}
    // 오래된 기록은 정리
    const fresh = Object.fromEntries(Object.entries(d).filter(([, at]) => Date.now() - at < 7 * 86400000))
    write({ dismissed: { ...fresh, [key]: Date.now() } })
  },
  // QR 유효시간은 서버 기준 '24시간'과 '공연 시작 + 6시간' 중 긴 쪽(최대 7일). 저장해 둔 것도 그 안에서만 쓴다(1시간 여유를 둠)
  saveQr(ticketId: string, token: string, eventStartsAt?: string) {
    const now = Date.now()
    const start = eventStartsAt ? new Date(eventStartsAt).getTime() : 0
    const until = Math.max(now + 24 * 3600000, Math.min(start + 6 * 3600000, now + 7 * 86400000)) - 3600000
    const q = read().qr ?? {}
    const fresh = Object.fromEntries(Object.entries(q).filter(([, v]) => (v.until ?? v.at + 23 * 3600000) > now))
    write({ qr: { ...fresh, [ticketId]: { token, at: now, until } } })
  },
  cachedQr(ticketId: string) {
    const v = read().qr?.[ticketId]
    return v && (v.until ?? v.at + 23 * 3600000) > Date.now() ? v.token : null
  },
  // 로그아웃할 때 이 기기에 남긴 개인 정보(QR·입금자명)를 지운다. 마지막 이메일은 남긴다(다음 로그인 편의)
  clearPersonal() {
    const { lastEmail, lastPersona } = read()
    try { localStorage.setItem(KEY, JSON.stringify({ lastEmail, lastPersona })) } catch { /* 무시 */ }
  },
}

// 로그인 후 돌아갈 주소. 앱 안 경로(/app...)만 허용해 외부로 튕기는 주소를 막는다
export function safeNext(next: string | null | undefined) {
  return next && /^\/app(\/|$|\?)/.test(next) && !next.startsWith('//') ? next : '/app'
}
