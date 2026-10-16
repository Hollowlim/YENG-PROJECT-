// Shared by the browser preview, Node tests and the Supabase Edge Function.
// This module has no storage, payment, email or environment side effects.
const MAX_AMOUNT = 2147483647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CheckoutError extends Error {
  constructor(message, status = 400, code = "invalid_checkout") {
    super(message);
    this.name = "CheckoutError";
    this.status = status;
    this.code = code;
  }
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CheckoutError(`${label} is required.`);
  return value;
}

function text(value, label, maximum) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new CheckoutError(`Enter a valid ${label} (up to ${maximum} characters).`);
  return value.trim();
}

function integer(value, label, maximum = MAX_AMOUNT, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new CheckoutError(`Enter a valid ${label}.`);
  return value;
}

function uuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw new CheckoutError(`A valid ${label} is required.`);
  return value.toLowerCase();
}

export function normalizeCheckout(input) {
  object(input, "Sample checkout");
  if (input.outcome !== undefined && input.outcome !== "success") throw new CheckoutError("Only a successful sample outcome can create an invoice.");
  const request_id = uuid(input.request_id, "request ID");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) throw new CheckoutError("Choose between 1 and 100 item lines.");
  const merged = new Map();
  for (const raw of input.items) {
    object(raw, "Item");
    let product_id = text(raw.product_id, "product", 120);
    if (UUID.test(product_id)) product_id = product_id.toLowerCase();
    const size = text(raw.size, "size", 20);
    const quantity = integer(raw.quantity, "quantity from 1 to 99", 99, 1);
    const key = JSON.stringify([product_id, size]);
    const existing = merged.get(key);
    if (existing) existing.quantity = integer(existing.quantity + quantity, "combined quantity from 1 to 99", 99, 1);
    else merged.set(key, { product_id, size, quantity });
  }
  const items = [...merged.values()].sort((a, b) => a.product_id < b.product_id ? -1 : a.product_id > b.product_id ? 1 : a.size < b.size ? -1 : a.size > b.size ? 1 : 0);
  const billing = object(input.customer, "Customer billing details");
  return {
    request_id,
    items,
    customer: {
      name: text(billing.name, "customer name", 120),
      address: text(billing.address, "billing address", 400),
      postcode: text(billing.postcode, "postcode", 20),
      country: text(billing.country, "country", 80),
    },
    expected_total_sen: integer(input.expected_total_sen, "expected total"),
  };
}

export function buildSampleInvoice({ id, requestId, user, customer, lines, products, expectedTotal, createdAt }) {
  const invoiceId = uuid(id, "invoice ID");
  const canonical = normalizeCheckout({ request_id: requestId, items: lines, customer, expected_total_sen: expectedTotal });
  object(user, "Signed-in customer");
  const userId = text(user.id, "customer ID", 120);
  const email = text(user.email, "customer email", 254).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new CheckoutError("A verified customer email is required.", 401, "authentication_required");
  const timestamp = new Date(createdAt);
  if (!Number.isFinite(timestamp.getTime())) throw new CheckoutError("A valid invoice date is required.");
  if (!Array.isArray(products)) throw new CheckoutError("The catalogue could not be loaded.", 503, "catalogue_unavailable");
  const items = canonical.items.map((line) => {
    const product = products.find((entry) => entry.id === line.product_id);
    if (!product || product.published !== true) throw new CheckoutError("An item is no longer available. Review your bag.", 409, "item_unavailable");
    const variant = product.variants?.find((entry) => entry.size === line.size);
    if (!variant || !Number.isSafeInteger(variant.stock) || variant.stock < line.quantity) throw new CheckoutError("A size or quantity is no longer available in stock. Review your bag.", 409, "item_unavailable");
    const unit_price_sen = integer(product.price_sen, "product price");
    const reward_points = integer(product.reward_points ?? 100, "product reward points from 0 to 100,000", 100000);
    return { product_id: line.product_id, name: text(product.name, "product name", 120), size: line.size, quantity: line.quantity, unit_price_sen, reward_points };
  });
  const total = items.reduce((sum, line) => sum + line.unit_price_sen * line.quantity, 0);
  integer(total, "invoice total; the amount is too large");
  const points = items.reduce((sum, line) => sum + line.reward_points * line.quantity, 0);
  integer(points, "sample points total; the amount is too large");
  if (total !== canonical.expected_total_sen) throw new CheckoutError("Prices changed. Review your bag total before completing the sample checkout.", 409, "price_changed");
  return {
    id: invoiceId,
    request_id: canonical.request_id,
    user_id: userId,
    reference: `SAMPLE-${invoiceId.toUpperCase()}`,
    created_at: timestamp.toISOString(),
    status: "sample_completed",
    currency: "MYR",
    customer_name: canonical.customer.name,
    customer_email: email,
    billing_address: canonical.customer.address,
    postcode: canonical.customer.postcode,
    country: canonical.customer.country,
    items,
    subtotal_sen: total,
    shipping_sen: 0,
    total_sen: total,
    item_count: items.reduce((sum, line) => sum + line.quantity, 0),
    points,
    email_status: "pending",
    email_error: "",
    email_provider_id: null,
    email_attempted_at: null,
    email_accepted_at: null,
    request_payload: canonical,
  };
}

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const money = (amount) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(amount / 100);

export function renderInvoiceEmail(order) {
  const subject = `CROWNNETIC SAMPLE INVOICE — ${String(order.reference).replace(/[\r\n]/g, " ")}`;
  const description = "NO PAYMENT COLLECTED · NOT A TAX INVOICE";
  // Older invoices did not snapshot points. Their history remains zero rather
  // than being recalculated from either current products or newer item fields.
  const points = new Intl.NumberFormat("en-MY").format(integer(order.points ?? 0, "sample points total"));
  const notice = "This is a no-charge demonstration. No order will be dispatched. Shipping is illustrative. Sample points are for testing only and have no cash value.";
  const date = new Intl.DateTimeFormat("en-MY", { dateStyle: "long", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(order.created_at));
  const lines = order.items.map((item) => `${item.name} · ${item.size} · ${item.quantity} × ${money(item.unit_price_sen)} = ${money(item.quantity * item.unit_price_sen)}`);
  const text = ["CROWNNETIC", "SAMPLE INVOICE", description, "", `Reference: ${order.reference}`, `Date: ${date}`, `Customer: ${order.customer_name}`, `Email: ${order.customer_email}`, `Billing address: ${order.billing_address}`, `${order.postcode}, ${order.country}`, "", ...lines, "", `Subtotal: ${money(order.subtotal_sen)}`, `Illustrative shipping: ${money(order.shipping_sen)}`, `Sample total: ${money(order.total_sen)} MYR`, `SAMPLE POINTS EARNED: ${points}`, "", notice].join("\n");
  const rows = order.items.map((item) => `<tr><td style="padding:16px 0;border-bottom:1px solid #deded8"><strong>${escape(item.name)}</strong><br><span style="color:#61645e;font-size:12px">Size ${escape(item.size)} · ${escape(item.quantity)} × ${escape(money(item.unit_price_sen))}</span></td><td style="padding:16px 0;border-bottom:1px solid #deded8;text-align:right;white-space:nowrap">${escape(money(item.quantity * item.unit_price_sen))}</td></tr>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#ededE8;color:#171a16;font-family:Arial,Helvetica,sans-serif"><div style="max-width:640px;margin:0 auto;padding:36px 22px"><div style="background:#101310;color:#f2f2e9;padding:30px 25px;border-radius:14px 14px 0 0"><p style="letter-spacing:5px;font-size:18px;margin:0 0 28px">CROWNNETIC</p><h1 style="font-size:30px;letter-spacing:-1px;margin:0">SAMPLE INVOICE</h1><p style="font-size:10px;letter-spacing:1px;margin:14px 0 0;color:#d4d8ca">${description}</p></div><div style="padding:27px 25px;background:#fafaf6;border:1px solid #d8dcd2;border-radius:0 0 14px 14px"><p style="font-size:12px;line-height:1.8;overflow-wrap:anywhere"><strong>Reference</strong><br>${escape(order.reference)}<br><strong>Date</strong> ${escape(date)}</p><p style="font-size:13px;line-height:1.8"><strong>${escape(order.customer_name)}</strong><br>${escape(order.customer_email)}<br>${escape(order.billing_address).replaceAll("\n", "<br>")}<br>${escape(order.postcode)}, ${escape(order.country)}</p><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th scope="col" style="text-align:left;padding:20px 0 8px;font-size:10px;letter-spacing:1px">THE PIECES</th><th scope="col" style="text-align:right;padding:20px 0 8px;font-size:10px;letter-spacing:1px">AMOUNT</th></tr></thead><tbody>${rows}</tbody></table><table style="width:100%;margin-top:20px;font-size:12px"><tr><td style="padding:6px 0">Subtotal</td><td style="text-align:right">${escape(money(order.subtotal_sen))}</td></tr><tr><td style="padding:6px 0">Illustrative shipping</td><td style="text-align:right">${escape(money(order.shipping_sen))}</td></tr><tr><td style="padding:15px 0;font-size:16px"><strong>Sample total</strong></td><td style="text-align:right;font-size:16px"><strong>${escape(money(order.total_sen))} MYR</strong></td></tr><tr><td style="padding:12px 0;border-top:1px solid #deded8;font-size:10px;letter-spacing:1px"><strong>SAMPLE POINTS EARNED</strong></td><td style="text-align:right;padding:12px 0;border-top:1px solid #deded8"><strong>${escape(points)}</strong></td></tr></table><p style="margin-top:25px;font-size:12px;line-height:1.8;color:#61645e">${escape(notice)}</p></div></div></body></html>`;
  return { subject, html, text };
}
