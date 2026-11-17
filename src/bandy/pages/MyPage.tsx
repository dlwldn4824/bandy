import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBandy } from '../store'
import { managerClubIds, setClubStatus, updateProfile } from '../repo'
import { PERSONAS } from '../seed'
import { Empty, PageHeader, Thumb } from '../components'
import { dateLabel, won } from '../format'

// 구조도 ① 로그인: 회원 유형(개인 / 동아리) → 홈. 프로토타입은 실제 인증 대신 시연 역할을 고른다.
const PERSONA_TYPE: Record<string, 'personal' | 'club'> = {
  'u-audience': 'personal', 'u-admin': 'personal', 'u-rexa': 'club', 'u-melodic': 'club',
}

export function LoginPage() {
  const { login, showToast } = useBandy()
  const navigate = useNavigate()
  const [type, setType] = useState<'personal' | 'club'>('personal')
  return (
    <div className="b-page">
      <PageHeader back title="로그인" />
      <p className="b-sub">회원 유형을 선택하고 로그인하세요.</p>
      <div className="b-seg">
        <button type="button" className={type === 'personal' ? 'on' : ''} onClick={() => setType('personal')}>개인 회원</button>
        <button type="button" className={type === 'club' ? 'on' : ''} onClick={() => setType('club')}>동아리 회원</button>
      </div>
      <div className="b-stack">
        {PERSONAS.filter((p) => PERSONA_TYPE[p.id] === type).map((p) => (
          <button key={p.id} type="button" className="b-option" onClick={() => { login(p.id); showToast(`${p.label}(으)로 들어왔어요.`); navigate('/app') }}>
            <strong>{p.label}</strong>
            <span className="b-sub">{p.hint}</span>
          </button>
        ))}
      </div>
      <p className="b-note">프로토타입이라 실제 로그인 대신 시연 역할로 들어갑니다. 로그인 방식은 Supabase 연결 때 정합니다.</p>
      <Link className="b-link" to="/app/clubs/new">동아리 등록하기</Link>
    </div>
  )
}

const SETTINGS_KEY = 'bandy-prototype-notify'
type NotifySettings = { booking: boolean; exchange: boolean }
function readSettings(): NotifySettings {
  try {
    return { booking: true, exchange: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return { booking: true, exchange: true }
  }
}

// 구조도 마이페이지: 개인 = 프로필 · 예매 내역 · 알림 설정 · 계정 설정 / 동아리 = 동아리 프로필 · 등록 공연 · 공연 관리 · 예매자 관리 · 계정 설정
export function MyPage() {
  const { db, me, run, logout, reset, showToast } = useBandy()
  const [name, setName] = useState(me?.display_name ?? '')
  const [settings, setSettings] = useState<NotifySettings>(readSettings)

  if (!me) {
    return (
      <div className="b-page">
        <PageHeader title="마이페이지" />
        <div className="b-card b-pad b-stack b-center">
          <p className="b-sub">로그인하면 예매 내역과 동아리 관리를 볼 수 있어요.</p>
          <Link to="/app/login" className="b-btn">로그인</Link>
        </div>
        <button type="button" className="b-reset" onClick={() => { reset(); showToast('시연 데이터를 처음으로 되돌렸어요.') }}>시연 데이터 처음으로 되돌리기</button>
      </div>
    )
  }
  const clubs = managerClubIds(db, me.id).map((id) => db.clubs.find((c) => c.id === id)!)
  const pendingClubs = me.is_admin ? db.clubs.filter((c) => c.status === 'PENDING') : []
  const bookings = db.bookings.filter((b) => b.user_id === me.id && b.status !== 'CANCELLED').sort((a, b) => b.created_at.localeCompare(a.created_at))
  const unread = db.notifications.filter((n) => n.user_id === me.id && !n.read_at).length

  const saveSetting = (next: NotifySettings) => {
    setSettings(next)
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch { /* 무시 */ }
  }

  return (
    <div className="b-page">
      <PageHeader title="마이페이지" right={<Link to="/app/notifications" className="b-text-btn">알림{unread > 0 && <span className="b-count">{unread}</span>}</Link>} />
      <section className="b-card b-pad b-row between">
        <span className="b-stack tight">
          <strong>{me.display_name}</strong>
          <span className="b-sub">{clubs.length ? '동아리 회원' : '개인 회원'}{me.is_admin ? ' · 밴디 운영자' : ''}</span>
        </span>
        <Link to="/app/login" className="b-text-btn">역할 바꾸기</Link>
      </section>

      {me.is_admin && (
        <section className="b-stack">
          <h2 className="b-h2">동아리 승인 대기</h2>
          {pendingClubs.map((c) => (
            <article key={c.id} className="b-card b-pad b-stack">
              <strong>{c.name}</strong>
              <p className="b-sub">{c.school} · {c.genre} · {c.region}</p>
              {c.sns_url && <a className="b-link" href={c.sns_url} target="_blank" rel="noreferrer">SNS에서 확인</a>}
              <div className="b-row">
                <button type="button" className="b-btn small" onClick={() => { const r = run((d) => setClubStatus(d, me.id, c.id, 'ACTIVE')); showToast(r.ok ? '승인했어요.' : r.error) }}>승인</button>
                <button type="button" className="b-btn ghost small" onClick={() => { const r = run((d) => setClubStatus(d, me.id, c.id, 'REJECTED')); showToast(r.ok ? '거절했어요.' : r.error) }}>거절</button>
              </div>
            </article>
          ))}
          {pendingClubs.length === 0 && <Empty>승인할 동아리가 없어요.</Empty>}
        </section>
      )}

      {clubs.map((c) => {
        const events = db.events.filter((e) => e.club_id === c.id)
        return (
          <section key={c.id} className="b-stack">
            <h2 className="b-h2">동아리 · {c.name} {c.status !== 'ACTIVE' && <span className="b-status wait">{c.status === 'PENDING' ? '승인 대기' : '거절됨'}</span>}</h2>
            <Link to={`/app/manage/${c.id}?tab=profile`} className="b-card b-club">
              {c.profile_path && <Thumb src={c.profile_path} className="round" />}
              <span className="b-grow b-stack tight"><strong>동아리 프로필</strong><span className="b-sub">{c.school} · {c.genre} · {c.region}</span></span>
              <span className="b-chev">›</span>
            </Link>
            <Link to={`/app/manage/${c.id}`} className="b-card b-club">
              <span className="b-grow b-stack tight"><strong>등록 공연 · 공연 관리 · 예매자 관리</strong><span className="b-sub">등록 공연 {events.length}개</span></span>
              <span className="b-chev">›</span>
            </Link>
          </section>
        )
      })}

      <section className="b-stack">
        <div className="b-row between">
          <h2 className="b-h2">예매 내역</h2>
          <Link to="/app/tickets" className="b-link">내 티켓</Link>
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

      <section className="b-card b-pad b-stack">
        <h2>알림 설정</h2>
        <label className="b-check"><input type="checkbox" checked={settings.booking} onChange={(e) => saveSetting({ ...settings, booking: e.target.checked })} /> 예매 · 입금 확인 알림</label>
        {clubs.length > 0 && <label className="b-check"><input type="checkbox" checked={settings.exchange} onChange={(e) => saveSetting({ ...settings, exchange: e.target.checked })} /> 교류 신청 알림</label>}
        <p className="b-note">[미정] 알림 발송 방식이 정해지지 않아 지금은 설정만 저장해요.</p>
      </section>

      <section className="b-card b-pad b-stack">
        <h2>계정 설정</h2>
        <label className="b-field">
          <span>표시 이름</span>
          <span className="b-row">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
            <button type="button" className="b-btn small" disabled={name.trim() === me.display_name} onClick={() => { const r = run((d) => updateProfile(d, me.id, name)); showToast(r.ok ? '저장했어요.' : r.error) }}>저장</button>
          </span>
        </label>
        <button type="button" className="b-btn ghost" onClick={logout}>로그아웃</button>
      </section>

      {clubs.length === 0 && <Link to="/app/clubs/new" className="b-btn ghost">동아리 등록하기</Link>}
      <button type="button" className="b-reset" onClick={() => { reset(); showToast('시연 데이터를 처음으로 되돌렸어요.') }}>시연 데이터 처음으로 되돌리기</button>
    </div>
  )
}
