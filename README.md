# 밴디 (BANDY)

**공연장이 비는 날에 밴드를 연결합니다. 같이 설 팀과 보러 올 사람까지.**
대학 밴드 동아리의 공연 플랫폼. 노원 대학가에서 시작합니다.

![밴디 앱 화면 — 홈, 티켓, 정산, 동아리 연결](./docs/screenshots/app-screens.png)

<sub>왼쪽부터 홈 · 티켓 QR · 정산 · 동아리 연결 지도. Figma `앱 · 라이트 UI` 에서 그대로 내려받은 화면입니다.</sub>

| | |
|---|---|
| **서비스** | <https://band-alpha.vercel.app> |
| **UX 소개서** | <https://dlwldn4824.github.io/bandy-case-study/> — 문제 정의부터 서비스 플로우, 브랜드, 화면까지 ([저장소](https://github.com/dlwldn4824/bandy-case-study)) |
| **디자인** | [Figma · 앱 / 웹](https://www.figma.com/design/mLwN6nNV8jjSE70CiWRhvs) — 라이트 UI 37화면 · 다크 UI 34화면 · 프로토타입 연결 |

## 한 공연이 이렇게 이어집니다

```
공연장 빈 날 등록 → 밴드 연결 → 함께 설 팀 모집 → 티켓 예매
   → 입금 확인 → 당일 QR 입장 → 현장 교류 → 정산
```

예매 · 입장 · 사전 구매는 **실제 공연 3회**에 썼습니다. 공연장 빈 날 매칭과 현장 네트워킹은 개발 중입니다.

---

## 지금 쓰는 화면

처음 온 사람은 `/` 로 들어와 `/brand` 랜딩을 보고, 가입하면 `/ui` 아래 앱으로 들어갑니다.
가입은 네 입장으로 갈립니다 — **동아리 운영진 · 동아리 부원 · 관객 · 공연장.** 받는 것도 끝나고 가는 곳도 다릅니다.

| | 경로 | |
|---|---|---|
| **랜딩** | `/brand` | 처음 온 사람에게 보여 주는 페이지 |
| **가입** | `/ui/join` → `/ui/start` → `/ui/start/profile` | 입장 고르기 → 로그인(카카오 · 이메일) → 온보딩 |
| **관객** | `/ui` · `/ui/map` · `/ui/show/:id` · `/ui/tickets` | 홈 · 지도 · 공연 상세 · 내 티켓 |
| **예매** | `/ui/show/:id/book` → `/deposit` → `/ui/ticket/:id` | 매수 → 입금(계좌이체 · 카드) → QR 티켓 |
| **공연 당일** | `/ui/live/:id` 아래 | 셋리스트 · 사전 구매 교환 · 현장 교류 · 방명록 |
| **동아리** | `/ui/clubs` · `/ui/club/:id` · `/ui/connections` | 교류 · 동아리 상세 · 연결 지도 |
| **운영진** | `/ui/console` · `/ui/show/:id/run` · `/ui/deposits` · `/ui/entry` · `/ui/settlement` | 공연 관리 · 당일 타임라인 · 입금 · 입장 · 정산 |
| **약관** | `/ui/legal/:doc` · `/privacy` · `/terms` · `/refund` · `/account-deletion` | 앱 안과 웹 양쪽에서 열립니다 |

경로 상수는 [`src/lightui/paths.ts`](./src/new/lightui/paths.ts) 한 곳에 있습니다. Figma 프로토타입 연결을 그대로 옮긴 것이라 화면에서 어디로 가는지가 1:1 입니다.

## 폴더

```
src/
  new/           지금 서비스
    lightui/       앱 화면 (/ui/*)
      screens/       L1 홈, D2 예매, S19 공연 당일 …
      components/    Phone, TopBar, Sheet, Button …
      legal/         약관 · 개인정보 · 환불 본문 (웹 페이지도 여기서 찍습니다)
      pay/           포트원 결제 (테스트 모드)
      push/          웹 푸시
      safety/        신고 · 차단
    brand/         랜딩 (/brand)
    mocks/         화면이 쓰는 목 데이터
  old/           2025 공연 앱 (/old/*) — docs/2025-공연앱.md
  shared/        양쪽이 같이 쓰는 것
    config/        Firebase · 브랜드명
    assets/        이미지 · 폰트
    styles/        전역 토큰
  _unused/       아무 데서도 안 쓰는 코드 (빌드에서 제외)
  main.tsx  App.tsx  index.css
```

```
docs/
  store/      스토어 출시 · 심사
  backend/    백엔드 설계
  setup/      Firebase · 메일 · 시트 연동 설정
  bizplan/    사업 계획
  screenshots/
scripts/      빌드 보조 (약관 페이지 생성 등)
public/       그대로 서빙되는 것 (robots · sitemap · OG 이미지 · 서비스 워커)
api/  server/ 서버 API
```

**`new` 는 `old` 에 기대지 않습니다.** `new` 가 밖에서 가져다 쓰는 것은 `shared/config/firebase` 하나뿐입니다. 옛 앱을 통째로 들어내도 지금 서비스는 그대로 돕니다.

브랜드명은 [`src/shared/config/brand.ts`](./src/shared/config/brand.ts) 한 곳에서만 바꿉니다 — 한때 '마주'로 바꿨다가 되돌린 적이 있어서 그렇게 모아 뒀습니다. 코드 안의 식별자(`bandyCore.js`, `Bandy.css` 등)는 그대로 둡니다.

## 시작하기

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

`npm run build` 는 빌드 전에 [`scripts/build-legal-pages.mjs`](./scripts/build-legal-pages.mjs) 를 돌려 약관 · 개인정보 · 환불 · 계정 삭제를 정적 HTML 로 찍습니다. 앱 안 약관을 고치면 웹 페이지가 따라옵니다.

환경 변수는 [`.env.example`](./.env.example) 을 복사해 쓰세요. 전부 비워 둬도 앱은 돕니다 — 카카오 로그인은 목으로, 카드 결제는 버튼이 숨고, 푸시는 「준비 중」 으로 뜹니다.

## 문서

| | |
|---|---|
| [출시-준비.md](./docs/store/출시-준비.md) | 순서 · 비용 · 사업자등록을 미뤄야 하는 이유 |
| [스토어-심사-반려-예상.md](./docs/store/스토어-심사-반려-예상.md) | 애플 · 구글에서 걸릴 것들 |
| [심사-제출-체크리스트.md](./docs/store/심사-제출-체크리스트.md) | 제출할 때 넣을 값, 아직 안 끝난 것 |
| [2025-공연앱.md](./docs/2025-공연앱.md) | 옛 앱(`/old`)의 기능 · 보안 · 데이터 분석 |
| [landing-copy.md](./docs/landing-copy.md) | 랜딩 문구 |

백엔드 설계는 따로 있습니다 (작성: [@THISISMYCOSMOS](https://github.com/THISISMYCOSMOS)).

| | |
|---|---|
| [development-plan.md](./docs/backend/development-plan.md) | 백엔드 개발 계획 |
| [db-design.md](./docs/backend/db-design.md) · [db-structure.xlsx](./docs/backend/db-structure.xlsx) | DB 구조 |
| [data-flow.md](./docs/backend/data-flow.md) | 데이터 흐름 |
| [external-apis.md](./docs/backend/external-apis.md) · [backend-api-spec.xlsx](./docs/backend/backend-api-spec.xlsx) | API 명세 |

## 기술

React 18 · TypeScript · Vite · React Router · Firebase (Firestore · Storage) · Vercel

## 숫자에 대해

확인된 값만 적습니다. 설문이나 인터뷰를 설계해 돌린 적이 없어서 응답 수와 비율은 넣지 않았고,
화면에 보이는 금액은 예시 값입니다. 공연장 몫의 비율은 공연장마다 협의로 정합니다.

## 라이선스

MIT
