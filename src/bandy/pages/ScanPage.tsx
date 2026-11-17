import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { useBandy } from '../store'
import { CheckInResult, checkIn, isEventStaff } from '../repo'
import { Empty } from '../components'

const RESULT_TEXT = {
  valid: { title: '입장 완료', tone: 'ok' },
  already_checked_in: { title: '이미 입장한 티켓', tone: 'wait' },
  invalid: { title: '무효 QR', tone: 'bad' },
} as const

export function ScanPage() {
  const { eventId = '' } = useParams()
  const { db, me, run } = useBandy()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [last, setLast] = useState<CheckInResult | null>(null)
  const [camera, setCamera] = useState<'off' | 'on' | 'error'>('off')
  const scanner = useRef<Html5Qrcode | null>(null)
  const busy = useRef(false)
  const event = db.events.find((e) => e.id === eventId)
  const allowed = isEventStaff(db, me?.id ?? null, eventId)

  // 최신 run을 콜백에서 쓰기 위해 ref로 들고 있는다
  const submitRef = useRef<(token: string) => void>(() => undefined)
  submitRef.current = (token: string) => {
    if (!token.trim() || busy.current) return
    busy.current = true
    const r = run((d) => checkIn(d, me?.id ?? null, eventId, token))
    setLast(r.ok ? r.value : { result: 'invalid' })
    setTimeout(() => { busy.current = false }, 1200)
  }

  useEffect(() => () => {
    scanner.current?.stop().catch(() => undefined)
  }, [])

  if (!event || !allowed) return <div className="b-page"><Empty>이 공연의 운영진만 입장 처리를 할 수 있어요. <Link to="/app/login">역할 바꾸기</Link></Empty></div>

  const startCamera = async () => {
    try {
      const s = new Html5Qrcode('b-reader')
      scanner.current = s
      await s.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, (text) => submitRef.current(text), () => undefined)
      setCamera('on')
    } catch {
      setCamera('error')
    }
  }
  const stopCamera = async () => {
    await scanner.current?.stop().catch(() => undefined)
    setCamera('off')
  }

  const tickets = db.tickets.filter((t) => t.event_id === eventId && t.status !== 'CANCELLED')
  const entered = tickets.filter((t) => t.status === 'CHECKED_IN').length
  const info = last ? RESULT_TEXT[last.result] : null

  return (
    <div className="b-page">
      <header className="b-top">
        <button type="button" className="b-back" onClick={() => navigate(-1)}>뒤로</button>
        <span className="b-title">QR 입장</span>
      </header>
      <p className="b-sub">{event.title}</p>
      <div className="b-stats"><span><b>{entered}</b>입장</span><span><b>{tickets.length - entered}</b>남음</span><span><b>{tickets.length}</b>발급</span></div>

      <div id="b-reader" className={`b-reader${camera === 'on' ? ' on' : ''}`} />
      {camera !== 'on'
        ? <button type="button" className="b-btn" onClick={startCamera}>카메라로 스캔</button>
        : <button type="button" className="b-btn ghost" onClick={stopCamera}>카메라 끄기</button>}
      {camera === 'error' && <p className="b-warn">카메라를 열 수 없어요. 아래에 QR 코드 글자를 입력해도 돼요.</p>}

      <div className="b-row">
        <input className="b-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="QR 코드 직접 입력" aria-label="QR 코드" />
        <button type="button" className="b-btn small" onClick={() => { submitRef.current(code); setCode('') }}>확인</button>
      </div>

      {info && (
        <div className={`b-result ${info.tone}`} role="status">
          <strong>{info.title}</strong>
          {last && last.result !== 'invalid' && <span>입장번호 {last.ticket.entry_number}</span>}
          {last?.result === 'invalid' && <span>다른 공연의 티켓이거나 없는 QR이에요.</span>}
        </div>
      )}
    </div>
  )
}
