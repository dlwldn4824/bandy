import { FormEvent, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePlatform } from '../store'

export default function ChatPage() {
  const { eventId = '' } = useParams()
  const { eventById, messages, addMessage, session, guestFor } = usePlatform()
  const event = eventById(eventId)
  const [text, setText] = useState('')
  const guest = event ? guestFor(event.id) : undefined
  const staffHere = session?.role === 'staff' && session.eventId === eventId
  const canSend = staffHere || guest?.paymentConfirmed === true

  if (!event) return <p className="pf-lead">공연을 찾지 못했습니다.</p>
  const thread = messages.filter((message) => message.eventId === event.id)

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!canSend || !text.trim()) return
    addMessage({ eventId: event.id, author: session?.name || '관객', text: text.trim() })
    setText('')
  }

  return (
    <div>
      <div className="pf-row" style={{ marginBottom: '0.75rem' }}>
        <h1>채팅</h1>
        <span className="pf-meta">이 공연만</span>
      </div>
      <div className="pf-chat">
        {thread.length === 0 && <p className="pf-muted">아직 메시지가 없습니다.</p>}
        {thread.map((message) => (
          <div key={message.id} className="pf-bubble">
            <strong>{message.author}</strong>
            <p>{message.text}</p>
          </div>
        ))}
      </div>
      <form className="pf-composer" onSubmit={submit}>
        <input
          className="pf-input"
          value={text}
          onChange={(input) => setText(input.target.value)}
          placeholder={canSend ? '메시지를 입력하세요' : '입금 확인 후 채팅을 사용할 수 있습니다.'}
          disabled={!canSend}
        />
        <button className="pf-btn" type="submit" disabled={!canSend || !text.trim()}>전송</button>
      </form>
      {!canSend && <p className="pf-hint" style={{ marginTop: '0.6rem' }}><Link className="pf-link" to={`/e/${event.id}/book`}>예매하고 입금 확인을 기다리기</Link></p>}
    </div>
  )
}
