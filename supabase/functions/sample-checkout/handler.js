import { CheckoutError, normalizeCheckout, buildSampleInvoice, renderInvoiceEmail } from "../../../checkout/invoice.js";

const MAX_BODY_BYTES = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_UNAVAILABLE = "Invoice email is not configured for this sample. Your sample invoice is saved; no email was sent.";
const EMAIL_RESTRICTED = "Test email can only be sent to the configured verified test recipient. Your sample invoice is saved; no email was sent.";
const EMAIL_FAILED = "The email provider did not confirm acceptance. Your sample invoice is saved. You can retry its email without creating another invoice.";

function publicOrder(value) {
  if (!value) return value;
  const { email_claim_id, email_claimed, email_lease_until, ...order } = value;
  return order;
}

function sameRequest(previous, current) {
  // The payload is a canonical projection, not the caller's arbitrary JSON.
  try {
    return JSON.stringify(normalizeCheckout(previous)) === JSON.stringify(current);
  } catch {
    return false;
  }
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new CheckoutError("Use an application/json request.", 415, "unsupported_content_type");
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new CheckoutError("The sample checkout request is too large.", 413, "request_too_large");
  if (!request.body) throw new CheckoutError("A JSON checkout request is required.");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new CheckoutError("The sample checkout request is too large.", 413, "request_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("Object required");
    return parsed;
  } catch {
    throw new CheckoutError("A valid JSON checkout object is required.");
  }
}

export function createSampleCheckoutHandler({ authenticate, getProducts, repository, sendEmail, config, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() }) {
  const origins = new Set(config.allowedOrigins || []);

  async function currentOrder(userId, order, fallback = order) {
    try { return await repository.getById(userId, order.id) || fallback; }
    catch { return fallback; }
  }

  async function deliverInvoice(order, user) {
    if (order.email_status === "accepted") return order;
    const recipient = String(user.email || "").trim().toLowerCase();
    const allowedRecipient = String(config.testRecipient || "").trim().toLowerCase();
    if (!config.resendConfigured || !/^\S+@\S+\.\S+$/.test(allowedRecipient)) return repository.setEmailUnavailable(order.id, "not_configured", EMAIL_UNAVAILABLE);
    if (recipient !== allowedRecipient || String(order.customer_email).toLowerCase() !== recipient) return repository.setEmailUnavailable(order.id, "restricted", EMAIL_RESTRICTED);
    const claimed = await repository.claimEmail(order.id);
    if (!claimed.email_claimed || !claimed.email_claim_id) return publicOrder(claimed);
    // Render the persisted invoice returned by the claim, never the browser's
    // content or the unpersisted catalogue preview used to propose the order.
    const message = renderInvoiceEmail(claimed);
    let accepted;
    try {
      accepted = await sendEmail({
        from: "CROWNNETIC Sample <onboarding@resend.dev>",
        to: [recipient],
        ...message,
        idempotencyKey: `sample-invoice/${claimed.id}/v1`,
      });
      if (!accepted || typeof accepted.id !== "string" || !accepted.id || accepted.id.length > 200) throw Error("No provider acceptance identifier");
    } catch (failure) {
      const error = failure?.name === "AbortError" || failure?.name === "TimeoutError"
        ? "The email request timed out before acceptance was confirmed. Your sample invoice is saved. Retry its email after the cooldown."
        : EMAIL_FAILED;
      try { return await repository.finishEmail(claimed.id, claimed.email_claim_id, null, error); }
      catch { return currentOrder(user.id, claimed); }
    }
    // If this write fails after the provider accepted the message, keep the
    // saved sending state. Calling it a rejection would misrepresent delivery.
    try { return await repository.finishEmail(claimed.id, claimed.email_claim_id, accepted.id, ""); }
    catch { return currentOrder(user.id, claimed); }
  }

  return async function sampleCheckout(request) {
    const origin = request.headers.get("origin");
    const allowed = origin !== null && origins.has(origin);
    const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", vary: "Origin" });
    if (allowed) {
      headers.set("access-control-allow-origin", origin);
      headers.set("access-control-allow-methods", "POST, OPTIONS");
      headers.set("access-control-allow-headers", "authorization, apikey, content-type, x-client-info");
    }
    const respond = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers });
    if (!allowed) return respond({ error: "This storefront origin is not allowed to use sample checkout." }, 403);
    if (request.method === "OPTIONS") return respond(null, 204);
    if (request.method !== "POST") {
      headers.set("allow", "POST, OPTIONS");
      return respond({ error: "Use POST for sample checkout." }, 405);
    }
    try {
      const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "");
      if (!bearer) throw new CheckoutError("Sign in with a verified customer account first.", 401, "authentication_required");
      let user;
      try { user = await authenticate(bearer[1]); }
      catch { throw new CheckoutError("Sign in with a verified customer account first.", 401, "authentication_required"); }
      if (!user?.id || !user.email_confirmed_at || !/^\S+@\S+\.\S+$/.test(String(user.email || ""))) throw new CheckoutError("Confirm your email and sign in before sample checkout.", 401, "authentication_required");
      const body = await readJson(request);
      const action = body.action || "checkout";
      let order;
      if (action === "checkout") {
        const canonical = normalizeCheckout(body);
        order = await repository.getByRequest(user.id, canonical.request_id);
        if (order) {
          if (!sameRequest(order.request_payload, canonical)) throw new CheckoutError("This checkout request was already used with different details. Start a new sample checkout.", 409, "request_conflict");
        } else {
          try {
            const products = await getProducts(canonical.items.map((item) => item.product_id));
            const candidate = buildSampleInvoice({ id: uuid(), requestId: canonical.request_id, user, customer: canonical.customer, lines: canonical.items, products, expectedTotal: canonical.expected_total_sen, createdAt: now() });
            order = await repository.create(candidate);
          }
          catch (failure) {
            // Another identical request may have committed after our initial
            // lookup. Its saved snapshot wins even if a newer catalogue read,
            // validation or create attempt fails after that first commit.
            order = await repository.getByRequest(user.id, canonical.request_id);
            if (!order) throw failure;
            if (!sameRequest(order.request_payload, canonical)) throw new CheckoutError("This checkout request was already used with different details. Start a new sample checkout.", 409, "request_conflict");
          }
        }
      } else if (action === "resend") {
        if (typeof body.order_id !== "string" || !UUID.test(body.order_id)) throw new CheckoutError("A valid sample invoice ID is required.");
        order = await repository.getById(user.id, body.order_id.toLowerCase());
        if (!order) throw new CheckoutError("This sample invoice was not found for your account.", 404, "invoice_not_found");
      } else throw new CheckoutError("Choose sample checkout or invoice email retry.");
      if (!order || order.user_id !== user.id || order.status !== "sample_completed") throw new CheckoutError("This sample invoice was not found for your account.", 404, "invoice_not_found");
      try { order = await deliverInvoice(order, user); }
      catch { order = await currentOrder(user.id, order); }
      return respond({ order: publicOrder(order) });
    } catch (error) {
      if (error instanceof CheckoutError) return respond({ error: error.message, code: error.code }, error.status);
      return respond({ error: "The sample invoice service is temporarily unavailable. Try again with the same checkout." }, 503);
    }
  };
}
