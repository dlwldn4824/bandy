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
reset role;
update public.profiles set status = 'ACTIVE' where id = '00000000-0000-0000-0000-00000000000c';

-- 12-4. 입금 기한: 기한이 지나면 언제 눌러도 입금 확인 거부, 정리 함수가 만료·알림 처리
:as_v
select public.create_booking(:'tt5', 1, '이준', 'late-1') as bk_late \gset
select public.create_booking(:'tt5', 1, '이준', 'host-cancel-1') as bk_hc \gset
reset role;
update public.bookings set created_at = now() - interval '4 days', expires_at = now() - interval '1 day' where id = :'bk_late';
:as_o1
select test.fails_with($$select public.confirm_deposit('$$ || :'bk_late' || $$')$$, '만료', '기한 지난 예매는 입금 확인 거부');
reset role;
select test.ok(public.expire_overdue_bookings() = 1, '기한 지난 예매 일괄 정리');
:as_o1
select public.cancel_booking(:'bk_hc');
reset role;
select test.ok((select status from public.bookings where id = :'bk_late') = 'EXPIRED', '정리 후 만료 상태');
select test.ok((select reserved_quantity from public.ticket_types where id = :'tt5') = 0, '만료·취소분 자리 반환');
select test.ok((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-00000000000c'
                and event_id = :'ev5' and type in ('BOOKING_EXPIRED', 'BOOKING_CANCELLED')) = 2, '만료·주최 취소 알림');

-- 12-5. QR: 앞뒤 줄바꿈 허용, 취소된 공연은 입장 불가 + 대기 예매 정리
:as_u
select id as t2 from public.tickets where booking_id = :'bk' and issue_sequence = 2 \gset
select public.issue_ticket_qr(:'t2') as qr2 \gset
:as_o1
select test.ok(public.verify_ticket(:'ev', E'  ' || :'qr2' || E'\n') ->> 'result' = 'valid', '토큰 앞뒤 줄바꿈은 무시');
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
select test.fails_with($$select public.set_event_status('$$ || :'ev5' || $$', 'DRAFT')$$, '승인된 동아리만', '정지된 동아리는 공연 상태 변경 불가');
select test.ok((select message from public.notifications where type = 'CLUB_STATUS' order by created_at desc limit 1) like '%정지%', '정지 알림은 정지 문구');
:as_v
select test.ok((select count(*) from public.events where id = :'ev5') = 1, '정지 동아리 공연도 예매자에게 보임');
:as_admin
select public.set_club_status(:'c1', 'ACTIVE');
reset role;
select test.ok((select count(*) from public.audit_logs where action in ('CONFIRM_DEPOSIT', 'CHECK_IN')) = 2, '입금 확인·입장 감사 기록');
\echo 'ALL TESTS PASSED'
