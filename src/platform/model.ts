export type Category = '밴드' | '연극' | '동아리' | '페스티벌'
export type EventStatus = '초안' | '공개' | '마감'

export interface Organizer {
  id: string
  name: string
  summary: string
  city: string
}

export interface TimelineItem {
  id: string
  time: string
  title: string
  description: string
}

export interface SongItem {
  id: string
  part: string
  team: string
  song: string
  artist: string
  members: string
}

export interface EventFeatures {
  drink: boolean
  directions: boolean
  draw: boolean
  led: boolean
}

export interface EventItem {
  id: string
  organizerId: string
  title: string
  dateLabel: string
  city: string
  venue: string
  address: string
  category: Category
  price: string
  walkInPrice: string
  poster: string
  summary: string
  status: EventStatus
  bankName: string
  accountNumber: string
  accountName: string
  refund: string
  contactPhone: string
  staffCode: string
  timeline: TimelineItem[]
  setlist: SongItem[]
  features: EventFeatures
}

export interface Guest {
  id: string
  eventId: string
  name: string
  phone: string
  kind: '사전' | '현장'
  paymentConfirmed: boolean
  entryNumber: number | null
  ticketReceived: boolean
}

export interface Note {
  id: string
  eventId: string
  name: string
  text: string
  color: string
  at: number
}

export interface ChatMessage {
  id: string
  eventId: string
  author: string
  text: string
  at: number
}

export interface DrinkOrder {
  id: string
  eventId: string
  name: string
  beer: number
  highball: number
  at: number
  provided: boolean
}

export type Session =
  | { role: 'guest'; name: string; phone: string }
  | { role: 'host'; organizerId: string; name: string }
  | { role: 'staff'; eventId: string; name: string }

export interface PlatformData {
  events: EventItem[]
  organizers: Organizer[]
  guests: Guest[]
  notes: Note[]
  messages: ChatMessage[]
  orders: DrinkOrder[]
  session: Session | null
  lastName: string
  lastPhone: string
}

export const POSTER_SUMMER = '/assets/배경/연합공연_최종포스터.jpeg'
export const POSTER_PLAY = '/assets/배경/최종_포스터.PNG'
export const POSTER_DRAFT = '/assets/배경/티켓데모.png'
export const TICKET_IMAGE = '/assets/배경/티켓_최종.png'
export const MAP_IMAGE = '/assets/배경/얼라이브홀_지도.png'
export const WALL_IMAGE = '/assets/배경/밴드_포스터_벽.jpeg'
export const LOGOUT_IMAGE = '/assets/배경/logout-button.png'

export const MEMO_COLORS = [
  { id: 'yellow', label: '노랑', value: '#F6E58D' },
  { id: 'pink', label: '분홍', value: '#F8C4D4' },
  { id: 'blue', label: '파랑', value: '#B7D3F2' },
  { id: 'green', label: '초록', value: '#C9E8C6' },
  { id: 'purple', label: '보라', value: '#D7C6F6' },
]

export function digits(phone: string) {
  return phone.replace(/\D/g, '')
}

export function samePhone(a: string, b: string) {
  return digits(a) === digits(b) && digits(a).length > 0
}

export function formatPhone(phone: string) {
  const value = digits(phone)
  if (value.length === 11) return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`
  if (value.length === 10) return `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`
  return phone
}

export function seedPlatform(): PlatformData {
  const summerSetlist: SongItem[] = [
    { id: 's1', part: '1부', team: '렉사', song: '행운을 빌어요', artist: '렉사', members: '보컬 수아 · 기타 민재 · 베이스 하린 · 드럼 도윤' },
    { id: 's2', part: '1부', team: '렉사', song: '0+0', artist: '렉사', members: '보컬 수아 · 키보드 이안' },
    { id: 's3', part: '1부', team: '멜로딕', song: '항해', artist: '멜로딕', members: '보컬 가을 · 기타 준 · 베이스 로하' },
    { id: 's4', part: '2부', team: '멜로딕', song: '축배', artist: '멜로딕', members: '보컬 가을 · 드럼 시우' },
    { id: 's5', part: '2부', team: '연합', song: '찬란', artist: '렉사 × 멜로딕', members: '전원' },
  ]

  return {
    organizers: [
      { id: 'rexa', name: '렉사 × 멜로딕', summary: '대학 밴드 두 팀이 학기마다 연합 공연을 올립니다.', city: '서울' },
      { id: 'haetsal', name: '햇살 연극동아리', summary: '소극장에서 학기말 작품을 올리는 연극 동아리입니다.', city: '서울' },
    ],
    events: [
      {
        id: 'summer',
        organizerId: 'rexa',
        title: 'Summer Night Live',
        dateLabel: '2026년 8월 15일 (토) 18:30',
        city: '서울',
        venue: '얼라이브홀',
        address: '서울시 마포구 어울마당로 00',
        category: '밴드',
        price: '6,000원',
        walkInPrice: '8,000원',
        poster: POSTER_SUMMER,
        summary: '렉사와 멜로딕의 여름 연합 공연. 예매는 입금 확인 후 입장번호가 열립니다.',
        status: '공개',
        bankName: '카카오뱅크',
        accountNumber: '3333-00-0000000',
        accountName: '공연준비',
        refund: '환불 불가',
        contactPhone: '010-0000-0000',
        staffCode: '4824',
        features: { drink: true, directions: true, draw: true, led: true },
        timeline: [
          { id: 't1', time: '18:30', title: '관객 입장', description: '티켓의 입장번호를 확인합니다.' },
          { id: 't2', time: '19:00', title: '1부', description: '렉사, 멜로딕' },
          { id: 't3', time: '20:10', title: '2부', description: '연합 무대' },
        ],
        setlist: summerSetlist,
      },
      {
        id: 'haetsal-may',
        organizerId: 'haetsal',
        title: '햇살, 그날의 복도',
        dateLabel: '2026년 5월 22일 (금) 19:00',
        city: '서울',
        venue: '소극장 복도',
        address: '서울시 관악구 대학길 00',
        category: '연극',
        price: '5,000원',
        walkInPrice: '5,000원',
        poster: POSTER_PLAY,
        summary: '햇살 연극동아리 봄 정기 공연.',
        status: '공개',
        bankName: '카카오뱅크',
        accountNumber: '3333-00-0000001',
        accountName: '햇살연극',
        refund: '공연 3일 전까지',
        contactPhone: '010-0000-1111',
        staffCode: '2200',
        features: { drink: false, directions: true, draw: false, led: false },
        timeline: [
          { id: 'h1', time: '18:30', title: '로비 오픈', description: '입장번호 순으로 착석' },
          { id: 'h2', time: '19:00', title: '본 공연', description: '인터미션 없음' },
        ],
        setlist: [
          { id: 'h-s1', part: '본 공연', team: '햇살', song: '1장 복도', artist: '햇살 연극동아리', members: '연출 보라 · 출연 6명' },
          { id: 'h-s2', part: '본 공연', team: '햇살', song: '2장 창가', artist: '햇살 연극동아리', members: '연출 보라 · 출연 6명' },
        ],
      },
      {
        id: 'rexa-draft',
        organizerId: 'rexa',
        title: '가을 정기 공연',
        dateLabel: '날짜 미정',
        city: '서울',
        venue: '장소 미정',
        address: '',
        category: '동아리',
        price: '6,000원',
        walkInPrice: '8,000원',
        poster: POSTER_DRAFT,
        summary: '아직 공개 전인 초안입니다.',
        status: '초안',
        bankName: '카카오뱅크',
        accountNumber: '3333-00-0000000',
        accountName: '공연준비',
        refund: '환불 불가',
        contactPhone: '010-0000-0000',
        staffCode: '4824',
        features: { drink: false, directions: false, draw: false, led: false },
        timeline: [],
        setlist: [],
      },
    ],
    guests: [
      {
        id: 'guest-hana',
        eventId: 'summer',
        name: '김하늘',
        phone: '01011112222',
        kind: '사전',
        paymentConfirmed: true,
        entryNumber: 1,
        ticketReceived: false,
      },
      {
        id: 'guest-jun',
        eventId: 'summer',
        name: '이준',
        phone: '01033334444',
        kind: '사전',
        paymentConfirmed: false,
        entryNumber: null,
        ticketReceived: false,
      },
    ],
    notes: [
      { id: 'n1', eventId: 'summer', name: '하늘', text: '1부 항해 최고였어요.', color: '#F6E58D', at: 1 },
      { id: 'n2', eventId: 'summer', name: '준', text: '입장번호 받고 바로 들어왔습니다.', color: '#B7D3F2', at: 2 },
    ],
    messages: [
      { id: 'm1', eventId: 'summer', author: '운영진', text: '입장번호 순으로 착석해 주세요.', at: 1 },
    ],
    orders: [],
    session: null,
    lastName: '',
    lastPhone: '',
  }
}
