import { Navigate, Route } from 'react-router-dom'
import ManagerOnly from './components/ManagerOnly.tsx'
import AllowedOnly from './components/AllowedOnly.tsx'
import L1Home from './screens/L1Home.tsx'
import D1Show from './screens/D1Show.tsx'
import D2Book from './screens/D2Book.tsx'
import D3Deposit from './screens/D3Deposit.tsx'
import D4Ticket from './screens/D4Ticket.tsx'
import L2Clubs from './screens/L2Clubs.tsx'
import S18Console from './screens/S18Console.tsx'
import S25ClubOps from './screens/S25ClubOps.tsx'
import S29BankAccount from './screens/S29BankAccount.tsx'
import S26Members from './screens/S26Members.tsx'
import S27JoinRequests from './screens/S27JoinRequests.tsx'
import S28ShowStage from './screens/S28ShowStage.tsx'
import S30OpenDays from './screens/S30OpenDays.tsx'
import S19Run from './screens/S19Run.tsx'
import S4Club from './screens/S4Club.tsx'
import S5Recruit from './screens/S5Recruit.tsx'
import S6Proposal from './screens/S6Proposal.tsx'
import S9Chat from './screens/S9Chat.tsx'
import S10ShowNew from './screens/S10ShowNew.tsx'
import S11Deposits from './screens/S11Deposits.tsx'
import S13Settlement from './screens/S13Settlement.tsx'
import L3Venue from './screens/L3Venue.tsx'
import S12Entry from './screens/S12Entry.tsx'
import S0Join from './screens/S0Join.tsx'
import S1Start from './screens/S1Start.tsx'
import S1bOnboarding from './screens/S1bOnboarding.tsx'
import S1cKakaoReturn from './screens/S1cKakaoReturn.tsx'
import S1cClubPick from './screens/S1cClubPick.tsx'
import S1dClubSent from './screens/S1dClubSent.tsx'
import S3Search from './screens/S3Search.tsx'
import S7Tickets from './screens/S7Tickets.tsx'
import S8Notifications from './screens/S8Notifications.tsx'
import S14Me from './screens/S14Me.tsx'
import S20Legal from './screens/S20Legal.tsx'
import S21Email from './screens/S21Email.tsx'
import S22Blocked from './screens/S22Blocked.tsx'
import S15Invite from './screens/S15Invite.tsx'
import S16InviteSms from './screens/S16InviteSms.tsx'
import S17InviteCard from './screens/S17InviteCard.tsx'
import C1Connections from './screens/C1Connections.tsx'
import C2Relation from './screens/C2Relation.tsx'
import C3Stages from './screens/C3Stages.tsx'
import C4Connected from './screens/C4Connected.tsx'
import P1ShowLive from './screens/P1ShowLive.tsx'
import P2Preorder from './screens/P2Preorder.tsx'
import P3Entered from './screens/P3Entered.tsx'
import P4People from './screens/P4People.tsx'
import P5Tap from './screens/P5Tap.tsx'
import P6Guestbook from './screens/P6Guestbook.tsx'

/**
 * 라이트 UI 라우트 — 기존 2025 공연 앱과 섞이지 않게 전부 /ui 아래에 둡니다.
 * 화면 간 이동은 Figma 프로토타입 연결을 그대로 옮긴 것입니다 (paths.ts 참고).
 */
export const lightUiRoutes = [
  // 약관 · 개인정보 · 환불, 이메일 로그인, 차단 목록 — 스토어 심사에 필요한 것들
  <Route key="ui-legal" path="/ui/legal/:doc" element={<S20Legal />} />,
  <Route key="ui-legal-i" path="/ui/legal" element={<S20Legal />} />,
  <Route key="ui-email" path="/ui/start/email" element={<S21Email />} />,
  // 동아리로 들어온 사람은 온보딩 뒤 여기서 우리 동아리를 찾습니다
  <Route key="ui-clubpick" path="/ui/start/club" element={<S1cClubPick />} />,
  <Route key="ui-clubsent" path="/ui/start/club/sent" element={<S1dClubSent />} />,
  <Route key="ui-blocked" path="/ui/blocked" element={<S22Blocked />} />,
  <Route key="ui-home" path="/ui" element={<L1Home />} />,
  <Route key="ui-show" path="/ui/show/:showId" element={<D1Show />} />,
  <Route key="ui-book" path="/ui/show/:showId/book" element={<D2Book />} />,
  <Route key="ui-deposit" path="/ui/show/:showId/deposit" element={<D3Deposit />} />,
  <Route key="ui-ticket" path="/ui/ticket/:showId" element={<D4Ticket />} />,
  <Route key="ui-map" path="/ui/map" element={<Navigate to="/ui?view=map" replace />} />,
  <Route key="ui-calendar" path="/ui/calendar" element={<Navigate to="/ui?view=calendar" replace />} />,
  <Route key="ui-clubs" path="/ui/clubs" element={<L2Clubs />} />,
  // 다른 운영 화면은 다 감싸 두고 여기만 열려 있었습니다. 그래서 부원이
  // 주소로 들어오면 화면은 열리는데 뒤로가기(P.console)가 게이트로 갔습니다 —
  // 들어온 적 없는 곳에서 「운영진만 할 수 있어요」 를 만납니다.
  <Route key="ui-bank" path="/ui/console/account" element={
      <ManagerOnly title="입금 계좌" what="계좌 등록">
        <S29BankAccount />
      </ManagerOnly>
    } />,
  <Route key="ui-clubops" path="/ui/console/teams" element={
      <ManagerOnly title="함께 설 팀" what="제안 주고받기">
        <S25ClubOps />
      </ManagerOnly>
    } />,
  <Route key="ui-show-stage" path="/ui/show/:showId/stage" element={
      <ManagerOnly title="공연 상태" what="공연 상태 바꾸기">
        <S28ShowStage />
      </ManagerOnly>
    } />,
  <Route key="ui-opendays" path="/ui/console/venues" element={
      <ManagerOnly title="설 자리 찾기" what="공연장에 지원하기">
        <S30OpenDays />
      </ManagerOnly>
    } />,
  <Route key="ui-joins" path="/ui/console/joins" element={
      <ManagerOnly title="들어온 신청" what="참여 신청 받기">
        <S27JoinRequests />
      </ManagerOnly>
    } />,
  <Route key="ui-members" path="/ui/console/members" element={
      <ManagerOnly title="부원" what="부원 권한 바꾸기">
        <S26Members />
      </ManagerOnly>
    } />,
  <Route key="ui-console" path="/ui/console" element={
      <ManagerOnly title="공연 관리" what="공연 관리">
        <S18Console />
      </ManagerOnly>
    } />,
  <Route key="ui-club" path="/ui/club/:clubId" element={<S4Club />} />,
  <Route key="ui-recruit-new" path="/ui/recruit/new" element={
      <ManagerOnly title="모집 글 쓰기" what="모집 글 쓰기">
        <S5Recruit />
      </ManagerOnly>
    } />,
  <Route key="ui-proposal" path="/ui/proposal/:proposalId" element={<S6Proposal />} />,
  <Route key="ui-chat" path="/ui/chat/:chatId" element={<S9Chat />} />,
  <Route key="ui-show-new" path="/ui/show/new" element={
      <ManagerOnly title="공연 만들기" what="공연 만들기">
        <S10ShowNew />
      </ManagerOnly>
    } />,
  <Route key="ui-run" path="/ui/show/:showId/run" element={
      <ManagerOnly title="공연 당일" what="공연 당일 운영">
        <S19Run />
      </ManagerOnly>
    } />,
  <Route key="ui-deposits" path="/ui/deposits" element={
      <ManagerOnly title="입금 관리" what="입금 관리">
        <S11Deposits />
      </ManagerOnly>
    } />,
  <Route key="ui-settlement" path="/ui/settlement" element={
      <ManagerOnly title="정산" what="정산 보기">
        <S13Settlement />
      </ManagerOnly>
    } />,
  <Route
    key="ui-venue"
    path="/ui/venue"
    element={
      // 게이트가 없어서 관객이 알림 한 줄로 남의 공연장 운영 화면을 열었습니다 —
      // 거절하기·공개 내리기·조건 수정이 다 있는 화면입니다
      <AllowedOnly need="venue" title="공연장" what="공연장 운영">
        <L3Venue />
      </AllowedOnly>
    }
  />,
  <Route key="ui-entry" path="/ui/entry" element={
      <ManagerOnly title="입장 관리" what="입장 관리">
        <S12Entry />
      </ManagerOnly>
    } />,
  <Route key="ui-join" path="/ui/join" element={<S0Join />} />,
  <Route key="ui-start" path="/ui/start" element={<S1Start />} />,
  <Route key="ui-onboarding" path="/ui/start/profile" element={<S1bOnboarding />} />,
  <Route key="ui-kakao-return" path="/ui/auth/kakao" element={<S1cKakaoReturn />} />,
  <Route key="ui-search" path="/ui/search" element={<S3Search />} />,
  <Route key="ui-tickets" path="/ui/tickets" element={<S7Tickets />} />,
  <Route key="ui-notis" path="/ui/notifications" element={<S8Notifications />} />,
  <Route key="ui-me" path="/ui/me" element={<S14Me />} />,
  <Route key="ui-invite" path="/ui/invite" element={<S15Invite />} />,
  <Route key="ui-invite-sms" path="/ui/invite/sms" element={<S16InviteSms />} />,
  <Route key="ui-invite-card" path="/ui/i/:code" element={<S17InviteCard />} />,
  <Route key="ui-connections" path="/ui/connections" element={<C1Connections />} />,
  <Route key="ui-stages" path="/ui/connections/stages" element={<C3Stages />} />,
  <Route key="ui-connected" path="/ui/connections/new" element={<C4Connected />} />,

  // 공연 당일 (티켓 구매 이후)
  <Route key="ui-live" path="/ui/live/:showId" element={<P1ShowLive />} />,
  <Route key="ui-live-store" path="/ui/live/:showId/store" element={<P2Preorder />} />,
  <Route key="ui-live-entered" path="/ui/live/:showId/entered" element={<P3Entered />} />,
  <Route key="ui-live-people" path="/ui/live/:showId/people" element={<P4People />} />,
  <Route key="ui-live-tap" path="/ui/live/:showId/tap" element={<P5Tap />} />,
  <Route key="ui-live-guestbook" path="/ui/live/:showId/guestbook" element={<P6Guestbook />} />,
  <Route key="ui-connection" path="/ui/connections/:relationId" element={<C2Relation />} />,
]
