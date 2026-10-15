import { test, expect } from "@playwright/test";
test("admin publishing flows through shop, bag, persistence and sample checkout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin");
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Studio Test Tee");
  await page.getByLabel("Price (MYR)").fill("199.90");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A test product published through the real admin editor.");
  await page.getByLabel("M", { exact: true }).fill("5");
  await page.getByLabel("PUBLISHED — VISIBLE IN SHOP").check();
  await page.getByRole("button", { name: "CREATE PRODUCT" }).click();
  await expect(
    page.getByRole("heading", { name: "Studio Test Tee" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "SHOP ALL", exact: true }).click();
  await page.getByRole("link").filter({ hasText: "Studio Test Tee" }).click();
  await page.getByRole("button", { name: "ADD TO BAG" }).click();
  await expect(page.locator("#product-error")).toContainText(
    "Choose an available size",
  );
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "ADD TO BAG" }).click();
  await page.getByRole("link", { name: "BAG (1)" }).click();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(page.getByRole("link", { name: "BAG (2)" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "BAG (2)" })).toBeVisible();
  await expect(page.locator(".summary-total")).toContainText("399.80");
  await page.getByRole("button", { name: "SAMPLE CHECKOUT" }).click();
  await page.getByRole("button", { name: "COMPLETE SAMPLE ORDER" }).click();
  await expect(page.getByText("SIMULATION COMPLETE")).toBeVisible();
  await expect(page.getByRole("link", { name: "BAG (0)" })).toBeVisible();
  expect(errors).toEqual([]);
});
test("draft stays hidden and edits persist", async ({ page }) => {
  await page.goto("/admin");
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Unreleased Draft");
  await page.getByLabel("Price (MYR)").fill("200");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A draft that must stay private.");
  await page.getByRole("button", { name: "CREATE PRODUCT" }).click();
  await expect(
    page.getByRole("heading", { name: "Unreleased Draft" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Unreleased Draft" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "SHOP ALL", exact: true }).click();
  await expect(page.getByText("Unreleased Draft")).toHaveCount(0);
});
test("responsive homepage has working imagery and navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "BUILT TO STAND APART." }),
  ).toBeVisible();
  await page.locator(".hero-photo img").evaluate((img) => img.decode());
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "SHOP THE COLLECTION", exact: true })
    .click();
  await page.getByRole("button", { name: "Accessories", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.getByText("Signature Cap", { exact: true })).toBeVisible();
});
test("corrupt storage recovers without breaking the storefront", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("crownetic.catalog.v1", "broken");
    localStorage.setItem("crownetic.bag.v1", "broken");
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "BUILT TO STAND APART." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "BAG (0)" })).toBeVisible();
});

test("malformed saved bag entries do not crash the site", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "crownetic.bag.v1",
      JSON.stringify({
        version: 1,
        data: [null, {}, false, { productId: "tee", size: "M", quantity: 1.5 }],
      }),
    ),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "BUILT TO STAND APART." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "BAG (0)" })).toBeVisible();
});
