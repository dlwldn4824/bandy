// 모바일 사용 편의: 서버의 '홈 신호'를 받아 바로 띄우는 창, 홈 화면에 추가, 화면 꺼짐 방지, 로그인 후 돌아가기
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useBandy } from './store'
import { device } from './device'
import { dateLabel, won } from './format'

// 로그인 링크: 지금 보던 화면으로 돌아오게 next를 붙인다
export function useLoginPath() {
  const { pathname, search } = useLocation()
  return `/app/login?next=${encodeURIComponent(pathname + search)}`
}

// 훅을 못 쓰는 자리(조기 return 등)용: 지금 주소(또는 지정한 주소)로 돌아오는 로그인 링크
export function loginHref(next?: string) {
  const here = next ?? (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/app')
  return `/app/login?next=${encodeURIComponent(here)}`
}

// 시작까지 남은 시간 문구
function untilLabel(iso: string) {
  const m = Math.round((new Date(iso).getTime() - Date.now()) / 60000)
  if (m <= 0) return '진행 중'
  if (m < 60) return `${m}분 뒤 시작`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}시간 ${m % 60}분 뒤 시작` : dateLabel(iso)
}

// 홈 신호: 서버가 고른 prompt 하나는 앱을 열자마자 아래에서 올라오는 창으로, 나머지는 홈 상단 카드로 보여 준다
export function HomeSignals() {
  const { home, call, showToast } = useBandy()
  const navigate = useNavigate()
  const [sheetKey, setSheetKey] = useState<string | null>(null)

  const changed = home.changed_bookings ?? []
  const promptKey = home.prompt === 'EVENT_CHANGED' ? `changed-${changed[0]?.booking_id}-${changed[0]?.schedule_changed_at}`
    : home.prompt === 'TICKET_NOW' ? `ticket-${home.next_ticket?.ticket_id}`
    : home.prompt === 'STAFF_TODAY' ? `staff-${home.staff_events?.[0]?.event_id}`
      : home.prompt === 'PAYMENT_DUE' ? `pay-${home.pending_payments?.[0]?.booking_id}` : null

  useEffect(() => {
    if (promptKey && !device.wasDismissed(promptKey)) setSheetKey(promptKey)
  }, [promptKey])

  if (!home.signed_in) return null
  const close = () => { if (sheetKey) device.dismiss(sheetKey); setSheetKey(null) }
  const t = home.next_ticket
  const staff = home.staff_events ?? []
  const pays = home.pending_payments ?? []

  const copy = async (text: string) => {
    await navigator.clipboard?.writeText(text).catch(() => undefined)
    showToast('계좌번호를 복사했어요.')
  }
  const sent = async (bookingId: string) => {
    const r = await call((b) => b.markDepositSent(bookingId))
    showToast(r.ok ? '주최 동아리에 입금했다고 알렸어요. 확인되면 티켓이 발급돼요.' : r.error)
  }

  const sheet = sheetKey && sheetKey === promptKey && (
    <div className="b-modal" onClick={close}>
      <div className="b-sheet b-stack" role="dialog" aria-label="바로 보기" onClick={(e) => e.stopPropagation()}>
        {home.prompt === 'EVENT_CHANGED' && changed[0] && (
          <>
            <span className="b-status red">공연 일정 변경</span>
            <h2>{changed[0].title}</h2>
            <p className="b-sub">바뀐 일정: {dateLabel(changed[0].starts_at)} · {changed[0].venue_name}</p>
            <p className="b-sub">그대로 유지하거나 취소·환불을 요청할 수 있어요.</p>
            <button type="button" className="b-btn" onClick={() => { close(); navigate('/app/tickets') }}>내 티켓에서 고르기</button>
          </>
        )}
        {home.prompt === 'TICKET_NOW' && t && (
          <>
            <span className="b-status red">{untilLabel(t.starts_at)}</span>
            <h2>{t.title}</h2>
            <p className="b-sub">{t.venue_name} · 입장번호 {t.entry_number}번{t.ticket_count > 1 ? ` 외 ${t.ticket_count - 1}장` : ''}</p>
            <button type="button" className="b-btn" onClick={() => { close(); navigate(`/app/tickets?open=${t.ticket_id}`) }}>입장 QR 바로 보기</button>
          </>
        )}
        {home.prompt === 'STAFF_TODAY' && staff[0] && (
          <>
            <span className="b-status red">{untilLabel(staff[0].starts_at)}</span>
            <h2>{staff[0].title}</h2>
            <p className="b-sub">입장 {staff[0].checked_in} / {staff[0].issued}명 · 입금 대기 {staff[0].pending_deposits}건</p>
            <button type="button" className="b-btn" onClick={() => { close(); navigate(`/app/scan/${staff[0].event_id}`) }}>입장 관리 (QR 스캔)</button>
          </>
        )}
        {home.prompt === 'PAYMENT_DUE' && pays[0] && (
          <>
            <span className="b-status wait">입금 기한 {dateLabel(pays[0].expires_at)}</span>
            <h2>{pays[0].title}</h2>
            <p className="b-sub">{won(pays[0].total_amount_krw)} · 입금자명 {pays[0].depositor_name}</p>
            <button type="button" className="b-copy" onClick={() => copy(pays[0].account_number)}>
              <span className="b-sub">{pays[0].bank_name} · 예금주 {pays[0].account_holder}</span>
              <strong>{pays[0].account_number}</strong>
              <span className="b-link">눌러서 복사</span>
            </button>
            <button type="button" className="b-btn" onClick={() => { close(); sent(pays[0].booking_id) }}>입금했어요</button>
          </>
        )}
        <button type="button" className="b-btn ghost" onClick={close}>닫기</button>
      </div>
    </div>
  )

  return (
    <>
      {sheet}
      <div className="b-stack">
        {t && (
          <Link to={`/app/tickets?open=${t.ticket_id}`} className="b-card b-pad b-row between b-signal">
            <span className="b-stack tight"><strong>{t.title}</strong><span className="b-sub">{untilLabel(t.starts_at)} · 입장번호 {t.entry_number}번</span></span>
            <span className="b-status red">QR</span>
          </Link>
        )}
        {staff.map((s) => (
          <Link key={s.event_id} to={`/app/scan/${s.event_id}`} className="b-card b-pad b-row between b-signal">
            <span className="b-stack tight"><strong>{s.title}</strong><span className="b-sub">{untilLabel(s.starts_at)} · 입장 {s.checked_in}/{s.issued} · 입금 대기 {s.pending_deposits}</span></span>
            <span className="b-status red">입장 관리</span>
          </Link>
        ))}
        {pays.map((p) => (
          <div key={p.booking_id} className="b-card b-pad b-stack b-signal">
            <div className="b-row between"><strong>{p.title}</strong><span className="b-status wait">입금 대기</span></div>
            <p className="b-sub">{won(p.total_amount_krw)} · {p.bank_name} {p.account_number} · 기한 {dateLabel(p.expires_at)}</p>
            <div className="b-row">
              <button type="button" className="b-btn ghost small" onClick={() => copy(p.account_number)}>계좌 복사</button>
              {p.depositor_notified_at
                ? <span className="b-sub">입금했다고 알렸어요 · 확인을 기다리는 중</span>
                : <button type="button" className="b-btn small" onClick={() => sent(p.booking_id)}>입금했어요</button>}
            </div>
          </div>
        ))}
        {changed.map((c) => (
          <Link key={c.booking_id} to="/app/tickets" className="b-card b-pad b-row between b-signal">
            <span className="b-stack tight"><strong>{c.title}</strong><span className="b-sub">일정이 바뀌었어요 · {dateLabel(c.starts_at)}</span></span>
            <span className="b-status red">확인</span>
          </Link>
        ))}
        {(home.refund_requests ?? []).map((r) => (
          <Link key={r.booking_id} to={`/app/manage/${r.club_id}?event=${r.event_id}`} className="b-card b-pad b-row between b-signal">
            <span className="b-stack tight"><strong>{r.title}</strong><span className="b-sub">환불 요청 · {won(r.total_amount_krw)}</span></span>
            <span className="b-status wait">환불 처리</span>
          </Link>
        ))}
        {((home.join_requests ?? 0) > 0 || (home.exchange_requests ?? 0) > 0) && (
          <Link to="/app/my" className="b-card b-pad b-signal">
            <span className="b-sub">처리할 신청: 가입 {home.join_requests ?? 0}건 · 교류 {home.exchange_requests ?? 0}건</span>
          </Link>
        )}
      </div>
    </>
  )
}

// QR을 보여 주는 동안 화면이 꺼지지 않게(지원하는 브라우저만. 안 되면 조용히 넘어감)
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: { release: () => Promise<void> } | null = null
    let alive = true
    const get = () => {
      (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } })
        .wakeLock.request('screen').then((l) => { if (alive) lock = l; else l.release().catch(() => undefined) }).catch(() => undefined)
    }
    get()
    // 화면을 껐다 켜면 잠금이 풀리므로 다시 요청
    const onVisible = () => { if (document.visibilityState === 'visible') get() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => undefined)
    }
  }, [active])
}

// 홈 화면에 추가(PWA): /app 에서만 manifest를 붙인다(같은 사이트의 기존 서비스에는 영향 없음)
export function usePwaHead() {
  useEffect(() => {
    const added: HTMLElement[] = []
    const add = (tag: string, attrs: Record<string, string>) => {
      const el = document.createElement(tag)
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
      el.dataset.bandy = '1'
      document.head.appendChild(el)
      added.push(el)
    }
    add('link', { rel: 'manifest', href: '/bandy/manifest.webmanifest' })
    add('link', { rel: 'apple-touch-icon', href: '/bandy/icon-180.png' })
    add('meta', { name: 'theme-color', content: '#e8322f' })
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' })
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' })
    add('meta', { name: 'apple-mobile-web-app-title', content: 'BANDY' })
    const prevTitle = document.title
    document.title = 'BANDY'
    return () => { added.forEach((el) => el.remove()); document.title = prevTitle }
  }, [])
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferredInstall: InstallEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e as InstallEvent })
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

// 마이페이지의 '홈 화면에 추가' 안내. 이미 앱처럼 열었으면 숨긴다
export function InstallCard() {
  const [, force] = useState(0)
  if (isStandalone()) return null
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  return (
    <section className="b-card b-pad b-stack">
      <h2>홈 화면에 추가</h2>
      <p className="b-sub">링크를 다시 찾지 않고 앱처럼 바로 열 수 있어요. 로그인은 이 기기에 유지돼요.</p>
      {deferredInstall
        ? <button type="button" className="b-btn small" onClick={async () => { await deferredInstall?.prompt(); deferredInstall = null; force((n) => n + 1) }}>홈 화면에 추가하기</button>
        : <p className="b-note">{ios ? 'Safari 아래 공유 버튼 → "홈 화면에 추가"' : '브라우저 메뉴(⋮) → "홈 화면에 추가" 또는 "앱 설치"'}</p>}
    </section>
  )
}
