#!/usr/bin/env python3
"""PostgreSQL17 tests for standalone 006 and upgrade from 005. No live services.
  docker run -d --name crownetic-sample-rewards-test -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine
  python3 tests/sql/sample_rewards.py --container crownetic-sample-rewards-test
  docker rm -f crownetic-sample-rewards-test
Only crownetic_sample_rewards_* databases are recreated in the disposable container.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse, json, subprocess, uuid
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--container',required=True)
CONTAINER=p.parse_args().container
if not CONTAINER.startswith('crownetic-'): raise SystemExit('Use a disposable crownetic-... container')
U1,U2,U3=[f'10000000-0000-0000-0000-00000000000{i}' for i in range(1,4)]
checks=0

def sql(db,query,role=None,user=None,fail=None):
    global checks
    prefix=f'SET ROLE {role};' if role else ''
    if user:prefix+=f"SET request.jwt.claim.sub='{user}';"
    r=subprocess.run(['docker','exec','-i',CONTAINER,'psql','-U','postgres','-d',db,'-qAt','-v','ON_ERROR_STOP=1'],input=prefix+query,text=True,capture_output=True)
    if fail is not None:
        assert r.returncode and fail in r.stderr,(query,r.stdout,r.stderr)
        checks+=1;return
    assert r.returncode==0,(query,r.stderr)
    return r.stdout.strip()
def literal(value):return "'"+str(value).replace("'","''")+"'"
def rpc(db,name,args,role='service_role',user=None,fail=None):
    return sql(db,f'select public.{name}('+','.join('null' if v is None else literal(v) for v in args)+');',role,user,fail)
def create(db,data,**kw):return rpc(db,'create_sample_order',[json.dumps(data)],**kw)
def check(value):
    global checks
    assert value;checks+=1

def order(user=U1,rewards=(100,250),quantity=2):
    request=str(uuid.uuid4())
    lines=[{'product_id':f'20000000-0000-0000-0000-{i+1:012d}','size':'M','quantity':quantity} for i,_ in enumerate(rewards)]
    return {'id':str(uuid.uuid4()),'request_id':request,'user_id':user,'customer_name':'Sample Customer','customer_email':'first@example.invalid' if user==U1 else 'second@example.invalid','billing_address':'Sample road','postcode':'50000','country':'Malaysia','items':[{**line,'name':'Snapshot tee','unit_price_sen':1000,'reward_points':reward} for line,reward in zip(lines,rewards)],'subtotal_sen':1000*quantity*len(lines),'shipping_sen':0,'total_sen':1000*quantity*len(lines),'item_count':quantity*len(lines),'points':sum(rewards)*quantity,'request_payload':{'request_id':request,'items':lines,'customer':{'name':'Sample Customer','address':'Sample road','postcode':'50000','country':'Malaysia'},'expected_total_sen':1000*quantity*len(lines)}}

STUBS="""create schema auth; create schema storage;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now(),raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
alter default privileges in schema public grant all on tables to anon,authenticated;
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
"""
sql('postgres',"DO $$ BEGIN IF NOT EXISTS (select 1 from pg_roles where rolname='anon') THEN CREATE ROLE anon nologin; CREATE ROLE authenticated nologin; CREATE ROLE service_role nologin bypassrls; END IF; END $$;")

def run(upgrade):
    db='crownetic_sample_rewards_'+('upgrade' if upgrade else 'fresh')
    sql('postgres',f'DROP DATABASE IF EXISTS {db}; CREATE DATABASE {db};')
    sql(db,STUBS)
    for migration in ['001_catalog.sql','002_product_angles.sql','003_customer_rewards.sql','004_admin_portal.sql']:
        sql(db,(ROOT/'supabase'/migration).read_text())
    sql(db,f"insert into auth.users(id,email,email_confirmed_at) values ('{U1}','first@example.invalid',now()),('{U2}','second@example.invalid',now()),('{U3}','unconfirmed@example.invalid',null); insert into public.admin_users values ('{U2}'); insert into public.products(id,name,category,description,price_sen,image_url,published) values ('20000000-0000-0000-0000-000000000001','Tee','Tees','Cotton',1000,'https://example.invalid/t.png',true); insert into public.product_variants values ('20000000-0000-0000-0000-000000000001','M',7);")
    legacy=None
    if upgrade:
        sql(db,(ROOT/'supabase/005_sample_checkout.sql').read_text())
        old=order(rewards=(100,));old.pop('points')
        for line in old['items']:line.pop('reward_points')
        legacy=json.loads(create(db,old))
        sql(db,f"update public.sample_orders set email_status='accepted',email_provider_id='old-provider',email_accepted_at=now() where id='{legacy['id']}';")
        legacy=json.loads(sql(db,f"select to_jsonb(o) from public.sample_orders o where id='{legacy['id']}';"))
    sql(db,(ROOT/'supabase/006_sample_rewards.sql').read_text())
    if legacy:
        upgraded=json.loads(sql(db,f"select to_jsonb(o) from public.sample_orders o where id='{legacy['id']}';"))
        check(upgraded=={**legacy,'points':0,'email_retry_blocked':False,'email_claim_provider':None})
        replay={**old,'points':999999,'items':[{'quantity':9999,'reward_points':999999}]}
        check(json.loads(create(db,replay))==upgraded)
    base=order();first=json.loads(create(db,base));oid=first['id']
    check(first['points']==700 and first['items'][1]['reward_points']==250)
    check(json.loads(create(db,{**base,'points':1,'items':[{'bad':'new catalog'}]}))==first)
    zero=json.loads(create(db,order(U2,rewards=(0,))));check(zero['points']==0)
    # Quantity multiplication, overrides, and all-zero/maximum legal snapshots.
    high=json.loads(create(db,order(U2,rewards=(100000,)*100,quantity=99)))
    check(high['points']==990000000)
    for field,value in [('reward_points',-1),('reward_points',100001),('reward_points',1.5),('reward_points','100'),('quantity',0),('quantity',100),('quantity',1.5),('quantity','2')]:
        bad=order(U2,rewards=(100,));bad['items'][0][field]=value
        create(db,bad,fail='Invalid sample reward item')
    bad=order(U2,rewards=(100,));bad['items'][0].pop('reward_points');create(db,bad,fail='Invalid sample reward item')
    for value in [-1,2147483648,1.5,'700']:
        bad={**order(U2),'points':value};create(db,bad,fail='Invalid sample points')
    create(db,{**order(U2),'points':701},fail='Sample points do not match')
    changed=json.loads(json.dumps(base));changed['request_payload']['expected_total_sen']+=1
    create(db,changed,fail='different information')
    for role in ['anon','authenticated']:
        create(db,order(),role=role,user=U1,fail='permission denied')
        rpc(db,'claim_sample_invoice_email',[oid],role=role,user=U1,fail='permission denied')
        rpc(db,'claim_sample_invoice_email_once',[oid],role=role,user=U1,fail='permission denied')
        rpc(db,'mark_sample_invoice_email_unknown',[oid,str(uuid.uuid4()),'Unknown send outcome'],role=role,user=U1,fail='permission denied')
        rpc(db,'finish_sample_invoice_email',[oid,str(uuid.uuid4()),'provider',''],role=role,user=U1,fail='permission denied')
        sql(db,f"update public.sample_orders set points=999999 where id='{oid}';",role,U1,fail='permission denied')
        sql(db,f"delete from public.sample_orders where id='{oid}';",role,U1,fail='permission denied')
        sql(db,f"insert into public.sample_orders(id) values ('{uuid.uuid4()}');",role,U1,fail='permission denied')
    sql(db,'select * from public.sample_orders;','anon',U1,fail='permission denied')
    check(sql(db,'select sum(points) from public.sample_orders;','authenticated',U1)=='700')
    check(sql(db,'select sum(points) from public.sample_orders;','authenticated',U2)=='990000000')
    check(sql(db,f"select count(*) from public.sample_orders where id='{oid}';",'authenticated',U2)=='0')
    check(sql(db,"select has_table_privilege('service_role','auth.users','SELECT');")=='f')
    # The standalone migration carries over the delivery concurrency guarantees.
    with ThreadPoolExecutor(max_workers=2) as pool:
        claims=list(pool.map(lambda _:json.loads(rpc(db,'claim_sample_invoice_email',[oid])),range(2)))
    check(sum(row['email_claimed'] for row in claims)==1)
    active=next(row for row in claims if row['email_claimed'])
    check(active['email_claim_provider']=='resend')
    check(json.loads(rpc(db,'finish_sample_invoice_email',[oid,str(uuid.uuid4()),'stale','']))['email_status']=='sending')
    check(json.loads(rpc(db,'finish_sample_invoice_email',[oid,active['email_claim_id'],'accepted-provider','']))['email_status']=='accepted')
    check(not json.loads(rpc(db,'claim_sample_invoice_email',[oid]))['email_claimed'])
    check(json.loads(rpc(db,'finish_sample_invoice_email',[oid,active['email_claim_id'],None,'late error']))['email_status']=='accepted')
    sid=zero['id'];attempt=json.loads(rpc(db,'claim_sample_invoice_email',[sid]));check(attempt['email_claimed'])
    check(not json.loads(rpc(db,'claim_sample_invoice_email',[sid]))['email_claimed'])
    # SendGrid has no provider idempotency key: an ambiguous attempt never auto-retries.
    unknown=json.loads(create(db,order(U2,rewards=(0,))));uid=unknown['id']
    once=json.loads(rpc(db,'claim_sample_invoice_email_once',[uid]));check(once['email_claimed'] and once['email_claim_provider']=='sendgrid')
    stale=json.loads(rpc(db,'mark_sample_invoice_email_unknown',[uid,str(uuid.uuid4()),'stale worker']))
    check(stale['email_status']=='sending' and not stale['email_retry_blocked'])
    review=json.loads(rpc(db,'mark_sample_invoice_email_unknown',[uid,once['email_claim_id'],'The email provider response could not be confirmed.']))
    check(review['email_status']=='review' and review['email_retry_blocked'])
    for method in ['claim_sample_invoice_email_once','claim_sample_invoice_email']:
        blocked=json.loads(rpc(db,method,[uid]));check(not blocked['email_claimed'] and blocked['email_status']=='review')
    late_failure=json.loads(rpc(db,'finish_sample_invoice_email',[uid,once['email_claim_id'],None,'Late failure']))
    check(late_failure['email_status']=='review' and late_failure['email_retry_blocked'])
    late_accepted=json.loads(rpc(db,'finish_sample_invoice_email',[uid,once['email_claim_id'],'sendgrid-202','']))
    check(late_accepted['email_status']=='accepted' and not late_accepted['email_retry_blocked'])
    check(json.loads(rpc(db,'mark_sample_invoice_email_unknown',[uid,once['email_claim_id'],'late uncertainty']))['email_status']=='accepted')
    # Crash after acquiring a claim: expiration means review, not permission to send twice.
    crashed=json.loads(create(db,order(U2,rewards=(0,))));cid=crashed['id']
    with ThreadPoolExecutor(max_workers=2) as pool:
        senders=list(pool.map(lambda _:json.loads(rpc(db,'claim_sample_invoice_email_once',[cid])),range(2)))
    check(sum(row['email_claimed'] for row in senders)==1)
    sql(db,f"update public.sample_orders set email_attempted_at=now()-interval '61 seconds' where id='{cid}';")
    crash_review=json.loads(rpc(db,'claim_sample_invoice_email_once',[cid]))
    check(not crash_review['email_claimed'] and crash_review['email_status']=='review' and crash_review['email_retry_blocked'] and crash_review['email_attempt_count']==1)
    check(not json.loads(rpc(db,'claim_sample_invoice_email',[cid]))['email_claimed'])
    # Even a lease created by another provider must not be reclaimed by SendGrid.
    cross=json.loads(create(db,order(U2,rewards=(0,))));xid=cross['id']
    rpc(db,'claim_sample_invoice_email',[xid])
    sql(db,f"update public.sample_orders set email_attempted_at=now()-interval '61 seconds' where id='{xid}';")
    check(json.loads(rpc(db,'claim_sample_invoice_email_once',[xid]))['email_status']=='review')
    # Switching back to Resend must not reclaim an ambiguous SendGrid lease either.
    switched=json.loads(create(db,order(U2,rewards=(0,))));wid=switched['id']
    original=json.loads(rpc(db,'claim_sample_invoice_email_once',[wid]))
    live=json.loads(rpc(db,'claim_sample_invoice_email',[wid]))
    check(not live['email_claimed'] and live['email_status']=='sending' and live['email_claim_id']==original['email_claim_id'])
    sql(db,f"update public.sample_orders set email_attempted_at=now()-interval '61 seconds' where id='{wid}';")
    switch_review=json.loads(rpc(db,'claim_sample_invoice_email',[wid]))
    check(not switch_review['email_claimed'] and switch_review['email_status']=='review' and switch_review['email_retry_blocked'] and switch_review['email_claim_provider']=='sendgrid')
    # A definitive 4xx rejection is safe to retry after the normal cooldown.
    rejected=json.loads(create(db,order(U2,rewards=(0,))));rid=rejected['id']
    initial=json.loads(rpc(db,'claim_sample_invoice_email_once',[rid]))
    rejected=json.loads(rpc(db,'finish_sample_invoice_email',[rid,initial['email_claim_id'],None,'Email provider rejected the request.']))
    check(rejected['email_status']=='failed' and not rejected['email_retry_blocked'])
    check(not json.loads(rpc(db,'claim_sample_invoice_email_once',[rid]))['email_claimed'])
    sql(db,f"update public.sample_orders set email_attempted_at=now()-interval '61 seconds' where id='{rid}';")
    retry=json.loads(rpc(db,'claim_sample_invoice_email_once',[rid]));check(retry['email_claimed'] and retry['email_attempt_count']==2)
    rpc(db,'finish_sample_invoice_email',[rid,retry['email_claim_id'],None,'Definitive rejection'])
    sql(db,f"update public.sample_orders set email_attempted_at=now()-interval '61 seconds' where id='{rid}';")
    safe_switch=json.loads(rpc(db,'claim_sample_invoice_email',[rid]))
    check(safe_switch['email_claimed'] and safe_switch['email_claim_provider']=='resend')
    # Legacy "failed" metadata cannot establish definite non-delivery.
    historical=json.loads(create(db,order(U2,rewards=(0,))));hid=historical['id']
    sql(db,f"update public.sample_orders set email_status='failed',email_attempt_count=1,email_attempted_at=now()-interval '61 seconds',email_claim_provider=null where id='{hid}';")
    legacy_review=json.loads(rpc(db,'claim_sample_invoice_email_once',[hid]))
    check(not legacy_review['email_claimed'] and legacy_review['email_status']=='review' and legacy_review['email_retry_blocked'] and legacy_review['email_attempt_count']==1)
    check(not json.loads(rpc(db,'claim_sample_invoice_email',[hid]))['email_claimed'])
    sql(db,f"update public.sample_orders set email_attempted_at=now()-interval '61 seconds',email_first_attempt_at=now()-interval '23 hours' where id='{sid}';")
    expired=json.loads(rpc(db,'claim_sample_invoice_email',[sid]))
    check(not expired['email_claimed'] and expired['email_status']=='review' and expired['email_retry_blocked'] and expired['email_error']=='Email delivery needs store review before another attempt.')
    check(not json.loads(rpc(db,'claim_sample_invoice_email_once',[sid]))['email_claimed'])
    sql(db,f"update public.sample_orders set email_status='failed',email_retry_blocked=false,email_attempt_count=5,email_first_attempt_at=now() where id='{sid}';")
    capped=json.loads(rpc(db,'claim_sample_invoice_email',[sid]))
    check(not capped['email_claimed'] and capped['email_status']=='review' and capped['email_retry_blocked'] and capped['email_error']=='Email delivery needs store review after five attempts.')
    check(not json.loads(rpc(db,'claim_sample_invoice_email_once',[sid]))['email_claimed'])
    # Quota, confirmed identity, and email binding stay enforced.
    bad=order(U3);create(db,bad,fail='verified customer')
    create(db,{**order(),'customer_email':'attacker@example.invalid'},fail='verified customer email')
    existing=int(sql(db,f"select count(*) from public.sample_orders where user_id='{U1}';"))
    for _ in range(10-existing):create(db,order())
    create(db,order(),fail='Daily sample invoice limit')
    check(json.loads(create(db,base))['id']==oid)
    check(sql(db,'select count(*) from public.orders;')=='0')
    check(sql(db,'select count(*) from public.loyalty_events;')=='0')
    check(sql(db,'select stock from public.product_variants;')=='7')
    snapshot=json.loads(rpc(db,'admin_portal_snapshot',[],role='authenticated',user=U2))
    check(snapshot['orders']==[] and snapshot['events']==[] and snapshot['activity']==[])
    check(all(row['total_spent_sen']==0 and row['points']==0 for row in snapshot['customers']))
    before=sql(db,'select jsonb_agg(to_jsonb(o) order by id) from public.sample_orders o;')
    sql(db,(ROOT/'supabase/006_sample_rewards.sql').read_text())
    check(sql(db,'select jsonb_agg(to_jsonb(o) order by id) from public.sample_orders o;')==before)
    print(db+': PASS',flush=True)

run(False)
run(True)
for suffix in ['fresh', 'upgrade']:
    db='crownetic_sample_rewards_'+suffix
    before=sql(db,'select jsonb_agg(to_jsonb(o) order by id) from public.sample_orders o;')
    definition=sql(db,"select pg_get_functiondef('public.create_sample_order(jsonb)'::regprocedure);")
    sql(db,(ROOT/'supabase/setup.sql').read_text())
    check(sql(db,'select jsonb_agg(to_jsonb(o) order by id) from public.sample_orders o;')==before)
    check(sql(db,"select pg_get_functiondef('public.create_sample_order(jsonb)'::regprocedure);")==definition)
    print(db+': combined setup preserves rows and final rewards RPC: PASS',flush=True)
print(f'PASS: {checks} sample rewards PostgreSQL assertions',flush=True)
