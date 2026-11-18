import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { InstallCard } from '../convenience'
import { device, safeNext } from '../device'
import { useBandy } from '../store'
import { isOverdue, managerClubIds, safeUrl } from '../repo'
import { PERSONAS } from '../seed'
import { Empty, PageHeader, Thumb } from '../components'
import { dateLabel, won } from '../format'

// 구조도 ① 로그인: 회원 유형(개인 / 동아리) → 홈. 프로토타입은 실제 인증 대신 시연 역할을 고른다.
const PERSONA_TYPE: Record<string, 'personal' | 'club'> = {
  'u-audience': 'personal', 'u-admin': 'personal', 'u-rexa': 'club', 'u-melodic': 'club',
}

export function LoginPage() {
  const { backend, call, showToast } = useBandy()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next')) // 로그인 후 보던 화면으로 돌아간다
  const lastPersona = device.get().lastPersona
  const [type, setType] = useState<'personal' | 'club'>(lastPersona && PERSONA_TYPE[lastPersona] === 'club' ? 'club' : 'personal')
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>(params.get('reset') ? 'reset' : 'login')
  const [email, setEmail] = useState(device.get().lastEmail ?? '') // 이 기기에서 마지막으로 쓴 이메일
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  if (backend.mode === 'local') {
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
            <button key={p.id} type="button" className={`b-option${p.id === lastPersona ? ' on' : ''}`} onClick={async () => { await call((b) => b.signInPersona(p.id)); device.set({ lastPersona: p.id }); showToast(`${p.label}(으)로 들어왔어요.`); navigate(next, { replace: true }) }}>
              <strong>{p.label}{p.id === lastPersona ? ' · 최근 로그인' : ''}</strong>
              <span className="b-sub">{p.hint}</span>
            </button>
          ))}
        </div>
        <p className="b-note">데모 모드(Supabase 미연결)라 시연 역할로 들어갑니다.</p>
        <Link className="b-link" to="/app/clubs/new">동아리 등록하기</Link>
      </div>
    )
  }

  // 비밀번호 재설정: 메일 보내기 / 메일 링크로 돌아와 새 비밀번호 저장
  if (mode === 'forgot' || mode === 'reset') {
    const send = async () => {
      const r = await call((b) => (mode === 'forgot' ? b.sendPasswordReset(email.trim()) : b.updatePassword(password)), { reload: false })
      if (!r.ok) { setError(r.error); return }
      setError('')
      if (mode === 'forgot') showToast('비밀번호를 바꿀 수 있는 메일을 보냈어요.')
      else { showToast('새 비밀번호로 바꿨어요.'); navigate('/app', { replace: true }) }
    }
    return (
      <div className="b-page">
        <PageHeader back title={mode === 'forgot' ? '비밀번호 찾기' : '새 비밀번호'} />
        <form className="b-stack" onSubmit={(e) => { e.preventDefault(); send() }}>
          {mode === 'forgot'
            ? <label className="b-field"><span>가입한 이메일</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
            : <label className="b-field"><span>새 비밀번호 (6자 이상)</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>}
          {error && <p className="b-warn">{error}</p>}
          <button type="submit" className="b-btn">{mode === 'forgot' ? '메일 보내기' : '저장'}</button>
        </form>
        <button type="button" className="b-link" onClick={() => { setMode('login'); setError('') }}>로그인으로</button>
      </div>
    )
  }

  // Supabase: 이메일 로그인 · 가입, 카카오(Supabase Auth 제공자 설정 후)
  const submit = async () => {
    const r = await call((b) => (mode === 'login' ? b.signInEmail(email, password) : b.signUpEmail(email, password, name)))
    if (!r.ok) { setError(r.error); return }
    device.set({ lastEmail: email.trim() })
    showToast(mode === 'login' ? '로그인했어요. 이 기기에서는 로그인이 유지돼요.' : '가입했어요. 메일 인증이 켜져 있으면 메일을 확인해 주세요.')
    navigate(next, { replace: true })
  }
  return (
    <div className="b-page">
      <PageHeader back title={mode === 'login' ? '로그인' : '회원가입'} />
      <p className="b-sub">개인 · 동아리 회원 모두 같은 계정을 씁니다. 동아리 회원은 로그인 후 동아리를 등록하거나 운영진으로 추가돼요.</p>
      <form className="b-stack" onSubmit={(e) => { e.preventDefault(); submit() }}>
        {mode === 'signup' && <label className="b-field"><span>이름</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
        <label className="b-field"><span>이메일</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="b-field"><span>비밀번호</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {error && <p className="b-warn">{error}</p>}
        <button type="submit" className="b-btn">{mode === 'login' ? '로그인' : '가입하기'}</button>
      </form>
      <button type="button" className="b-btn ghost" onClick={async () => { const r = await call((b) => b.signInKakao(next)); if (!r.ok) setError(r.error) }}>카카오로 로그인</button>
      {mode === 'login' && <button type="button" className="b-link" onClick={() => { setMode('forgot'); setError('') }}>비밀번호를 잊었어요</button>}
      <button type="button" className="b-link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
        {mode === 'login' ? '계정이 없나요? 회원가입' : '이미 계정이 있나요? 로그인'}
      </button>
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
  const { backend, db, me, call, showToast } = useBandy()
  // 로그아웃하면 이 기기에 남긴 QR·입금자명도 지운다(공용 기기 대비)
  const logout = async () => { await call((b) => b.signOut()); device.clearPersonal() }
  const reset = async () => { const r = await call((b) => b.reset()); showToast(r.ok ? '시연 데이터를 처음으로 되돌렸어요.' : r.error) }
  const [name, setName] = useState(me?.display_name ?? '')
  const [settings, setSettings] = useState<NotifySettings>(readSettings)

  if (!me) {
    return (
      <div className="b-page">
        <PageHeader title="마이페이지" />
        <div className="b-card b-pad b-stack b-center">
          <p className="b-sub">로그인하면 예매 내역과 동아리 관리를 볼 수 있어요.</p>
          <Link to="/app/login?next=%2Fapp%2Fmy" className="b-btn">로그인</Link>
        </div>
        {backend.mode === 'local' && <button type="button" className="b-reset" onClick={reset}>시연 데이터 처음으로 되돌리기</button>}
      </div>
    )
  }
  const clubs = managerClubIds(db, me.id).map((id) => db.clubs.find((c) => c.id === id)).filter((c) => !!c)
  // 부원(MEMBER)으로 가입했거나 가입 신청 중인 동아리
  const joined = db.club_memberships.filter((m) => m.user_id === me.id && m.role === 'MEMBER' && (m.status === 'ACTIVE' || m.status === 'PENDING'))
  const pendingClubs = me.is_admin ? db.clubs.filter((c) => c.status === 'PENDING') : []
  const bookings = db.bookings.filter((b) => b.user_id === me.id && b.status !== 'CANCELLED' && b.channel !== 'ONSITE').sort((a, b) => b.created_at.localeCompare(a.created_at))
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
        {backend.mode === 'local' && <Link to="/app/login" className="b-text-btn">역할 바꾸기</Link>}
      </section>

      {me.is_admin && (
        <section className="b-stack">
          <h2 className="b-h2">동아리 승인 대기</h2>
          {pendingClubs.map((c) => (
            <article key={c.id} className="b-card b-pad b-stack">
              <strong>{c.name}</strong>
              <p className="b-sub">{c.school} · {c.genre} · {c.region}</p>
              {safeUrl(c.sns_url) && <a className="b-link" href={safeUrl(c.sns_url)!} target="_blank" rel="noreferrer">SNS에서 확인</a>}
              <div className="b-row">
                <button type="button" className="b-btn small" onClick={async () => { const r = await call((b) => b.setClubStatus(c.id, 'ACTIVE')); showToast(r.ok ? '승인했어요.' : r.error) }}>승인</button>
                <button type="button" className="b-btn ghost small" onClick={async () => { const r = await call((b) => b.setClubStatus(c.id, 'REJECTED')); showToast(r.ok ? '거절했어요.' : r.error) }}>거절</button>
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
            <h2 className="b-h2">동아리 · {c.name} {c.status !== 'ACTIVE' && <span className="b-status wait">{c.status === 'PENDING' ? '승인 대기' : c.status === 'SUSPENDED' ? '정지됨' : '거절됨'}</span>}</h2>
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

      {joined.length > 0 && (
        <section className="b-stack">
          <h2 className="b-h2">가입한 동아리</h2>
          {joined.map((m) => (
            <article key={m.id} className="b-card b-pad b-row between">
              <Link to={`/app/c/${m.club_id}`} className="b-link">{db.clubs.find((c) => c.id === m.club_id)?.name ?? '동아리'}</Link>
              <span className="b-row">
                <span className={`b-status${m.status === 'ACTIVE' ? ' ok' : ' wait'}`}>{m.status === 'ACTIVE' ? '부원' : '가입 신청 중'}</span>
                <button type="button" className="b-btn ghost small" onClick={async () => { const r = await call((b) => b.removeMember(m.id)); showToast(r.ok ? (m.status === 'ACTIVE' ? '탈퇴했어요.' : '신청을 취소했어요.') : r.error) }}>{m.status === 'ACTIVE' ? '탈퇴' : '신청 취소'}</button>
              </span>
            </article>
          ))}
        </section>
      )}

      <section className="b-stack">
        <div className="b-row between">
          <h2 className="b-h2">예매 내역</h2>
          <Link to="/app/tickets" className="b-link">내 티켓</Link>
        </div>
        {bookings.slice(0, 5).map((b) => {
          const ev = db.events.find((e) => e.id === b.event_id)
          const label = b.status === 'CONFIRMED' ? '확정' : b.status === 'EXPIRED' || isOverdue(b, db) ? '기한 만료' : '입금 대기'
          return (
            <Link key={b.id} to={`/app/e/${b.event_id}`} className="b-card b-pad b-row between">
              <span className="b-stack tight">
                <strong>{ev?.title ?? '(공연 정보를 불러오지 못했어요)'}</strong>
                <span className="b-sub">{ev ? `${dateLabel(ev.starts_at)} · ` : ''}{won(b.total_amount_krw)}{ev?.status === 'CANCELLED' ? ' · 공연 취소' : ''}</span>
              </span>
              <span className={`b-status ${b.status === 'CONFIRMED' ? 'ok' : 'wait'}`}>{label}</span>
            </Link>
          )
        })}
        {bookings.length === 0 && <Empty>예매 내역이 없어요.</Empty>}
      </section>

      <InstallCard />

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
            <button type="button" className="b-btn small" disabled={name.trim() === me.display_name} onClick={async () => { const r = await call((b) => b.updateProfile(name)); showToast(r.ok ? '저장했어요.' : r.error) }}>저장</button>
          </span>
        </label>
        <button type="button" className="b-btn ghost" onClick={logout}>로그아웃</button>
      </section>

      {clubs.length === 0 && <Link to="/app/clubs/new" className="b-btn ghost">동아리 등록하기</Link>}
      {backend.mode === 'local' && <button type="button" className="b-reset" onClick={reset}>시연 데이터 처음으로 되돌리기</button>}
    </div>
  )
}
