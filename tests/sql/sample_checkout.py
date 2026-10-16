#!/usr/bin/env python3
"""Disposable PostgreSQL integration checks; never contacts Supabase.
  docker run -d --name crownetic-sample-invoice-test -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine
  python3 tests/sql/sample_checkout.py --container crownetic-sample-invoice-test
  docker rm -f crownetic-sample-invoice-test
Recreates only crownetic_sample_checkout inside the named disposable container.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse, json, subprocess, uuid
ROOT = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser(); p.add_argument('--container', required=True)
CONTAINER = p.parse_args().container
if not CONTAINER.startswith('crownetic-'): raise SystemExit('Use a disposable crownetic-... container')
DB = 'crownetic_sample_checkout'
U1, U2, U3 = [f'10000000-0000-0000-0000-00000000000{i}' for i in range(1, 4)]
checks = 0

def sql(query, role=None, user=None, fail=None, db=DB):
    global checks
    prefix = f'SET ROLE {role};' if role else ''
    if user: prefix += f"SET request.jwt.claim.sub='{user}';"
    r = subprocess.run(['docker','exec','-i',CONTAINER,'psql','-U','postgres','-d',db,'-qAt','-v','ON_ERROR_STOP=1'], input=prefix+query, text=True, capture_output=True)
    if fail is not None:
        assert r.returncode and fail in r.stderr, (query, r.stdout, r.stderr); checks += 1; return
    assert r.returncode == 0, (query, r.stderr)
    return r.stdout.strip()

def literal(value): return "'" + str(value).replace("'", "''") + "'"
def rpc(name, args, role='service_role', user=None, fail=None):
    return sql(f'select public.{name}('+','.join('null' if v is None else literal(v) for v in args)+');', role, user, fail)
def create(data, **kw): return rpc('create_sample_order', [json.dumps(data)], **kw)
def check(value):
    global checks
    assert value; checks += 1

def order(user=U1):
    request = str(uuid.uuid4())
    lines = [{'product_id':'20000000-0000-0000-0000-000000000001','size':'M','quantity':2}]
    return {'id':str(uuid.uuid4()),'user_id':user,'request_id':request,'created_at':'2026-10-16T12:00:00Z','customer_name':'Sample Customer','customer_email':'first@example.invalid' if user==U1 else 'second@example.invalid','billing_address':'Sample road','postcode':'50000','country':'Malaysia','items':[{**lines[0],'name':'Snapshot tee','unit_price_sen':1000,'reward_points':100}],'subtotal_sen':2000,'shipping_sen':0,'total_sen':2000,'item_count':2,'request_payload':{'request_id':request,'items':lines,'customer':{'name':'Sample Customer','address':'Sample road','postcode':'50000','country':'Malaysia'},'expected_total_sen':2000}}

sql("DO $$ BEGIN IF NOT EXISTS (select 1 from pg_roles where rolname='anon') THEN CREATE ROLE anon nologin; CREATE ROLE authenticated nologin; CREATE ROLE service_role nologin bypassrls; END IF; END $$;", db='postgres')
sql(f'DROP DATABASE IF EXISTS {DB}; CREATE DATABASE {DB};', db='postgres')
sql("""create schema auth; create schema storage;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now(),raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
alter default privileges in schema public grant all on tables to anon,authenticated;
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
""")
for migration in ['001_catalog.sql','002_product_angles.sql','003_customer_rewards.sql','004_admin_portal.sql','005_sample_checkout.sql']:
    sql((ROOT/'supabase'/migration).read_text())
sql(f"insert into auth.users(id,email,email_confirmed_at) values ('{U1}','first@example.invalid',now()),('{U2}','second@example.invalid',now()),('{U3}','unconfirmed@example.invalid',null); insert into public.products(id,name,category,description,price_sen,image_url,published) values ('20000000-0000-0000-0000-000000000001','Tee','Tees','Cotton',1000,'https://example.invalid/t.png',true); insert into public.product_variants values ('20000000-0000-0000-0000-000000000001','M',7);")
payload = order()
first = json.loads(create(payload)); oid = first['id']
check(first['reference']=='SAMPLE-'+oid.upper() and first['email_status']=='pending')
replay = {**payload,'id':str(uuid.uuid4()),'customer_name':'Changed snapshot'}
replay['request_payload'] = dict(reversed(list(replay['request_payload'].items())))
check(json.loads(create(replay)) == first)
changed = json.loads(json.dumps(payload)); changed['request_payload']['expected_total_sen']=2001
create(changed, fail='different information')
create(order(U3), fail='verified customer')
wrong_email={**order(),'customer_email':'different@example.invalid'}
create(wrong_email, fail='verified customer email')
# Definer auth-row locking must not expand service-role auth table permissions.
check(sql("select has_table_privilege('service_role','auth.users','SELECT');")=='f')
for role in ['anon','authenticated']:
    create(order(), role=role, user=U1, fail='permission denied')
    rpc('claim_sample_invoice_email',[oid],role=role,user=U1,fail='permission denied')
    rpc('finish_sample_invoice_email',[oid,str(uuid.uuid4()),'provider-id',''],role=role,user=U1,fail='permission denied')
    sql(f"insert into public.sample_orders(id) select id from public.sample_orders where id='{oid}';",role,U1,fail='permission denied')
    sql(f"update public.sample_orders set customer_name='Tampered' where id='{oid}';",role,U1,fail='permission denied')
    sql(f"delete from public.sample_orders where id='{oid}';",role,U1,fail='permission denied')
sql('select * from public.sample_orders;', 'anon', U1, fail='permission denied')
check(sql('select count(*) from public.sample_orders;', 'authenticated', U1)=='1')
sql(f"insert into public.admin_users(user_id) values ('{U2}');")
# Catalog administrators do not gain customer-wide sample invoice visibility.
check(sql('select count(*) from public.sample_orders;', 'authenticated', U2)=='0')
# Simultaneous claims serialize; exactly one worker may send.
with ThreadPoolExecutor(max_workers=2) as pool:
    claims = list(pool.map(lambda _: json.loads(rpc('claim_sample_invoice_email',[oid])), range(2)))
check(sum(c['email_claimed'] for c in claims)==1)
claim = next(c for c in claims if c['email_claimed'])
check(claim['email_attempt_count']==1 and claim['email_status']=='sending')
mismatch=json.loads(rpc('finish_sample_invoice_email',[oid,str(uuid.uuid4()),'wrong-provider','']))
check(mismatch['email_status']=='sending')
accepted=json.loads(rpc('finish_sample_invoice_email',[oid,claim['email_claim_id'],'provider-001','']))
check(accepted['email_status']=='accepted' and accepted['email_accepted_at'] is not None)
check(not json.loads(rpc('claim_sample_invoice_email',[oid]))['email_claimed'])
check(json.loads(rpc('finish_sample_invoice_email',[oid,claim['email_claim_id'],None,'late failure']))['email_status']=='accepted')
# Retry cooldown, lease takeover, stale completion, attempt and provider-idempotency limits.
second=json.loads(create(order(U2))); sid=second['id']
a=json.loads(rpc('claim_sample_invoice_email',[sid]))
failed=json.loads(rpc('finish_sample_invoice_email',[sid,a['email_claim_id'],None,'Provider unavailable']))
check(failed['email_status']=='failed' and failed['email_error']=='Provider unavailable')
check(not json.loads(rpc('claim_sample_invoice_email',[sid]))['email_claimed'])
# A fifth in-flight attempt remains finishable despite another worker's claim.
fifth=json.loads(create(order(U2))); fid=fifth['id']
sql(f"update public.sample_orders set email_attempt_count=4 where id='{fid}';")
last=json.loads(rpc('claim_sample_invoice_email',[fid]))
check(last['email_claimed'] and last['email_attempt_count']==5)
blocked=json.loads(rpc('claim_sample_invoice_email',[fid]))
check(not blocked['email_claimed'] and blocked['email_status']=='sending')
check(json.loads(rpc('finish_sample_invoice_email',[fid,last['email_claim_id'],'provider-fifth','']))['email_status']=='accepted')
sql(f"update public.sample_orders set email_attempted_at=now()-interval '61 seconds' where id='{sid}';")
b=json.loads(rpc('claim_sample_invoice_email',[sid])); check(b['email_claimed'] and b['email_attempt_count']==2)
check(json.loads(rpc('finish_sample_invoice_email',[sid,a['email_claim_id'],'stale-provider','']))['email_status']=='sending')
sql(f"update public.sample_orders set email_attempted_at=now()-interval '61 seconds' where id='{sid}';")
c=json.loads(rpc('claim_sample_invoice_email',[sid])); check(c['email_claimed'] and c['email_claim_id']!=b['email_claim_id'])
sql(f"update public.sample_orders set email_attempted_at=now()-interval '61 seconds',email_first_attempt_at=now()-interval '23 hours' where id='{sid}';")
old=json.loads(rpc('claim_sample_invoice_email',[sid])); check(not old['email_claimed'] and old['email_error']=='Email delivery needs store review before another attempt.')
sql(f"update public.sample_orders set email_attempt_count=5,email_first_attempt_at=now(),email_attempted_at=now()-interval '61 seconds' where id='{sid}';")
check(not json.loads(rpc('claim_sample_invoice_email',[sid]))['email_claimed'])
# Database enforcement rejects invalid shape/totals even for trusted callers.
for changes in [{'shipping_sen':1},{'total_sen':1999},{'items':[]},{'customer_name':'x'*121},{'item_count':0}]:
    bad={**order(U2),**changes}; create(bad,fail='check constraint')
# Quota uses database time, not supplied historical invoice creation time.
for _ in range(9): create(order())
create(order(),fail='Daily sample invoice limit')
check(json.loads(create(payload))['id']==oid)
# User-row lock serializes simultaneous same-request creation and daily quota.
sql(f"update auth.users set email='second@example.invalid',email_confirmed_at=now() where id='{U3}';")
same=order(U3)
with ThreadPoolExecutor(max_workers=2) as pool:
    copies=list(pool.map(lambda _: json.loads(create(same)), range(2)))
check(copies[0]['id']==copies[1]['id'])
for _ in range(8): create(order(U3))
def competing_create(_):
    try: return json.loads(create(order(U3)))
    except AssertionError as error:
        assert 'Daily sample invoice limit' in str(error), error
        return None
with ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(competing_create, range(2)))
check(sum(result is not None for result in results)==1)
check(sql(f"select count(*) from public.sample_orders where user_id='{U3}';")=='10')
check(sql('select count(*) from public.orders;')=='0')
check(sql('select count(*) from public.loyalty_events;')=='0')
check(sql('select count(*) from public.admin_activity;')=='0')
check(sql('select stock from public.product_variants;')=='7')
snapshot=json.loads(rpc('admin_portal_snapshot',[],role='authenticated',user=U2))
check(snapshot['orders']==[] and snapshot['events']==[] and snapshot['activity']==[])
check(all(customer['total_spent_sen']==0 and customer['order_count']==0 and customer['points']==0 for customer in snapshot['customers']))
# Reruns preserve invoice and delivery state.
sql((ROOT/'supabase/005_sample_checkout.sql').read_text())
check(json.loads(rpc('claim_sample_invoice_email',[oid]))['email_status']=='accepted')
print(f'PASS: {checks} sample checkout PostgreSQL assertions (roles, RLS, replay, concurrent email claims, quotas, isolation, rerun)')
