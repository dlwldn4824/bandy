import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TabBar from '../components/TabBar.tsx'
import TopBar from '../components/TopBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import Dots from '../components/Dots.tsx'
import Button from '../components/Button.tsx'
import Icon from '../components/Icon.tsx'
import Sheet from '../components/Sheet.tsx'
import ConnectedResult from '../components/ConnectedResult.tsx'
import { P } from '../paths.ts'
import { useRole } from '../auth/role.ts'
import { subjectParticle, withParticle } from '../korean.ts'
import type { ReceivedProposal } from '../../mocks/bandyLight.ts'
import {
  myClub,
  receivedProposals,
  recruitPosts,
  sentProposals,
  suggestedClubs,
} from '../../mocks/bandyLight.ts'
import './L2Clubs.css'

/**
 * S25 함께 설 팀 — 모집 글과 제안.
 *
 * 전에는 동아리 탭(L2)에 있었습니다. 그런데 이건 **운영진이 하는 일**입니다.
 * 탭이 다섯 칸뿐이라, 관객이면서 부원인 사람이 「어느 탭에서 찾지」 하고
 * 헤맸습니다. 그래서 관객이 쓰는 것은 동아리 탭에 남기고, 운영하는 일은
 * 마이 > 운영(S18) 아래로 모았습니다.
 *
 * 화면 자체는 옮겨 온 것이라 안의 세 탭은 그대로입니다.
 */

/** 「멜로딕이 렉사와」 처럼 조사를 붙여 한 줄로 */
function connectedLine(mine: string, theirs: string) {
  const a = mine.split(' · ')[0]
  const b = theirs.split(' · ')[0]
  return `${a}${withParticle(a)} ${b}${subjectParticle(b)}`
}

type TabKey = 'recruit' | 'received' | 'sent'

const S25ClubOps = () => {
  const [params, setParams] = useSearchParams()
  const { isManager } = useRole()

  const asked = params.get('tab') as TabKey | null
  const allowed: TabKey[] = isManager ? ['recruit', 'received', 'sent'] : ['recruit', 'received']
  const tab: TabKey = asked && allowed.includes(asked) ? asked : 'recruit'

  const goTab = (next: TabKey) => {
    const q = new URLSearchParams(params)
    if (next === 'recruit') q.delete('tab')
    else q.set('tab', next)
    setParams(q)
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'recruit', label: '팀 구해요' },
    { key: 'received', label: `받은 제안 ${myClub.received}` },
    ...(isManager ? [{ key: 'sent' as TabKey, label: '보낸 제안' }] : []),
  ]

  return (
    <Phone>
      <TopBar title="함께 설 팀" back={P.console} />
      <div className="lui-body">
        <div className="l2">
          <div className="l2__gap-14" />
          <div className="lui-utabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={t.key === tab}
                className={`lui-utab${t.key === tab ? ' lui-utab--on' : ''}`}
                onClick={() => goTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'recruit' && <RecruitTab />}
          {tab === 'received' && <ReceivedTab />}
          {tab === 'sent' && isManager && <SentTab />}
        </div>
      </div>
      <TabBar active="my" />
    </Phone>
  )
}

export default S25ClubOps

/* ── 팀 구해요 ──────────────────────────────────────── */
const RecruitTab = () => {
  const navigate = useNavigate()
  const { isManager } = useRole()

  return (
    <>
      <div className="l2__posts">
        {recruitPosts.map((post) => (
          <div key={post.id} className="lui-card l2-post">
            <div className="l2-post__head">
              <span className="l2-post__avatar">{post.initial}</span>
              <span className="l2-post__who">
                <span className="l2-post__club">{post.club}</span>
                <span className="l2-post__clubsub">{post.clubSub}</span>
              </span>
              <span className={`lui-pill${post.badgeAccent ? '' : ' lui-pill--soft'}`}>
                {post.badge}
              </span>
            </div>

            <p className="l2-post__title">
              {post.titleLines.map((line, i) => (
                <span key={line}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </p>

            <div className="l2-post__info">
              {post.info.map((row) => (
                <div key={row.k} className="l2-post__row">
                  <span className="l2-post__k">{row.k}</span>
                  <span className={`l2-post__v${row.accent ? ' l2-post__v--accent' : ''}`}>
                    {row.v}
                  </span>
                </div>
              ))}
              <div className="l2-post__row">
                <span className="l2-post__k">모인 팀</span>
                <span className="l2-post__joined">
                  <Dots filled={post.joined} total={post.need} />
                  <span className="l2-post__v">
                    {post.joined} / {post.need}팀
                  </span>
                </span>
              </div>
            </div>

            <div className="l2-post__actions">
              {/* 제안을 보내는 건 운영진 일입니다 */}
              {isManager && (
                <Button variant="ghost" onClick={() => navigate(P.chat(post.id))}>
                  제안 보내기
                </Button>
              )}
              <Button variant="ghost" onClick={() => navigate(P.proposal(post.id))}>
                자세히
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="l2__gap-28" />
      <SectionHeader title="이런 동아리는 어때요" aside="더보기" onAside={() => navigate(P.search)} />
      <div className="l2__suggest">
        {suggestedClubs.map((club) => (
          <div key={club.name} className="lui-card l2-sug">
            <span className="l2-sug__avatar">{club.initial}</span>
            <span className="l2-sug__name">{club.name}</span>
            <span className="l2-sug__lines">
              {club.lines[0]}
              <br />
              {club.lines[1]}
            </span>
            <Button variant="ghost" onClick={() => navigate(P.club(club.name))}>
              제안
            </Button>
          </div>
        ))}
      </div>

      <div className="l2__gap-18" />
      {isManager ? (
        /* 규칙 1 — 이 화면의 유일한 기본 버튼 */
        <Button className="l2__write" onClick={() => navigate(P.recruitNew)}>
          모집 글 쓰기
        </Button>
      ) : (
        <p className="lui-note l2__note">모집 글은 운영진만 쓸 수 있어요.</p>
      )}
    </>
  )
}

/* ── 받은 제안 (L2-b 304:2) ─────────────────────────── */
const ReceivedTab = () => {
  const navigate = useNavigate()
  const { isManager } = useRole()
  const [accepted, setAccepted] = useState<string[]>([])
  const [confirming, setConfirming] = useState<string | null>(null)
  // 수락한 순간 이 화면 위에 「연결되었어요」 가 덮입니다 (C4)
  const [celebrating, setCelebrating] = useState<ReceivedProposal | null>(null)

  const waiting = receivedProposals.waiting.filter((p) => !accepted.includes(p.id))
  const past = [
    ...receivedProposals.waiting
      .filter((p) => accepted.includes(p.id))
      .map((p) => ({ id: p.id, initial: p.initial, club: p.club, sub: p.title, state: '수락함' as const })),
    ...receivedProposals.past,
  ]
  const target = receivedProposals.waiting.find((p) => p.id === confirming)

  return (
    <>
      <SectionHeader title="답을 기다리는 제안" aside={String(waiting.length)} />
      <div className="l2__gap-12" />
      {waiting.length === 0 ? (
        <p className="lui-note l2__note">답을 기다리는 제안이 없어요.</p>
      ) : (
        <div className="l2__posts">
          {waiting.map((p) => (
            <div key={p.id} className="lui-card l2-post">
              <button
                type="button"
                className="l2-post__open"
                onClick={() => navigate(P.proposal(p.id))}
              >
                <span className="l2-post__head">
                  <span className="l2-post__avatar">{p.initial}</span>
                  <span className="l2-post__who">
                    <span className="l2-post__club">{p.club}</span>
                    <span className="l2-post__clubsub">{p.clubSub}</span>
                  </span>
                  <span className={`lui-pill${p.badgeAccent ? '' : ' lui-pill--soft'}`}>
                    {p.badge}
                  </span>
                </span>
                <span className="l2-post__title">{p.title}</span>
                <span className="l2-post__info">
                  {p.terms.map((row) => (
                    <span key={row.k} className="l2-post__row">
                      <span className="l2-post__k">{row.k}</span>
                      <span className={`l2-post__v${row.accent ? ' l2-post__v--accent' : ''}`}>
                        {row.v}
                      </span>
                    </span>
                  ))}
                </span>
              </button>

              <div className="l2-post__actions">
                {/* 목록에는 기본 버튼을 두지 않습니다 — 검정 수락은 상세(S6)에만 */}
                {isManager && (
                  <Button variant="ghost" onClick={() => setConfirming(p.id)}>
                    수락
                  </Button>
                )}
                <Button variant="ghost" onClick={() => navigate(P.proposal(p.id))}>
                  자세히
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="l2__gap-28" />
      <SectionHeader title="지난 제안" aside={String(past.length)} />
      <div className="l2__gap-12" />
      <div className="lui-card l2__pastlist">
        {past.map((p) => (
          <button
            key={p.id}
            type="button"
            className="lui-row l2-pastrow"
            onClick={() => navigate(P.proposal(p.id))}
          >
            <span className="l2-post__avatar">{p.initial}</span>
            <span className="l2-post__who">
              <span className="l2-post__club">{p.club}</span>
              <span className="l2-post__clubsub">{p.sub}</span>
            </span>
            <span className={`lui-pill${p.state === '수락함' ? ' lui-pill--ink' : ' lui-pill--soft'}`}>
              {p.state}
            </span>
          </button>
        ))}
      </div>

      <div className="l2__gap-18" />
      <p className="lui-note l2__note">{receivedProposals.notice}</p>

      <Sheet open={!!target} title="이 제안을 수락할까요?" onClose={() => setConfirming(null)}>
        <p className="l2-sheet__text">
          {target?.club} 의 「{target?.title}」 을 수락합니다. 수락하면 상대 동아리에 바로 알림이 가고,
          대화방이 열립니다.
        </p>
        <div className="l2-sheet__actions">
          <Button variant="ghost" onClick={() => setConfirming(null)}>
            취소
          </Button>
          <Button
            onClick={() => {
              if (confirming) setAccepted((prev) => [...prev, confirming])
              setCelebrating(target ?? null)
              setConfirming(null)
            }}
          >
            수락하기
          </Button>
        </div>
      </Sheet>

      {celebrating && (
        <ConnectedResult
          overlay
          pair={[myClub.initial, celebrating.initial]}
          headline={[connectedLine(myClub.name, celebrating.club), '연결되었어요']}
          onSeeRecord={() => navigate(P.connection(celebrating.id))}
          onSecondary={() => setCelebrating(null)}
        />
      )}
    </>
  )
}

/* ── 보낸 제안 (L2-c 305:2) ─────────────────────────── */
const SentTab = () => {
  const navigate = useNavigate()
  const [cancelled, setCancelled] = useState<string[]>([])
  const [confirming, setConfirming] = useState<string | null>(null)

  const waiting = sentProposals.waiting.filter((p) => !cancelled.includes(p.id))
  const target = sentProposals.waiting.find((p) => p.id === confirming)

  return (
    <>
      <SectionHeader title="답을 기다리는 중" aside={String(waiting.length)} />
      <div className="l2__gap-12" />
      {waiting.length === 0 ? (
        <p className="lui-note l2__note">보낸 뒤 답을 기다리는 제안이 없어요.</p>
      ) : (
        <div className="l2__posts">
          {waiting.map((p) => (
            <div key={p.id} className="lui-card l2-post">
              <button
                type="button"
                className="l2-post__open"
                onClick={() => navigate(P.proposal(p.id))}
              >
                <span className="l2-post__head">
                  <span className="l2-post__avatar">{p.initial}</span>
                  <span className="l2-post__who">
                    <span className="l2-post__club">{p.club}</span>
                    <span className="l2-post__clubsub">{p.clubSub}</span>
                  </span>
                  <span className="lui-pill lui-pill--soft">{p.badge}</span>
                </span>
                <span className="l2-post__title">{p.title}</span>
                <span className="l2-post__info">
                  {p.terms.map((row) => (
                    <span key={row.k} className="l2-post__row">
                      <span className="l2-post__k">{row.k}</span>
                      <span className={`l2-post__v${row.accent ? ' l2-post__v--accent' : ''}`}>
                        {row.v}
                      </span>
                    </span>
                  ))}
                </span>
              </button>

              <div className="l2-post__actions">
                <Button variant="ghost" onClick={() => setConfirming(p.id)}>
                  제안 취소
                </Button>
                <Button variant="ghost" onClick={() => navigate(P.chat(p.id))}>
                  대화
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="l2__gap-28" />
      <SectionHeader title="답이 온 제안" aside={String(sentProposals.answered.length)} />
      <div className="l2__gap-12" />
      <div className="l2__posts">
        {sentProposals.answered.map((p) => (
          <div key={p.id} className="lui-card l2-post">
            <button
              type="button"
              className="l2-post__open"
              onClick={() => navigate(P.proposal(p.id))}
            >
              <span className="l2-post__head">
                <span className="l2-post__avatar">{p.initial}</span>
                <span className="l2-post__who">
                  <span className="l2-post__club">{p.club}</span>
                  <span className="l2-post__clubsub">{p.clubSub}</span>
                </span>
                <span
                  className={`lui-pill${p.state === '수락됨' ? ' lui-pill--ink' : ' lui-pill--soft'}`}
                >
                  {p.state}
                </span>
              </span>

              {p.terms && (
                <span className="l2-post__info">
                  {p.terms.map((row) => (
                    <span key={row.k} className="l2-post__row">
                      <span className="l2-post__k">{row.k}</span>
                      <span className="l2-post__v">{row.v}</span>
                    </span>
                  ))}
                </span>
              )}
              {p.reply && <span className="l2-quote">“{p.reply}”</span>}
            </button>

            {p.state === '수락됨' && (
              <div className="l2-post__actions">
                <Button variant="ghost" onClick={() => navigate(P.show('glow'))}>
                  공연 보기
                </Button>
                <Button variant="ghost" onClick={() => navigate(P.chat(p.id))}>
                  대화
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="l2__gap-12" />
      <button type="button" className="lui-card l2-more" onClick={() => navigate(P.search)}>
        <span className="l2-more__plus">+</span>
        <span className="l2-post__who">
          <span className="l2-post__club">{sentProposals.more.title}</span>
          <span className="l2-post__clubsub">{sentProposals.more.sub}</span>
        </span>
        <Icon name="chevron-right" size={18} className="l2-more__chev" />
      </button>

      <div className="l2__gap-18" />
      <p className="lui-note l2__note">{sentProposals.notice}</p>

      <Sheet open={!!target} title="보낸 제안을 취소할까요?" onClose={() => setConfirming(null)}>
        <p className="l2-sheet__text">
          {target?.club} 에 보낸 「{target?.title}」 을 거둬들입니다. 상대 동아리 목록에서도 사라집니다.
        </p>
        <div className="l2-sheet__actions">
          <Button variant="ghost" onClick={() => setConfirming(null)}>
            그대로 두기
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirming) setCancelled((prev) => [...prev, confirming])
              setConfirming(null)
            }}
          >
            제안 취소
          </Button>
        </div>
      </Sheet>
    </>
  )
}

