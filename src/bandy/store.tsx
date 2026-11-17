import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Db, HomeState, Profile } from './types'
import { Backend, createBackend, createFallbackBackend, friendlyError } from './backend'
import { BandyError } from './repo'
import { device } from './device'

const EMPTY: Db = {
  profiles: [], clubs: [], club_memberships: [], events: [], ticket_types: [], bookings: [], booking_items: [],
  payments: [], tickets: [], qr_credentials: [], event_staff: [], notifications: [], exchange_requests: [],
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

interface BandyContext {
  backend: Backend
  db: Db
  me: Profile | null
  // 서버가 주는 홈 신호(바로 띄울 창, 배지 숫자). 데이터를 다시 읽을 때 함께 갱신된다
  home: HomeState
  offline: boolean // 마지막 데이터 읽기가 네트워크 문제로 실패함(저장해 둔 QR만 보여 줄 수 있음)
  loading: boolean
  // 기능을 부르고, 데이터가 바뀌는 기능이면 끝난 뒤 한 번 다시 읽는다. 실패하면 사용자용 메시지를 돌려준다.
  call: <T>(fn: (b: Backend) => Promise<T>, opts?: { reload?: boolean }) => Promise<Result<T>>
  toast: string
  showToast: (text: string) => void
}

const Ctx = createContext<BandyContext | null>(null)
// 운영 빌드에서 서버 설정이 빠지면 데모로 열지 않고 설정 오류 화면을 보여 준다(BandyApp)
export let configError = ''
const backend: Backend = (() => {
  try { return createBackend() } catch (e) { configError = e instanceof Error ? e.message : String(e); return createFallbackBackend() }
})()

export function BandyProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db>(EMPTY)
  const [userId, setUserId] = useState<string | null>(null)
  const [home, setHome] = useState<HomeState>({ signed_in: false })
  const lastLoad = useRef(0)
  const [offline, setOffline] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const seq = useRef(0)
  const inflight = useRef<Promise<void> | null>(null)
  const again = useRef(false)

  // 동시에 여러 번 요청돼도 한 번에 하나만 읽고, 진행 중에 또 요청되면 끝난 뒤 한 번만 더 읽는다.
  // 늦게 도착한 오래된 응답이 새 데이터를 덮지 않도록 순번을 확인한다.
  const refresh = useCallback(async (): Promise<void> => {
    if (inflight.current) {
      again.current = true
      return inflight.current
    }
    const run = async () => {
      do {
        again.current = false
        const mySeq = ++seq.current
        const [nextDb, uid, nextHome] = await Promise.all([
          backend.load(), backend.currentUserId(),
          backend.homeState().catch(() => ({ signed_in: false }) as HomeState), // 홈 신호가 실패해도 화면은 뜬다
        ])
        if (mySeq === seq.current) {
          // 백엔드가 매번 새 객체를 돌려주므로(데모 모드도 변경 시 통째로 교체) 여기서 다시 복사하지 않는다
          setDb(nextDb)
          setUserId(uid)
          device.bindUser(uid)
          setHome(nextHome)
          setOffline(false)
          lastLoad.current = Date.now()
        }
      } while (again.current)
      setLoading(false)
    }
    inflight.current = run().finally(() => { inflight.current = null })
    return inflight.current
  }, [])

  useEffect(() => {
    refresh().catch((e) => { console.error(e); setOffline(true); setLoading(false) })
    return backend.onAuthChange(() => { refresh().catch((e) => { console.error(e); setOffline(true) }) })
  }, [refresh])

  // 모바일: 다른 앱(은행 앱 등)에 갔다가 돌아오면 30초 이상 지났을 때 새로 읽는다(입금 확인·티켓 발급을 바로 반영)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 30000) refresh().catch((e) => { console.error(e); setOffline(true) })
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible) }
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const call = useCallback(async <T,>(fn: (b: Backend) => Promise<T>, opts?: { reload?: boolean }): Promise<Result<T>> => {
    try {
      const value = await fn(backend)
      if (opts?.reload !== false) await refresh()
      return { ok: true, value }
    } catch (e) {
      if (!(e instanceof BandyError)) console.error(e)
      return { ok: false, error: friendlyError(e) }
    }
  }, [refresh])

  const value = useMemo<BandyContext>(() => ({
    backend,
    db,
    me: db.profiles.find((p) => p.id === userId) ?? null,
    home,
    offline,
    loading,
    call,
    toast,
    showToast: setToast,
  }), [call, db, home, loading, offline, toast, userId])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBandy() {
  const v = useContext(Ctx)
  if (!v) throw new Error('BandyProvider가 없습니다.')
  return v
}
