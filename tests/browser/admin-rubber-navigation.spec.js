import { test, expect } from './fixtures.js';

const group = page => page.getByRole('radiogroup', { name: 'Admin sections' });
const radio = (page, name) => group(page).getByRole('radio', { name, exact: true });
const thumb = page => group(page).locator('.rubber-segment__thumb');
async function login(page, motion = 'reduce') {
  if (motion === 'no-preference') {
    // Keep this navigation test independent of the header/loader's software GPU cost.
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) return null;
        return getContext.call(this, type, ...args);
      };
    });
  }
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto('/index.html#/login');
  await page.getByLabel('Email address or username', { exact: true }).fill('admin@123');
  await page.getByLabel('Password', { exact: true }).fill('admin@123');
  await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
  await expect(radio(page, 'Product Room')).toBeChecked();
  await expect(page.locator('#page-loader')).toBeHidden();
  await expect(thumb(page)).toBeVisible();
}
async function startSampling(page, duration = 1000, onPointerRelease = false) {
  await thumb(page).evaluate((el, { duration, onPointerRelease }) => {
    window.rubberSamples = new Promise(resolve => {
      const sample = () => {
        const samples = [], start = performance.now();
        const frame = now => {
          const clip = getComputedStyle(el).clipPath;
          const values = clip.match(/-?\d*\.?\d+/g)?.map(Number) || [];
          samples.push({ clip, width: el.getBoundingClientRect().width - values[1] - values[3] });
          if (now - start < duration) requestAnimationFrame(frame);
          else resolve(samples);
        };
        // Capture the old position before React's pointerup handler starts travel.
        if (onPointerRelease) frame(start);
        else requestAnimationFrame(frame);
      };
      if (onPointerRelease) el.parentElement.addEventListener('pointerup', sample, { capture: true, once: true });
      else sample();
    });
  }, { duration, onPointerRelease });
}

test('normal motion visibly stretches and settles the preserved navigation thumb', async ({ page }) => {
  await login(page, 'no-preference');
  await group(page).evaluate(el => { window.originalAdminNavigation = el; });
  const slotWidth = (await radio(page, 'Product Room').boundingBox()).width;
  await startSampling(page, 1200, true);
  await radio(page, 'Overview').click();
  await expect(radio(page, 'Overview')).toBeChecked();
  await expect(page).toHaveURL(/#\/admin\?view=overview$/);
  const samples = await page.evaluate(() => window.rubberSamples);
  expect(new Set(samples.map(s => s.clip)).size).toBeGreaterThan(3);
  expect(Math.max(...samples.map(s => s.width))).toBeGreaterThan(slotWidth * 1.15);
  expect(samples.at(-1).width).toBeCloseTo((await radio(page, 'Overview').boundingBox()).width, 0);
  expect(new Set(samples.slice(-5).map(s => s.clip)).size).toBe(1);
  expect(await group(page).evaluate(el => el === window.originalAdminNavigation)).toBe(true);
  await expect(page.locator('#page-loader')).toBeHidden();
});

test('keyboard navigation preserves focus and DOM while history and refresh restore selection', async ({ page }) => {
  await login(page);
  await group(page).evaluate(el => {
    window.originalAdminNavigation = el;
    window.adminLoaderShown = false;
    window.adminLoaderObserver = new MutationObserver(() => {
      const loader = document.querySelector('#page-loader');
      if (loader && getComputedStyle(loader).display !== 'none' && getComputedStyle(loader).visibility !== 'hidden' && Number(getComputedStyle(loader).opacity) > 0) window.adminLoaderShown = true;
    });
    window.adminLoaderObserver.observe(document.body, { attributes: true, childList: true, subtree: true });
  });
  await radio(page, 'Product Room').focus();
  for (const [key, name] of [['End', 'Activity'], ['Home', 'Product Room'], ['ArrowRight', 'Overview'], ['ArrowDown', 'Customers'], ['ArrowLeft', 'Overview'], ['ArrowUp', 'Product Room']]) {
    await page.keyboard.press(key);
    await expect(radio(page, name)).toBeChecked();
    await expect(radio(page, name)).toBeFocused();
    expect(await group(page).evaluate(el => el === window.originalAdminNavigation)).toBe(true);
  }
  expect(await page.evaluate(() => window.adminLoaderShown)).toBe(false);
  // Native button activation must also work when no pointer event occurred.
  await radio(page, 'Orders').focus();
  await page.keyboard.press('Space');
  await expect(radio(page, 'Orders')).toBeChecked();
  await expect(page).toHaveURL(/view=orders$/);
  await radio(page, 'Points').focus();
  await page.keyboard.press('Enter');
  await expect(radio(page, 'Points')).toBeChecked();
  await page.goBack();
  await expect(radio(page, 'Orders')).toBeChecked();
  await page.reload();
  await expect(radio(page, 'Orders')).toBeChecked();
});

test('desktop users can drag the selected thumb to another section', async ({ page }) => {
  await login(page, 'no-preference');
  const from = await radio(page, 'Product Room').boundingBox();
  const to = await radio(page, 'Customers').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2 + 8, to.y + to.height / 2, { steps: 30 });
  // Let pointer velocity expire so this verifies landing rather than a momentum flick.
  await page.waitForTimeout(120);
  await page.mouse.up();
  await expect(radio(page, 'Customers')).toBeChecked();
  await expect(page).toHaveURL(/view=customers$/);
  await expect(page.getByRole('heading', { name: 'YOUR CUSTOMERS.' })).toBeVisible();
});

test('mobile sections remain reachable without page overflow and reduced motion settles immediately', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  for (const name of ['Overview', 'Customers', 'Orders', 'Points', 'Activity', 'Product Room']) {
    await radio(page, name).scrollIntoViewIfNeeded();
    await radio(page, name).click();
    await expect(radio(page, name)).toBeChecked();
    await expect(page.locator('#page-loader')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
  await radio(page, 'Overview').scrollIntoViewIfNeeded();
  await radio(page, 'Overview').click();
  await expect(radio(page, 'Overview')).toBeChecked();
  const settled = await thumb(page).evaluate(el => getComputedStyle(el).clipPath);
  await startSampling(page, 250);
  const samples = await page.evaluate(() => window.rubberSamples);
  expect(samples.every(sample => sample.clip === settled)).toBe(true);
  expect(samples.at(-1).width).toBeCloseTo((await radio(page, 'Overview').boundingBox()).width, 0);
});
