const DAYS = ['일', '월', '화', '수', '목', '금', '토']

function seoul(iso: string) {
  // Asia/Seoul 기준 날짜 조각
  const d = new Date(new Date(iso).getTime() + 9 * 3600000)
  return { m: d.getUTCMonth() + 1, day: d.getUTCDate(), w: DAYS[d.getUTCDay()], h: d.getUTCHours(), min: d.getUTCMinutes(), y: d.getUTCFullYear() }
}

export function dateLabel(iso: string) {
  const s = seoul(iso)
  return `${s.m}.${s.day} (${s.w}) ${String(s.h).padStart(2, '0')}:${String(s.min).padStart(2, '0')}`
}

// '11.30 (월) 19:00 ~ 21:00', 자정을 넘기면 '11.30 (월) 23:00 ~ 12.1 (화) 01:00'
export function timeRange(startIso: string, endIso: string) {
  const a = seoul(startIso)
  const b = seoul(endIso)
  const end = a.y === b.y && a.m === b.m && a.day === b.day ? dateLabel(endIso).slice(-5) : dateLabel(endIso)
  return `${dateLabel(startIso)} ~ ${end}`
}

export function shortDate(iso: string) {
  const s = seoul(iso)
  return `${s.m}.${s.day} (${s.w})`
}

export function won(n: number) {
  return n === 0 ? '무료' : `${n.toLocaleString('ko-KR')}원`
}

// 두 좌표 사이 거리(km). 기준점은 광운대 근처 고정값(프로토타입)
export const HERE = { lat: 37.6196, lng: 127.0587 }
export function distanceKm(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return null
  const r = 6371
  const dLat = ((lat - HERE.lat) * Math.PI) / 180
  const dLng = ((lng - HERE.lng) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((HERE.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return Math.round(r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
}

export function timeOf(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// 서울 기준 YYYY-MM-DD
export function dayKey(iso: string | Date) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000)
  return d.toISOString().slice(0, 10)
}

export function dDay(iso: string) {
  const diff = Math.round((Date.parse(`${dayKey(iso)}T00:00:00Z`) - Date.parse(`${dayKey(new Date())}T00:00:00Z`)) / 86400000)
  return diff > 0 ? `D-${diff}` : diff === 0 ? 'D-DAY' : '종료'
}
