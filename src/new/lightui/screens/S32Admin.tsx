import { useState } from 'react'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import Button from '../components/Button.tsx'
import Sheet from '../components/Sheet.tsx'
import { approveClubJoin, rejectClubJoin, useClubJoin } from '../auth/clubJoin.ts'
import { adminCopy as t, clubRequests, type ClubRequest } from '../../mocks/bandyLight.ts'

/** 이 기기에서 보낸 신청은 눌러서 진짜로 승인됩니다 */
type Row = ClubRequest & { mine?: boolean }
import './S32Admin.css'

/**
 * S32 밴디 운영자 — 동아리 생성 확인.
 *
 * 생성 신청을 **바로 승인하지 않는 이유는 이름 선점** 때문입니다. 자동이면
 * 아무나 「멜로딕」 을 먼저 등록하고 그 계정으로 티켓값을 받게 됩니다.
 * 그래서 사람이 한 번 봅니다 — 동아리 공식 인스타그램 계정에서 확인 코드가
 * 왔는지.
 *
 * **앱 안에 있을 필요가 없는 화면입니다.** 운영자는 몇 명이고 하루 몇
 * 건이라 탭에도 메뉴에도 두지 않았습니다. 주소를 아는 사람만 엽니다 —
 * 로그인으로 막는 것은 서버가 붙을 때 할 일이고, 지금 가짜 자물쇠를
 * 달아 두면 막아 둔 줄 알게 됩니다.
 */
const S32Admin = () => {
  /** 이 기기에서 보낸 생성 신청 — 눌러서 실제로 승인되는 유일한 줄입니다 */
  const localReq = useClubJoin()
  const [handled, setHandled] = useState<Record<string, 'approved' | 'rejected'>>({})
  const [ask, setAsk] = useState<{ r: Row; to: 'approve' | 'reject' } | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  const [own, setOwn] = useState('')

  const close = () => {
    setAsk(null)
    setWhy(null)
    setOwn('')
  }
  const reason = why === t.reasonOwn ? own : (why ?? '')

  /** 목 둘 + 이 기기가 보낸 것 하나 */
  const rows: Row[] = [
    ...(localReq && localReq.kind === 'create'
      ? [
          {
            id: localReq.id,
            club: localReq.clubName,
            school: localReq.school,
            who: '이 기기',
            code: localReq.code ?? '',
            at: '방금',
            gotCode: false,
            state: localReq.state,
            mine: true,
          },
        ]
      : []),
    ...clubRequests,
  ]

  const pending = rows.filter((r) => r.state === 'pending' && !handled[r.id])
  const done = rows.filter((r) => r.state !== 'pending' || handled[r.id])

  const card = (r: Row) => (
    <div key={r.id} className="lui-card s32-req">
      <div className="s32-req__head">
        <span className="s32-req__club">{r.club}</span>
        <span className={`lui-pill lui-pill--lg${r.gotCode ? '' : ' lui-pill--outline'}`}>
          {r.gotCode ? t.got : t.notGot}
        </span>
      </div>
      <p className="s32-req__sub">
        {r.school} · {r.who} · {r.at}
      </p>
      {r.mine && <p className="s32-req__mine">{t.mine}</p>}

      {/* 운영자가 눈으로 맞춰 볼 값 — 크게 둡니다 */}
      <div className="s32-req__code">{r.code}</div>
      <p className="s32-req__hint">{t.gotNote}</p>

      <div className="s32-req__acts">
        <Button variant="ghost" onClick={() => setAsk({ r, to: 'reject' })}>
          {t.reject}
        </Button>
        <Button onClick={() => setAsk({ r, to: 'approve' })}>{t.approve}</Button>
      </div>
    </div>
  )

  return (
    <Phone>
      <TopBar title={t.title} back={false} />
      <div className="lui-body">
        <div className="s32">
          <div className="s32__gap-14" />
          <p className="s32__lead">{t.lead}</p>
          <div className="s32__gap-12" />
          <p className="s32__why">{t.why}</p>

          <div className="s32__gap-26" />
          <SectionHeader title="확인할 신청" aside={`${pending.length}건`} />
          {pending.length === 0 ? (
            <div className="lui-card s32-empty">
              <p className="s32-empty__title">{t.empty}</p>
              <p className="s32-empty__body">{t.emptyBody}</p>
            </div>
          ) : (
            <div className="s32__list">{pending.map(card)}</div>
          )}

          {done.length > 0 && (
            <>
              <div className="s32__gap-26" />
              <SectionHeader title={t.done} aside={`${done.length}건`} />
              <div className="lui-card s32__done">
                {done.map((r) => (
                  <div key={r.id} className="s32-done">
                    <span className="s32-done__club">{r.club}</span>
                    <span className="s32-done__state">
                      {(handled[r.id] ?? r.state) === 'approved' ? '승인함' : '거절함'}
                      {r.why ? ` · ${r.why}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="s32__gap-22" />
          <p className="s32__note">{t.note}</p>
          <div className="s32__gap-26" />
        </div>
      </div>

      <Sheet
        open={ask !== null}
        title={
          ask ? (ask.to === 'approve' ? t.approveAsk(ask.r.club) : t.rejectAsk(ask.r.club)) : ''
        }
        onClose={close}
      >
        <p className="lui-menu__note">{ask?.to === 'approve' ? t.approveBody : t.rejectBody}</p>

        {ask?.to === 'reject' && (
          <div className="s32__reasons">
            {[...t.reasons, t.reasonOwn].map((r) => (
              <button
                key={r}
                type="button"
                className={`s32-reason${why === r ? ' s32-reason--on' : ''}`}
                onClick={() => setWhy(r)}
                aria-pressed={why === r}
              >
                {r}
              </button>
            ))}
            {why === t.reasonOwn && (
              <textarea
                className="s32__own"
                value={own}
                onChange={(e) => setOwn(e.target.value)}
                placeholder="한 줄이면 됩니다"
                rows={2}
              />
            )}
          </div>
        )}

        <div className="s32__pair">
          <Button variant="ghost" onClick={close}>
            그대로 두기
          </Button>
          {ask?.to === 'approve' ? (
            <Button
              onClick={() => {
                if (!ask) return
                // 이 기기가 보낸 신청이면 소속이 실제로 생깁니다
                if (ask.r.mine) approveClubJoin()
                setHandled((h) => ({ ...h, [ask.r.id]: 'approved' }))
                close()
              }}
            >
              {t.approve}
            </Button>
          ) : (
            <Button
              variant="danger"
              disabled={!reason.trim()}
              onClick={() => {
                if (!ask) return
                if (ask.r.mine) rejectClubJoin(reason.trim())
                setHandled((h) => ({ ...h, [ask.r.id]: 'rejected' }))
                close()
              }}
            >
              {t.reject}
            </Button>
          )}
        </div>
      </Sheet>
    </Phone>
  )
}

export default S32Admin
