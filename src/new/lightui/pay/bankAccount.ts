import { useSyncExternalStore } from 'react'
import { getMembership, useMembership } from '../auth/membership.ts'
import { DEMO_CLUB_ID } from '../clubs/owner.ts'

/**
 * 동아리 입금 계좌.
 *
 * 왜 생겼나
 * ---------
 * 둘이 각자 맞는 일을 하다가 막다른 길이 났습니다.
 *
 *   공연을 열기 전에 계좌가 있어야 한다 — 맞습니다. 계좌 없이 표를 팔면
 *   돈 낼 길이 없는 공연을 파는 것입니다.
 *   목 계좌번호를 띄우면 안 된다 — 맞습니다. 그럴듯한 번호를 보고 누군가는
 *   그리로 보냅니다.
 *
 * 그런데 **계좌를 넣는 자리**가 없었습니다. 그래서 운영진이 예매를 영영
 * 열 수 없었습니다. 「마이에서 권한 바꾸기」 로 보내 놓고 마이에 그 자리가
 * 없던 것과 같은 모양입니다.
 *
 * 어디서 읽나
 * -----------
 * 1. 이 기기에 저장된 값 — 운영진이 화면에서 적은 것
 * 2. 없으면 `.env` 의 `VITE_BANK_*` — 한 동아리만 쓰는 배포에서 미리 박아 둘 때
 *
 * 누구 계좌인가
 * -------------
 * **동아리별입니다.** 기기에 한 벌만 두면 블루노트로 바꿔도 멜로딕 계좌가
 * 그대로 남습니다. 그래서 소속의 `clubId` 를 키로 씁니다.
 *
 * 다만 **입금 안내를 보는 사람은 예매자**이고, 예매자 기기에는 그 동아리의
 * 계좌가 없습니다. 실제로는 공연 문서에 붙어 내려와야 하는 값입니다. 목
 * 단계에서는 공연이 전부 데모 동아리 것이라 `DEMO_CLUB_ID` 로 찾습니다 —
 * 서버가 붙으면 「공연 → 주최 동아리 → 계좌」 가 들어올 자리입니다.
 *
 * MOCK: 기기에만 저장합니다. 계좌번호는 숨길 값은 아니지만(예매자에게
 * 보여 줘야 합니다) **바꾸는 것**은 운영진만 할 수 있어야 합니다.
 */

export interface BankAccount {
  /** 은행 이름 — 「국민」 처럼 짧게 */
  name: string
  account: string
  holder: string
}

const ENV: BankAccount = {
  name: (import.meta.env.VITE_BANK_NAME as string | undefined) ?? '',
  account: (import.meta.env.VITE_BANK_ACCOUNT as string | undefined) ?? '',
  holder: (import.meta.env.VITE_BANK_HOLDER as string | undefined) ?? '',
}

const KEY = 'bandy.lightui.bankAccounts'
const listeners = new Set<() => void>()

const filled = (b: BankAccount) => Boolean(b.name && b.account && b.holder)

/** 어느 동아리 계좌를 볼 것인가 — 안 주면 내 소속, 소속이 없으면 데모 동아리 */
const keyOf = (clubId?: string) => clubId ?? getMembership()?.clubId ?? DEMO_CLUB_ID

function readAll(): Record<string, BankAccount> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Record<string, BankAccount>
  } catch {
    /* 사생활 보호 모드 등 — env 로 넘어갑니다 */
  }
  return {}
}

let current = readAll()
let snapshot = current

function publish() {
  snapshot = current
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* 저장이 막혀도 이번 세션 동안은 동작합니다 */
  }
  listeners.forEach((fn) => fn())
}

export function getBankAccount(clubId?: string): BankAccount | null {
  const saved = current[keyOf(clubId)]
  if (saved && filled(saved)) return saved
  return filled(ENV) ? ENV : null
}

export function setBankAccount(next: BankAccount, clubId?: string) {
  const k = keyOf(clubId)
  if (filled(next)) current = { ...current, [k]: next }
  else {
    const rest = { ...current }
    delete rest[k]
    current = rest
  }
  publish()
}

export function forgetBankAccount(clubId?: string) {
  const rest = { ...current }
  delete rest[keyOf(clubId)]
  current = rest
  publish()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const get = () => snapshot

/**
 * 화면에서 씁니다 — 저장하면 그 자리에서 바뀝니다.
 *
 * `clubId` 를 주면 그 동아리 계좌를, 안 주면 내 소속 것을 봅니다.
 * 예매자 화면(입금 안내)은 **공연을 연 동아리**의 것을 봐야 하므로
 * 그 id 를 넘겨 주세요.
 */
export function useBankAccount(clubId?: string) {
  const all = useSyncExternalStore(subscribe, get, get)
  // 소속도 같이 봅니다 — 동아리를 옮기면 보이는 계좌도 바뀌어야 합니다
  const { membership } = useMembership()
  const saved = all[clubId ?? membership?.clubId ?? DEMO_CLUB_ID]
  const bank = saved && filled(saved) ? saved : filled(ENV) ? ENV : null
  return { bank, ready: bank !== null, setBankAccount, forgetBankAccount }
}
