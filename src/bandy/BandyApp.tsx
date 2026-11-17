import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { BandyProvider, useBandy } from './store'
import { EventsPage, HomePage, MapPage, NotificationsPage } from './pages/Discover'
import { BookPage, EventPage } from './pages/EventPage'
import { TicketsPage } from './pages/TicketsPage'
import { ClubPage, ClubsPage, NewClubPage } from './pages/ClubsPage'
import { LoginPage, MyPage } from './pages/MyPage'
import { ManagePage } from './pages/ManagePage'
import { ScanPage } from './pages/ScanPage'
import { BottomBar } from './components'
import './bandy.css'

// 상세·예매·스캔·로그인은 하단 바 대신 화면 아래 고정 버튼을 쓴다.
const NO_TABS = [/^\/app\/e\//, /^\/app\/scan\//, /^\/app\/login/]

function Shell() {
  const { toast, loading } = useBandy()
  const { pathname } = useLocation()
  const tabs = !NO_TABS.some((r) => r.test(pathname))
  return (
    <div className="b-root">
      <div className={`b-phone${tabs ? ' with-tabs' : ''}`}>
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
      </div>
    </div>
  )
}

export default function BandyApp() {
  return (
    <BandyProvider>
      <Shell />
    </BandyProvider>
  )
}
