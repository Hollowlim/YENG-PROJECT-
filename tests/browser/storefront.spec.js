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
  await expect(page.locator("#page-loader")).toBeHidden();
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
  await expect(page.locator("#page-loader")).toBeHidden();
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
  await expect(page.locator("#page-loader")).toBeHidden();
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
  await expect(page.getByRole("link", { name: "Studio / Admin" })).toHaveCount(0);
  await page.getByRole("link", { name: "My account", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "WELCOME BACK." }),
  ).toBeVisible();
  await page.getByLabel("Email address or username", { exact: true }).fill("admin@123");
  await page.getByLabel("Password", { exact: true }).fill("wrongpass");
  await page.getByRole("button", { name: "LOG IN" }).click();
  await expect(page.locator(".customer-error")).toContainText("Incorrect");
  await page.getByLabel("Password", { exact: true }).fill("admin@123");
  await page.getByRole("button", { name: "LOG IN" }).click();
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
  await expect(page.locator("#page-loader")).toBeHidden();
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
  await expect(page.locator(".reflective-card")).toHaveCount(3);
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
  await expect(page.locator("#page-loader")).toBeHidden();
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
  await expect(page.locator("#page-loader")).toBeHidden();
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

test("shirt opens a front left right viewer with keyboard and swipe controls", async ({
  page,
}) => {
  await page.goto("/#/product/core-heavyweight-tee");
  const viewer = page.getByRole("region", { name: "Product angle viewer" });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator(".viewer-index")).toHaveText("FRONT VIEW");
  await viewer
    .getByRole("button", { name: "Previous angle", exact: true })
    .click();
  await expect(viewer.locator(".angle-image")).toHaveAttribute(
    "alt",
    "Core Heavyweight Tee — left view",
  );
  await viewer.focus();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.locator(".viewer-index")).toHaveText("FRONT VIEW");
  await viewer.getByRole("button", { name: "Next angle", exact: true }).click();
  await expect(viewer.locator(".angle-image")).toHaveAttribute(
    "alt",
    "Core Heavyweight Tee — right view",
  );
  await page.screenshot({
    path: "test-results/shirt-angle-viewer.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await viewer.scrollIntoViewIfNeeded();
  await viewer.locator(".viewer-stage").dispatchEvent("pointerdown", {
    clientX: 200,
    clientY: 100,
    pointerType: "touch",
  });
  await viewer.locator(".viewer-stage").dispatchEvent("pointerup", {
    clientX: 280,
    clientY: 100,
    pointerType: "touch",
  });
  await expect(viewer.locator(".viewer-index")).toHaveText("FRONT VIEW");
});

test("admin can publish uploaded angle photos and the product viewer uses them", async ({
  page,
}) => {
  await page.goto("/#/admin");
  await page.getByLabel("Username", { exact: true }).fill("admin@123");
  await page.getByLabel("Password", { exact: true }).fill("admin@123");
  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Angle Upload Tee");
  await page.getByLabel("Price (MYR)").fill("189");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A product with uploaded angle photos.");
  await page.getByLabel("Upload left angle", { exact: true }).setInputFiles({
    name: "left.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page
    .getByLabel("right angle image URL (optional)", { exact: true })
    .fill("./public/assets/tee.png");
  await page.getByLabel("M", { exact: true }).fill("3");
  await page.getByLabel("PUBLISHED — VISIBLE IN SHOP").check();
  await page.getByRole("button", { name: "CREATE PRODUCT" }).click();
  await expect(
    page.getByRole("heading", { name: "Angle Upload Tee" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "SHOP ALL", exact: true }).click();
  await page.getByRole("link").filter({ hasText: "Angle Upload Tee" }).click();
  await page
    .getByRole("button", { name: "Previous angle", exact: true })
    .click();
  await expect(page.locator(".angle-image")).toHaveAttribute(
    "src",
    /^data:image\/png;base64,/,
  );
  await page.reload();
  await page.getByRole("button", { name: "Next angle", exact: true }).click();
  await expect(page.locator(".angle-image")).toHaveAttribute(
    "src",
    "./public/assets/tee.png",
  );
});

test("all sample products have three angles and reflective detail views", async ({
  page,
}) => {
  for (const id of ["core-heavyweight-tee", "archive-cargo", "signature-cap"]) {
    await page.goto("/#/product/" + id);
    const viewer = page.getByRole("region", { name: "Product angle viewer" });
    await expect(viewer.locator(".reflective-card")).toHaveCount(1);
    await expect(viewer.locator("canvas")).toBeVisible();
    await expect(page.locator("#page-loader")).toBeHidden();
    await expect(viewer.locator(".viewer-controls")).toHaveCount(0);
    for (const angle of ["RIGHT VIEW", "LEFT VIEW", "FRONT VIEW"]) {
      await viewer
        .getByRole("button", { name: "Next angle", exact: true })
        .click();
      await expect(viewer.locator(".viewer-index")).toHaveText(angle);
    }
  }
  await page.goto("/#/shop");
  await expect(page.locator(".product-image .reflective-card")).toHaveCount(3);
});

test("page navigation shows metallic monogram and product angle button row is removed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#page-loader")).toBeHidden();
  await expect(page.locator("#page-loader")).toBeHidden();
  await page.evaluate(() => {
    window.loaderSeen = false;
    window.electricSeen = false;
    const observer = new MutationObserver(() => {
      const loader = document.querySelector("#page-loader");
      if (loader) {
        window.loaderSeen = true;
        if (loader.querySelector(".metallic-paint canvas"))
          window.electricSeen = true;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole("link", { name: "SHOP ALL", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.loaderSeen)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.electricSeen)).toBe(true);
  await expect(page.locator("#page-loader")).toBeHidden();
  await page
    .getByRole("link")
    .filter({ hasText: "Core Heavyweight Tee" })
    .click();
  await expect(page.locator("#page-loader")).toBeHidden();
  await expect(page.locator(".viewer-controls")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Front view", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Next angle" }).click();
  await expect(page.locator(".viewer-index")).toHaveText("RIGHT VIEW");
});

test("customer signup profile per-item demo points and account isolation", async ({
  page,
}) => {
  test.setTimeout(60_000); // This journey crosses multiple animated page transitions.
  await page.goto("/#/signup");
  await page.getByLabel("Full name", { exact: true }).fill("Sample Member");
  await page
    .getByLabel(/^Email address/ )
    .fill("member@example.com");
  await page.getByLabel("Password", { exact: true }).fill("SamplePassword123");
  await page
    .getByRole("button", { name: "CREATE ACCOUNT", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "YOUR INNER CIRCLE." }),
  ).toBeVisible();
  await expect(page.locator(".points-number")).toHaveText("0");
  await page
    .getByRole("link", { name: "Profile settings", exact: true })
    .click();
  await page.getByLabel("Full name", { exact: true }).fill("Updated Member");
  await page.getByRole("button", { name: "SAVE PROFILE", exact: true }).click();
  await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
  await page.goto("/#/product/core-heavyweight-tee");
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByLabel("QUANTITY", { exact: true }).fill("10");
  await page.getByRole("button", { name: "ADD TO BAG" }).click();
  await page.getByRole("link", { name: "BAG (10)" }).click();
  await page.getByRole("button", { name: "SAMPLE CHECKOUT" }).click();
  await page.getByRole("button", { name: "COMPLETE SAMPLE ORDER" }).click();
  await page
    .getByRole("link", { name: "View your dashboard", exact: true })
    .click();
  await expect(page.locator(".points-number")).toHaveText("1,000");
  await expect(page.locator(".tier-badge")).toHaveText("Bronze");
  await expect(
    page.getByText("Updated Member.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/customer-dashboard.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "SIGN OUT", exact: true }).click();
  await page
    .getByLabel(/^Email address/ )
    .fill("member@example.com");
  await page.getByLabel("Password", { exact: true }).fill("WrongPassword");
  await page.getByRole("button", { name: "LOG IN", exact: true }).click();
  await expect(page.locator(".customer-error")).toContainText("incorrect");
  await page.getByLabel("Password", { exact: true }).fill("SamplePassword123");
  await page.getByRole("button", { name: "LOG IN", exact: true }).click();
  await expect(page.locator(".points-number")).toHaveText("1,000");
  await page.getByRole("button", { name: "SIGN OUT", exact: true }).click();
  await page.goto("/#/signup");
  await page.getByLabel("Full name", { exact: true }).fill("Another Member");
  await page
    .getByLabel(/^Email address/ )
    .fill("another@example.com");
  await page.getByLabel("Password", { exact: true }).fill("SamplePassword123");
  await page
    .getByRole("button", { name: "CREATE ACCOUNT", exact: true })
    .click();
  await expect(page.locator(".points-number")).toHaveText("0");
});
test("customer language changes persist and account layout fits mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/signup");
  await page.getByLabel("Language", { exact: true }).selectOption("ms");
  await expect(
    page.getByRole("heading", { name: "SERTAI KOMUNITI KAMI." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "SERTAI KOMUNITI KAMI." }),
  ).toBeVisible();
  await page.getByLabel("Language", { exact: true }).selectOption("zh");
  await expect(
    page.getByRole("heading", { name: "加入品牌圈。" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Language", { exact: true }).selectOption("ta");
  await expect(
    page.getByRole("heading", { name: "எங்கள் வட்டத்தில் இணையுங்கள்." }),
  ).toBeVisible();
  await page.getByLabel("Language", { exact: true }).selectOption("en");
});

test("metallic header follows page navigation and keeps the home link accessible", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/index.html");
  await expect(page.locator("#page-loader")).toBeHidden();
  const logo = page.locator(".wordmark.brand-logo");
  await expect(logo).toHaveAccessibleName("CROWNETIC");
  await expect(logo.locator("canvas")).toBeVisible();
  await page.waitForTimeout(1000);
  await logo.screenshot({ path: "test-results/metallic-header.png" });
  for (const route of ["/shop", "/account", "/bag", "/about", "/admin"]) {
    await page.goto(`/index.html#${route}`);
    await expect(page.locator("#page-loader")).toBeHidden();
    await expect(logo.locator("canvas")).toBeVisible();
    await expect(logo.locator("img")).toBeVisible();
  }
  await logo.click();
  await expect(page.getByRole("heading", { name: "BUILT TO STAND APART." })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(logo.locator("img")).toBeVisible();
  await expect(logo.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});
