import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { BandyProvider, useBandy } from './store'
import { HomePage, MapPage } from './pages/Discover'
import { EventPage } from './pages/EventPage'
import { TicketsPage } from './pages/TicketsPage'
import { ClubPage, ClubsPage, NewClubPage } from './pages/ClubsPage'
import { LoginPage, MyPage } from './pages/MyPage'
import { ManagePage } from './pages/ManagePage'
import { ScanPage } from './pages/ScanPage'
import './bandy.css'

const TABS = [
  { to: '/app', label: '홈', end: true },
  { to: '/app/map', label: '지도' },
  { to: '/app/tickets', label: '내 티켓' },
  { to: '/app/clubs', label: '교류' },
  { to: '/app/my', label: '마이' },
]

function Shell() {
  const { toast } = useBandy()
  return (
    <div className="b-root">
      <div className="b-phone">
        <main className="b-main">
          <Routes>
            <Route index element={<HomePage />} />
            <Route path="map" element={<MapPage />} />
            <Route path="e/:eventId" element={<EventPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="clubs" element={<ClubsPage />} />
            <Route path="clubs/new" element={<NewClubPage />} />
            <Route path="c/:clubId" element={<ClubPage />} />
            <Route path="my" element={<MyPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="manage/:clubId" element={<ManagePage />} />
            <Route path="scan/:eventId" element={<ScanPage />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </main>
        <nav className="b-tabs" aria-label="하단 메뉴">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `b-tab${isActive ? ' active' : ''}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
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
