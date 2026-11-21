import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import Button from '../components/Button.tsx'
import { P } from '../paths.ts'
import { tapToConnect as t } from '../../mocks/bandyLight.ts'
import { withParticle } from '../korean.ts'
import './P5Tap.css'

/**
 * P5 휴대폰 맞대기 (NFC) — Figma 297:2 에서 가운데 그림을 바꿨습니다.
 *
 * 원래는 동심원 하나였는데 P3 도 큰 동그라미로 시작해서 두 화면이 닮아 보였습니다.
 * 여기서는 휴대폰 두 대가 마주 보고 그 사이에서 신호가 퍼지는 그림으로 두고,
 * 「찾는 중」 이라는 걸 글로도 말합니다 — 끝난 화면이 아니라 진행 중인 화면이니까요.
 *
 * `?with=이름` 으로 들어오면 누구와 맞대는 중인지 제목에 붙습니다 (P4 에서 사람 카드를 누른 경우).
 *
 * 전에는 「찾는 중…」 에서 **끝나는 길이 없었습니다.** 성공해도 갈 곳을 부르지
 * 않았고, 웹 NFC 가 없는 기기(아이폰 사파리가 전부입니다)에서는 영원히
 * 찾았습니다. 아래 버튼은 「QR로 연결하기」 인데 누르면 사람 목록으로
 * 돌아갑니다 — QR 화면은 아직 없습니다.
 *
 * 그래서 셋으로 나눕니다. 못 쓰는 기기면 **못 쓴다고 먼저 말하고**, 찾다가
 * 한참 지나면 멈춰서 다시 할지 묻고, 찾으면 연결된 화면으로 보냅니다.
 */

/** 이 기기에서 웹 NFC 를 쓸 수 있는지 — 아이폰 사파리에는 없습니다 */
const canTap = () => typeof window !== 'undefined' && 'NDEFReader' in window

/** 이만큼 못 찾으면 멈춥니다. 점 세 개가 영원히 도는 것보다 낫습니다 */
const GIVE_UP_MS = 20_000

const P5Tap = () => {
  const navigate = useNavigate()
  const { showId = 'glow' } = useParams()
  const [params] = useSearchParams()
  const withName = params.get('with')
  const [phase, setPhase] = useState<'searching' | 'unsupported' | 'gaveup'>(() =>
    canTap() ? 'searching' : 'unsupported',
  )

  useEffect(() => {
    if (phase !== 'searching') return
    let live = true
    const timer = window.setTimeout(() => live && setPhase('gaveup'), GIVE_UP_MS)

    // 읽히면 연결된 화면으로. 거절당하거나(권한) 실패하면 못 쓰는 것으로 봅니다.
    const reader = new (window as unknown as { NDEFReader: new () => {
      scan: (o?: { signal?: AbortSignal }) => Promise<void>
      onreading: (() => void) | null
    } }).NDEFReader()
    reader.onreading = () => {
      if (!live) return
      window.clearTimeout(timer)
      navigate(P.connected)
    }
    reader.scan().catch(() => live && setPhase('unsupported'))

    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [phase, navigate])

  return (
    <Phone>
      <TopBar
        title={withName ? `${withName}${withParticle(withName)} 연결` : '연결하기'}
        right={<span className="lui-topbar__side" />}
      />
      <div className="lui-body">
        <div className="p5">
          {/* 마주 본 휴대폰 두 대 + 그 사이로 퍼지는 신호 */}
          <div className="p5__scene" aria-hidden>
            <span className="p5__phone p5__phone--a" />
            <span className="p5__wave" />
            <span className="p5__wave p5__wave--2" />
            <span className="p5__phone p5__phone--b" />
          </div>

          <h1 className="p5__headline">
            {t.headline[0]}
            <br />
            {t.headline[1]}
          </h1>
          <p className="p5__lines">
            {t.lines[0]}
            <br />
            {t.lines[1]}
          </p>

          {phase === 'searching' && (
            <>
              <p className="p5__status">
                {withName ? `${withName}의 휴대폰을 찾는 중` : t.status}
                <span className="p5__dots" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              </p>
              <span className="p5__hint">{t.hint}</span>
            </>
          )}

          {phase === 'unsupported' && (
            <>
              <p className="p5__status p5__status--off">이 기기에서는 맞대기를 쓸 수 없어요</p>
              <span className="p5__hint">
                아이폰에서는 브라우저가 NFC 를 열어 주지 않습니다. 아래에서 목록으로 고르면
                똑같이 연결됩니다.
              </span>
            </>
          )}

          {phase === 'gaveup' && (
            <>
              <p className="p5__status p5__status--off">상대 휴대폰을 찾지 못했어요</p>
              <span className="p5__hint">
                둘 다 NFC 가 켜져 있어야 하고, 잠금은 풀려 있어야 합니다.
              </span>
            </>
          )}
        </div>
      </div>

      <div className="lui-bottombar p5__bottom">
        {phase === 'gaveup' && <Button onClick={() => setPhase('searching')}>다시 찾기</Button>}
        {/* 「QR로 연결하기」 였는데 누르면 사람 목록으로 갔습니다. QR 화면은
            아직 없으니, 가는 곳을 이름으로 적습니다. */}
        <Button
          variant={phase === 'searching' ? 'ghost' : 'primary'}
          onClick={() => navigate(P.livePeople(showId))}
        >
          목록에서 고르기
        </Button>
        <p className="p5__notice">{t.notice}</p>
      </div>
    </Phone>
  )
}

export default P5Tap
