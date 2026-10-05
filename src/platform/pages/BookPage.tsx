import { FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { digits } from '../model'
import { findGuest, usePlatform } from '../store'

export default function BookPage() {
  const { eventId = '' } = useParams()
  const navigate = useNavigate()
  const platform = usePlatform()
  const event = platform.eventById(eventId)
  const [name, setName] = useState(platform.lastName)
  const [phone, setPhone] = useState(platform.lastPhone)
  const [phase, setPhase] = useState<'form' | 'deposit'>('form')
  const [paidChecked, setPaidChecked] = useState(false)
  const [infoChecked, setInfoChecked] = useState(false)
  const [error, setError] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [duplicate, setDuplicate] = useState(false)

  if (!event || event.status !== '공개') {
    return (
      <section className="pf-auth">
        <h1>예매할 수 없습니다</h1>
        <Link className="pf-btn" to="/">공연 찾기</Link>
      </section>
    )
  }

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(event.accountNumber)
      setError('계좌번호가 복사되었습니다.')
    } catch {
      setError('계좌번호를 길게 눌러 복사해 주세요.')
    }
  }

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!name.trim() || digits(phone).length < 10) {
      setError('이름과 전화번호를 확인해 주세요.')
      return
    }
    const existing = findGuest(platform.guests, event.id, name, phone)
    if (existing?.paymentConfirmed) {
      platform.setGuestSession(existing)
      navigate(`/e/${event.id}/home`)
      return
    }
    if (existing) {
      platform.setGuestSession(existing)
      setPhase('deposit')
      setError('')
      return
    }
    if (!duplicate && platform.guests.some((guest) => guest.eventId === event.id && digits(guest.phone) === digits(phone))) {
      setDuplicate(true)
      return
    }
    platform.addGuest({ eventId: event.id, name, phone, kind: '사전' })
    setPhase('deposit')
    setDuplicate(false)
    setError('')
  }

  const enter = () => {
    const guest = findGuest(platform.guests, event.id, name, phone)
    if (!guest?.paymentConfirmed) {
      setWaiting(true)
      return
    }
    platform.setGuestSession(guest)
    navigate(`/e/${event.id}/home`)
  }

  return (
    <section className="pf-auth">
      <button type="button" className="pf-x" aria-label="닫기" onClick={() => navigate(`/e/${event.id}`)} />
      {phase === 'form' ? (
        <form onSubmit={submit}>
          <h1>공연 예매하기</h1>
          <p className="pf-lead">{event.title}<br />최초 예매 후 같은 이름과 연락처로 다시 들어옵니다.</p>
          <div className="pf-field">
            <label className="pf-label" htmlFor="book-name">성함 (입금자명)</label>
            <input id="book-name" className="pf-input" value={name} onChange={(input) => setName(input.target.value)} placeholder="예: 홍길동" />
          </div>
          <div className="pf-field" style={{ marginTop: '0.85rem' }}>
            <label className="pf-label" htmlFor="book-phone">연락처</label>
            <input id="book-phone" className="pf-input" inputMode="numeric" value={phone} onChange={(input) => setPhone(digits(input.target.value))} placeholder="예: 01012345678" />
            <p className="pf-hint">숫자만 입력 (하이픈 없이).</p>
          </div>
          {error && <p className="pf-error">{error}</p>}
          <button className="pf-btn" type="submit">예매 신청하기</button>
        </form>
      ) : (
        <div>
          <h1>신청이 완료되었습니다</h1>
          <p className="pf-lead">입금 전에 정보가 맞는지 확인해 주세요.</p>
          <div className="pf-card pf-pad">
            <p className="pf-meta">이름 {name}</p>
            <p className="pf-meta">연락처 {phone}</p>
          </div>
          <div className="pf-account">
            <p className="pf-hint">입금 계좌</p>
            <p>{event.bankName}</p>
            <button type="button" onClick={copyAccount}>{event.accountNumber}</button>
            <p className="pf-hint">입금주 {event.accountName} · {event.price}</p>
            <p className="pf-hint">{event.refund}</p>
          </div>
          <label className="pf-check">
            <input type="checkbox" checked={paidChecked} onChange={(input) => setPaidChecked(input.target.checked)} />
            <span>입금 완료 하셨습니까?</span>
          </label>
          <label className="pf-check" style={{ marginTop: '0.65rem' }}>
            <input type="checkbox" checked={infoChecked} onChange={(input) => setInfoChecked(input.target.checked)} />
            <span>예매정보를 확인했습니다. 이후 수정이 불가합니다.</span>
          </label>
          {waiting && <p className="pf-error" style={{ marginTop: '0.75rem' }}>입금 확인 대기 중. 주최가 확인하면 로그인으로 들어올 수 있습니다.</p>}
          {error && <p className="pf-error">{error}</p>}
          <button className="pf-btn" type="button" disabled={!paidChecked || !infoChecked} onClick={enter}>입장하기</button>
          <p className="pf-hint" style={{ textAlign: 'center', marginTop: '0.75rem' }}>
            데모에서는 <Link className="pf-link" to={`/host/e/${event.id}`}>운영 화면</Link>에서 입금 확인을 누르면 입장번호가 생깁니다.
          </p>
        </div>
      )}

      {duplicate && (
        <div className="pf-modal">
          <div className="pf-auth">
            <h1>전화번호 중복 확인</h1>
            <p className="pf-lead">이 공연에 같은 연락처가 있습니다. 계속 예매하시겠습니까?</p>
            <button
              className="pf-btn"
              type="button"
              onClick={() => {
                platform.addGuest({ eventId: event.id, name, phone, kind: '사전' })
                setDuplicate(false)
                setPhase('deposit')
              }}
            >
              계속 예매
            </button>
            <button className="pf-btn secondary" type="button" onClick={() => setDuplicate(false)}>취소</button>
          </div>
        </div>
      )}
    </section>
  )
}
