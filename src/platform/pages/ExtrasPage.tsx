import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePlatform } from '../store'

export default function ExtrasPage() {
  const { eventId = '' } = useParams()
  const platform = usePlatform()
  const event = platform.eventById(eventId)
  const [beer, setBeer] = useState(0)
  const [highball, setHighball] = useState(0)
  const [payOpen, setPayOpen] = useState(false)
  const [board, setBoard] = useState('여름아 부탁해')
  const [shown, setShown] = useState('')
  const [picked, setPicked] = useState('')

  const guest = event ? platform.guestFor(event.id) : undefined
  const staffHere = platform.session?.role === 'staff' && platform.session.eventId === eventId
  const allowed = Boolean(guest || staffHere)

  const orders = useMemo(
    () => platform.orders.filter((order) => order.eventId === eventId && (staffHere || order.name === guest?.name)),
    [eventId, guest?.name, platform.orders, staffHere],
  )

  if (!event) return <p className="pf-lead">공연을 찾지 못했습니다.</p>
  if (!allowed) {
    return (
      <div className="pf-card pf-pad">
        <p className="pf-lead">이 공연을 예매한 뒤에 열 수 있습니다.</p>
        <Link className="pf-btn" to={`/e/${event.id}/book`}>예매하기</Link>
      </div>
    )
  }

  const unit = staffHere ? 2000 : 3500
  const total = (beer + highball) * unit
  const checkedIn = platform.guestsFor(event.id).filter((item) => item.paymentConfirmed && item.entryNumber)

  return (
    <div className="pf-stack">
      <h1>부가 기능</h1>
      <p className="pf-lead" style={{ textAlign: 'left' }}>주최가 켠 기능만 이 공연에 보입니다.</p>
      <div className="pf-grid cards">
        {event.features.drink && (
          <section className="pf-card pf-pad">
            <h2>주류 구매</h2>
            <p className="pf-meta">캔 맥주, 산토리 하이볼. {unit.toLocaleString('ko-KR')}원</p>
            <Qty label="캔 맥주" value={beer} setValue={setBeer} />
            <Qty label="산토리 하이볼" value={highball} setValue={setHighball} />
            <button className="pf-btn" type="button" disabled={total === 0} onClick={() => setPayOpen(true)}>구매하기</button>
            {orders.map((order) => (
              <p key={order.id} className="pf-meta" style={{ marginTop: '0.45rem' }}>
                맥주 {order.beer} · 하이볼 {order.highball} · {order.provided ? '제공완료' : '대기중'}
              </p>
            ))}
          </section>
        )}
        {event.features.draw && (
          <section className="pf-card pf-pad">
            <h2>입장 번호 추첨</h2>
            <p className="pf-meta">입금 확인된 관객 중 1명</p>
            <button
              className="pf-btn"
              type="button"
              onClick={() => {
                if (checkedIn.length === 0) {
                  setPicked('추첨할 관객이 없습니다.')
                  return
                }
                const winner = checkedIn[Math.floor(Math.random() * checkedIn.length)]
                setPicked(`${winner.entryNumber}번 ${winner.name}`)
              }}
            >
              시작하기
            </button>
            {picked && <p style={{ marginTop: '0.6rem' }}>{picked}</p>}
          </section>
        )}
        {event.features.led && (
          <section className="pf-card pf-pad">
            <h2>전광판 만들기</h2>
            <input className="pf-input" value={board} onChange={(input) => setBoard(input.target.value)} maxLength={24} />
            <button className="pf-btn" type="button" onClick={() => setShown(board.trim())}>띄우기</button>
            {shown && <p className="pf-page-title" style={{ marginTop: '0.8rem' }}>{shown}</p>}
          </section>
        )}
      </div>
      {!event.features.drink && !event.features.draw && !event.features.led && (
        <p className="pf-muted">주최가 부가 기능을 아직 열지 않았습니다. 길찾기는 홈에 있습니다.</p>
      )}

      {payOpen && (
        <div className="pf-modal" onClick={() => setPayOpen(false)}>
          <div className="pf-card pf-pad pf-sheet" onClick={(click) => click.stopPropagation()}>
            <h2>주류 구매 결제 안내</h2>
            <p className="pf-price">총 {total.toLocaleString('ko-KR')}원</p>
            <p className="pf-meta">{event.bankName} {event.accountNumber}<br />입금주 {event.accountName}</p>
            <p className="pf-hint">확인하면 주문이 남고, 주최 화면에서 제공 완료를 표시합니다.</p>
            <button
              className="pf-btn"
              type="button"
              onClick={() => {
                platform.addOrder({
                  eventId: event.id,
                  name: guest?.name || platform.session?.name || '운영진',
                  beer,
                  highball,
                })
                setBeer(0)
                setHighball(0)
                setPayOpen(false)
              }}
            >
              입금을 완료했습니다
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Qty({ label, value, setValue }: { label: string; value: number; setValue: (value: number) => void }) {
  return (
    <div className="pf-qty">
      <span>{label}</span>
      <div>
        <button type="button" onClick={() => setValue(Math.max(0, value - 1))} aria-label={`${label} 줄이기`}>−</button>
        <span>{value}</span>
        <button type="button" onClick={() => setValue(value + 1)} aria-label={`${label} 늘리기`}>+</button>
      </div>
    </div>
  )
}
