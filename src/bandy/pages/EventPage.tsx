import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBandy } from '../store'
import { Booking } from '../types'
import { createBooking, isEventStaff, publicEvents, remaining, ticketTypesOf } from '../repo'
import { Empty, Icon, Poster } from '../components'
import { dateLabel, dDay, won } from '../format'

function useVisibleEvent() {
  const { eventId = '' } = useParams()
  const { db, me } = useBandy()
  const event = db.events.find((e) => e.id === eventId)
  const staff = isEventStaff(db, me?.id ?? null, eventId)
  const visible = !!event && (publicEvents(db).some((e) => e.id === eventId) || staff)
  return { event: visible ? event : undefined, staff }
}

function DetailHeader({ title }: { title?: string }) {
  const navigate = useNavigate()
  const { showToast } = useBandy()
  const [liked, setLiked] = useState(false)
  const share = async () => {
    await navigator.clipboard?.writeText(window.location.href).catch(() => undefined)
    showToast('공연 링크를 복사했어요.')
  }
  return (
    <header className="b-top sticky">
      <span className="b-row">
        <button type="button" className="b-icon-btn" aria-label="뒤로 가기" onClick={() => navigate(-1)}><Icon name="back" size={16} /></button>
        {title && <span className="b-title">{title}</span>}
      </span>
      {!title && (
        <span className="b-row">
          <button type="button" className={`b-icon-btn${liked ? ' liked' : ''}`} aria-label="관심 공연 저장" aria-pressed={liked} onClick={() => setLiked(!liked)}>
            <Icon name="heart" size={[20, 18]} />
          </button>
          <button type="button" className="b-icon-btn" aria-label="공연 공유" onClick={share}><Icon name="share" size={[18, 20]} /></button>
        </span>
      )}
    </header>
  )
}

// 피그마 「공연 상세」
export function EventPage() {
  const { db, me } = useBandy()
  const { event, staff } = useVisibleEvent()
  if (!event) return <div className="b-page"><DetailHeader title="공연" /><Empty>공개된 행사가 아니에요.</Empty></div>

  const club = db.clubs.find((c) => c.id === event.club_id)!
  const types = ticketTypesOf(db, event.id)
  const free = types.every((t) => t.price_krw === 0)
  const left = types.reduce((n, t) => n + remaining(t), 0)
  const myBookings = me ? db.bookings.filter((b) => b.user_id === me.id && b.event_id === event.id && b.status !== 'CANCELLED') : []
  const open = event.status === 'PUBLISHED' && left > 0

  return (
    <div className="b-page with-dock">
      <DetailHeader />
      <div className="b-hero-poster">
        <Poster event={event} />
        <div className="b-hero-chips">
          <span className="b-overlay-chip mint"><i />{event.category} {dDay(event.starts_at)}</span>
          {event.venue_name && <span className="b-overlay-tag">{event.venue_name}</span>}
        </div>
      </div>

      <section className="b-card b-pad b-stack">
        <span className={`b-pill${open ? ' mint' : ''}`}><i />{event.status !== 'PUBLISHED' ? '초안' : open ? (free ? '신청중' : '예매중') : '매진'}</span>
        <h1 className="b-detail-title">{event.title}</h1>
        <div className="b-info">
          <span className="b-info-row"><Icon name="calendar-lg" size={[15, 17]} />{dateLabel(event.starts_at)}</span>
          <span className="b-info-row">
            <Icon name="pin-lg" size={[13, 19]} />
            <span className="b-grow">{event.venue_name}{event.address ? ` (${event.address})` : ''}</span>
            <Link to="/app/map" className="b-accent-link">지도 <Icon name="chev-sm" size={[5, 8]} /></Link>
          </span>
          <span className="b-info-row">
            <Icon name="money" size={[18, 13]} />
            <span className="b-price">{types.map((t) => `${t.name} ${won(t.price_krw)}`).join(' / ')}</span>
          </span>
          <span className="b-info-row small">
            <Icon name="people" size={[20, 10]} />
            <span className="b-sub">주최:</span>
            <Link to={`/app/c/${club.id}`} className="b-underline">{club.name}</Link>
            <span className="b-sub">· 남은 {left}석</span>
          </span>
        </div>
      </section>

      {event.description && (
        <section className="b-card b-pad b-stack">
          <h2>공연 안내</h2>
          <p className="b-body muted">{event.description}</p>
          <p className="b-note">{free ? '신청하면 바로 확정돼요.' : '입금자명으로 입금하면 주최 동아리가 확인한 순서로 입장번호가 부여돼요.'}</p>
        </section>
      )}

      {myBookings.length > 0 && (
        <section className="b-card b-pad b-stack">
          <h2>내 예매</h2>
          {myBookings.map((b) => (
            <p key={b.id} className="b-sub">{b.status === 'CONFIRMED' ? '입장 확정' : '입금 대기'} · {won(b.total_amount_krw)}</p>
          ))}
          <Link className="b-accent-link" to="/app/tickets">내 티켓에서 보기</Link>
        </section>
      )}

      {staff && (
        <section className="b-card b-pad b-stack">
          <h2>운영진 메뉴</h2>
          <Link className="b-btn ghost" to={`/app/manage/${club.id}?event=${event.id}`}>예매자 명단 · 입금 확인</Link>
          <Link className="b-btn ghost" to={`/app/scan/${event.id}`}>QR 입장 스캔</Link>
        </section>
      )}

      <div className="b-dock">
        {open
          ? <Link className="b-btn" to={me ? `/app/e/${event.id}/book` : '/app/login'}>{me ? (free ? '신청하기' : '예매하기') : '로그인하고 예매하기'}</Link>
          : <button type="button" className="b-btn" disabled>{event.status === 'PUBLISHED' ? '매진' : '공개 전'}</button>}
      </div>
    </div>
  )
}

// 피그마 「사전 예매」: 성함(입금자명) → 예매 신청하기 → 계좌 안내
export function BookPage() {
  const { db, me, run, showToast } = useBandy()
  const navigate = useNavigate()
  const { event } = useVisibleEvent()
  const types = event ? ticketTypesOf(db, event.id) : []
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const [qty, setQty] = useState(1)
  const [depositor, setDepositor] = useState(me?.display_name ?? '')
  const [error, setError] = useState('')
  const [done, setDone] = useState<Booking | null>(null)

  if (!event) return <div className="b-page"><DetailHeader title="공연 예매하기" /><Empty>예매할 수 없는 행사예요.</Empty></div>
  if (!me) return <div className="b-page"><DetailHeader title="공연 예매하기" /><Empty>로그인이 필요해요. <Link to="/app/login">로그인</Link></Empty></div>

  const selected = types.find((t) => t.id === typeId) ?? types[0]
  const free = selected?.price_krw === 0

  const submit = () => {
    const r = run((d) => createBooking(d, me.id, selected.id, qty, depositor))
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError('')
    if (free) {
      showToast('신청이 확정됐어요. 내 티켓에서 QR을 확인하세요.')
      navigate('/app/tickets')
      return
    }
    setDone(r.value)
  }

  const copy = async () => {
    await navigator.clipboard?.writeText(event.account_number).catch(() => undefined)
    showToast('계좌번호를 복사했어요.')
  }

  if (done) {
    return (
      <div className="b-page">
        <DetailHeader title="예매 신청 완료" />
        <section className="b-card b-pad b-stack">
          <span className="b-pill red"><i />{event.title}</span>
          <h1 className="b-detail-title">입금하면 예매가 확정돼요</h1>
          <p className="b-sub">입금자명 <b>{depositor}</b>으로 아래 계좌에 입금해 주세요. 주최 동아리가 확인하면 티켓이 발급돼요.</p>
          <button type="button" className="b-field-box" onClick={copy}>
            <span className="b-sub">{event.bank_name} · {event.account_holder}</span>
            <strong>{event.account_number}</strong>
            <span className="b-accent-link">눌러서 복사</span>
          </button>
          <div className="b-sum-row"><span>{selected.name} {qty}매</span><b>₩{done.total_amount_krw.toLocaleString('ko-KR')}</b></div>
        </section>
        <div className="b-dock"><Link className="b-btn" to="/app/tickets">내 티켓에서 보기</Link></div>
      </div>
    )
  }

  return (
    <div className="b-page with-dock">
      <DetailHeader title="예매" />
      <section className="b-card b-pad b-stack">
        <span className="b-pill red"><i />{event.title}</span>
        <h1 className="b-detail-title">{free ? '참가 신청하기' : '공연 예매하기'}</h1>
        <p className="b-sub small">{free ? '신청하면 바로 확정돼요.' : '예매자 본인 명의로 입금 확인 후 확정됩니다.'}</p>
        {types.length > 1 && types.map((t) => (
          <label key={t.id} className={`b-option${t.id === selected.id ? ' on' : ''}`}>
            <input type="radio" name="tt" checked={t.id === selected.id} onChange={() => setTypeId(t.id)} />
            <span>{t.name}</span>
            <span className="b-sub">{won(t.price_krw)} · 남은 {remaining(t)}석</span>
          </label>
        ))}
        {!free && (
          <label className="b-field">
            <span>성함 (입금자명)</span>
            <input value={depositor} onChange={(e) => setDepositor(e.target.value)} placeholder="홍길동" />
          </label>
        )}
        <div className="b-row between">
          <span className="b-label">수량</span>
          <span className="b-stepper">
            <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="한 장 빼기">−</button>
            <b>{qty}</b>
            <button type="button" onClick={() => setQty(Math.min(10, qty + 1))} aria-label="한 장 더하기">+</button>
          </span>
        </div>
        <div className="b-sum-row"><span>{selected.name} {qty}매</span><b>{free ? '무료' : `₩${(selected.price_krw * qty).toLocaleString('ko-KR')}`}</b></div>
        {error && <p className="b-warn">{error}</p>}
      </section>
      <div className="b-dock">
        <button type="button" className="b-btn" onClick={submit}>{free ? '신청하기' : '예매 신청하기'} →</button>
      </div>
    </div>
  )
}
