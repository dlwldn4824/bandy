# Bandy Supabase 프로토타입 DB

2026-11-01 회의 결정 기준의 프로토타입 스키마입니다. 10/7 설계(`docs/db-design.md`, `backend-docs` 브랜치)에서 아래를 바꿨습니다.

| 10/7 설계 | 이 스키마 |
|---|---|
| 토스 카드 결제 (payments, P01~P03) | 입금자명 + 주최 동아리의 **입금 확인** (`confirm_booking`) |
| 동아리 찾기 보류 | 동아리 프로필(학교·장르·지역·인스타·교류 열림) + 운영자 수동 승인 |
| 교류 없음 | 교류 신청 → 수락/거절 → 수락된 동아리끼리 오픈채팅 링크 공개 |
| QR: 서버 HMAC 서명 | 티켓마다 추측 불가능한 `qr_token`(UUID). 본인·주최 동아리만 조회 |

## 적용

Supabase 대시보드 → SQL Editor에 `migrations/20261117000000_prototype_schema.sql` 전체를 붙여 실행합니다. (Supabase CLI를 쓰면 `supabase db push`)

운영자 지정은 SQL Editor에서 한 번 실행합니다:

```sql
update public.profiles set is_admin = true where id = '<운영자 auth user id>';
```

## 테이블

| 테이블 | 내용 |
|---|---|
| `profiles` | 가입 시 자동 생성. 표시명, 운영자 여부 |
| `clubs` | 동아리 공개 프로필, 인증 상태(pending/approved/rejected) |
| `club_private` | 오픈채팅 링크 (회원 + 교류 수락된 동아리만 조회) |
| `club_members` | 동아리 운영진 (owner/manager) |
| `events` | 공연. draft → published → closed |
| `bookings` | 예매. pending(입금 대기) → confirmed / cancelled. 금액은 서버가 계산 |
| `tickets` | 입금 확인 때 수량만큼 발급. 입장번호·QR·입장 시각 |
| `exchange_requests` | 교류 신청 (합동 공연 / 연습 교류 / 관람 교환) |

## 화면에서 부르는 함수 (RPC)

| 함수 | 누가 | 하는 일 |
|---|---|---|
| `create_club(name, school, genre, region, instagram, introduction, open_chat_url)` | 로그인 사용자 | 동아리 등록(승인 대기) + 등록자를 owner로 |
| `set_club_verification(club_id, status)` | 운영자 | 동아리 승인/거절 |
| `create_booking(event_id, depositor_name, quantity)` | 로그인 관객 | 입금 대기 예매. 정원 확인 |
| `confirm_booking(booking_id)` | 주최 동아리 | 입금 확인 → 티켓 발급 (두 번 눌러도 안전) |
| `cancel_booking(booking_id)` | 본인 / 주최 동아리 | 입금 전 예매 취소 |
| `check_in(event_id, qr_token)` | 주최 동아리 | `valid` / `already_checked_in` / `invalid` |
| `request_exchange(from_club, to_club, kind, message)` | 신청 동아리 회원 | 교류 신청 |
| `respond_exchange(request_id, accept)` | 받은 동아리 회원 | 수락/거절 |
| `cancel_exchange(request_id)` | 신청 동아리 회원 | 처리 전 신청 취소 |
| `feed_events()` | 누구나 | 공개 공연. 교류 연결된 동아리 공연이 위로 |

조회(동아리 찾기, 공연 목록, 내 티켓, 예매자 명단)는 테이블을 직접 `select` 합니다. 행 수준 보안(RLS)이 본인·주최 동아리·공개 범위만 돌려줍니다. 예매·티켓·입장·인증 상태는 테이블에 직접 쓸 수 없고 위 함수로만 바뀝니다.

## 로컬 검증

```bash
PGHOST=<소켓 경로> PGPORT=<포트> PGUSER=postgres supabase/tests/run_local.sh
```

`tests/local_supabase_shim.sql`이 Supabase의 역할·`auth.users`·`auth.uid()`를 흉내 내고, `tests/prototype_test.sql`이 권한과 흐름 53개 항목을 확인합니다. 실제 Supabase 프로젝트에는 아직 적용하지 않았습니다.

## 아직 정하지 않은 것 (프로토타입 기본값)

- 예매 1건 최대 10장, 입금 대기 예매는 시간이 지나도 자동 취소되지 않음(정원을 계속 차지)
- 입금 확인 후 취소·환불 없음
- 동아리 운영진 추가 기능 없음(등록자 1명만 owner)
- 카카오 로그인은 Supabase Auth 제공자 설정 후 연결. 그 전에는 이메일 로그인으로 시험
- 동시 예매·동시 입금 확인은 공연 행 잠금으로 막도록 설계했지만 동시성 부하 테스트는 하지 않음
