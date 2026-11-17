import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { BandyProvider, configError, useBandy } from './store'
import { EventsPage, HomePage, MapPage, NotificationsPage } from './pages/Discover'
import { BookPage, EventPage } from './pages/EventPage'
import { TicketsPage } from './pages/TicketsPage'
import { ClubPage, ClubsPage, NewClubPage } from './pages/ClubsPage'
import { LoginPage, MyPage } from './pages/MyPage'
import { ManagePage } from './pages/ManagePage'
import { ScanPage } from './pages/ScanPage'
import { BottomBar } from './components'
import { InAppBrowserNotice, usePwaHead } from './convenience'
import './bandy.css'

// 상세·예매·스캔·로그인은 하단 바 대신 화면 아래 고정 버튼을 쓴다.
const NO_TABS = [/^\/app\/e\//, /^\/app\/scan\//, /^\/app\/login/]

function Shell() {
  const { toast, loading, backend, confirmState } = useBandy()
  usePwaHead()
  const { pathname } = useLocation()
  const tabs = !NO_TABS.some((r) => r.test(pathname))
  return (
    <div className="b-root">
      <div className={`b-phone${tabs ? ' with-tabs' : ''}`}>
        {/* 데모(브라우저 저장소)로 돌 때는 항상 표시: 실제 예매로 오해하지 않게 */}
        {backend.mode === 'local' && <div className="b-demo-bar">시연용 데모예요 · 실제 예매·결제가 아니에요</div>}
        <InAppBrowserNotice />
        <main className="b-main">
          {loading ? <p className="b-empty">불러오는 중…</p> : (
          <Routes>
            <Route index element={<HomePage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="map" element={<MapPage />} />
            <Route path="e/:eventId" element={<EventPage />} />
            <Route path="e/:eventId/book" element={<BookPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="clubs" element={<ClubsPage />} />
            <Route path="clubs/new" element={<NewClubPage />} />
            <Route path="c/:clubId" element={<ClubPage />} />
            <Route path="my" element={<MyPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="manage/:clubId" element={<ManagePage />} />
            <Route path="scan/:eventId" element={<ScanPage />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
          )}
        </main>
        {tabs && <BottomBar />}
        {toast && <div className="b-toast" role="status">{toast}</div>}
        {confirmState && (
          <div className="b-modal" onClick={() => confirmState.resolve(false)}>
            <div className="b-sheet b-stack" role="alertdialog" aria-label="확인" onClick={(e) => e.stopPropagation()}>
              <p className="b-body">{confirmState.message}</p>
              <div className="b-row" style={{ flexWrap: 'nowrap' }}>
                <button type="button" className="b-btn ghost" onClick={() => confirmState.resolve(false)}>아니요</button>
                <button type="button" className="b-btn" onClick={() => confirmState.resolve(true)}>네</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function BandyApp() {
  if (configError) {
    return <div className="b-root"><div className="b-phone"><main className="b-main"><p className="b-warn">{configError}</p></main></div></div>
  }
  return (
    <BandyProvider>
      <Shell />
    </BandyProvider>
  )
}
