import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailAuth } from '../customer/email-auth.js';
function setup(overrides = {}) {
  const entries = new Map();
  const storage = { getItem: k => entries.get(k), setItem: (k,v) => entries.set(k,v), removeItem: k => entries.delete(k) };
  const calls = [];
  const auth = {
    signUp: async body => { calls.push(['signup',body]); return { data: { user: { id:'u1' }, session:null }, error:null }; },
    signInWithPassword: async () => ({ data: { user: { email_confirmed_at:'2026-10-16' }, session:{} }, error:null }),
    verifyOtp: async body => { calls.push(['verify',body]); return { data: { user: { email_confirmed_at:'2026-10-16' }, session:{access_token:'test'} }, error:null }; },
    resend: async body => { calls.push(['resend',body]); return { error:null }; },
    signOut: async () => { calls.push(['signout']); return { error:null }; },
    ...overrides,
  };
  let time = 100000;
  const service = createEmailAuth({ getClient: async () => ({auth}), storage, now: () => time });
  return {service, calls, entries, advance: () => { time += 61000; }};
}
test('signup waits for confirmation and stores no password or code', async () => {
  const {service,calls,entries} = setup();
  assert.deepEqual(await service.signup({name:'Member',email:' Member@Example.com ',password:'PrivatePassword123'}), {confirmation:true,email:'member@example.com'});
  assert.equal(service.pending().email,'member@example.com');
  assert.equal(service.remaining(),60);
  assert.equal(calls[0][1].options.data.name,'Member');
  assert.ok(!JSON.stringify([...entries]).includes('PrivatePassword123'));
});
test('signup refuses an automatically authenticated session when confirmation is disabled', async () => {
  const {service,calls} = setup({signUp:async()=>({data:{user:{},session:{}},error:null})});
  await assert.rejects(service.signup({name:'Member',email:'m@example.com',password:'SamplePass'}), /not enabled/);
  assert.deepEqual(calls,[['signout']]);
});
test('unconfirmed login opens verification without granting access', async () => {
  const {service} = setup({signInWithPassword:async()=>({data:{},error:{code:'email_not_confirmed',message:'Email not confirmed'}})});
  assert.equal((await service.login('member@example.com','SamplePass')).confirmation,true);
  assert.equal(service.pending().email,'member@example.com');
});
test('invalid and expired codes cannot complete verification or clear the pending email', async () => {
  const {service,calls} = setup({verifyOtp:async()=>({data:{},error:Error('Code is invalid or expired.')})});
  service.remember('member@example.com');
  await assert.rejects(service.verify('member@example.com','12abc3'),/verification code/);
  assert.equal(calls.length,0);
  await assert.rejects(service.verify('member@example.com','123456'),/expired/);
  assert.equal(service.pending().email,'member@example.com');
});
test('verification requires a confirmed session and clears pending state only on success', async () => {
  const {service,calls} = setup();
  service.remember('member@example.com');
  await service.verify('member@example.com','123456');
  assert.deepEqual(calls[0],['verify',{email:'member@example.com',token:'123456',type:'email'}]);
  assert.equal(service.pending(),null);
  const incomplete=setup({verifyOtp:async()=>({data:{user:{},session:null},error:null})});
  await assert.rejects(incomplete.service.verify('member@example.com','123456'),/not complete/);
});
test('resend observes its cooldown and only advances after a successful provider response', async () => {
  const {service,calls,advance} = setup();
  await service.resend('member@example.com');
  assert.equal(service.remaining(),60);
  await assert.rejects(service.resend('member@example.com'),/wait/);
  assert.equal(calls.length,1);
  advance();
  await service.resend('member@example.com');
  assert.deepEqual(calls[1],['resend',{type:'signup',email:'member@example.com'}]);
  const failed=setup({resend:async()=>({error:Error('Rate limited')})});
  await assert.rejects(failed.service.resend('member@example.com'),/Rate limited/);
  assert.equal(failed.service.remaining(),0);
});
