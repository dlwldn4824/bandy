import { useState } from 'react'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import Button from '../components/Button.tsx'
import Sheet from '../components/Sheet.tsx'
import { useJoinInbox } from '../auth/joinInbox.ts'
import { approveJoin, rejectClubJoin } from '../auth/clubJoin.ts'
import { useMembers } from '../auth/members.ts'
import { joinInboxCopy as t, ourSchool, type JoinRequest } from '../../mocks/bandyLight.ts'
import './S27JoinRequests.css'

/**
 * S27 들어온 신청 — 참여 신청을 받아 주는 자리.
 *
 * 여기가 없어서 가입을 마쳐도 영영 관객이었습니다. 신청은 보내졌지만 받는
 * 쪽이 없었으니까요. 이 화면에서 받으면 부원 목록(S26)에 들어가고, 거기서
 * 운영진으로 올릴 수 있습니다.
 *
 * 운영진이 판단할 것은 하나입니다 — **아는 사람인가.** 자동으로 알아낼
 * 방법이 없어서, 학교가 우리와 같은지와 본인이 쓴 한마디를 같이 보여 주고
 * 다른 학교면 눈에 띄게 적습니다.
 */
const S27JoinRequests = () => {
  const { pending, done, accept, reject, mineId } = useJoinInbox()
  const { add } = useMembers()
  const [ask, setAsk] = useState<{ r: JoinRequest; to: 'accept' | 'reject' } | null>(null)
  /** 고른 까닭. 직접 쓰기면 own 에 들어갑니다 */
  const [why, setWhy] = useState<string | null>(null)
  const [own, setOwn] = useState('')

  const close = () => {
    setAsk(null)
    setWhy(null)
    setOwn('')
  }

  const reason = why === t.reasonOwn ? own : (why ?? '')

  const card = (r: JoinRequest) => {
    const outside = r.school !== ourSchool
    // 목 세 줄과 섞이니 어느 것이 진짜인지 적습니다
    const real = r.id === mineId
    return (
      <div key={r.id} className="lui-card s27-req">
        <div className="s27-req__head">
          <span className="s27-req__avatar">{r.initial}</span>
          <span className="s27-req__who">
            <span className="s27-req__name">{r.name}</span>
            <span className="s27-req__sub">
              {r.school} · {r.sub}
            </span>
          </span>
          <span className="s27-req__ago">{r.ago}</span>
        </div>

        {/* 규칙 7 — 다른 학교는 틀린 게 아니라 확인할 것이라, 빨강 대신 테두리 */}
        {real && <p className="s27-req__real">{t.realNote}</p>}

        {outside && (
          <p className="s27-req__flag">
            <span className="s27-req__flagtag">{t.other}</span>
            {t.otherNote}
          </p>
        )}

        {r.word && <p className="s27-req__word">{r.word}</p>}

        <div className="s27-req__acts">
          <Button variant="ghost" onClick={() => setAsk({ r, to: 'reject' })}>
            {t.reject}
          </Button>
          <Button onClick={() => setAsk({ r, to: 'accept' })}>{t.accept}</Button>
        </div>
      </div>
    )
  }

  return (
    <Phone>
      <TopBar title={t.title} />
      <div className="lui-body">
        <div className="s27">
          <div className="s27__gap-14" />

          {pending.length === 0 ? (
            <div className="lui-card s27-empty">
              <p className="s27-empty__title">{t.empty}</p>
              <p className="s27-empty__body">{t.emptyBody}</p>
            </div>
          ) : (
            <>
              <p className="s27__line">{t.waiting(pending.length)}</p>
              <div className="s27__gap-14" />
              <div className="s27__list">{pending.map(card)}</div>
            </>
          )}

          {done.length > 0 && (
            <>
              <div className="s27__gap-26" />
              <SectionHeader title={t.doneTitle} aside={String(done.length)} />
              <div className="lui-card s27__done">
                {done.map((r) => (
                  <div key={r.id} className="s27-done">
                    <span className="s27-done__name">{r.name}</span>
                    <span className="s27-done__state">
                      {r.state === 'approved' ? '받음' : '거절'} · {t.told}
                    </span>
                    {r.why && <span className="s27-done__why">{r.why}</span>}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="s27__gap-22" />
          <p className="s27__note">{t.note}</p>
        </div>
      </div>

      <Sheet
        open={ask !== null}
        title={ask ? (ask.to === 'accept' ? t.acceptAsk(ask.r.name) : t.rejectAsk(ask.r.name)) : ''}
        onClose={close}
      >
        <p className="lui-menu__note">{ask?.to === 'accept' ? t.acceptBody : t.rejectBody}</p>

        {ask?.to === 'reject' && (
          <div className="s27__reasons">
            {[...t.reasons, t.reasonOwn].map((r) => (
              <button
                key={r}
                type="button"
                className={`s27-reason${why === r ? ' s27-reason--on' : ''}`}
                onClick={() => setWhy(r)}
                aria-pressed={why === r}
              >
                {r}
              </button>
            ))}
            {why === t.reasonOwn && (
              <textarea
                className="s27__own"
                value={own}
                onChange={(e) => setOwn(e.target.value)}
                placeholder={t.reasonPlaceholder}
                rows={2}
              />
            )}
          </div>
        )}

        <div className="s27__ask">
          <Button variant="ghost" onClick={close}>
            그대로 두기
          </Button>
          {ask?.to === 'accept' ? (
            <Button
              onClick={() => {
                if (!ask) return
                if (ask.r.id === mineId) {
                  // 신청한 사람이 곧 나라서 부원 목록에 또 세우지 않습니다
                } else {
                  accept(ask.r.id)
                  // 받으면 바로 부원 목록에 섭니다 — 받았는데 어디에도 없으면 안 받은 것입니다
                  add({
                    id: ask.r.id,
                    initial: ask.r.initial,
                    name: ask.r.name,
                    sub: ask.r.sub,
                  })
                }
                // 받아 준 줄이 이 기기가 보낸 신청이면 소속까지 여기서 생깁니다.
                // 남의 신청을 받아 줬다고 운영진 자신의 소속이 바뀌면 안 되므로
                // approveJoin 이 id 를 맞춰 보고 아니면 아무것도 하지 않습니다.
                approveJoin(ask.r.id)
                close()
              }}
            >
              {t.accept}
            </Button>
          ) : (
            <Button
              variant="danger"
              disabled={!reason.trim()}
              onClick={() => {
                if (!ask) return
                if (ask.r.id === mineId) rejectClubJoin(reason.trim())
                else reject(ask.r.id, reason)
                close()
              }}
            >
              {t.reject}
            </Button>
          )}
        </div>
      </Sheet>
      {/* 운영 화면의 집은 마이 > 운영입니다 — 들어온 길과 켜진 탭이 같아야 합니다 */}
      <TabBar active="my" />
    </Phone>
  )
}

export default S27JoinRequests
