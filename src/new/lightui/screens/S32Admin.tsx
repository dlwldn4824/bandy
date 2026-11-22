import { useState } from 'react'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import Button from '../components/Button.tsx'
import Sheet from '../components/Sheet.tsx'
import { approveClubJoin, rejectClubJoin, useClubJoin } from '../auth/clubJoin.ts'
import { useAdminGate, type AdminGateResult } from '../auth/adminGate.ts'
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
 * 건이라 탭에도 메뉴에도 두지 않았습니다.
 *
 * 한동안 주소만 알면 열렸습니다. 「가짜 자물쇠를 달면 막아 둔 줄 알게
 * 된다」 고 생각해서 비워 뒀는데, **주소를 아는 것은 비밀이 아니었습니다.**
 * 막 가입한 계정으로 열면 자기가 보낸 생성 신청이 승인 버튼과 함께 떠
 * 있었고, 누르면 그 자리에서 운영진 소속이 생겼습니다 — 이 화면이 막으려던
 * 바로 그 일입니다.
 *
 * 지금은 서버에 물어서 엽니다(`auth/adminGate.ts`). 가짜 자물쇠가 아니라
 * `ADMIN_LOGIN_CODE` 를 서버가 맞춰 보는 진짜 자물쇠입니다.
 */
const S32Admin = () => {
  const { ok: unlocked, verifyAdminCode } = useAdminGate()
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

  if (!unlocked) return <AdminLock verify={verifyAdminCode} />

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

/**
 * 운영자 코드를 묻는 자리.
 *
 * 틀린 까닭을 구분해 말합니다 — 코드가 틀린 것과 서버에 못 닿은 것과
 * 아직 코드를 안 넣어 둔 것은 할 일이 전혀 다릅니다. 「열 수 없습니다」
 * 한 줄로 뭉치면 운영자가 어디를 봐야 할지 모릅니다.
 */
const LOCK_SAYS: Record<Exclude<AdminGateResult, 'ok'>, string> = {
  wrong: '코드가 다릅니다.',
  too_many: '여러 번 틀렸습니다. 잠시 뒤에 다시 해 주세요.',
  not_configured: '서버에 운영자 코드(ADMIN_LOGIN_CODE)가 아직 없습니다.',
  unreachable: '서버에 닿지 못했습니다. 잠시 뒤에 다시 해 주세요.',
}

const AdminLock = ({ verify }: { verify: (code: string) => Promise<AdminGateResult> }) => {
  const [code, setCode] = useState('')
  const [says, setSays] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  const submit = async () => {
    if (!code.trim() || asking) return
    setAsking(true)
    setSays(null)
    const r = await verify(code)
    setAsking(false)
    if (r === 'ok') return
    setCode('')
    setSays(LOCK_SAYS[r])
  }

  return (
    <Phone>
      <TopBar title={t.title} back={false} />
      <div className="lui-body">
        <div className="s32-lock">
          <div className="lui-card s32-lock__card">
            <p className="s32-lock__title">운영자 코드를 넣어 주세요</p>
            <p className="s32-lock__sub">
              동아리 생성 신청을 확인하는 자리입니다. 밴디 운영자만 엽니다.
            </p>
            <input
              className="lui-input s32-lock__input"
              type="password"
              value={code}
              autoComplete="off"
              placeholder="운영자 코드"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
            />
            {says && <p className="s32-lock__says">{says}</p>}
          </div>
        </div>
      </div>
      <div className="lui-bottombar lui-bottombar--stack">
        <Button block disabled={!code.trim() || asking} onClick={() => void submit()}>
          {asking ? '확인하는 중…' : '열기'}
        </Button>
      </div>
    </Phone>
  )
}

export default S32Admin
