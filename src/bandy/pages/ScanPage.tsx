import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { useBandy } from '../store'
import { isEventStaff } from '../repo'
import { CheckResult } from '../backend'
import { Empty, PageHeader } from '../components'

// 구조도(운영자): QR 스캔 → QR 검증 → 불가(invalid · alreadyCheckedIn) / 가능 → 관객 정보 확인 → 입장 처리 → 예매자 목록 갱신
export function ScanPage() {
  const { eventId = '' } = useParams()
  const { db, me, call, showToast } = useBandy()
  const [code, setCode] = useState('')
  const [checked, setChecked] = useState<{ token: string; result: CheckResult } | null>(null)
  const [camera, setCamera] = useState<'off' | 'on' | 'error'>('off')
  const scanner = useRef<Html5Qrcode | null>(null)
  const busy = useRef(false)
  const event = db.events.find((e) => e.id === eventId)
  const allowed = isEventStaff(db, me?.id ?? null, eventId)

  const verifyRef = useRef<(token: string) => void>(() => undefined)
  verifyRef.current = async (token: string) => {
    const t = token.trim()
    if (!t || busy.current || checked?.token === t) return
    busy.current = true
    const r = await call((b) => b.verifyTicket(eventId, t))
    busy.current = false
    if (!r.ok) { showToast(r.error); return }
    setChecked({ token: t, result: r.value })
  }

  useEffect(() => () => { scanner.current?.stop().catch(() => undefined) }, [])

  if (!event || !allowed) return <div className="b-page"><PageHeader back title="입장 관리" /><Empty>이 공연의 운영진만 입장 처리를 할 수 있어요. <Link to="/app/login">로그인</Link></Empty></div>

  const startCamera = async () => {
    try {
      const s = new Html5Qrcode('b-reader')
      scanner.current = s
      await s.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, (text) => verifyRef.current(text), () => undefined)
      setCamera('on')
    } catch {
      setCamera('error')
    }
  }
  const stopCamera = async () => {
    await scanner.current?.stop().catch(() => undefined)
    setCamera('off')
  }

  const admit = async () => {
    if (!checked) return
    const r = await call((b) => b.checkIn(eventId, checked.token))
    if (!r.ok) { showToast(r.error); return }
    setChecked({ token: checked.token, result: { ...r.value, result: r.value.result === 'valid' ? 'already_checked_in' : r.value.result } })
    showToast(r.value.result === 'valid' ? `입장번호 ${r.value.entry_number}번 입장 처리했어요.` : '이미 입장한 티켓이에요.')
  }

  const tickets = db.tickets.filter((t) => t.event_id === eventId && t.status !== 'CANCELLED')
  const entered = tickets.filter((t) => t.status === 'CHECKED_IN').length
  const res = checked?.result

  return (
    <div className="b-page">
      <PageHeader back title="입장 관리" />
      <p className="b-sub">{event.title}</p>
      <p className="b-sub">발급 {tickets.length}장 · 입장 {entered}장 · 남음 {tickets.length - entered}장</p>

      <div id="b-reader" className={`b-reader${camera === 'on' ? ' on' : ''}`} />
      {camera !== 'on'
        ? <button type="button" className="b-btn" onClick={startCamera}>카메라로 QR 스캔</button>
        : <button type="button" className="b-btn ghost" onClick={stopCamera}>카메라 끄기</button>}
      {camera === 'error' && <p className="b-warn">카메라를 열 수 없어요. 아래에 QR 코드 글자를 입력해도 돼요.</p>}
      <form className="b-row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); verifyRef.current(code); setCode('') }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="QR 코드 직접 입력" aria-label="QR 코드" />
        <button type="submit" className="b-btn small" style={{ height: 44 }}>검증</button>
      </form>

      {res && (
        <div className={`b-result ${res.result === 'invalid' ? 'bad' : res.result === 'valid' ? 'ok' : 'wait'}`} role="status">
          <strong>{res.result === 'invalid' ? '입장 불가' : res.result === 'valid' ? '입장 가능' : '이미 입장한 티켓'}</strong>
          {res.result === 'invalid'
            ? <span>다른 공연의 티켓이거나 없는 · 만료된 QR이에요.</span>
            : <span>입장번호 {res.entry_number}번 · {res.owner_name} (입금자명 {res.depositor_name || '-'}) · {res.ticket_type}</span>}
          {res.result === 'valid'
            ? <button type="button" className="b-btn" onClick={admit}>입장 처리</button>
            : <button type="button" className="b-btn ghost" onClick={() => setChecked(null)}>다음 관객</button>}
        </div>
      )}
      <Link className="b-link" to={`/app/manage/${event.club_id}?event=${event.id}`}>예매자 목록 보기</Link>
    </div>
  )
}
