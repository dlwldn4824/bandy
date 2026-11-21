/**
 * 로그인 목 데이터.
 *
 * MOCK: 카카오 SDK 와 Firebase 커스텀 토큰이 붙기 전까지 쓰는 가짜 사용자입니다.
 * 실제로 바꿀 때는 `src/lightui/auth/kakao.ts` 안만 고치면 되고 이 파일은 지우면 됩니다.
 */

export interface BandyUser {
  id: string
  /** 카카오 말고 이메일로도 들어옵니다 — 애플 가이드라인 4.8 과 심사자 로그인 때문 */
  provider: 'kakao' | 'email'
  nickname: string
  /** 이메일로 가입한 경우에만 채워집니다 */
  email?: string
  /** 온보딩 전에는 비어 있습니다 */
  school: string
  department: string
  /** 아바타 자리에 쓰는 한 글자 */
  initial: string
  /** 예매할 때 적은 연락처 — 다음 예매에서 자동으로 채웁니다 */
  phone?: string
  /** 동아리에서의 권한 — 운영진만 할 수 있는 일이 있습니다 */
  role: 'manager' | 'member'
}

/** MOCK: 카카오에서 막 돌아온 사용자 — 학교·학과는 아직 없습니다 */
export const mockKakaoUser: BandyUser = {
  id: 'kakao_1047352991',
  provider: 'kakao',
  nickname: '이지우',
  school: '',
  department: '',
  initial: '이',
  role: 'manager',
}

/** 가입할 때 고르는 두 쪽 — 랜딩의 두 CTA 가 각각 여기로 들어옵니다 */
/**
 * 가입할 때 고르는 네 입장.
 *
 * 입구는 셋입니다 — 관객 · 동아리 · 공연장.
 *
 * 한동안 운영진과 부원을 입구에서 갈랐는데, 아직 동아리가 없는 사람에게
 * 「운영진이세요 부원이세요」는 대답할 수 없는 질문이었습니다. 지금은 묻지 않고,
 * 동아리를 **만든 사람이 운영진**, **참여 코드로 들어온 사람이 부원** 이 됩니다.
 *
 * 관객으로 시작해도 나중에 마이에서 코드를 넣거나 동아리를 만들면 동아리 쪽이 열립니다.
 * 공연장은 아예 다른 쪽입니다 — 빈 날을 올리고 정산을 받습니다.
 */
export type JoinSide = 'audience' | 'club' | 'venue'

export const joinSides: {
  key: JoinSide
  label: string
  title: string
  sub: string
  does: string[]
}[] = [
  {
    key: 'club',
    label: '무대에 서는 쪽',
    title: '동아리로 시작하기',
    sub: '우리 동아리를 찾아 들어가거나, 없으면 새로 만듭니다.',
    does: ['우리 공연과 내 순서', '함께 설 팀 찾기', '공연 올리기', '입금 · 입장 · 정산'],
  },
  {
    key: 'audience',
    label: '보러 가는 쪽',
    title: '관객으로 시작하기',
    sub: '가까운 공연을 찾고, 링크 하나로 예매하고, 폰으로 입장합니다.',
    does: ['가까운 공연 찾기', '예매', '폰으로 입장', '현장 교류'],
  },
  {
    key: 'venue',
    label: '자리를 내주는 쪽',
    title: '공연장으로 시작하기',
    sub: '비는 날을 올려 두면 밴디가 설 팀을 찾아 넣습니다. 대관료 대신 티켓 매출의 일부를 받습니다.',
    does: ['빈 날 등록', '들어온 공연 확인', '당일 입장 현황', '정산'],
  },
]

/**
 * 온보딩에서 쓰는 보기.
 *
 * 전에는 학교 4개, 학과 5개만 칩으로 보여 줘서 그 밖의 사람은 넣을 자리가
 * 없었습니다. 지금은 검색해서 고르거나, 목록에 없으면 직접 적을 수 있습니다.
 * 아래 목록은 자주 나올 것들을 추려 놓은 것일 뿐 제한이 아닙니다.
 */
export const onboardingOptions = {
  /** 입력 칸 아래에 바로 보여 주는 빠른 선택 */
  topSchools: ['광운대학교', '서울과학기술대학교', '삼육대학교', '한양대학교'],
  topDepartments: ['컴퓨터정보공학부', '로봇학부', '전자공학과', '경영학부'],
  schools: [
    '광운대학교', '서울대학교', '연세대학교', '고려대학교', '한양대학교',
    '성균관대학교', '서강대학교', '중앙대학교', '경희대학교', '한국외국어대학교',
    '서울시립대학교', '건국대학교', '동국대학교', '홍익대학교', '숭실대학교',
    '국민대학교', '세종대학교', '단국대학교', '명지대학교', '상명대학교',
    '서경대학교', '한성대학교', '서울과학기술대학교', '서울여자대학교', '숙명여자대학교',
    '이화여자대학교', '성신여자대학교', '덕성여자대학교', '동덕여자대학교', '삼육대학교',
    '한국항공대학교', '가톨릭대학교', '아주대학교', '인하대학교', '가천대학교',
    '경기대학교', '수원대학교', '인천대학교', '한국체육대학교', '서울교육대학교',
    '인덕대학교', '육군사관학교', '서울신학대학교', '한신대학교', '총신대학교',
    '성공회대학교', '서울기독대학교', '케이씨대학교', '감리교신학대학교', '서울한영대학교',
    '동양미래대학교', '한양여자대학교', '배화여자대학교', '서일대학교', '정화예술대학교',
    '백석예술대학교', '서울예술대학교', '한국예술종합학교', '경인교육대학교', '추계예술대학교',
    '명지전문대학', '동서울대학교', '신구대학교', '연성대학교', '부천대학교',
    '유한대학교',
  ],
  departments: [
    '컴퓨터정보공학부', '컴퓨터공학과', '소프트웨어학부', '정보융합학부',
    '인공지능학과', '로봇학부', '전자공학과', '전기공학과', '기계공학과',
    '산업공학과', '건축학과', '토목공학과', '화학공학과', '신소재공학과',
    '환경공학과', '수학과', '물리학과', '화학과', '생명과학과', '통계학과',
    '경영학부', '경제학과', '회계학과', '행정학과', '정치외교학과', '법학과',
    '사회학과', '심리학과', '미디어커뮤니케이션학과', '신문방송학과',
    '국어국문학과', '영어영문학과', '사학과', '철학과', '교육학과',
    '유아교육과', '간호학과', '식품영양학과', '의류학과', '체육학과',
    '음악학과', '실용음악과', '연극영화학과', '시각디자인학과', '산업디자인학과',
  ],
}

/**
 * 이미 밴디에 등록된 동아리.
 *
 * 가입할 때 「우리 동아리」 를 여기서 찾습니다. 찾으면 부원으로 들어가고,
 * 없으면 새로 만듭니다. 학교로 먼저 좁히는 이유는 같은 이름이 학교마다
 * 있기 때문입니다 — 「소리」 라는 동아리는 어느 학교에나 하나씩 있습니다.
 *
 * MOCK: 실제로는 서버가 학교로 질의합니다.
 */
export interface KnownClub {
  id: string
  name: string
  school: string
  /** 부원 수 — 맞는 동아리인지 사람이 알아보는 단서 */
  members: number
  since: string
}

export const knownClubs: KnownClub[] = [
  { id: 'melodic', name: '멜로딕', school: '광운대학교', members: 18, since: '2008' },
  { id: 'bluenote', name: '블루노트', school: '광운대학교', members: 12, since: '2015' },
  { id: 'lexa', name: '렉사', school: '한양대학교', members: 24, since: '2011' },
  { id: 'harmonic', name: '하모닉', school: '삼육대학교', members: 15, since: '2013' },
  { id: 'acappella', name: '아카펠라', school: '서울여자대학교', members: 11, since: '2017' },
  { id: 'soriul', name: '소리울', school: '서울여자대학교', members: 9, since: '2019' },
  { id: 'sonareum', name: '손아름', school: '인덕대학교', members: 14, since: '2012' },
]

/** 학교로 좁혀 동아리를 찾습니다. 학교를 안 고르면 전체에서 이름으로 찾습니다. */
export function findClubs(school: string, query: string): KnownClub[] {
  const norm = (v: string) => v.replace(/\s+/g, '').toLowerCase()
  const s = norm(school)
  const q = norm(query)
  return knownClubs.filter((c) => {
    const schoolOk = !s || norm(c.school).includes(s) || s.includes(norm(c.school))
    const nameOk = !q || norm(c.name).includes(q)
    return schoolOk && nameOk
  })
}
