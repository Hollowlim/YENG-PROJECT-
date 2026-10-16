import { test } from "node:test";
import assert from "node:assert/strict";
import { createInvoiceEmailSender } from "../supabase/functions/sample-checkout/email-provider.js";

const invoiceId = "00000000-0000-4000-8000-000000000002";
const message = { invoiceId, from: "verified@example.com", to: ["customer@example.net"], subject: "CROWNNETIC SAMPLE INVOICE", html: "<p>SAMPLE INVOICE</p>", text: "SAMPLE INVOICE", idempotencyKey: `sample-invoice/${invoiceId}/v1` };

test("SendGrid sends a real mail request from the verified sender without sandbox or unsupported idempotency headers", async () => {
  let request;
  const send = createInvoiceEmailSender({ provider: "sendgrid", sendgridKey: "SG_TEST_ONLY", fetchImpl: async (url, init) => { request = { url, init }; return new Response(null, { status: 202, headers: { "x-message-id": "sg-message-123" } }); } });
  assert.deepEqual(await send(message), { id: "sg-message-123" });
  assert.equal(request.url, "https://api.sendgrid.com/v3/mail/send");
  assert.equal(request.init.method, "POST");
  const headers = new Headers(request.init.headers);
  assert.equal(headers.get("authorization"), "Bearer SG_TEST_ONLY");
  assert.equal(headers.get("idempotency-key"), null);
  const payload = JSON.parse(request.init.body);
  assert.deepEqual(payload.personalizations, [{ to: [{ email: "customer@example.net" }] }]);
  assert.deepEqual(payload.from, { email: "verified@example.com", name: "CROWNNETIC Sample" });
  assert.deepEqual(payload.content, [{ type: "text/plain", value: message.text }, { type: "text/html", value: message.html }]);
  assert.equal("mail_settings" in payload, false);
  assert.ok(request.init.signal instanceof AbortSignal);
});

test("SendGrid 202 without a message header still records acceptance using an invoice-specific marker", async () => {
  const send = createInvoiceEmailSender({ provider: "sendgrid", sendgridKey: "SG_TEST_ONLY", fetchImpl: async () => new Response(null, { status: 202 }) });
  assert.deepEqual(await send(message), { id: `sendgrid:${invoiceId}` });
});

test("explicit SendGrid client rejections are safe to retry and never expose provider response bodies", async () => {
  for (const status of [400, 401, 403, 404, 429]) {
    const send = createInvoiceEmailSender({ provider: "sendgrid", sendgridKey: "SG_TEST_ONLY", fetchImpl: async () => new Response("secret-key SG_PRIVATE recipient=private@example.com", { status }) });
    await assert.rejects(send(message), (error) => error.deliveryUnknown === false && !/PRIVATE|private@example/.test(error.message));
  }
});

test("SendGrid network failures, timeouts, 408 and server errors have unknown acceptance and cannot be safely retried", async () => {
  for (const status of [408, 500, 502, 503, 200]) {
    const send = createInvoiceEmailSender({ provider: "sendgrid", sendgridKey: "SG_TEST_ONLY", fetchImpl: async () => new Response(null, { status }) });
    await assert.rejects(send(message), (error) => error.deliveryUnknown === true);
  }
  for (const failure of [new TypeError("SG_PRIVATE response lost"), new DOMException("timeout details", "TimeoutError")]) {
    const send = createInvoiceEmailSender({ provider: "sendgrid", sendgridKey: "SG_TEST_ONLY", fetchImpl: async () => { throw failure; } });
    await assert.rejects(send(message), (error) => error.deliveryUnknown === true && !/PRIVATE|timeout details/.test(error.message));
  }
});

test("an invalid SendGrid sender cannot issue a provider request", async () => {
  let fetched = false;
  const send = createInvoiceEmailSender({ provider: "sendgrid", sendgridKey: "SG_TEST_ONLY", fetchImpl: async () => { fetched = true; return new Response(null, { status: 202 }); } });
  await assert.rejects(send({ ...message, from: "Not a verified email\r\nBcc: victim@example.com" }), /sender/i);
  assert.equal(fetched, false);
});

test("Resend retains the existing stable idempotency key and acceptance identifier", async () => {
  let request;
  const send = createInvoiceEmailSender({ provider: "resend", resendKey: "re_TEST_ONLY", fetchImpl: async (url, init) => { request = { url, init }; return new Response(JSON.stringify({ id: "resend-message-123" }), { status: 200 }); } });
  assert.deepEqual(await send({ ...message, from: "CROWNNETIC Sample <onboarding@resend.dev>" }), { id: "resend-message-123" });
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(new Headers(request.init.headers).get("idempotency-key"), message.idempotencyKey);
  assert.deepEqual(JSON.parse(request.init.body).to, ["customer@example.net"]);
});
