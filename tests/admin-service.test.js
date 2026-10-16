import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminStore } from '../admin/service.js';
import { loadCustomers, saveCustomers } from '../customer/storage.js';

function setup(connected=false,rpc=async()=>({data:'result-id',error:null})) {
 const entries=new Map(),session=new Map(),calls=[];
 const storage={getItem:k=>entries.get(k),setItem:(k,v)=>{calls.push(['save']);entries.set(k,v);}};
 const sessionStorage={getItem:k=>session.get(k)};
 const store=createAdminStore({connected,getClient:async()=>({rpc:async(name,args)=>{calls.push([name,args]);return rpc(name,args);}}),getProducts:async()=>[{id:'tee',name:'Tee',price_sen:1000,reward_points:100,variants:[{size:'M',stock:0}]}],storage,sessionStorage});
 return {store,entries,session,calls,storage};
}

test('legacy customer storage preserves users and events while adding empty order and activity arrays',()=>{
 const {storage,entries}=setup();entries.set('crownetic.customers.v1',JSON.stringify({version:1,users:[{id:'old'}],events:[{points:100}]}));
 const loaded=loadCustomers(storage);assert.equal(loaded.users[0].id,'old');assert.deepEqual(loaded.orders,[]);assert.deepEqual(loaded.activity,[]);
 saveCustomers(loaded,storage);assert.equal(loadCustomers(storage).events[0].points,100);
});

test('every local admin method checks the session and unauthorized calls never persist changes',async()=>{
 const {store,calls}=setup();
 for(const [method,data] of [['snapshot'],['recordSale',{}],['adjustPoints',{}],['refundOrder',{}],['updateFulfillment',{}]]) await assert.rejects(store[method](data),/administrator|admin|sign in/i);
 assert.deepEqual(calls,[]);
});

test('one local sale is saved atomically and validation errors cannot leave partial records',async()=>{
 const {store,storage,session,calls}=setup();session.set('crownetic.demo.admin','yes');
 saveCustomers({version:1,users:[{id:'u1',email:'m@example.com',password:{hash:'secret'}}],events:[],orders:[],activity:[]},storage);calls.length=0;
 await store.recordSale({request_id:'00000000-0000-4000-8000-000000000001',user_id:'u1',reference:'LOCAL-1',channel:'offline',items:[{product_id:'tee',size:'M',quantity:2}]});
 assert.equal(calls.length,1);assert.equal(loadCustomers(storage).events[0].points,200);
 const before=JSON.stringify(loadCustomers(storage));await assert.rejects(store.adjustPoints({request_id:'00000000-0000-4000-8000-000000000002',user_id:'u1',points:-999,reason:'Cannot overdraft'}));
 assert.equal(JSON.stringify(loadCustomers(storage)),before);assert.equal(calls.length,1);
 const snapshot=await store.snapshot();assert.ok(!JSON.stringify(snapshot).includes('secret'));assert.equal(snapshot.customers[0].points,200);
 session.delete('crownetic.demo.admin');await assert.rejects(store.snapshot(),/administrator|admin|sign in/i);
});

test('connected actions use only protected RPCs with exact argument mappings and never local storage',async()=>{
 const {store,calls,entries}=setup(true);const data={request_id:'request',user_id:'user'};
 await store.snapshot();await store.recordSale(data);await store.adjustPoints(data);await store.refundOrder({order_id:'order',reason:'Reason'});await store.updateFulfillment({order_id:'order',status:'shipped',tracking_number:'MY123'});
 assert.deepEqual(calls,[['admin_portal_snapshot',undefined],['admin_record_sale',{sale_data:data}],['admin_adjust_points',{adjustment_data:data}],['admin_refund_order',{p_order_id:'order',p_reason:'Reason'}],['admin_update_fulfillment',{p_order_id:'order',p_status:'shipped',p_tracking_number:'MY123'}]]);
 assert.equal(entries.size,0);
});

test('connected missing migration gets an actionable message and authorization errors are retained',async()=>{
 const missing=setup(true,async()=>({data:null,error:{code:'PGRST202',message:'Could not find the function'}}));
 await assert.rejects(missing.store.snapshot(),/004_admin_portal.sql/);
 const denied=setup(true,async()=>({data:null,error:{code:'42501',message:'Administrator access required'}}));
 await assert.rejects(denied.store.snapshot(),/Administrator access required/);
});
