import { FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Category, EventItem, POSTER_DRAFT, formatPhone } from '../model'
import { usePlatform } from '../store'

function HostGate({ children }: { children: React.ReactNode }) {
  const { session, loginHost, registerHost } = usePlatform()
  const [mode, setMode] = useState<'login' | 'join'>('login')
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [city, setCity] = useState('')
  const [error, setError] = useState('')

  if (session?.role === 'host') return children

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!name.trim()) return
    if (mode === 'login') {
      setError(loginHost(name) ? '' : '같은 이름의 동아리가 없습니다. 회원가입에서 동아리 정보를 입력하세요.')
      return
    }
    setError(registerHost({ name, summary, city }) ? '' : '이미 등록된 동아리 이름입니다. 로그인으로 들어가세요.')
  }

  return (
    <form className="pf-card pf-pad pf-stack" onSubmit={submit} style={{ maxWidth: 480, margin: '0 auto' }}>
      <h1>{mode === 'login' ? '동아리 로그인' : '동아리 회원가입'}</h1>
      <p className="pf-lead" style={{ textAlign: 'left' }}>
        {mode === 'login'
          ? '동아리 이름을 입력하면 내 공연으로 들어갑니다.'
          : '동아리 정보를 입력하면 가입되고, 바로 내 공연으로 들어갑니다.'}
      </p>
      <div className="pf-chips" style={{ marginTop: 0 }}>
        <button type="button" className={`pf-chip${mode === 'login' ? ' active' : ''}`} onClick={() => { setMode('login'); setError('') }}>로그인</button>
        <button type="button" className={`pf-chip${mode === 'join' ? ' active' : ''}`} onClick={() => { setMode('join'); setError('') }}>회원가입</button>
      </div>
      <Field label="동아리 이름" value={name} onChange={setName} placeholder="예: 렉사 × 멜로딕" />
      {mode === 'join' && (
        <>
          <label className="pf-label">소개</label>
          <textarea className="pf-textarea" value={summary} onChange={(input) => setSummary(input.target.value)} placeholder="동아리를 짧게 소개해 주세요" />
          <Field label="도시" value={city} onChange={setCity} placeholder="서울" />
        </>
      )}
      {error && <p className="pf-hint">{error}</p>}
      <button className="pf-btn" type="submit" disabled={!name.trim()}>
        {mode === 'login' ? '로그인' : '가입하고 들어가기'}
      </button>
    </form>
  )
}

export function HostListPage() {
  const { session, events, guests } = usePlatform()
  return (
    <HostGate>
      <div>
        <h1 className="pf-page-title">내 공연</h1>
        <p className="pf-lead">{session?.role === 'host' ? session.name : ''} 주최. 공개한 공연만 찾기 화면에 나갑니다.</p>
        <div className="pf-grid host">
          {events.filter((event) => session?.role === 'host' && event.organizerId === session.organizerId).length === 0 && (
            <p className="pf-lead">올린 공연이 없습니다. 새 공연에서 올릴 수 있습니다.</p>
          )}
          {events.filter((event) => session?.role === 'host' && event.organizerId === session.organizerId).map((event) => {
            const rows = guests.filter((guest) => guest.eventId === event.id)
            const waiting = rows.filter((guest) => !guest.paymentConfirmed).length
            return (
              <article key={event.id} className="pf-card pf-pad pf-stack">
                <div className="pf-row">
                  <h2>{event.title}</h2>
                  <span className={`pf-status ${event.status === '공개' ? 'ok' : ''}`}>{event.status}</span>
                </div>
                <p className="pf-meta">{event.dateLabel}<br />예매 {rows.length} · 입금 대기 {waiting}</p>
                <Link className="pf-btn" to={`/host/e/${event.id}`}>관리</Link>
                {event.status === '공개' && <Link className="pf-link" to={`/e/${event.id}`}>공개 페이지 보기</Link>}
              </article>
            )
          })}
        </div>
      </div>
    </HostGate>
  )
}

export function HostNewPage() {
  const { session, addEvent } = usePlatform()
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('밴드')
  const [dateLabel, setDateLabel] = useState('')
  const [venue, setVenue] = useState('')
  const [address, setAddress] = useState('')
  const [summary, setSummary] = useState('')
  const [price, setPrice] = useState('6,000원')
  const [walkInPrice, setWalkInPrice] = useState('8,000원')
  const [bankName, setBankName] = useState('카카오뱅크')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [refund, setRefund] = useState('환불 불가')
  const [contactPhone, setContactPhone] = useState('')
  const [done, setDone] = useState('')

  const publish = (status: EventItem['status']) => {
    if (session?.role !== 'host' || !title.trim()) return
    const id = `ev-${Date.now()}`
    addEvent({
      id,
      organizerId: session.organizerId,
      title: title.trim(),
      dateLabel: dateLabel || '날짜 미정',
      city: '서울',
      venue: venue || '장소 미정',
      address,
      category,
      price,
      walkInPrice,
      poster: POSTER_DRAFT,
      summary,
      status,
      bankName,
      accountNumber: accountNumber || '3333-00-0000000',
      accountName: accountName || session.name,
      refund,
      contactPhone,
      staffCode: '4824',
      features: { drink: false, directions: true, draw: false, led: false },
      timeline: [],
      setlist: [],
    })
    setDone(id)
  }

  return (
    <HostGate>
      {done ? (
        <section className="pf-card pf-pad pf-stack">
          <h1>공연을 저장했습니다</h1>
          <Link className="pf-btn" to={`/host/e/${done}`}>운영 화면으로</Link>
          <Link className="pf-link" to="/host">목록으로</Link>
        </section>
      ) : (
        <form className="pf-stack" onSubmit={(event) => event.preventDefault()}>
          <h1 className="pf-page-title">{step === 1 ? '기본 정보' : step === 2 ? '예매 정보' : '발행'}</h1>
          <div className="pf-steps"><span className={step === 1 ? 'on' : ''} /><span className={step === 2 ? 'on' : ''} /><span className={step === 3 ? 'on' : ''} /></div>
          {step === 1 && (
            <div className="pf-card pf-pad pf-stack">
              <Field label="공연명" value={title} onChange={setTitle} />
              <label className="pf-label">카테고리</label>
              <div className="pf-chips">
                {(['밴드', '연극', '동아리', '페스티벌'] as Category[]).map((item) => (
                  <button key={item} type="button" className={`pf-chip${category === item ? ' active' : ''}`} onClick={() => setCategory(item)}>{item}</button>
                ))}
              </div>
              <Field label="날짜" value={dateLabel} onChange={setDateLabel} placeholder="2026년 8월 15일 (토) 18:30" />
              <Field label="장소" value={venue} onChange={setVenue} />
              <Field label="주소" value={address} onChange={setAddress} />
              <label className="pf-label">소개</label>
              <textarea className="pf-textarea" value={summary} onChange={(input) => setSummary(input.target.value)} />
              <button className="pf-btn" type="button" disabled={!title.trim()} onClick={() => setStep(2)}>다음</button>
            </div>
          )}
          {step === 2 && (
            <div className="pf-card pf-pad pf-stack">
              <Field label="사전 예매 가격" value={price} onChange={setPrice} />
              <Field label="현장 예매 가격" value={walkInPrice} onChange={setWalkInPrice} />
              <Field label="은행명" value={bankName} onChange={setBankName} />
              <Field label="계좌번호" value={accountNumber} onChange={setAccountNumber} />
              <Field label="입금 계좌 이름" value={accountName} onChange={setAccountName} />
              <Field label="환불" value={refund} onChange={setRefund} />
              <Field label="안내 전화번호" value={contactPhone} onChange={setContactPhone} />
              <div className="pf-row">
                <button className="pf-pill" type="button" onClick={() => setStep(1)}>이전</button>
                <button className="pf-btn" type="button" style={{ width: 'auto', minWidth: 120 }} onClick={() => setStep(3)}>다음</button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="pf-card pf-pad pf-stack">
              <h2>{title}</h2>
              <p className="pf-meta">{category} · {dateLabel || '날짜 미정'} · {venue || '장소 미정'}</p>
              <p>{summary}</p>
              <p className="pf-meta">사전 {price} / 현장 {walkInPrice}<br />{bankName} {accountNumber || '계좌 미입력'} {accountName}</p>
              <button className="pf-btn secondary" type="button" onClick={() => publish('초안')}>초안으로 저장</button>
              <button className="pf-btn" type="button" onClick={() => publish('공개')}>공개하기</button>
            </div>
          )}
        </form>
      )}
    </HostGate>
  )
}

export function HostManagePage() {
  const { eventId = '' } = useParams()
  const platform = usePlatform()
  const event = platform.eventById(eventId)
  const [notice, setNotice] = useState('')
  const [accountNumber, setAccountNumber] = useState(event?.accountNumber ?? '')
  const [price, setPrice] = useState(event?.price ?? '')
  const [walkInPrice, setWalkInPrice] = useState(event?.walkInPrice ?? '')

  useEffect(() => {
    if (!event) return
    setAccountNumber(event.accountNumber)
    setPrice(event.price)
    setWalkInPrice(event.walkInPrice)
  }, [event?.id])

  if (!event) return <p className="pf-lead">공연을 찾지 못했습니다.</p>
  const rows = platform.guestsFor(event.id)
  const orders = platform.orders.filter((order) => order.eventId === event.id)

  const copyLink = async (guestId: string) => {
    const link = `${window.location.origin}/t/${guestId}`
    await navigator.clipboard.writeText(link).catch(() => undefined)
    setNotice('개인 링크를 복사했습니다.')
  }

  return (
    <HostGate>
      <div className="pf-stack">
        <div className="pf-row">
          <div>
            <h1 className="pf-page-title" style={{ textAlign: 'left' }}>{event.title}</h1>
            <p className="pf-meta">운영진 코드 {event.staffCode}</p>
          </div>
          <span className={`pf-status ${event.status === '공개' ? 'ok' : ''}`}>{event.status}</span>
        </div>
        <div className="pf-row">
          {event.status === '공개' && <Link className="pf-link" to={`/e/${event.id}`}>공개 페이지</Link>}
          <Link className="pf-link" to={`/e/${event.id}/staff`}>운영진 입장</Link>
          {event.status !== '마감' && <button className="pf-pill" type="button" onClick={() => platform.patchEvent(event.id, { status: '마감' })}>예매 마감</button>}
          {event.status !== '공개' && <button className="pf-pill" type="button" onClick={() => platform.patchEvent(event.id, { status: '공개' })}>공개하기</button>}
        </div>
        {notice && <p className="pf-hint">{notice}</p>}

        <div className="pf-manage">
          <section className="pf-card pf-pad span">
            <h2>게스트 리스트</h2>
            <div className="pf-only-mobile pf-stack" style={{ marginTop: '0.75rem' }}>
              {rows.map((guest) => (
                <article key={guest.id} className="pf-card pf-pad">
                  <strong>{guest.name}</strong>
                  <p className="pf-meta">{formatPhone(guest.phone)} · {guest.kind}</p>
                  <p className="pf-meta">{guest.entryNumber ? `입장번호 ${guest.entryNumber}` : '입장번호 없음'}</p>
                  <div className="pf-row" style={{ marginTop: '0.45rem' }}>
                    <button className={`pf-mini${guest.paymentConfirmed ? ' on' : ''}`} type="button" onClick={() => platform.confirmGuest(guest.id, !guest.paymentConfirmed)}>
                      {guest.paymentConfirmed ? '입금 확인됨' : '입금 확인'}
                    </button>
                    <button className={`pf-mini${guest.ticketReceived ? ' on' : ''}`} type="button" onClick={() => platform.receiveTicket(guest.id, !guest.ticketReceived)}>
                      {guest.ticketReceived ? '수령완료' : '미수령'}
                    </button>
                    {guest.paymentConfirmed ? (
                      <button className="pf-mini" type="button" onClick={() => copyLink(guest.id)}>생성·복사</button>
                    ) : <span className="pf-muted">입금 확인 후 생성</span>}
                  </div>
                </article>
              ))}
            </div>
            <div className="pf-table-wrap pf-only-web">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>이름</th><th>전화번호</th><th>유형</th><th>입금 확인</th><th>입장 번호</th><th>티켓 수령</th><th>접속 링크</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((guest) => (
                    <tr key={guest.id}>
                      <td>{guest.name}</td>
                      <td>{formatPhone(guest.phone)}</td>
                      <td>{guest.kind}</td>
                      <td>
                        <button className={`pf-mini${guest.paymentConfirmed ? ' on' : ''}`} type="button" onClick={() => platform.confirmGuest(guest.id, !guest.paymentConfirmed)}>
                          {guest.paymentConfirmed ? '확인됨' : '확인'}
                        </button>
                      </td>
                      <td>{guest.entryNumber ?? '-'}</td>
                      <td>
                        <button className={`pf-mini${guest.ticketReceived ? ' on' : ''}`} type="button" onClick={() => platform.receiveTicket(guest.id, !guest.ticketReceived)}>
                          {guest.ticketReceived ? '수령완료' : '미수령'}
                        </button>
                      </td>
                      <td>
                        {guest.paymentConfirmed ? (
                          <button className="pf-mini" type="button" onClick={() => copyLink(guest.id)}>생성·복사</button>
                        ) : '입금 확인 후 생성'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="pf-muted">아직 예매가 없습니다.</p>}
          </section>

          <section className="pf-card pf-pad pf-stack">
            <h2>예매 정보</h2>
            <Field label="계좌번호" value={accountNumber} onChange={setAccountNumber} />
            <Field label="사전가" value={price} onChange={setPrice} />
            <Field label="현장가" value={walkInPrice} onChange={setWalkInPrice} />
            <button
              className="pf-btn"
              type="button"
              onClick={() => {
                platform.patchEvent(event.id, { accountNumber, price, walkInPrice })
                setNotice('예매 정보를 저장했습니다.')
              }}
            >
              저장
            </button>
          </section>

          <section className="pf-card pf-pad pf-stack">
            <h2>부가 기능</h2>
            <Toggle label="주류 구매" checked={event.features.drink} onChange={(enabled) => platform.setFeature(event.id, 'drink', enabled)} />
            <Toggle label="길찾기" checked={event.features.directions} onChange={(enabled) => platform.setFeature(event.id, 'directions', enabled)} />
            <Toggle label="입장 번호 추첨" checked={event.features.draw} onChange={(enabled) => platform.setFeature(event.id, 'draw', enabled)} />
            <Toggle label="전광판 만들기" checked={event.features.led} onChange={(enabled) => platform.setFeature(event.id, 'led', enabled)} />
          </section>

          <section className="pf-card pf-pad span">
            <h2>주류 주문</h2>
            {orders.length === 0 && <p className="pf-muted">주문이 없습니다.</p>}
            {orders.map((order) => (
              <div key={order.id} className="pf-row" style={{ marginTop: '0.55rem' }}>
                <span>{order.name} · 맥주 {order.beer} · 하이볼 {order.highball}</span>
                <button className={`pf-mini${order.provided ? ' on' : ''}`} type="button" onClick={() => platform.provideOrder(order.id)} disabled={order.provided}>
                  {order.provided ? '제공완료' : '제공 완료'}
                </button>
              </div>
            ))}
          </section>
        </div>
      </div>
    </HostGate>
  )
}

export function HostSettingsPage() {
  const { session, organizerById, patchOrganizer } = usePlatform()
  const organizer = session?.role === 'host' ? organizerById(session.organizerId) : undefined
  const [name, setName] = useState(organizer?.name ?? '')
  const [summary, setSummary] = useState(organizer?.summary ?? '')
  const [city, setCity] = useState(organizer?.city ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!organizer) return
    setName(organizer.name)
    setSummary(organizer.summary)
    setCity(organizer.city)
  }, [organizer])

  const save = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!organizer) return
    patchOrganizer(organizer.id, { name, summary, city })
    setSaved(true)
  }

  return (
    <HostGate>
      <form className="pf-card pf-pad pf-stack" onSubmit={save}>
        <h1>동아리 프로필</h1>
        <p className="pf-lead" style={{ textAlign: 'left' }}>이 내용이 동아리 공개 페이지에 나갑니다.</p>
        <Field label="동아리 이름" value={name} onChange={setName} />
        <label className="pf-label">소개</label>
        <textarea className="pf-textarea" value={summary} onChange={(input) => setSummary(input.target.value)} />
        <Field label="도시" value={city} onChange={setCity} />
        <button className="pf-btn" type="submit">저장</button>
        {saved && organizer && <Link className="pf-link" to={`/o/${organizer.id}`}>공개 페이지 보기</Link>}
      </form>
    </HostGate>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="pf-field">
      <span className="pf-label">{label}</span>
      <input className="pf-input" value={value} placeholder={placeholder} onChange={(input) => onChange(input.target.value)} />
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <label className="pf-check">
      <input type="checkbox" checked={checked} onChange={(input) => onChange(input.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
