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
create function test.fails_with(stmt text, pattern text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if sqlerrm !~ pattern then raise exception 'FAIL: % — 거부 문구가 다름: %', msg, sqlerrm; end if;
    raise notice 'ok - % (거부: %)', msg, sqlerrm; return;
  end;
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
:as_admin
select public.create_booking(:'tt', 1, '운영자') as bk2 \gset
:as_u
select test.fails($$select public.create_booking('$$ || :'tt' || $$', 1, '김관객')$$, '한 공연에 입금 대기 예매는 1건');
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
:as_admin
select public.cancel_booking(:'bk2');
select test.ok((select status from public.bookings where id = :'bk2') = 'CANCELLED', '입금 전 취소');
:as_u
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

-- 12. 독립 검토(2026-11-17) 반영
-- 12-1. 예매자는 공연이 비공개·취소·동아리 정지여도 그 공연을 본다(내 티켓 화면 유지)
:as_o1
select public.set_event_status(:'ev2', 'DRAFT');
:as_u
select test.ok((select count(*) from public.events where id = :'ev2') = 1, '비공개로 돌린 공연도 예매자에게 보임');
:as_v
select test.ok((select count(*) from public.events where id = :'ev2') = 0, '예매 안 한 사람에게는 비공개 공연 안 보임');
:as_o1
select public.set_event_status(:'ev2', 'PUBLISHED');

-- 12-2. 지난 공연: 공개·예매 불가
select test.fails_with($$select public.create_event('$$ || :'c1' || $$', '{"title":"옛 공연","starts_at":"2020-01-01T19:00+09","venue_name":"홀","capacity":5,"publish":true}')$$, '지난 일시', '과거 일시로 공개 등록 불가');
select public.create_event(:'c1', '{"title":"유료 초안","starts_at":"2026-12-20T19:00+09","venue_name":"홀","price_krw":5000,"capacity":5}') as ev5 \gset
select id as tt5 from public.ticket_types where event_id = :'ev5' \gset
select test.fails_with($$select public.set_event_status('$$ || :'ev5' || $$', 'PUBLISHED')$$, '입금 계좌', '계좌 없는 유료 공연은 공개 전환 불가');
select public.update_event(:'ev5', '{"title":"유료 공연","bank_name":"카카오뱅크","account_number":"3333-55"}');
select test.ok((select price_krw from public.ticket_types where id = :'tt5') = 5000, '가격을 안 보내면 기존 가격 유지');
select public.set_event_status(:'ev5', 'PUBLISHED');
select test.fails_with($$select public.update_event('$$ || :'ev5' || $$', '{"account_number":""}')$$, '입금 계좌', '공개 중 유료 공연의 계좌 삭제 불가');
select test.fails_with($$select public.set_event_status('$$ || :'ev5' || $$', 'OPEN')$$, '알 수 없는', '없는 상태값은 한국어로 거부');
select test.fails_with($$select public.create_event('$$ || :'c1' || $$', '{"title":"x","starts_at":"2026-12-20T19:00+09","capacity":5,"price_krw":"abc"}')$$, '숫자로', '숫자 형식 오류는 한국어 안내');
select test.fails_with($$select public.create_event('$$ || :'c1' || $$', '{"title":"x","starts_at":"내일","capacity":5}')$$, '일시 형식', '일시 형식 오류는 한국어 안내');
select test.fails_with($$select public.create_event('$$ || :'c1' || $$', '{"title":"x","starts_at":"2026-12-20T19:00+09","capacity":5,"latitude":"200"}')$$, '좌표', '좌표 범위 오류는 한국어 안내');
reset role;
update public.events set starts_at = now() - interval '1 hour' where id = :'ev2';
:as_v
select test.fails_with($$select public.create_booking('$$ || :'tt2' || $$', 1, '')$$, '마감', '시작한 공연은 예매 불가');
reset role;
update public.events set starts_at = '2026-12-29T09:30+09' where id = :'ev2';

-- 12-3. 입금자명 길이 · 정지 회원
:as_v
select test.fails_with($$select public.create_booking('$$ || :'tt5' || $$', 1, repeat('가', 21))$$, '20자', '입금자명 20자 초과 거부');
reset role;
update public.profiles set status = 'SUSPENDED' where id = '00000000-0000-0000-0000-00000000000c';
:as_v
select test.fails_with($$select public.create_booking('$$ || :'tt5' || $$', 1, '이준')$$, '제한된 계정', '정지 회원은 예매 불가');
select test.fails_with($$select public.create_club('{"name":"정지밴드"}')$$, '제한된 계정', '정지 회원은 동아리 등록 불가');
select public.update_profile('viewer');
reset role;
update public.profiles set status = 'ACTIVE' where id = '00000000-0000-0000-0000-00000000000c';

-- 12-4. 입금 기한: 기한이 지나면 언제 눌러도 입금 확인 거부, 정리 함수가 만료·알림 처리
:as_v
select public.create_booking(:'tt5', 1, '이준', 'late-1') as bk_late \gset
:as_admin
select public.create_booking(:'tt5', 1, '운영자', 'host-cancel-1') as bk_hc \gset
reset role;
update public.bookings set created_at = now() - interval '4 days', expires_at = now() - interval '1 day' where id = :'bk_late';
:as_o1
select test.ok(public.confirm_deposit(:'bk_late') = 'EXPIRED', '기한 지난 예매는 입금 확인 대신 만료로 응답');
reset role;
select test.ok((select status from public.bookings where id = :'bk_late') = 'EXPIRED', '만료가 되돌려지지 않고 저장됨');
update public.bookings set status = 'PENDING_PAYMENT', updated_at = now() where id = :'bk_late';
update public.payments set status = 'PENDING', failure_code = null where booking_id = :'bk_late';
update public.ticket_types set reserved_quantity = reserved_quantity + 1 where id = :'tt5';
select test.ok(public.expire_overdue_bookings() = 1, '기한 지난 예매 일괄 정리');
:as_o1
select public.cancel_booking(:'bk_hc');
reset role;
select test.ok((select status from public.bookings where id = :'bk_late') = 'EXPIRED', '정리 후 만료 상태');
select test.ok((select reserved_quantity from public.ticket_types where id = :'tt5') = 0, '만료·취소분 자리 반환');
select test.ok((select count(*) from public.notifications where event_id = :'ev5' and type in ('BOOKING_EXPIRED', 'BOOKING_CANCELLED')
                and user_id in ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a')) = 2, '만료·주최 취소 알림');
:as_v
select public.cancel_booking(:'bk_late');
select test.ok((select status from public.bookings where id = :'bk_late') = 'EXPIRED', '이미 만료된 예매를 취소해도 오류 없이 그대로');

-- 12-5. QR: 앞뒤 줄바꿈 허용, 취소된 공연은 입장 불가 + 대기 예매 정리
:as_u
select id as t2 from public.tickets where booking_id = :'bk' and issue_sequence = 2 \gset
select public.issue_ticket_qr(:'t2') as qr2 \gset
:as_o1
select test.ok(public.verify_ticket(:'ev', E'  ' || :'qr2' || E'\n') ->> 'result' = 'valid', '토큰 앞뒤 줄바꿈은 무시');
reset role;
update public.profiles set status = 'SUSPENDED' where id = '00000000-0000-0000-0000-00000000000b';
:as_u
select test.ok(length(public.issue_ticket_qr(:'t2')) > 0, '정지 회원도 이미 산 티켓 QR은 받음');
select public.issue_ticket_qr(:'t2') as qr2 \gset
reset role;
update public.profiles set status = 'ACTIVE' where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set status = 'SUSPENDED' where id = '00000000-0000-0000-0000-000000000001';
:as_o1
select test.fails_with($$select public.verify_ticket('$$ || :'ev' || $$', 'x')$$, '제한된 계정', '정지된 운영진은 입장 처리 불가');
reset role;
update public.profiles set status = 'ACTIVE' where id = '00000000-0000-0000-0000-000000000001';
:as_o1
:as_v
select public.create_booking(:'tt', 1, '이준', 'pend-ev') as bk_pend \gset
:as_o1
select public.set_event_status(:'ev', 'CANCELLED');
select test.ok(public.verify_ticket(:'ev', :'qr2') ->> 'result' = 'invalid', '취소된 공연 QR은 입장 불가');
select test.ok((select status from public.bookings where id = :'bk_pend') = 'CANCELLED', '공연 취소 시 입금 대기 예매 취소');
select test.fails_with($$select public.set_event_status('$$ || :'ev' || $$', 'PUBLISHED')$$, '다시 열 수 없', '취소된 공연은 다시 공개 불가');
:as_u
select test.ok((select count(*) from public.events where id = :'ev') = 1, '취소된 공연도 예매자에게 보임');
select test.ok((select count(*) from public.notifications where type = 'EVENT_CANCELLED') = 1, '확정 예매자에게 공연 취소 알림');
select test.fails_with($$select public.issue_ticket_qr('$$ || :'t2' || $$')$$, '취소된 공연', '취소된 공연은 QR 발급 불가');

-- 12-6. 동아리 링크 · 등록 남용
:as_o1
select test.fails_with($$select public.update_club('$$ || :'c1' || $$', '{"sns_url":"javascript:alert(1)"}')$$, 'http', 'javascript: SNS 링크 거부');
select test.fails_with($$select public.update_club('$$ || :'c1' || $$', '{"open_chat_url":"javascript:alert(1)"}')$$, 'http', 'javascript: 오픈채팅 링크 거부');
select public.update_club(:'c1', '{"sns_url":"https://instagram.com/rexa"}');
:as_u
select public.create_club('{"name":"새밴드"}') as c3 \gset
select test.fails_with($$select public.create_club('{"name":"새밴드2"}')$$, '승인 대기', '승인 대기 동아리는 1건까지');

-- 12-7. 교류: 자기 자신 · 역방향 대기 · 이미 교류 중 · 부원(MEMBER)은 알림 안 받음
:as_o1
select test.fails_with($$select public.request_exchange('$$ || :'c1' || $$', '$$ || :'c1' || $$', 'PRACTICE')$$, '같은 동아리', '자기 동아리 신청은 한국어로 거부');
select test.fails_with($$select public.request_exchange('$$ || :'c1' || $$', '$$ || :'c2' || $$', 'PRACTICE')$$, '이미 교류 중', '이미 교류 중이면 재신청 불가');

-- 12-8. 부원 · 운영진: 가입 신청 → 수락 → 회장이 운영진 지정 → 입금 확인 가능
:as_v
select public.request_club_join(:'c1') as mem_v \gset
:as_o1
select test.ok((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000c') = 'viewer', '운영진은 가입 신청자 이름 확인');
select public.respond_club_join(:'mem_v', true);
:as_v
select test.fails_with($$select public.confirm_deposit('$$ || :'bk_late' || $$')$$, '찾지 못', '부원(MEMBER)은 입금 확인 불가');
:as_o1
select public.set_member_role(:'mem_v', 'MANAGER');
:as_v
select test.ok((select count(*) from public.bookings where event_id = :'ev5') >= 1, '운영진이 되면 예매자 명단 조회');
select test.fails_with($$select public.set_member_role('$$ || :'mem_v' || $$', 'MEMBER')$$, '회장만', '운영진은 역할 변경 불가');
select public.remove_member(:'mem_v');
:as_o1
select test.fails_with($$select public.remove_member((select id from public.club_memberships where user_id = auth.uid() and role = 'OWNER' limit 1))$$, '회장은', '회장은 탈퇴 불가');

-- 12-9. 동아리 정지: 공연 공개·입금 확인 중단, 알림 문구
:as_v
select public.create_booking(:'tt5', 1, '이준', 'susp-1') as bk_s \gset
:as_admin
select public.set_club_status(:'c1', 'SUSPENDED');
:as_o1
select test.fails_with($$select public.confirm_deposit('$$ || :'bk_s' || $$')$$, '승인된 동아리만', '정지된 동아리는 입금 확인 불가');
select test.fails_with($$select public.update_club('$$ || :'c1' || $$', '{"introduction":"x"}')$$, '정지된 동아리', '정지된 동아리는 정보 수정 불가');
select public.set_event_status(:'ev5', 'DRAFT');
select test.fails_with($$select public.set_event_status('$$ || :'ev5' || $$', 'PUBLISHED')$$, '승인된 동아리만', '정지된 동아리는 공개 불가(비공개는 가능)');
select public.set_event_status(:'ev5', 'CANCELLED');
select test.ok((select status from public.bookings where id = :'bk_s') = 'CANCELLED', '정지된 동아리도 공연 취소로 대기 예매 정리');
select test.ok((select message from public.notifications where type = 'CLUB_STATUS' order by created_at desc limit 1) like '%정지%', '정지 알림은 정지 문구');
:as_v
select test.ok((select count(*) from public.events where id = :'ev5') = 1, '정지 동아리 공연도 예매자에게 보임');
select test.ok((select count(*) from public.notifications where type = 'EVENT_CANCELLED' and message like '[유료 공연] %') = 1, '취소 알림 문구에 공연명을 괄호로');
:as_admin
select public.set_club_status(:'c1', 'ACTIVE');

-- 12-10. 티켓 종류가 두 개인 공연 취소: 각 종류의 잡아 둔 수량을 각각 돌려준다
:as_o1
select public.create_event(:'c1', '{"title":"두 종류","starts_at":"2026-12-27T19:00+09","venue_name":"홀","price_krw":3000,"capacity":5,"bank_name":"b","account_number":"1","publish":true}') as ev6 \gset
reset role;
insert into public.ticket_types (event_id, name, price_krw, capacity, sales_ends_at)
  select :'ev6', '학생', 2000, 5, starts_at from public.events where id = :'ev6' returning id as tt6b \gset
select id as tt6a from public.ticket_types where event_id = :'ev6' and name = '일반' \gset
:as_u
select public.create_booking(:'tt6a', 1, '김관객', 'two-a') is not null as x \gset
:as_v
select public.create_booking(:'tt6b', 2, '이준', 'two-b') is not null as x \gset
:as_o1
select public.set_event_status(:'ev6', 'CANCELLED');
reset role;
select test.ok((select sum(reserved_quantity) from public.ticket_types where event_id = :'ev6') = 0, '두 종류 공연 취소 시 각 종류 수량 반환');

-- 13. 모바일 편의: 홈 신호 · 입금했어요
:as_anon
select test.ok((public.my_home_state() ->> 'signed_in')::boolean = false, '비로그인 홈 신호');
:as_o1
select public.create_event(:'c1', jsonb_build_object('title', '오늘 공연', 'starts_at', (now() + interval '2 hours')::text, 'venue_name', '홀', 'price_krw', 1000, 'capacity', 10, 'bank_name', '카카오뱅크', 'account_number', '3333-77', 'publish', true)) as ev7 \gset
select id as tt7 from public.ticket_types where event_id = :'ev7' \gset
select test.ok(public.my_home_state() ->> 'prompt' = 'STAFF_TODAY', '운영진: 오늘 공연 → 입장 관리 신호');
:as_v
select public.create_booking(:'tt7', 1, '이준', 'home-1') as bk7 \gset
select test.ok(public.my_home_state() ->> 'prompt' = 'PAYMENT_DUE', '관객: 기한 임박 입금 대기 → 계좌 안내 신호');
select test.ok(jsonb_array_length(public.my_home_state() -> 'pending_payments') = 1, '입금 대기 목록');
select public.mark_deposit_sent(:'bk7');
select test.fails_with($$select public.mark_deposit_sent('$$ || :'bk7' || $$')$$, '이미 알렸', '입금했어요는 10분에 한 번');
:as_u
select test.fails_with($$select public.mark_deposit_sent('$$ || :'bk7' || $$')$$, '찾지 못', '남의 예매에는 입금했어요 불가');
:as_o1
select test.ok((select count(*) from public.notifications where type = 'DEPOSIT_SENT' and event_id = :'ev7') = 1, '운영진에게 입금했어요 알림');
select test.ok((select depositor_notified_at is not null from public.payments where booking_id = :'bk7'), '운영진이 입금 알림 시각 확인');
select public.confirm_deposit(:'bk7');
:as_v
select test.ok(public.my_home_state() ->> 'prompt' = 'TICKET_NOW', '관객: 곧 시작하는 공연 티켓 → QR 바로 열기 신호');
select test.ok((public.my_home_state() -> 'next_ticket' ->> 'event_id')::uuid = :'ev7'::uuid, '바로 열 티켓의 공연');
select test.ok((public.my_home_state() ->> 'unread_notifications')::int >= 1, '안 읽은 알림 수');

-- 14. 시간 기준 정합성(입금 기한 · 공연 일정 변경 · QR 유효시간)
:as_o1
select public.create_event(:'c1', jsonb_build_object('title', '시간 시험', 'starts_at', (now() + interval '5 days')::text, 'venue_name', '홀', 'price_krw', 5000, 'capacity', 10, 'bank_name', 'b', 'account_number', '1', 'publish', true)) as ev8 \gset
select id as tt8 from public.ticket_types where event_id = :'ev8' \gset
:as_u
select public.create_booking(:'tt8', 1, '김관객', 'time-1') as bk8a \gset
:as_v
select public.create_booking(:'tt8', 1, '이준', 'time-2') as bk8b \gset
:as_u
select test.ok((select expires_at <= (select ends_at from public.events where id = :'ev8') from public.bookings where id = :'bk8a'), '입금 기한은 공연 끝을 넘지 않음');
select public.mark_deposit_sent(:'bk8a');
reset role;
update public.bookings set created_at = now() - interval '3 days 1 hour', expires_at = now() - interval '1 hour' where id = :'bk8a';
select test.ok(public.expire_overdue_bookings() = 0, '기한 안에 입금했다고 알린 예매는 일괄 만료에서 제외');
:as_o1
select test.ok(public.confirm_deposit(:'bk8a') = 'CONFIRMED', '기한 안에 알린 예매는 기한 뒤에도 입금 확인 가능');
select public.update_event(:'ev8', jsonb_build_object('starts_at', (now() + interval '1 hour')::text, 'venue_name', '새 홀'));
reset role;
select test.ok((select b.expires_at <= e.ends_at from public.bookings b join public.events e on e.id = b.event_id where b.id = :'bk8b'), '공연을 앞당기면 입금 기한도 새 공연 끝 이전으로');
select test.ok((select count(*) from public.notifications where type = 'EVENT_CHANGED' and event_id = :'ev8') = 2, '예매자 두 명 모두에게 일정·장소 변경 알림');
:as_u
select id as t8 from public.tickets where booking_id = :'bk8a' \gset
select public.issue_ticket_qr(:'t8') is not null as x \gset
reset role;
select test.ok((select expires_at >= now() + interval '23 hours' from public.qr_credentials where ticket_id = :'t8' and revoked_at is null), 'QR은 최소 24시간 유효');
:as_o1
select public.update_event(:'ev8', jsonb_build_object('starts_at', (now() + interval '3 days')::text));
:as_u
select public.issue_ticket_qr(:'t8') is not null as x \gset
reset role;
select test.ok((select expires_at >= (select ends_at from public.events where id = :'ev8') from public.qr_credentials where ticket_id = :'t8' and revoked_at is null), '미리 받은 QR도 공연이 끝날 때까지 유효');
:as_v
select public.mark_deposit_sent(:'bk8b');
select public.cancel_booking(:'bk8b');
reset role;
select test.ok((select count(*) from public.notifications where type = 'BOOKING_CANCELLED_AFTER_DEPOSIT' and event_id = :'ev8') >= 1, '입금했다고 알린 뒤 취소하면 운영진에게 환불 확인 알림');

-- 15. 진행 시간 · 일정 변경 후 유지/환불 요청 · 공연 취소 환불
:as_o1
select public.create_event(:'c1', jsonb_build_object('title', '진행 시간', 'starts_at', (now() + interval '2 days')::text, 'duration_minutes', 90, 'venue_name', '홀', 'price_krw', 4000, 'capacity', 10, 'bank_name', 'b', 'account_number', '1', 'publish', true)) as ev9 \gset
select test.ok((select ends_at - starts_at from public.events where id = :'ev9') = interval '90 minutes', '진행 시간 90분 → 끝 시각');
select test.fails_with($$select public.create_event('$$ || :'c1' || $$', '{"title":"x","starts_at":"2026-12-20T19:00+09","capacity":5,"duration_minutes":5}')$$, '진행 시간', '진행 시간 10분 미만 거부');
select id as tt9 from public.ticket_types where event_id = :'ev9' \gset
:as_u
select public.create_booking(:'tt9', 2, '김관객', 'chg-1') as bk9 \gset
select test.fails_with($$select public.request_refund('$$ || :'bk9' || $$', '카카오 3333-1 김관객')$$, '일정이 바뀐', '일정 변경·공연 취소가 아니면 환불 요청 불가');
:as_o1
select public.confirm_deposit(:'bk9');
select public.update_event(:'ev9', jsonb_build_object('starts_at', (now() + interval '3 days')::text));
select test.ok((select ends_at - starts_at from public.events where id = :'ev9') = interval '90 minutes', '시작을 옮겨도 진행 시간 유지');
:as_u
select test.ok(public.my_home_state() ->> 'prompt' = 'EVENT_CHANGED', '일정 변경 → 유지/환불 선택 신호');
select test.fails_with($$select public.request_refund('$$ || :'bk9' || $$', '')$$, '환불받을 계좌', '환불 계좌 없이 요청 불가');
select public.request_refund(:'bk9', '카카오뱅크 3333-01 김관객');
select test.ok((select status from public.bookings where id = :'bk9') = 'CANCELLED', '환불 요청하면 예매 취소');
select test.ok((select count(*) from public.tickets where booking_id = :'bk9' and status = 'CANCELLED') = 2, '티켓 무효');
select test.ok((select status from public.payments where booking_id = :'bk9') = 'REFUND_PENDING', '결제는 환불 대기');
:as_o1
select test.ok((select sold_quantity from public.ticket_types where id = :'tt9') = 0, '자리 반환');
select test.ok((public.my_home_state() -> 'refund_requests' -> 0 ->> 'booking_id')::uuid = :'bk9'::uuid, '운영진 홈에 환불 요청');
select test.ok((select refund_account from public.payments where booking_id = :'bk9') = '카카오뱅크 3333-01 김관객', '운영진은 환불 계좌 확인');
:as_v
select test.fails_with($$select public.mark_refunded('$$ || :'bk9' || $$')$$, '찾지 못', '다른 사람은 환불 완료 불가');
:as_o1
select public.mark_refunded(:'bk9');
:as_u
select test.ok((select status from public.payments where booking_id = :'bk9') = 'REFUNDED', '환불 완료');
select test.ok((select count(*) from public.notifications where type = 'REFUNDED') = 1, '환불 완료 알림');
-- 유지 선택
:as_v
select public.create_booking(:'tt9', 1, '이준', 'chg-2') as bk9b \gset
:as_o1
select public.update_event(:'ev9', jsonb_build_object('venue_name', '바뀐 홀'));
:as_v
select test.ok(public.my_home_state() ->> 'prompt' = 'EVENT_CHANGED', '입금 대기 예매자도 변경 신호');
select public.ack_event_change(:'bk9b');
select test.ok(coalesce(public.my_home_state() ->> 'prompt', '') <> 'EVENT_CHANGED', '유지를 고르면 다시 묻지 않음');
-- 공연 취소 → 확정 예매자 환불 요청
:as_o1
select public.confirm_deposit(:'bk9b');
select public.set_event_status(:'ev9', 'CANCELLED');
:as_v
select public.request_refund(:'bk9b', '국민 123-45 이준');
select test.ok((select status from public.payments where booking_id = :'bk9b') = 'REFUND_PENDING', '공연 취소 후 환불 요청');

-- 16. 3차 검토 반영
:as_o1
select public.create_event(:'c1', jsonb_build_object('title', '현장 입금', 'starts_at', (now() + interval '1 hour')::text, 'duration_minutes', 120, 'venue_name', '홀', 'price_krw', 3000, 'capacity', 4, 'bank_name', 'b', 'account_number', '1', 'publish', true)) as ev10 \gset
select id as tt10 from public.ticket_types where event_id = :'ev10' \gset
:as_v
select public.create_booking(:'tt10', 2, '이준', 'door-1') as bk10 \gset
select test.ok((select b.expires_at = e.ends_at from public.bookings b join public.events e on e.id = b.event_id where b.id = :'bk10'), '입금 기한 = 공연 끝(현장 입금도 공연 중 확인)');
reset role;
update public.events set starts_at = now() - interval '30 minutes', ends_at = now() + interval '90 minutes' where id = :'ev10';
:as_o1
select test.ok(public.confirm_deposit(:'bk10') = 'CONFIRMED', '공연 시작 뒤에도 공연 중이면 입금 확인 가능');
-- '입금했어요'만 누르고 입금 안 함 → 기한 + 24시간 뒤 만료
:as_u
select public.create_booking(:'tt8', 1, '김관객', 'hold-1') as bk11 \gset
select public.mark_deposit_sent(:'bk11');
reset role;
update public.payments set updated_at = now() - interval '11 minutes' where booking_id = :'bk11';
:as_u
select public.mark_deposit_sent(:'bk11');
reset role;
update public.payments set updated_at = now() - interval '11 minutes' where booking_id = :'bk11';
:as_u
select public.mark_deposit_sent(:'bk11');
reset role;
update public.payments set updated_at = now() - interval '11 minutes' where booking_id = :'bk11';
:as_u
select test.fails_with($$select public.mark_deposit_sent('$$ || :'bk11' || $$')$$, '여러 번', '입금했어요는 3번까지');
reset role;
update public.bookings set created_at = now() - interval '5 days', expires_at = now() - interval '23 hours' where id = :'bk11';
select test.ok(public.expire_overdue_bookings() = 0, '알린 예매는 기한 + 24시간까지 유지');
update public.bookings set expires_at = now() - interval '25 hours' where id = :'bk11';
select test.ok(public.expire_overdue_bookings() = 1, '알리고 입금 안 하면 기한 + 24시간 뒤 만료');
select test.ok((select status from public.bookings where id = :'bk11') = 'EXPIRED', '자리를 영원히 잡지 못함');
-- 장소 띄어쓰기만 바꾸면 일정 변경 아님, 진짜 바뀌면 이전 값 보관
:as_o1
select coalesce((select schedule_changed_at::text from public.events where id = :'ev8'), '') as before_change \gset
select public.update_event(:'ev8', jsonb_build_object('venue_name', '  새   홀 '));
select test.ok(coalesce((select schedule_changed_at::text from public.events where id = :'ev8'), '') = :'before_change', '장소 띄어쓰기만 고치면 일정 변경 아님');
select public.update_event(:'ev8', jsonb_build_object('venue_name', '다른 홀'));
select test.ok((select previous_venue_name from public.events where id = :'ev8') = '새 홀', '바뀌기 전 장소 보관');
-- 환불 계좌: 공연 스태프는 못 보고, 환불을 마치면 지움
reset role;
insert into public.event_staff (event_id, user_id) values (:'ev9', '00000000-0000-0000-0000-000000000002');
:as_o2
select test.ok((select count(*) from public.payments p join public.bookings b on b.id = p.booking_id where b.event_id = :'ev9') = 0, '공연 스태프는 결제·환불 계좌 못 봄');
:as_o1
select public.mark_refunded(:'bk9b');
select test.ok((select refund_account from public.payments where booking_id = :'bk9b') = '', '환불을 마치면 환불 계좌 삭제');
-- 끝난 공연 QR 발급 불가
reset role;
update public.events set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = :'ev10';
:as_v
select id as t10 from public.tickets where booking_id = :'bk10' limit 1 \gset
select test.fails_with($$select public.issue_ticket_qr('$$ || :'t10' || $$')$$, '끝난 공연', '끝난 공연은 QR 발급 불가');

-- 17. 오타 · 실수 바로잡기(FAQ 교차검증)
:as_o1
select public.create_event(:'c1', jsonb_build_object('title', '실수 시험', 'starts_at', (now() + interval '3 days')::text, 'venue_name', '홀', 'price_krw', 2000, 'capacity', 5, 'bank_name', '카카오뱅크', 'account_number', '3333-오타', 'publish', true)) as ev12 \gset
select id as tt12 from public.ticket_types where event_id = :'ev12' \gset
select test.fails_with($$select public.create_event('$$ || :'c1' || $$', jsonb_build_object('title', repeat('가', 61), 'starts_at', '2026-12-20T19:00+09', 'capacity', 5))$$, '60자', '공연명 60자 제한');
select public.update_club(:'c1', '{"sns_url":"instagram.com/rexa_band"}');
select test.ok((select sns_url from public.clubs where id = :'c1') = 'https://instagram.com/rexa_band', 'https 없이 쓴 SNS 주소 자동 보정');
:as_u
select public.create_booking(:'tt12', 2, '김관객오타', 'faq-1') as bk12 \gset
select public.update_depositor_name(:'bk12', '김관객');
select test.ok((select depositor_name from public.payments where booking_id = :'bk12') = '김관객', '입금 전 입금자명 수정');
:as_v
select test.fails_with($$select public.update_depositor_name('$$ || :'bk12' || $$', '남')$$, '찾지 못', '남의 입금자명 수정 불가');
:as_o1
select public.update_event(:'ev12', '{"account_number":"3333-01-1234567"}');
:as_u
select test.ok((select count(*) from public.notifications where type = 'ACCOUNT_CHANGED' and event_id = :'ev12') = 1, '입금 계좌가 바뀌면 입금 대기 예매자에게 알림');
:as_o1
select public.confirm_deposit(:'bk12');
select public.undo_confirm_deposit(:'bk12');
select test.ok((select status from public.bookings where id = :'bk12') = 'PENDING_PAYMENT', '잘못 누른 입금 확인 되돌리기');
select test.ok((select count(*) from public.tickets where booking_id = :'bk12' and status = 'CANCELLED') = 2, '되돌리면 티켓 무효');
select test.ok((select reserved_quantity = 2 and sold_quantity = 0 from public.ticket_types where id = :'tt12'), '되돌리면 수량 원상복구');
:as_u
select test.fails_with($$select public.update_depositor_name('$$ || :'bk12' || $$', '')$$, '1~20자', '빈 입금자명 거부');
:as_o1
select public.confirm_deposit(:'bk12');
:as_u
select id as t12 from public.tickets where booking_id = :'bk12' and status = 'ISSUED' order by issue_sequence limit 1 \gset
select public.issue_ticket_qr(:'t12') as qr12 \gset
:as_o1
select public.check_in(:'ev12', :'qr12') is not null as x \gset
select test.fails_with($$select public.undo_confirm_deposit('$$ || :'bk12' || $$')$$, '입장한', '입장한 티켓이 있으면 입금 확인 되돌리기 불가');
select public.undo_check_in(:'t12');
select test.ok((select status from public.tickets where id = :'t12') = 'ISSUED', '잘못 누른 입장 처리 되돌리기');
-- 늦은 입금
:as_v
select public.create_booking(:'tt12', 1, '이준', 'faq-late') as bk13 \gset
reset role;
update public.bookings set created_at = now() - interval '4 days', expires_at = now() - interval '1 hour' where id = :'bk13';
select public.expire_overdue_bookings() >= 1 as x \gset
:as_o1
select public.confirm_late_deposit(:'bk13');
select test.ok((select status from public.bookings where id = :'bk13') = 'CONFIRMED', '만료 뒤 들어온 입금을 늦은 입금으로 확인');
select test.ok((select reserved_quantity = 0 and sold_quantity = 3 from public.ticket_types where id = :'tt12'), '늦은 입금 확인 후 수량 정확');
-- 환불 계좌 수정
select public.set_event_status(:'ev12', 'CANCELLED');
:as_v
select public.request_refund(:'bk13', '국민 123 오타');
select public.update_refund_account(:'bk13', '국민 123-45-678 이준');
select test.ok((select refund_account from public.payments where booking_id = :'bk13') = '국민 123-45-678 이준', '환불 계좌 오타 수정');
-- 회장 넘기기
:as_v
select public.request_club_join(:'c1') as mem_v2 \gset
:as_o1
select public.respond_club_join(:'mem_v2', true);
select public.transfer_ownership(:'mem_v2');
select test.ok((select role from public.club_memberships where id = :'mem_v2') = 'OWNER'
  and (select role from public.club_memberships where club_id = :'c1' and user_id = '00000000-0000-0000-0000-000000000001') = 'MANAGER', '회장 넘기기(이전 회장은 운영진)');
:as_v
select public.transfer_ownership((select id from public.club_memberships where club_id = :'c1' and user_id = '00000000-0000-0000-0000-000000000001'));
reset role;
select test.ok((select count(*) from public.audit_logs where action = 'CHECK_IN') = 2
  and (select count(*) from public.audit_logs where action = 'CONFIRM_DEPOSIT') = 8, '입금 확인 8건·입장 2건 감사 기록(테스트 시나리오와 정확히 일치)');
\echo 'ALL TESTS PASSED'
