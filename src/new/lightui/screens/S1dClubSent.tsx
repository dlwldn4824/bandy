import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone'
import TopBar from '../components/TopBar'
import Button from '../components/Button'
import { P } from '../paths'
import { useClubJoin, forgetClubJoin } from '../auth/clubJoin'
import './S1dClubSent.css'

/**
 * 신청을 보냈습니다 — 승인 대기.
 *
 * 왜 바로 운영진이 되지 않는지를 여기서 말해야 합니다. 설명 없이 「대기 중」
 * 만 띄우면 사람들은 고장 난 줄 알고 다시 누릅니다.
 *
 * 생성 신청은 **이름 선점** 때문에 사람이 확인합니다. 자동이면 아무나
 * 「멜로딕」 을 먼저 등록하고 그 계정으로 티켓값을 받을 수 있습니다.
 * 확인 수단은 동아리 공식 계정에서 코드를 보내는 것 — 공식 계정은 운영진만
 * 관리하니까요.
 */
const S1dClubSent = () => {
  const navigate = useNavigate()
  const req = useClubJoin()

  if (!req) {
    return (
      <Phone>
        <TopBar title="동아리" back={P.clubPick()} />
        <div className="lui-body">
          <p className="s1d__none">신청한 내역이 없습니다.</p>
        </div>
        <div className="lui-bottombar">
          <Button block onClick={() => navigate(P.clubPick())}>
            우리 동아리 찾기
          </Button>
        </div>
      </Phone>
    )
  }

  const creating = req.kind === 'create'

  // 받아 줬거나 거절당했으면 「확인 중」 을 계속 보여 줄 수 없습니다.
  // 거절은 특히 말해 줘야 합니다 — 조용하면 고장 난 줄 알고 다시 신청합니다.
  if (req.state !== 'pending') {
    const ok = req.state === 'approved'
    return (
      <Phone>
        <TopBar title={creating ? '동아리 만들기' : '참여 신청'} />
        <div className="lui-body">
          <div className="s1d">
            <span className={`s1d__badge${ok ? '' : ' s1d__badge--off'}`}>
              {ok ? '받아 줬어요' : '거절됐어요'}
            </span>
            <h1 className="s1d__title">
              <b>{req.clubName}</b>
              {ok ? (
                <>
                  <br />
                  {creating ? '등록이 끝났습니다' : '부원이 되었습니다'}
                </>
              ) : (
                <>
                  {' '}
                  신청이
                  <br />
                  받아들여지지 않았습니다
                </>
              )}
            </h1>
            <p className="s1d__lead">
              {ok
                ? creating
                  ? '이제 공연을 올리고 입금·정산까지 할 수 있어요.'
                  : '동아리 탭에서 우리 동아리가 보이고, 공연 소식이 알림으로 옵니다.'
                : req.reason ||
                  '까닭은 적혀 있지 않습니다. 동아리 운영진에게 물어보거나 다시 신청해 주세요.'}
            </p>
          </div>
        </div>
        <div className="lui-bottombar lui-bottombar--stack">
          <Button block onClick={() => navigate(ok ? P.home : P.clubPick())}>
            {ok ? '둘러보러 가기' : '다시 고르기'}
          </Button>
          {ok && (
            <button type="button" className="s1d__cancel" onClick={() => forgetClubJoin()}>
              이 안내 닫기
            </button>
          )}
        </div>
      </Phone>
    )
  }

  return (
    <Phone>
      <TopBar title={creating ? '동아리 만들기' : '참여 신청'} />
      <div className="lui-body">
        <div className="s1d">
          <span className="s1d__badge">확인 중</span>

          <h1 className="s1d__title">
            {creating ? (
              <>
                <b>{req.clubName}</b> 등록을
                <br />
                신청했습니다
              </>
            ) : (
              <>
                <b>{req.clubName}</b> 에<br />
                참여를 신청했습니다
              </>
            )}
          </h1>

          <p className="s1d__lead">
            {creating
              ? '동아리 이름은 먼저 잡아 뒀습니다. 확인이 끝나면 공연을 올릴 수 있어요.'
              : '그 동아리 운영진이 받아 주면 부원이 됩니다. 알림으로 알려 드려요.'}
          </p>

          {creating && (
            <>
              <div className="s1d__gap" />
              <div className="lui-card s1d-verify">
                <p className="s1d-verify__head">확인하는 방법</p>
                <p className="s1d-verify__body">
                  동아리 <b>공식 인스타그램 계정</b>에서 아래 코드를 밴디로 보내 주세요.
                  공식 계정은 운영진만 관리하니까, 이것만으로 확인됩니다.
                </p>
                <p className="s1d-verify__code">{req.code}</p>
                <p className="s1d-verify__body">
                  계정이 없으면 지난 공연 포스터나 공연 사진도 됩니다. 이미 밴디를 쓰는
                  동아리 운영진이 보증해 줘도 돼요.
                </p>
              </div>

              <div className="s1d__gap" />
              <p className="s1d__why">
                바로 승인하지 않는 이유는 <b>이름 선점</b> 때문입니다. 자동이면 아무나 남의
                동아리 이름을 먼저 등록하고, 그 계정으로 티켓값을 받게 됩니다.
              </p>
            </>
          )}

          <div className="s1d__gap" />
          <div className="lui-card s1d-sum">
            <div className="s1d-sum__row">
              <span>동아리</span>
              <b>{req.clubName}</b>
            </div>
            {req.school && (
              <div className="s1d-sum__row">
                <span>학교</span>
                <b>{req.school}</b>
              </div>
            )}
            <div className="s1d-sum__row">
              <span>신청</span>
              <b>{new Date(req.at).toLocaleDateString('ko-KR')}</b>
            </div>
          </div>

          <div className="s1d__gap" />
          <p className="s1d__note">
            기다리는 동안에도 공연은 둘러볼 수 있습니다. 예매도 됩니다.
          </p>
        </div>
      </div>

      {/* 버튼과 취소 링크를 한 줄에 두면 둘 다 버튼처럼 보입니다. 위아래로 쌓습니다. */}
      <div className="lui-bottombar lui-bottombar--stack">
        <Button block onClick={() => navigate(P.home)}>
          둘러보러 가기
        </Button>
        <button
          type="button"
          className="s1d__cancel"
          onClick={() => {
            forgetClubJoin()
            navigate(P.clubPick())
          }}
        >
          신청 취소하고 다시 고르기
        </button>
      </div>
    </Phone>
  )
}

export default S1dClubSent
