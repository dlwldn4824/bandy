import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePlatform } from '../store'

export default function TokenPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { guests, setGuestSession } = usePlatform()
  const guest = guests.find((item) => item.id === token)

  useEffect(() => {
    if (!guest) return
    setGuestSession(guest)
    navigate(`/e/${guest.eventId}/home`, { replace: true })
  }, [guest, navigate, setGuestSession])

  if (!guest) {
    return (
      <section className="pf-auth">
        <h1>링크를 찾지 못했습니다</h1>
        <p className="pf-lead">입금 확인 후 만든 개인 링크인지 확인해 주세요.</p>
        <Link className="pf-btn" to="/">공연 찾기</Link>
      </section>
    )
  }

  return (
    <section className="pf-auth">
      <h1>입장 중</h1>
      <p className="pf-lead">{guest.name}님의 공연 홈으로 이동합니다.</p>
    </section>
  )
}
