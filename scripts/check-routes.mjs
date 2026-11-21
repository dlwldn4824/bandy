/**
 * 배포된 주소가 실제로 열리는지 훑습니다.
 *
 * 이걸 만든 이유: vercel.json 에 cleanUrls 를 켰더니 약관 네 장은 잘 열리는데
 * /brand 와 /ui 아래가 전부 404 가 된 적이 있습니다. 약관만 확인하고 앱
 * 경로를 안 봐서 한동안 몰랐습니다.
 *
 * SPA 는 어떤 주소든 index.html 을 돌려주므로 200 만으로는 아무것도 알 수
 * 없습니다. 그래서 상태 코드와 **그 페이지에 있어야 할 문구**를 같이 봅니다.
 *
 *   node scripts/check-routes.mjs
 *   node scripts/check-routes.mjs http://localhost:4173
 */

const BASE = process.argv[2] ?? 'https://www.hibandy.com'

/** [주소, 이 문구가 응답에 있어야 함] */
const ROUTES = [
  ['/', '우리 다음 공연'],                    // 프리렌더된 랜딩 본문
  ['/brand', '<div id="root">'],              // SPA 폴백
  ['/ui', '<div id="root">'],
  ['/ui/tickets', '<div id="root">'],
  ['/old', '<div id="root">'],
  ['/privacy', '개인정보 처리방침'],           // 정적 약관
  ['/terms', '이용약관'],
  ['/refund', '취소 · 환불 규정'],
  ['/account-deletion', '계정 삭제'],
  ['/robots.txt', 'Sitemap:'],
  ['/sitemap.xml', '<urlset'],
  ['/og-bandy.png', null],                    // 이미지는 상태 코드만
]

let failed = 0

for (const [path, must] of ROUTES) {
  let status = 0
  let body = ''
  try {
    const res = await fetch(BASE + path, { redirect: 'follow' })
    status = res.status
    if (must) body = await res.text()
  } catch (err) {
    console.log(`✗ ${path}  — ${err.message}`)
    failed++
    continue
  }

  const okStatus = status === 200
  const okBody = !must || body.includes(must)

  if (okStatus && okBody) {
    console.log(`✓ ${path}`)
  } else {
    failed++
    const why = !okStatus ? `status ${status}` : `「${must}」 없음`
    console.log(`✗ ${path}  — ${why}`)
  }
}

console.log(failed ? `\n${failed}개 실패` : '\n전부 정상')
process.exit(failed ? 1 : 0)
