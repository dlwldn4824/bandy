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
| `set_club_status(p_club_id, p_status)` | 운영자 | 승인(ACTIVE) / 거절(REJECTED) / 정지(SUSPENDED). 정지되면 공연 등록·수정·공개·입금 확인이 멈추고, 이미 발급된 티켓의 입장 처리와 입금 전 취소는 계속 됨 |
| `create_event` · `update_event` · `set_event_status` · `delete_event` | 승인된 동아리 운영진 | 공연 등록·수정·공개·취소·삭제. 공개 조건(장소, 앞으로의 일시, 유료면 계좌)은 등록·공개 전환·공개 중 수정에 똑같이 적용. 예매가 있으면 가격 변경·삭제 불가, 예매 수량보다 정원 축소 불가. `update_event`는 보내지 않은 칸을 그대로 둠. 공연을 취소(CANCELLED)하면 입금 대기 예매는 취소되고 예매자 모두에게 알림, 다시 열 수 없음 |
| `create_booking(p_ticket_type_id, p_quantity, p_depositor_name, p_idempotency_key)` | 로그인(정지 회원 제외) | 입금 대기 예매. 서버가 금액 계산, 정원 확인, 판매 기간(공연 시작 전까지) 확인, 입금자명 20자까지, 같은 요청 키는 동시에 와도 같은 예매 반환 |
| `confirm_deposit(p_booking_id)` → `'CONFIRMED'`·`'EXPIRED'` | 주최 동아리 운영진(OWNER·MANAGER) | 입금 확인 → 예매 확정 + 수량만큼 티켓(입장번호) 발급. 두 번 눌러도 안전. 입금 기한이 지난 예매는 확정하지 않고 그 자리에서 만료(자리 반환·알림)한 뒤 `'EXPIRED'`를 돌려줌 |
| `cancel_booking(p_booking_id)` | 본인 / 주최 동아리 운영진 | 입금 전 예매 취소, 자리 반환. 주최 쪽이 취소하면 예매자에게 알림 |
| `expire_overdue_bookings()` | 서버(service_role, pg_cron) | 입금 기한이 지난 예매를 한꺼번에 만료 + 알림. pg_cron 확장이 켜져 있으면 migration이 10분마다 실행하도록 등록함 |
| `issue_ticket_qr(p_ticket_id)` | 티켓 주인 | QR 토큰 새로 발급(이전 QR 폐기, DB에는 해시만) |
| `verify_ticket(p_event_id, p_token)` | 공연 운영진 | 검증만: valid / already_checked_in / invalid + 관객 정보. 취소된 공연의 QR은 invalid, 토큰 앞뒤 공백·줄바꿈 무시 |
| `check_in(p_event_id, p_token)` | 공연 운영진 | 입장 처리. 동시에 여러 번 스캔해도 한 번만 바뀜 |
| `request_exchange` · `respond_exchange` · `cancel_exchange` | 동아리 운영진 | 교류 신청 · 수락/거절 · 취소. 수락되면 서로 오픈채팅 링크 공개. 상대가 보낸 신청이 대기 중이거나 이미 교류 중이면 새 신청 거부. 알림은 운영진(OWNER·MANAGER)에게만 |
| `request_club_join(p_club_id)` · `respond_club_join(p_membership_id, p_accept)` | 로그인 / 동아리 운영진 | 부원 가입 신청 · 수락/거절 |
| `set_member_role(p_membership_id, p_role)` · `remove_member(p_membership_id)` | 회장(OWNER) / 회장·본인 | 운영진(MANAGER) 지정·해제, 내보내기·탈퇴. 회장은 바꾸거나 내보낼 수 없음 |
| `mark_notifications_read(p_id)` | 본인 | 알림 읽음(전체 또는 하나) |
| `my_home_state()` | 누구나(비로그인은 빈 값) | 앱을 열 때 부르는 '홈 신호'. `prompt`(TICKET_NOW: 3시간 안 공연 티켓 → QR 바로 열기 / STAFF_TODAY: 24시간 안 내 동아리 공연 → 입장 관리 / PAYMENT_DUE: 기한 24시간 안 입금 대기 → 계좌 안내) + 다음 티켓, 오늘 운영 공연, 입금 대기 목록, 안 읽은 알림·가입 신청·받은 교류 신청 수 |
| `mark_deposit_sent(p_booking_id)` | 예매자 본인 | '입금했어요' → 주최 운영진 알림, 입금 확인 목록 맨 위로. 10분에 한 번 |
| `ack_event_change(p_booking_id)` · `request_refund(p_booking_id, p_refund_account)` | 예매자 본인 | 일정·장소 변경 뒤 '유지' / 확정 예매의 취소·환불 요청(공연 취소 또는 예매 뒤 일정 변경일 때만, 공연 시작 전, 입장 전). 예매 취소·티켓 무효·자리 반환, 결제는 환불 대기 |
| `mark_refunded(p_booking_id)` | 주최 운영진 | 계좌로 돌려준 뒤 '환불 완료' → 예매자 알림 |

## 검증

```bash
PGHOST=<소켓 경로> PGPORT=<포트> PGUSER=postgres supabase/tests/run_backend.sh
```

`tests/local_supabase_shim.sql`이 Supabase의 역할·`auth.users`·`auth.uid()`를 흉내 내고, `tests/app_backend_test.sql`이 144개 항목(권한 차단, 정원, 중복 요청, 만료, 입금 확인, QR 재발급·검증·입장, 교류, 수정·삭제 제한 + 2026-11-17 독립 검토 반영분: 비공개·취소 공연의 예매자 조회, 지난 공연 예매·공개 차단, 공개 조건, 입력 형식 오류 한국어 안내, 입금 기한·알림, 공연 취소, 링크 형식, 등록 남용, 교류 중복, 부원·운영진, 동아리 정지)을 확인합니다.

이 밖에 개발 중 확인한 것:
- 마지막 1석에 두 사람이 동시에 예매 → 한 명만 성공
- 같은 QR을 동시에 3번 입장 처리 → 1번만 입장, 감사 기록 1건
- 같은 요청 키로 동시에 3번 예매 × 30회 → 오류 0, 예매 1건
- 같은 공연에 공연 수정과 입금 확인 40쌍 동시 실행 → 교착 0, 입장번호 중복 0
- 앱을 Supabase 모드로 빌드해 브라우저에서 가입 → 동아리 등록 → 승인 → 공연 등록·수정 → 예매·취소 → 입금 확인 → QR 발급 → 검증 → 입장 → 교류 신청·수락까지 진행 (Supabase 서버 대신 같은 API를 흉내 낸 테스트 서버 + 이 migration을 적용한 로컬 PostgreSQL)

**아직 확인 못 한 것:** 실제 Supabase 프로젝트(bandy-dev)에 적용, 실제 Supabase Auth(메일 인증 설정, 카카오 제공자), 실제 PostgREST의 응답 형식 차이.

## 임시로 정한 값 (팀 결정 필요)

- 입금 대기 3일, 1회 최대 10장, 무료 공연은 즉시 확정, 입금 확인 후 취소·환불 없음
- QR 유효시간: 24시간과 '공연 끝 시각' 중 긴 쪽(최대 7일), 티켓을 열 때마다 새로 발급
- `payments`를 예매자 본인·주최 운영진이 직접 읽을 수 있게 함(노션 초안은 앱 직접 조회 금지) — 입금자명·주문번호 표시용
- 공연·동아리 이미지는 지금 data URL로 `poster_path`/`profile_path`에 저장 → Supabase Storage 업로드로 바꿔야 함
- 주소 → 좌표 변환(카카오 Local) 미연결: 좌표가 없는 공연은 지도·거리 정렬에서 빠짐
- 승인 대기 중인 동아리 등록은 한 사람당 1건
- 입금 기한은 '예매 후 3일'과 '공연 시작' 중 빠른 쪽. 공연을 앞당기면 기존 입금 대기 예매의 기한도 새 시작으로 당겨지고, 예매자에게 일정·장소 변경 알림
- 기한 안에 '입금했어요'를 누른 예매는 기한이 지나도 자동 만료하지 않음(운영진이 확인 또는 취소). 그 뒤 본인이 취소하면 운영진에게 환불 확인 알림
- 공연 진행 시간: 주최 측이 입력(10분~24시간, 기본 2시간) → `events.ends_at`. 끝날 때까지 '진행 중'으로 보고 티켓 QR 열람·홈 '바로 보기' 유지. 시작을 옮기면 진행 시간은 그대로
- 일정·장소가 바뀌면 그 전 예매자는 '유지' 또는 '취소·환불 요청'을 고름(홈 신호 EVENT_CHANGED). 그 밖의 사유로 확정 예매를 환불하는 정책은 팀 결정 전
- [논의 중] 계좌이체 온라인 예매 마감 시각(지금은 공연 시작까지)
- QR 유효시간: 24시간과 '공연 끝 시각' 중 긴 쪽(최대 7일)
- 동아리 정지 시: 공연 등록·수정·공개·입금 확인·동아리 정보 수정은 멈춤. 비공개·공연 취소·삭제, 이미 발급된 티켓 입장은 됨
- 회원 정지 시: 예매·동아리 등록·가입·교류 신청과 운영진 업무(입금 확인·입장 처리 등)는 막힘. 이미 산 티켓 QR, 본인 입금 전 예매 취소, 이름 수정은 됨
- 공연 취소 시 입금 완료분 환불은 앱 밖에서 동아리가 직접(알림 문구로 안내)
- 입금 기한 만료를 제때 하려면 Supabase에서 pg_cron 확장을 켠 뒤 migration을 실행(또는 다시 실행)해야 함. 켜지 않으면 기한 지난 예매는 그 티켓 종류에 새 예매·입금 확인·취소가 있을 때 정리되고, 그 전까지는 잔여석이 실제보다 적게 보이고 만료 알림도 늦게 감
- 운영진(MANAGER)도 '동아리 회원'이라 하단 가운데 버튼이 '+ 공연 등록'으로 바뀜(구조도의 회원 유형별 교체). 본인 티켓은 마이페이지 → 내 티켓(2탭). 팀 재확인 필요
- 예매자·가입 신청자 프로필을 보는 운영진에게 그 사람의 `is_admin` 값도 보임(낮음, 정리 필요)
- 앱은 테이블을 통째로 읽음 → Supabase 기본 응답 상한(보통 1000행)을 넘으면 목록이 잘릴 수 있음. 12월 시범 규모에서는 문제없지만 커지면 화면별 조회로 바꿔야 함
