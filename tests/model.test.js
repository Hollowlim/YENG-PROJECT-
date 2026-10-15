import { test } from "node:test";
import assert from "node:assert/strict";
import * as model from "../model.js";
test("parses MYR into exact sen and rejects invalid precision", () => {
  assert.equal(model.priceSen("189.90"), 18990);
  for (const value of ["-1", "1.001", "hello", "Infinity"])
    assert.throws(() => model.priceSen(value));
});
test("validates product price image and stock", () => {
  const p = {
    name: "Core Tee",
    category: "Tees",
    description: "Heavyweight",
    price_sen: 18900,
    image_url: "/assets/tee.jpg",
    published: true,
    variants: [{ size: "M", stock: 4 }],
  };
  assert.doesNotThrow(() => model.validateProduct(p));
  for (const change of [
    { price_sen: -1 },
    { image_url: "javascript:alert(1)" },
    { variants: [{ size: "M", stock: 1.5 }] },
  ])
    assert.throws(() => model.validateProduct({ ...p, ...change }));
});
test("bag merges matching sizes and enforces stock", () => {
  const p = {
    id: "tee",
    published: true,
    price_sen: 18900,
    variants: [{ size: "M", stock: 2 }],
  };
  let bag = model.addToBag([], p, "M", 1);
  bag = model.addToBag(bag, p, "M", 1);
  assert.equal(bag[0].quantity, 2);
  assert.equal(model.subtotal(bag, [p]), 37800);
  assert.throws(() => model.addToBag(bag, p, "M", 1));
  assert.throws(() => model.addToBag([], p, "", 1));
});
test("checkout rejects hidden deleted and depleted products", () => {
  const bag = [{ productId: "tee", size: "M", quantity: 2 }];
  const p = { id: "tee", published: true, variants: [{ size: "M", stock: 2 }] };
  assert.deepEqual(model.bagErrors(bag, [p]), []);
  assert.ok(model.bagErrors(bag, []).length);
  assert.ok(model.bagErrors(bag, [{ ...p, published: false }]).length);
  assert.ok(
    model.bagErrors(bag, [{ ...p, variants: [{ size: "M", stock: 1 }] }])
      .length,
  );
  assert.ok(model.bagErrors([], []).length);
});
test("corrupt persistence recovers and drafts stay private", () => {
  assert.deepEqual(model.restore("bad", []), []);
  assert.deepEqual(model.restore('{"version":1,"data":"bad"}', []), []);
  assert.equal(
    model.visibleProducts([{ published: true }, { published: false }]).length,
    1,
  );
});

test("checkout aggregates duplicate product-size lines against stock", () => {
  const p = { id: "tee", published: true, variants: [{ size: "M", stock: 2 }] };
  const bag = [
    { productId: "tee", size: "M", quantity: 2 },
    { productId: "tee", size: "M", quantity: 2 },
  ];
  assert.ok(model.bagErrors(bag, [p]).length);
});
test("rejects malformed HTTPS image URLs", () => {
  assert.equal(model.safeImage("https://"), false);
  assert.equal(model.safeImage("https:// valid.invalid"), false);
  assert.equal(model.safeImage("https://example.com/tee.jpg"), true);
});
