import { Db } from './types'

// 시연용 데이터. 실제 동아리·사람이 아니라 프로토타입 설명용 가상 값이다.
const T0 = '2026-11-01T00:00:00+09:00'

export const PERSONAS = [
  { id: 'u-audience', label: '관객', hint: '공연을 찾고 예매하는 사람' },
  { id: 'u-rexa', label: '렉사 운영진', hint: '공연 주최 · 입금 확인 · QR 입장 · 교류 수락' },
  { id: 'u-melodic', label: '멜로딕 운영진', hint: '다른 동아리에 교류 신청' },
  { id: 'u-admin', label: '밴디 운영자', hint: '새 동아리 인증(수동 승인)' },
] as const

function club(
  id: string, name: string, school: string, genre: string, region: string,
  introduction: string, exchange_open: boolean, status: 'PENDING' | 'ACTIVE' = 'ACTIVE',
) {
  return {
    id, name, school, genre, region, introduction, exchange_open, status,
    city: '서울', profile_path: null, sns_url: `https://instagram.com/${id}_band`,
    open_chat_url: `https://open.kakao.com/o/${id}`,
    created_at: T0, updated_at: T0,
  }
}

function event(
  id: string, club_id: string, created_by: string, title: string, category: '공연' | '해커톤' | '학술회' | '네트워킹',
  starts_at: string, venue_name: string, address: string, latitude: number, longitude: number,
  description: string, status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
) {
  return {
    id, club_id, created_by, title, category, starts_at, description,
    ends_at: null, admission_starts_at: null, admission_ends_at: null, timezone: 'Asia/Seoul',
    venue_name, address, latitude, longitude, poster_path: null, status,
    published_at: status === 'PUBLISHED' ? T0 : null,
    bank_name: '카카오뱅크', account_number: '3333-00-0000000', account_holder: club_id,
    created_at: T0, updated_at: T0,
  }
}

function ticketType(id: string, event_id: string, name: string, price_krw: number, capacity: number) {
  return {
    id, event_id, name, price_krw, capacity, reserved_quantity: 0, sold_quantity: 0,
    sales_starts_at: T0, sales_ends_at: '2026-12-31T23:59:00+09:00', status: 'ACTIVE' as const,
    created_at: T0, updated_at: T0,
  }
}

function profile(id: string, display_name: string, is_admin = false) {
  return { id, display_name, profile_path: null, status: 'ACTIVE' as const, is_admin, created_at: T0, updated_at: T0 }
}

function member(user_id: string, club_id: string, role: 'OWNER' | 'MANAGER' = 'OWNER') {
  return { id: `m-${user_id}-${club_id}`, user_id, club_id, role, status: 'ACTIVE' as const, created_at: T0, updated_at: T0 }
}

export function seedDb(): Db {
  const db: Db = {
    profiles: [
      profile('u-audience', '김관객'),
      profile('u-jun', '이준'),
      profile('u-rexa', '렉사 회장'),
      profile('u-melodic', '멜로딕 회장'),
      profile('u-sound', '사운드웨이브 회장'),
      profile('u-dawn', '새벽밴드 회장'),
      profile('u-admin', '밴디 운영자', true),
    ],
    clubs: [
      club('rexa', '렉사', '광운대', '밴드', '노원구', '록·모던록 커버와 자작곡을 하는 밴드 동아리.', true),
      club('melodic', '멜로딕', '광운대', '밴드', '노원구', '보컬 중심의 팝·발라드 밴드.', true),
      club('soundwave', '사운드웨이브', '서울과기대', '밴드', '노원구', '학기마다 정기 공연을 여는 밴드 동아리.', true),
      club('jazzlab', '재즈랩', '삼육대', '재즈', '노원구', '재즈 스탠더드와 즉흥 연주.', true),
      club('harmony', '어쿠스틱 하모니', '인덕대', '어쿠스틱', '노원구', '통기타·카혼 어쿠스틱 동아리.', false),
      club('dawn', '새벽밴드', '서울여대', '밴드', '노원구', '새로 가입 신청한 밴드 동아리.', true, 'PENDING'),
    ],
    club_memberships: [
      member('u-rexa', 'rexa'),
      member('u-melodic', 'melodic'),
      member('u-sound', 'soundwave'),
      member('u-dawn', 'dawn'),
    ],
    events: [
      event('ev-rexa', 'rexa', 'u-rexa', '렉사 X 멜로딕 연합 공연', '공연', '2026-11-29T19:00:00+09:00',
        '제휴 공연장 노원 라이브홀', '서울 노원구 광운로 20', 37.6195, 127.0600,
        '렉사와 멜로딕의 겨울 연합 무대. 1부 렉사, 2부 멜로딕, 마지막 연합곡.'),
      event('ev-sound', 'soundwave', 'u-sound', '사운드웨이브 겨울 정기공연', '공연', '2026-12-05T18:30:00+09:00',
        '서울과기대 100주년관', '서울 노원구 공릉로 232', 37.6318, 127.0773,
        '한 학기 동안 준비한 6팀의 무대.'),
      event('ev-jazz', 'jazzlab', 'u-admin', '재즈랩 겨울 재즈의 밤', '공연', '2026-12-12T19:00:00+09:00',
        '공릉 재즈바 블루노트', '서울 노원구 동일로 1000', 37.6255, 127.0730,
        '스탠더드 넘버와 학생 자작곡.'),
      event('ev-hack', 'melodic', 'u-melodic', '대학연합 AI 해커톤', '해커톤', '2026-12-29T09:30:00+09:00',
        '인스케이프 본사', '서울 노원구 화랑로 500', 37.6150, 127.0850,
        '하루 동안 팀별로 AI 과제를 개발하고 발표. 3~4명 팀 신청.'),
      event('ev-rexa-draft', 'rexa', 'u-rexa', '렉사 단독 공연 (초안)', '공연', '2027-03-14T19:00:00+09:00',
        '장소 미정', '', 37.62, 127.06, '아직 공개 전인 초안입니다.', 'DRAFT'),
    ],
    ticket_types: [
      ticketType('tt-rexa', 'ev-rexa', '사전 예매', 6000, 120),
      ticketType('tt-sound', 'ev-sound', '일반', 5000, 80),
      ticketType('tt-jazz', 'ev-jazz', '일반 (음료 1잔 포함)', 7000, 40),
      ticketType('tt-hack', 'ev-hack', '참가 신청', 0, 50),
      ticketType('tt-rexa-draft', 'ev-rexa-draft', '사전 예매', 6000, 150),
    ],
    bookings: [],
    booking_items: [],
    payments: [],
    tickets: [],
    qr_credentials: [],
    event_staff: [],
    notifications: [],
    exchange_requests: [
      {
        id: 'ex-1', from_club_id: 'melodic', to_club_id: 'rexa', kind: 'JOINT_SHOW',
        message: '11월 말 연합 공연 같이 해요!', status: 'ACCEPTED', created_by: 'u-melodic',
        responded_by: 'u-rexa', responded_at: T0, created_at: T0,
      },
      {
        id: 'ex-2', from_club_id: 'soundwave', to_club_id: 'rexa', kind: 'PRACTICE',
        message: '합주실 같이 쓰면서 연습 교류해요.', status: 'PENDING', created_by: 'u-sound',
        responded_by: null, responded_at: null, created_at: T0,
      },
    ],
  }
  for (const e of db.events) e.account_holder = db.clubs.find((c) => c.id === e.club_id)?.name ?? ''
  return db
}
