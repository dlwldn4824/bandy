import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LOGOUT_IMAGE } from './model'
import { usePlatform } from './store'
import './platform.css'

function useHeaderHeight(pathname: string) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const header = ref.current
    if (!header) return
    const apply = () => {
      document.documentElement.style.setProperty('--pf-header', `${header.offsetHeight}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(header)
    return () => observer.disconnect()
  }, [pathname])

  return ref
}

export default function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session, logout, eventById } = usePlatform()
  const { isAuthenticated, logout: logoutAuth } = useAuth()
  const [ticketNotice, setTicketNotice] = useState(false)
  const headerRef = useHeaderHeight(location.pathname)
  const parts = location.pathname.split('/').filter(Boolean)
  const bare = parts[0] === 't' || parts[2] === 'book' || parts[2] === 'onsite' || parts[2] === 'staff'

  useEffect(() => {
    const bits = location.pathname.split('/').filter(Boolean)
    const show = bits[0] === 'e' ? eventById(bits[1]) : undefined
    const title = show
      ? `${show.title} · 공연`
      : bits[0] === 'host'
        ? (session?.role === 'host' ? '내 공연' : '동아리 로그인')
        : bits[0] === 'me'
          ? '내 티켓'
          : bits[0] === 'o'
            ? '동아리'
            : '공연 찾기'
    document.title = title
  }, [eventById, location.pathname, session])

  if (bare) {
    return (
      <div className="pf pf-bare">
        <Outlet />
      </div>
    )
  }

  const eventSection = parts[0] === 'e' && ['home', 'setlist', 'chat', 'guestbook', 'extras'].includes(parts[2] || '')
  const event = eventSection ? eventById(parts[1]) : undefined
  const hostReady = parts[0] === 'host' && session?.role === 'host'
  const logo = event?.title || (hostReady ? '내 공연' : parts[0] === 'host' ? '동아리' : parts[0] === 'me' ? '내 티켓' : '공연 찾기')

  const goLogo = () => {
    if (event) navigate(`/e/${event.id}/home`)
    else if (hostReady) navigate('/host')
    else navigate('/')
  }

  return (
    <div className="pf">
      <header className="pf-header" ref={headerRef}>
        <div className="pf-header-inner">
          <div className="pf-header-top">
            <button type="button" className="pf-logo" onClick={goLogo}>{logo}</button>
            {(session || isAuthenticated) && (
              <button
                type="button"
                className="pf-logout"
                onClick={() => {
                  logout()
                  logoutAuth()
                  navigate('/')
                }}
              >
                <img src={LOGOUT_IMAGE} alt="로그아웃" />
              </button>
            )}
          </div>
          <nav className="pf-nav">
            {event && (
              <>
                <NavLink className={({ isActive }) => `pf-tab${isActive ? ' active' : ''}`} to={`/e/${event.id}/home`}>홈</NavLink>
                <NavLink className={({ isActive }) => `pf-tab${isActive ? ' active' : ''}`} to={`/e/${event.id}/setlist`}>공연 정보</NavLink>
                <NavLink className={({ isActive }) => `pf-tab${isActive ? ' active' : ''}`} to={`/e/${event.id}/chat`}>채팅</NavLink>
              </>
            )}
            {hostReady && (
              <>
                <NavLink end className={({ isActive }) => `pf-tab${isActive ? ' active' : ''}`} to="/host">내 공연</NavLink>
                <NavLink className={({ isActive }) => `pf-tab${isActive ? ' active' : ''}`} to="/host/new">새 공연</NavLink>
                <NavLink className={({ isActive }) => `pf-tab${isActive ? ' active' : ''}`} to="/host/settings">동아리</NavLink>
              </>
            )}
            {!event && !hostReady && (
              <>
                <Link className="pf-tab" to="/login">로그인</Link>
                <button
                  type="button"
                  className="pf-tab"
                  onClick={() => {
                    if (isAuthenticated) navigate('/me')
                    else setTicketNotice(true)
                  }}
                >
                  내 티켓
                </button>
                <button type="button" className="pf-fill" onClick={() => navigate('/host')}>
                  공연 올리기
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="pf-main">
        <div className="pf-container">
          <Outlet />
        </div>
      </main>
      {ticketNotice && (
        <div className="pf-modal" onClick={() => setTicketNotice(false)}>
          <div className="pf-auth" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="pf-x" aria-label="닫기" onClick={() => setTicketNotice(false)} />
            <h1>로그인 해주세요</h1>
            <p className="pf-lead">내 티켓은 로그인한 뒤에 볼 수 있습니다.</p>
            <button
              type="button"
              className="pf-btn"
              onClick={() => {
                setTicketNotice(false)
                navigate('/login')
              }}
            >
              로그인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
