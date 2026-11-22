import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import Button from '../components/Button.tsx'
import Sheet from '../components/Sheet.tsx'
import Icon from '../components/Icon.tsx'
import { P } from '../paths.ts'
import { STAGES, openChecklist, useStage, type SetStage } from '../shows/stage.ts'
import { useBankAccount } from '../pay/bankAccount.ts'
import { getMyShow } from '../shows/myShows.ts'
import { showWhen } from '../calendar.ts'
import ShareShowSheet from '../share/ShareShowSheet.tsx'
import { clubConsole as c, showMissing } from '../../mocks/bandyLight.ts'
import './S28ShowStage.css'

/**
 * S28 공연 상태 — 올렸다 · 판다 · 닫았다를 가릅니다.
 *
 * 공연을 만들면 곧바로 끝이었습니다. 아직 팀도 안 모인 공연이 예매를 받고,
 * 마감한 공연은 다시 열 길이 없었습니다.
 *
 * 화면에서 제일 중요한 건 **지금 누가 이 공연을 볼 수 있는가** 입니다.
 * 단계 이름만 적어 두면 「팀 모으는 중」 이 무슨 뜻인지 저마다 다르게
 * 읽습니다 — 단계마다 무엇이 열려 있는지를 같이 적습니다.
 */
const S28ShowStage = () => {
  const navigate = useNavigate()
  const { showId = 'glow' } = useParams()
  // 모르는 공연이면 첫 공연으로 대신하지 않습니다 — 남의 공연 단계를 바꾸게 됩니다
  const mine = getMyShow(showId)
  const show = mine
    ? { id: mine.id, title: mine.title, when: `${showWhen(mine.at)} · ${mine.venue}`, at: mine.at }
    : [...c.upcoming, ...c.past].find((row) => row.id === showId)
  const t = c.stageCopy

  const { stage, locked, move } = useStage(show?.id ?? showId, show?.at)
  // 계좌를 등록하고 돌아오면 체크리스트가 그 자리에서 바뀌어야 합니다
  useBankAccount()
  const [ask, setAsk] = useState<'open' | 'close' | 'back' | null>(null)
  const [share, setShare] = useState(false)

  const need = openChecklist(show ?? {})
  /**
   * 갖출 것은 **처음 열 때만** 봅니다. 한 번 연 공연을 닫았다가 다시 여는
   * 길까지 막으면, 실수로 닫은 운영진이 공연을 다시 만들어야 합니다 —
   * 되돌릴 수 있어야 한다는 말이 그 뜻입니다.
   */
  const ready = stage === 'closed' || need.every((n) => n.ok)
  // 끝난 공연에는 예매 수가 없습니다 — 모양이 다른 목이라 갈라 읽습니다
  const sold = show && 'paid' in show ? show.paid : 0
  const total = show && 'total' in show ? show.total : sold

  const close = () => setAsk(null)
  const go = (next: SetStage) => {
    move(next)
    close()
  }

  if (!show) {
    return (
      <Phone>
        <TopBar title={t.title} />
        <div className="lui-body">
          <div className="s28">
            <div className="s28__gap-26" />
            <div className="lui-card s28-alone">
              <p className="s28-alone__title">{showMissing.title}</p>
              <p className="s28-alone__body">{showMissing.body}</p>
            </div>
          </div>
        </div>
        <TabBar active="my" />
      </Phone>
    )
  }

  return (
    <Phone>
      <TopBar title={t.title} />
      <div className="lui-body">
        <div className="s28">
          <div className="s28__gap-14" />
          <p className="s28__title">{show.title}</p>
          <p className="s28__when">{show.when}</p>

          <div className="s28__gap-22" />
          {/* 지금 단계 — 이름만 크게 두지 않고 무엇이 열려 있는지까지 */}
          <div className="lui-card s28-now">
            <span className="s28-now__k">{t.now}</span>
            <span className="s28-now__v">{STAGES.find((s) => s.key === stage)?.label}</span>
            <span className="s28-now__what">{STAGES.find((s) => s.key === stage)?.what}</span>
            {sold > 0 && <span className="s28-now__sold">{t.sold(sold, total)}</span>}
          </div>

          <div className="s28__gap-26" />
          <SectionHeader title="단계" />
          {/* 사다리 — 지난 칸·지금 칸·앞으로 올 칸 */}
          <div className="lui-card s28__ladder">
            {STAGES.map((s, i) => {
              const at = STAGES.findIndex((x) => x.key === stage)
              const state = i < at ? 'past' : i === at ? 'on' : 'next'
              return (
                <div key={s.key} className={`s28-step s28-step--${state}`}>
                  <span className="s28-step__dot" aria-hidden />
                  <span className="s28-step__main">
                    <span className="s28-step__label">{s.label}</span>
                    <span className="s28-step__what">{s.what}</span>
                  </span>
                </div>
              )
            })}
          </div>

          {/* 날짜가 정한 단계에서는 바꿀 것이 없습니다 — 버튼 대신 까닭 */}
          {locked && (
            <>
              <div className="s28__gap-22" />
              <p className="s28__locked">{stage === 'today' ? t.lockedToday : t.lockedDone}</p>
              <div className="s28__gap-14" />
              <Button
                variant="ghost"
                block
                onClick={() => navigate(stage === 'today' ? P.run(show.id) : P.settlement)}
              >
                {stage === 'today' ? '공연 당일 화면' : '정산 보기'}
              </Button>
            </>
          )}

          {!locked && (stage === 'draft' || stage === 'gathering') && (
            <>
              <div className="s28__gap-26" />
              <SectionHeader title={t.need} aside={ready ? '다 됐어요' : '빠진 것 있음'} />
              <div className="lui-card s28__need">
                {need.map((n) => (
                  /* 빠진 것을 짚었으면 그 자리에서 메울 수 있어야 합니다 —
                     「계좌를 등록해야 합니다」 라고만 적고 길을 안 두면
                     마이까지 돌아가서 찾아야 합니다 */
                  <button
                    key={n.k}
                    type="button"
                    className={`s28-need${n.ok ? ' s28-need--ok' : ''}`}
                    disabled={n.ok || n.k !== '입금 계좌'}
                    onClick={() => navigate(P.bankAccount)}
                  >
                    {/* 빠진 것에는 아이콘 대신 빈 동그라미 — 체크 아이콘을
                        회색으로 쓰면 「됐다」 와 구분이 안 됩니다 */}
                    {n.ok ? (
                      <Icon name="check" size={16} className="s28-need__icon" />
                    ) : (
                      <span className="s28-need__todo" aria-hidden />
                    )}
                    <span className="s28-need__main">
                      <span className="s28-need__k">{n.k}</span>
                      {!n.ok && <span className="s28-need__how">{n.how}</span>}
                    </span>
                    {!n.ok && n.k === '입금 계좌' && (
                      <Icon name="chevron-right" size={16} className="s28-need__chev" />
                    )}
                  </button>
                ))}
              </div>
              <div className="s28__gap-12" />
              <p className="s28__note">{t.needNote}</p>
            </>
          )}

          {/* 예매 중일 때만 되돌리는 길을 둡니다. 초안으로 내리는 건
              둘러보기에서 공연이 사라지는 일이라 조용히 두면 안 됩니다 */}
          {!locked && stage === 'gathering' && (
            <>
              <div className="s28__gap-22" />
              <button type="button" className="s28__back" onClick={() => setAsk('back')}>
                {t.back}
              </button>
            </>
          )}

          <div className="s28__gap-26" />
        </div>
      </div>

      {/* 규칙 1 — 이 화면의 기본 버튼은 하나. 열거나, 닫거나 */}
      {!locked && (
        <div className="lui-bottombar s28__bottom">
          {stage === 'selling' ? (
            /* 열었으면 다음에 할 일은 알리는 것입니다 — 열어 두고 아무도 모르면 안 팝니다 */
            <div className="s28__pair">
              <Button variant="ghost" onClick={() => setAsk('close')}>
                {t.close}
              </Button>
              <Button onClick={() => setShare(true)}>알리기</Button>
            </div>
          ) : (
            <Button block disabled={!ready} onClick={() => setAsk('open')}>
              {stage === 'closed' ? t.reopen : t.open}
            </Button>
          )}
        </div>
      )}

      <ShareShowSheet showId={show.id} open={share} onClose={() => setShare(false)} />

      <Sheet
        open={ask !== null}
        title={ask === 'open' ? t.openAsk : ask === 'close' ? t.closeAsk : t.backAsk}
        onClose={close}
      >
        <p className="lui-menu__note">
          {ask === 'open' ? t.openBody : ask === 'close' ? t.closeBody : t.backBody}
        </p>
        <div className="s28__pair">
          <Button variant="ghost" onClick={close}>
            그대로 두기
          </Button>
          {ask === 'open' && <Button onClick={() => go('selling')}>{t.open}</Button>}
          {ask === 'close' && (
            <Button variant="danger" onClick={() => go('closed')}>
              {t.close}
            </Button>
          )}
          {ask === 'back' && (
            <Button variant="danger" disabled={sold > 0} onClick={() => go('draft')}>
              되돌리기
            </Button>
          )}
        </div>
      </Sheet>
      {/* 운영 화면의 집은 마이 > 운영입니다 — 들어온 길과 켜진 탭이 같아야 합니다 */}
      <TabBar active="my" />
    </Phone>
  )
}

export default S28ShowStage
