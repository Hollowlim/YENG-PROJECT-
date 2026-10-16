import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminSnapshot, applyRecordSale, applyAdjustPoints, applyRefundOrder, applyUpdateFulfillment } from '../admin/model.js';

const request = '00000000-0000-4000-8000-000000000001';
const state = () => ({version:1,users:[{id:'u1',email:'member@example.com',name:'Member',password:{hash:'private',salt:'private'},created_at:'2026-10-16T00:00:00Z'},{id:'u2',email:'other@example.com',name:'Other'}],events:[],orders:[],activity:[]});
const products = [{id:'tee',name:'Heavy Tee',price_sen:18900,reward_points:100,variants:[{size:'M',stock:0}]}];
const sale = (extra={}) => ({request_id:request,user_id:'u1',reference:'IG-1001',channel:'instagram',items:[{product_id:'tee',size:'M',quantity:2}],...extra});
const context = () => {let id=10;return {now:()=> '2026-10-16T12:00:00.000Z',uuid:()=>`00000000-0000-4000-8000-${String(id++).padStart(12,'0')}`,actor:'admin@123'};};

test('recorded sale atomically snapshots catalog values, earns quantity-based points, and leaves stock and original state unchanged',()=>{
 const before=state(), original=structuredClone(before), inventory=structuredClone(products);
 const {data,id}=applyRecordSale(before,sale(),products,context());
 assert.deepEqual(before,original);assert.deepEqual(products,inventory);
 assert.equal(data.orders[0].id,id);assert.equal(data.orders[0].total_sen,37800);assert.equal(data.orders[0].points,200);
 assert.deepEqual(data.orders[0].items.map(i=>[i.name,i.unit_price_sen,i.reward_points,i.quantity]),[['Heavy Tee',18900,100,2]]);
 assert.equal(data.events[0].points,200);assert.equal(data.activity[0].action,'sale_recorded');
 const snapshot=adminSnapshot(data);assert.equal(snapshot.customers[0].points,200);assert.equal(snapshot.customers[0].total_spent_sen,37800);
 assert.equal(snapshot.customers[0].order_count,1);assert.ok(!JSON.stringify(snapshot).includes('private'));
});

test('sale retries are idempotent despite catalog changes, but request reuse or duplicate references cannot create credit',()=>{
 const ctx=context(), first=applyRecordSale(state(),sale(),products,ctx);
 const retry=applyRecordSale(first.data,sale(),[{...products[0],price_sen:999,reward_points:999}],ctx);
 assert.equal(retry.id,first.id);assert.deepEqual(retry.data,first.data);
 assert.deepEqual(applyRecordSale(first.data,sale({reference:'ig-1001'}),products,ctx).data,first.data);
 assert.throws(()=>applyRecordSale(first.data,sale({items:[{product_id:'tee',size:'M',quantity:3}]}),products,ctx),/request/i);
 assert.throws(()=>applyRecordSale(first.data,sale({request_id:'00000000-0000-4000-8000-000000000002',reference:'ig-1001'}),products,ctx),/reference/i);
 assert.throws(()=>applyAdjustPoints(first.data,{request_id:request,user_id:'u1',points:100,reason:'Correction'},ctx),/request/i);
});

test('invalid customers, variants, quantities, points and money totals never mutate state',()=>{
 const original=state(), ctx=context();
 for(const input of [sale({user_id:'missing'}),sale({reference:' '}),sale({channel:'unknown'}),sale({items:[]}),sale({items:[{product_id:'tee',size:'XXL',quantity:1}]}),sale({items:[{product_id:'tee',size:'M',quantity:1.5}]}),sale({items:[{product_id:'missing',size:'M',quantity:1}]})]) assert.throws(()=>applyRecordSale(original,input,products,ctx));
 assert.throws(()=>applyRecordSale(original,sale(),[{...products[0],price_sen:Number.MAX_SAFE_INTEGER}],ctx));
 assert.throws(()=>applyRecordSale(original,sale({items:[{product_id:'tee',size:'M',quantity:1},{product_id:'tee',size:'M',quantity:1}]}),products,ctx),/duplicate/i);
 assert.deepEqual(original,state());
});

test('signed manual adjustments require a reason, reject overdrafts, and stay idempotent',()=>{
 const ctx=context(), initial=applyRecordSale(state(),sale(),products,ctx).data;
 const input={request_id:'00000000-0000-4000-8000-000000000002',user_id:'u1',points:-50,reason:'Customer correction'};
 const adjusted=applyAdjustPoints(initial,input,ctx);
 assert.equal(adminSnapshot(adjusted.data).customers[0].points,150);
 assert.deepEqual(applyAdjustPoints(adjusted.data,input,ctx).data,adjusted.data);
 assert.throws(()=>applyAdjustPoints(initial,{...input,points:-201},ctx),/balance/i);
 assert.throws(()=>applyAdjustPoints(initial,{...input,points:0},ctx));
 assert.throws(()=>applyAdjustPoints(initial,{...input,reason:'x'},ctx));
 assert.throws(()=>applyAdjustPoints(adjusted.data,{...input,reason:'Different reason'},ctx),/request/i);
});

test('full refunds reverse immutable sale rewards once and may leave debt after earlier adjustments',()=>{
 const ctx=context(), recorded=applyRecordSale(state(),sale(),products,ctx);
 const adjusted=applyAdjustPoints(recorded.data,{request_id:'00000000-0000-4000-8000-000000000002',user_id:'u1',points:-50,reason:'Customer correction'},ctx).data;
 const refunded=applyRefundOrder(adjusted,{order_id:recorded.id,reason:'Full return approved'},ctx);
 assert.equal(refunded.data.orders[0].status,'refunded');assert.equal(refunded.data.events.at(-1).points,-200);
 const customer=adminSnapshot(refunded.data).customers[0];assert.equal(customer.points,-50);assert.equal(customer.total_spent_sen,0);assert.equal(customer.order_count,1);assert.equal(customer.last_purchase_at,null);
 assert.deepEqual(applyRefundOrder(refunded.data,{order_id:recorded.id,reason:'Full return approved'},ctx).data,refunded.data);
 assert.throws(()=>applyRefundOrder(refunded.data,{order_id:recorded.id,reason:'Different reason'},ctx),/already|reason/i);
 const missing=structuredClone(recorded.data);missing.events=[];
 assert.throws(()=>applyRefundOrder(missing,{order_id:recorded.id,reason:'Full return approved'},ctx),/purchase award/i);
 const altered=structuredClone(recorded.data);altered.orders[0].points=999;
 assert.equal(applyRefundOrder(altered,{order_id:recorded.id,reason:'Full return approved'},ctx).data.events.at(-1).points,-200);
});

test('fulfillment changes validate tracking and do not touch payment, points, or refunded orders',()=>{
 const ctx=context(), recorded=applyRecordSale(state(),sale(),products,ctx);
 assert.throws(()=>applyUpdateFulfillment(recorded.data,{order_id:recorded.id,status:'shipped',tracking_number:'X'.repeat(201)},ctx),/tracking/i);
 assert.equal(applyUpdateFulfillment(recorded.data,{order_id:recorded.id,status:'delivered',tracking_number:''},ctx).data.orders[0].fulfillment_status,'delivered');
 const shipped=applyUpdateFulfillment(recorded.data,{order_id:recorded.id,status:'shipped',tracking_number:'MY123'},ctx);
 assert.equal(shipped.data.orders[0].fulfillment_status,'shipped');assert.equal(shipped.data.orders[0].tracking_number,'MY123');assert.deepEqual(shipped.data.events,recorded.data.events);
 const refunded=applyRefundOrder(recorded.data,{order_id:recorded.id,reason:'Full return approved'},ctx);
 assert.throws(()=>applyUpdateFulfillment(refunded.data,{order_id:recorded.id,status:'delivered',tracking_number:'MY123'},ctx),/refunded/i);
});
