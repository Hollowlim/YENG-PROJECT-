import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCheckout, buildSampleInvoice, renderInvoiceEmail } from "../checkout/invoice.js";

const requestId = "00000000-0000-4000-8000-000000000001";
const invoiceId = "00000000-0000-4000-8000-000000000002";
const customer = { name: "Sample Customer", address: "123 Example Street", postcode: "SW1A 1AA", country: "United Kingdom" };
const products = [{ id: "tee", name: "Heavyweight Tee", published: true, price_sen: 18900, variants: [{ size: "M", stock: 5 }, { size: "L", stock: 2 }] }, { id: "cap", name: "Cap", published: true, price_sen: 8900, variants: [{ size: "ONE SIZE", stock: 2 }] }];
const input = (extra = {}) => ({ request_id: requestId, items: [{ product_id: "tee", size: "M", quantity: 2 }], customer, expected_total_sen: 37800, ...extra });
const invoice = (extra = {}) => buildSampleInvoice({ id: invoiceId, requestId, user: { id: "verified-user", email: "owner@example.com" }, customer, lines: input().items, products, expectedTotal: 37800, createdAt: "2026-10-16T01:02:03.000Z", ...extra });

test("checkout canonicalization merges duplicate sizes, sorts lines and strips caller-controlled identity and prices", () => {
  const result = normalizeCheckout(input({ outcome: "success", user_id: "attacker", email: "other@example.com", items: [{ product_id: "tee", size: "M", quantity: 1, unit_price_sen: 1 }, { product_id: "cap", size: "ONE SIZE", quantity: 1 }, { product_id: "tee", size: "M", quantity: 1 }], customer: { ...customer, name: "  Sample Customer  ", email: "wrong@example.com" } }));
  assert.deepEqual(result, { request_id: requestId, items: [{ product_id: "cap", size: "ONE SIZE", quantity: 1 }, { product_id: "tee", size: "M", quantity: 2 }], customer, expected_total_sen: 37800 });
});

test("checkout rejects failed or cancelled sample outcomes", () => {
  for (const outcome of ["failed", "cancelled", null, false]) assert.throws(() => normalizeCheckout(input({ outcome })), /successful|success/i);
});

test("checkout validates UUID, bounded quantities, item count and integer money", () => {
  for (const invalid of [input({ request_id: "not-a-uuid" }), input({ items: [] }), input({ items: Array.from({ length: 101 }, () => input().items[0]) }), input({ expected_total_sen: -1 }), input({ expected_total_sen: 1.5 }), input({ expected_total_sen: 2147483648 })]) assert.throws(() => normalizeCheckout(invalid));
  for (const quantity of [0, -1, 100, 1.2, "2", NaN, Infinity]) assert.throws(() => normalizeCheckout(input({ items: [{ product_id: "tee", size: "M", quantity }] })));
  assert.throws(() => normalizeCheckout(input({ items: [{ product_id: "tee", size: "M", quantity: 99 }, { product_id: "tee", size: "M", quantity: 1 }] })), /quantity/i);
});

test("checkout requires bounded billing fields without Malaysia-only postcode assumptions", () => {
  assert.equal(normalizeCheckout(input()).customer.postcode, "SW1A 1AA");
  for (const [key, max] of [["name", 120], ["address", 400], ["postcode", 20], ["country", 80]]) {
    assert.throws(() => normalizeCheckout(input({ customer: { ...customer, [key]: "" } })));
    assert.throws(() => normalizeCheckout(input({ customer: { ...customer, [key]: "x".repeat(max + 1) } })));
  }
  assert.throws(() => normalizeCheckout(input({ items: [{ product_id: "tee", size: "x".repeat(21), quantity: 1 }] })));
});

test("sample invoice freezes authoritative catalogue prices and verified email without stock or points mutations", () => {
  const catalogue = structuredClone(products);
  const before = JSON.stringify(catalogue);
  const order = invoice({ products: catalogue });
  assert.equal(order.reference, `SAMPLE-${invoiceId.toUpperCase()}`);
  assert.equal(order.status, "sample_completed");
  assert.equal(order.customer_email, "owner@example.com");
  assert.equal(order.customer_name, customer.name);
  assert.equal(order.user_id, "verified-user");
  assert.equal(order.currency, "MYR");
  assert.equal(order.shipping_sen, 0);
  assert.equal(order.subtotal_sen, 37800);
  assert.equal(order.total_sen, 37800);
  assert.equal(order.item_count, 2);
  assert.equal(order.email_status, "pending");
  assert.equal(order.email_provider_id, null);
  assert.equal(order.email_attempted_at, null);
  assert.equal(order.email_accepted_at, null);
  assert.deepEqual(order.request_payload, normalizeCheckout(input()));
  assert.deepEqual(order.items, [{ product_id: "tee", name: "Heavyweight Tee", size: "M", quantity: 2, unit_price_sen: 18900 }]);
  assert.equal(JSON.stringify(catalogue), before);
  catalogue[0].price_sen = 1;
  catalogue[0].name = "Changed later";
  customer.address = "Temporary changed address";
  try {
    assert.equal(order.items[0].unit_price_sen, 18900);
    assert.equal(order.items[0].name, "Heavyweight Tee");
    assert.equal(order.billing_address, "123 Example Street");
    assert.equal(order.request_payload.customer.address, "123 Example Street");
  } finally { customer.address = "123 Example Street"; }
  assert.equal("points" in order, false);
});

test("invoice refuses unpublished, missing and unavailable catalogue sizes using aggregate quantities", () => {
  assert.throws(() => invoice({ products: [] }), /available|product/i);
  assert.throws(() => invoice({ products: [{ ...products[0], published: false }] }), /available|published/i);
  assert.throws(() => invoice({ lines: [{ product_id: "tee", size: "XS", quantity: 1 }] }), /size|available/i);
  assert.throws(() => invoice({ lines: [{ product_id: "tee", size: "L", quantity: 2 }, { product_id: "tee", size: "L", quantity: 1 }] }), /stock|available/i);
});

test("price changes require review and cannot create a stale or attacker-priced invoice", () => {
  assert.throws(() => invoice({ expectedTotal: 1 }), (error) => error.status === 409 && /price|total/i.test(error.message));
  assert.throws(() => invoice({ products: [{ ...products[0], price_sen: 2147483647 }], expectedTotal: 2147483647 }), /total|large|amount/i);
  assert.throws(() => invoice({ products: [{ ...products[0], price_sen: -1 }] }), /price|amount/i);
});

test("invoice email escapes customer/product/reference data and clearly disclaims payment and tax status", () => {
  const order = invoice({ customer: { ...customer, name: '<img src=x onerror="alert(1)">', address: "A & B <road>" }, products: [{ ...products[0], name: "<script>alert(1)</script>" }] });
  const email = renderInvoiceEmail(order);
  assert.match(email.subject, /SAMPLE.*INVOICE/i);
  assert.match(email.html, /SAMPLE INVOICE/);
  assert.match(email.html, /NO PAYMENT COLLECTED/);
  assert.match(email.html, /NOT A TAX INVOICE/);
  assert.match(email.text, /NO PAYMENT COLLECTED/);
  assert.match(email.text, /NOT A TAX INVOICE/);
  assert.ok(email.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(!email.html.includes("<script>"));
  assert.ok(!email.html.includes('<img src=x onerror="alert(1)">'));
  assert.match(email.html, /378\.00/);
  assert.match(email.text, /378\.00/);
  assert.ok(!email.html.includes("payment successful"));
});
