import { test } from "node:test";
import assert from "node:assert/strict";
import * as customer from "../customer/model.js";
test("negative balances stay Member with finite progress toward Bronze", () => {
  const tier = customer.loyaltyTier(-250);
  assert.equal(tier.name, "Member");
  assert.equal(tier.next.name, "Bronze");
  assert.equal(tier.progress, 0);
});
test("tiers switch at the exact requested thresholds", () => {
  for (const [points, tier] of [
    [0, "Member"],
    [999, "Member"],
    [1000, "Bronze"],
    [4999, "Bronze"],
    [5000, "Gold"],
    [9999, "Gold"],
    [10000, "Platinum"],
  ])
    assert.equal(customer.loyaltyTier(points).name, tier);
  assert.equal(customer.loyaltyTier(10000).progress, 100);
});
test("purchase points depend on quantity and item points rather than price", () => {
  const products = [
    { id: "tee", reward_points: 100, price_sen: 18900 },
    { id: "cap", reward_points: 50, price_sen: 8900 },
  ];
  assert.equal(
    customer.itemPoints(
      [
        { productId: "tee", quantity: 2 },
        { productId: "cap", quantity: 1 },
      ],
      products,
    ),
    250,
  );
  assert.equal(
    customer.itemPoints(
      [{ productId: "tee", quantity: 2 }],
      [{ ...products[0], price_sen: 1 }],
    ),
    200,
  );
});
test("password hashes are salted and incorrect passwords fail", async () => {
  const record = await customer.hashPassword("SamplePassword123");
  assert.notEqual(record.hash, "SamplePassword123");
  assert.equal(
    await customer.verifyPassword("SamplePassword123", record),
    true,
  );
  assert.equal(await customer.verifyPassword("WrongPassword", record), false);
  assert.notEqual(
    (await customer.hashPassword("SamplePassword123")).salt,
    record.salt,
  );
});
