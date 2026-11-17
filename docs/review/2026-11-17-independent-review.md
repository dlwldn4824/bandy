# 밴디(BANDY) `/app` 독립 검토 결과

- 대상: 저장소 `/home/user/bandy`, 브랜치 `claude/sleepy-cannon-i0t622` (HEAD `aff8591`)
- 범위: `src/bandy/**`, `supabase/migrations/20261118000000_bandy_app_backend.sql`, `supabase/tests/*`
- 검토일: 2026-11-17
- 표기: **[확인]** = 이번 검토에서 코드 실행·DB 쿼리·브라우저로 직접 재현함. **[코드]** = 코드를 따라가 확인했으나 실행하지는 않음. **[추측]** = 근거는 있으나 확인하지 못함(테스트 계획에서 확인 대상).
- 파일:줄 표기에서 `mig:` 는 `supabase/migrations/20261118000000_bandy_app_backend.sql` 이다.

## 0. 요약

| 심각도 | 건수 | 대표 항목 |
|---|---|---|
| 높음 | 4 | 공연 비공개 시 관객 '내 티켓' 오류 화면 / 입금 기한 지난 예매가 자리를 영구히 잡음 / 팀 초기 SQL과 충돌 가능한 migration·프로필 누락 / 변경마다 13개 테이블 전체(이미지 data URL 포함) 재조회 |
| 중간 | 12 | 영어 원문 오류 노출, 상태 전이 검사 없음, 판매 기간 미검사, 잠금 순서 역전(교착), 운영진·스태프 추가 수단 없음, URL 검증 없음, 재조회 실패를 실패로 표시, 행마다 도는 RLS 함수, 예금주 고정, 데모/Supabase 동작 차이, QR 열 때마다 재발급, `npm run build` 실패 |
| 낮음 | 15 | 교류 역방향 중복, 동시 요청 시 원문 unique 오류, 공개 컬럼 과다, 프런트 정렬 비용 등 |

기존 DB 테스트(`supabase/tests/run_backend.sh`)는 이 환경에서 **59개 항목 모두 통과** [확인]. 아래 발견은 대부분 기존 테스트가 다루지 않는 경로다.

검토에 쓴 자료: 11/1 회의 PDF 5~15·19~21쪽, 노션 DB 설계 캡처(본문·표 일부), 10/7 데이터 흐름도, `origin/backend-docs:docs/*`, 피그마 `SsLBCdNVWE2YbRmWdDPILn`의 23:1505(정보구조도)·23:1890(관객 flow)·23:2144(운영자 flow)·23:2340(와이어프레임). 피그마 도구로 직접 확인했다.

---

## 1. 기획 대비 이탈

### (a) 기획에 있는데 빠진 것

| # | 항목 | 기획 근거 | 구현 상태 / 근거 |
|---|---|---|---|
| a1 | 로그인 화면의 **회원 유형 선택(개인/동아리)** | 피그마 23:1505 ①(회원 유형 분기, userType), 23:2340 로그인 와이어프레임(개인 회원/동아리 회원 탭), 10/7 `development-plan.md` A | 데모 모드에만 있음. Supabase 모드 로그인은 이메일·카카오만 있고 유형 선택 없음 (`pages/MyPage.tsx:266-288`). 동아리 여부는 소속(club_memberships)으로만 판단 |
| a2 | **비밀번호 찾기** | 23:2340 로그인 와이어프레임 하단 | 없음 (`MyPage.tsx:273-288`) |
| a3 | 입장 임박 티켓이 1개면 **바로 QR** | 23:1890 '입장 임박 티켓 1개? (제안)' | 항상 목록부터 보임 (`pages/TicketsPage.tsx:85-96`) |
| a4 | '이후 공연 티켓' → **공연 정보 확인**, '사용 완료' → **기존 서비스** | 23:1890, 23:1505 내 티켓 하위 | 이후 공연도 QR 모달을 염. 사용 완료 티켓은 비활성 버튼, 기존 서비스 링크는 '입장 예정' 섹션에 있음 (`TicketsPage.tsx:50, 88`) |
| a5 | 동아리 **초기 데이터 20~30곳 직접 등록** | 11/1 p9 '초기 데이터는 직접 등록' | Supabase용 시드·일괄 등록 수단 없음. `create_club`은 로그인 사용자를 OWNER로만 만들 수 있음 (`mig:415-430`). 운영자가 대신 등록 후 소유권을 넘기는 절차 없음 |
| a6 | **운영진 추가·역할 변경, 공연 스태프 지정** | 노션 6장 '동아리 역할·승인: 가입·대표·관리자 승인 및 역할 변경 절차 구현'(4113369a), 10/7 계획 A '공연진 관리 권한 부여 [미정]' | `club_memberships`·`event_staff`에 쓰는 함수가 없음. 결과적으로 동아리당 OWNER 1명만 입금 확인·QR 스캔 가능 → 2장 중간 M5 |
| a7 | **사진 저장(Supabase Storage)** | 11/1 p13 'Supabase: DB·카카오 로그인·사진 저장', 노션 6장 'Storage 미포함 → 후속', 10/7 `data-flow.md:16` | data URL을 `poster_path`/`profile_path`에 그대로 저장 (`components.tsx:73-91`). README에도 '바꿔야 함'으로 적힘 → 높음 H4 |
| a8 | **주소→좌표(카카오 Local)** | 23:1505 지도(lat·lng·radius), 10/7 `data-flow.md:53` | 미연결. Supabase 모드에서는 좌표가 항상 null이라 지도·'가까운 순'이 비어 있음(데모는 임의 좌표) (`mig:497-502`, `repo.ts:203`) |
| a9 | **NFC 네트워킹 '공연 때 테스트'**, 'NFC 찍은 후' 화면 | 11/1 p8(4순위 '공연 때 테스트'), p12, p15(그려야 할 화면) | 없음. 피그마 23:1505는 '이후 추가'라 충돌(c4) |
| a10 | **현장 코드 입장** | 11/1 p7 '된 거: QR·현장 코드 입장' | 운영진이 QR 문자열을 직접 입력하는 칸만 있음 (`pages/ScanPage.tsx:200-203`). 관객이 현장 코드를 넣는 흐름은 없음(기존 앱 기능 유지 여부 확인 필요) |
| a11 | 음료·굿즈 사전 구매 | 11/1 p7 '된 거' | `/app`에 없음. 5개 우선순위(p8)에 없으므로 범위 밖으로 본 것으로 보임 → 팀 확인 |
| a12 | 웹앱(**PWA**) | 11/1 p13 | manifest·서비스워커 없음 (`index.html`, `public/`) |
| a13 | **판매 기간과 공연 시각의 관계**, **잘못된 상태 전이 차단** | 노션 4장 '아직 보장하지 않는 것'(ea8f173f), 5357af49 'CONFIRMED→PENDING 같은 잘못된 전이 차단 규칙은 없다 → 서버/DB 함수에서 제어' | DB 함수에서도 검사하지 않음 → 중간 M2·M3 |
| a14 | **사용 완료 티켓 화면용 공연 조회 보완** | 노션 5장(844a6a07) 'ENDED/CANCELLED 공연 상세는 직접 조회 불가하므로 보완해야' | ENDED만 공개에 추가, DRAFT·CANCELLED는 여전히 안 보임 → 높음 H1 |
| a15 | 공개 필수 항목(장소·주소·종료·입장 시간·공개 시각) | 노션 6장(076eeaf2/158ff708) 'PUBLISHED에서 장소·주소·종료·입장 시간·공개 시각 필수' | 장소만 필수 (`mig:495, 547`) → 팀 SQL과 충돌 가능 H3 |

### (b) 기획에 없는데 들어간 것

| # | 항목 | 근거 | 비고 |
|---|---|---|---|
| b1 | 무료 공연 즉시 확정, 입금 대기 3일, 1회 10장, QR 24시간 | `mig:572, 608-609, 672`, `repo.ts:12-13` | README에 [미정] 임시값으로 명시. 팀 결정 필요 |
| b2 | 동아리 찾기의 **'교류 받는 곳만' 필터** | `ClubsPage.tsx:287-300` | 11/1 p9는 '장르·지역 필터만' |
| b3 | **밴디 운영자 승인 화면**(마이페이지) + `profiles.is_admin` | `MyPage.tsx:343-359`, `mig:23` | 11/1 p9 '수동 승인?' 질문에서 나온 것. 피그마 구조도에는 없음 |
| b4 | 새 테이블·컬럼: `club_private`, `exchange_requests`, `payments.depositor_name/confirmed_by`, `clubs.school/genre/region/exchange_open/created_by`, `events.bank_name/account_number/account_holder` | `mig:23-48, 83-86, 151-153, 221-235` | 노션 13개 테이블에 없는 11/1 추가분. 팀 DB 담당 확인 필요 |
| b5 | 공연 분류 칩(공연/해커톤/학술회/네트워킹)·정렬 4종 | `pages/Discover.tsx:9, 79-101` | 피그마는 '정렬·선택'만. 분류는 11/1 p15 '해커톤·학술회로 넓혀도'에서 온 것으로 보임 |
| b6 | 입장 관리의 **QR 문자열 직접 입력** | `ScanPage.tsx:200` | 피그마 운영자 flow에는 카메라 스캔만 |
| b7 | 홈의 동아리 배지 링크, 알림 설정 저장(localStorage) | `Discover.tsx:42`, `MyPage.tsx:292-330` | 알림 설정은 구조도에 있으나 DB에 저장하지 않음 |

### (c) 기획끼리 충돌해 한쪽을 고른 것

| # | 충돌 | 구현의 선택 | 영향 |
|---|---|---|---|
| c1 | 하단 탭: 11/1 p7 '홈/지도/**티켓**/교류/마이' ↔ 피그마 23:1505·23:2340 '홈/지도·캘린더/**중앙(개인=내 티켓, 동아리=+공연 등록)**/동아리 찾기/마이' | 피그마 (`components.tsx:195-229`) | 동아리 운영진은 하단 바에서 내 티켓으로 갈 수 없음(마이페이지 링크로만). 10/7 계획·데이터 흐름도는 '동아리 회원도 본인 티켓 이용 가능' |
| c2 | 동아리 찾기: 피그마 '보류' ↔ 11/1 '12월 전 필수' | 11/1 | 적절 |
| c3 | 결제: 10/7 토스 TEST 승인 ↔ 11/1 입금자명 + 입금 확인 | 11/1 | 적절. 10/7 결제 복구 설계는 미사용 |
| c4 | NFC: 11/1 '공연 때 테스트' ↔ 피그마 '이후 추가' | 피그마(미구현) | 12월 실증에서 NFC를 시험할지 팀 확인 필요 |
| c5 | `payments` 조회: 노션 5장 '일반 앱에서 직접 조회 불가' ↔ 입금자명 표시 필요 | 본인·주최 운영진 직접 조회 허용 (`mig:344-347`) | 노션 담당자 확인 필요 |
| c6 | QR: 10/7 `data-flow.md:124` 'ticketId·qrVersion HMAC 서명 → 같은 토큰 재표시' ↔ 무작위 토큰(해시만 저장) | 무작위 토큰, **열 때마다 재발급** (`mig:673-685`, `TicketsPage.tsx:17-28`) | 중간 M11 |
| c7 | 잠금 순서: 10/7 `data-flow.md:96` 'ticket_types → bookings → payments 통일' ↔ 공연 행 잠금 추가 | 경로마다 순서가 다름 | 중간 M4 |
| c8 | 디자인: 11/1 p15 발표자 의견 '앱은 A(다크)' ↔ 팀 결정 '화이트+레드' | 화이트+레드 | 팀 결정을 따름(문제 없음) |
| c9 | 스택: 11/1 p13 Next.js+Vercel(제안) ↔ 기존 Vite React | 기존 Vite | p13 '다른 스택이면 DB만 옮겨도 됨'에 부합 |
| c10 | 공개 필수 항목: 노션 CHECK(장소·주소·종료·입장 시간) ↔ 11/1 '이름·날짜·장소·가격 넣으면 예매 페이지' | 장소만 필수 | 팀 SQL이 이미 적용된 DB면 공개 등록이 막힐 수 있음 → H3 |

---

## 2. 백엔드 동작 시뮬레이션 결과

### 2.1 흐름별로 따라간 결과(요약)

| 흐름 | 결과 |
|---|---|
| 가입 → 프로필 | 트리거로 생성 [확인]. **migration 전부터 있던 auth 사용자는 프로필이 없어** 아무 기능도 못 씀 [확인] (H3) |
| 동아리 등록 → 승인 | 동작 [확인]. 운영자는 아무 상태로나 바꿀 수 있음 [확인] (M2) |
| 공연 등록·수정·공개 | 유료 공연을 초안 → '공개' 버튼으로 **계좌 없이 공개** 가능 [확인] (M2). 수정에서 정원 0·음수 가격은 영어 원문 오류 [확인] (M1) |
| 예매(입금 대기) → 입금 확인 → 티켓 | 동작 [확인]. **지난 공연도 예매·즉시 확정** [확인] (M3). 기한 지난 예매도 입금 확인됨 [확인], 기한 지난 예매는 다음 예매가 올 때까지 자리를 잡음 (H2) |
| QR 발급 → 검증 → 입장 | 동작 [확인]. 티켓을 열 때마다 재발급 (M11) |
| 교류 신청 → 수락 → 오픈채팅 | 동작 [확인]. 역방향 중복 PENDING 허용 [확인] (L1) |
| 취소·만료 | 입금 전 취소 동작. 만료는 같은 티켓 종류의 새 예매 시점에만 처리 (H2) |
| 공연 수정·삭제·비공개 | 비공개 전환 시 관객 화면 오류 [확인] (H1). 삭제는 예매 없을 때만 |

### 2.2 높음

#### H1. 예매·티켓이 있는 공연을 '비공개'로 돌리면 관객의 '내 티켓'·'마이페이지'가 오류 화면이 됨 — [확인]
- **재현**: 동아리 운영진이 공연 관리에서 '비공개' 클릭(`ManagePage.tsx:83`, PUBLISHED→DRAFT) → 그 공연을 예매한 관객이 `/app/tickets` 또는 `/app/my` 진입.
- **원인**: events RLS는 PUBLISHED/ENDED + 동아리 ACTIVE이거나 운영진일 때만 보임(`mig:331-334`). 관객은 tickets·bookings는 읽지만 공연 행은 못 읽음. 화면은 `db.events.find(...)!`로 존재를 가정(`TicketsPage.tsx:31-33, 70`, `MyPage.tsx:385-386`) → TypeError.
- **확인 내용**: 로컬 PostgreSQL에서 관객이 tickets 1건·events 0건을 봄. 가짜 Supabase 게이트웨이 + Supabase 모드 빌드 + Playwright로 '오류가 발생했습니다 / 페이지를 새로고침하거나…'(ErrorBoundary) 화면 확인. 데모 모드는 RLS가 없어 재현되지 않음(모드 차이).
- 동아리 승인 상태가 ACTIVE에서 바뀌어도 같은 결과(코드상).
- **영향**: 내 티켓 전체(다른 공연 티켓 포함)를 못 봄 → 공연 당일 입장 불가. 입금 대기 예매 취소도 못 함.
- **권장**: (1) events SELECT 정책에 '내가 예매·티켓을 가진 공연' 조건 추가(예: `exists (select 1 from bookings b where b.event_id = events.id and b.user_id = (select auth.uid()))`), (2) 화면에서 공연이 없을 때 '비공개된 공연' 표시로 처리, (3) 예매가 있는 공연은 DRAFT 대신 CANCELLED(+알림)로만 바꾸게 하거나 확인 창 추가. 노션 844a6a07이 이미 지적한 항목.

#### H2. 입금 기한이 지난 예매가 자리를 계속 잡고, 화면이 '매진'으로 막혀 만료 처리가 일어나지 않음 — [코드]+[확인 일부]
- **원인**: 만료 처리는 `create_booking` 안에서 그 티켓 종류에 대해서만 실행(`mig:388-403, 595`). 화면은 `capacity - reserved - sold`로 남은 석을 계산하고 0이면 예매 버튼을 비활성(`EventPage.tsx:251-253, 301`). 남은 석이 전부 기한 지난 입금 대기로 잡혀 있으면 아무도 `create_booking`을 부를 수 없어 **자리가 영구히 묶임**(운영진이 하나씩 '취소'해야 풀림).
- 같은 이유로 운영진의 입금 대기 목록·관객의 '입금 대기'에 기한 지난 예매가 계속 보이고, `confirm_deposit`은 기한 지난 예매도 확정함 [확인: 기한을 과거로 바꾼 예매가 CONFIRMED로 바뀜] (`mig:647-649`). 데모 모드는 만료 자체가 없음(`repo.ts`에 만료 처리 없음).
- **재현**: 정원 1, 관객 A 예매(입금 대기) → `expires_at`을 과거로 → 다른 관객 화면에서 '매진', 버튼 비활성.
- **권장**: 남은 석 계산에서 기한 지난 대기를 빼는 읽기용 뷰/함수 제공, 또는 pg_cron(Supabase 지원)으로 주기 만료, 또는 화면에서 매진이어도 예매 시도를 허용. 기한 지난 예매의 입금 확인 허용 여부를 팀이 정하고 함수에 반영.

#### H3. 팀 초기 SQL이 이미 적용된 DB에서 충돌할 가능성이 큼 + 기존 사용자 프로필 미생성 — [추측]+[확인 일부]
- migration은 `create table if not exists`라 **기존 테이블의 CHECK·정책·트리거를 그대로 둔다**(`mig:5-7`에 스스로 경고). 노션 설계 캡처에서 확인되는 차이:
  - 노션 6장(076eeaf2·158ff708): 'PUBLISHED에서 장소·주소·종료·입장 시간·공개 시각 필수'(CHECK). `create_event`는 `ends_at`·`admission_*`을 비우고 주소도 선택이라(`mig:498-505`) **공개 등록이 CHECK 위반(영어 원문 오류)으로 막힐 수 있음** [추측].
  - `payments.provider`·상태값 단어가 팀 SQL과 다르면 `create_booking`의 `'BANK_TRANSFER'` 입력이 막힐 수 있음 [추측].
  - 노션의 초기 조회 정책이 남아 있으면 이 migration 정책과 OR로 합쳐져 범위가 넓어질 수 있음 [추측].
- `revoke execute on all functions in schema public from public, anon, authenticated`(`mig:793`)는 **팀 SQL이 만든 다른 함수(정책에서 쓰는 도우미 포함)의 실행 권한도 회수**한다. 정책이 그런 함수를 부르면 조회 자체가 'permission denied for function'으로 실패 [추측]. `revoke all on all tables in schema public`(`mig:361`)도 public의 모든 테이블에 적용(다른 서비스 테이블이 있으면 함께 막힘) [코드].
- **프로필 미생성** [확인]: 트리거는 새 가입에만 동작하고 기존 `auth.users`를 채우지 않는다(`mig:255-267`). 트리거 없이 만든 사용자로 `create_club` → `clubs_created_by_fkey` 위반(영어 원문). 화면은 `me`가 null이라 로그인돼 있어도 '로그인하세요'만 보임(`store.tsx:85`).
- **권장**: 적용 전 bandy-dev의 실제 DDL을 `pg_dump --schema-only`로 받아 대조(테스트 계획 R-1), 필요한 CHECK·정책을 명시적으로 `alter`/`drop`. `insert into profiles select ... from auth.users on conflict do nothing` 백필 추가. 전역 revoke 대신 이 migration이 만든 함수·테이블만 지정.

#### H4. Supabase 모드에서 변경 1번마다 13개 테이블 전체를 다시 받고, 이미지가 data URL로 그 안에 들어 있음 — [확인]
- `SupabaseBackend.load()`가 13개 테이블을 조건·페이지 없이 `select('*')`(`backend.ts:192-214`), 모든 변경 뒤 `refresh()`(`store.tsx:71-75`).
  - Playwright 계측: 예매 1회 → **REST GET 13건** [확인].
  - 이미지(640px JPEG data URL, 보통 수십~100KB 이상)가 `events.poster_path`·`clubs.profile_path`에 들어가 **매 재조회마다 전부 전송**. 합성 데이터(공연 200개 × 80KB) 기준 공연 테이블만 **15MB/회** [확인: `sum(length(poster_path))`].
  - QR 입장 처리 1건마다도 전체 재조회(`ScanPage.tsx:179`) → 공연 당일 현장(모바일 데이터)에서 스캔이 느려짐 [코드].
  - 알림 읽음 클릭 1회도 전체 재조회(`Discover.tsx:216`).
- Supabase API 기본 'Max Rows'(1000)를 넘으면 **조용히 잘림**(페이지 처리 없음) → 1000건 넘는 예매·티켓·알림이 화면에서 사라짐 [추측: 실제 프로젝트 설정 확인 필요].
- 이미지 크기 제한이 DB에 없어 한 사용자가 수 MB 문자열을 넣으면 모든 방문자가 매번 받음 [코드].
- **권장**: 이미지 → Storage 업로드 후 경로만 저장. 화면별 필요한 테이블·행만 조회(예: 관객은 본인 bookings/tickets, 공개 events는 목록 컬럼만), 변경 후에는 바뀐 테이블만 재조회, 목록 페이지 처리. `poster_path` 길이 CHECK.

### 2.3 중간

| # | 내용 | 재현/근거 | 권장 |
|---|---|---|---|
| M1 | **영어 원문 오류가 사용자에게 보임** [확인: DB 원문 + `friendlyError` 실행] | `friendlyError`는 한글이 없고 알려진 코드가 아니면 `알 수 없는 오류가 발생했어요. (원문)`을 반환(`backend.ts:28-31`). 원문이 나오는 경로: `update_event` 정원 0(`ticket_types_capacity_check`)·음수 가격·소수 가격(`invalid input syntax for type bigint`) (`mig:517-536`, 화면 `ManagePage.tsx:169`는 빈 칸을 0으로 바꿈) / `set_club_status`·`set_event_status`의 잘못된 상태값(CHECK) / `request_exchange`의 잘못된 종류·자기 자신(CHECK) / 교착(`deadlock detected`) / 삭제·예매 경합(FK) / 프로필 없는 사용자(FK). 모두 로컬 DB에서 원문 확인 | 함수 입구에서 값 검사 후 한국어 `raise`. `friendlyError`에서 SQLSTATE 계열(23514, 22P02, 40P01, 23503)별 한국어 문구. 원문은 콘솔에만 |
| M2 | **상태 전이 검사 없음** [확인] | `set_event_status`: 아무 상태→아무 상태(취소→공개 포함), 유료 공연을 계좌 없이 공개(초안 저장 후 '공개' 버튼) [확인] (`mig:541-551`, `create_event`만 계좌 검사 `mig:496`). `set_club_status`: ACTIVE→PENDING 등 자유, SUSPENDED여도 '승인이 거절됐어요' 알림 (`mig:460-474`). ENDED는 아무도 설정하지 않음 | 허용 전이표를 함수에 두고, 공개 시 공개 필수 항목(장소·계좌) 공통 검사 함수 사용 |
| M3 | **판매 기간·공연 시각 미검사** [확인] | 2020년 공연(무료)을 예매 → 즉시 CONFIRMED·티켓 발급. `sales_starts_at/ends_at`을 저장만 하고 `create_booking`에서 보지 않음(`mig:588-598`) | `now() between sales_starts_at and sales_ends_at` 검사 |
| M4 | **잠금 순서 역전으로 교착(deadlock) 발생** [확인] | (1) 실제 함수끼리: `update_event`(정원 축소)와 유료 `create_booking` 3건을 동시에 실행했을 때 `deadlock detected`(40P01) 1회 재현(비결정적). 경로: 예매가 티켓 종류 행을 잠근 뒤 `bookings` INSERT의 FK 검사로 공연 행에 KEY SHARE 잠금이 필요한데, `update_event`가 공연 행을 `FOR UPDATE`로 잡고 티켓 종류를 기다림(`mig:521, 525, 589, 600`). (2) 모사: 공연→티켓 종류 순서 세션 vs `confirm_deposit`(티켓 종류→예매→공연, `mig:621, 645-646`)도 교착 재현. 사용자에게는 영어 원문 오류 | `update_event`·`_confirm_booking`의 공연 잠금을 `FOR NO KEY UPDATE`로(FK의 KEY SHARE와 충돌하지 않음), 모든 경로를 '티켓 종류 → 예매 → 공연' 한 순서로 통일(10/7 `data-flow.md:96`). 40P01은 재시도 또는 한국어 안내 |
| M5 | **운영진·스태프를 추가할 방법이 없음** [코드] | 쓰기 함수 없음(1장 a6). 공연 당일 입구 여러 곳 스캔·입금 확인 분담 불가(계정 공유 외) | `add_club_manager`/`add_event_staff`(초대 코드 등) 함수와 화면 |
| M6 | **링크 URL을 검증하지 않음 + 문자열 길이 제한 없음** [확인 일부] | `sns_url`·`open_chat_url`에 `javascript:alert(document.cookie)` 저장됨 [확인], 운영자 승인 화면·동아리 페이지·교류 연결 목록에서 `href`로 렌더(`MyPage.tsx:350`, `ClubsPage.tsx:373, 420`). React 18.3.1 운영 빌드는 javascript: URL을 막지 않음 [확인]. 단 `target=_blank rel=noreferrer`라 Chromium에서는 실행되지 않음 [확인]. 다른 브라우저(iOS Safari 등)·길게 눌러 열기는 미확인. Supabase 세션은 localStorage에 있어 실행되면 토큰 탈취 가능 | DB 함수에서 `https://` 스킴만 허용, 화면에서도 스킴 검사. 이름·소개·입금자명·이미지 길이 CHECK |
| M7 | **변경은 성공했는데 '실패'로 표시될 수 있음** [코드] | `call()`이 변경 후 `refresh()`까지 기다리고, 재조회가 실패하면 전체를 실패로 반환(`store.tsx:71-79`). 예: 입금 확인 성공 후 네트워크 끊김 → 오류 토스트 → 다시 누르면 '이미 처리…'가 아니라 조용히 성공(멱등)하지만, 취소는 '입금 확인 전 예매만 취소…' 오류 | 변경 결과와 재조회 결과를 분리(재조회 실패는 '새로고침 필요' 안내) |
| M8 | **RLS 판정 함수가 행마다 실행돼 조회가 느림** [확인: 합성 데이터] | 사용자 5,000·예매 20,000·공연 200에서 운영진 기준 `profiles` 전체 조회 1.66초, `bookings` 1.07초(관객도 같음: 정책이 모든 행에 `is_event_staff` 실행). `can_view_profile`은 프로필마다 예매를 훑고 예매마다 `is_event_staff` (`mig:297-301, 321, 339-340`). `auth.uid()`를 `(select auth.uid())`로 감싸지 않음 | 정책을 `user_id = (select auth.uid()) or event_id in (select managed_event_ids())` 형태로(관리 공연 id 집합을 한 번만 계산). Supabase Performance Advisor의 `auth_rls_initplan` 지적 대상 |
| M9 | **예금주가 동아리 이름으로 고정** [코드] | `account_holder = v_club.name`(`mig:504`), 입력란 없음(`ManagePage.tsx:201-204`), 동아리 이름을 바꿔도 갱신 안 됨. 실제 계좌 예금주(개인 이름)와 달라 관객이 입금을 망설일 수 있음. 예매 후 계좌 변경도 자유(`mig:533`) | 예금주 입력 필드, 예매가 있으면 계좌 변경 시 경고/알림 |
| M10 | **데모 모드와 Supabase 모드의 동작 차이** [코드] | 만료 없음(데모) / QR: 데모는 확정 시 90일 고정 토큰, Supabase는 열 때마다 24시간 재발급(`backend.ts:154-159`, `repo.ts:338-342`) / 좌표: 데모 임의, Supabase null / 공연 가시성: 데모는 RLS 없음(H1 미재현) / 정원 0·음수 가격 수정: 데모는 통과(`repo.ts:227-248`), DB는 원문 오류 / 요청 키: 데모는 무시(`backend.ts:149-151`) / 교류 알림 대상: 데모는 모든 소속, DB는 ACTIVE만 / 오류 문구: '취소된 예매입니다.' vs '취소되거나 만료된 예매입니다.' | 데모 규칙을 DB 함수와 맞추거나, 데모를 '화면 시연 전용'으로 명시하고 회귀 기준을 Supabase 모드로 |
| M11 | **QR을 열 때마다 재발급** [코드] | `TicketsPage.tsx:17-28` → `issue_ticket_qr`가 이전 QR 폐기(`mig:680`). 두 기기·캡처 화면은 무효, 운영진이 검증한 직후 관객이 모달을 다시 열면 '입장 처리'가 invalid. `qr_credentials`가 열 때마다 1행씩 증가 | 유효한 QR이 있으면 재사용(원문을 보관하지 않으려면 10/7 HMAC 방식) |
| M12 | **`npm run build`(= `tsc && vite build`)가 실패** [확인] | `src/bandy` 밖의 기존 파일 2곳 TS6133(`src/platform/pages/StaffLoginPage.tsx:3`, `src/utils/setlistExcel.ts:6`). `vercel.json`의 buildCommand가 `npm run build`라 배포 빌드가 깨짐. main에서도 같은 상태(이 브랜치가 만든 문제는 아님) | 미사용 변수 제거 또는 빌드 명령 조정(팀 판단) |

### 2.4 낮음

| # | 내용 | 근거 |
|---|---|---|
| L1 | 교류: A→B와 B→A가 동시에 PENDING 가능 [확인], 수락 후 재신청 가능 → '연결된 동아리'에 같은 동아리가 여러 번. 연결 상대 동아리가 ACTIVE가 아니게 되면 `db.clubs.find(other)!`로 오류 화면 [코드] | `mig:744-746`, `ClubsPage.tsx:366-368` |
| L2 | 같은 요청 키로 **동시에** 두 번 예매하면 두 번째는 `bookings_user_id_idempotency_key_key` unique 위반(화면에는 '이미 처리된 요청이에요.')으로 예매 id를 못 받음 [확인: 두 세션] | 존재 확인이 잠금 전(`mig:583-587`) |
| L3 | 공연 삭제와 예매가 겹치면 `booking_items_ticket_type_id_event_id_fkey` 위반 원문 [확인: 두 세션] | `delete_event`가 잠금 없이 예매 존재 확인(`mig:558-563`) |
| L4 | 같은 이름 동아리 동시 등록·같은 교류 신청 동시 2회 → `clubs_name_key`·`exchange_one_pending` unique 위반이 '이미 처리된 요청이에요.'로 표시(의미 다름) [확인: 두 세션] | `mig:42, 420`, `backend.ts:30` |
| L5 | `_ticket_info`가 결제 SUCCEEDED 행을 못 찾으면 null 반환 → `ScanPage`에서 `res.result` 접근 오류 [코드, 수동 데이터 변경 시에만] | `mig:694-700`, `ScanPage.tsx:187` |
| L6 | 비공개·취소 공연에도 QR 발급·입장 처리 가능 [코드] | `mig:673-731` |
| L7 | 비로그인도 `clubs.created_by`·`events.created_by`(사용자 uuid)·계좌 정보 조회. 노션 5장이 '공개 컬럼 최소화'를 요구 [확인] | `mig:323, 332, 362` |
| L8 | `can_view_profile`·`is_event_staff` 등을 anon·authenticated가 RPC로 직접 호출 가능(정보 노출은 거의 없음) [확인] | `mig:794-795` |
| L9 | 알림 설정은 localStorage만, 알림은 전량 로드(정리·페이지 없음) [코드] | `MyPage.tsx:292-330`, `backend.ts:193` |
| L10 | 탭 복귀 시 supabase-js가 `SIGNED_IN`을 보내 전체 재조회할 수 있음 [추측: auth-js 2.119 `_recoverAndRefresh`가 SIGNED_IN 알림, 합성 visibilitychange로는 재현 안 됨] | `backend.ts:219-225`, `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:4233` |
| L11 | 프런트 정렬 비용: `feedEvents` 비교마다 `hasExchangeWith`, '예매 많은 순' 비교마다 `bookingCount`(전체 예매 filter) | `repo.ts:107-113`, `Discover.tsx:98` |
| L12 | 데모 모드: 변경마다 DB 전체 `structuredClone` + `JSON.stringify`, 검증(읽기)도 `mutate` 사용. 이미지 여러 장이면 localStorage 5MB 초과 → 저장 실패를 무시해 새로고침 시 데이터 유실 [추측: 용량] | `backend.ts:93-99, 160`, `repo.ts:43-49` |
| L13 | `types.ts`와 DB 불일치: `ClubStatus`에 SUSPENDED 없음(마이페이지는 '거절됨'으로 표시), `PaymentStatus`에 REFUNDED 없음, `EventStaff.role` 고정 값, `QrCredential.token`은 DB에 없음, `ProfileStatus`는 ACTIVE만 | `types.ts:9, 20, 122, 164, 174`, `MyPage.tsx:365` |
| L14 | `ImageInput`에 이미지 로드 실패 처리 없음(오류 문구 없이 무반응, object URL 미해제). 동아리 무제한 등록·교류 신청 반복으로 알림 대량 발생 가능 | `components.tsx:79-90`, `mig:415, 749-751` |
| L15 | `friendlyError`는 메시지에 한글이 한 글자라도 있으면 그대로 보여 줌 → 사용자 입력값이 섞인 Postgres 원문(예: `invalid input syntax for type uuid: "가나다"`)이 그대로 노출 [확인: esbuild로 `friendlyError`를 꺼내 실행] | `backend.ts:28` |

### 2.5 보안·권한 점검에서 문제 없던 것(참고)

- security definer 함수 31개 모두 `set search_path = ''` [확인: `pg_proc.proconfig`]. authenticated가 실행할 수 있는 함수는 화면용 RPC 18개 + 판정 함수 5개뿐이고 내부 함수(`_confirm_booking` 등)는 회수됨 [확인].
- 테이블 직접 쓰기 차단, 다른 동아리의 예매·입금 확인·QR 검증 차단, 남의 티켓 QR 발급 차단 — 기존 테스트로 확인됨.
- 같은 QR 동시 3회 입장 처리 → valid 1·already 2·감사 1건, 마지막 3석 5명 동시 예매 → 3건, 같은 예매 동시 입금 확인 → 티켓 중복 없음, 입금 확인 vs 취소 동시 → 하나만 성공, 수량 불변식 유지 [확인: 두 세션 이상].
- 정원 확보는 티켓 종류 행 잠금으로 직렬화 [코드].
- migration 두 번 실행 가능 [확인].

---

## 3. 이번 검토에서 직접 실행한 것

- `supabase/tests/run_backend.sh` → ALL TESTS PASSED.
- 로컬 DB `review_sim`: 상태값 오류, 정원 0 수정, 계좌 없이 공개, 지난 공연 예매, 기한 지난 예매 확정, 역방향 교류, 비공개 공연 가시성, 프로필 없는 사용자, migration 재실행.
- 두 세션 이상 동시성 시나리오 13종(테스트 계획 C 묶음과 같은 스크립트): 정원 경합, 같은 요청 키, 입금 확인·취소 경합, 교착, 삭제·예매 경합, 입장 처리, 교류·동아리 이름 경합.
- 테스트 계획의 DB 단위(D)·권한(S) 스크립트 초안을 실제로 돌려 결과가 이 문서의 발견과 일치함을 확인(D: 32개 중 PASS 8 — 나머지 FAIL이 위 발견에 대응, S: 71개 중 PASS 70 — FAIL 1은 L7).
- 로컬 DB `review_perf`: 사용자 5,000·예매 20,000·공연 200(포스터 80KB) 합성 데이터로 RLS 조회 시간과 이미지 크기.
- 가짜 Supabase 게이트웨이(GoTrue·PostgREST 최소 흉내) + Supabase 모드 빌드 + Playwright: 예매 1회당 REST GET 13건, 공연 비공개 후 내 티켓 오류 화면.
- Chromium에서 `target=_blank rel=noreferrer`인 javascript: 링크 실행 여부(실행 안 됨).
- 실행용으로 만든 로컬 DB(`review_*`)와 임시 파일은 검토 후 지웠고, 저장소 파일은 바꾸지 않았다(`git status` 깨끗함).
