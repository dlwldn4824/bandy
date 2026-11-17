-- supabase/migrations/20261118000000_bandy_app_backend.sql 동작 검증 (로컬 PostgreSQL 전용)
\set ON_ERROR_STOP on
\set QUIET on

create schema test;
grant usage on schema test to anon, authenticated;
create function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end; $$;
create function test.fails(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok - % (거부: %)', msg, sqlerrm; return; end;
  raise exception 'FAIL: % — 거부되어야 하는데 성공함', msg;
end; $$;
grant execute on all functions in schema test to anon, authenticated;

\set as_admin 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-0000-0000-00000000000a'', false); set role authenticated;'
\set as_o1 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-0000-0000-000000000001'', false); set role authenticated;'
\set as_o2 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-0000-0000-000000000002'', false); set role authenticated;'
\set as_u 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-0000-0000-00000000000b'', false); set role authenticated;'
\set as_v 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-0000-0000-00000000000c'', false); set role authenticated;'
\set as_anon 'reset role; select set_config(''request.jwt.claim.sub'', '''', false); set role anon;'

-- 1. 가입 → 프로필
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test', '{"name":"운영자"}'),
  ('00000000-0000-0000-0000-000000000001', 'o1@test', '{"name":"렉사 회장"}'),
  ('00000000-0000-0000-0000-000000000002', 'o2@test', '{"nickname":"햇살 회장"}'),
  ('00000000-0000-0000-0000-00000000000b', 'audience@test', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'viewer@test', '{}');
select test.ok((select count(*) from public.profiles) = 5, '가입하면 프로필 생성');
select test.ok((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'audience', '이름이 없으면 이메일 앞부분');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000000a';

-- 2. 동아리 등록 · 승인
:as_o1
select public.create_club('{"name":"렉사","school":"광운대","genre":"밴드","region":"노원구","exchange_open":true,"open_chat_url":"https://open.kakao.com/o/rexa"}') as c1 \gset
select test.fails($$select public.set_club_status('$$ || :'c1' || $$', 'ACTIVE')$$, '일반 회원은 승인 불가');
select test.fails($$select public.create_event('$$ || :'c1' || $$', '{"title":"x","starts_at":"2026-12-01T19:00+09","capacity":10}')$$, '승인 전 동아리는 공연 등록 불가');
select test.fails($$insert into public.clubs (name) values ('직접')$$, '테이블 직접 쓰기 불가');
:as_anon
select test.ok((select count(*) from public.clubs) = 0, '승인 전 동아리는 비공개');
:as_o2
select public.create_club('{"name":"햇살","school":"광운대","genre":"연극","region":"노원구","open_chat_url":"https://open.kakao.com/o/sun"}') as c2 \gset
select test.fails($$select public.create_club('{"name":"렉사"}')$$, '같은 이름 동아리 거부');
:as_admin
select public.set_club_status(:'c1', 'ACTIVE');
select public.set_club_status(:'c2', 'ACTIVE');
:as_anon
select test.ok((select count(*) from public.clubs where genre = '밴드') = 1, '승인 후 동아리 찾기(장르 필터)');
select test.fails($$select * from public.club_private$$, '비로그인은 오픈채팅 링크 조회 불가');
:as_o1
select test.ok((select count(*) from public.notifications where type = 'CLUB_STATUS') = 1, '승인 알림');

-- 3. 공연 등록 · 수정 · 공개
:as_o1
select test.fails($$select public.create_event('$$ || :'c1' || $$', '{"title":"겨울 공연","starts_at":"2026-12-12T19:00+09","price_krw":6000,"capacity":3,"publish":true}')$$, '유료 공개는 장소·계좌 필요');
select public.create_event(:'c1', '{"title":"겨울 공연","category":"공연","starts_at":"2026-12-12T19:00+09","venue_name":"라이브홀","price_krw":6000,"capacity":3,"bank_name":"카카오뱅크","account_number":"3333-00","publish":true}') as ev \gset
select id as tt from public.ticket_types where event_id = :'ev' \gset
select public.update_event(:'ev', '{"title":"겨울 연합 공연","category":"공연","starts_at":"2026-12-12T19:00+09","venue_name":"라이브홀","price_krw":6000,"capacity":3,"bank_name":"카카오뱅크","account_number":"3333-00"}');
select test.ok((select title from public.events where id = :'ev') = '겨울 연합 공연', '공연 수정');
:as_o2
select test.fails($$select public.update_event('$$ || :'ev' || $$', '{"title":"x","starts_at":"2026-12-12T19:00+09","capacity":3}')$$, '다른 동아리 공연 수정 불가');
:as_anon
select test.ok((select count(*) from public.events) = 1 and (select count(*) from public.ticket_types) = 1, '비로그인도 공개 공연·티켓 종류 조회');
select test.fails($$select * from public.bookings$$, '비로그인은 예매 조회 불가');

-- 4. 예매 (입금 대기) · 중복 요청 · 정원
:as_u
select public.create_booking(:'tt', 2, '김관객', 'req-1') as bk \gset
select test.ok((select total_amount_krw from public.bookings where id = :'bk') = 12000, '서버가 금액 계산');
select test.ok(public.create_booking(:'tt', 2, '김관객', 'req-1') = :'bk'::uuid, '같은 요청 키 재전송은 같은 예매');
select test.fails($$select public.create_booking('$$ || :'tt' || $$', 1, '김관객', 'req-1')$$, '같은 키로 다른 내용은 거부');
select test.fails($$select public.create_booking('$$ || :'tt' || $$', 2, '김관객')$$, '정원 초과 거부');
select test.fails($$select public.confirm_deposit('$$ || :'bk' || $$')$$, '관객은 입금 확인 불가');
select test.ok((select depositor_name from public.payments where booking_id = :'bk') = '김관객', '본인은 입금자명 확인');
select test.fails($$select * from public.qr_credentials$$, 'QR 해시 테이블 직접 조회 불가');

-- 5. 입금 기한 만료 → 자리 반환
:as_v
select public.create_booking(:'tt', 1, '이준') as bk_v \gset
reset role;
update public.bookings set created_at = now() - interval '4 days', expires_at = now() - interval '1 day' where id = :'bk_v';
:as_u
select public.create_booking(:'tt', 1, '김관객') as bk2 \gset
select test.ok((select count(*) from public.bookings where id = :'bk_v') = 0, '관객은 남의 예매를 못 봄');
reset role;
select test.ok((select status from public.bookings where id = :'bk_v') = 'EXPIRED', '기한 지난 예매는 만료되고 자리 반환');

-- 6. 입금 확인 → 발급
:as_o2
select test.fails($$select public.confirm_deposit('$$ || :'bk' || $$')$$, '다른 동아리는 입금 확인 불가');
select test.ok((select count(*) from public.bookings) = 0, '다른 동아리는 예매자 못 봄');
:as_o1
select test.ok((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'audience', '주최 운영진은 예매자 표시명 조회');
select public.confirm_deposit(:'bk');
select public.confirm_deposit(:'bk');
select test.ok((select count(*) from public.tickets where booking_id = :'bk') = 2, '수량만큼 발급, 두 번 눌러도 중복 없음');
select test.ok((select array_agg(entry_number order by issue_sequence) from public.tickets where booking_id = :'bk') = '{1,2}', '입장번호 순서대로');
select test.ok((select sold_quantity from public.ticket_types where id = :'tt') = 2, '판매 수량 반영');
select test.fails($$select public.delete_event('$$ || :'ev' || $$')$$, '예매 있는 공연 삭제 거부');
select test.fails($$select public.update_event('$$ || :'ev' || $$', '{"title":"겨울 연합 공연","starts_at":"2026-12-12T19:00+09","venue_name":"라이브홀","price_krw":7000,"capacity":3}')$$, '예매 있으면 가격 변경 거부');
select test.fails($$select public.update_event('$$ || :'ev' || $$', '{"title":"겨울 연합 공연","starts_at":"2026-12-12T19:00+09","venue_name":"라이브홀","price_krw":6000,"capacity":2}')$$, '예매 수량보다 정원 축소 거부');

-- 7. QR 발급 · 검증 · 입장
:as_u
select id as t1 from public.tickets where booking_id = :'bk' and issue_sequence = 1 \gset
select test.ok((select count(*) from public.notifications where type = 'BOOKING_CONFIRMED') = 1, '발급 알림');
select public.issue_ticket_qr(:'t1') as old_qr \gset
select public.issue_ticket_qr(:'t1') as qr \gset
:as_o2
select test.fails($$select public.issue_ticket_qr('$$ || :'t1' || $$')$$, '남의 티켓 QR 발급 불가');
select test.fails($$select public.verify_ticket('$$ || :'ev' || $$', '$$ || :'qr' || $$')$$, '다른 동아리는 검증 불가');
:as_o1
select test.ok(public.verify_ticket(:'ev', :'old_qr') ->> 'result' = 'invalid', '재발급 전 QR은 무효');
select test.ok(public.verify_ticket(:'ev', :'qr') ->> 'owner_name' = 'audience', '검증: 관객 정보 확인');
select test.ok((select status from public.tickets where id = :'t1') = 'ISSUED', '검증만으로는 입장 처리 안 됨');
select test.ok(public.check_in(:'ev', :'qr') ->> 'result' = 'valid', '입장 처리');
select test.ok(public.check_in(:'ev', :'qr') ->> 'result' = 'already_checked_in', '두 번째 스캔: 이미 입장');
select test.ok(public.verify_ticket(:'ev', 'nope') ->> 'result' = 'invalid', '없는 QR 무효');
:as_u
select test.ok((select count(*) from public.tickets where status = 'CHECKED_IN') = 1, '관객 화면에도 같은 입장 상태');
select test.fails($$select public.issue_ticket_qr('$$ || :'t1' || $$')$$, '입장한 티켓은 QR 재발급 불가');

-- 8. 취소
select public.cancel_booking(:'bk2');
select test.ok((select status from public.bookings where id = :'bk2') = 'CANCELLED', '입금 전 취소');
select test.fails($$select public.cancel_booking('$$ || :'bk' || $$')$$, '확정 예매 취소 불가');

-- 9. 무료 공연 즉시 확정
:as_o1
select public.create_event(:'c1', '{"title":"해커톤","category":"해커톤","starts_at":"2026-12-29T09:30+09","venue_name":"본사","price_krw":0,"capacity":5,"publish":true}') as ev2 \gset
select id as tt2 from public.ticket_types where event_id = :'ev2' \gset
:as_u
select public.create_booking(:'tt2', 1, '') as bk3 \gset
select test.ok((select status from public.bookings where id = :'bk3') = 'CONFIRMED', '무료 신청은 바로 확정');
select test.ok((select entry_number from public.tickets where booking_id = :'bk3') = 1, '공연마다 입장번호 1번부터');

-- 10. 교류 신청
:as_o1
select test.fails($$select public.request_exchange('$$ || :'c1' || $$', '$$ || :'c2' || $$', 'JOINT_SHOW')$$, '교류 닫힌 동아리에 신청 불가');
:as_o2
select public.update_club(:'c2', '{"exchange_open":true,"introduction":"연극 동아리"}');
:as_u
select test.fails($$select public.request_exchange('$$ || :'c1' || $$', '$$ || :'c2' || $$', 'JOINT_SHOW')$$, '회원 아니면 신청 불가');
:as_o1
select public.request_exchange(:'c1', :'c2', 'JOINT_SHOW', '같이 공연해요') as ex \gset
select test.fails($$select public.request_exchange('$$ || :'c1' || $$', '$$ || :'c2' || $$', 'PRACTICE')$$, '처리 전 중복 신청 불가');
select test.ok((select count(*) from public.club_private where club_id = :'c2') = 0, '수락 전 상대 오픈채팅 안 보임');
select test.fails($$select public.respond_exchange('$$ || :'ex' || $$', true)$$, '신청한 쪽은 수락 불가');
:as_o2
select public.respond_exchange(:'ex', true);
:as_o1
select test.ok((select open_chat_url from public.club_private where club_id = :'c2') = 'https://open.kakao.com/o/sun', '수락 후 오픈채팅 공개');
:as_u
select test.ok((select count(*) from public.club_private) = 0 and (select count(*) from public.exchange_requests) = 0, '관객은 교류 정보 못 봄');

-- 11. 알림 읽음 · 계정 설정 · 삭제
select public.mark_notifications_read();
select test.ok((select count(*) from public.notifications where read_at is null) = 0, '알림 모두 읽음');
select public.update_profile('김관객');
select test.ok((select display_name from public.profiles where id = auth.uid()) = '김관객', '표시 이름 수정');
:as_o1
select public.create_event(:'c1', '{"title":"지울 공연","starts_at":"2027-01-01T19:00+09","capacity":10}') as ev3 \gset
select public.delete_event(:'ev3');
select test.ok((select count(*) from public.events where id = :'ev3') = 0, '예매 없는 공연 삭제');
reset role;
select test.ok((select count(*) from public.audit_logs where action in ('CONFIRM_DEPOSIT', 'CHECK_IN')) = 2, '입금 확인·입장 감사 기록');
\echo 'ALL TESTS PASSED'
