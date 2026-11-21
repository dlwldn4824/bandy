import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import lockup from '../assets/logo-lockup.png'
import { links } from '../content.ts'

/** 내려가면 숨고 올라오면 나타납니다 — 상태 전환만, 420ms */
export default function Nav() {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (Math.abs(y - last) < 4) return
      el.style.transform = y > last && y > 120 ? 'translateY(-100%)' : 'translateY(0)'
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="b-nav" ref={ref}>
      <Link to="/brand" aria-label="BANDY">
        <img src={lockup} alt="BANDY" />
      </Link>
      <nav className="b-nav__links">
        <Link to={links.shows}>공연 둘러보기</Link>
        <Link to={links.clubs}>동아리 둘러보기</Link>
        <a href="#venue">공연장이라면</a>
        <a href="#about">BANDY 소개</a>
      </nav>
      <div className="b-nav__right">
        <Link to={links.my}>내 티켓</Link>
        {/* 「공연 올리기」 였는데, 처음 온 사람에게는 아직 할 수 없는 일입니다 —
            동아리를 찾아 들어가고 운영진 확인까지 거쳐야 열립니다. 게다가 그
            링크의 #start 는 id 가 두 군데에 있어 엉뚱한 섹션으로 갔습니다.
            이 버튼이 할 일은 하나입니다 — 가입 입구로 보내기. */}
        <Link className="b-pill" to={links.joinPick}>
          시작하기
        </Link>
      </div>
    </header>
  )
}
