import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import { AnalyticsProvider } from './analytics'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import AdminProtectedRoute from './components/AdminProtectedRoute'
import ManageProtectedRoute from './components/ManageProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import AdminLogin from './pages/AdminLogin'
import Admin from './pages/Admin'
import Dashboard from './pages/Dashboard'
import Performances from './pages/Performances'
import Events from './pages/Events'
import Chat from './pages/Chat'
import Guestbook from './pages/Guestbook'
import Products from './pages/Products'
import Onsite from './pages/Onsite'
import Shell from './platform/Shell'
import { PlatformProvider } from './platform/store'
import DiscoverPage from './platform/pages/DiscoverPage'
import EventDetailPage from './platform/pages/EventDetailPage'
import OrganizerPage from './platform/pages/OrganizerPage'
import MyTicketsPage from './platform/pages/MyTicketsPage'
import { HostListPage, HostNewPage, HostSettingsPage } from './platform/pages/HostPages'

function useAppHeight() {
  useEffect(() => {
    const setH = () => {
      let height = window.innerHeight

      if (window.visualViewport) {
        height = window.visualViewport.height
      }

      document.documentElement.style.setProperty('--app-height', `${height}px`)
      document.documentElement.style.setProperty('--vh', `${height * 0.01}px`)
    }

    setH()

    const timeoutId = setTimeout(setH, 100)
    const timeoutId2 = setTimeout(setH, 300)
    const timeoutId3 = setTimeout(setH, 500)
    const timeoutId4 = setTimeout(setH, 1000)

    window.addEventListener('resize', setH)
    window.addEventListener('orientationchange', setH)

    let scrollTimeout: NodeJS.Timeout
    const handleScroll = () => {
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(setH, 150)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    if (window.visualViewport) {
      const handleViewportChange = () => {
        setH()
      }
      window.visualViewport.addEventListener('resize', handleViewportChange)
      window.visualViewport.addEventListener('scroll', handleViewportChange)

      return () => {
        clearTimeout(timeoutId)
        clearTimeout(timeoutId2)
        clearTimeout(timeoutId3)
        clearTimeout(timeoutId4)
        clearTimeout(scrollTimeout)
        window.removeEventListener('resize', setH)
        window.removeEventListener('orientationchange', setH)
        window.removeEventListener('scroll', handleScroll)
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', handleViewportChange)
          window.visualViewport.removeEventListener('scroll', handleViewportChange)
        }
      }
    }

    return () => {
      clearTimeout(timeoutId)
      clearTimeout(timeoutId2)
      clearTimeout(timeoutId3)
      clearTimeout(timeoutId4)
      clearTimeout(scrollTimeout)
      window.removeEventListener('resize', setH)
      window.removeEventListener('orientationchange', setH)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])
}

function AppRoutes() {
  const location = useLocation()

  return (
    <Routes location={location} key={location.key || location.pathname}>
      <Route element={<Shell />}>
        <Route path="/" element={<DiscoverPage />} />
        <Route path="/o/:organizerId" element={<OrganizerPage />} />
        <Route path="/e/:eventId" element={<EventDetailPage />} />
        <Route path="/me" element={<MyTicketsPage />} />
        <Route path="/host" element={<HostListPage />} />
        <Route path="/host/new" element={<HostNewPage />} />
        <Route path="/host/settings" element={<HostSettingsPage />} />
      </Route>

      <Route path="/e/:eventId/book" element={<Login />} />
      <Route path="/e/:eventId/onsite" element={<Onsite />} />
      <Route path="/e/:eventId/staff" element={<AdminLogin />} />
      <Route path="/e/:eventId/home" element={<Navigate to="/dashboard" replace />} />
      <Route path="/e/:eventId/setlist" element={<Navigate to="/performances" replace />} />
      <Route path="/e/:eventId/chat" element={<Navigate to="/chat" replace />} />
      <Route path="/e/:eventId/guestbook" element={<Navigate to="/guestbook" replace />} />
      <Route path="/e/:eventId/extras" element={<Navigate to="/events" replace />} />
      <Route
        path="/host/e/:eventId"
        element={
          <ManageProtectedRoute>
            <Admin />
          </ManageProtectedRoute>
        }
      />

      <Route path="/t/:token" element={
        <Layout>
          <Dashboard />
        </Layout>
      } />
      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/manage"
        element={
          <ManageProtectedRoute>
            <Admin />
          </ManageProtectedRoute>
        }
      />
      <Route path="/admin/manage" element={<Navigate to="/admin/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <Layout>
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <Layout>
            <AdminProtectedRoute>
              <Dashboard />
            </AdminProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/admin/performances"
        element={
          <Layout>
            <AdminProtectedRoute>
              <Performances />
            </AdminProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/admin/events"
        element={
          <Layout>
            <AdminProtectedRoute>
              <Events />
            </AdminProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/admin/chat"
        element={
          <Layout>
            <AdminProtectedRoute>
              <Chat />
            </AdminProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/admin/guestbook"
        element={
          <Layout>
            <AdminProtectedRoute>
              <Guestbook />
            </AdminProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/performances"
        element={
          <Layout>
            <Performances />
          </Layout>
        }
      />
      <Route
        path="/products"
        element={
          <Layout>
            <Products />
          </Layout>
        }
      />
      <Route
        path="/events"
        element={
          <Layout>
            <ProtectedRoute>
              <Events />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/chat"
        element={
          <Layout>
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/guestbook"
        element={
          <Layout>
            <Guestbook />
          </Layout>
        }
      />
      <Route path="/onsite" element={<Onsite />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  useAppHeight()
  return (
    <ErrorBoundary>
      <AuthProvider>
        <DataProvider>
          <AnalyticsProvider>
            <PlatformProvider>
              <AppRoutes />
            </PlatformProvider>
          </AnalyticsProvider>
        </DataProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
