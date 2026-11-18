import re, subprocess, json, sys
MIG='/home/user/bandy/supabase/migrations/20261118000000_bandy_app_backend.sql'
src=open(MIG).read()
env={'PGHOST':'/var/tmp/bandy-pg','PGPORT':'54329','PGUSER':'postgres','PATH':'/usr/bin:/bin'}
def q(sql):
    out=subprocess.run(['psql','-X','-At','-F','\t','-d','bandy_backend_test','-c',sql],capture_output=True,text=True,env=env)
    if out.returncode: print(out.stderr); sys.exit(1)
    return [l.split('\t') for l in out.stdout.strip().splitlines() if l]
# 원래 create table에 있던 컬럼(노션 초안 기준) vs alter add column(추가분)
base={}
for m in re.finditer(r'create table if not exists public\.(\w+) \((.*?)\n\);', src, re.S):
    cols=[]
    for line in m.group(2).splitlines():
        line=line.strip()
        mm=re.match(r'([a-z_]+) ', line)
        if mm and mm.group(1) not in ('check','unique','foreign','primary','constraint'): cols.append(mm.group(1))
    base[m.group(1)]=cols
added={}
for m in re.finditer(r'((?:--[^\n]*\n)*)alter table public\.(\w+) add column if not exists (\w+)[^;]*;([^\n]*)', src):
    comment=(m.group(1).strip().splitlines() or [''])[-1].lstrip('- ').strip()
    tail=m.group(4).strip().lstrip('-').strip()
    added[(m.group(2),m.group(3))]= tail or comment
NOTION=['profiles','clubs','club_memberships','events','ticket_types','bookings','booking_items','payments','tickets','qr_credentials','event_staff','notifications','audit_logs']
tables=[r[0] for r in q("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")]
cols=q("""select table_name, column_name, data_type, is_nullable, coalesce(column_default,'') from information_schema.columns
          where table_schema='public' order by table_name, ordinal_position""")
checks=q("""select conrelid::regclass::text, pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace and contype='c' order by 1""")
uniq=q("""select tablename, indexdef from pg_indexes where schemaname='public' and indexdef ilike '%unique%' order by 1""")
desc={'profiles':'회원(가입 시 자동 생성)','clubs':'동아리(운영자 승인 필요)','club_private':'동아리 오픈채팅 링크(교류 수락된 동아리·자기 동아리만 조회)',
'club_memberships':'동아리 회원·역할(회장·운영진·부원)','events':'공연','ticket_types':'티켓 종류(가격·정원·판매 마감)','bookings':'예매(사전 예매·현장 판매)',
'booking_items':'예매 항목(티켓 종류·수량)','payments':'결제(계좌이체 입금자명·현장 결제·환불)','tickets':'발급 티켓(입장번호·입장 상태)',
'qr_credentials':'QR 토큰 해시(앱에서 직접 조회 안 함)','event_staff':'공연 스태프(지금은 앱에서 추가 기능 없음)','notifications':'앱 안 알림','audit_logs':'감사 기록(입금 확인·입장 등)',
'exchange_requests':'동아리 교류 신청(11/1)'}
out=[]
out.append('## 테이블 정리\n')
out.append('노션 「밴디_Supabase_DB_설계초안_SQL기준」의 13개 테이블 + 추가 2개(`club_private`, `exchange_requests`). '
           '"출처"가 **노션**이면 초안에 있던 칸, 그 밖은 이 저장소에서 추가한 칸입니다(`alter table … add column if not exists`라 초안 SQL이 이미 실행된 DB에도 덧붙여짐).\n')
out.append('| 테이블 | 용도 | 출처 |\n|---|---|---|')
for t in tables:
    out.append(f"| `{t}` | {desc.get(t,'')} | {'노션 13개' if t in NOTION else '추가'} |")
out.append('')
for t in tables:
    out.append(f"### `{t}` — {desc.get(t,'')}\n")
    out.append('| 칸 | 타입 | 필수 | 기본값 | 출처 · 설명 |\n|---|---|---|---|---|')
    for tn,c,dt,nul,d in cols:
        if tn!=t: continue
        origin='노션' if (t in base and c in base[t] and t in NOTION) else ('추가' if t not in NOTION else '추가')
        note=added.get((t,c),'')
        d=d.replace('|','\\|')
        if len(d)>40: d=d[:40]+'…'
        out.append(f"| `{c}` | {dt} | {'' if nul=='YES' else '필수'} | {d} | {origin}{(' · '+note) if note else ''} |")
    cs=[c[1] for c in checks if c[0] in (t, 'public.'+t)]
    us=[re.sub(r'.*\bON public\.\w+ USING btree ', '', u[1]) for u in uniq if u[0]==t]
    if cs: out.append('\n**검사(CHECK):** ' + ' / '.join(f'`{c}`' for c in cs))
    if us: out.append('\n**고유(UNIQUE):** ' + ' / '.join(f'`{u}`' for u in us))
    out.append('')
open('tables.md','w').write('\n'.join(out))
fns=q("""select p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid),
         case when has_function_privilege('authenticated', p.oid, 'execute') then 'authenticated' when has_function_privilege('service_role', p.oid,'execute') then 'service_role' else '내부' end
         from pg_proc p where p.pronamespace='public'::regnamespace order by 4, 1""")
json.dump(fns, open('fns.json','w'), ensure_ascii=False)
print(len(tables),'tables', len(cols),'cols', len(fns),'fns')
