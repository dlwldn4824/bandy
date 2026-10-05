import { FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { digits } from '../model'
import { usePlatform } from '../store'

export default function StaffLoginPage() {
  const { eventId = '' } = useParams()
  const navigate = useNavigate()
  const { eventById, setStaffSession } = usePlatform()
  const event = eventById(eventId)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  if (!event) return <section className="pf-auth"><h1>공연이 없습니다</h1></section>

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault()
    if (!name.trim()) {
      setError('이름을 입력해 주세요.')
      return
    }
    if (code.trim() !== event.staffCode) {
      setError('운영진 코드를 확인해 주세요.')
      return
    }
    setStaffSession(event.id, name.trim())
    navigate(`/e/${event.id}/home`)
  }

  return (
    <section className="pf-auth">
      <button type="button" className="pf-x" aria-label="닫기" onClick={() => navigate(`/e/${event.id}`)} />
      <form onSubmit={submit}>
        <h1>운영진 로그인</h1>
        <p className="pf-lead">{event.title}<br />이름과 이 공연의 운영진 코드를 입력해 주세요.</p>
        <div className="pf-field">
          <label className="pf-label" htmlFor="staff-name">이름</label>
          <input id="staff-name" className="pf-input" value={name} onChange={(input) => setName(input.target.value)} placeholder="이름을 입력하세요" />
        </div>
        <div className="pf-field" style={{ marginTop: '0.85rem' }}>
          <label className="pf-label" htmlFor="staff-code">운영진 코드</label>
          <input id="staff-code" className="pf-input" value={code} onChange={(input) => setCode(input.target.value)} placeholder="운영진 코드를 입력해 주세요" />
        </div>
        {error && <p className="pf-error">{error}</p>}
        <button className="pf-btn" type="submit">로그인</button>
        <p className="pf-hint" style={{ textAlign: 'center', marginTop: '0.8rem' }}>
          코드는 주최의 <Link className="pf-link" to={`/host/e/${event.id}`}>운영 화면</Link>에 있습니다.
        </p>
      </form>
    </section>
  )
}
