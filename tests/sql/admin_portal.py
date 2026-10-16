#!/usr/bin/env python3
"""Manual PostgreSQL17 integration test. No Python packages or live Supabase access.
Start a disposable unexposed container, then run:
  docker run -d --name crownetic-portal-test -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine
  python3 tests/sql/admin_portal.py --container crownetic-portal-test
  docker rm -f crownetic-portal-test
The script recreates only crownetic_portal_* databases in that disposable container.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse, json, subprocess, uuid, time

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--container',required=True)
CONTAINER=parser.parse_args().container
if not CONTAINER.startswith('crownetic-'):
    raise SystemExit('Use a disposable test container named crownetic-...')
A='10000000-0000-0000-0000-000000000009'
U1='10000000-0000-0000-0000-000000000001'
U2='10000000-0000-0000-0000-000000000002'
UNCONFIRMED='10000000-0000-0000-0000-000000000003'
P1='20000000-0000-0000-0000-000000000001'
P2='20000000-0000-0000-0000-000000000002'
checks=0

def execute(db,sql,role=None,user=None,fail=None):
    global checks
    prefix=f'SET ROLE {role};' if role else ''
    if user:prefix+=f"SET request.jwt.claim.sub='{user}';"
    result=subprocess.run(['docker','exec','-i',CONTAINER,'psql','-U','postgres','-d',db,'-qAt','-v','ON_ERROR_STOP=1'],input=prefix+sql,text=True,capture_output=True)
    if fail is not None:
        assert result.returncode and fail in result.stderr, (sql,result.stdout,result.stderr)
        checks+=1
        return result.stderr
    assert result.returncode==0,(sql,result.stderr)
    return result.stdout.strip()

def eq(db,sql,value,role=None,user=None):
    global checks
    actual=execute(db,sql,role,user)
    assert actual==str(value),(sql,actual,value)
    checks+=1

def call(db,name,payload,user=A,fail=None):
    argument="'"+json.dumps(payload).replace("'","''")+"'::jsonb"
    return execute(db,f'select public.{name}({argument});','authenticated',user,fail)

def rpc(db,name,args,user=A,fail=None):
    values=[]
    for arg in args:
        values.append('null' if arg is None else "'"+str(arg).replace("'","''")+"'")
    return execute(db,f'select public.{name}('+','.join(values)+');','authenticated',user,fail)

def sale(user=U1,ref='IG-001',items=None):
    return {'request_id':str(uuid.uuid4()),'user_id':user,'reference':ref,'channel':'instagram','items':items if items is not None else [{'product_id':P1,'size':'M','quantity':2},{'product_id':P2,'size':'L','quantity':1}]}

def adjustment(points,user=U1,reason='Manual loyalty correction'):
    return {'request_id':str(uuid.uuid4()),'user_id':user,'points':points,'reason':reason}

STUBS="""
create schema auth; create schema storage;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default now(),raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
grant select on storage.buckets to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to anon,authenticated;
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
"""
execute('postgres',"DO $$ BEGIN IF NOT EXISTS (select 1 from pg_roles where rolname='anon') THEN CREATE ROLE anon nologin; CREATE ROLE authenticated nologin; CREATE ROLE service_role nologin bypassrls; END IF; END $$;")

def seed(db):
    execute(db,f"""
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    ('{A}','admin@example.invalid',now(),'{{"name":"Admin","secret":"DO_NOT_EXPOSE"}}'),
    ('{U1}','first@example.invalid',now(),'{{"name":"First metadata","secret":"DO_NOT_EXPOSE"}}'),
    ('{U2}','second@example.invalid',now(),'{{"name":"No profile","secret":"DO_NOT_EXPOSE"}}'),
    ('{UNCONFIRMED}','unconfirmed@example.invalid',null,'{{}}');
    insert into public.admin_users values ('{A}');
    insert into public.customer_profiles(user_id,display_name,phone,address) values ('{U1}','First customer','123','Original address');
    insert into public.products(id,name,category,description,price_sen,image_url,published,reward_points) values
    ('{P1}','First tee','Tees','Cotton',1000,'https://example.com/tee.webp',true,100),
    ('{P2}','Draft pants','Bottoms','Cotton',3000,'https://example.com/pants.webp',false,250);
    insert into public.product_variants values ('{P1}','M',8),('{P2}','L',2);
    insert into public.loyalty_events(event_ref,user_id,points,item_count) values ('historical-purchase','{U1}',500,5);
    """)

def check_case(db,legacy=False):
    global checks
    execute('postgres',f'DROP DATABASE IF EXISTS {db}; CREATE DATABASE {db};')
    execute(db,STUBS)
    if legacy:
        for f in ['001_catalog.sql','002_product_angles.sql','003_customer_rewards.sql']:
            execute(db,(ROOT/'supabase'/f).read_text())
        seed(db)
        execute(db,(ROOT/'supabase/004_admin_portal.sql').read_text())
        execute(db,(ROOT/'supabase/004_admin_portal.sql').read_text())
    else:
        execute(db,(ROOT/'supabase/setup.sql').read_text())
        execute(db,(ROOT/'supabase/setup.sql').read_text())
        seed(db)
    snapshot=json.loads(rpc(db,'admin_portal_snapshot',[]))
    assert len(snapshot['customers'])==2 and snapshot['orders']==[] and snapshot['activity']==[]
    assert next(c for c in snapshot['customers'] if c['id']==U2)['name']=='No profile'
    assert next(c for c in snapshot['customers'] if c['id']==U1)['name']=='First customer'
    assert 'DO_NOT_EXPOSE' not in json.dumps(snapshot)
    checks+=4
    rpc(db,'admin_portal_snapshot',[],U1,'Administrator access required')
    execute(db,'select public.admin_portal_snapshot();','anon',fail='permission denied')
    payload=sale()
    # Browser-submitted totals and reward overrides are never trusted.
    payload['total_sen']=1;payload['points']=99999999
    payload['items'][0]['unit_price_sen']=0;payload['items'][0]['reward_points']=99999999
    for method,data in [('admin_record_sale',payload),('admin_adjust_points',adjustment(100))]:
        call(db,method,data,U1,'Administrator access required')
    for table in ['orders','order_items','admin_activity','loyalty_events']:
        execute(db,f'delete from public.{table};','authenticated',A,'permission denied')
    first_order=call(db,'admin_record_sale',payload)
    assert call(db,'admin_record_sale',payload)==first_order;checks+=1
    reused={**payload,'user_id':U2}
    call(db,'admin_record_sale',reused,fail='already used')
    reused_adjustment={**adjustment(100),'request_id':payload['request_id']}
    call(db,'admin_adjust_points',reused_adjustment,fail='already used')
    call(db,'admin_record_sale',sale(ref='  ig-001  '),fail='already recorded')
    call(db,'admin_record_sale',sale(user=UNCONFIRMED,ref='UNCONFIRMED'),fail='verified customer')
    call(db,'admin_record_sale',sale(user=A,ref='ADMIN-CUSTOMER'),fail='verified customer')
    eq(db,f"select total_sen||':'||points||':'||item_count from public.orders where id='{first_order}';",'5000:450:3')
    eq(db,'select sum(stock) from public.product_variants;',10)
    eq(db,'select count(*) from public.orders;',1)
    eq(db,'select count(*) from public.order_items;',2)
    eq(db,'select count(*) from public.admin_activity;',1)
    eq(db,f"select sum(points) from public.loyalty_events where user_id='{U1}';",950,'authenticated',U1)
    eq(db,'select count(*) from public.orders;',0,'authenticated',U2)
    eq(db,'select count(*) from public.order_items;',0,'authenticated',U2)
    eq(db,'select count(*) from public.admin_activity;',0,'authenticated',U1)
    eq(db,'select count(*) from public.customer_profiles;',0,'authenticated',A)
    for quantity in [0,-1,1.5,10000,'bad']:
        call(db,'admin_record_sale',sale(ref='BAD-'+str(quantity),items=[{'product_id':P1,'size':'M','quantity':quantity}]),fail='Quantity')
    call(db,'admin_record_sale',sale(ref='BAD-SIZE',items=[{'product_id':P1,'size':'missing','quantity':1}]),fail='existing product')
    call(db,'admin_record_sale',sale(ref='EMPTY',items=[]),fail='between 1 and 100')
    call(db,'admin_record_sale',sale(ref='TOO-MANY',items=[{'product_id':P1,'size':'M','quantity':1}]*101),fail='between 1 and 100')
    call(db,'admin_record_sale',sale(ref='R'*121),fail='Reference')
    invalid_channel=sale(ref='BAD-CHANNEL');invalid_channel['channel']='unknown'
    call(db,'admin_record_sale',invalid_channel,fail='Invalid sales channel')
    execute(db,f"update public.products set price_sen=2147483647 where id='{P1}';")
    call(db,'admin_record_sale',sale(ref='TOO-LARGE'),fail='too large')
    execute(db,f"update public.products set price_sen=1000 where id='{P1}';")
    call(db,'admin_record_sale',sale(ref='DUPLICATE',items=[{'product_id':P1,'size':'M','quantity':1}]*2),fail='Combine duplicate')
    eq(db,'select count(*) from public.orders;',1)
    eq(db,'select count(*) from public.admin_activity;',1)
    plus=adjustment(1000)
    credit=call(db,'admin_adjust_points',plus)
    assert call(db,'admin_adjust_points',plus)==credit;checks+=1
    call(db,'admin_adjust_points',{**plus,'points':999},fail='already used')
    call(db,'admin_adjust_points',adjustment(-400))
    for value in [0,100001,-100001,1.2,'bad']:
        call(db,'admin_adjust_points',adjustment(value),fail='Points' if value in [1.2,'bad'] else 'Adjust between')
    call(db,'admin_adjust_points',adjustment(1,reason='ab'),fail='Reason')
    call(db,'admin_adjust_points',adjustment(-2000),fail='exceeds')
    eq(db,f"select sum(points) from public.loyalty_events where user_id='{U1}';",1550)
    execute(db,f"update public.products set price_sen=1900,reward_points=700 where id='{P1}';")
    call(db,'admin_adjust_points',adjustment(-1500))
    rpc(db,'admin_refund_order',[first_order,'Customer returned items'],U1,'Administrator access required')
    assert rpc(db,'admin_refund_order',[first_order,'Customer returned items'])==first_order;checks+=1
    assert rpc(db,'admin_refund_order',[first_order,'Customer returned items'])==first_order;checks+=1
    rpc(db,'admin_refund_order',[first_order,'Different reason'],fail='different reason')
    eq(db,f"select points from public.loyalty_events where order_id='{first_order}' and event_type='refund';",-450)
    eq(db,f"select sum(points) from public.loyalty_events where user_id='{U1}';",-400)
    call(db,'admin_adjust_points',adjustment(-1),fail='exceeds')
    rpc(db,'admin_update_fulfillment',[first_order,'shipped',''],fail='Refunded orders')
    second=call(db,'admin_record_sale',sale(U2,'OFFLINE-002',[{'product_id':P1,'size':'M','quantity':1}]))
    rpc(db,'admin_update_fulfillment',[second,'shipped',''],U1,'Administrator access required')
    assert rpc(db,'admin_update_fulfillment',[second,'shipped',''])==second;checks+=1
    audit_count=execute(db,'select count(*) from public.admin_activity;')
    rpc(db,'admin_update_fulfillment',[second,'shipped',''])
    eq(db,'select count(*) from public.admin_activity;',audit_count)
    rpc(db,'admin_update_fulfillment',[second,'delivered','T'*200])
    rpc(db,'admin_update_fulfillment',[second,'invalid',''],fail='Invalid fulfillment')
    rpc(db,'admin_update_fulfillment',[second,'shipped','T'*201],fail='at most 200')
    eq(db,'select count(*) from public.orders;',1,'authenticated',U1)
    eq(db,'select count(*) from public.order_items;',1,'authenticated',U2)
    # Serialise two deductions against the same customer: only one may consume the balance.
    def concurrent_deduction(data):
        try:return ('ok',call(db,'admin_adjust_points',data))
        except AssertionError as error:return ('error',str(error))
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes=list(pool.map(concurrent_deduction,[adjustment(-500,U2),adjustment(-500,U2)]))
    assert sorted(o[0] for o in outcomes)==['error','ok'],outcomes;checks+=1
    eq(db,f"select sum(points) from public.loyalty_events where user_id='{U2}';",200)
    concurrent_sale=sale(U2,'CONCURRENT-003',[{'product_id':P1,'size':'M','quantity':1}])
    with ThreadPoolExecutor(max_workers=2) as pool:
        ids=list(pool.map(lambda _:call(db,'admin_record_sale',concurrent_sale),range(2)))
    assert ids[0]==ids[1];checks+=1
    eq(db,"select count(*) from public.orders where reference='CONCURRENT-003';",1)
    eq(db,f"select count(*) from public.loyalty_events where order_id='{ids[0]}';",1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        refunds=list(pool.map(lambda _:rpc(db,'admin_refund_order',[ids[0],'Concurrent return']),range(2)))
    assert refunds==ids;checks+=1
    eq(db,f"select count(*) from public.loyalty_events where order_id='{ids[0]}' and event_type='refund';",1)
    # Existing service-only purchase awards still work with the extended ledger.
    items=json.dumps([{'product_id':P1,'quantity':1}])
    service=f"select public.award_purchase_points('{U2}','gateway-paid-record','{items}'::jsonb);"
    eq(db,service,700,'service_role')
    eq(db,service,0,'service_role')
    execute(db,service,'authenticated',U1,'permission denied')
    eq(db,f"select sum(points) from public.loyalty_events where user_id='{U2}';",900)
    call(db,'admin_adjust_points',adjustment(100000,U2))
    call(db,'admin_adjust_points',adjustment(-100000,U2))
    eq(db,f"select sum(points) from public.loyalty_events where user_id='{U2}';",900)
    # Free products and zero-point products still record/refund exactly once.
    execute(db,f"update public.products set price_sen=0,reward_points=0 where id='{P1}';")
    zero_order=call(db,'admin_record_sale',sale(U2,'FREE-004',[{'product_id':P1,'size':'M','quantity':1}]))
    eq(db,f"select total_sen||':'||points from public.orders where id='{zero_order}';",'0:0')
    rpc(db,'admin_refund_order',[zero_order,'Zero point return'])
    eq(db,f"select sum(points) from public.loyalty_events where user_id='{U2}';",900)
    execute(db,f"update public.products set price_sen=1900,reward_points=700 where id='{P1}';")
    # Hold refund's first lock while fulfillment starts. Both RPCs must lock customer
    # before order; otherwise fulfillment's audit FK and refund's order lock deadlock.
    raced_order=call(db,'admin_record_sale',sale(U2,'REFUND-FULFILLMENT-RACE',[{'product_id':P1,'size':'M','quantity':1}]))
    refund_sql=f"begin; set local application_name='crownetic_refund_regression'; select 1 from auth.users where id='{U2}' for update; select pg_sleep(1.5); select public.admin_refund_order('{raced_order}','Concurrent fulfillment return'); commit;"
    with ThreadPoolExecutor(max_workers=2) as pool:
        refund_future=pool.submit(execute,db,refund_sql,None,A)
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            if execute(db,"select count(*) from pg_stat_activity where application_name='crownetic_refund_regression' and wait_event='PgSleep';")=='1':
                break
            time.sleep(.02)
        else:raise AssertionError('Refund lock was not observed')
        fulfillment_future=pool.submit(rpc,db,'admin_update_fulfillment',[raced_order,'shipped',''],A,'Refunded orders')
        refund_result=refund_future.result()
        fulfillment_result=fulfillment_future.result()
    assert 'deadlock' not in refund_result+fulfillment_result;checks+=1
    eq(db,f"select status from public.orders where id='{raced_order}';",'refunded')
    eq(db,f"select count(*) from public.loyalty_events where order_id='{raced_order}' and event_type='refund';",1)
    eq(db,f"select sum(points) from public.loyalty_events where user_id='{U2}';",900)
    latest=json.loads(rpc(db,'admin_portal_snapshot',[]))
    first_customer=next(c for c in latest['customers'] if c['id']==U1)
    assert first_customer['points']==-400 and first_customer['total_spent_sen']==0 and first_customer['order_count']==1;checks+=1
    assert 'DO_NOT_EXPOSE' not in json.dumps(latest) and 'request_payload' not in json.dumps(latest);checks+=1
    execute(db,(ROOT/'supabase/004_admin_portal.sql').read_text())
    execute(db,(ROOT/'supabase/004_admin_portal.sql').read_text())
    execute(db,(ROOT/'supabase/setup.sql').read_text())
    assert json.loads(rpc(db,'admin_portal_snapshot',[]))==latest;checks+=1
    eq(db,'select sum(stock) from public.product_variants;',10)
    print(f'{db}: PASS (security, snapshots, signed adjustments, refunds, concurrency, idempotency, reruns)',flush=True)

check_case('crownetic_portal_fresh')
check_case('crownetic_portal_upgrade',True)
print(f'PASS: {checks} PostgreSQL17 assertions',flush=True)
