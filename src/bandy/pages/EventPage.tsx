import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBandy } from '../store'
import { loginHref } from '../convenience'
import { device } from '../device'
import { durationMinutes, eventEnd, hasBookingFor, isEventOver, isEventStaff, isPastEvent, publicEvents, remaining, ticketTypesOf, uid } from '../repo'
import { Empty, PageHeader, Thumb } from '../components'
import { dateLabel, won } from '../format'

function useVisibleEvent() {
  const { eventId = '' } = useParams()
  const { db, me } = useBandy()
  const event = db.events.find((e) => e.id === eventId)
  const staff = isEventStaff(db, me?.id ?? null, eventId)
  // 예매한 사람은 공연이 비공개·취소돼도 공연 정보를 본다(서버 RLS와 같은 규칙)
  const visible = !!event && (publicEvents(db).some((e) => e.id === eventId) || staff || hasBookingFor(db, me?.id ?? null, eventId))
  return { event: visible ? event : undefined, staff }
}

// 예매 가능 여부와 버튼 문구
function bookingState(event: { status: string; starts_at: string }, left: number) {
  if (event.status === 'CANCELLED') return { open: false, label: '취소된 공연' }
  if (event.status !== 'PUBLISHED') return { open: false, label: '공개 전' }
  if (isPastEvent(event)) return { open: false, label: '예매 마감' }
  if (left <= 0) return { open: false, label: '매진' }
  return { open: true, label: '' }
}

// 요청 키. crypto.randomUUID는 https·localhost에서만 있어 휴대폰에서 http 내부망 주소로 열면 없다
function newRequestKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : uid('req')
}

// 구조도: 공연 상세 (공연 정보 · 팀/동아리) → 예매 화면
export function EventPage() {
  const { db, me } = useBandy()
  const { event, staff } = useVisibleEvent()
  if (!event) return <div className="b-page"><PageHeader back title="공연" /><Empty>공개된 공연이 아니에요.</Empty></div>

  const club = db.clubs.find((c) => c.id === event.club_id)
  const types = ticketTypesOf(db, event.id)
  const free = types.every((t) => t.price_krw === 0)
  const left = types.reduce((n, t) => n + remaining(t), 0)
  const myBookings = me ? db.bookings.filter((b) => b.user_id === me.id && b.event_id === event.id && b.status !== 'CANCELLED') : []
  const { open, label } = bookingState(event, left)

  return (
    <div className="b-page with-dock">
      <PageHeader back title="공연 상세" />
      {event.poster_path && <Thumb src={event.poster_path} className="wide" />}
      <section className="b-stack">
        <span className="b-row">
          <span className="b-status">{event.category}</span>
          {event.status === 'CANCELLED' && <span className="b-status wait">취소된 공연</span>}
          {event.status === 'DRAFT' && <span className="b-status wait">{staff ? '초안 · 운영진만 보임' : '비공개로 바뀐 공연'}</span>}
          {event.status === 'PUBLISHED' && isPastEvent(event) && <span className="b-status">{isEventOver(event) ? '지난 공연' : '진행 중'}</span>}
        </span>
        <h1>{event.title}</h1>
        <dl className="b-info">
          <dt>일시</dt><dd>{dateLabel(event.starts_at)} ~ {dateLabel(eventEnd(event)).slice(-5)} <span className="b-sub">({durationMinutes(event)}분)</span></dd>
          <dt>장소</dt><dd>{event.venue_name}{event.address ? <span className="b-sub"><br />{event.address}</span> : null}</dd>
          <dt>티켓</dt><dd>{types.map((t) => `${t.name} ${won(t.price_krw)}`).join(' / ')} · 남은 {left}석</dd>
          <dt>주최</dt><dd>{club ? <><Link className="b-link" to={`/app/c/${club.id}`}>{club.name}</Link> <span className="b-sub">{club.school}</span></> : event.account_holder}</dd>
        </dl>
      </section>

      {event.description && (
        <section className="b-card b-pad b-stack">
          <h2>공연 소개</h2>
          <p className="b-body">{event.description}</p>
        </section>
      )}

      {myBookings.length > 0 && (
        <section className="b-card b-pad b-stack">
          <h2>내 예매</h2>
          {myBookings.map((b) => (
            <p key={b.id} className="b-sub">{{ CONFIRMED: '확정', PENDING_PAYMENT: '입금 대기', EXPIRED: '기한 만료', CANCELLED: '취소' }[b.status]} · {won(b.total_amount_krw)}</p>
          ))}
          <Link className="b-link" to="/app/tickets">내 티켓에서 보기</Link>
        </section>
      )}

      {staff && (
        <section className="b-card b-pad b-stack">
          <h2>공연 관리</h2>
          <Link className="b-btn ghost" to={`/app/manage/${event.club_id}?event=${event.id}`}>예매자 목록 · 입금 확인 · 수정</Link>
          <Link className="b-btn ghost" to={`/app/scan/${event.id}`}>입장 관리 (QR 스캔)</Link>
        </section>
      )}

      <div className="b-dock">
        {open
          ? <Link className="b-btn" to={me ? `/app/e/${event.id}/book` : loginHref(`/app/e/${event.id}/book`)}>{me ? (free ? '신청하기' : '예매하기') : '로그인하고 예매하기'}</Link>
          : <button type="button" className="b-btn" disabled>{label}</button>}
      </div>
    </div>
  )
}

// 구조도: 예매 화면 (ticketTypeId · quantity) → 결제 → 예매 완료(bookingId 생성)
// 결제는 11/1 결정대로 입금자명 + 주최 동아리의 입금 확인
export function BookPage() {
  const { db, me, call, showToast } = useBandy()
  const navigate = useNavigate()
  const { event } = useVisibleEvent()
  const [busy, setBusy] = useState(false)
  const types = event ? ticketTypesOf(db, event.id) : []
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const [qty, setQty] = useState(1)
  // 입금자명은 이 기기에서 마지막으로 쓴 이름을 먼저 채운다
  const [depositor, setDepositor] = useState(device.get().depositorName ?? me?.display_name ?? '')
  // 같은 내용으로 다시 눌러도(네트워크 재시도 포함) 예매가 하나만 생기도록 요청 키를 둔다.
  // 내용을 바꾸면 새 키를 써서 '같은 키로 다른 예매' 충돌이 나지 않게 한다.
  const requestKey = useMemo(() => newRequestKey(), [typeId, qty, depositor])
  const sending = useRef(false) // 같은 순간 두 번 눌러도 한 번만 보낸다(busy는 다음 렌더 전이라 못 막음)
  const [error, setError] = useState('')
  const [doneId, setDoneId] = useState<string | null>(null)

  const left = event ? types.reduce((n, t) => n + remaining(t), 0) : 0
  if (!event || (!doneId && !bookingState(event, left).open)) {
    return <div className="b-page"><PageHeader back title="예매" /><Empty>예매할 수 없는 공연이에요.</Empty></div>
  }
  if (!me) return <div className="b-page"><PageHeader back title="예매" /><Empty>로그인이 필요해요. <Link to={loginHref()}>로그인</Link></Empty></div>

  const selected = types.find((t) => t.id === typeId) ?? types[0]
  const free = selected?.price_krw === 0

  const submit = async () => {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    const r = await call((b) => b.createBooking(selected.id, qty, depositor, requestKey))
    sending.current = false
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setError('')
    if (!free && depositor.trim()) device.set({ depositorName: depositor.trim() })
    if (free) {
      showToast('신청이 확정됐어요. 내 티켓에서 QR을 확인하세요.')
      navigate('/app/tickets')
      return
    }
    setDoneId(r.value)
  }

  const copy = async () => {
    await navigator.clipboard?.writeText(event.account_number).catch(() => undefined)
    showToast('계좌번호를 복사했어요.')
  }

  const done = doneId ? db.bookings.find((b) => b.id === doneId) : undefined
  if (done) {
    return (
      <div className="b-page with-dock">
        <PageHeader title="예매 완료" />
        <section className="b-stack">
          <h1>입금하면 확정돼요</h1>
          <p className="b-sub">{event.title}</p>
          <p className="b-body">입금자명 <b>{depositor}</b>(으)로 아래 계좌에 입금해 주세요. 주최 동아리가 입금을 확인하면 티켓이 발급돼요.</p>
          <button type="button" className="b-copy" onClick={copy}>
            <span className="b-sub">{event.bank_name} · 예금주 {event.account_holder}</span>
            <strong>{event.account_number}</strong>
            <span className="b-link">눌러서 복사</span>
          </button>
          <div className="b-sum"><span>{selected.name} {qty}매</span><b>{won(done.total_amount_krw)}</b></div>
        </section>
        <div className="b-dock"><Link className="b-btn" to="/app/tickets">내 티켓으로</Link></div>
      </div>
    )
  }

  return (
    <div className="b-page with-dock">
      <PageHeader back title={free ? '참가 신청' : '예매'} />
      <section className="b-stack">
        <p className="b-sub">{event.title} · {dateLabel(event.starts_at)}</p>
        {types.map((t) => (
          <label key={t.id} className={`b-option${t.id === selected.id ? ' on' : ''}`}>
            <input type="radio" name="tt" checked={t.id === selected.id} onChange={() => setTypeId(t.id)} />
            <span>{t.name}</span>
            <span className="b-sub">{won(t.price_krw)} · 남은 {remaining(t)}석</span>
          </label>
        ))}
        <div className="b-row between">
          <span className="b-label">수량</span>
          <span className="b-stepper">
            <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="한 장 빼기">−</button>
            <b>{qty}</b>
            <button type="button" onClick={() => setQty(Math.min(10, qty + 1))} aria-label="한 장 더하기">+</button>
          </span>
        </div>
        {!free && (
          <label className="b-field">
            <span>입금자명</span>
            <input value={depositor} onChange={(e) => setDepositor(e.target.value)} maxLength={20} placeholder="입금할 때 쓰는 이름" />
          </label>
        )}
        <div className="b-sum"><span>합계</span><b>{won(selected.price_krw * qty)}</b></div>
        {!free && <p className="b-note">예매하면 입금 계좌를 알려 드려요. 주최 동아리가 입금자명을 확인한 뒤 티켓이 발급돼요.</p>}
        {error && <p className="b-warn">{error}</p>}
      </section>
      <div className="b-dock">
        <button type="button" className="b-btn" onClick={submit} disabled={busy}>{free ? '신청하기' : '예매하기'}</button>
      </div>
    </div>
  )
}
