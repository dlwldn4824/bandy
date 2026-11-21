/**
 * 입금 안내의 기한과 계좌.
 *
 * 둘 다 목 데이터에 문자열로 적혀 있었습니다. 그래서 운영 주소에서 이렇게 떴습니다.
 *
 *   「11월 20일 (목) 23:59까지 입금하면 자리가 확정됩니다 · 남은 시간 23:41:02」
 *
 * 11월 22일에요. 기한은 이미 지났는데 하루가 남았다고 합니다. 돈을 보내는 화면의
 * 날짜라 적어 두면 반드시 어긋납니다 — 계산해서 그립니다.
 *
 * 계좌도 같은 이유로 여기로 옮깁니다. 목에 있던 `123456-78-901234 · 밴디 (이지우)`
 * 가 운영 주소에 그대로 떠 있었습니다. 형식이 진짜 계좌와 구분이 안 돼서, 누가
 * 보고 실제로 보내면 돈이 엉뚱한 데로 갑니다. 값이 없으면 **지어내지 않고**
 * 「아직 등록 전」 이라고 말합니다.
 */

const BANK_NAME = import.meta.env.VITE_BANK_NAME as string | undefined
const BANK_ACCOUNT = import.meta.env.VITE_BANK_ACCOUNT as string | undefined
const BANK_HOLDER = import.meta.env.VITE_BANK_HOLDER as string | undefined

/** 셋이 다 있어야 계좌를 그립니다. 하나라도 비면 안내를 띄웁니다. */
export const BANK_READY = Boolean(BANK_NAME && BANK_ACCOUNT && BANK_HOLDER)

export const BANK = {
  name: BANK_NAME ?? '',
  account: BANK_ACCOUNT ?? '',
  holder: BANK_HOLDER ?? '',
}

/** 계좌가 없을 때 그 자리에 들어가는 말 */
export const BANK_UNSET = {
  title: '입금 계좌가 아직 등록되지 않았어요',
  body: '공연을 연 동아리가 계좌를 등록하면 여기에 뜹니다. 그 전에는 입금하지 마세요.',
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 기한이 코앞이면 하루 미룹니다 — 세 시간 안에 돈을 보내라고 할 수는 없습니다 */
const MIN_LEFT_MS = 3 * 60 * 60 * 1000

/**
 * 입금 기한 — 오늘 23:59. 세 시간도 안 남았으면 다음 날 23:59.
 *
 * 진짜로는 예매 기록에 기한이 들어 있어야 합니다. 아직 그 기록이 없어서 기준
 * 시각에서 계산합니다. 적어 둔 날짜보다는 낫지만 이것도 임시입니다.
 */
export function deadlineFrom(at: Date = new Date()): Date {
  const due = new Date(at)
  due.setHours(23, 59, 0, 0)
  if (due.getTime() - at.getTime() < MIN_LEFT_MS) due.setDate(due.getDate() + 1)
  return due
}

/** 「11월 23일 (일) 23:59까지 입금하면 자리가 확정됩니다.」 */
export function dueText(due: Date): string {
  const md = `${due.getMonth() + 1}월 ${due.getDate()}일`
  const wd = WEEKDAY[due.getDay()]
  const hh = String(due.getHours()).padStart(2, '0')
  const mm = String(due.getMinutes()).padStart(2, '0')
  return `${md} (${wd}) ${hh}:${mm}까지 입금하면 자리가 확정됩니다.`
}

/** 「23:41:02」. 기한이 지났으면 그렇게 말합니다 — 음수를 00:00:00 으로 감추지 않습니다. */
export function remainText(ms: number): string {
  if (ms <= 0) return '기한이 지났어요'
  const total = Math.floor(ms / 1000)
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}
