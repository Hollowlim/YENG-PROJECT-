import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCustomerOrders } from '../customer/orders.js';

function query(result) {
 const calls=[];
 const db={from(table){calls.push(['from',table]);return this;},select(columns){calls.push(['select',columns]);return this;},eq(column,value){calls.push(['eq',column,value]);return this;},async order(column,options){calls.push(['order',column,options]);return result;}};
 return {db,calls};
}

test('customer order reads always filter to the signed-in customer and keep newest first',async()=>{
 const {db,calls}=query({data:[{id:'own-order',user_id:'customer-1'}],error:null});
 assert.deepEqual(await readCustomerOrders(db,'customer-1'),[{id:'own-order',user_id:'customer-1'}]);
 assert.deepEqual(calls,[['from','orders'],['select','*,items:order_items(*)'],['eq','user_id','customer-1'],['order','created_at',{ascending:false}]]);
 const unauthenticated=query({data:[],error:null});
 await assert.rejects(readCustomerOrders(unauthenticated.db,null),/sign in/i);assert.deepEqual(unauthenticated.calls,[]);
});

test('customer dashboards tolerate only missing order schema during migration rollout',async()=>{
 for(const code of ['42P01','PGRST200','PGRST205']) {
  const {db}=query({data:null,error:{code,message:'Missing order schema'}});
  assert.deepEqual(await readCustomerOrders(db,'customer-1'),[]);
 }
 for(const error of [{code:'42501',message:'Permission denied'},{code:'PGRST301',message:'Invalid JWT'},Error('Network unavailable')]) {
  const {db}=query({data:null,error});
  await assert.rejects(readCustomerOrders(db,'customer-1'),actual=>actual===error);
 }
});
