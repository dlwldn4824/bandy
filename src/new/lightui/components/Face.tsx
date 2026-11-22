import { useState } from 'react'

/**
 * 얼굴 — 사진이 있으면 사진, 없으면 머리글자.
 *
 * 카카오는 로그인할 때 프로필 사진 주소를 같이 줍니다. 서버는 받아 오고
 * 있었는데 앱이 버리고 머리글자만 그렸습니다. **묻고 안 쓰는 게 제일
 * 나쁩니다** — 동의 화면만 한 줄 길어지고 돌아오는 건 없으니까요.
 *
 * 사진은 깨질 수 있습니다. 카카오 CDN 주소라 사용자가 사진을 바꾸거나
 * 지우면 저장해 둔 주소는 빈 것이 됩니다. 그때 깨진 네모를 남기지 않고
 * 머리글자로 돌아갑니다 — 머리글자는 언제나 있습니다.
 */

interface FaceProps {
  /** 사진이 없거나 안 열릴 때 그릴 한 글자 */
  initial: string
  src?: string | null
}

const Face = ({ initial, src }: FaceProps) => {
  // 어떤 주소가 깨졌는지를 들고 있습니다. 참/거짓으로 두면 사진을 바꿨을 때
  // 새 주소까지 깨진 것으로 칩니다.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null)

  if (!src || brokenSrc === src) return <>{initial}</>
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBrokenSrc(src)} />
}

export default Face
