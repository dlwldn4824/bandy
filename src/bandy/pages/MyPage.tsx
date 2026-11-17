import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useBandy } from '../store'
import { managerClubIds, markNotificationsRead, setClubStatus } from '../repo'
import { PERSONAS } from '../seed'
import { APP_NAME, Empty, PageHeader } from '../components'
import { dateLabel, shortDate, won } from '../format'

// 와이어프레임 「01 로그인」: 회원 유형(개인/동아리) 선택 → 로그인.
// 프로토타입은 실제 인증 대신 시연 역할을 고른다.
const PERSONA_TYPE: Record<string, 'personal' | 'club'> = {
  'u-audience': 'personal', 'u-admin': 'personal', 'u-rexa': 'club', 'u-melodic': 'club',
}

export function LoginPage() {
  const { login, showToast } = useBandy()
  const navigate = useNavigate()
  const [type, setType] = useState<'personal' | 'club'>('personal')
  return (
    <div className="b-page">
      <PageHeader back />
      <span className="b-logo">{APP_NAME}</span>
      <div>
        <h1 className="b-detail-title">로그인</h1>
        <p className="b-sub">회원 유형을 선택하고 로그인하세요.</p>
      </div>
      <div className="b-seg">
        <button type="button" className={type === 'personal' ? 'on' : ''} onClick={() => setType('personal')}>개인 회원</button>
        <button type="button" className={type === 'club' ? 'on' : ''} onClick={() => setType('club')}>동아리 회원</button>
      </div>
      <div className="b-stack">
        {PERSONAS.filter((p) => PERSONA_TYPE[p.id] === type).map((p) => (
          <button
            key={p.id}
            type="button"
            className="b-option"
            onClick={() => {
              login(p.id)
              showToast(`${p.label}(으)로 들어왔어요.`)
              navigate('/app')
            }}
          >
            <strong>{p.label}</strong>
            <span className="b-sub">{p.hint}</span>
          </button>
        ))}
      </div>
      <p className="b-note">프로토타입이라 실제 로그인 대신 시연 역할로 들어갑니다. 실제 로그인 방식(카카오 / 이메일)은 Supabase 연결 때 정합니다.</p>
      <p className="b-note center">동아리 회원은 로그인 후 하단 가운데 <b>+</b>에서 공연을 등록해요. 동아리가 없다면 <Link className="b-accent-link" to="/app/clubs/new">동아리 등록하기</Link></p>
    </div>
  )
}

// IA: 개인 회원 = 프로필 · 예매 내역 · 알림 / 동아리 회원 = 동아리 프로필 · 등록 공연 · 공연 관리 · 예매자 관리
export function MyPage() {
  const { db, me, run, logout, reset, showToast } = useBandy()
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#notices') document.getElementById('notices')?.scrollIntoView()
  }, [hash])

  if (!me) {
    return (
      <div className="b-page">
        <PageHeader title="마이페이지" />
        <div className="b-card b-pad b-stack b-center">
          <p className="b-sub">로그인하면 내 티켓, 동아리 관리, 알림을 볼 수 있어요.</p>
          <Link to="/app/login" className="b-btn">로그인</Link>
        </div>
        <ResetButton onReset={() => { reset(); showToast('시연 데이터를 처음으로 되돌렸어요.') }} />
      </div>
    )
  }
  const clubs = managerClubIds(db, me.id).map((id) => db.clubs.find((c) => c.id === id)!)
  const notes = db.notifications.filter((n) => n.user_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const unread = notes.filter((n) => !n.read_at).length
  const pendingClubs = me.is_admin ? db.clubs.filter((c) => c.status === 'PENDING') : []
  const bookings = db.bookings.filter((b) => b.user_id === me.id && b.status !== 'CANCELLED')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div className="b-page">
      <PageHeader title="마이페이지" right={<button type="button" className="b-ghost-chip" onClick={logout}>로그아웃</button>} />
      <section className="b-card b-pad b-row between">
        <span className="b-stack tight">
          <strong className="b-name">{me.display_name}</strong>
          <span className="b-sub">{clubs.length ? '동아리 회원' : '개인 회원'}{me.is_admin ? ' · 밴디 운영자' : ''}</span>
        </span>
        <Link to="/app/login" className="b-ghost-chip">역할 바꾸기</Link>
      </section>

      {me.is_admin && (
        <section className="b-stack">
          <h2 className="b-h2">동아리 승인 대기</h2>
          {pendingClubs.map((c) => (
            <article key={c.id} className="b-card b-pad b-stack">
              <strong>{c.name}</strong>
              <p className="b-sub">{c.school} · {c.genre} · {c.region}</p>
              {c.sns_url && <a className="b-accent-link" href={c.sns_url} target="_blank" rel="noreferrer">인스타그램에서 확인</a>}
              <div className="b-row">
                <button type="button" className="b-btn small" onClick={() => { const r = run((d) => setClubStatus(d, me.id, c.id, 'ACTIVE')); showToast(r.ok ? '승인했어요.' : r.error) }}>승인</button>
                <button type="button" className="b-btn ghost small" onClick={() => { const r = run((d) => setClubStatus(d, me.id, c.id, 'REJECTED')); showToast(r.ok ? '거절했어요.' : r.error) }}>거절</button>
              </div>
            </article>
          ))}
          {pendingClubs.length === 0 && <Empty>승인할 동아리가 없어요.</Empty>}
        </section>
      )}

      {clubs.length > 0 && (
        <section className="b-stack">
          <h2 className="b-h2">내 동아리</h2>
          {clubs.map((c) => {
            const events = db.events.filter((e) => e.club_id === c.id)
            return (
              <Link key={c.id} to={`/app/manage/${c.id}`} className="b-card b-club">
                <span className="b-avatar">{c.name.slice(0, 1)}</span>
                <span className="b-club-body"><strong>{c.name}</strong><span className="b-sub">등록 공연 {events.length}개 · 공연 관리 · 예매자 관리</span></span>
                {c.status === 'ACTIVE' ? <span className="b-status ok">승인됨</span> : <span className="b-status wait">{c.status === 'PENDING' ? '승인 대기' : '거절됨'}</span>}
              </Link>
            )
          })}
        </section>
      )}

      <section className="b-stack">
        <div className="b-row between">
          <h2 className="b-h2">예매 내역</h2>
          <Link to="/app/tickets" className="b-sub">내 티켓</Link>
        </div>
        {bookings.slice(0, 5).map((b) => {
          const ev = db.events.find((e) => e.id === b.event_id)!
          return (
            <Link key={b.id} to={`/app/e/${ev.id}`} className="b-card b-pad b-row between">
              <span className="b-stack tight"><strong>{ev.title}</strong><span className="b-sub">{dateLabel(ev.starts_at)} · {won(b.total_amount_krw)}</span></span>
              <span className={`b-status ${b.status === 'CONFIRMED' ? 'ok' : 'wait'}`}>{b.status === 'CONFIRMED' ? '확정' : '입금 대기'}</span>
            </Link>
          )
        })}
        {bookings.length === 0 && <Empty>예매 내역이 없어요.</Empty>}
      </section>

      {clubs.length === 0 && <Link to="/app/clubs/new" className="b-btn ghost">우리 동아리 등록하기</Link>}

      <section className="b-stack" id="notices">
        <div className="b-row between">
          <h2 className="b-h2">알림 {unread > 0 && <span className="b-status wait">{unread}</span>}</h2>
          {unread > 0 && <button type="button" className="b-accent-link" onClick={() => run((d) => markNotificationsRead(d, me.id))}>모두 읽음</button>}
        </div>
        {notes.slice(0, 10).map((n) => (
          <div key={n.id} className={`b-card b-pad b-notice${n.read_at ? '' : ' unread'}`}>
            <p>{n.message}</p>
            <p className="b-sub">{shortDate(n.created_at)}</p>
          </div>
        ))}
        {notes.length === 0 && <Empty>알림이 없어요.</Empty>}
      </section>
      <ResetButton onReset={() => { reset(); showToast('시연 데이터를 처음으로 되돌렸어요.') }} />
    </div>
  )
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return <button type="button" className="b-reset" onClick={onReset}>시연 데이터 처음으로 되돌리기</button>
}
