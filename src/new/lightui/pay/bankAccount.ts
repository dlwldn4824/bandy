import { useSyncExternalStore } from 'react'

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
 * MOCK: 기기에만 저장합니다. 실제로는 동아리 문서에 붙고, 운영진만 고칩니다.
 * 계좌번호는 남이 보면 안 되는 값은 아니지만(예매자에게 보여 줘야 합니다)
 * 바꾸는 것은 운영진만 할 수 있어야 합니다.
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

const KEY = 'bandy.lightui.bankAccount'
const listeners = new Set<() => void>()

const filled = (b: BankAccount) => Boolean(b.name && b.account && b.holder)

function read(): BankAccount | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<BankAccount>
      const b = { name: saved.name ?? '', account: saved.account ?? '', holder: saved.holder ?? '' }
      if (filled(b)) return b
    }
  } catch {
    /* 사생활 보호 모드 등 — env 로 넘어갑니다 */
  }
  return filled(ENV) ? ENV : null
}

let current = read()
let snapshot = current

function publish() {
  snapshot = current
  listeners.forEach((fn) => fn())
}

export function getBankAccount(): BankAccount | null {
  return current
}

export function setBankAccount(next: BankAccount) {
  current = filled(next) ? next : null
  try {
    if (current) localStorage.setItem(KEY, JSON.stringify(current))
    else localStorage.removeItem(KEY)
  } catch {
    /* 저장이 막혀도 이번 세션 동안은 동작합니다 */
  }
  publish()
}

export function forgetBankAccount() {
  current = filled(ENV) ? ENV : null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 무시 */
  }
  publish()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const get = () => snapshot

/** 화면에서 씁니다 — 저장하면 그 자리에서 바뀝니다 */
export function useBankAccount() {
  const bank = useSyncExternalStore(subscribe, get, get)
  return { bank, ready: bank !== null, setBankAccount, forgetBankAccount }
}
