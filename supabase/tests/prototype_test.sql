-- 프로토타입 스키마 동작 검증 (로컬 PostgreSQL 전용)
-- 실행: supabase/tests/run_local.sh
\set ON_ERROR_STOP on
\set QUIET on

-- ───── 테스트 도구 ─────
create schema test;
grant usage on schema test to anon, authenticated;

create function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end; $$;

create function test.fails(stmt text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok - % (거부됨: %)', msg, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % — 거부되어야 하는데 성공함', msg;
end; $$;
grant execute on all functions in schema test to anon, authenticated;

-- 사용자 전환
\set as_admin 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-0000-0000-00000000000a'', false); set role authenticated;'
\set as_o1 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-0000-0000-000000000001'', false); set role authenticated;'
\set as_o2 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-0000-0000-000000000002'', false); set role authenticated;'
\set as_u 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-0000-0000-00000000000b'', false); set role authenticated;'
\set as_anon 'reset role; select set_config(''request.jwt.claim.sub'', '''', false); set role anon;'

-- ───── 1. 가입하면 프로필 생성 ─────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test', '{"name":"운영자"}'),
  ('00000000-0000-0000-0000-000000000001', 'o1@test', '{"name":"렉사 회장"}'),
  ('00000000-0000-0000-0000-000000000002', 'o2@test', '{"full_name":"햇살 회장"}'),
  ('00000000-0000-0000-0000-00000000000b', 'u@test', '{}');
select test.ok((select count(*) from public.profiles) = 4, '가입 시 프로필 4개 생성');
select test.ok((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000002') = '햇살 회장',
  '카카오 full_name을 표시명으로 사용');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000000a';

-- ───── 2. 동아리 등록 · 수동 승인 ─────
:as_o1
select public.create_club('렉사 × 멜로딕', '광운대', '밴드', '서울 노원', '@rexa', '연합 밴드', 'https://open.kakao.com/o/rexa') as club1 \gset
select test.ok((select count(*) from public.clubs) = 1, '등록한 동아리는 승인 전에도 본인에게 보임');
select test.ok((select role from public.club_members where club_id = :'club1') = 'owner', '등록자는 owner');
select test.fails($$select public.set_club_verification('$$ || :'club1' || $$', 'approved')$$, '일반 회원은 승인 불가');
select test.fails($$insert into public.events (club_id, title, created_by) values ('$$ || :'club1' || $$', '공연', auth.uid())$$,
  '승인 전 동아리는 공연 등록 불가');
select test.fails($$update public.clubs set verification = 'approved'$$, '회원이 인증 상태를 직접 못 바꿈');

:as_anon
select test.ok((select count(*) from public.clubs) = 0, '승인 전 동아리는 동아리 찾기에 안 보임');

:as_o2
select public.create_club('햇살 연극동아리', '광운대', '연극', '서울 노원', '@haetsal', '연극', 'https://open.kakao.com/o/haetsal') as club2 \gset

:as_admin
select public.set_club_verification(:'club1', 'approved');
select public.set_club_verification(:'club2', 'approved');

:as_anon
select test.ok((select count(*) from public.clubs) = 2, '승인 후 동아리 찾기에 보임');
select test.ok((select count(*) from public.clubs where genre = '밴드' and region like '서울%') = 1, '장르·지역 필터 조회');
select test.fails($$select * from public.club_private$$, '비로그인은 오픈채팅 링크 조회 불가');

-- ───── 3. 공연 등록 · 공개 ─────
:as_o1
insert into public.events (club_id, title, price_krw, capacity, created_by)
values (:'club1', '겨울 연합 공연', 6000, 3, auth.uid()) returning id as ev1 \gset
select test.fails($$update public.events set status = 'published' where id = '$$ || :'ev1' || $$'$$,
  '일시·장소·계좌 없이 공개 불가');
update public.events
set status = 'published', starts_at = '2026-12-12 18:30+09', venue = '얼라이브홀',
    bank_name = '카카오뱅크', account_number = '3333-00-0000000', account_holder = '렉사'
where id = :'ev1';
select test.fails($$update public.events set club_id = '$$ || :'club2' || $$' where id = '$$ || :'ev1' || $$'$$,
  '공연의 주최 동아리는 못 바꿈');

:as_o2
select test.ok((select count(*) from public.events where id = :'ev1') = 1, '다른 동아리도 공개 공연은 조회 가능');
update public.events set title = '바뀐 제목' where id = :'ev1';
select test.ok((select title from public.events where id = :'ev1') = '겨울 연합 공연', '다른 동아리 공연은 수정 안 됨');

:as_anon
select test.ok((select count(*) from public.events) = 1, '비로그인도 공개 공연 조회');
select test.fails($$select * from public.bookings$$, '비로그인은 예매 조회 불가');

-- ───── 4. 예매 (입금 대기) ─────
:as_u
select (b).id as bk1, (b).total_amount_krw as total1, (b).status as st1
from (select public.create_booking(:'ev1', '김관객', 2) as b) s \gset
select test.ok(:'total1'::int = 12000 and :'st1' = 'pending', '서버가 금액 계산(6000×2), 입금 대기');
select test.fails($$select public.create_booking('$$ || :'ev1' || $$', '김관객', 2)$$, '정원(3) 초과 예매 거부');
select test.fails($$insert into public.bookings (event_id, user_id, depositor_name, quantity, unit_price_krw, total_amount_krw)
  values ('$$ || :'ev1' || $$', auth.uid(), 'x', 1, 0, 0)$$, '예매를 직접 insert 불가 (가격 조작 차단)');
select test.fails($$update public.bookings set status = 'confirmed'$$, '관객이 스스로 입금 확인 불가');
select test.fails($$select public.confirm_booking('$$ || :'bk1' || $$')$$, '관객은 confirm_booking 불가');

-- ───── 5. 입금 확인 → 티켓 발급 ─────
:as_o2
select test.ok((select count(*) from public.bookings) = 0, '다른 동아리는 예매자 명단을 못 봄');
select test.fails($$select public.confirm_booking('$$ || :'bk1' || $$')$$, '다른 동아리는 입금 확인 불가');

:as_o1
select test.ok((select depositor_name from public.bookings where id = :'bk1') = '김관객', '주최 동아리는 입금자명 확인 가능');
select test.ok((select count(*) from public.confirm_booking(:'bk1')) = 2, '입금 확인 시 수량(2)만큼 티켓 발급');
select test.ok((select count(*) from public.confirm_booking(:'bk1')) = 2, '입금 확인을 두 번 눌러도 티켓 중복 없음');
select test.ok((select array_agg(entry_number order by seq) from public.tickets where booking_id = :'bk1') = '{1,2}',
  '입장번호 1, 2 순서대로');

:as_u
select test.ok((select count(*) from public.tickets) = 2, '관객의 내 티켓에 2장');
select qr_token as qr1 from public.tickets where booking_id = :'bk1' and seq = 1 \gset
select test.fails($$update public.tickets set checked_in_at = now()$$, '관객이 스스로 입장 처리 불가');

-- ───── 6. QR 입장 ─────
select test.fails($$select public.check_in('$$ || :'ev1' || $$', '$$ || :'qr1' || $$')$$, '관객은 입장 처리 불가');

:as_o2
select test.fails($$select public.check_in('$$ || :'ev1' || $$', '$$ || :'qr1' || $$')$$, '다른 동아리는 입장 처리 불가');

:as_o1
select test.ok(public.check_in(:'ev1', :'qr1') ->> 'result' = 'valid', '첫 스캔: 입장');
select test.ok(public.check_in(:'ev1', :'qr1') ->> 'result' = 'already_checked_in', '두 번째 스캔: 이미 입장');
select test.ok(public.check_in(:'ev1', gen_random_uuid()) ->> 'result' = 'invalid', '없는 QR: 무효');
select test.ok((select count(*) from public.tickets where booking_id = :'bk1' and checked_in_at is not null) = 1,
  '2장 중 스캔한 1장만 입장');

:as_u
select test.ok((select count(*) from public.tickets where checked_in_at is not null) = 1,
  '관객 화면에도 같은 입장 상태(1장 입장)');

-- ───── 7. 입금 전 취소 ─────
select (public.create_booking(:'ev1', '김관객', 1)).id as bk2 \gset
select public.cancel_booking(:'bk2');
select test.ok((select status from public.bookings where id = :'bk2') = 'cancelled', '입금 전 예매 취소');
select test.ok((select (public.create_booking(:'ev1', '김관객', 1)).status) = 'pending', '취소한 자리는 다시 예매 가능');
select test.fails($$select public.cancel_booking('$$ || :'bk1' || $$')$$, '입금 확인된 예매는 취소 불가(환불 정책 미정)');

-- ───── 8. 교류 신청 ─────
:as_o1
select test.fails($$select public.request_exchange('$$ || :'club1' || $$', '$$ || :'club2' || $$', 'joint_show')$$,
  '교류를 닫아 둔 동아리에는 신청 불가');

:as_o2
update public.clubs set exchange_open = true where id = :'club2';

:as_u
select test.fails($$select public.request_exchange('$$ || :'club1' || $$', '$$ || :'club2' || $$', 'joint_show')$$,
  '동아리 회원이 아니면 신청 불가');

:as_o1
select public.request_exchange(:'club1', :'club2', 'joint_show', '12월 합동 공연 같이 해요') as ex1 \gset
select test.fails($$select public.request_exchange('$$ || :'club1' || $$', '$$ || :'club2' || $$', 'practice')$$,
  '처리 전 신청이 있으면 중복 신청 불가');
select test.ok((select count(*) from public.club_private where club_id = :'club2') = 0, '수락 전에는 상대 오픈채팅 링크 안 보임');
select test.fails($$select public.respond_exchange('$$ || :'ex1' || $$', true)$$, '신청한 쪽은 수락 불가');

:as_o2
select test.ok((select message from public.exchange_requests where id = :'ex1') = '12월 합동 공연 같이 해요', '받은 동아리에 신청 보임');
select public.respond_exchange(:'ex1', true);

:as_o1
select test.ok((select open_chat_url from public.club_private where club_id = :'club2') = 'https://open.kakao.com/o/haetsal',
  '수락 후 상대 오픈채팅 링크 보임');

:as_o2
select test.ok((select open_chat_url from public.club_private where club_id = :'club1') = 'https://open.kakao.com/o/rexa',
  '수락한 쪽도 신청 동아리 링크 보임');

:as_u
select test.ok((select count(*) from public.club_private) = 0, '관객은 오픈채팅 링크 못 봄');
select test.ok((select count(*) from public.exchange_requests) = 0, '관객은 교류 신청 못 봄');

-- ───── 9. 피드: 연결된 동아리 공연이 위로 ─────
:as_o2
insert into public.events (club_id, title, starts_at, venue, status, created_by)
values (:'club2', '겨울 정기 공연', '2026-12-20 19:00+09', '소극장', 'published', auth.uid());

:as_o1
select test.ok((select club_id from public.feed_events() limit 1) = :'club2',
  '교류 연결된 동아리(햇살) 공연이 날짜가 늦어도 피드 맨 위');

:as_u
select test.ok((select club_id from public.feed_events() limit 1) = :'club1', '연결 없는 관객 피드는 날짜순');

-- ───── 10. 삭제 ─────
:as_o1
delete from public.events where id = :'ev1';
select test.ok((select count(*) from public.events where id = :'ev1') = 1, '공개된 공연은 삭제되지 않음(초안만 삭제)');

reset role;
\echo 'ALL TESTS PASSED'
