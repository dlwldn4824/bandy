import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Db, Profile } from './types'
import { BandyError, initialDb, loadDb, saveDb } from './repo'

const SESSION_KEY = 'bandy-prototype-session'

interface BandyContext {
  db: Db
  me: Profile | null
  // 데이터를 바꾸는 함수는 run으로 감싼다. 실패하면 메시지를 돌려준다.
  run: <T>(fn: (draft: Db) => T) => { ok: true; value: T } | { ok: false; error: string }
  login: (userId: string) => void
  logout: () => void
  reset: () => void
  toast: string
  showToast: (text: string) => void
}

const Ctx = createContext<BandyContext | null>(null)

function readSession() {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

export function BandyProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db>(loadDb)
  const [userId, setUserId] = useState<string | null>(readSession)
  const [toast, setToast] = useState('')

  useEffect(() => saveDb(db), [db])
  useEffect(() => {
    try {
      if (userId) localStorage.setItem(SESSION_KEY, userId)
      else localStorage.removeItem(SESSION_KEY)
    } catch {
      /* 무시 */
    }
  }, [userId])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const run = useCallback(<T,>(fn: (draft: Db) => T) => {
    const draft = structuredClone(db)
    try {
      const value = fn(draft)
      setDb(draft)
      return { ok: true as const, value }
    } catch (e) {
      const error = e instanceof BandyError ? e.message : '처리하지 못했습니다.'
      if (!(e instanceof BandyError)) console.error(e)
      return { ok: false as const, error }
    }
  }, [db])

  const value = useMemo<BandyContext>(() => ({
    db,
    me: db.profiles.find((p) => p.id === userId) ?? null,
    run,
    login: setUserId,
    logout: () => setUserId(null),
    reset: () => {
      setDb(initialDb())
      setUserId(null)
    },
    toast,
    showToast: setToast,
  }), [db, run, toast, userId])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBandy() {
  const v = useContext(Ctx)
  if (!v) throw new Error('BandyProvider가 없습니다.')
  return v
}
