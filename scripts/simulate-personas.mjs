#!/usr/bin/env node
/**
 * 페르소나 5000명 여정 시뮬레이터.
 *
 * 무엇을 하는 스크립트인가
 * ------------------------
 * `/ui` 라이트 UI 의 **이동 규칙과 가드**를 모델로 옮겨 놓고, 서로 다른 페르소나
 * 5000명을 로그인부터 마이까지 차례로 걸어 보게 합니다. 각 단계에서 「다음으로
 * 갈 수 있는가」 를 판정하고, 막히면 왜 막혔는지를 유형으로 셉니다.
 *
 * 왜 이렇게 만들었나
 * ------------------
 * 1. 앱 코드를 한 줄도 고치지 않습니다. 이 저장소에는 여러 세션이 동시에
 *    작업하고 있어서, `src/` 를 건드리면 남의 미커밋 작업이 깨집니다.
 *    그래서 앱을 띄워 조작하는 대신 **규칙을 복사한 모델**을 돌립니다.
 * 2. 모델을 돌리는 것이라 모델이 틀리면 결과도 틀립니다. 그래서 규칙을
 *    상상하지 않고 전부 코드에서 읽어 왔고, 읽어 온 값이 아직 그대로인지를
 *    `checkSource()` 가 실제 파일을 열어 확인합니다. 어긋나면 결과 맨 위에
 *    경고로 찍히고 종료 코드가 1 이 됩니다 — 조용히 틀린 보고서를 내는 것보다
 *    낫습니다.
 *
 * 쓰는 법
 *   node scripts/simulate-personas.mjs                 # 사람이 읽는 요약
 *   node scripts/simulate-personas.mjs --json out.json  # 집계를 JSON 으로
 *   node scripts/simulate-personas.mjs --n 20000        # 표본 수 바꾸기
 *   node scripts/simulate-personas.mjs --seed 7         # 다른 난수열
 *
 * 모델이 못 보는 것 (보고서에도 적습니다)
 *   실제 렌더링·CSS·접근성, 네트워크 실패, 실제 기기(NFC·iOS 푸시), 서버 응답,
 *   동시성, 그리고 여기 옮기지 않은 화면 내부의 세부 상태.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

/* ────────────────────────────────────────────────────────────────
 * 0. 모델이 전제하는 사실들 — 전부 코드에서 읽어 온 것
 * ──────────────────────────────────────────────────────────────── */

/** `src/new/mocks/auth.ts` knownClubs — 밴디에 이미 등록된 동아리 */
const KNOWN_CLUBS = [
  { id: 'melodic', name: '멜로딕', school: '광운대학교' },
  { id: 'bluenote', name: '블루노트', school: '광운대학교' },
  { id: 'lexa', name: '렉사', school: '한양대학교' },
  { id: 'harmonic', name: '하모닉', school: '삼육대학교' },
  { id: 'acappella', name: '아카펠라', school: '서울여자대학교' },
  { id: 'soriul', name: '소리울', school: '서울여자대학교' },
  { id: 'sonareum', name: '손아름', school: '인덕대학교' },
  { id: 'nowon-union', name: '노원 연합밴드', school: null },
  { id: 'after6', name: '애프터식스', school: null },
]

/** 등록 동아리가 있는 학교 (위 목록에서 뽑은 것) */
const SCHOOLS_WITH_CLUBS = [...new Set(KNOWN_CLUBS.map((c) => c.school).filter(Boolean))]

/** 등록 동아리가 없는 학교 — `onboardingOptions.schools` 171개 중 일부 */
const SCHOOLS_WITHOUT_CLUBS = [
  '서울과학기술대학교', '한국항공대학교', '성신여자대학교', '동덕여자대학교',
  '명지대학교', '부산대학교', '전남대학교', '충북대학교', '강원대학교',
]

/** `ticketsByShow` 에 실제로 들어 있는 공연 id (`bandyLight.ts:214`) */
const TICKET_IDS = ['glow', 'lexa-melodic', 'sonapeum']

/** 오늘 열리는 공연 — `myTickets.items` 에서 `today: true` 인 것 (`bandyLight.ts:1057`) */
const TODAY_SHOW = 'glow'

/** 입금 대기 상태로 들어 있는 티켓 (`ticketsByShow['lexa-melodic'].status`) */
const UNPAID_TICKET = 'lexa-melodic'

/** `routes.tsx` 에서 ManagerOnly 로 감싼 경로 */
const MANAGER_ONLY_ROUTES = [
  '/ui/console',
  '/ui/recruit/new',
  '/ui/show/new',
  '/ui/show/:showId/run',
  '/ui/deposits',
  '/ui/settlement',
  '/ui/entry',
]

/** `S1bOnboarding.tsx:146` WHO — 신분과 학교를 묻는지 */
const WHO = [
  { key: 'student', needsSchool: true },
  { key: 'alumni', needsSchool: true },
  { key: 'worker', needsSchool: false },
  { key: 'other', needsSchool: false },
]

/* ────────────────────────────────────────────────────────────────
 * 1. 모델이 읽어 온 규칙이 아직 코드에 그대로인지 확인
 *
 * 하나라도 어긋나면 그 규칙에서 나온 집계는 믿을 수 없습니다.
 * ──────────────────────────────────────────────────────────────── */

function checkSource() {
  const warn = []
  const ok = []
  const check = (name, cond, note) => {
    ;(cond ? ok : warn).push(`${name}${note ? ` — ${note}` : ''}`)
  }

  const membership = read('src/new/lightui/auth/membership.ts')
  const onboarding = read('src/new/lightui/screens/S1bOnboarding.tsx')
  const clubPick = read('src/new/lightui/screens/S1cClubPick.tsx')
  const routes = read('src/new/lightui/routes.tsx')
  const kakao = read('src/new/lightui/auth/kakao.ts')
  const email = read('src/new/lightui/auth/email.ts')
  const me = read('src/new/lightui/screens/S14Me.tsx')
  const clubs = read('src/new/lightui/screens/L2Clubs.tsx')
  const venue = read('src/new/lightui/screens/L3Venue.tsx')
  const notis = read('src/new/lightui/screens/S8Notifications.tsx')
  const deposit = read('src/new/lightui/screens/D3Deposit.tsx')
  const invite = read('src/new/lightui/screens/S17InviteCard.tsx')
  const mocks = read('src/new/mocks/bandyLight.ts')
  const authMocks = read('src/new/mocks/auth.ts')

  // 소속을 주는 코드가 있는지 — 앱 전체에서 setMembership 을 null 로만 부릅니다
  const setCalls = [
    ...membership.matchAll(/setMembership\(/g),
    ...me.matchAll(/setMembership\(([^)]*)\)/g),
  ]
  const grants = [...me.matchAll(/setMembership\(([^)]*)\)/g)].filter(
    (m) => m[1].trim() !== 'null' && m[1].trim() !== '',
  )
  check('MEMBERSHIP_NEVER_GRANTED', grants.length === 0 && setCalls.length > 0,
    `setMembership 호출 ${setCalls.length}개, 소속을 주는 호출 ${grants.length}개`)

  // 온보딩 → 동아리 찾기로 학교를 넘기지 않음
  check('CLUBPICK_SCHOOL_LOST',
    /club:\s*\{[^}]*to:\s*P\.clubPick\(\)/s.test(onboarding) &&
      /navigate\(form\.to \?\? P\.clubPick\(school\)\)/.test(onboarding),
    'SIDE_FORM.club.to = P.clubPick() (인자 없음)')

  // 동아리 찾기는 주소의 ?school= 만 봅니다 (세션을 읽지 않음)
  check('CLUBPICK_READS_ONLY_PARAM',
    /params\.get\('school'\)/.test(clubPick) && !/getSession/.test(clubPick))

  // 온보딩 완료 판정이 학교·학과 둘 다를 요구
  check('NEEDS_ONBOARDING_REQUIRES_SCHOOL',
    /needsOnboarding\(user: BandyUser\)\s*\{\s*return !user\.school \|\| !user\.department/s.test(kakao))

  // 공연장은 학교를 아예 받지 않음
  check('VENUE_FORM_NO_SCHOOL', /venue:\s*\{[^}]*school:\s*false/s.test(onboarding))

  // 이메일 로그인은 저장된 세션을 합치지 않고 새로 만듭니다
  check('EMAIL_RESETS_SESSION',
    /return \{ \.\.\.mockKakaoUser, id: `email:\$\{addr\}`/.test(email) &&
      !/getSession\(\)/.test(email))

  // ManagerOnly 로 감싼 경로 수
  const gated = [...routes.matchAll(/<ManagerOnly/g)].length
  check('MANAGER_ONLY_COUNT', gated === MANAGER_ONLY_ROUTES.length,
    `routes.tsx 의 ManagerOnly ${gated}개 (모델은 ${MANAGER_ONLY_ROUTES.length}개)`)

  // /ui/venue 와 /ui/console/teams 는 감싸지 않음
  check('VENUE_UNGATED', /path="\/ui\/venue" element=\{<L3Venue \/>\}/.test(routes))
  check('CLUBOPS_UNGATED', /path="\/ui\/console\/teams" element=\{<S25ClubOps \/>\}/.test(routes))

  // 부원도 보이는 「다음 공연」 이 운영진 전용 /run 으로 갑니다
  check('MEMBER_SEES_RUN_LINK', /navigate\(P\.run\(showRun\.showId\)\)/.test(clubs))

  // 공연장 화면의 수락·정산이 운영진 전용으로 갑니다
  check('VENUE_ACCEPT_TO_DEPOSITS', /navigate\(P\.deposits\)/.test(venue))
  check('VENUE_TAB_TO_SETTLEMENT', /navigate\(P\.settlement\)/.test(venue))

  // 알림 한 줄이 공연장 운영 화면으로 보냅니다
  check('NOTI_TO_VENUE', /venue:\s*P\.venue/.test(notis))

  // 입금 화면의 예매 취소 버튼에 onClick 이 없습니다
  check('DEPOSIT_CANCEL_DEAD', /<Button variant="ghost">예매 취소<\/Button>/.test(deposit))

  // 초대장은 :code 를 보지 않고 glow 로 보냅니다
  check('INVITE_CODE_IGNORED',
    /navigate\(P\.book\('glow'\)\)/.test(invite) && !/useParams/.test(invite))

  // 마이의 프로필은 세션이 아니라 목 데이터입니다
  check('ME_PROFILE_IS_MOCK',
    /avatar=\{me\.initial\}/.test(me) && !/getSession/.test(me))

  // 마이 설정 줄 중 알림 설정만 반응합니다
  check('ME_SETTINGS_ROWS_DEAD',
    /row\.title === '알림 설정' \? navigate\(P\.notifications\) : undefined/.test(me) &&
      /공연장으로 등록하기/.test(mocks))

  // 모르는 공연 id 면 멜로딕 티켓을 돌려줍니다
  check('TICKET_FALLBACK', /ticketsByShow\[id\] \?\? myTicket/.test(mocks))

  // 학교 없이 찾으면 모든 동아리가 나옵니다
  check('FIND_CLUBS_NO_SCHOOL_RETURNS_ALL', /if \(!s\) return true/.test(authMocks))

  return { ok, warn }
}

/* ────────────────────────────────────────────────────────────────
 * 2. 페르소나 뽑기
 * ──────────────────────────────────────────────────────────────── */

/** 재현 가능한 난수 (mulberry32) — 같은 seed 면 같은 5000명입니다 */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)]
const chance = (r, p) => r() < p
/** [[값, 가중치], …] 에서 하나 */
function weighted(r, pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0)
  let x = r() * total
  for (const [v, w] of pairs) {
    x -= w
    if (x <= 0) return v
  }
  return pairs[pairs.length - 1][0]
}

/**
 * 차원.
 *
 * 전부 코드에 실제로 있는 분기입니다 — 상상한 차원은 넣지 않았습니다.
 * 가중치는 **가정**이고 보고서에 적습니다. 가중치가 희귀 경로를 가리지 않도록,
 * 집계는 전체 % 와 **그 집단 안에서의 %** 를 같이 냅니다.
 */
const DIMENSIONS = {
  // 가입 입구 3개 + 「그냥 둘러볼게요」 (S0Join.tsx:70, S1Start.tsx:79)
  side: ['club', 'audience', 'venue', 'browse'],
  // S1bOnboarding WHO 4개
  who: WHO.map((w) => w.key),
  // S1Start 의 두 버튼 + 로그인 없이 둘러보기
  login: ['kakao', 'email', 'none'],
  // 학교를 고르는가 / 그 학교에 등록 동아리가 있는가
  school: ['with-clubs', 'without-clubs', 'none'],
  // 동아리 찾기에서 어디로 갈라지는가 (S1cClubPick)
  clubPath: ['join-existing', 'create-new', 'later'],
  // 티켓 — 없음 / 오늘 공연 / 입금 대기 / 지난 공연 / 목록에 없는 공연
  ticket: ['none', 'today', 'unpaid', 'other', 'unknown-id'],
  // 초대 링크(/ui/i/:code)로 바로 들어왔는가
  deepLink: [false, true],
  // 앱을 다시 열어 보는가 (localStorage 는 남고 모듈 상태는 새로 읽힙니다)
  returns: [false, true],
  // 사생활 보호 모드 등으로 localStorage 가 막혔는가 (membership.ts:46 catch)
  storage: ['ok', 'blocked'],
  // 환경 변수 — 없으면 목으로 돌거나 자리가 사라집니다
  envKakaoJsKey: [false, true],
  envKakaoServer: [false, true],
  envPay: [false, true],
  envPush: [false, true],
}

function combinationCount() {
  return Object.values(DIMENSIONS).reduce((n, v) => n * v.length, 1)
}

function makePersona(r, i) {
  // 입구 — 공연 하나에 밴드 몇 팀 대 관객 수십 명이라 관객이 다수라고 봅니다
  const side = weighted(r, [['audience', 55], ['club', 30], ['browse', 10], ['venue', 5]])

  // 공연장으로 들어온 사람에게는 신분을 묻지 않습니다 (S1bOnboarding.tsx:249)
  const who = side === 'venue' ? 'other' : weighted(r, [['student', 60], ['alumni', 15], ['worker', 20], ['other', 5]])
  const needsSchool = side !== 'venue' && (WHO.find((w) => w.key === who)?.needsSchool ?? false)

  const login = side === 'browse'
    ? weighted(r, [['none', 70], ['kakao', 20], ['email', 10]])
    : weighted(r, [['kakao', 65], ['email', 35]])

  // 학교 — 안 묻는 사람은 'none'. 묻는 사람 중 등록 동아리가 있는 학교는 소수입니다
  // (knownClubs 는 5개 학교뿐이고 목록의 학교는 171개입니다)
  const school = !needsSchool
    ? 'none'
    : weighted(r, [['with-clubs', 35], ['without-clubs', 65]])

  // 동아리 찾기 — 학교에 등록 동아리가 있으면 찾아 들어갈 확률이 높습니다
  const clubPath = side !== 'club'
    ? null
    : school === 'with-clubs'
      ? weighted(r, [['join-existing', 70], ['create-new', 20], ['later', 10]])
      : weighted(r, [['create-new', 55], ['join-existing', 15], ['later', 30]])

  const ticket = side === 'venue'
    ? 'none'
    : weighted(r, [['none', 45], ['today', 20], ['unpaid', 15], ['other', 15], ['unknown-id', 5]])

  return {
    i,
    side,
    who,
    needsSchool,
    login,
    school,
    schoolName:
      school === 'with-clubs' ? pick(r, SCHOOLS_WITH_CLUBS)
      : school === 'without-clubs' ? pick(r, SCHOOLS_WITHOUT_CLUBS)
      : '',
    clubPath,
    ticket,
    deepLink: chance(r, 0.18),
    returns: chance(r, 0.7),
    storage: chance(r, 0.05) ? 'blocked' : 'ok',
    envKakaoJsKey: chance(r, 0.5),
    envKakaoServer: chance(r, 0.5),
    envPay: chance(r, 0.5),
    envPush: chance(r, 0.5),
  }
}

/* ────────────────────────────────────────────────────────────────
 * 3. 문제 유형
 *
 * 취향 문제는 넣지 않았습니다 — 막히거나, 들어왔는데 못 쓰거나, 화면이 전제한
 * 값이 없거나, 설정이 없어 흐름이 끊기는 것만 셉니다.
 * ──────────────────────────────────────────────────────────────── */

const KINDS = {
  deadend: '막다른 길',
  blocked: '권한 막힘',
  empty: '빈 상태 미처리',
  premise: '전제 깨짐',
  noway: '되돌아갈 길 없음',
  config: '설정 없으면 멈춤',
}

/** 심각도 — 돈·가입이 막히는 것이 위 */
const SEV = { blocker: 3, major: 2, minor: 1 }

const ISSUES = {
  'membership-never-granted': {
    kind: 'deadend', sev: 'blocker',
    title: '가입을 마치면 동아리 권한을 얻을 길이 없다',
    where: 'auth/membership.ts · S1cClubPick → S1dClubSent · S14Me',
  },
  'pending-no-return': {
    kind: 'deadend', sev: 'blocker',
    title: '신청 상태(와 확인 코드)를 다시 볼 화면으로 가는 길이 없다',
    where: 'S1dClubSent · paths.ts clubJoinSent',
  },
  'club-ops-blocked': {
    kind: 'blocked', sev: 'blocker',
    title: '동아리로 가입했는데 공연 올리기·입금·정산이 전부 막힌다',
    where: 'routes.tsx ManagerOnly · S14Me',
  },
  'gate-lies': {
    kind: 'deadend', sev: 'major',
    title: '게이트가 「마이에서 권한 바꾸기」로 보내지만 마이에 바꿀 자리가 없다',
    where: 'ManagerOnly.tsx:45 → S14Me.tsx:170',
  },
  'venue-ops-blocked': {
    kind: 'blocked', sev: 'blocker',
    title: '공연장이 지원 팀 수락과 정산을 못 한다 (운영진 게이트에 걸림)',
    where: 'L3Venue.tsx:187,257 → ManagerOnly',
  },
  'venue-open-to-all': {
    kind: 'blocked', sev: 'major',
    title: '관객이 알림 한 줄로 공연장 운영 화면(거절·공개 내리기)에 들어간다',
    where: 'S8Notifications.tsx:18 → /ui/venue (게이트 없음)',
  },
  'onboarding-loop': {
    kind: 'deadend', sev: 'blocker',
    title: '다시 들어올 때마다 온보딩을 처음부터 다시 받는다',
    where: 'kakao.ts needsOnboarding · S1bOnboarding · email.ts',
  },
  'email-session-reset': {
    kind: 'premise', sev: 'major',
    title: '이메일로 다시 로그인하면 적어 둔 학교·학과가 지워진다',
    where: 'auth/email.ts:140',
  },
  'clubpick-school-lost': {
    kind: 'premise', sev: 'major',
    title: '동아리 찾기에 학교가 넘어가지 않아 다른 학교 동아리가 「이 학교의 동아리」로 나온다',
    where: 'S1bOnboarding.tsx:225 → S1cClubPick.tsx:28',
  },
  'clubpick-no-school-premise': {
    kind: 'premise', sev: 'major',
    title: '학교를 묻지 않은 사람(직장인·졸업 후·연합)에게 학교로 좁히는 화면을 준다',
    where: 'S1cClubPick.tsx:58 · mocks/auth.ts findClubs',
  },
  'clubpick-empty-never': {
    kind: 'empty', sev: 'minor',
    title: '「이 학교에 등록된 동아리가 없습니다」 빈 상태가 실제로는 나오지 않는다',
    where: 'S1cClubPick.tsx:131',
  },
  'demo-membership-leak': {
    kind: 'premise', sev: 'major',
    title: '가입 직후 같은 화면에서는 관객·공연장도 멜로딕 운영진으로 보인다',
    where: 'auth/membership.ts:57 (모듈 로드 때 한 번만 읽음)',
  },
  'storage-blocked-manager': {
    kind: 'premise', sev: 'major',
    title: '사생활 보호 모드에서는 누구나 멜로딕 운영진이 되고 가입이 저장되지 않는다',
    where: 'auth/membership.ts:46 catch · kakao.ts saveSession',
  },
  'member-run-blocked': {
    kind: 'blocked', sev: 'major',
    title: '부원이 「다음 공연」을 누르면 운영진 전용 화면에 막힌다',
    where: 'L2Clubs.tsx:85 → /ui/show/:id/run (ManagerOnly)',
    latent: '지금은 부원이 될 길이 없어서 아무도 겪지 않습니다. membership-never-granted 를 고치는 순간 드러납니다.',
  },
  'ops-shows-other-club': {
    kind: 'premise', sev: 'major',
    title: '운영 화면이 내 동아리가 아니라 멜로딕의 공연·입금·정산을 보여 준다',
    where: 'S18Console · S11Deposits · S13Settlement (mocks 고정) + 데모 소속',
  },
  'me-profile-mock': {
    kind: 'premise', sev: 'major',
    title: '마이 프로필이 세션이 아니라 목 데이터(이지우 · 광운대 · jiwoo@kw.ac.kr)다',
    where: 'S14Me.tsx:66 · mocks/bandyLight.ts me',
  },
  'me-dead-rows': {
    kind: 'deadend', sev: 'major',
    title: '마이의 계좌·환불 정보 / 공연장으로 등록하기 / 문의하기가 눌리지 않는다',
    where: 'S14Me.tsx:187',
  },
  'venue-no-entry-later': {
    kind: 'deadend', sev: 'major',
    title: '가입 때 공연장을 고르지 않으면 공연장 화면으로 가는 길이 없다',
    where: 'paths.ts venue · S14Me 공연장으로 등록하기(무반응)',
  },
  'deposit-cancel-dead': {
    kind: 'deadend', sev: 'major',
    title: '입금 안내의 「예매 취소」가 눌리지 않는다 (입금 전 취소 경로가 없음)',
    where: 'D3Deposit.tsx:152',
  },
  'deposit-instant-confirmed': {
    kind: 'premise', sev: 'major',
    title: '「입금했어요」를 누르면 운영진 확인 전인데 「입금 확인됨」 티켓이 바로 나온다',
    where: 'D3Deposit.tsx:154 → D4Ticket · mocks ticketsByShow.glow.status',
  },
  'ticket-fallback-wrong': {
    kind: 'premise', sev: 'major',
    title: '모르는 공연의 티켓을 「입금 확인됨 · 2매 · 34,000원」으로 보여 준다',
    where: 'mocks/bandyLight.ts:257 ticketFor',
  },
  'live-data-fixed': {
    kind: 'premise', sev: 'minor',
    title: '어느 공연의 당일 화면이든 멜로딕 11.22 공연 내용이 나온다',
    where: 'P1ShowLive.tsx:11 showLive 고정',
  },
  'unpaid-ticket-live': {
    kind: 'premise', sev: 'major',
    title: '입금 대기 티켓에서도 「예매 완료」 배지와 입장 코드가 열린다',
    where: 'S7Tickets.tsx:92 → P1ShowLive (상태를 보지 않음)',
  },
  'invite-code-ignored': {
    kind: 'premise', sev: 'major',
    title: '초대 링크의 코드를 무시하고 언제나 멜로딕 공연을 예매하게 한다',
    where: 'S17InviteCard.tsx:56',
  },
  'invite-no-exit': {
    kind: 'noway', sev: 'minor',
    title: '초대 링크로 들어온 첫 화면에 뒤로가기도 탭바도 없다',
    where: 'S17InviteCard.tsx (TopBar·TabBar 없음)',
  },
  'guest-no-login-gate': {
    kind: 'premise', sev: 'major',
    title: '로그인 없이 예매·티켓·마이가 다 열리고, 티켓이 계정에 붙지 않는다',
    where: 'routes.tsx (로그인 가드 없음) · D2Book',
  },
  'kakao-server-missing': {
    kind: 'config', sev: 'blocker',
    title: '카카오 JS 키만 있고 서버 키가 없으면 로그인이 거기서 끝난다',
    where: 'auth/kakao.ts completeKakaoSignIn · S1cKakaoReturn',
  },
  'kakao-mock-anyone': {
    kind: 'config', sev: 'minor',
    title: '카카오 키가 없으면 누르면 누구나 같은 목 계정으로 들어온다',
    where: 'auth/kakao.ts:137',
  },
  'email-code-on-screen': {
    kind: 'config', sev: 'major',
    title: '메일 서버가 없으면 인증 코드를 화면에 띄워 누구나 통과한다',
    where: 'auth/email.ts fallbackSend · S21Email',
  },
  'pay-card-hidden': {
    kind: 'config', sev: 'minor',
    title: '포트원 키가 없으면 카드 결제 자리가 사라지고 계좌이체만 남는다',
    where: 'pay/portone.ts PAY_CONFIGURED · D3Deposit',
  },
  'push-unconfigured': {
    kind: 'config', sev: 'major',
    title: 'VAPID 키가 없으면 알림이 「준비 중」으로 꺼져 입금·당일 공지가 안 간다',
    where: 'push/push.ts · PushRow',
  },
  'nfc-tap-no-end': {
    kind: 'deadend', sev: 'major',
    title: '맞대기 화면이 끝나지 않는다 — 연결됨(C4)으로 가는 길이 없다',
    where: 'P5Tap.tsx · C4Connected (들어오는 경로 없음)',
  },
  'clubops-ungated-back': {
    kind: 'blocked', sev: 'minor',
    title: '함께 설 팀 화면은 열리는데 뒤로가기가 운영진 게이트로 보낸다',
    where: 'routes.tsx /ui/console/teams · S25ClubOps.tsx:68',
    latent: '화면 안에 들어가는 링크가 운영진에게만 보여서, 주소를 직접 치거나 링크를 받은 경우에만 겪습니다.',
  },
  's12-search-dead': {
    kind: 'deadend', sev: 'minor',
    title: '입장 관리의 「이름으로 찾기」가 눌리지 않는다',
    where: 'S12Entry.tsx:81',
  },
  's5-draft-dead': {
    kind: 'deadend', sev: 'minor',
    title: '모집 글의 「임시 저장」이 눌리지 않는다',
    where: 'S5Recruit.tsx:95',
  },
}

/* ────────────────────────────────────────────────────────────────
 * 4. 여정
 *
 * 각 단계는 「이 페르소나가 다음으로 갈 수 있는가」 를 판정하고, 막히면
 * 유형을 답니다. 단계는 과제에 적힌 순서를 따릅니다 —
 *   로그인 → 온보딩 → (동아리면) 동아리 찾기 → 홈 → 예매 → 티켓 → 당일 → 마이
 * ──────────────────────────────────────────────────────────────── */

function walk(p) {
  const hits = new Set()
  const hit = (id) => hits.add(id)
  /** 이 페르소나가 밟은 화면 — 막힌 자리를 보고서에 적기 위해 */
  const trail = []
  const go = (screen) => trail.push(screen)

  /* ── 0. 들어오는 자리 ───────────────────────────────── */
  if (p.deepLink) {
    // 문자·링크로 받은 초대장으로 바로 들어옵니다 (/ui/i/:code)
    go('S17 초대장')
    hit('invite-code-ignored')
    hit('invite-no-exit')
  } else {
    go(p.side === 'browse' ? 'S0 가입 시작 → 그냥 둘러보기' : 'S0 가입 시작')
  }

  /* ── 1. 로그인 ──────────────────────────────────────── */
  let session = null // { school, department, provider }
  if (p.login === 'kakao') {
    go('S1 시작 · 카카오')
    if (p.envKakaoJsKey && !p.envKakaoServer) {
      // 서버가 kakao_not_configured 를 돌려줍니다 — 화면은 까닭을 말하고 멈춥니다
      hit('kakao-server-missing')
      return { hits, trail, finished: false, stoppedAt: 'S1c 카카오 돌아오는 자리' }
    }
    if (!p.envKakaoJsKey) hit('kakao-mock-anyone')
    session = { school: '', department: '', provider: 'kakao' }
  } else if (p.login === 'email') {
    go('S21 이메일')
    // 메일 서버가 없으면 코드를 화면에 띄웁니다 (auth/email.ts fallbackSend)
    hit('email-code-on-screen')
    session = { school: '', department: '', provider: 'email' }
  } else {
    go('로그인 없이 둘러보기')
    hit('guest-no-login-gate')
  }

  // 저장이 막힌 기기에서는 세션이 남지 않습니다
  if (session && p.storage === 'blocked') {
    hit('storage-blocked-manager')
    session = null
  }

  /* ── 2. 온보딩 ──────────────────────────────────────── */
  if (session) {
    go('S1b 온보딩')
    if (p.needsSchool) {
      session.school = p.schoolName
      session.department = '학과'
    }
    // 학교를 묻지 않은 사람은 school/department 가 빈 채로 저장됩니다.
    // needsOnboarding() 이 둘 다를 요구하므로 다음 로그인마다 여기로 돌아옵니다.
    if (!p.needsSchool) hit('onboarding-loop')
  }

  /* ── 3. 동아리 찾기 (동아리로 들어온 사람) ──────────── */
  let clubJoin = null // { kind } — 신청만 남고 소속은 생기지 않습니다
  if (p.side === 'club' && session) {
    go('S1c 우리 동아리 찾기')
    // SIDE_FORM.club.to = P.clubPick() 이라 학교가 주소에 실리지 않습니다
    hit('clubpick-school-lost')
    if (!p.needsSchool) hit('clubpick-no-school-premise')
    // 학교가 비면 findClubs 가 전부 돌려주므로 빈 상태는 나오지 않습니다
    hit('clubpick-empty-never')

    if (p.clubPath === 'join-existing' || p.clubPath === 'create-new') {
      go('S1d 신청 보냄 · 확인 중')
      clubJoin = { kind: p.clubPath === 'create-new' ? 'create' : 'join' }
      // 이 화면으로 돌아오는 길이 어디에도 없습니다 (P.clubJoinSent 를 쓰는 곳은 S1c 뿐)
      hit('pending-no-return')
      // 신청은 기기에만 남고 소속은 주지 않습니다 (clubJoin.ts TODO)
      hit('membership-never-granted')
    }
  }

  /* ── 4. 소속과 권한 ─────────────────────────────────── */
  //
  // membership.read() 는 이렇게 읽습니다 (membership.ts:44)
  //   저장된 소속이 있으면 그것 → **앱에 소속을 저장하는 코드가 없습니다**
  //   없고 세션이 있으면 null (관객)
  //   둘 다 없으면 데모 「멜로딕 운영진」
  //   읽다가 예외가 나면(저장 막힘) 데모
  // 그리고 이 값은 **모듈 로드 때 한 번** 읽습니다 (`let current = read()`).
  //
  // 그래서 한 사람에게 권한이 두 번 다르게 나옵니다.
  const sessionSaved = Boolean(session)
  /** 지금 이 페이지에서의 권한 — 앱을 열 때 세션이 없었으면 데모 운영진입니다 */
  const managerBeforeReload = true
  /** 앱을 다시 열었을 때 — 세션이 있으니 소속 없음(관객)이 됩니다 */
  const managerAfterReload = p.storage === 'blocked'

  if (sessionSaved && p.storage === 'ok') {
    // 가입을 끝낸 뒤에도 같은 페이지에서는 데모 소속이 그대로 남습니다
    hit('demo-membership-leak')
  }

  /* ── 5. 홈 ──────────────────────────────────────────── */
  go('L1 둘러보기')

  /* ── 6. 예매 → 입금 → 티켓 ─────────────────────────── */
  if (p.ticket !== 'none') {
    go('D1 공연 상세')
    go('D2 예매')
    if (!session) hit('guest-no-login-gate')
    go('D3 입금 안내')
    hit('deposit-cancel-dead')
    if (!p.envPay) hit('pay-card-hidden')
    go('D4 내 티켓')
    // 운영진이 아직 확인하지 않았는데 티켓이 「입금 확인됨」 으로 나옵니다
    hit('deposit-instant-confirmed')
    if (p.ticket === 'unknown-id') hit('ticket-fallback-wrong')
    if (!p.envPush) hit('push-unconfigured')
  }

  /* ── 7. 공연 당일 ───────────────────────────────────── */
  if (p.ticket === 'today' || p.ticket === 'unpaid') {
    go('S7 내 티켓 → P1 공연 정보')
    if (p.ticket !== 'today') hit('live-data-fixed')
    if (p.ticket === 'unpaid') hit('unpaid-ticket-live')
    go('P4 오늘 여기 온 사람')
    go('P5 휴대폰 맞대기')
    hit('nfc-tap-no-end')
  }

  /* ── 8. 마이 ────────────────────────────────────────── */
  go('S14 마이')
  hit('me-profile-mock')
  hit('me-dead-rows')
  if (p.side !== 'venue') hit('venue-no-entry-later')

  /* ── 9. 알림 ────────────────────────────────────────── */
  // 알림 목록의 「라디오가가가 …을 공개했어요」 줄은 공연장 운영 화면으로 갑니다
  go('S8 알림')
  if (p.side !== 'venue') hit('venue-open-to-all')

  /* ── 10. 운영 — 같은 페이지에서 (데모 소속이 남아 있는 동안) ─── */
  if ((p.side === 'club' || p.side === 'venue') && managerBeforeReload) {
    go('S14 마이 > 운영 → S18 공연 관리')
    // 내 동아리가 아니라 멜로딕의 공연·입금·정산이 뜹니다
    hit('ops-shows-other-club')
    go('S12 입장 관리')
    hit('s12-search-dead')
    if (p.side === 'club') {
      go('S5 모집 글 쓰기')
      hit('s5-draft-dead')
    }
  }

  /* ── 11. 앱을 다시 열어 봅니다 ──────────────────────── */
  if (p.returns && session) {
    go('다시 열기 → 로그인')
    // 학교·학과가 비어 있으면 온보딩으로 다시 들어갑니다
    const schoolKept = p.login === 'email' ? false : Boolean(session.school)
    if (p.login === 'email' && p.needsSchool) hit('email-session-reset')
    if (!schoolKept) hit('onboarding-loop')
    // 신청해 둔 것이 어떻게 됐는지 볼 화면으로 가는 길이 없습니다
    if (clubJoin) hit('pending-no-return')

    /* 다시 열면 소속이 사라집니다 — 운영 쪽이 전부 닫힙니다 */
    if (!managerAfterReload) {
      if (p.side === 'club') {
        go('L2 동아리 (우리 동아리 카드 없음)')
        hit('club-ops-blocked')
        hit('gate-lies')
      }
      if (p.side === 'venue') {
        go('L3 공연장 → 수락/정산')
        hit('venue-ops-blocked')
        hit('gate-lies')
      }
    }
  }

  /* ── 12. 소속이 생긴다면 바로 드러나는 자리 (잠재) ───── */
  // 부원 소속이 생기는 순간 L2 의 「다음 공연」 이 운영진 게이트로 갑니다.
  // 지금은 부원이 될 길이 없어서 아무도 겪지 않습니다 — latent 로 따로 셉니다.
  if (p.side === 'club' && clubJoin?.kind === 'join') hit('member-run-blocked')
  // 함께 설 팀 화면은 주소로 들어올 때만 닿습니다
  if (p.side === 'club' && p.returns) hit('clubops-ungated-back')

  return { hits, trail, finished: true, stoppedAt: null }
}

/* ────────────────────────────────────────────────────────────────
 * 5. 돌리고 집계
 * ──────────────────────────────────────────────────────────────── */

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const N = Number(arg('n', 5000))
const SEED = Number(arg('seed', 20261122))
/**
 * 환경 변수를 어떻게 둘지.
 *   mix  — 네 키를 각각 50% 로 섞습니다. 「키가 이쪽이면 어떤 일이 생기나」 를 다 보려는 것.
 *   prod — 2026-11-22 운영 주소(hibandy.com)에서 확인한 그대로: 네 키 모두 없음.
 *          (번들에 카카오 SDK 주소가 없고 목 사용자·목 취소 문구가 들어 있음,
 *           POST /api/auth/kakao → kakao_not_configured, 알림 줄이 「준비 중이에요」,
 *           입금 화면에 카드 결제 탭이 없음)
 */
const ENV_MODE = arg('env', 'mix')
const FIXED_ENV =
  ENV_MODE === 'prod'
    ? { envKakaoJsKey: false, envKakaoServer: false, envPay: false, envPush: false }
    : null

const source = checkSource()

const r = rng(SEED)
const personas = Array.from({ length: N }, (_, i) => ({ ...makePersona(r, i), ...(FIXED_ENV ?? {}) }))

/** 집계 */
const counts = new Map() // issue → { total, bySide, byWho, byLogin, examples }
const groupTotals = { side: {}, who: {}, login: {} }
let stopped = 0

for (const p of personas) {
  for (const k of ['side', 'who', 'login']) {
    groupTotals[k][p[k]] = (groupTotals[k][p[k]] ?? 0) + 1
  }
  const res = walk(p)
  if (!res.finished) stopped += 1
  for (const id of res.hits) {
    let c = counts.get(id)
    if (!c) {
      c = { total: 0, bySide: {}, byWho: {}, byLogin: {}, examples: [] }
      counts.set(id, c)
    }
    c.total += 1
    c.bySide[p.side] = (c.bySide[p.side] ?? 0) + 1
    c.byWho[p.who] = (c.byWho[p.who] ?? 0) + 1
    c.byLogin[p.login] = (c.byLogin[p.login] ?? 0) + 1
    if (c.examples.length < 3) {
      c.examples.push({
        persona: `#${p.i} ${p.side}/${p.who}/${p.login}${p.schoolName ? `/${p.schoolName}` : ''}${p.clubPath ? `/${p.clubPath}` : ''}${p.ticket !== 'none' ? `/티켓:${p.ticket}` : ''}${p.storage === 'blocked' ? '/저장막힘' : ''}`,
        trail: res.trail.slice(-4),
      })
    }
  }
}

const rows = [...counts.entries()]
  .map(([id, c]) => ({ id, ...ISSUES[id], ...c, pct: (c.total / N) * 100 }))
  .sort((a, b) => SEV[b.sev] - SEV[a.sev] || b.total - a.total)

/* ── 출력 ───────────────────────────────────────────── */

const out = {
  meta: {
    personas: N,
    seed: SEED,
    envMode: ENV_MODE,
    dimensions: Object.fromEntries(
      Object.entries(DIMENSIONS).map(([k, v]) => [k, v.length]),
    ),
    combinations: combinationCount(),
    groupTotals,
    stoppedBeforeFinish: stopped,
    sourceChecks: source,
  },
  findings: rows.map((x) => ({
    latent: x.latent ?? null,
    id: x.id,
    kind: KINDS[x.kind],
    severity: x.sev,
    title: x.title,
    where: x.where,
    count: x.total,
    pct: Number(x.pct.toFixed(1)),
    bySide: x.bySide,
    byWho: x.byWho,
    byLogin: x.byLogin,
    examples: x.examples,
  })),
}

const jsonPath = arg('json', null)
if (jsonPath) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(jsonPath, JSON.stringify(out, null, 2))
}

const pc = (n, d) => `${n}명 (${((n / d) * 100).toFixed(1)}%)`

console.log(`BANDY 페르소나 시뮬레이션 — ${N}명 · seed ${SEED} · 환경변수 ${ENV_MODE}`)
console.log(`차원 ${Object.keys(DIMENSIONS).length}개 · 조합 ${combinationCount().toLocaleString('en-US')}가지`)
console.log(`입구: ${Object.entries(groupTotals.side).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`신분: ${Object.entries(groupTotals.who).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`로그인: ${Object.entries(groupTotals.login).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`여정을 끝까지 못 간 사람: ${pc(stopped, N)}`)
console.log('')
if (source.warn.length) {
  console.log('⚠ 코드와 어긋난 전제 — 아래 집계를 믿기 전에 먼저 고쳐야 합니다:')
  for (const w of source.warn) console.log(`   · ${w}`)
} else {
  console.log(`✓ 모델이 읽어 온 규칙 ${source.ok.length}개가 코드와 일치합니다.`)
}
console.log('')

let lastSev = null
for (const x of rows.filter((x) => !x.latent)) {
  if (x.sev !== lastSev) {
    lastSev = x.sev
    const label = { blocker: '■ 막힘 (돈·가입)', major: '▲ 큼', minor: '· 작음' }[x.sev]
    console.log(`\n${label}`)
  }
  console.log(`  [${KINDS[x.kind]}] ${x.title}`)
  console.log(`      ${pc(x.total, N)} · ${x.where}`)
  const side = Object.entries(x.bySide)
    .map(([k, v]) => `${k} ${v}/${groupTotals.side[k]}`)
    .join(' · ')
  console.log(`      입구별: ${side}`)
  console.log(`      예: ${x.examples[0].persona} → ${x.examples[0].trail.join(' → ')}`)
}

const latent = rows.filter((x) => x.latent)
if (latent.length) {
  console.log('\n◻ 잠재 — 지금은 닿는 사람이 없거나 주소로만 닿습니다 (위 순위에서 뺐습니다)')
  for (const x of latent) {
    console.log(`  [${KINDS[x.kind]}] ${x.title}`)
    console.log(`      ${x.where}`)
    console.log(`      ${x.latent}`)
  }
}

process.exit(source.warn.length ? 1 : 0)
