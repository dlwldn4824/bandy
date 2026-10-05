import { FormEvent, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePlatform } from '../store'

export default function SetlistPage() {
  const { eventId = '' } = useParams()
  const { eventById, session, addMessage } = usePlatform()
  const event = eventById(eventId)
  const [part, setPart] = useState(event?.setlist[0]?.part ?? '')
  const [songId, setSongId] = useState<string | null>(null)
  const [cheer, setCheer] = useState('')
  const [sent, setSent] = useState(false)

  if (!event) return <p className="pf-lead">공연을 찾지 못했습니다.</p>
  if (event.setlist.length === 0) return <p className="pf-lead">공연 정보가 아직 설정되지 않았습니다.</p>

  const parts = [...new Set(event.setlist.map((song) => song.part))]
  const selectedPart = parts.includes(part) ? part : parts[0]
  const songs = event.setlist.filter((song) => song.part === selectedPart)
  const selected = event.setlist.find((song) => song.id === songId)

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!selected || !cheer.trim()) return
    const author = session?.name || '익명'
    addMessage({ eventId: event.id, author, text: `${selected.song} 응원: ${cheer.trim()}` })
    setCheer('')
    setSent(true)
  }

  return (
    <div>
      <div className="pf-part">
        {parts.map((item) => (
          <button key={item} type="button" className={`pf-tab${item === selectedPart ? ' active' : ''}`} onClick={() => setPart(item)}>{item}</button>
        ))}
      </div>
      <div className="pf-card pf-pad">
        {songs.map((song, index) => (
          <button key={song.id} type="button" className="pf-song" onClick={() => { setSongId(song.id); setSent(false) }}>
            <span className="pf-dot">{index + 1}</span>
            <span>
              <b>{song.song}</b>
              <span className="pf-meta">{song.team} · {song.artist}</span>
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="pf-modal" onClick={() => setSongId(null)}>
          <div className="pf-card pf-pad pf-sheet" onClick={(click) => click.stopPropagation()}>
            <div className="pf-row">
              <h2>{selected.song}</h2>
              <button className="pf-pill" type="button" onClick={() => setSongId(null)}>닫기</button>
            </div>
            <p className="pf-meta">{selected.part} · {selected.team}</p>
            <p style={{ margin: '0.7rem 0' }}>{selected.members}</p>
            <h3>응원하기</h3>
            <form onSubmit={submit}>
              <textarea className="pf-textarea" value={cheer} onChange={(input) => setCheer(input.target.value)} placeholder="이 곡에 대한 응원 메시지를 입력하세요" maxLength={200} />
              <button className="pf-btn" type="submit">남기기</button>
            </form>
            {sent && <p className="pf-hint" style={{ marginTop: '0.5rem' }}>채팅에 응원이 남았습니다.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
