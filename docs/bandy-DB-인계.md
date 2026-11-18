# 밴디 DB 인계 문서 (Supabase 연결 담당: 유성님)

작성 2026-11-18 · 브랜치 `claude/bandy-handoff-vhwx0u`

## 0. 이 문서의 범위

- **우리 쪽(기획·앱):** 테이블 설계, 서버 규칙(DB 함수), 앱 화면, 시험. 이 문서와 `supabase/migrations/20261118000000_bandy_app_backend.sql`이 결과물입니다.
- **유성님(DB 연결):** Supabase 프로젝트에 적용·연결, 인증 설정, 운영 설정. 아래 4장 "연결할 때 할 일"이 체크리스트입니다.
- migration SQL은 **설계 명세이자 그대로 실행 가능한 SQL**입니다. 로컬 PostgreSQL에서 Supabase를 흉내 내 시험했고(시험 205개 통과), 실제 Supabase에는 아직 적용하지 않았습니다.

## 1. 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/20261118000000_bandy_app_backend.sql` | 테이블 · 인덱스 · 권한(RLS) · 서버 함수 전체. 두 번 실행해도 안전(`if not exists`, `create or replace`) |
| `supabase/tests/run_backend.sh` · `app_backend_test.sql` | 로컬 PostgreSQL 시험(205개). `local_supabase_shim.sql`이 Supabase의 역할·`auth.users`·`auth.uid()`를 흉내 냄 |
| `supabase/README.md` | 함수 표 · 임시로 정한 값 |
| `src/bandy/backend.ts` | 앱이 부르는 함수 목록(`SupabaseBackend`) — 함수 이름·인자가 여기와 맞아야 함 |
| `docs/bandy-운영전환-체크리스트.md` | 실사용 전 할 일 전체 |
| `supabase/reference/` | **옛 참고안. 실행하지 말 것** |

## 2. 적용 순서

1. Supabase 대시보드 → Database → Extensions에서 **`pg_cron`을 먼저 켬**(켜져 있어야 migration이 "입금 기한 정리"를 10분마다 돌도록 등록함. 나중에 켰다면 migration을 한 번 더 실행).
2. SQL Editor에서 migration 파일 전체 실행. 이미 초안 SQL(유성님 초기 SQL)이 실행된 DB여도 됨 — 없는 칸만 덧붙임.
3. **초안 SQL과 상태값 단어 대조**(아래 3장). 초안의 CHECK 단어가 다르면 함수가 막힘. 노션 원문을 이 세션에서 열 수 없어 대조하지 못했음.
4. 운영자 지정: `update public.profiles set is_admin = true where id = '<사용자 id>';`
5. 앱 환경변수 `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY` 설정 → 앱이 자동으로 Supabase 모드로 동작. (운영 빌드에서 키가 없으면 설정 오류 화면. 시연 배포만 `VITE_BANDY_DEMO=true`)
6. 확인: 가입 → 동아리 등록 → 운영자 승인 → 공연 등록 → 예매 → 입금 확인 → QR → 입장.

## 3. 상태값(CHECK) — 초안 SQL과 대조할 단어

| 테이블.칸 | 값 |
|---|---|
| `profiles.status` | ACTIVE · SUSPENDED · WITHDRAWN |
| `clubs.status` | PENDING · ACTIVE · REJECTED · SUSPENDED |
| `club_memberships.role` / `.status` | OWNER · MANAGER · MEMBER / ACTIVE · PENDING · LEFT |
| `events.status` | DRAFT · PUBLISHED · ENDED · CANCELLED |
| `ticket_types.status` | ACTIVE · INACTIVE |
| `bookings.status` / `.channel` | PENDING_PAYMENT · CONFIRMED · CANCELLED · EXPIRED / ONLINE · ONSITE |
| `payments.status` / `.provider`(검사 없음) | PENDING · SUCCEEDED · FAILED · REFUND_PENDING · REFUNDED / BANK_TRANSFER · ONSITE_CASH · ONSITE_TRANSFER |
| `tickets.status` | ISSUED · CHECKED_IN · CANCELLED |
| `exchange_requests.kind` / `.status` | JOINT_SHOW · PRACTICE · WATCH_SWAP / PENDING · ACCEPTED · REJECTED · CANCELLED |

## 4. 연결할 때 할 일 (유성님)

| 할 일 | 비고 |
|---|---|
| migration 적용 + pg_cron | 2장 |
| Auth → URL Configuration → Redirect URLs에 `https://<도메인>/app/**` | 카카오 로그인 복귀 · 가입 인증 메일 · 비밀번호 재설정이 이 주소로 돌아옴 |
| 카카오 로그인(쓸 경우) | 카카오 개발자 앱, 동의 항목(이메일·닉네임), Supabase Auth 제공자 등록 |
| RLS 재확인 | migration이 `revoke all … from anon, authenticated` 뒤 필요한 select만 다시 엶. Supabase 기본 권한과 겹치지 않는지 대시보드에서 확인 |
| **데이터 조회 방식** | 앱은 지금 13개 테이블을 `select('*')`로 통째로 읽음(`src/bandy/backend.ts` `load()`). 기본 응답 상한(1000행)을 넘으면 **조용히 잘림** → 화면별 조회·페이지 나누기 필요 |
| **이미지 저장** | 포스터·동아리 이미지를 data URL로 `poster_path`·`profile_path` 칸에 저장 중 → Supabase Storage 업로드 + 경로 저장으로 |
| 주소 → 좌표 | 좌표 변환(카카오 Local) 미연결. 좌표가 없으면 지도·거리 정렬에서 빠짐 |
| 백업 · 오류 수집 | 무료 플랜은 시점 복구 없음 / Sentry 등 |
| service role 키 | `expire_overdue_bookings()`만 service_role 전용. 앱에 service key를 넣지 말 것 |

## 5. 앱이 부르는 서버 함수 (권한: 로그인 사용자)

쓰기는 모두 아래 함수로만 합니다(테이블 직접 쓰기 금지). 읽기는 테이블 `select` + RLS.

| 함수 | 누가 | 하는 일 |
|---|---|---|
| `update_profile(p_display_name)` | 본인 | 표시 이름(20자) |
| `create_club(p_input)` · `update_club(p_club_id, p_patch)` | 로그인 / 운영진 | 동아리 등록(승인 대기 1인 1건, 거절된 내 동아리는 같은 이름으로 재신청) · 수정 |
| `set_club_status(p_club_id, p_status)` | 운영자 | 승인 · 거절 · 정지(정지·거절 시 예매자 알림) |
| `request_club_join` · `respond_club_join` · `set_member_role` · `remove_member` · `transfer_ownership` | 로그인 / 운영진 / 회장 | 가입 신청·수락, 운영진 지정, 내보내기·탈퇴, 회장 넘기기 |
| `create_event` · `update_event` · `set_event_status` · `delete_event` | 승인된 동아리 운영진 | 공연 등록·수정·공개·비공개·취소·삭제. 진행 시간 · 사전 예매 마감 · 현장 판매 종료 입력 |
| `create_booking(p_ticket_type_id, p_quantity, p_depositor_name, p_idempotency_key)` | 로그인 | 사전 예매(입금 대기). 같은 요청 키 = 같은 예매, 공연당 입금 대기 1건 · 10장까지 |
| `update_depositor_name` · `mark_deposit_sent` · `cancel_booking` | 예매자 | 입금자명 고치기 · '입금했어요' · 취소(입금 전, 무료는 확정 뒤도) |
| `confirm_deposit` → `'CONFIRMED'`·`'EXPIRED'` · `undo_confirm_deposit` · `confirm_late_deposit` | 운영진 | 입금 확인 · 잘못 누른 확인 되돌리기 · 기한 뒤 들어온 입금 확인 |
| `record_onsite_sale(p_event_id, p_quantity, p_method, p_buyer_name)` · `cancel_onsite_sale` | 운영진 | 현장 판매(현금·이체) → 바로 입장 처리 · 잘못 등록 취소 |
| `issue_ticket_qr` · `revoke_ticket_qrs` | 티켓 주인 | QR 받기(해시만 저장) · 이전 QR 모두 무효 |
| `verify_ticket` · `check_in` · `undo_check_in` | 운영진 | QR 검증 · 입장 처리 · 잘못 누른 입장 되돌리기 |
| `ack_event_change` · `request_refund` · `update_refund_account` · `mark_refunded` | 예매자 / 운영진 | 일정 변경 '유지' · 환불 요청(공연 취소·일정 변경·동아리 정지) · 환불 계좌 고치기 · 환불 완료 |
| `request_exchange` · `respond_exchange` · `cancel_exchange` | 운영진 | 교류 신청·수락·거절·취소·끊기 |
| `my_home_state()` | 누구나 | 앱을 열 때의 '홈 신호'(바로 띄울 창 + 배지 숫자) |
| `mark_notifications_read(p_id)` | 본인 | 알림 읽음 |
| `expire_overdue_bookings()` | service_role · pg_cron | 입금 기한 지난 예매 정리 |

권한 판정용 함수(`is_admin`, `is_club_manager`, `is_event_staff`, `has_exchange_with`, `has_booking_for`, `can_view_profile`)는 RLS 정책에서 씁니다. `_`로 시작하는 함수는 내부 도구입니다.

## 6. 권한(RLS) 요약

- 공개: 승인된 동아리, 공개 중인 공연, 그 티켓 종류(비로그인도 조회).
- 예매자: 내 예매·티켓·결제·알림, **예매한 공연은 비공개·취소·동아리 정지 뒤에도** 조회.
- 운영진(회장·운영진): 자기 동아리 공연의 예매·티켓·결제(입금자명·환불 계좌)·부원·가입 신청자 이름.
- 공연 스태프(`event_staff`): 예매·티켓 조회는 되지만 **결제 정보(입금자명·환불 계좌)는 못 봄**.
- 오픈채팅 링크: 자기 동아리 + 교류가 수락된 동아리만.
- `qr_credentials` · `audit_logs`: 앱에서 직접 조회 안 함.

## 7. 정해 둔 규칙 (팀 확인용 임시값 포함)

- 사전 예매(온라인) 마감: 기본 **공연 전날 24시**, 운영진이 공연마다 입력. 현장 판매: **공연 당일 ~ 시작 후 3시간**(입력 가능) — 11/18 팀 논의
- 입금 기한: 예매 후 3일과 공연 끝 중 빠른 쪽. '입금했어요'를 누른 예매는 +24시간(공연 끝까지)
- 공연 끝 = 시작 + 진행 시간(기본 2시간). QR 유효 = 24시간과 공연 끝 중 긴 쪽(최대 7일), 다시 열어도 이전 QR 유지
- 1회 10장 · 한 사람 한 공연 10장 · 입금자명 20자 · 승인 대기 동아리 1인 1건 · 교류 거절 뒤 7일
- 시간은 모두 `timestamptz`, 화면은 한국 시간(+09:00)으로 보냄

## 8. 확인하지 못한 것

- **노션 초안 원문과의 칸·상태값 대조** — 노션 페이지를 이 세션에서 열 수 없었음. 아래 표의 "노션" 표시는 migration의 `create table`에 적은 칸(노션 문서에 보이던 이름 기준)이라는 뜻.
- 실제 Supabase(PostgREST 응답 형식, Auth 메일·카카오, pg_cron) — 로컬 흉내로만 시험.

## 테이블 정리

노션 「밴디_Supabase_DB_설계초안_SQL기준」의 13개 테이블 + 추가 2개(`club_private`, `exchange_requests`). "출처"가 **노션**이면 초안에 있던 칸, 그 밖은 이 저장소에서 추가한 칸입니다(`alter table … add column if not exists`라 초안 SQL이 이미 실행된 DB에도 덧붙여짐).

| 테이블 | 용도 | 출처 |
|---|---|---|
| `audit_logs` | 감사 기록(입금 확인·입장 등) | 노션 13개 |
| `booking_items` | 예매 항목(티켓 종류·수량) | 노션 13개 |
| `bookings` | 예매(사전 예매·현장 판매) | 노션 13개 |
| `club_memberships` | 동아리 회원·역할(회장·운영진·부원) | 노션 13개 |
| `club_private` | 동아리 오픈채팅 링크(교류 수락된 동아리·자기 동아리만 조회) | 추가 |
| `clubs` | 동아리(운영자 승인 필요) | 노션 13개 |
| `event_staff` | 공연 스태프(지금은 앱에서 추가 기능 없음) | 노션 13개 |
| `events` | 공연 | 노션 13개 |
| `exchange_requests` | 동아리 교류 신청(11/1) | 추가 |
| `notifications` | 앱 안 알림 | 노션 13개 |
| `payments` | 결제(계좌이체 입금자명·현장 결제·환불) | 노션 13개 |
| `profiles` | 회원(가입 시 자동 생성) | 노션 13개 |
| `qr_credentials` | QR 토큰 해시(앱에서 직접 조회 안 함) | 노션 13개 |
| `ticket_types` | 티켓 종류(가격·정원·판매 마감) | 노션 13개 |
| `tickets` | 발급 티켓(입장번호·입장 상태) | 노션 13개 |

### `audit_logs` — 감사 기록(입금 확인·입장 등)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 노션 |
| `actor_user_id` | uuid |  |  | 노션 |
| `event_id` | uuid |  |  | 노션 |
| `action` | text | 필수 |  | 노션 |
| `resource_type` | text | 필수 |  | 노션 |
| `resource_id` | text | 필수 |  | 노션 |
| `request_id` | text |  |  | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |

**고유(UNIQUE):** `(id)`

### `booking_items` — 예매 항목(티켓 종류·수량)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 노션 |
| `booking_id` | uuid | 필수 |  | 노션 |
| `event_id` | uuid | 필수 |  | 노션 |
| `user_id` | uuid | 필수 |  | 노션 |
| `ticket_type_id` | uuid | 필수 |  | 노션 |
| `quantity` | integer | 필수 |  | 노션 |
| `unit_price_krw` | bigint | 필수 |  | 노션 |
| `ticket_type_name` | text | 필수 |  | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |

**검사(CHECK):** `CHECK ((unit_price_krw >= 0))` / `CHECK ((quantity > 0))`

**고유(UNIQUE):** `(id)`

### `bookings` — 예매(사전 예매·현장 판매)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 노션 |
| `user_id` | uuid | 필수 |  | 노션 |
| `event_id` | uuid | 필수 |  | 노션 |
| `status` | text | 필수 | 'PENDING_PAYMENT'::text | 노션 |
| `total_amount_krw` | bigint | 필수 |  | 노션 |
| `expires_at` | timestamp with time zone | 필수 |  | 노션 |
| `confirmed_at` | timestamp with time zone |  |  | 노션 |
| `cancelled_at` | timestamp with time zone |  |  | 노션 |
| `idempotency_key` | text | 필수 |  | 노션 |
| `request_hash` | text | 필수 |  | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |
| `updated_at` | timestamp with time zone | 필수 | now() | 노션 |
| `change_ack_at` | timestamp with time zone |  |  | 추가 · [편의] 예매자가 일정 변경을 확인하고 '유지'를 고른 시각 |
| `channel` | text | 필수 | 'ONLINE'::text | 추가 · 판매 경로: ONLINE(사전 예매) / ONSITE(운영진이 현장 판매 등록. 예매자 계정 없음, 등록한 운영진 이름으로 기록) |

**검사(CHECK):** `CHECK ((status = ANY (ARRAY['PENDING_PAYMENT'::text, 'CONFIRMED'::text, 'CANCELLED'::text, 'EXPIRED'::text])))` / `CHECK ((channel = ANY (ARRAY['ONLINE'::text, 'ONSITE'::text])))` / `CHECK ((expires_at > created_at))` / `CHECK ((total_amount_krw >= 0))`

**고유(UNIQUE):** `(user_id, idempotency_key)` / `(id)`

### `club_memberships` — 동아리 회원·역할(회장·운영진·부원)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 노션 |
| `user_id` | uuid | 필수 |  | 노션 |
| `club_id` | uuid | 필수 |  | 노션 |
| `role` | text | 필수 |  | 노션 |
| `status` | text | 필수 | 'ACTIVE'::text | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |
| `updated_at` | timestamp with time zone | 필수 | now() | 노션 |

**검사(CHECK):** `CHECK ((role = ANY (ARRAY['OWNER'::text, 'MANAGER'::text, 'MEMBER'::text])))` / `CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'PENDING'::text, 'LEFT'::text])))`

**고유(UNIQUE):** `(id)` / `(user_id, club_id)`

### `club_private` — 동아리 오픈채팅 링크(교류 수락된 동아리·자기 동아리만 조회)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `club_id` | uuid | 필수 |  | 추가 |
| `open_chat_url` | text | 필수 | ''::text | 추가 |

**고유(UNIQUE):** `(club_id)`

### `clubs` — 동아리(운영자 승인 필요)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 노션 |
| `name` | text | 필수 |  | 노션 |
| `introduction` | text |  |  | 노션 |
| `city` | text |  |  | 노션 |
| `profile_path` | text |  |  | 노션 |
| `sns_url` | text |  |  | 노션 |
| `status` | text | 필수 | 'PENDING'::text | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |
| `updated_at` | timestamp with time zone | 필수 | now() | 노션 |
| `school` | text | 필수 | ''::text | 추가 · [11/1] 동아리 찾기 프로필 |
| `genre` | text | 필수 | ''::text | 추가 |
| `region` | text | 필수 | ''::text | 추가 |
| `exchange_open` | boolean | 필수 | false | 추가 |
| `created_by` | uuid |  |  | 추가 |

**검사(CHECK):** `CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'REJECTED'::text, 'SUSPENDED'::text])))`

**고유(UNIQUE):** `(id)` / `(name)`

### `event_staff` — 공연 스태프(지금은 앱에서 추가 기능 없음)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 노션 |
| `event_id` | uuid | 필수 |  | 노션 |
| `user_id` | uuid | 필수 |  | 노션 |
| `role` | text | 필수 | 'SCANNER'::text | 노션 |
| `status` | text | 필수 | 'ACTIVE'::text | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |
| `updated_at` | timestamp with time zone | 필수 | now() | 노션 |

**고유(UNIQUE):** `(id)`

### `events` — 공연

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 노션 |
| `club_id` | uuid | 필수 |  | 노션 |
| `created_by` | uuid | 필수 |  | 노션 |
| `title` | text | 필수 |  | 노션 |
| `description` | text |  |  | 노션 |
| `category` | text |  |  | 노션 |
| `starts_at` | timestamp with time zone | 필수 |  | 노션 |
| `ends_at` | timestamp with time zone |  |  | 노션 |
| `admission_starts_at` | timestamp with time zone |  |  | 노션 |
| `admission_ends_at` | timestamp with time zone |  |  | 노션 |
| `timezone` | text | 필수 | 'Asia/Seoul'::text | 노션 |
| `venue_name` | text |  |  | 노션 |
| `address` | text |  |  | 노션 |
| `latitude` | double precision |  |  | 노션 |
| `longitude` | double precision |  |  | 노션 |
| `poster_path` | text |  |  | 노션 |
| `status` | text | 필수 | 'DRAFT'::text | 노션 |
| `published_at` | timestamp with time zone |  |  | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |
| `updated_at` | timestamp with time zone | 필수 | now() | 노션 |
| `bank_name` | text | 필수 | ''::text | 추가 · [11/1] 입금자명 방식 결제 안내 |
| `account_number` | text | 필수 | ''::text | 추가 |
| `account_holder` | text | 필수 | ''::text | 추가 |
| `schedule_changed_at` | timestamp with time zone |  |  | 추가 · [편의] 일시·장소가 바뀐 시각. 이보다 먼저 예매한 사람은 유지 또는 취소·환불 요청을 고를 수 있다 |
| `previous_starts_at` | timestamp with time zone |  |  | 추가 · 바뀌기 전 일시·장소(예매자가 무엇이 바뀌었는지 비교) |
| `previous_venue_name` | text |  |  | 추가 |
| `presale_ends_at` | timestamp with time zone |  |  | 추가 · [11/18 팀 논의] 사전 예매(온라인) 마감과 현장 판매 종료. 비우면 기본값(사전: 공연 전날 24시 / 현장: 공연 시작 + 3시간) |
| `onsite_ends_at` | timestamp with time zone |  |  | 추가 |

**검사(CHECK):** `CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)))` / `CHECK (((ends_at IS NULL) OR (ends_at > starts_at))) NOT VALID` / `CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'ENDED'::text, 'CANCELLED'::text])))` / `CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)))`

**고유(UNIQUE):** `(id)`

### `exchange_requests` — 동아리 교류 신청(11/1)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 추가 |
| `from_club_id` | uuid | 필수 |  | 추가 |
| `to_club_id` | uuid | 필수 |  | 추가 |
| `kind` | text | 필수 |  | 추가 |
| `message` | text | 필수 | ''::text | 추가 |
| `status` | text | 필수 | 'PENDING'::text | 추가 |
| `created_by` | uuid | 필수 |  | 추가 |
| `responded_by` | uuid |  |  | 추가 |
| `responded_at` | timestamp with time zone |  |  | 추가 |
| `created_at` | timestamp with time zone | 필수 | now() | 추가 |

**검사(CHECK):** `CHECK ((from_club_id <> to_club_id))` / `CHECK ((kind = ANY (ARRAY['JOINT_SHOW'::text, 'PRACTICE'::text, 'WATCH_SWAP'::text])))` / `CHECK ((length(message) <= 300))` / `CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'CANCELLED'::text])))`

**고유(UNIQUE):** `(from_club_id, to_club_id) WHERE (status = 'PENDING'::text)` / `(id)`

### `notifications` — 앱 안 알림

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 노션 |
| `user_id` | uuid | 필수 |  | 노션 |
| `event_id` | uuid |  |  | 노션 |
| `type` | text | 필수 |  | 노션 |
| `message` | text | 필수 |  | 노션 |
| `source_key` | text | 필수 |  | 노션 |
| `read_at` | timestamp with time zone |  |  | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |

**고유(UNIQUE):** `(source_key)` / `(id)`

### `payments` — 결제(계좌이체 입금자명·현장 결제·환불)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 노션 |
| `booking_id` | uuid | 필수 |  | 노션 |
| `provider` | text | 필수 |  | 노션 |
| `environment` | text | 필수 | 'TEST'::text | 노션 |
| `provider_order_id` | text | 필수 |  | 노션 |
| `provider_payment_key` | text |  |  | 노션 |
| `status` | text | 필수 | 'PENDING'::text | 노션 |
| `approved_at` | timestamp with time zone |  |  | 노션 |
| `failure_code` | text |  |  | 노션 |
| `reconciliation_required` | boolean | 필수 | false | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |
| `updated_at` | timestamp with time zone | 필수 | now() | 노션 |
| `depositor_name` | text | 필수 | ''::text | 추가 · [11/1] 12월 공연은 카드 결제 없이 계좌이체 + 동아리의 입금 확인 |
| `confirmed_by` | uuid |  |  | 추가 |
| `depositor_notified_at` | timestamp with time zone |  |  | 추가 · [편의] 예매자가 '입금했어요'를 누른 시각. 운영진 입금 확인 목록에서 먼저 보여 준다 |
| `refund_account` | text | 필수 | ''::text | 추가 · [편의] 환불 요청(공연 취소 또는 일정 변경 때): 예매자가 적은 환불 계좌, 요청·완료 시각 |
| `refund_requested_at` | timestamp with time zone |  |  | 추가 |
| `refunded_at` | timestamp with time zone |  |  | 추가 |
| `depositor_notify_count` | integer | 필수 | 0 | 추가 · '입금했어요' 누른 횟수(최대 3) |

**검사(CHECK):** `CHECK ((status = ANY (ARRAY['PENDING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'REFUND_PENDING'::text, 'REFUNDED'::text])))` / `CHECK ((environment = ANY (ARRAY['TEST'::text, 'LIVE'::text])))`

**고유(UNIQUE):** `(provider_order_id)` / `(id)` / `(provider_payment_key)` / `(booking_id) WHERE (status = ANY (ARRAY['SUCCEEDED'::text, 'REFUND_PENDING'::text]))`

### `profiles` — 회원(가입 시 자동 생성)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 |  | 노션 |
| `display_name` | text | 필수 | ''::text | 노션 |
| `profile_path` | text |  |  | 노션 |
| `status` | text | 필수 | 'ACTIVE'::text | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |
| `updated_at` | timestamp with time zone | 필수 | now() | 노션 |
| `is_admin` | boolean | 필수 | false | 추가 · [11/1] 동아리 수동 승인 운영자 |

**검사(CHECK):** `CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'SUSPENDED'::text, 'WITHDRAWN'::text])))`

**고유(UNIQUE):** `(id)`

### `qr_credentials` — QR 토큰 해시(앱에서 직접 조회 안 함)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 노션 |
| `ticket_id` | uuid | 필수 |  | 노션 |
| `token_hash` | text | 필수 |  | 노션 |
| `expires_at` | timestamp with time zone | 필수 |  | 노션 |
| `revoked_at` | timestamp with time zone |  |  | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |

**검사(CHECK):** `CHECK ((expires_at > created_at))`

**고유(UNIQUE):** `(id)` / `(token_hash)`

### `ticket_types` — 티켓 종류(가격·정원·판매 마감)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 노션 |
| `event_id` | uuid | 필수 |  | 노션 |
| `name` | text | 필수 |  | 노션 |
| `price_krw` | bigint | 필수 |  | 노션 |
| `capacity` | integer | 필수 |  | 노션 |
| `reserved_quantity` | integer | 필수 | 0 | 노션 |
| `sold_quantity` | integer | 필수 | 0 | 노션 |
| `sales_starts_at` | timestamp with time zone | 필수 | now() | 노션 |
| `sales_ends_at` | timestamp with time zone | 필수 |  | 노션 |
| `status` | text | 필수 | 'ACTIVE'::text | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |
| `updated_at` | timestamp with time zone | 필수 | now() | 노션 |

**검사(CHECK):** `CHECK ((reserved_quantity >= 0))` / `CHECK ((capacity > 0))` / `CHECK ((price_krw >= 0))` / `CHECK (((reserved_quantity + sold_quantity) <= capacity))` / `CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text])))` / `CHECK ((sold_quantity >= 0))`

**고유(UNIQUE):** `(id, event_id)` / `(id)`

### `tickets` — 발급 티켓(입장번호·입장 상태)

| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |
|---|---|---|---|---|
| `id` | uuid | 필수 | gen_random_uuid() | 노션 |
| `booking_id` | uuid | 필수 |  | 노션 |
| `booking_item_id` | uuid | 필수 |  | 노션 |
| `user_id` | uuid | 필수 |  | 노션 |
| `event_id` | uuid | 필수 |  | 노션 |
| `issue_sequence` | integer | 필수 |  | 노션 |
| `entry_number` | integer |  |  | 노션 |
| `status` | text | 필수 | 'ISSUED'::text | 노션 |
| `seat_info` | text |  |  | 노션 |
| `issued_at` | timestamp with time zone | 필수 | now() | 노션 |
| `ticket_received_at` | timestamp with time zone |  |  | 노션 |
| `checked_in_at` | timestamp with time zone |  |  | 노션 |
| `checked_in_by` | uuid |  |  | 노션 |
| `created_at` | timestamp with time zone | 필수 | now() | 노션 |
| `updated_at` | timestamp with time zone | 필수 | now() | 노션 |

**검사(CHECK):** `CHECK ((entry_number > 0))` / `CHECK ((issue_sequence > 0))` / `CHECK ((status = ANY (ARRAY['ISSUED'::text, 'CHECKED_IN'::text, 'CANCELLED'::text])))` / `CHECK (((checked_in_at IS NULL) = (checked_in_by IS NULL)))` / `CHECK (((status <> 'CHECKED_IN'::text) OR (checked_in_at IS NOT NULL)))`

**고유(UNIQUE):** `(event_id, entry_number) WHERE (entry_number IS NOT NULL)` / `(id)` / `(booking_item_id, issue_sequence)`
