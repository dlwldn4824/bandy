import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TopBar from '../components/TopBar.tsx'
import Button from '../components/Button.tsx'
import { P } from '../paths.ts'
import type { Stage } from './stage.ts'
import './NotSelling.css'

/**
 * 지금 팔지 않는 공연의 예매·입금 자리.
 *
 * `D1Show` 는 단계를 보고 아래 버튼을 잠갔는데, `/book` 과 `/deposit` 은
 * 보지 않았습니다. 버튼을 잠그는 것으로는 모자랍니다 — **링크·초대장·
 * 북마크는 버튼을 거치지 않고 그 주소로 바로 들어갑니다.** 어제 끝난
 * 공연의 예매가 끝까지 되고, 입금 안내가 23:54 남았다고 세고 있었습니다.
 *
 * 막기만 하면 막다른 길이 되니 공연 상세로 가는 길을 함께 둡니다.
 */

const WORDS: Record<Exclude<Stage, 'selling'>, { title: string; sub: string }> = {
  draft: {
    title: '아직 열지 않은 공연이에요',
    sub: '주최 동아리가 준비하는 중입니다. 열리면 공연 화면에서 예매할 수 있어요.',
  },
  gathering: {
    title: '아직 예매를 받지 않아요',
    sub: '함께 설 팀을 모으는 중입니다. 팀이 모이면 예매가 열려요.',
  },
  closed: {
    title: '예매가 마감됐어요',
    sub: '자리가 다시 생기면 공연 화면에 열립니다.',
  },
  today: {
    title: '오늘 공연이에요',
    sub: '예매는 닫혔습니다. 현장 상황은 공연 화면에서 볼 수 있어요.',
  },
  settling: {
    title: '끝난 공연이에요',
    sub: '지난 공연이라 예매할 수 없습니다.',
  },
}

const NotSelling = ({ showId, stage }: { showId: string; stage: Exclude<Stage, 'selling'> }) => {
  const navigate = useNavigate()
  const w = WORDS[stage]

  return (
    <Phone>
      <TopBar title="예매" back={P.show(showId)} />
      <div className="lui-body">
        <div className="notsell">
          <div className="lui-card notsell__card">
            <p className="notsell__title">{w.title}</p>
            <p className="notsell__sub">{w.sub}</p>
          </div>
        </div>
      </div>
      <div className="lui-bottombar lui-bottombar--stack">
        <Button block onClick={() => navigate(P.show(showId), { replace: true })}>
          공연 보러 가기
        </Button>
      </div>
    </Phone>
  )
}

export default NotSelling
