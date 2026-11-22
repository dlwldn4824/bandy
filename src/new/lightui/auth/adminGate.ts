import { useSyncExternalStore } from 'react'

/**
 * 밴디 운영자 화면의 자물쇠.
 *
 * 왜 필요한가
 * -----------
 * `/ui/admin` 은 탭에도 메뉴에도 없고 주소로만 들어옵니다. 그래서 한동안
 * 게이트를 안 달았는데, **주소를 아는 것은 비밀이 아닙니다.** 막 가입해
 * 소속이 없는 계정으로 그 주소를 열면 자기가 보낸 동아리 생성 신청이
 * 승인 버튼과 함께 떠 있었고, 누르면 그 자리에서 운영진 소속이 생겼습니다.
 *
 * 그 흐름이 있는 **이유 자체가 이름 선점을 막는 것**입니다 — 아무나 멜로딕을
 * 먼저 등록하고 그 계정으로 티켓값을 받게 되는 것. 신청자 본인이 두 번 눌러
 * 통과하면 막은 것이 없습니다.
 *
 * 왜 「자기 신청만 못 누르게」 가 아닌가
 * -------------------------------------
 * 그것만 막으면 **아무도 동아리를 만들 수 없게** 됩니다. 지금 운영진 소속이
 * 생기는 길이 그 버튼 하나뿐이거든요. 막다른 길을 하나 더 만드는 셈입니다.
 *
 * 그래서 사람을 가립니다. 운영자만 아는 값을 묻고, 맞으면 그 화면 전체를
 * 엽니다. 맞힌 사람이 운영자이니 자기 신청을 승인해도 됩니다.
 *
 * 어떻게 확인하나
 * ---------------
 * **서버가 확인합니다.** `ADMIN_LOGIN_CODE` 는 `VITE_` 가 없어 브라우저로
 * 나가지 않고, `/api/verify-admin-code` 가 해시를 timing-safe 로 맞춰 보고
 * 실패를 세어 막습니다. 화면에서 문자열을 비교하면 번들에 답이 박힙니다.
 *
 * `sessionStorage` 를 씁니다 — 탭을 닫으면 풀립니다. 운영자 화면이 남의
 * 기기나 공용 기기에 열린 채로 남아 있을 이유가 없습니다.
 */

const KEY = 'bandy.lightui.adminOk'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    /* 사생활 보호 모드 등 — 잠긴 쪽으로 갑니다 */
    return false
  }
}

let snapshot = read()

function publish(next: boolean) {
  snapshot = next
  try {
    if (next) sessionStorage.setItem(KEY, '1')
    else sessionStorage.removeItem(KEY)
  } catch {
    /* 저장이 막혀도 이번 화면 동안은 열립니다 */
  }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const get = () => snapshot

export type AdminGateResult = 'ok' | 'wrong' | 'not_configured' | 'too_many' | 'unreachable'

/** 서버에 물어봅니다 — 맞으면 이 탭에서 열립니다 */
export async function verifyAdminCode(code: string): Promise<AdminGateResult> {
  let res: Response
  try {
    res = await fetch('/api/verify-admin-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'login', code }),
    })
  } catch {
    return 'unreachable'
  }

  if (res.status === 429) return 'too_many'
  const data = await res.json().catch(() => ({}))
  if (res.status === 503 || data.error === 'not_configured') return 'not_configured'
  if (!res.ok) return 'unreachable'
  if (data.ok) {
    publish(true)
    return 'ok'
  }
  return 'wrong'
}

export function lockAdmin() {
  publish(false)
}

export function useAdminGate() {
  const ok = useSyncExternalStore(subscribe, get, () => false)
  return { ok, verifyAdminCode, lockAdmin }
}
