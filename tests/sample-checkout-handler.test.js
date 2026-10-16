import { test } from "node:test";
import assert from "node:assert/strict";
import { createSampleCheckoutHandler } from "../supabase/functions/sample-checkout/handler.js";

const requestId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";
const claimId = "00000000-0000-4000-8000-000000000003";
const customer = { name: "Sample Customer", address: "123 Example Street", postcode: "50000", country: "Malaysia" };
const data = (extra = {}) => ({ action: "checkout", request_id: requestId, outcome: "success", customer, items: [{ product_id: "tee", size: "M", quantity: 2 }], expected_total_sen: 37800, ...extra });
const products = [{ id: "tee", name: "Tee", published: true, price_sen: 18900, variants: [{ size: "M", stock: 5 }] }];
const copy = (value) => value == null ? value : structuredClone(value);

function setup(options = {}) {
  const records = new Map();
  const deliveries = [];
  const attempts = [];
  const user = options.user || { id: "user-1", email: "owner@example.com", email_confirmed_at: "2026-10-16T00:00:00Z" };
  let catalogueReads = 0;
  let sends = 0;
  const repository = {
    getByRequest: async (userId, id) => copy([...records.values()].find((order) => order.user_id === userId && order.request_id === id) || null),
    getById: async (userId, id) => copy(records.get(id)?.user_id === userId ? records.get(id) : null),
    create: async (order) => {
      if ([...records.values()].some((saved) => saved.user_id === order.user_id && saved.request_id === order.request_id)) throw Error("Unique request conflict");
      const saved = copy({ ...order, created_at: "2026-10-16T02:00:00.000Z" });
      records.set(order.id, saved);
      options.afterCreate?.(copy(saved));
      if (options.createResponseLost) throw Error("Network response lost after database commit");
      return copy(saved);
    },
    setEmailUnavailable: async (id, status, error) => {
      const order = records.get(id);
      if (!["accepted", "sending", "review"].includes(order.email_status) && !order.email_retry_blocked) Object.assign(order, { email_status: status, email_error: error });
      return copy(order);
    },
    claimEmail: async (id) => {
      const order = records.get(id);
      if (options.claimBlocked || ["accepted", "review"].includes(order.email_status) || order.email_retry_blocked || order.email_status === "sending" && !options.resendClaimExpired) return { ...copy(order), email_claimed: false, email_claim_id: null };
      Object.assign(order, { email_status: "sending", email_attempted_at: "2026-10-16T02:01:00.000Z", email_claim_id: claimId, email_claim_provider: "resend" });
      return { ...copy(order), email_claimed: true, email_claim_id: claimId };
    },
    claimEmailOnce: async (id) => {
      const order = records.get(id);
      if (order.email_status === "sending" && options.onceClaimExpired) Object.assign(order, { email_status: "review", email_retry_blocked: true, email_error: "Email acceptance needs store review before another attempt." });
      if (options.claimBlocked || ["accepted", "sending", "review"].includes(order.email_status) || order.email_retry_blocked) return { ...copy(order), email_claimed: false };
      Object.assign(order, { email_status: "sending", email_attempted_at: "2026-10-16T02:01:00.000Z", email_claim_id: claimId, email_claim_provider: "sendgrid" });
      return { ...copy(order), email_claimed: true };
    },
    markEmailUnknown: async (id, claim, error) => {
      const order = records.get(id);
      assert.equal(claim, order.email_claim_id);
      if (order.email_status !== "accepted") Object.assign(order, { email_status: "review", email_retry_blocked: true, email_error: error });
      return copy(order);
    },
    finishEmail: async (id, claim, providerId, error) => {
      if (options.finishFails) throw Error("Database temporarily unavailable");
      const order = records.get(id);
      assert.equal(claim, order.email_claim_id);
      Object.assign(order, { email_status: providerId ? "accepted" : "failed", email_error: error || "", email_provider_id: providerId, email_accepted_at: providerId ? "2026-10-16T02:01:01.000Z" : null });
      return copy(order);
    },
    ...options.repository,
  };
  const config = { allowedOrigins: ["https://store.example"], resendConfigured: true, testRecipient: "owner@example.com", ...options.config };
  const handler = createSampleCheckoutHandler({
    authenticate: async (token) => {
      if (token !== "valid-token" || options.authFails) throw Error("Sensitive authentication provider response");
      return copy(user);
    },
    getProducts: async () => { catalogueReads += 1; return options.getProducts ? options.getProducts(catalogueReads) : copy(options.products || products); },
    repository,
    sendEmail: async (message) => {
      sends += 1;
      attempts.push(copy(message));
      assert.equal(records.size, 1, "persist the invoice before calling an email provider");
      if (options.sendUnknown) throw Object.assign(Error("Provider secret PRIVATE_KEY recipient=private@example.com"), { deliveryUnknown: true });
      if (options.sendFailure) throw Object.assign(Error("Resend secret re_PRIVATE_KEY recipient=private@example.com"), { deliveryUnknown: false });
      deliveries.push(message);
      if (options.beforeSendFinish) await options.beforeSendFinish();
      return { id: "provider-message-id" };
    },
    config,
    uuid: () => orderId,
    now: () => "2026-10-16T01:00:00.000Z",
  });
  async function request(body = data(), init = {}) {
    const response = await handler(new Request("https://project.example/functions/v1/sample-checkout", {
      method: "POST",
      headers: { origin: "https://store.example", authorization: "Bearer valid-token", "content-type": "application/json", ...init.headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
      ...init,
    }));
    return { response, body: await response.json() };
  }
  return { handler, request, records, deliveries, attempts, repository, reads: () => catalogueReads, sends: () => sends };
}

test("sample endpoint requires an allowed origin and a verified bearer customer", async () => {
  const store = setup();
  for (const headers of [{ origin: "https://attacker.example", authorization: "Bearer valid-token", "content-type": "application/json" }, { origin: "https://store.example", authorization: "Bearer wrong", "content-type": "application/json" }, { origin: "https://store.example", "content-type": "application/json" }]) {
    const result = await store.request(data(), { headers });
    assert.ok([401, 403].includes(result.response.status));
    assert.equal("order" in result.body, false);
    assert.ok(!JSON.stringify(result.body).includes("Sensitive"));
  }
  const unconfirmed = setup({ user: { id: "u", email: "owner@example.com", email_confirmed_at: null } });
  assert.equal((await unconfirmed.request()).response.status, 401);
  assert.equal(store.records.size, 0);
  assert.equal(store.sends(), 0);
});

test("CORS preflight succeeds only for configured origins including an explicit local-file null origin", async () => {
  const store = setup({ config: { allowedOrigins: ["https://store.example", "null"] } });
  const response = await store.handler(new Request("https://project.example", { method: "OPTIONS", headers: { origin: "null", "access-control-request-method": "POST" } }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "null");
  assert.match(response.headers.get("access-control-allow-headers"), /authorization/i);
  const denied = await setup().handler(new Request("https://project.example", { method: "OPTIONS", headers: { origin: "null" } }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("malformed and oversized requests fail before creating an invoice or sending mail", async () => {
  const store = setup();
  assert.equal((await store.request("{" )).response.status, 400);
  assert.equal((await store.request(data(), { headers: { origin: "https://store.example", authorization: "Bearer valid-token", "content-type": "text/plain" } })).response.status, 415);
  assert.equal((await store.request("x".repeat(65537))).response.status, 413);
  assert.equal((await store.request(data({ action: "arbitrary-email" }))).response.status, 400);
  assert.equal((await store.request(data({ outcome: "cancelled" }))).response.status, 400);
  assert.equal(store.records.size, 0);
  assert.equal(store.sends(), 0);
});

test("sample success stores one authoritative snapshot and emails only the verified account from the fixed test sender", async () => {
  const store = setup();
  const result = await store.request(data({ user_id: "victim", to: "victim@example.com", customer_email: "victim@example.com", price_sen: 1 }));
  assert.equal(result.response.status, 200);
  assert.equal(result.body.order.user_id, "user-1");
  assert.equal(result.body.order.total_sen, 37800);
  assert.equal(result.body.order.status, "sample_completed");
  assert.equal(result.body.order.email_status, "accepted");
  assert.equal(result.body.order.created_at, "2026-10-16T02:00:00.000Z");
  assert.equal("email_claim_id" in result.body.order, false);
  assert.equal("email_claimed" in result.body.order, false);
  assert.equal(store.deliveries[0].from, "CROWNNETIC Sample <onboarding@resend.dev>");
  assert.deepEqual(store.deliveries[0].to, ["owner@example.com"]);
  assert.equal(store.deliveries[0].idempotencyKey, `sample-invoice/${orderId}/v1`);
  assert.match(store.deliveries[0].html, /NO PAYMENT COLLECTED/);
  assert.equal(store.records.size, 1);
  assert.equal(store.sends(), 1);
});

test("matching checkout replays return the original invoice before reading changed catalogue prices", async () => {
  const store = setup();
  const first = await store.request();
  const replay = await store.request();
  assert.equal(replay.body.order.id, first.body.order.id);
  assert.equal(store.reads(), 1);
  assert.equal(store.records.size, 1);
  assert.equal(store.sends(), 1);
  const changed = await store.request(data({ customer: { ...customer, address: "A different address" } }));
  assert.equal(changed.response.status, 409);
  assert.equal(store.records.size, 1);
});

test("stale expected prices cannot persist an invoice", async () => {
  const store = setup();
  const result = await store.request(data({ expected_total_sen: 1 }));
  assert.equal(result.response.status, 409);
  assert.match(result.body.error, /price|total/i);
  assert.equal(store.records.size, 0);
});

test("missing email configuration keeps the successful sample invoice and accurately reports not_configured", async () => {
  const store = setup({ config: { resendConfigured: false } });
  const result = await store.request();
  assert.equal(result.response.status, 200);
  assert.equal(result.body.order.email_status, "not_configured");
  assert.match(result.body.order.email_error, /not configured/i);
  assert.equal(store.records.size, 1);
  assert.equal(store.sends(), 0);
});

test("the test recipient restriction never reroutes another customer's private invoice to the owner", async () => {
  const store = setup({ user: { id: "user-2", email: "customer@example.com", email_confirmed_at: "2026-10-16" } });
  const result = await store.request();
  assert.equal(result.body.order.customer_email, "customer@example.com");
  assert.equal(result.body.order.email_status, "restricted");
  assert.match(result.body.order.email_error, /test|recipient/i);
  assert.equal(store.sends(), 0);
});

test("provider failure preserves the invoice and reports a sanitized retryable email failure", async () => {
  const store = setup({ sendFailure: true });
  const result = await store.request();
  assert.equal(result.response.status, 200);
  assert.equal(result.body.order.email_status, "failed");
  assert.equal(store.records.size, 1);
  assert.ok(!JSON.stringify(result.body).includes("PRIVATE_KEY"));
  assert.ok(!JSON.stringify(result.body).includes("private@example.com"));
});

test("resends require invoice ownership and reuse the saved snapshot and stable email idempotency key", async () => {
  const store = setup({ config: { resendConfigured: false } });
  await store.request();
  store.records.get(orderId).email_status = "accepted";
  const owned = await store.request({ action: "resend", order_id: orderId, to: "attacker@example.com" });
  assert.equal(owned.response.status, 200);
  assert.equal(owned.body.order.id, orderId);
  assert.equal(store.reads(), 1);
  const unknown = await store.request({ action: "resend", order_id: "00000000-0000-4000-8000-000000000099" });
  assert.equal(unknown.response.status, 404);
  const malformed = await store.request({ action: "resend", order_id: "bad-id" });
  assert.equal(malformed.response.status, 400);
  assert.equal(store.sends(), 0);
});

test("a denied email claim returns its saved cooldown state without sending or creating another invoice", async () => {
  const store = setup({ claimBlocked: true });
  const result = await store.request();
  assert.equal(result.response.status, 200);
  assert.equal(result.body.order.email_status, "pending");
  assert.equal("email_claimed" in result.body.order, false);
  assert.equal(store.sends(), 0);
  assert.equal(store.records.size, 1);
});

test("concurrent checkout submissions cannot double-send an invoice", async () => {
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const store = setup({ beforeSendFinish: () => waiting });
  const first = store.request();
  const deadline = Date.now() + 1000;
  while (store.sends() === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 1));
  if (store.sends() === 0) { release(); assert.fail("The first checkout did not reach email delivery"); }
  const second = await store.request();
  assert.equal(second.body.order.email_status, "sending");
  release();
  const completed = await first;
  assert.equal(completed.body.order.email_status, "accepted");
  assert.equal(store.records.size, 1);
  assert.equal(store.sends(), 1);
});

test("a lost create response recovers the committed invoice instead of failing or creating a second record", async () => {
  const store = setup({ createResponseLost: true });
  const result = await store.request();
  assert.equal(result.response.status, 200);
  assert.equal(result.body.order.id, orderId);
  assert.equal(result.body.order.email_status, "accepted");
  assert.equal(store.records.size, 1);
});

test("concurrent first requests resolve a unique request conflict to the same saved invoice", async () => {
  const store = setup();
  const results = await Promise.all([store.request(), store.request()]);
  assert.deepEqual(results.map(({ response }) => response.status), [200, 200]);
  assert.equal(results[0].body.order.id, results[1].body.order.id);
  assert.equal(store.records.size, 1);
  assert.equal(store.sends(), 1);
});

test("a concurrent replay recovers the committed snapshot when catalogue prices change after both initial lookups miss", async () => {
  let secondCatalogueLookup;
  let firstCommit;
  const bothMissed = new Promise((resolve) => { secondCatalogueLookup = resolve; });
  const committed = new Promise((resolve) => { firstCommit = resolve; });
  const store = setup({
    afterCreate: () => firstCommit(),
    getProducts: async (read) => {
      if (read === 1) { await bothMissed; return copy(products); }
      secondCatalogueLookup();
      await committed;
      return [{ ...copy(products[0]), price_sen: 19000 }];
    },
  });
  const [first, concurrent] = await Promise.all([store.request(), store.request()]);
  assert.equal(first.response.status, 200);
  assert.equal(concurrent.response.status, 200);
  assert.equal(concurrent.body.order.id, first.body.order.id);
  assert.equal(concurrent.body.order.total_sen, 37800);
  assert.equal(store.records.size, 1);
  assert.equal(store.sends(), 1);
});

test("catalogue failure recovery still rejects a request key committed with different checkout details", async () => {
  const original = await setup().request();
  let lookups = 0;
  const concurrent = setup({
    repository: { getByRequest: async () => ++lookups === 1 ? null : copy(original.body.order) },
    getProducts: async () => { throw Error("Catalogue temporarily unavailable"); },
  });
  const result = await concurrent.request(data({ customer: { ...customer, address: "A different address" } }));
  assert.equal(result.response.status, 409);
  assert.equal("order" in result.body, false);
  assert.equal(concurrent.records.size, 0);
  assert.equal(concurrent.sends(), 0);
});

test("retry after a definitive provider rejection reuses the invoice and provider idempotency key", async () => {
  const options = { sendFailure: true };
  const store = setup(options);
  const first = await store.request();
  assert.equal(first.body.order.email_status, "failed");
  options.sendFailure = false;
  const retry = await store.request({ action: "resend", order_id: orderId });
  assert.equal(retry.body.order.email_status, "accepted");
  assert.equal(retry.body.order.id, first.body.order.id);
  assert.equal(store.reads(), 1);
  assert.equal(store.records.size, 1);
  assert.equal(store.attempts[0].idempotencyKey, store.attempts[1].idempotencyKey);
  assert.equal(store.deliveries.length, 1);
});

test("a customer cannot retry another customer's sample invoice email", async () => {
  const store = setup({ config: { resendConfigured: false } });
  await store.request();
  store.records.get(orderId).user_id = "another-user";
  const result = await store.request({ action: "resend", order_id: orderId });
  assert.equal(result.response.status, 404);
  assert.equal("order" in result.body, false);
  assert.equal(store.sends(), 0);
});

test("an email accepted before a database completion failure is not falsely recorded as a provider rejection", async () => {
  const store = setup({ finishFails: true });
  const result = await store.request();
  assert.equal(result.response.status, 200);
  assert.equal(result.body.order.email_status, "sending");
  assert.equal(store.records.get(orderId).email_status, "sending");
  assert.equal(store.sends(), 1);
  assert.ok(!JSON.stringify(result.body).includes("Database temporarily unavailable"));
});

const sendgridConfig = { provider: "sendgrid", sendgridConfigured: true, fromEmail: "verified-sender@example.com" };

test("SendGrid invoices reach any verified account email and ignore caller-controlled sender or recipients", async () => {
  const store = setup({ config: sendgridConfig, user: { id: "customer-2", email: "international.customer@example.net", email_confirmed_at: "2026-10-16" } });
  const result = await store.request(data({ to: "victim@example.com", from: "spoof@example.com", customer_email: "victim@example.com", points: 999999 }));
  assert.equal(result.response.status, 200);
  assert.equal(result.body.order.email_status, "accepted");
  assert.equal(result.body.order.points, 200);
  assert.deepEqual(store.deliveries[0].to, ["international.customer@example.net"]);
  assert.equal(store.deliveries[0].from, "verified-sender@example.com");
  assert.equal(store.deliveries[0].invoiceId, orderId);
  assert.equal("idempotencyKey" in store.deliveries[0], false);
  assert.equal(store.records.get(orderId).email_claim_provider, "sendgrid");
});

test("SendGrid requires its own API key configuration and a valid verified sender address", async () => {
  for (const config of [{ ...sendgridConfig, sendgridConfigured: false }, { ...sendgridConfig, fromEmail: "" }, { ...sendgridConfig, fromEmail: "Header\r\nBcc: victim@example.com" }]) {
    const store = setup({ config });
    const result = await store.request();
    assert.equal(result.body.order.email_status, "not_configured");
    assert.equal(store.records.size, 1);
    assert.equal(store.sends(), 0);
  }
});

test("an explicit SendGrid rejection may retry the saved invoice without creating or awarding another order", async () => {
  const options = { config: sendgridConfig, sendFailure: true };
  const store = setup(options);
  const first = await store.request();
  assert.equal(first.body.order.email_status, "failed");
  options.sendFailure = false;
  const retried = await store.request({ action: "resend", order_id: orderId });
  assert.equal(retried.body.order.email_status, "accepted");
  assert.equal(retried.body.order.id, first.body.order.id);
  assert.equal(store.records.size, 1);
  assert.equal(store.reads(), 1);
  assert.equal(store.sends(), 2);
});

test("uncertain SendGrid acceptance requires store review and blocks a second send", async () => {
  const options = { config: sendgridConfig, sendUnknown: true };
  const store = setup(options);
  const first = await store.request();
  assert.equal(first.body.order.email_status, "review");
  assert.equal(first.body.order.email_retry_blocked, true);
  assert.ok(!JSON.stringify(first.body).includes("PRIVATE_KEY"));
  options.sendUnknown = false;
  const retry = await store.request({ action: "resend", order_id: orderId });
  assert.equal(retry.body.order.email_status, "review");
  assert.equal(store.sends(), 1);
});

test("SendGrid acceptance followed by a lost database finish cannot trigger a second send", async () => {
  const options = { config: sendgridConfig, finishFails: true };
  const store = setup(options);
  const first = await store.request();
  assert.equal(first.body.order.email_status, "sending");
  options.finishFails = false;
  const liveRetry = await store.request({ action: "resend", order_id: orderId });
  assert.equal(liveRetry.body.order.email_status, "sending");
  options.onceClaimExpired = true;
  const staleRetry = await store.request({ action: "resend", order_id: orderId });
  assert.equal(staleRetry.body.order.email_status, "review");
  assert.equal(staleRetry.body.order.email_retry_blocked, true);
  assert.equal(store.sends(), 1);
});

test("unknown Resend acceptance remains in-flight and only retries with the same provider idempotency key", async () => {
  const options = { sendUnknown: true };
  const store = setup(options);
  const first = await store.request();
  assert.equal(first.body.order.email_status, "sending");
  options.sendUnknown = false;
  const liveRetry = await store.request({ action: "resend", order_id: orderId });
  assert.equal(liveRetry.body.order.email_status, "sending");
  assert.equal(store.sends(), 1);
  options.resendClaimExpired = true;
  const laterRetry = await store.request({ action: "resend", order_id: orderId });
  assert.equal(laterRetry.body.order.email_status, "accepted");
  assert.equal(store.attempts[0].idempotencyKey, store.attempts[1].idempotencyKey);
  assert.equal(store.records.size, 1);
});
