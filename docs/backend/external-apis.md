# Bandy 외부 API 검토안

2026-10-07 · 무료 개발 우선 · 설계/연동안

Supabase DB/Auth/Storage를 기준으로 정리한다. 계정·프로젝트·키·버킷·배포 설정은 우리 담당이 아니다. 본인은 호출 주체·입력/응답·DB 연결을 설계하고 필요한 조건을 세팅 담당자에게 전달한다. 실제 외부 API 호출·등록·결제는 하지 않았다.

| 기능 | 사용할 서비스·호출 | 프론트 | 백엔드 | DB에 남길 값 |
|---|---|---|---|---|
| 로그인 | Supabase Auth의 Kakao OAuth/PKCE | signInWithOAuth, 콜백 exchangeCodeForSession | Supabase 세션을 Auth에서 검증하고 본인 조회 | auth.users.id와 같은 profiles.id, 표시명 |
| 결제 | Toss Payments TEST: POST /v1/payments/confirm, GET /v1/payments/orders/{orderId} | 테스트 결제창·성공 콜백 | 주문·금액 검증, 승인/복구 조회, 발권 원자적 반영 | paymentId/orderId/paymentKey/금액/상태/승인 시각 |
| 지도 | Kakao Maps JavaScript SDK | 지도 표시·사용자 위치 권한 | E01에서 자체 공연 DB 검색 | events 위경도 |
| 주소→좌표 | Kakao Local GET /v2/local/search/address.json | 주소/장소 입력 | 등록·수정 때 주소 변환, 결과 재사용 | y→latitude, x→longitude |
| 이미지 | Supabase Storage upload/createSignedUrls | 파일 선택·URL 표시 | 업로더·동아리·용도 검사, 파일 검사·업로드·메타 생성, 표시 URL 생성 | imageRef와 내부 object_path. 서명 URL은 영구 저장하지 않음 |
| 기존 서비스 | 현재 인터페이스 확인 필요 | 입장 후 화면 연결 | 추가 서버 호출 필요 여부 확인 | 기존 eventId/ticketId 연결 규칙 미정 |

로그인은 자체 카카오 토큰 교환과 Supabase Auth 흐름을 동시에 구현하지 않는 안이다. 카카오 OAuth 설정은 [Supabase 공식 가이드](https://supabase.com/docs/guides/auth/social-login/auth-kakao)를 기준으로 전달한다. 계정 이메일 없이 로그인하는 옵션을 제공하므로 최소 표시명으로 시작하고, 비즈앱 자격 없이 이메일을 필수값으로 가정하지 않는다.

토스 승인 입력은 `paymentKey`, `orderId`, `amount`다. 성공 콜백 URL에는 내부 paymentId를 함께 유지해 P02 경로와 연결한다. 업체의 승인·주문조회 결과가 저장한 주문/금액과 맞아야 발권한다. 같은 paymentId로 업체 멱등키를 유지한다. 헤더의 멱등키는 15일간 유효하며, 409 IDEMPOTENT_REQUEST_PROCESSING이면 이전 승인 결과를 확인하는 흐름으로 처리한다. [토스 코어 API](https://docs.tosspayments.com/reference), [멱등키 문서](https://docs.tosspayments.com/reference/using-api/authorization)

카카오 주소 응답의 `x`는 경도, `y`는 위도다. 지도 표시 SDK와 주소 변환 REST API, 자체 공연 반경 검색을 서로 구분한다. [카카오 Local 공식 문서](https://developers.kakao.com/docs/ko/local/dev-guide)

## 무료 이용 범위

| 서비스 | 2026-10-07 공식 문서 기준 | 적용할 조건 |
|---|---|---|
| Supabase Free | DB 500MB, Storage 1GB, Auth 50,000 MAU, egress 5GB, 활성 프로젝트 최대 2개 | 기존 Free 프로젝트 사용/생성은 세팅 담당. 이미지 용량·전송량 관리 |
| Supabase Free 운영 조건 | 1주 비활동 후 일시정지, 자동 백업 미포함 | 데모 일정·수동 백업은 세팅/운영 담당과 확인 |
| 카카오 Maps/Local | 전체 API 월 300만건. JS 지도 일 30만건, 주소→좌표 일 10만건 무료 쿼터 | 지도 무료 쿼터는 개발자 계정에서 첫 번째 지도 활성 앱에만 적용. 사용할 앱의 쿼터 확인 |
| Toss TEST | 테스트 승인 가상 처리, 금액 차감 없음 | 테스트 키만 사용. 운영 결제는 상점 계약·수수료·정산 조건 별도 확인 |

한도·정책은 바뀔 수 있으므로 실제 설정 시 확인한다. 이번 작업에서는 유료 플랜·추가 쿼터·실제 거래를 설정하지 않는다. [Supabase 가격표](https://supabase.com/pricing), [카카오 쿼터](https://developers.kakao.com/docs/ko/getting-started/quota), [토스 테스트 키](https://docs.tosspayments.com/reference/using-api/api-keys)

## 세팅 담당자에게 전달할 입력

- Supabase: 프로젝트 URL·공개 키·서버 전용 시크릿 제공 위치, Auth 제공자/콜백, 비공개 이미지 버킷, 서비스 테이블 접근 정책. 시크릿은 서버 환경에만 주입한다.
- 카카오: 로그인 제공자 키/클라이언트 시크릿·콜백·동의 항목, 지도 앱의 JS 키/허용 도메인·무료 쿼터 여부, 서버 Local REST 키.
- 토스: 짝이 맞는 테스트 클라이언트/시크릿 키, 성공/실패 콜백, 내부 paymentId 유지, 라이브 전환 여부는 별도 합의.
- 이미지: bandy-images 비공개 버킷·PNG/JPEG/WebP·파일당 5MB 제한은 제안. 다른 회원/동아리 객체 참조와 임의 덮어쓰기 차단.
- 기존 서비스: 입장 후 이동 대상·ID·인증 이어받기 조건.

테이블 원본은 공개 Data API에 그대로 노출하지 않고 백엔드에서 권한·공개 필드를 확인하는 안이다. 서버에서 함수/RPC를 쓴다면 접근 가능한 API 스키마를 별도로 정하고, PUBLIC/anon/authenticated EXECUTE를 기본 허용하지 않도록 전달한다. 실제 정책 적용은 세팅 담당 작업이며 여기서 적용 완료를 주장하지 않는다. [Supabase Data API 보안](https://supabase.com/docs/guides/api/securing-your-api), [Storage 접근 제어](https://supabase.com/docs/guides/storage/security/access-control)

## Claude 검토 반영

Supabase 기준 사전 검토에서 로그인 역할·원본 테이블/서버 함수 접근·hold 만료 전 승인 검사·결제 재시도/복구·문서와 실제 세팅의 구분을 반영했다. Edge Functions로 실행 환경을 확정하거나 pg_cron 작업·DB를 실제 생성하는 제안은 문서 작업 범위에 포함하지 않는다. QR은 GET 재조회 가능성을 고려해 서버 서명 방식의 검토안으로 남겼다.
