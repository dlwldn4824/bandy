import { FormEvent, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MEMO_COLORS } from '../model'
import { usePlatform } from '../store'

export default function GuestbookPage() {
  const { eventId = '' } = useParams()
  const { eventById, notes, addNote, session } = usePlatform()
  const event = eventById(eventId)
  const [open, setOpen] = useState(false)
  const [color, setColor] = useState(MEMO_COLORS[0].value)
  const [name, setName] = useState(session?.name ?? '')
  const [text, setText] = useState('')

  if (!event) return <p className="pf-lead">공연을 찾지 못했습니다.</p>
  const wall = notes.filter((note) => note.eventId === event.id).slice().reverse()

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!name.trim() || !text.trim()) return
    addNote({ eventId: event.id, name: name.trim(), text: text.trim(), color })
    setText('')
    setOpen(false)
  }

  return (
    <div>
      <div className="pf-row">
        <h1>방명록</h1>
        <button className="pf-fill" type="button" onClick={() => setOpen(true)}>메모지 붙이기</button>
      </div>
      <div className="pf-notes" style={{ marginTop: '1rem' }}>
        {wall.map((note) => (
          <article key={note.id} className="pf-note" style={{ background: note.color }}>
            <strong>{note.name}</strong>
            <p>{note.text}</p>
          </article>
        ))}
      </div>
      {wall.length === 0 && <p className="pf-lead">아직 메모지가 없습니다.</p>}

      {open && (
        <div className="pf-modal" onClick={() => setOpen(false)}>
          <form className="pf-card pf-pad pf-sheet" onClick={(click) => click.stopPropagation()} onSubmit={submit}>
            <h2>메모지 디자인 선택</h2>
            <div className="pf-colors" style={{ margin: '0.75rem 0' }}>
              {MEMO_COLORS.map((item) => (
                <button key={item.id} type="button" className={`pf-swatch${color === item.value ? ' active' : ''}`} style={{ background: item.value }} aria-label={item.label} onClick={() => setColor(item.value)} />
              ))}
            </div>
            <input className="pf-input" value={name} onChange={(input) => setName(input.target.value)} placeholder="이름" maxLength={20} />
            <textarea className="pf-textarea" style={{ marginTop: '0.6rem' }} value={text} onChange={(input) => setText(input.target.value)} placeholder="메시지를 입력하세요" maxLength={200} />
            <p className="pf-hint">{text.length} / 200</p>
            <button className="pf-btn" type="submit">붙이기</button>
            <button className="pf-btn secondary" type="button" onClick={() => setOpen(false)}>취소</button>
          </form>
        </div>
      )}
    </div>
  )
}
