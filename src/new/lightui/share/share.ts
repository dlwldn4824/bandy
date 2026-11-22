import { renderTicketImage, type TicketImageInput } from './ticketImage.ts'
import { kakaoJsKey } from '../auth/kakao.ts'
import { renderConnectionImage, type ConnectionImageInput } from './connectionImage.ts'

/**
 * 공유 — 문자 · 링크 복사 · 인스타 스토리.
 *
 * 전부 브라우저에서 끝나는 것만 구현했습니다. 서버·딥링크가 붙어야 하는 곳은
 * 아래 TODO 로 표시해 두었습니다.
 */

export type ShareResult = 'done' | 'copied' | 'downloaded' | 'unsupported' | 'failed'

/** 문자 앱 열기 — 본문에 초대 링크를 넣습니다 */
export function shareBySms(text: string, link: string): ShareResult {
  try {
    const body = encodeURIComponent(`${text}\n${link}`)
    // iOS 는 `&`, 안드로이드는 `?` 를 쓰는데 둘 다 body 만 넘기면 통합니다
    window.location.href = `sms:?body=${body}`
    return 'done'
  } catch {
    return 'failed'
  }
}

/** 링크 복사 — 클립보드가 막히면 실패를 돌려주고 화면에서 직접 고르게 합니다 */
export async function copyLink(link: string): Promise<ShareResult> {
  try {
    await navigator.clipboard.writeText(link)
    return 'copied'
  } catch {
    return 'failed'
  }
}

/**
 * 카카오톡 공유.
 *
 * 전에는 **말없이 문자 앱을 열었습니다.** 카카오 아이콘을 눌렀는데 문자가
 * 열리면 잘못 눌렀다고 생각합니다. 키가 없으면 없다고 말합니다.
 *
 * TODO: `VITE_KAKAO_JS_KEY` 가 들어오면 `Kakao.Share.sendDefault` 로 보냅니다.
 *       키 없이 미리 짜 두면 시험할 수 없어서 그때 붙입니다.
 */
export function shareByKakao(): ShareResult {
  return 'unsupported'
}

/**
 * 카카오 공유를 띄울 수 있는지.
 *
 * 키가 있어도 아직 아닙니다 — SDK 공유를 안 붙였습니다. 붙이면 이 값이
 * `kakaoJsKey() !== undefined` 가 됩니다. 그 전까지는 기기 공유 시트
 * (`shareHere`)로 보냅니다. 휴대폰에서는 거기 카카오톡이 들어 있습니다.
 */
export const KAKAO_SHARE_READY = false

/** 키는 들어와 있는지 — 「무엇이 없어서 안 되는지」 를 말할 때 씁니다 */
export function hasKakaoKey() {
  return kakaoJsKey() !== undefined
}

/**
 * 기기가 가진 공유 시트 — 휴대폰에서는 여기에 카카오톡이 들어 있습니다.
 * 키 없이 카카오로 보낼 수 있는 유일한 길이라 기본으로 둡니다.
 */
export function canShareHere() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export async function shareHere(title: string, text: string, link: string): Promise<ShareResult> {
  if (!canShareHere()) return 'unsupported'
  try {
    await navigator.share({ title, text, url: link })
    return 'done'
  } catch (e) {
    // 사용자가 시트를 닫은 것은 실패가 아닙니다
    if (e instanceof DOMException && e.name === 'AbortError') return 'done'
    return 'failed'
  }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * 인스타 스토리용 1080×1920 이미지를 만들어 내려받습니다.
 * TODO: `instagram-stories://share` 딥링크. 모바일 웹에서는 지원이 들쭉날쭉해서
 *       지금은 이미지 저장 + 「인스타에 올리기」 안내로만 둡니다.
 */
export async function downloadStoryImage(input: TicketImageInput): Promise<ShareResult> {
  try {
    const blob = await renderTicketImage(input, 'story')
    download(blob, 'bandy-story.png')
    return 'downloaded'
  } catch {
    return 'failed'
  }
}

/**
 * 공연별 OG 썸네일 주소.
 * TODO: 서버가 붙으면 `/api/og/:eventId` 가 1200×630 PNG 를 그려 줍니다.
 *       캐시 때문에 버전 쿼리를 붙입니다.
 */
export function ogImageUrl(eventId: string, version = 1) {
  return `/api/og/${eventId}?v=${version}`
}

/** 「올해 만난 밴드」 카드를 만들어 내려받습니다 (인스타 세로 1080×1350) */
export async function downloadConnectionImage(
  input: ConnectionImageInput,
): Promise<ShareResult> {
  try {
    const blob = await renderConnectionImage(input)
    download(blob, `bandy-${input.year}-connections.png`)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}
