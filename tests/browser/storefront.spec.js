import { test, expect } from "@playwright/test";
test("admin publishing flows through shop, bag, persistence and sample checkout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/admin");
  await page.getByLabel("Username", { exact: true }).fill("admin@123");
  await page.getByLabel("Password", { exact: true }).fill("admin@123");
  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();
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
  await page.goto("/#/admin");
  await page.getByLabel("Username", { exact: true }).fill("admin@123");
  await page.getByLabel("Password", { exact: true }).fill("admin@123");
  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();
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
  await page.locator(".scroll-expand__media").evaluate((img) => img.decode());
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

test("standalone HTML has styled storefront and functional admin login", async ({
  page,
}) => {
  await page.goto("/index.html");
  await expect(
    page.getByRole("heading", { name: "BUILT TO STAND APART." }),
  ).toBeVisible();
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe("rgba(0, 0, 0, 0)");
  await page.getByRole("link", { name: "Studio / Admin" }).click();
  await expect(
    page.getByRole("heading", { name: "ADMIN SIGN IN." }),
  ).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill("admin@123");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();
  await expect(page.locator("#login-error")).toContainText("Incorrect");
  await page.getByLabel("Password", { exact: true }).fill("admin@123");
  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "THE PRODUCT ROOM." }),
  ).toBeVisible();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Direct File Tee");
  await page.getByLabel("Price (MYR)").fill("99");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A sample created from the downloaded website.");
  await page.getByLabel("M", { exact: true }).fill("4");
  await page.getByLabel("PUBLISHED — VISIBLE IN SHOP").check();
  await page.getByRole("button", { name: "CREATE PRODUCT" }).click();
  await expect(
    page.getByRole("heading", { name: "Direct File Tee" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "SHOP ALL", exact: true }).click();
  await expect(
    page.getByText("Direct File Tee", { exact: true }),
  ).toBeVisible();
});

test("sample admin sign-out closes access on refresh", async ({ page }) => {
  await page.goto("/#/admin");
  await page.getByLabel("Username", { exact: true }).fill("admin@123");
  await page.getByLabel("Password", { exact: true }).fill("admin@123");
  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "THE PRODUCT ROOM." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "SIGN OUT", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "ADMIN SIGN IN." }),
  ).toBeVisible();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveCount(0);
});

test("homepage product cards reflect pointer movement and retain shopping links", async ({
  page,
}) => {
  await page.goto("/");
  const cards = page.locator(".home-products .reflective-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.first().locator("canvas")).toBeVisible();
  await expect(cards.first().locator("img")).toBeVisible();
  await cards.first().scrollIntoViewIfNeeded();
  const box = await cards.first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2);
  await expect
    .poll(() =>
      cards
        .first()
        .evaluate((el) =>
          Math.abs(parseFloat(el.style.getPropertyValue("--rc-rotate-y"))),
        ),
    )
    .toBeGreaterThan(0.2);
  expect(
    await cards
      .first()
      .locator("video")
      .last()
      .evaluate((el) => el.srcObject),
  ).toBeNull();
  await page.screenshot({
    path: "test-results/reflective-home.png",
    fullPage: true,
  });
  await cards.first().click();
  await expect(
    page.getByRole("heading", { name: "Core Heavyweight Tee", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "SHOP ALL", exact: true }).click();
  await expect(page.locator(".reflective-card")).toHaveCount(0);
});

test("reflective products respect reduced motion without requesting camera access", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.cameraRequests = 0;
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = () => {
        window.cameraRequests++;
        return Promise.reject(new Error("Unexpected camera request"));
      };
  });
  await page.goto("/");
  const card = page.locator(".home-products .reflective-card").first();
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await card.hover({ position: { x: 30, y: 30 } });
  await expect
    .poll(() =>
      card.evaluate((el) =>
        parseFloat(el.style.getPropertyValue("--rc-rotate-y")),
      ),
    )
    .toBe(0);
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
  const video = card.locator("video").first();
  await expect(video).toHaveAttribute("src", "./public/videos/reflection.mp4");
  await expect
    .poll(() => video.evaluate((el) => el.readyState))
    .toBeGreaterThanOrEqual(2);
});

test("dark rounded homepage campaign expands on page scroll", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".scroll-expand")).toHaveCount(1);
  const frame = page.locator(".scroll-expand__frame");
  const before = await frame.evaluate((el) => getComputedStyle(el).clipPath);
  const stage = await page.locator(".scroll-expand__track").boundingBox();
  await page.evaluate(
    (y) => window.scrollTo(0, y),
    stage.y + (page.viewportSize()?.height || 720) * 1.25,
  );
  await expect
    .poll(() => frame.evaluate((el) => getComputedStyle(el).clipPath))
    .not.toBe(before);
  await expect
    .poll(() =>
      page
        .locator(".scroll-expand__overlay")
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBeGreaterThan(0.9);
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(11, 11, 11)");
  await expect(
    page.getByRole("link", { name: "EXPLORE THE DROP", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dark-expanded-home.png",
    fullPage: false,
  });
});
