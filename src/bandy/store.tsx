import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Db, Profile } from './types'
import { Backend, createBackend, friendlyError } from './backend'
import { BandyError } from './repo'

const EMPTY: Db = {
  profiles: [], clubs: [], club_memberships: [], events: [], ticket_types: [], bookings: [], booking_items: [],
  payments: [], tickets: [], qr_credentials: [], event_staff: [], notifications: [], exchange_requests: [],
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

interface BandyContext {
  backend: Backend
  db: Db
  me: Profile | null
  loading: boolean
  // 기능을 부르고, 데이터가 바뀌는 기능이면 끝난 뒤 한 번 다시 읽는다. 실패하면 사용자용 메시지를 돌려준다.
  call: <T>(fn: (b: Backend) => Promise<T>, opts?: { reload?: boolean }) => Promise<Result<T>>
  toast: string
  showToast: (text: string) => void
}

const Ctx = createContext<BandyContext | null>(null)
const backend = createBackend()

export function BandyProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db>(EMPTY)
  const [userId, setUserId] = useState<string | null>(null)
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
        const [nextDb, uid] = await Promise.all([backend.load(), backend.currentUserId()])
        if (mySeq === seq.current) {
          // 백엔드가 매번 새 객체를 돌려주므로(데모 모드도 변경 시 통째로 교체) 여기서 다시 복사하지 않는다
          setDb(nextDb)
          setUserId(uid)
        }
      } while (again.current)
      setLoading(false)
    }
    inflight.current = run().finally(() => { inflight.current = null })
    return inflight.current
  }, [])

  useEffect(() => {
    refresh().catch((e) => { console.error(e); setLoading(false) })
    return backend.onAuthChange(() => { refresh().catch(console.error) })
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
    loading,
    call,
    toast,
    showToast: setToast,
  }), [call, db, loading, toast, userId])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBandy() {
  const v = useContext(Ctx)
  if (!v) throw new Error('BandyProvider가 없습니다.')
  return v
}
