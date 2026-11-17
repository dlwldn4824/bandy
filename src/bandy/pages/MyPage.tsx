import { Link, useNavigate } from 'react-router-dom'
import { useBandy } from '../store'
import { managerClubIds, markNotificationsRead, setClubStatus } from '../repo'
import { PERSONAS } from '../seed'
import { Empty } from '../components'
import { shortDate } from '../format'

export function LoginPage() {
  const { login, showToast } = useBandy()
  const navigate = useNavigate()
  return (
    <div className="b-page">
      <header className="b-top"><button type="button" className="b-back" onClick={() => navigate(-1)}>뒤로</button><span className="b-title">로그인</span></header>
      <div className="b-card b-pad b-stack">
        <button type="button" className="b-btn kakao" disabled>카카오로 시작하기 (Supabase 연결 후)</button>
        <p className="b-note">프로토타입에서는 아래 역할 중 하나로 들어가 흐름을 확인합니다.</p>
        {PERSONAS.map((p) => (
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
    </div>
  )
}

export function MyPage() {
  const { db, me, run, logout, reset, showToast } = useBandy()
  if (!me) {
    return (
      <div className="b-page">
        <header className="b-top"><span className="b-title">마이</span></header>
        <div className="b-card b-pad b-stack b-center">
          <p className="b-sub">로그인하면 내 티켓, 동아리 관리, 알림을 볼 수 있어요.</p>
          <Link to="/app/login" className="b-btn">카카오로 시작하기</Link>
        </div>
        <ResetButton onReset={() => { reset(); showToast('시연 데이터를 처음으로 되돌렸어요.') }} />
      </div>
    )
  }
  const clubs = managerClubIds(db, me.id).map((id) => db.clubs.find((c) => c.id === id)!)
  const notes = db.notifications.filter((n) => n.user_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const unread = notes.filter((n) => !n.read_at).length
  const pendingClubs = me.is_admin ? db.clubs.filter((c) => c.status === 'PENDING') : []
  const ticketCount = db.tickets.filter((t) => t.user_id === me.id && t.status !== 'CANCELLED').length

  return (
    <div className="b-page">
      <header className="b-top"><span className="b-title">마이</span><button type="button" className="b-back" onClick={logout}>로그아웃</button></header>
      <section className="b-card b-pad">
        <strong className="b-name">{me.display_name}</strong>
        <p className="b-sub">티켓 {ticketCount}장 · 운영하는 동아리 {clubs.length}곳{me.is_admin ? ' · 밴디 운영자' : ''}</p>
        <Link to="/app/login" className="b-link">다른 역할로 바꾸기</Link>
      </section>

      {me.is_admin && (
        <section className="b-stack">
          <h2 className="b-h2">동아리 승인 대기</h2>
          {pendingClubs.map((c) => (
            <article key={c.id} className="b-card b-pad b-stack">
              <strong>{c.name}</strong>
              <p className="b-sub">{c.school} · {c.genre} · {c.region}</p>
              {c.sns_url && <a className="b-link" href={c.sns_url} target="_blank" rel="noreferrer">인스타그램에서 확인</a>}
              <div className="b-row">
                <button type="button" className="b-btn small" onClick={() => { const r = run((d) => setClubStatus(d, me.id, c.id, 'ACTIVE')); showToast(r.ok ? '승인했어요.' : r.error) }}>승인</button>
                <button type="button" className="b-btn ghost small" onClick={() => { const r = run((d) => setClubStatus(d, me.id, c.id, 'REJECTED')); showToast(r.ok ? '거절했어요.' : r.error) }}>거절</button>
              </div>
            </article>
          ))}
          {pendingClubs.length === 0 && <Empty>승인할 동아리가 없어요.</Empty>}
        </section>
      )}

      <section className="b-stack">
        <h2 className="b-h2">내 동아리</h2>
        {clubs.map((c) => (
          <Link key={c.id} to={`/app/manage/${c.id}`} className="b-card b-club">
            <span className="b-avatar">{c.name.slice(0, 1)}</span>
            <span className="b-club-body"><strong>{c.name}</strong><span className="b-sub">공연 관리 · 입금 확인 · QR 입장</span></span>
            {c.status === 'ACTIVE' ? <span className="b-status ok">승인됨</span> : <span className="b-status wait">{c.status === 'PENDING' ? '승인 대기' : '거절됨'}</span>}
          </Link>
        ))}
        <Link to="/app/clubs/new" className="b-btn ghost">동아리 등록하기</Link>
      </section>

      <section className="b-stack">
        <div className="b-row between">
          <h2 className="b-h2">알림 {unread > 0 && <span className="b-status wait">{unread}</span>}</h2>
          {unread > 0 && <button type="button" className="b-link" onClick={() => run((d) => markNotificationsRead(d, me.id))}>모두 읽음</button>}
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
  return <button type="button" className="b-link muted" onClick={onReset}>시연 데이터 처음으로 되돌리기</button>
}
