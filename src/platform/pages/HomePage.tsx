import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MAP_IMAGE, TICKET_IMAGE, formatPhone } from '../model'
import { usePlatform } from '../store'

export default function HomePage() {
  const { eventId = '' } = useParams()
  const platform = usePlatform()
  const event = platform.eventById(eventId)
  const [nickname, setNickname] = useState('관객')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(nickname)
  const [showGuests, setShowGuests] = useState(false)

  if (!event) return <p className="pf-lead">공연을 찾지 못했습니다.</p>

  const guest = platform.guestFor(event.id)
  const staffHere = platform.session?.role === 'staff' && platform.session.eventId === event.id
  const guests = platform.guestsFor(event.id).filter((item) => item.paymentConfirmed)
  const paidCount = guests.length
  const totalCount = platform.guestsFor(event.id).length

  return (
    <div className="pf-stack">
      <div style={{ textAlign: 'center' }}>
        <h1>안녕하세요, {staffHere ? platform.session?.name : guest?.name || '손님'}님</h1>
        <p className="pf-lead">{staffHere ? '운영진 대시보드' : '내 티켓과 이 공연 정보를 확인하세요'}</p>
        {!staffHere && (
          <div className="pf-nickname">
            <span>채팅 닉네임 {nickname}</span>
            {editing ? (
              <form
                onSubmit={(formEvent) => {
                  formEvent.preventDefault()
                  if (draft.trim().length >= 2) {
                    setNickname(draft.trim())
                    setEditing(false)
                  }
                }}
                style={{ display: 'flex', gap: '0.35rem' }}
              >
                <input className="pf-input" value={draft} onChange={(input) => setDraft(input.target.value)} maxLength={20} style={{ width: 140, padding: '0.4rem 0.6rem' }} />
                <button className="pf-pill" type="submit">저장</button>
              </form>
            ) : (
              <button className="pf-pill" type="button" onClick={() => setEditing(true)}>수정</button>
            )}
          </div>
        )}
      </div>

      {!staffHere && !guest && (
        <div className="pf-card pf-pad">
          <p className="pf-lead">이 공연 티켓이 없습니다.</p>
          <Link className="pf-btn" to={`/e/${event.id}/book`}>예매하기</Link>
        </div>
      )}

      {!staffHere && guest && !guest.paymentConfirmed && (
        <div className="pf-card pf-pad" style={{ textAlign: 'center' }}>
          <p>아직 입금이 확인되지 않았습니다.</p>
          <p className="pf-meta" style={{ marginTop: '0.45rem' }}>{event.bankName} {event.accountNumber}</p>
          <p className="pf-meta">입금주 {event.accountName} · {event.price}</p>
        </div>
      )}

      {event.features.drink && (guest?.paymentConfirmed || staffHere) && (
        <Link className="pf-banner" to={`/e/${event.id}/extras`}>
          <h3>주류 구매 바로가기</h3>
          <p>{staffHere ? '운영진 구매 1,500원 할인' : '캔 맥주와 하이볼을 미리 주문하세요.'}</p>
        </Link>
      )}

      <div className="pf-split home">
        {!staffHere && (
          <div className="pf-ticket">
            <img src={TICKET_IMAGE} alt="" />
            <div className="pf-stamp">
              {guest?.paymentConfirmed && guest.entryNumber ? (
                <>
                  <span>{guest.kind}예약</span>
                  <b>입장번호 {guest.entryNumber}번</b>
                </>
              ) : (
                <b style={{ color: '#ff4444' }}>입금 미확인</b>
              )}
            </div>
          </div>
        )}

        {staffHere && (
          <section className="pf-card pf-pad pf-stack">
            <h2>운영진 전용 기능</h2>
            <div className="pf-card pf-pad">
              <p>현재 통계</p>
              <p className="pf-meta">총 게스트 {totalCount}명 · 실 관객 {paidCount}명</p>
            </div>
            <button className="pf-btn" type="button" onClick={() => setShowGuests(true)}>게스트 리스트 확인하기</button>
          </section>
        )}

        <div className="pf-stack">
          {event.features.directions && (
            <section className="pf-card">
              <img className="pf-map" src={MAP_IMAGE} alt="" />
              <div className="pf-card-body">
                <h2>위치 안내</h2>
                <p className="pf-meta">{event.venue}<br />{event.address}</p>
                <a className="pf-btn" href={`https://map.kakao.com/link/search/${encodeURIComponent(event.address || event.venue)}`} target="_blank" rel="noreferrer">길찾기</a>
              </div>
            </section>
          )}
          <section className="pf-card pf-pad">
            <h2>타임라인</h2>
            {event.timeline.length === 0 && <p className="pf-muted">아직 타임라인이 없습니다.</p>}
            {event.timeline.map((item) => (
              <p key={item.id} className="pf-meta" style={{ marginTop: '0.45rem' }}>{item.time} {item.title}<br />{item.description}</p>
            ))}
          </section>
          <div className="pf-row">
            <Link className="pf-link" to={`/e/${event.id}/guestbook`}>방명록</Link>
            <Link className="pf-link" to={`/e/${event.id}/extras`}>주류 · 추첨 · 전광판</Link>
          </div>
        </div>
      </div>

      {showGuests && (
        <div className="pf-modal" onClick={() => setShowGuests(false)}>
          <div className="pf-card pf-pad pf-sheet" onClick={(click) => click.stopPropagation()}>
            <div className="pf-row">
              <h2>게스트 리스트</h2>
              <button className="pf-pill" type="button" onClick={() => setShowGuests(false)}>닫기</button>
            </div>
            {platform.guestsFor(event.id).map((item) => (
              <p key={item.id} className="pf-meta" style={{ marginTop: '0.55rem' }}>
                {item.name} · {formatPhone(item.phone)} · {item.paymentConfirmed ? `입장 ${item.entryNumber}번` : '입금 대기'}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
