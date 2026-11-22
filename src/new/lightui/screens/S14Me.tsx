import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Phone from '../components/Phone.tsx'
import TabBar from '../components/TabBar.tsx'
import SectionHeader from '../components/SectionHeader.tsx'
import ListRow from '../components/ListRow.tsx'
import Icon from '../components/Icon.tsx'
import MoreMenu from '../components/MoreMenu.tsx'
import Sheet from '../components/Sheet.tsx'
import Button from '../components/Button.tsx'
import { P } from '../paths.ts'
import { getSession, signOut } from '../auth/kakao.ts'
import DeleteAccount from '../auth/DeleteAccount.tsx'
import { useBlocked } from '../safety/report.ts'
import { useRole } from '../auth/role.ts'
import { useMembership } from '../auth/membership.ts'
import { useMembers } from '../auth/members.ts'
import { useClubJoin } from '../auth/clubJoin.ts'
import { isDemoUser } from '../clubs/owner.ts'
import { myTickets } from '../../mocks/bandyLight.ts'
import { membersCopy } from '../../mocks/bandyLight.ts'
import { me } from '../../mocks/bandyLight.ts'
import { THEME_LABELS, useTheme, type ThemeMode } from '../theme.ts'
import './S14Me.css'

/** S14 마이 — Figma 217:2 */
const MenuRow = ({
  title,
  value,
  onClick,
}: {
  title: string
  value?: string
  onClick?: () => void
}) => (
  <button type="button" className="s14-menu-row" onClick={onClick}>
    <span className="s14-menu-row__title">{title}</span>
    {value && <span className="s14-menu-row__value">{value}</span>}
    <Icon name="chevron-right" size={18} className="s14-menu-row__chev" />
  </button>
)

const MODES: ThemeMode[] = ['system', 'light', 'dark']

/**
 * 설정 줄이 어디로 가는지.
 *
 * 전에는 「알림 설정」 만 목적지가 있고 나머지 셋은 눌러도 아무 일이
 * 없었습니다. 그중 「공연장으로 등록하기」 가 특히 아팠습니다 — 공연장
 * 화면으로 가는 의도된 길이 **가입 첫 화면에서 공연장을 고르는 것 하나뿐**
 * 이라, 나중에 공연장이 된 사람은 들어갈 데가 없었습니다.
 *
 * 갈 데가 아직 없는 줄은 「준비 중」 이라고 말합니다. 눌러도 아무 일이
 * 없으면 고장으로 읽힙니다.
 */
const SETTING_TO: Record<string, string> = {
  '알림 설정': P.notifications,
  '공연장으로 등록하기': P.onboarding('venue'),
  // 「준비 중」 이던 자리입니다. 등록할 데가 없어서 운영진이 예매를 못 열었습니다.
  '계좌 · 환불 정보': P.bankAccount,
}

const SETTING_SOON: Record<string, string> = {
  문의하기:
    '문의 창구를 준비 중입니다. 급한 일은 공연을 연 동아리에 바로 연락해 주세요 — 공연 화면에 연락처가 있습니다.',
}
const S14Me = () => {
  const navigate = useNavigate()
  const { mode, resolved, setMode } = useTheme()
  const { role, isManager } = useRole()
  const { membership, inClub, setMembership } = useMembership()
  const [leaveOpen, setLeaveOpen] = useState(false)
  // 마지막 운영진이 그냥 나가면 공연도 못 올리고 정산도 못 받는 동아리가 남습니다
  const { members, alone, handOverAndLeave } = useMembers()
  const [heir, setHeir] = useState<string | null>(null)
  const mustHandOver = isManager && alone
  const heirs = members.filter((m) => !m.me)
  /**
   * 보낸 신청 — 한 번 떠나면 돌아올 길이 없던 화면입니다.
   * 확인 코드(`BANDY-xxxxxx`)도 그 화면에만 있어서, 뒤로 나가면 끝이었습니다.
   */
  const sent = useClubJoin()
  /** 예매·찜·팔로우는 사람에게 붙습니다 — 적어 둔 수는 데모 계정 것입니다 */
  const mine = isDemoUser()
  const [delOpen, setDelOpen] = useState(false)
  const { count: blockedCount } = useBlocked()
  const [soon, setSoon] = useState<{ title: string; text: string } | null>(null)

  /**
   * 프로필은 적어 둔 목이 아니라 **이 사람의 세션**에서 읽습니다.
   *
   * 전에는 한양대 실용음악과로 막 가입한 사람에게도 「이지우 · 광운대학교 ·
   * jiwoo@kw.ac.kr」 이 떴습니다. 학교를 묻지 않은 직장인에게는 묻지도 않은
   * 학교가, 모든 사람에게는 남의 이메일이 보였습니다.
   */
  const session = getSession()
  const profileSub =
    [session?.school, session?.department].filter(Boolean).join(' · ') ||
    session?.email ||
    (session ? '프로필을 채워 주세요' : '카카오나 이메일로 시작할 수 있어요')

  return (
    <Phone>
      <div className="lui-body">
        <div className="s14">
          <div className="s14__gap-14" />
          <div className="s14__head">
            <h1 className="s14__title">마이</h1>
            <MoreMenu
              items={[
                { label: '프로필 수정', to: P.onboarding() },
                { label: '알림 설정', to: P.notifications },
              ]}
            />
          </div>

          <div className="s14__gap-14" />
          <div className="lui-card s14__profile">
            <ListRow
              // 로그인은 했는데 이름을 아직 안 적은 사람이 있습니다 (이메일로
              // 막 들어와 온보딩을 건너뛴 경우). 그 사람에게 「로그인하기」 를
              // 보여 주면 이미 한 일을 또 하라는 말이 됩니다.
              avatar={session?.initial || (session ? '·' : '?')}
              title={session ? session.nickname || '이름을 적어 주세요' : '로그인하기'}
              sub={profileSub}
              chevron
              onClick={() => navigate(session ? P.onboarding() : P.join)}
            />
          </div>

          <div className="s14__gap-26" />
          {/* 적어 둔 목록의 길이가 아니라 실제 소속 수. 없으면 0 입니다 */}
          <SectionHeader title="내 동아리" aside={membership ? '1' : '0'} />
          <div className="lui-card s14__group">
            {/* 적어 둔 목록이 아니라 실제 소속을 그립니다 */}
            {membership && (
              <ListRow
                avatar={membership.clubName.slice(0, 1)}
                title={membership.clubName}
                sub={`${membership.role === 'manager' ? '운영진' : '부원'} · 참여 코드 ${membership.code}`}
                slot={
                  <span className="lui-pill lui-pill--lg">
                    {membership.role === 'manager' ? '운영진' : '부원'}
                  </span>
                }
                onClick={() => navigate(P.club(membership.clubId))}
              />
            )}
            {sent && (
              <ListRow
                avatar="…"
                title="보낸 신청"
                sub={
                  sent.state === 'pending'
                    ? sent.code
                      ? `확인 코드 ${sent.code}`
                      : `${sent.clubName} · 답을 기다리는 중`
                    : `${sent.clubName} · ${sent.state === 'approved' ? '받아 줬어요' : '거절됐어요'}`
                }
                slot={
                  sent.state === 'pending' ? (
                    <span className="lui-pill lui-pill--lg lui-pill--outline">기다리는 중</span>
                  ) : undefined
                }
                chevron
                onClick={() => navigate(P.clubJoinSent)}
              />
            )}
            {inClub ? (
              <ListRow
                avatar="–"
                title="동아리에서 나가기"
                sub={
                  mustHandOver
                    ? '마지막 운영진이라 넘길 사람을 먼저 골라야 합니다'
                    : '나가면 운영 화면이 닫히고 관객으로 돌아갑니다'
                }
                chevron
                onClick={() => setLeaveOpen(true)}
              />
            ) : (
              <ListRow
                avatar="+"
                title="동아리 만들기 · 참여하기"
                sub="만들면 운영진, 코드로 찾아 신청하면 받아 준 뒤 부원이 됩니다"
                chevron
                onClick={() => navigate(P.clubPick())}
              />
            )}
          </div>

          {/* 운영진에게만 — 입금·입장·정산 화면으로 들어가는 상설 입구 */}
          {isManager && (
            <>
              <div className="s14__gap-26" />
              <SectionHeader title="운영" />
              <div className="lui-card s14__menu">
                <MenuRow
                  title="공연 관리"
                  value="입금 · 입장 · 정산"
                  onClick={() => navigate(P.console)}
                />
              </div>
            </>
          )}

          <div className="s14__gap-26" />
          <SectionHeader title="예매" />
          <div className="lui-card s14__menu">
            {/* 「예매 내역 12건」 도 적어 둔 값이라, 티켓이 없는 사람에게도
                12건이라고 말했습니다. 목록에서 셉니다 (clubs/owner.ts) */}
            {me.booking.map((row) => (
              <MenuRow
                key={row.title}
                title={row.title}
                value={
                  row.title === '예매 내역'
                    ? `${mine ? myTickets.items.length : 0}건`
                    : mine
                      ? row.value
                      : '0'
                }
                onClick={() => navigate(P.tickets)}
              />
            ))}
          </div>

          <div className="s14__gap-26" />
          <SectionHeader title="설정" />
          <div className="lui-card s14__menu">
            {/* 화면 테마 — 기본은 시스템 설정을 따릅니다 */}
            <div className="s14-theme-row">
              <div className="s14-theme-row__head">
                <span className="s14-theme-row__title">화면 테마</span>
                <span className="s14-theme-row__now">
                  {/* 「시스템 · 지금 라이트」 는 라이트를 고른 것과 같은 말로 읽힙니다.
                      따라가는 것과 고정하는 것이 다르다는 걸 문장으로 말합니다. */}
                  {mode === 'system'
                    ? `휴대폰 설정을 따라갑니다 · 지금은 ${THEME_LABELS[resolved]}`
                    : `항상 ${THEME_LABELS[mode]}`}
                </span>
              </div>
              <div className="lui-themepick" role="group" aria-label="화면 테마">
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`lui-themepick__opt${m === mode ? ' lui-themepick__opt--on' : ''}`}
                    aria-pressed={m === mode}
                    onClick={() => setMode(m)}
                  >
                    {THEME_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
            {/* 권한은 고르는 값이 아니라 소속에서 나옵니다 (auth/membership.ts).
                예전에는 여기서 운영진·부원을 직접 바꿀 수 있었는데, 그러면
                아무나 운영진 화면을 열 수 있습니다. 지금 상태만 보여 줍니다. */}
            <div className="s14-theme-row">
              <div className="s14-theme-row__head">
                <span className="s14-theme-row__title">내 권한</span>
                <span className="s14-theme-row__now">
                  {role === 'manager'
                    ? '운영진 · 공연을 올리고 정산까지 할 수 있어요'
                    : role === 'member'
                      ? '부원 · 우리 공연과 내 순서를 봐요'
                      : '동아리에 속해 있지 않아요'}
                </span>
              </div>
            </div>
            {me.settings.map((row) => (
              <MenuRow
                key={row.title}
                title={row.title}
                value={SETTING_TO[row.title] || !SETTING_SOON[row.title] ? row.value : '준비 중'}
                onClick={() => {
                  const to = SETTING_TO[row.title]
                  if (to) return navigate(to)
                  const text = SETTING_SOON[row.title]
                  if (text) setSoon({ title: row.title, text })
                }}
              />
            ))}
          </div>

          <div className="s14__gap-26" />
          <SectionHeader title="안전" />
          <div className="lui-card s14__menu">
            <MenuRow
              title="차단한 사람"
              value={blockedCount > 0 ? `${blockedCount}명` : '없음'}
              onClick={() => navigate(P.blocked)}
            />
          </div>

          <div className="s14__gap-26" />
          <SectionHeader title="약관과 정책" />
          <div className="lui-card s14__menu">
            <MenuRow title="이용약관" onClick={() => navigate(P.legal('terms'))} />
            <MenuRow title="개인정보 처리방침" onClick={() => navigate(P.legal('privacy'))} />
            <MenuRow title="취소 · 환불 규정" onClick={() => navigate(P.legal('refund'))} />
          </div>

          {/* 계정 삭제는 앱 안에 있어야 합니다 (Apple 5.1.1(v)).
              되돌릴 수 없는 동작이라 다른 설정과 섞지 않고 맨 아래 따로 둡니다. */}
          <div className="s14__gap-26" />
          <SectionHeader title="계정" />
          <div className="lui-card s14__menu">
            <MenuRow
              title="로그아웃"
              onClick={() => {
                signOut()
                navigate(P.start())
              }}
            />
            <button type="button" className="s14-menu-row s14-menu-row--danger" onClick={() => setDelOpen(true)}>
              <span className="s14-menu-row__title">계정 삭제</span>
              <Icon name="chevron-right" size={18} className="s14-menu-row__chev" />
            </button>
          </div>

          <div className="s14__gap-26" />
          <p className="s14__version">{me.version}</p>
        </div>
      </div>
      <Sheet
        open={leaveOpen}
        title={mustHandOver ? membersCopy.handover.title : '동아리에서 나갈까요?'}
        onClose={() => setLeaveOpen(false)}
      >
        {mustHandOver ? (
          <>
            <p className="lui-menu__note">
              {heirs.length === 0 ? membersCopy.handover.none : membersCopy.handover.body}
            </p>
            {heirs.length > 0 && (
              <div className="s14__heirs">
                {heirs.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`s14-heir${heir === m.id ? ' s14-heir--on' : ''}`}
                    onClick={() => setHeir(m.id)}
                    aria-pressed={heir === m.id}
                  >
                    <span className="s14-heir__avatar">{m.initial}</span>
                    <span className="s14-heir__main">
                      <span className="s14-heir__name">{m.name}</span>
                      <span className="s14-heir__sub">{m.sub}</span>
                    </span>
                    <span className="s14-heir__dot" aria-hidden />
                  </button>
                ))}
              </div>
            )}
            <div className="s14__leave">
              <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
                그대로 두기
              </Button>
              {heirs.length > 0 && (
                <Button
                  variant="danger"
                  disabled={heir === null}
                  onClick={() => {
                    if (!heir) return
                    handOverAndLeave(heir)
                    setMembership(null)
                    setLeaveOpen(false)
                  }}
                >
                  {membersCopy.handover.cta}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="lui-menu__note">
              {membership?.clubName} 에서 나갑니다. 운영 화면이 닫히고 관객으로 돌아갑니다. 참여 코드가
              있으면 언제든 다시 들어올 수 있어요.
            </p>
            <div className="s14__leave">
              <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
                그대로 두기
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setMembership(null)
                  setLeaveOpen(false)
                }}
              >
                나가기
              </Button>
            </div>
          </>
        )}
      </Sheet>
      <Sheet open={!!soon} title={soon?.title} onClose={() => setSoon(null)}>
        <p className="lui-menu__note">{soon?.text}</p>
        <Button block onClick={() => setSoon(null)}>
          확인
        </Button>
      </Sheet>

      <DeleteAccount open={delOpen} onClose={() => setDelOpen(false)} />
      <TabBar active="my" />
    </Phone>
  )
}

export default S14Me
