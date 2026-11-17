import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useBandy } from '../store'
import { cancelBooking, confirmDeposit, createEvent, isClubManager, setEventStatus, updateClub } from '../repo'
import { Empty, PageHeader } from '../components'
import { dateLabel, won } from '../format'
import { EventCategory } from '../types'

const STATUS_LABEL = { DRAFT: '초안', PUBLISHED: '공개', ENDED: '종료', CANCELLED: '취소' }

export function ManagePage() {
  const { clubId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { db, me, run, showToast } = useBandy()
  const initialTab = params.get('tab')
  const [tab, setTab] = useState<'events' | 'new' | 'profile'>(initialTab === 'new' || initialTab === 'profile' ? initialTab : 'events')
  const club = db.clubs.find((c) => c.id === clubId)

  if (!club || !isClubManager(db, me?.id ?? null, clubId)) {
    return <div className="b-page"><Empty>이 동아리의 운영진만 볼 수 있어요. <Link to="/app/login">역할 바꾸기</Link></Empty></div>
  }

  const events = db.events.filter((e) => e.club_id === club.id).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const selectedId = params.get('event') ?? events[0]?.id
  const selected = events.find((e) => e.id === selectedId)

  return (
    <div className="b-page">
      <PageHeader back title={`${club.name} 관리`} />
      {club.status !== 'ACTIVE' && (
        <p className="b-warn">{club.status === 'PENDING' ? '운영자 승인 대기 중이에요. 승인되면 공연을 올리고 교류를 신청할 수 있어요.' : '승인이 거절됐어요.'}</p>
      )}
      <div className="b-seg">
        <button type="button" className={tab === 'events' ? 'on' : ''} onClick={() => setTab('events')}>공연 · 예매자</button>
        <button type="button" className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>새 공연</button>
        <button type="button" className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>프로필</button>
      </div>

      {tab === 'events' && (
        <>
          <div className="b-chips">
            {events.map((e) => (
              <button key={e.id} type="button" className={`b-chip${e.id === selectedId ? ' active' : ''}`} onClick={() => setParams({ event: e.id })}>
                {e.title.length > 12 ? `${e.title.slice(0, 12)}…` : e.title}
              </button>
            ))}
          </div>
          {selected ? <EventBookings eventId={selected.id} /> : <Empty>올린 공연이 없어요. 새 공연에서 올려 보세요.</Empty>}
        </>
      )}
      {tab === 'new' && <NewEvent clubId={club.id} onDone={(id) => { setTab('events'); setParams({ event: id }) }} />}
      {tab === 'profile' && (
        <section className="b-card b-pad b-stack">
          <label className="b-check">
            <input type="checkbox" checked={club.exchange_open} onChange={(e) => run((d) => updateClub(d, me!.id, club.id, { exchange_open: e.target.checked }))} />
            다른 동아리의 교류 신청 받기
          </label>
          <ProfileField label="소개" value={club.introduction ?? ''} onSave={(v) => { const r = run((d) => updateClub(d, me!.id, club.id, { introduction: v })); showToast(r.ok ? '저장했어요.' : r.error) }} />
          <ProfileField label="인스타그램 주소" value={club.sns_url ?? ''} onSave={(v) => { const r = run((d) => updateClub(d, me!.id, club.id, { sns_url: v || null })); showToast(r.ok ? '저장했어요.' : r.error) }} />
          <ProfileField label="오픈채팅 링크 (교류 연결된 동아리에만 공개)" value={club.open_chat_url} onSave={(v) => { const r = run((d) => updateClub(d, me!.id, club.id, { open_chat_url: v })); showToast(r.ok ? '저장했어요.' : r.error) }} />
          <Link to={`/app/c/${club.id}`} className="b-link">공개 프로필 보기</Link>
        </section>
      )}
    </div>
  )
}

function ProfileField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  return (
    <label className="b-field">
      <span>{label}</span>
      <span className="b-row">
        <input value={v} onChange={(e) => setV(e.target.value)} />
        <button type="button" className="b-btn small" onClick={() => onSave(v.trim())} disabled={v === value}>저장</button>
      </span>
    </label>
  )
}

function EventBookings({ eventId }: { eventId: string }) {
  const { db, me, run, showToast } = useBandy()
  const [filter, setFilter] = useState<'all' | 'pending'>('pending')
  const event = db.events.find((e) => e.id === eventId)!
  const bookings = db.bookings.filter((b) => b.event_id === eventId && b.status !== 'CANCELLED')
  const tickets = db.tickets.filter((t) => t.event_id === eventId && t.status !== 'CANCELLED')
  const pending = bookings.filter((b) => b.status === 'PENDING_PAYMENT')
  const shown = filter === 'pending' ? pending : bookings
  const nameOf = (uid: string) => db.profiles.find((p) => p.id === uid)?.display_name ?? '알 수 없음'

  const confirm = (bookingId: string) => {
    const r = run((d) => confirmDeposit(d, me!.id, bookingId))
    showToast(r.ok ? '입금 확인했어요. 티켓이 발급됐어요.' : r.error)
  }
  const cancel = (bookingId: string) => {
    const r = run((d) => cancelBooking(d, me!.id, bookingId))
    showToast(r.ok ? '예매를 취소했어요.' : r.error)
  }
  const toggleStatus = () => {
    const next = event.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
    const r = run((d) => setEventStatus(d, me!.id, event.id, next))
    showToast(r.ok ? (next === 'PUBLISHED' ? '공개했어요.' : '비공개로 돌렸어요.') : r.error)
  }

  return (
    <div className="b-stack">
      <section className="b-card b-pad b-stack">
        <div className="b-row between">
          <strong>{event.title}</strong>
          <span className={`b-status${event.status === 'PUBLISHED' ? ' ok' : ''}`}>{STATUS_LABEL[event.status]}</span>
        </div>
        <p className="b-sub">{dateLabel(event.starts_at)} · {event.venue_name}</p>
        <div className="b-stats">
          <span><b>{pending.length}</b>입금 대기</span>
          <span><b>{tickets.length}</b>발급 티켓</span>
          <span><b>{tickets.filter((t) => t.status === 'CHECKED_IN').length}</b>입장</span>
        </div>
        <div className="b-row">
          <Link className="b-btn small" to={`/app/scan/${event.id}`}>QR 입장 스캔</Link>
          <button type="button" className="b-btn ghost small" onClick={toggleStatus}>{event.status === 'PUBLISHED' ? '비공개로' : '공개하기'}</button>
          <Link className="b-btn ghost small" to={`/app/e/${event.id}`}>행사 페이지</Link>
        </div>
      </section>

      <div className="b-row between">
        <h2 className="b-h2">예매자 명단</h2>
        <span className="b-seg mini">
          <button type="button" className={filter === 'pending' ? 'on' : ''} onClick={() => setFilter('pending')}>입금 대기</button>
          <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>전체</button>
        </span>
      </div>
      {shown.map((b) => {
        const item = db.booking_items.find((i) => i.booking_id === b.id)!
        const pay = db.payments.find((p) => p.booking_id === b.id)!
        const mine = tickets.filter((t) => t.booking_id === b.id)
        return (
          <article key={b.id} className="b-card b-pad b-stack">
            <div className="b-row between">
              <strong>입금자명 {pay.depositor_name || '-'}</strong>
              <span className={`b-status ${b.status === 'CONFIRMED' ? 'ok' : 'wait'}`}>{b.status === 'CONFIRMED' ? '확정' : '입금 대기'}</span>
            </div>
            <p className="b-sub">{nameOf(b.user_id)} · {item.ticket_type_name} {item.quantity}장 · {won(b.total_amount_krw)} · 주문 {pay.provider_order_id}</p>
            {b.status === 'PENDING_PAYMENT' ? (
              <div className="b-row">
                <button type="button" className="b-btn small" onClick={() => confirm(b.id)}>입금 확인</button>
                <button type="button" className="b-btn ghost small" onClick={() => cancel(b.id)}>취소</button>
              </div>
            ) : (
              <p className="b-sub">입장번호 {mine.map((t) => `${t.entry_number}${t.status === 'CHECKED_IN' ? '(입장)' : ''}`).join(', ')}</p>
            )}
          </article>
        )
      })}
      {shown.length === 0 && <Empty>{filter === 'pending' ? '입금 대기 중인 예매가 없어요.' : '아직 예매가 없어요.'}</Empty>}
    </div>
  )
}

function NewEvent({ clubId, onDone }: { clubId: string; onDone: (id: string) => void }) {
  const { me, run, showToast } = useBandy()
  const [f, setF] = useState({
    title: '', category: '공연' as EventCategory, starts_at: '', venue_name: '', address: '', description: '',
    price_krw: 6000, capacity: 100, bank_name: '카카오뱅크', account_number: '',
  })
  const [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const save = (publish: boolean) => {
    const r = run((d) => createEvent(d, me!.id, clubId, {
      ...f, starts_at: f.starts_at ? `${f.starts_at}:00+09:00` : '', price_krw: Number(f.price_krw), capacity: Number(f.capacity), publish,
    }))
    if (!r.ok) {
      setError(r.error)
      return
    }
    showToast(publish ? '공개했어요. 홈과 지도에 바로 보여요.' : '초안으로 저장했어요.')
    onDone(r.value.id)
  }

  return (
    <section className="b-card b-pad b-stack">
      <label className="b-field"><span>행사명</span><input value={f.title} onChange={set('title')} /></label>
      <div className="b-chips">
        {(['공연', '해커톤', '학술회', '네트워킹'] as EventCategory[]).map((c) => (
          <button key={c} type="button" className={`b-chip${f.category === c ? ' active' : ''}`} onClick={() => setF({ ...f, category: c })}>{c}</button>
        ))}
      </div>
      <label className="b-field"><span>일시</span><input type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /></label>
      <label className="b-field"><span>장소</span><input value={f.venue_name} onChange={set('venue_name')} /></label>
      <label className="b-field"><span>주소</span><input value={f.address} onChange={set('address')} /></label>
      <label className="b-field"><span>소개</span><textarea value={f.description} onChange={set('description')} /></label>
      <div className="b-row">
        <label className="b-field"><span>가격(원, 무료는 0)</span><input type="number" min={0} step={500} value={f.price_krw} onChange={set('price_krw')} /></label>
        <label className="b-field"><span>정원</span><input type="number" min={1} value={f.capacity} onChange={set('capacity')} /></label>
      </div>
      <div className="b-row">
        <label className="b-field"><span>은행</span><input value={f.bank_name} onChange={set('bank_name')} /></label>
        <label className="b-field"><span>입금 계좌</span><input value={f.account_number} onChange={set('account_number')} /></label>
      </div>
      {error && <p className="b-warn">{error}</p>}
      <div className="b-row">
        <button type="button" className="b-btn ghost" onClick={() => save(false)}>초안 저장</button>
        <button type="button" className="b-btn" onClick={() => save(true)}>공개하기</button>
      </div>
    </section>
  )
}
