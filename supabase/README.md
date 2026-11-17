# Bandy Supabase 백엔드

| 폴더 | 내용 |
|---|---|
| `migrations/20261118000000_bandy_app_backend.sql` | **실행용.** 앱(`/app`)이 쓰는 테이블 · 권한(RLS) · DB 함수 |
| `reference/prototype_schema_reference.sql` | 이전 참고안. **실행하지 마세요** (같은 이름의 테이블을 새로 만듭니다) |
| `tests/` | 로컬 PostgreSQL 검증 스크립트 |

## 기준

- 테이블과 컬럼 이름은 노션 「밴디_Supabase_DB_설계초안_SQL기준」의 13개 테이블(`202610140001_bandy_initial_schema.sql`)을 따릅니다.
- 그 위에 11/1 회의 결정을 더했습니다: 동아리 찾기 필드(학교·장르·지역·교류 열림), 교류 신청(`exchange_requests`), 오픈채팅 링크(`club_private`), 계좌이체 결제(입금자명·입금 확인한 운영진), 운영자 표시(`profiles.is_admin`).
- 모든 문장이 `if not exists` / `create or replace` 라서 **빈 DB에도, 팀 초기 SQL을 이미 실행한 DB에도** 실행할 수 있고, 두 번 실행해도 됩니다.
- ⚠️ 팀 초기 SQL 원문이 이 저장소에 없어 노션 문서에 보인 이름으로 다시 적었습니다. 초기 SQL의 상태값(CHECK) 단어가 다르면 함수가 막힐 수 있으니 **bandy-dev에 적용하기 전에 원문과 대조**해 주세요.

## 적용

1. Supabase 대시보드 → SQL Editor에 `migrations/20261118000000_bandy_app_backend.sql` 전체를 붙여 실행 (CLI를 쓰면 `supabase db push`).
2. 운영자(동아리 승인 담당) 지정:
   ```sql
   update public.profiles set is_admin = true where id = (select id from auth.users where email = '운영자 이메일');
   ```
3. 앱 환경변수 `.env`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 입력 → `npm run dev` → `/app`.
4. 카카오 로그인은 Supabase 대시보드 → Authentication → Providers → Kakao 설정 후 동작합니다. 그 전에는 이메일 가입·로그인으로 쓰면 됩니다.

## 앱이 부르는 DB 함수

쓰기는 전부 아래 함수로만 합니다(테이블 직접 쓰기 금지). 읽기는 테이블 `select` + RLS.

| 함수 | 누가 | 하는 일 |
|---|---|---|
| `update_profile(p_display_name)` | 본인 | 표시 이름 수정 |
| `create_club(p_input)` · `update_club(p_club_id, p_patch)` | 로그인 / 동아리 운영진 | 동아리 등록(승인 대기, 등록자 OWNER) · 수정 |
| `set_club_status(p_club_id, p_status)` | 운영자 | 승인(ACTIVE) / 거절(REJECTED) |
| `create_event` · `update_event` · `set_event_status` · `delete_event` | 동아리 운영진 | 공연 등록·수정·공개·삭제. 예매가 있으면 가격 변경·삭제 불가, 예매 수량보다 정원 축소 불가 |
| `create_booking(p_ticket_type_id, p_quantity, p_depositor_name, p_idempotency_key)` | 로그인 | 입금 대기 예매. 서버가 금액 계산, 정원 확인, 같은 요청 키는 같은 예매 반환, 기한 지난 예매는 자동 만료 |
| `confirm_deposit(p_booking_id)` | 주최 동아리 | 입금 확인 → 예매 확정 + 수량만큼 티켓(입장번호) 발급. 두 번 눌러도 안전 |
| `cancel_booking(p_booking_id)` | 본인 / 주최 동아리 | 입금 전 예매 취소, 자리 반환 |
| `issue_ticket_qr(p_ticket_id)` | 티켓 주인 | QR 토큰 새로 발급(이전 QR 폐기, DB에는 해시만) |
| `verify_ticket(p_event_id, p_token)` | 공연 운영진 | 검증만: valid / already_checked_in / invalid + 관객 정보 |
| `check_in(p_event_id, p_token)` | 공연 운영진 | 입장 처리. 동시에 여러 번 스캔해도 한 번만 바뀜 |
| `request_exchange` · `respond_exchange` · `cancel_exchange` | 동아리 운영진 | 교류 신청 · 수락/거절 · 취소. 수락되면 서로 오픈채팅 링크 공개 |
| `mark_notifications_read(p_id)` | 본인 | 알림 읽음(전체 또는 하나) |

## 검증

```bash
PGHOST=<소켓 경로> PGPORT=<포트> PGUSER=postgres supabase/tests/run_backend.sh
```

`tests/local_supabase_shim.sql`이 Supabase의 역할·`auth.users`·`auth.uid()`를 흉내 내고, `tests/app_backend_test.sql`이 59개 항목(권한 차단, 정원, 중복 요청, 만료, 입금 확인, QR 재발급·검증·입장, 교류, 수정·삭제 제한)을 확인합니다.

이 밖에 개발 중 확인한 것:
- 마지막 1석에 두 사람이 동시에 예매 → 한 명만 성공
- 같은 QR을 동시에 3번 입장 처리 → 1번만 입장, 감사 기록 1건
- 앱을 Supabase 모드로 빌드해 브라우저에서 가입 → 동아리 등록 → 승인 → 공연 등록·수정 → 예매·취소 → 입금 확인 → QR 발급 → 검증 → 입장 → 교류 신청·수락까지 진행 (Supabase 서버 대신 같은 API를 흉내 낸 테스트 서버 + 이 migration을 적용한 로컬 PostgreSQL)

**아직 확인 못 한 것:** 실제 Supabase 프로젝트(bandy-dev)에 적용, 실제 Supabase Auth(메일 인증 설정, 카카오 제공자), 실제 PostgREST의 응답 형식 차이.

## 임시로 정한 값 (팀 결정 필요)

- 입금 대기 3일, 1회 최대 10장, 무료 공연은 즉시 확정, 입금 확인 후 취소·환불 없음
- QR 유효시간 24시간(티켓을 열 때마다 새로 발급)
- `payments`를 예매자 본인·주최 운영진이 직접 읽을 수 있게 함(노션 초안은 앱 직접 조회 금지) — 입금자명·주문번호 표시용
- 공연·동아리 이미지는 지금 data URL로 `poster_path`/`profile_path`에 저장 → Supabase Storage 업로드로 바꿔야 함
- 주소 → 좌표 변환(카카오 Local) 미연결: 좌표가 없는 공연은 지도·거리 정렬에서 빠짐
