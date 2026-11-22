import { getMyShow } from '../shows/myShows.ts'
import { showDetailFor } from '../../mocks/bandyLight.ts'
import { showWhen } from '../calendar.ts'
import { mapShows } from '../../mocks/bandyLight.ts'

/**
 * 공연 하나를 공유할 때 필요한 것.
 *
 * 공유 버튼이 전부 `P.invite` 로 갔습니다 — 초대하기는 **내가 산 표에 친구를
 * 부르는** 자리라 공연이 바뀌어도 같은 화면이 열렸습니다. 공유는 **이 공연을
 * 알리는** 일이고, 알리는 것은 결국 **예매 링크 하나**입니다.
 *
 * 톡켓을 보면 포스터가 아니라 등록하면 생기는 예매 URL 이 중심입니다. 그래서
 * 링크를 가운데 두고 나머지(문자·스토리 이미지)는 곁다리로 둡니다.
 */

/** 공유 링크는 보는 사람이 열 수 있어야 하므로 실제 주소를 씁니다 */
const SITE = 'hibandy.com'

export interface ShowShare {
  id: string
  title: string
  /** '12.20 (일) 19:00' */
  when: string
  venue: string
  poster?: string
  /** 화면에 보여 주는 짧은 주소 */
  link: string
  fullLink: string
  /** 문자·카카오에 같이 보내는 한 줄 */
  text: string
  /**
   * 이 기기에서 만든 공연인가.
   * 그렇다면 받은 사람은 아직 못 엽니다 — 서버가 없어서 이 기기에만 있습니다.
   */
  deviceOnly: boolean
}

export function shareForShow(id: string): ShowShare | null {
  const mine = getMyShow(id)
  if (mine) {
    return {
      id,
      title: mine.title,
      when: showWhen(mine.at),
      venue: mine.venue,
      poster: mine.poster,
      link: `${SITE}/ui/show/${id}`,
      fullLink: `https://${SITE}/ui/show/${id}`,
      text: `${mine.title}\n${showWhen(mine.at)} · ${mine.venue}`,
      deviceOnly: true,
    }
  }

  const detail = showDetailFor(id)
  if (!detail) return null
  const onMap = mapShows.find((show) => show.id === id)
  const when = onMap ? showWhen(onMap.at) : (detail.info[0]?.v ?? '')
  return {
    id,
    title: detail.titleLines.filter(Boolean).join(' '),
    when,
    venue: detail.venue.name,
    poster: detail.hero || undefined,
    link: `${SITE}/ui/show/${id}`,
    fullLink: `https://${SITE}/ui/show/${id}`,
    text: `${detail.titleLines.filter(Boolean).join(' ')}\n${when} · ${detail.venue.name}`,
    deviceOnly: false,
  }
}
