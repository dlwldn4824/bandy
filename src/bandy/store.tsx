import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Db, Profile } from './types'
import { Backend, createBackend } from './backend'
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
  // 기능을 부르고 끝나면 데이터를 다시 읽는다. 실패하면 메시지를 돌려준다.
  call: <T>(fn: (b: Backend) => Promise<T>) => Promise<Result<T>>
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

  const refresh = useCallback(async () => {
    const [nextDb, uid] = await Promise.all([backend.load(), backend.currentUserId()])
    setDb(structuredClone(nextDb))
    setUserId(uid)
    setLoading(false)
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

  const call = useCallback(async <T,>(fn: (b: Backend) => Promise<T>): Promise<Result<T>> => {
    try {
      const value = await fn(backend)
      await refresh()
      return { ok: true, value }
    } catch (e) {
      if (!(e instanceof BandyError)) console.error(e)
      return { ok: false, error: e instanceof Error && e.message ? e.message : '처리하지 못했습니다.' }
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
