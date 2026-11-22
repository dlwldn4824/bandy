import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sheet from '../components/Sheet.tsx'
import Button from '../components/Button.tsx'
import Icon from '../components/Icon.tsx'
import { P } from '../paths.ts'
import { useStage } from '../shows/stage.ts'
import { shareForShow } from './showShare.ts'
import {
  canShareHere,
  copyLink,
  downloadStoryImage,
  shareBySms,
  shareHere,
} from './share.ts'
import './ShareShowSheet.css'

/**
 * 이 공연을 알리기.
 *
 * 공유 버튼이 전부 초대하기(`P.invite`)로 갔습니다. 초대는 **내가 산 표에
 * 친구를 부르는** 일이고 공유는 **이 공연을 알리는** 일이라, 받는 사람도
 * 들어오는 자리도 다릅니다. 무엇보다 공연이 바뀌어도 같은 화면이 열렸습니다.
 *
 * 가운데에 두는 것은 **예매 링크 하나**입니다. 포스터 세 규격을 만드는 것보다
 * 링크 하나가 제대로 도는 게 낫습니다 — 표는 결국 그 주소에서 팔립니다.
 *
 * 카카오톡은 키가 없어서 아직 못 엽니다. 아이콘을 두고 문자 앱을 여는 대신
 * **기기 공유 시트**를 둡니다 — 휴대폰에서는 거기 카카오톡이 들어 있습니다.
 */
const ShareShowSheet = ({
  showId,
  open,
  onClose,
}: {
  showId: string
  open: boolean
  onClose: () => void
}) => {
  const navigate = useNavigate()
  const s = shareForShow(showId)
  const { stage } = useStage(showId)
  const [toast, setToast] = useState<string | null>(null)

  const say = (text: string) => {
    setToast(text)
    window.setTimeout(() => setToast(null), 1800)
  }

  if (!s) return null

  /** 아직 안 연 공연은 받은 사람이 열어도 볼 것이 없습니다 */
  const notOpen = stage === 'draft' || stage === 'gathering'

  return (
    <Sheet open={open} title="이 공연 알리기" onClose={onClose}>
      {notOpen ? (
        <>
          <p className="lui-menu__note">
            아직 예매를 열지 않아서 받은 사람에게는 보이지 않습니다. 먼저 예매를 열어 주세요.
          </p>
          <div className="shr__pair">
            <Button variant="ghost" onClick={onClose}>
              닫기
            </Button>
            <Button onClick={() => navigate(P.showStage(showId))}>공연 상태로</Button>
          </div>
        </>
      ) : (
        <>
          <p className="shr__what">
            {s.title}
            <span className="shr__when">
              {s.when} · {s.venue}
            </span>
          </p>

          {/* 링크가 주인공입니다 — 눌러서 복사하고, 눈으로도 맞춰 볼 수 있게 */}
          <button
            type="button"
            className="shr__link"
            onClick={async () => {
              const r = await copyLink(s.fullLink)
              say(r === 'copied' ? '링크를 복사했어요' : '복사가 막혀 있어요. 주소를 길게 눌러 복사해 주세요')
            }}
          >
            <span className="shr__link-url">{s.link}</span>
            <span className="shr__link-copy">복사</span>
          </button>

          {/* 떠 있는 말풍선은 아래 아이콘을 가립니다 — 자리를 차지하게 둡니다 */}
          {toast && <p className="shr__said">{toast}</p>}

          {s.deviceOnly && (
            /* 지어내지 않습니다 — 이 기기에만 있는 공연은 받은 사람이 못 엽니다 */
            <p className="shr__warn">
              이 공연은 아직 이 기기에만 있습니다. 링크를 받은 사람은 열 수 없어요 — 서버가
              붙으면 그대로 열립니다.
            </p>
          )}

          {/* 규칙 5 — 56px 원형 아이콘 버튼 + 아래 라벨 */}
          <div className="lui-share shr__ways">
            {canShareHere() && (
              <button
                type="button"
                className="lui-share__item"
                onClick={async () => {
                  const r = await shareHere(s.title, s.text, s.fullLink)
                  if (r === 'failed') say('공유를 열지 못했어요')
                }}
              >
                <span className="lui-share__circle">
                  <Icon name="share" size={22} />
                </span>
                <span className="lui-share__label">공유</span>
              </button>
            )}
            <button
              type="button"
              className="lui-share__item"
              onClick={() => shareBySms(s.text, s.fullLink)}
            >
              <span className="lui-share__circle">
                <Icon name="share-sms" size={22} />
              </span>
              <span className="lui-share__label">문자</span>
            </button>
            <button
              type="button"
              className="lui-share__item"
              onClick={async () => {
                say('이미지를 만들고 있어요…')
                const r = await downloadStoryImage({
                  title: s.title,
                  when: s.when,
                  venue: s.venue,
                  poster: s.poster,
                  link: s.link,
                  theme: 'dark',
                })
                say(
                  r === 'downloaded'
                    ? '이미지를 저장했어요. 인스타 스토리에 올리고 링크 스티커를 붙여 주세요'
                    : '이미지를 만들지 못했어요',
                )
              }}
            >
              <span className="lui-share__circle">
                <Icon name="share-story" size={22} />
              </span>
              <span className="lui-share__label">스토리</span>
            </button>
          </div>

          {!canShareHere() && (
            <p className="shr__note">
              카카오톡으로 보내려면 링크를 복사해 붙여 넣어 주세요. 휴대폰에서는 「공유」 가
              떠서 카카오톡을 바로 고를 수 있어요.
            </p>
          )}
        </>
      )}
    </Sheet>
  )
}

export default ShareShowSheet
