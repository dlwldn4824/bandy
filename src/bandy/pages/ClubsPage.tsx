import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useBandy } from '../store'
import { canSeeOpenChat, isPastEvent, managerClubIds, publicClubs, publicEvents, safeUrl } from '../repo'
import { Backend } from '../backend'
import { Empty, EventItem, ImageInput, NeedLogin, PageHeader, Thumb } from '../components'
import { EXCHANGE_KIND_LABEL, ExchangeKind } from '../types'
import { shortDate } from '../format'

export function ClubsPage() {
  const { me } = useBandy()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'find' | 'inbox'>(params.get('tab') === 'inbox' ? 'inbox' : 'find')
  return (
    <div className="b-page">
      <PageHeader title="동아리 찾기" />
      <div className="b-seg">
        <button type="button" className={tab === 'find' ? 'on' : ''} onClick={() => setTab('find')}>동아리 찾기</button>
        <button type="button" className={tab === 'inbox' ? 'on' : ''} onClick={() => setTab('inbox')}>교류 신청함</button>
      </div>
      {tab === 'find' ? <FindClubs /> : me ? <Inbox /> : <NeedLogin what="교류 신청함" />}
    </div>
  )
}

function FindClubs() {
  const { db } = useBandy()
  const clubs = publicClubs(db)
  const genres = ['전체', ...Array.from(new Set(clubs.map((c) => c.genre).filter(Boolean)))]
  const regions = ['전체', ...Array.from(new Set(clubs.map((c) => c.region).filter(Boolean)))]
  const [genre, setGenre] = useState('전체')
  const [region, setRegion] = useState('전체')
  const [openOnly, setOpenOnly] = useState(false)
  const list = clubs.filter((c) => (genre === '전체' || c.genre === genre)
    && (region === '전체' || c.region === region) && (!openOnly || c.exchange_open))

  return (
    <>
      <div className="b-chips">
        {genres.map((g) => <button key={g} type="button" className={`b-chip${genre === g ? ' active' : ''}`} onClick={() => setGenre(g)}>{g}</button>)}
      </div>
      <div className="b-row between b-filters">
        <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="지역">
          {regions.map((r) => <option key={r} value={r}>{r === '전체' ? '지역 전체' : r}</option>)}
        </select>
        <label className="b-check"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> 교류 받는 곳만</label>
      </div>
      <div className="b-list">
        {list.map((c) => (
          <Link key={c.id} to={`/app/c/${c.id}`} className="b-card b-club">
            {c.profile_path && <Thumb src={c.profile_path} className="round" />}
            <span className="b-grow b-stack tight">
              <strong>{c.name}</strong>
              <span className="b-sub">{c.school} · {c.genre} · {c.region}</span>
            </span>
            {c.exchange_open ? <span className="b-status ok">교류 열림</span> : <span className="b-status">교류 닫힘</span>}
          </Link>
        ))}
        {list.length === 0 && <Empty>조건에 맞는 동아리가 없어요.</Empty>}
      </div>
      <Link to="/app/clubs/new" className="b-btn ghost">우리 동아리 등록하기</Link>
    </>
  )
}

function Inbox() {
  const { db, me, call, showToast } = useBandy()
  const mine = managerClubIds(db, me!.id)
  if (mine.length === 0) {
    return (
      <div className="b-card b-pad b-stack b-center">
        <p className="b-sub">교류 신청은 동아리 운영진이 할 수 있어요.</p>
        <Link to="/app/clubs/new" className="b-btn">동아리 등록하기</Link>
      </div>
    )
  }
  const clubName = (id: string) => db.clubs.find((c) => c.id === id)?.name ?? ''
  const received = db.exchange_requests.filter((r) => mine.includes(r.to_club_id) && r.status === 'PENDING')
  const sent = db.exchange_requests.filter((r) => mine.includes(r.from_club_id) && r.status === 'PENDING')
  const connected = db.exchange_requests.filter((r) => r.status === 'ACCEPTED' && (mine.includes(r.from_club_id) || mine.includes(r.to_club_id)))

  const act = async (fn: (b: Backend) => Promise<unknown>, ok: string) => {
    const r = await call(fn)
    showToast(r.ok ? ok : r.error)
  }

  return (
    <div className="b-stack">
      <h2 className="b-h2">받은 신청</h2>
      {received.map((r) => (
        <article key={r.id} className="b-card b-pad b-stack">
          <div className="b-row between"><strong>{clubName(r.from_club_id)}</strong><span className="b-badge">{EXCHANGE_KIND_LABEL[r.kind]}</span></div>
          {r.message && <p className="b-body">“{r.message}”</p>}
          <div className="b-row">
            <button type="button" className="b-btn small" onClick={() => act((b) => b.respondExchange(r.id, true), '수락했어요. 서로 오픈채팅 링크가 보여요.')}>수락</button>
            <button type="button" className="b-btn ghost small" onClick={() => act((b) => b.respondExchange(r.id, false), '거절했어요.')}>거절</button>
          </div>
        </article>
      ))}
      {received.length === 0 && <Empty>받은 신청이 없어요.</Empty>}

      <h2 className="b-h2">보낸 신청</h2>
      {sent.map((r) => (
        <article key={r.id} className="b-card b-pad b-row between">
          <span><strong>{clubName(r.to_club_id)}</strong> <span className="b-sub">· {EXCHANGE_KIND_LABEL[r.kind]} · 응답 대기</span></span>
          <button type="button" className="b-btn ghost small" onClick={() => act((b) => b.cancelExchange(r.id), '신청을 취소했어요.')}>취소</button>
        </article>
      ))}
      {sent.length === 0 && <Empty>보낸 신청이 없어요.</Empty>}

      <h2 className="b-h2">연결된 동아리</h2>
      {connected.map((r) => {
        const other = mine.includes(r.from_club_id) ? r.to_club_id : r.from_club_id
        const club = db.clubs.find((c) => c.id === other)
        if (!club) return null
        const chat = safeUrl(club.open_chat_url)
        return (
          <article key={r.id} className="b-card b-pad b-row between">
            <span><Link to={`/app/c/${club.id}`}><strong>{club.name}</strong></Link> <span className="b-sub">· {EXCHANGE_KIND_LABEL[r.kind]}</span></span>
            {chat
              ? <a className="b-btn small" href={chat} target="_blank" rel="noreferrer">오픈채팅</a>
              : <span className="b-sub">링크 없음</span>}
          </article>
        )
      })}
      {connected.length === 0 && <Empty>아직 연결된 동아리가 없어요.</Empty>}
    </div>
  )
}

export function ClubPage() {
  const { clubId = '' } = useParams()
  const { db, me, call, showToast } = useBandy()
  const mine = managerClubIds(db, me?.id ?? null).filter((id) => id !== clubId && db.clubs.find((c) => c.id === id)?.status === 'ACTIVE')
  const [from, setFrom] = useState(mine[0] ?? '')
  const [kind, setKind] = useState<ExchangeKind>('JOINT_SHOW')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const club = db.clubs.find((c) => c.id === clubId)
  const isManager = managerClubIds(db, me?.id ?? null).includes(clubId)
  if (!club || (club.status !== 'ACTIVE' && !isManager)) return <div className="b-page"><Empty>동아리를 찾지 못했어요.</Empty></div>

  const events = publicEvents(db).filter((e) => e.club_id === club.id && !isPastEvent(e))
  const myMembership = me ? db.club_memberships.find((m) => m.club_id === club.id && m.user_id === me.id) : undefined
  const sns = safeUrl(club.sns_url)
  const chat = safeUrl(club.open_chat_url)
  const showChat = canSeeOpenChat(db, me?.id ?? null, club.id)
  const pendingFromMe = db.exchange_requests.some((r) => r.to_club_id === club.id && mine.includes(r.from_club_id) && r.status === 'PENDING')

  const send = async () => {
    const r = await call((b) => b.requestExchange(from || mine[0], club.id, kind, message))
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError('')
    setMessage('')
    showToast('교류를 신청했어요. 상대 운영진이 수락하면 오픈채팅 링크가 열려요.')
  }

  return (
    <div className="b-page">
      <PageHeader back />
      <section className="b-club-head">
        {club.profile_path && <Thumb src={club.profile_path} className="round big" />}
        <h1>{club.name}</h1>
        <p className="b-sub">{club.school} · {club.genre} · {club.region}</p>
        {club.status !== 'ACTIVE' && <p className="b-warn">{club.status === 'SUSPENDED' ? '운영이 정지된 동아리예요. 다른 사람에게 보이지 않아요.' : '운영자 승인 대기 중이에요. 승인 전에는 다른 사람에게 보이지 않아요.'}</p>}
        {club.introduction && <p className="b-body">{club.introduction}</p>}
        <div className="b-row center">
          {sns && <a className="b-link" href={sns} target="_blank" rel="noreferrer">인스타그램</a>}
          {showChat && chat && <a className="b-link" href={chat} target="_blank" rel="noreferrer">오픈채팅</a>}
          {isManager && <Link className="b-link" to={`/app/manage/${club.id}`}>동아리 관리</Link>}
        </div>
      </section>

      {!isManager && club.status === 'ACTIVE' && me && (
        <section className="b-card b-pad b-row between">
          <span className="b-stack tight">
            <strong>동아리 부원이신가요?</strong>
            <span className="b-sub">가입하면 운영진이 입금 확인·입장 처리를 맡길 수 있어요.</span>
          </span>
          {myMembership?.status === 'ACTIVE' ? <span className="b-status ok">부원</span>
            : myMembership?.status === 'PENDING' ? <span className="b-status wait">가입 신청 중</span>
              : <button type="button" className="b-btn small" onClick={async () => { const r = await call((b) => b.requestClubJoin(club.id)); showToast(r.ok ? '가입을 신청했어요. 운영진이 수락하면 알려 드려요.' : r.error) }}>가입 신청</button>}
        </section>
      )}

      {!isManager && club.status === 'ACTIVE' && (
        <section className="b-card b-pad b-stack">
          <h2>교류 신청</h2>
          {!club.exchange_open && <p className="b-sub">지금은 교류를 받지 않는 동아리예요.</p>}
          {club.exchange_open && !me && <Link to="/app/login" className="b-btn">로그인하고 신청하기</Link>}
          {club.exchange_open && me && mine.length === 0 && <p className="b-sub">승인된 동아리의 운영진만 교류를 신청할 수 있어요.</p>}
          {club.exchange_open && me && mine.length > 0 && (pendingFromMe
            ? <p className="b-sub">보낸 신청이 응답을 기다리고 있어요.</p>
            : (
              <>
                {mine.length > 1 && (
                  <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="신청하는 동아리">
                    {mine.map((id) => <option key={id} value={id}>{db.clubs.find((c) => c.id === id)?.name}</option>)}
                  </select>
                )}
                <div className="b-chips">
                  {(Object.keys(EXCHANGE_KIND_LABEL) as ExchangeKind[]).map((k) => (
                    <button key={k} type="button" className={`b-chip${kind === k ? ' active' : ''}`} onClick={() => setKind(k)}>{EXCHANGE_KIND_LABEL[k]}</button>
                  ))}
                </div>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} placeholder="한마디 남기기 (선택)" />
                {error && <p className="b-warn">{error}</p>}
                <button type="button" className="b-btn" onClick={send}>교류 신청하기</button>
              </>
            ))}
        </section>
      )}

      <section className="b-stack">
        <h2 className="b-h2">공연</h2>
        <div>{events.map((e) => <EventItem key={e.id} event={e} />)}</div>
        {events.length === 0 && <Empty>공개된 행사가 없어요.</Empty>}
      </section>
      <p className="b-note">가입일 {shortDate(club.created_at)}</p>
    </div>
  )
}

export function NewClubPage() {
  const { me, call, showToast } = useBandy()
  const navigate = useNavigate()
  const [f, setF] = useState({ name: '', school: '', genre: '밴드', region: '노원구', introduction: '', sns_url: '', open_chat_url: '', exchange_open: true })
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState('')
  if (!me) return <div className="b-page"><NeedLogin what="동아리 등록" /></div>
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const submit = async () => {
    const r = await call((b) => b.createClub({ ...f, profile_path: image }))
    if (!r.ok) {
      setError(r.error)
      return
    }
    showToast('등록했어요. 운영자가 인스타그램을 확인하고 승인하면 공개돼요.')
    navigate(`/app/manage/${r.value}`)
  }

  return (
    <div className="b-page">
      <PageHeader back title="동아리 등록" />
      <div className="b-card b-pad b-stack">
        <label className="b-field"><span>동아리 이름</span><input value={f.name} onChange={set('name')} /></label>
        <label className="b-field"><span>학교</span><input value={f.school} onChange={set('school')} placeholder="광운대" /></label>
        <label className="b-field"><span>장르</span><input value={f.genre} onChange={set('genre')} /></label>
        <label className="b-field"><span>지역</span><input value={f.region} onChange={set('region')} /></label>
        <ImageInput label="프로필 이미지" value={image} onChange={setImage} />
        <label className="b-field"><span>SNS 링크 (인스타그램)</span><input value={f.sns_url} onChange={set("sns_url")} placeholder="https://instagram.com/..." /></label>
        <label className="b-field"><span>오픈채팅 링크 (교류가 연결된 동아리에만 보여요)</span><input value={f.open_chat_url} onChange={set('open_chat_url')} /></label>
        <label className="b-field"><span>소개</span><textarea value={f.introduction} onChange={set('introduction')} /></label>
        <label className="b-check"><input type="checkbox" checked={f.exchange_open} onChange={(e) => setF({ ...f, exchange_open: e.target.checked })} /> 다른 동아리의 교류 신청 받기</label>
        <p className="b-note">처음에는 운영자가 인스타그램을 보고 직접 승인해요.</p>
        {error && <p className="b-warn">{error}</p>}
        <button type="button" className="b-btn" onClick={submit}>등록 신청</button>
      </div>
    </div>
  )
}
