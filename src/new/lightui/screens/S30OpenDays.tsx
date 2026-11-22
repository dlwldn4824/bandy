import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import Button from '../components/Button.tsx'
import Sheet from '../components/Sheet.tsx'
import { P } from '../paths.ts'
import { showWhen } from '../calendar.ts'
import { useApplications } from '../shows/applications.ts'
import { useMyShows } from '../shows/myShows.ts'
import { useIsDemoClub } from '../clubs/owner.ts'
import { openDays, openDaysCopy as t, clubConsole, type OpenDay } from '../../mocks/bandyLight.ts'
import './S30OpenDays.css'

/**
 * S30 설 자리 찾기 — 공연장이 비워 둔 날.
 *
 * 사업 모델의 절반인데 화면이 없었습니다. 공연장이 날을 올리는 쪽(L3)만
 * 있고 **그 날을 보는 쪽**이 없어서, 올려 둔 날은 아무도 못 봤습니다.
 * 공연 만들기에서 「라디오가가 · 밴디 연결」 을 고르게 해 놓고 정작 어떤
 * 자리가 비어 있는지 볼 데가 없었습니다.
 *
 * 동아리가 고르는 기준은 셋입니다 — **언제 · 몇 명 들어가나 · 얼마를
 * 떼 가나.** 대관료가 아니라 티켓 매출의 비율이라, 그 숫자가 곧 정산입니다.
 */
const S30OpenDays = () => {
  const navigate = useNavigate()
  const { mine, applied, apply } = useApplications()
  const made = useMyShows()
  const demo = useIsDemoClub()
  const [ask, setAsk] = useState<OpenDay | null>(null)

  /** 지원할 때 고를 수 있는 우리 공연 */
  const shows = [
    ...made.map((s) => ({ id: s.id, title: s.title })),
    ...(demo ? clubConsole.upcoming.map((s) => ({ id: s.id, title: s.title })) : []),
  ]
  const [pick, setPick] = useState<string | null>(null)

  const close = () => {
    setAsk(null)
    setPick(null)
  }

  return (
    <Phone>
      <TopBar title={t.title} />
      <div className="lui-body">
        <div className="s30">
          <div className="s30__gap-14" />
          <p className="s30__lead">{t.lead}</p>

          {/* 보낸 것을 다시 볼 자리 — 어디에 보냈는지 모르면 또 보냅니다 */}
          {mine.length > 0 && (
            <>
              <div className="s30__gap-18" />
              <SectionHeader title={t.sentTitle} aside={`${mine.length}건`} />
              <div className="lui-card s30__sent">
                {mine.map((a) => {
                  const day = openDays.find((d) => d.id === a.dayId)
                  return (
                    <div key={a.dayId} className="s30-sent">
                      <span className="s30-sent__where">
                        {day ? `${day.venue} · ${showWhen(day.at)}` : a.dayId}
                      </span>
                      <span className="s30-sent__what">{a.showTitle} · 기다리는 중</span>
                    </div>
                  )
                })}
              </div>
              <div className="s30__gap-12" />
              <p className="s30__note">{t.sent}</p>
            </>
          )}

          <div className="s30__gap-18" />
          {openDays.length === 0 ? (
            <div className="lui-card s30-empty">
              <p className="s30-empty__title">{t.empty}</p>
              <p className="s30-empty__body">{t.emptyBody}</p>
            </div>
          ) : (
            <div className="s30__list">
              {openDays.map((day) => {
                const done = applied(day.id)
                return (
                  <div key={day.id} className="lui-card s30-day">
                    <div className="s30-day__head">
                      <span className="s30-day__when">{showWhen(day.at)}</span>
                      {day.beenHere && <span className="s30-day__been">{t.been}</span>}
                    </div>
                    <p className="s30-day__venue">
                      {day.venue}
                      <span className="s30-day__region"> · {day.region}</span>
                    </p>

                    {/* 고르는 기준 셋을 한자리에 — 떼 가는 비율이 곧 정산입니다 */}
                    <div className="s30-day__facts">
                      <span className="s30-day__fact">
                        <span className="s30-day__k">들어가는 사람</span>
                        <span className="s30-day__v">{day.cap}명</span>
                      </span>
                      <span className="s30-day__fact">
                        <span className="s30-day__k">공연장 몫</span>
                        <span className="s30-day__v s30-day__v--accent">티켓 매출 {day.cut}%</span>
                      </span>
                    </div>
                    <p className="s30-day__gear">{day.gear}</p>

                    <Button
                      variant={done ? 'ghost' : 'primary'}
                      disabled={done}
                      className="s30-day__btn"
                      onClick={() => setAsk(day)}
                    >
                      {done ? t.applied : t.apply}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="s30__gap-18" />
          <p className="s30__note">{t.note}</p>
        </div>
      </div>

      <Sheet open={ask !== null} title={ask ? t.applyAsk(ask.venue) : ''} onClose={close}>
        {shows.length === 0 ? (
          <>
            {/* 「공연을 만들어 주세요」 라고만 하면 또 길이 없는 말이 됩니다 */}
            <p className="lui-menu__note">{t.noShowBody}</p>
            <div className="s30__pair">
              <Button variant="ghost" onClick={close}>
                닫기
              </Button>
              <Button onClick={() => navigate(P.showNew)}>{t.noShowCta}</Button>
            </div>
          </>
        ) : (
          <>
            <p className="lui-menu__note">{t.pick}</p>
            <div className="s30__picks">
              {shows.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`s30-pick${pick === s.id ? ' s30-pick--on' : ''}`}
                  onClick={() => setPick(s.id)}
                  aria-pressed={pick === s.id}
                >
                  <span className="s30-pick__title">{s.title}</span>
                  <span className="s30-pick__dot" aria-hidden />
                </button>
              ))}
            </div>
            <div className="s30__pair">
              <Button variant="ghost" onClick={close}>
                그대로 두기
              </Button>
              <Button
                disabled={pick === null}
                onClick={() => {
                  if (!ask || !pick) return
                  apply(ask.id, shows.find((s) => s.id === pick)?.title ?? '')
                  close()
                }}
              >
                {t.apply}
              </Button>
            </div>
          </>
        )}
      </Sheet>
      <TabBar active="my" />
    </Phone>
  )
}

export default S30OpenDays
