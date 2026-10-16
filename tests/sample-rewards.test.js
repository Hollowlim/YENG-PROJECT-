import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeSampleRewards } from "../checkout/rewards.js";

test("sample rewards use the saved invoice award for two default-point items", () => {
  const summary = summarizeSampleRewards([{ id: "sample-1", points: 200, items: [{ quantity: 2, reward_points: 100 }] }]);
  assert.equal(summary.points, 200);
  assert.equal(summary.invoiceCount, 1);
  assert.equal(summary.tier.name, "Member");
  assert.equal(summary.tier.progress, 20);
});

test("sample rewards preserve product overrides from the invoice total", () => {
  const orders = [{ id: "sample-1", points: 700, items: [{ quantity: 2, reward_points: 250 }, { quantity: 2, reward_points: 100 }] }];
  assert.equal(summarizeSampleRewards(orders).points, 700);
  orders[0].items[0].reward_points = 999;
  assert.equal(summarizeSampleRewards(orders).points, 700);
});

test("sample tiers use the existing Member Bronze Gold and Platinum boundaries", () => {
  for (const [points, name, progress] of [[0, "Member", 0], [999, "Member", 99.9], [1000, "Bronze", 0], [4999, "Bronze", 99.975], [5000, "Gold", 0], [9999, "Gold", 99.98], [10000, "Platinum", 100]]) {
    const summary = summarizeSampleRewards([{ id: "sample", points }]);
    assert.equal(summary.tier.name, name, `Tier at ${points} points`);
    assert.ok(Math.abs(summary.tier.progress - progress) < 0.000001);
  }
});

test("duplicate invoice IDs contribute their saved award only once", () => {
  const invoice = { id: "sample-1", points: 200 };
  const summary = summarizeSampleRewards([invoice, { ...invoice }, { id: "sample-2", points: 300 }]);
  assert.equal(summary.points, 500);
  assert.equal(summary.invoiceCount, 2);
});

test("zero-point and legacy invoices do not invent awards from their items", () => {
  const summary = summarizeSampleRewards([{ id: "zero", points: 0 }, { id: "legacy", items: [{ quantity: 10, reward_points: 100 }] }]);
  assert.equal(summary.points, 0);
  assert.equal(summary.invoiceCount, 2);
  assert.equal(summary.tier.name, "Member");
  assert.deepEqual(summarizeSampleRewards().points, 0);
});

test("email acceptance failure or recipient restrictions do not change sample rewards", () => {
  const orders = ["accepted", "failed", "restricted", "not_configured", "sending", "preview_only"].map((email_status, i) => ({ id: `sample-${i}`, points: 200, email_status }));
  const original = structuredClone(orders);
  const summary = summarizeSampleRewards(orders);
  assert.equal(summary.points, 1200);
  assert.equal(summary.tier.name, "Bronze");
  assert.deepEqual(orders, original);
});

test("malformed or negative awards cannot distort sample membership totals", () => {
  const orders = [null, {}, { points: 1000 }, { id: "negative", points: -500 }, { id: "fraction", points: 1.5 }, { id: "string", points: "1000" }, { id: "infinite", points: Infinity }, { id: "valid", points: 100 }];
  assert.equal(summarizeSampleRewards(orders).points, 100);
});
