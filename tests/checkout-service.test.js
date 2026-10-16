import test from "node:test";
import assert from "node:assert/strict";
import { createCheckoutStore, consumeInvoiceBag } from "../checkout/service.js";

const a = { id: "10000000-0000-4000-8000-000000000001", email: "a@example.com", name: "Member A" };
const b = { id: "10000000-0000-4000-8000-000000000002", email: "b@example.com", name: "Member B" };
const product = { id: "20000000-0000-4000-8000-000000000001", name: "Sample Tee", published: true, price_sen: 18900, variants: [{ size: "M", stock: 10 }] };
const input = () => ({ outcome: "success", items: [{ product_id: product.id, size: "M", quantity: 2 }], expected_total_sen: 37800, customer: { name: "Sample Member", email: "ignored@example.com", address: "123 Example Street", postcode: "50000", country: "Malaysia" } });
function memory() {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
}
function fixture(overrides = {}) {
  let user = a, catalog = [structuredClone(product)], count = 10;
  const storage = memory(), sessionStorage = memory();
  const deps = { connected: false, storage, sessionStorage, getUser: async () => user, getProducts: async () => catalog, now: () => "2026-10-16T09:00:00Z", uuid: () => `30000000-0000-4000-8000-${String(++count).padStart(12, "0")}`, ...overrides };
  return { store: createCheckoutStore(deps), deps, storage, sessionStorage, setUser: value => { user = value; }, setCatalog: value => { catalog = value; } };
}

test("a persisted sample invoice replays across refresh and retains original prices", async () => {
  const f = fixture();
  const first = await f.store.complete(input());
  assert.equal(first.total_sen, 37800);
  assert.equal(first.email_status, "preview_only");
  assert.equal(first.customer_email, a.email);
  f.setCatalog([{ ...product, name: "Changed Tee", price_sen: 99999 }]);
  const refreshed = createCheckoutStore(f.deps);
  const repeated = await refreshed.complete(input());
  assert.equal(repeated.id, first.id);
  assert.equal(repeated.items[0].name, "Sample Tee");
  assert.equal(repeated.total_sen, 37800);
  assert.equal((await refreshed.list()).length, 1);
  refreshed.acknowledge(first);
  f.setCatalog([product]);
  assert.notEqual((await refreshed.complete(input())).id, first.id);
});

test("customers and guest sessions cannot read another owner's sample invoices", async () => {
  const f = fixture();
  const invoice = await f.store.complete(input());
  f.setUser(b);
  assert.equal(await f.store.get(invoice.id), null);
  assert.deepEqual(await f.store.list(), []);
  f.setUser(null);
  const guestInvoice = await f.store.complete(input());
  assert.equal((await f.store.list()).length, 1);
  assert.equal(await f.store.get(invoice.id), null);
  const anotherSession = createCheckoutStore({ ...f.deps, sessionStorage: memory() });
  assert.equal(await anotherSession.get(guestInvoice.id), null);
  f.setUser(a);
  assert.equal((await f.store.list()).length, 1);
});

test("declined and cancelled sample payments create no invoice or email request", async () => {
  const f = fixture({ getProducts: () => { throw Error("Catalogue must not be consulted"); } });
  await assert.rejects(f.store.complete({ ...input(), outcome: "declined" }), /declined/i);
  await assert.rejects(f.store.complete({ ...input(), outcome: "cancelled" }), /cancelled/i);
  assert.equal(f.storage.getItem("crownetic.sample-orders.v1"), null);
});

test("failed persistence keeps the same request available for a safe retry", async () => {
  const f = fixture();
  const setItem = f.storage.setItem;
  f.storage.setItem = () => { throw Error("Storage full"); };
  await assert.rejects(f.store.complete(input()), /Storage full/);
  assert.deepEqual(await f.store.list(), []);
  f.storage.setItem = setItem;
  const order = await f.store.complete(input());
  assert.equal(order.request_id, JSON.parse(f.sessionStorage.getItem("crownetic.checkout.pending.v1")).request_id);
  assert.equal((await f.store.list()).length, 1);
});

test("account changes during catalogue loading prevent storing another user's invoice", async () => {
  let release;
  const f = fixture({ getProducts: () => new Promise(resolve => { release = resolve; }) });
  const pending = f.store.complete(input());
  await new Promise(resolve => setImmediate(resolve));
  f.setUser(b);
  release([product]);
  await assert.rejects(pending, /account|sign in/i);
  assert.deepEqual(await f.store.list(), []);
});

test("connected checkout sends only canonical selections to its authenticated function", async () => {
  const calls = [], order = { id: "30000000-0000-4000-8000-000000000099", request_id: "30000000-0000-4000-8000-000000000011", user_id: a.id, email_status: "accepted" };
  const f = fixture({ connected: true, getClient: async () => ({ functions: { invoke: async (name, args) => { calls.push({ name, args }); return { data: { order } }; } } }) });
  assert.equal((await f.store.complete(input())).id, order.id);
  assert.equal(calls[0].name, "sample-checkout");
  assert.equal(calls[0].args.body.action, "checkout");
  assert.equal(calls[0].args.body.customer.email, undefined);
  assert.equal(calls[0].args.body.user_id, undefined);
  assert.equal(f.storage.getItem("crownetic.sample-orders.v1"), null);
  await f.store.resend(order.id);
  assert.deepEqual(calls[1].args.body, { action: "resend", order_id: order.id });
});

test("connected failures never fall back to local invoice creation", async () => {
  const f = fixture({ connected: true, getClient: async () => ({ functions: { invoke: async () => ({ error: { context: new Response(JSON.stringify({ error: "Prices changed. Review your bag." }), { status: 409 }) } }) } }) });
  await assert.rejects(f.store.complete(input()), /Prices changed/);
  assert.equal(f.storage.getItem("crownetic.sample-orders.v1"), null);
  f.setUser(null);
  await assert.rejects(f.store.complete(input()), /sign in/i);
});

test("browser-only invoices cannot claim to send an email", async () => {
  const f = fixture();
  const order = await f.store.complete(input());
  await assert.rejects(f.store.resend(order.id), /preview|email.*not/i);
  assert.equal((await f.store.get(order.id)).email_status, "preview_only");
});

test("an account switch while the server completes checkout cannot expose the old invoice", async () => {
  let release;
  const f = fixture({ connected: true, getClient: async () => ({ functions: { invoke: () => new Promise(resolve => { release = resolve; }) } }) });
  const pending = f.store.complete(input());
  await new Promise(resolve => setImmediate(resolve));
  f.setUser(b);
  release({ data: { order: { id: "30000000-0000-4000-8000-000000000099", user_id: a.id } } });
  await assert.rejects(pending, /account|sign in/i);
});

test("receipt acknowledgement tolerates an unavailable session store after order persistence", async () => {
  const f = fixture();
  const order = await f.store.complete(input());
  f.sessionStorage.removeItem = () => { throw Error("Session storage unavailable"); };
  assert.doesNotThrow(() => f.store.acknowledge(order));
  assert.equal((await f.store.get(order.id)).id, order.id);
});

test("an ambiguous response restores and replays the exact submitted details and quote after refresh", async () => {
  const calls = [];
  const f = fixture({ connected: true, getClient: async () => ({ functions: { invoke: async (_name, { body }) => {
    calls.push(body);
    return calls.length === 1
      ? { error: { context: new Response(JSON.stringify({ error: "Connection lost" }), { status: 503 }) } }
      : { data: { order: { id: "30000000-0000-4000-8000-000000000099", user_id: a.id } } };
  } } }) });
  const original = { ...input(), customer: { ...input().customer, address: "42 Original Sample Road" } };
  await assert.rejects(f.store.complete(original), /Connection lost/);
  const refreshed = createCheckoutStore(f.deps);
  const draft = await refreshed.pending();
  assert.equal(draft.customer.address, "42 Original Sample Road");
  await refreshed.complete({ ...input(), expected_total_sen: 99900 });
  assert.deepEqual(calls[1], calls[0]);
});

test("only invoiced quantities are removed so newly added bag items remain", () => {
  const bag = [{ productId: product.id, size: "M", quantity: 3 }, { productId: "cap", size: "ONE SIZE", quantity: 1 }];
  const result = consumeInvoiceBag(bag, [{ product_id: product.id, size: "M", quantity: 2 }]);
  assert.deepEqual(result, [{ ...bag[0], quantity: 1 }, bag[1]]);
  assert.equal(bag[0].quantity, 3);
});

test("an invalid guest preview email cannot trap corrected retries in a saved request", async () => {
  const f = fixture();
  f.setUser(null);
  await assert.rejects(f.store.complete({ ...input(), customer: { ...input().customer, email: "a@b" } }), /email/i);
  assert.equal(f.sessionStorage.getItem("crownetic.checkout.pending.v1"), null);
  const order = await f.store.complete({ ...input(), customer: { ...input().customer, email: "guest@example.com" } });
  assert.equal(order.customer_email, "guest@example.com");
});

test("signed-in sample points are frozen by quantity and product override even without email delivery", async () => {
  const f = fixture();
  f.setCatalog([{ ...product, reward_points: 600 }]);
  const order = await f.store.complete(input());
  assert.equal(order.points, 1200);
  assert.equal(order.items[0].reward_points, 600);
  assert.equal(order.email_status, "preview_only");
  f.setCatalog([{ ...product, reward_points: 0 }]);
  const replay = await createCheckoutStore(f.deps).complete(input());
  assert.equal(replay.id, order.id);
  assert.equal(replay.points, 1200);
  assert.equal((await f.store.list()).length, 1);
});

test("guest invoices earn zero account points and cannot transfer awards by signing in", async () => {
  const f = fixture();
  f.setUser(null);
  const order = await f.store.complete(input());
  assert.equal(order.points, 0);
  f.setUser(a);
  assert.deepEqual(await f.store.list(), []);
  assert.equal(await f.store.get(order.id), null);
  assert.equal((await f.store.complete(input())).points, 200);
});

test("a late definitive failure cannot erase a different account's pending request", async () => {
  let failA;
  const f = fixture({ connected: true, getClient: async () => ({ functions: { invoke: (_name, { body }) => new Promise(resolve => {
    if (!failA) failA = () => resolve({ error: { context: new Response(JSON.stringify({ error: "Price changed", code: "price_changed" }), { status: 409 }) } });
    else resolve({ data: { order: { id: "30000000-0000-4000-8000-000000000099", user_id: b.id, request_id: body.request_id } } });
  }) } }) });
  const requestA = f.store.complete(input());
  await new Promise(resolve => setImmediate(resolve));
  f.setUser(b);
  const orderB = await f.store.complete(input());
  failA();
  await assert.rejects(requestA, /Price changed/);
  assert.equal((await f.store.pending()).request_id, orderB.request_id);
});
