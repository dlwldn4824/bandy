import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.tsx'
import { useData } from '../contexts/DataContext.tsx'
import {
  setAnalyticsContextGetter,
  setResolvedUserId,
} from './context.ts'
import { hashUserId, hashAdminId } from './hashUserId.ts'
import { isEventDay } from './device.ts'
import {
  getOrCreateSessionId,
  endSession,
  getSessionStartTime,
  getPagesVisitedCount,
  getLastActiveFeature,
} from './session.ts'
import { trackEvent } from './trackEvent.ts'
import { usePageTracking } from './usePageTracking.ts'
import { getUtmProperties, captureUtmFromUrl } from './utm.ts'

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { user, isAdmin, adminName } = useAuth()
  const { performanceData } = useData()
  const sessionStartedRef = useRef(false)

  usePageTracking()

  useEffect(() => {
    const performanceId = performanceData?.ticket?.eventName ?? null
    const performanceDate = performanceData?.ticket?.date ?? null

    setAnalyticsContextGetter(() => ({
      pagePath: location.pathname.startsWith('/t/') ? '/t/*' : location.pathname,
      performanceId,
      performanceDate,
      isEventDay: isEventDay(performanceDate),
      isAdmin,
      userPhone: user?.phone ?? null,
      adminName: adminName ?? null,
    }))

    const resolveUserId = async () => {
      if (isAdmin && adminName) {
        setResolvedUserId(await hashAdminId(adminName))
      } else if (user?.phone && user.phone !== 'admin') {
        setResolvedUserId(await hashUserId(user.phone))
      } else {
        setResolvedUserId('anon')
      }
    }
    void resolveUserId()
  }, [location.pathname, user, isAdmin, adminName, performanceData?.ticket?.eventName, performanceData?.ticket?.date])

  useEffect(() => {
    captureUtmFromUrl(window.location.search)
    const { isNewSession, isReturning, daysSinceLast } = getOrCreateSessionId()
    if (isNewSession && !sessionStartedRef.current) {
      sessionStartedRef.current = true
      void trackEvent('session_started', {
        is_returning: isReturning,
        days_since_last: daysSinceLast,
        ...getUtmProperties(),
      })
    }
  }, [])

  useEffect(() => {
    const handleEnd = () => {
      const durationSec = Math.round((Date.now() - getSessionStartTime()) / 1000)
      void trackEvent(
        'session_ended',
        {
          duration_sec: durationSec,
          last_page: location.pathname,
          pages_visited_count: getPagesVisitedCount(),
          last_active_feature: getLastActiveFeature(),
        },
        { immediate: true }
      )
      endSession()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleEnd()
      }
    }

    window.addEventListener('beforeunload', handleEnd)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', handleEnd)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [location.pathname])

  return <>{children}</>
}
