import { FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { digits } from '../model'
import { usePlatform } from '../store'

export default function OnsitePage() {
  const { eventId = '' } = useParams()
  const navigate = useNavigate()
  const platform = usePlatform()
  const event = platform.eventById(eventId)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [phase, setPhase] = useState<'form' | 'account' | 'qr'>('form')
  const [guestId, setGuestId] = useState('')
  const [error, setError] = useState('')

  if (!event) {
    return <section className="pf-auth"><h1>공연이 없습니다</h1></section>
  }

  const link = `${window.location.origin}/t/${guestId}`

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!name.trim() || digits(phone).length < 10) {
      setError('이름과 전화번호를 확인해 주세요.')
      return
    }
    setError('')
    setPhase('account')
  }

  const pay = () => {
    const guest = platform.addGuest({
      eventId: event.id,
      name,
      phone,
      kind: '현장',
      paymentConfirmed: true,
      enterSession: false,
    })
    setGuestId(guest.id)
    setPhase('qr')
  }

  const copyAccount = async () => {
    await navigator.clipboard.writeText(event.accountNumber).catch(() => undefined)
    setError('계좌번호가 복사되었습니다.')
  }

  return (
    <section className="pf-auth">
      <button type="button" className="pf-x" aria-label="닫기" onClick={() => navigate(`/e/${event.id}`)} />
      <div className="pf-steps" aria-hidden="true">
        <span className={phase === 'form' ? 'on' : ''} />
        <span className={phase === 'account' ? 'on' : ''} />
        <span className={phase === 'qr' ? 'on' : ''} />
      </div>
      {phase === 'form' && (
        <form onSubmit={submit}>
          <h1>현장 예매</h1>
          <p className="pf-lead">{event.title}</p>
          <div className="pf-field">
            <label className="pf-label" htmlFor="onsite-name">이름</label>
            <input id="onsite-name" className="pf-input" value={name} onChange={(input) => setName(input.target.value)} placeholder="이름을 입력하세요" />
          </div>
          <div className="pf-field" style={{ marginTop: '0.85rem' }}>
            <label className="pf-label" htmlFor="onsite-phone">전화번호</label>
            <input id="onsite-phone" className="pf-input" inputMode="numeric" value={phone} onChange={(input) => setPhone(digits(input.target.value))} placeholder="010-1234-5678" />
          </div>
          {error && <p className="pf-error">{error}</p>}
          <button className="pf-btn" type="submit">확인하기</button>
        </form>
      )}
      {phase === 'account' && (
        <div>
          <h1>계좌 정보</h1>
          <div className="pf-card pf-pad">
            <p className="pf-meta">이름 {name}</p>
            <p className="pf-meta">연락처 {phone}</p>
          </div>
          <div className="pf-account">
            <p className="pf-hint">입금 계좌</p>
            <button type="button" onClick={copyAccount}>{event.bankName} {event.accountNumber}</button>
            <p className="pf-hint">입금주 {event.accountName} · {event.walkInPrice}</p>
            <p className="pf-hint">계좌번호를 누르면 복사됩니다.</p>
          </div>
          {error && <p className="pf-error">{error}</p>}
          <button className="pf-btn" type="button" onClick={pay}>결제완료</button>
        </div>
      )}
      {phase === 'qr' && (
        <div>
          <h1>QR 코드</h1>
          <div className="pf-qr">
            <QRCodeSVG value={link} size={180} />
          </div>
          <p className="pf-lead">QR을 스캔하면 이 공연 홈으로 들어갑니다.</p>
          <button
            className="pf-btn"
            type="button"
            onClick={() => {
              setName('')
              setPhone('')
              setGuestId('')
              setPhase('form')
              setError('')
            }}
          >
            확인
          </button>
        </div>
      )}
    </section>
  )
}
