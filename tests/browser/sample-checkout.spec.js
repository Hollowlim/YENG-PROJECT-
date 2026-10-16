import { test, expect } from './fixtures.js';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

test.setTimeout(60_000);
const invoiceHeading = page => page.getByRole('heading', { name: 'YOUR SAMPLE INVOICE.', exact: true });
const complete = page => page.getByRole('button', { name: 'COMPLETE SAMPLE ORDER', exact: true });
const testUrl = 'https://sample-invoice-test.supabase.co';
const userId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const invoiceId = '33333333-3333-4333-8333-333333333333';
const secondProductId = '44444444-4444-4444-8444-444444444444';
let connectedHtml;
test.beforeAll(async () => {
  const result = await build({
    entryPoints: ['app.js'], bundle: true, jsx: 'automatic', format: 'iife', write: false, outdir: 'test-memory',
    loader: { '.png': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: testUrl, VITE_SUPABASE_PUBLISHABLE_KEY: 'test-public-key' }) },
  });
  const js = result.outputFiles.find(file => file.path.endsWith('.js')).text.replaceAll('/assets/', './public/assets/').replaceAll('</script', '<\\/script');
  const css = result.outputFiles.find(file => file.path.endsWith('.css')).text + '\n' + await readFile('styles.css', 'utf8');
  connectedHtml = (await readFile('source.html', 'utf8')).replace('<link rel="stylesheet" href="/styles.css" />', () => `<style>${css}</style>`).replace('<script type="module" src="/app.js"></script>', () => `<script>${js}</script>`);
});
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) return null;
      return original.call(this, type, ...args);
    };
    window.invoicePrintCalls = 0;
    window.print = () => { window.invoicePrintCalls += 1; };
  });
});
async function addToCheckout(page, base = '/index.html', product = 'core-heavyweight-tee') {
  await page.goto(`${base}#/product/${product}`);
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: 'ADD TO BAG', exact: true }).click();
  await page.getByRole('link', { name: 'BAG (1)', exact: true }).click();
  await page.getByRole('button', { name: 'SAMPLE CHECKOUT', exact: true }).click();
  await expect(page.getByLabel('Sample payment result', { exact: true })).toHaveValue('success');
}
async function signup(page, name, email) {
  await page.goto('/index.html#/signup');
  await page.getByLabel('Full name', { exact: true }).fill(name);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('SamplePassword123');
  await page.getByRole('button', { name: 'CREATE ACCOUNT', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'YOUR INNER CIRCLE.' })).toBeVisible();
}

test('guest completion persists an explicitly unpaid invoice with printable email preview', async ({ page }) => {
  await addToCheckout(page);
  await complete(page).click();
  await expect(invoiceHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/#\/invoice\/[0-9a-f-]{36}$/);
  const url = page.url();
  await expect(page.getByText('SIMULATION COMPLETE', { exact: true })).toBeVisible();
  const document = page.locator('.invoice-document');
  await expect(document).toContainText('SAMPLE INVOICE');
  await expect(document).toContainText(/NO PAYMENT COLLECTED/i);
  await expect(document).toContainText(/NOT A TAX INVOICE/i);
  await expect(document).toContainText('Core Heavyweight Tee');
  await expect(document).toContainText('189.00');
  await expect(document).toContainText('MYR');
  await expect(page.locator('.invoice-email-status')).toContainText('Email preview only. No email has been sent.');
  await expect(page.getByRole('link', { name: 'BAG (0)', exact: true })).toBeVisible();
  await page.getByText('PREVIEW INVOICE EMAIL', { exact: true }).click();
  const email = page.frameLocator('iframe[title="Invoice email preview"]');
  await expect(email.getByRole('heading', { name: 'SAMPLE INVOICE', exact: true })).toBeVisible();
  await expect(email.locator('body')).toContainText('189.00');
  await page.getByRole('button', { name: 'PRINT / SAVE PDF', exact: true }).click();
  expect(await page.evaluate(() => window.invoicePrintCalls)).toBe(1);
  await page.reload();
  await expect(invoiceHeading(page)).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(page.locator('.invoice-document')).toContainText('189.00');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.invoice-document')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/sample-invoice-mobile.png', fullPage: true });
  await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
  await expect(page.locator('.masthead')).toBeHidden();
  await expect(page.locator('.invoice-document')).toBeVisible();
  await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('crownetic.customers.v1') || '{}').orders || [])).toEqual([]);
});

test('declined and cancelled simulations preserve the bag and never create an invoice', async ({ page }) => {
  await addToCheckout(page);
  for (const outcome of ['declined', 'cancelled']) {
    await page.getByLabel('Sample payment result', { exact: true }).selectOption(outcome);
    await complete(page).click();
    await expect(page.locator('#checkout-error')).toContainText(outcome === 'declined' ? /declin/i : /cancel/i);
    await expect(page.getByRole('link', { name: 'BAG (1)', exact: true })).toBeVisible();
    await expect(invoiceHeading(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('crownetic.sample-orders.v1'))).toBeNull();
  }
  await page.reload();
  await expect(page.getByRole('link', { name: 'BAG (1)', exact: true })).toBeVisible();
});

test('signed-in samples appear in the owner history and are hidden from another account', async ({ page }) => {
  await signup(page, 'Invoice Owner', 'invoice-owner@example.com');
  await addToCheckout(page);
  await complete(page).click();
  await expect(invoiceHeading(page)).toBeVisible();
  const invoiceUrl = page.url();
  await expect(page.locator('.invoice-document')).toContainText('invoice-owner@example.com');
  await page.goto('/index.html#/account');
  const history = page.locator('.sample-invoice-history');
  await expect(history).toBeVisible();
  await history.getByRole('link', { name: /^View sample invoice SAMPLE-/ }).click();
  await expect(invoiceHeading(page)).toBeVisible();
  await page.goto('/index.html#/account');
  await page.getByRole('button', { name: 'SIGN OUT', exact: true }).click();
  await signup(page, 'Other Owner', 'other-owner@example.com');
  await expect(page.locator('.sample-invoice-history')).toHaveCount(0);
  await page.goto(invoiceUrl);
  await expect(page.locator('#page-loader')).toBeHidden();
  await expect(invoiceHeading(page)).toHaveCount(0);
  await expect(page.locator('.invoice-document')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('invoice-owner@example.com');
});

async function mockConnected(page, options = {}) {
  if (typeof options === 'boolean') options = { checkoutFailure: options };
  const calls = [];
  let order = null;
  let price = 18900;
  let releaseCheckout;
  const checkoutGate = options.holdCheckout ? new Promise(resolve => { releaseCheckout = resolve; }) : null;
  let lostResponse = false;
  let ordersCreated = 0;
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'member@example.com', email_confirmed_at: '2026-10-16T00:00:00Z', user_metadata: { name: 'Sample Member' }, created_at: '2026-10-16T00:00:00Z' };
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-signature`;
  await page.route('**/sample-connected-fixture.html', route => route.fulfill({ contentType: 'text/html', body: connectedHtml }));
  await page.route(`${testUrl}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    const body = request.postDataJSON();
    calls.push({ path: url.pathname, body, authorization: request.headers().authorization });
    let status = 200, data;
    if (url.pathname === '/auth/v1/token') data = { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user };
    else if (url.pathname === '/auth/v1/user') data = user;
    else if (url.pathname === '/auth/v1/logout') data = {};
    else if (url.pathname === '/rest/v1/products') data = [
      { id: productId, name: 'Connected Sample Tee', category: 'Tees', description: 'Test fixture', published: true, price_sen: price, image_url: '/public/assets/tee.png', variants: [{ size: 'M', stock: 5 }] },
      { id: secondProductId, name: 'Added While Waiting Tee', category: 'Tees', description: 'Another test fixture', published: true, price_sen: 5000, image_url: '/public/assets/tee.png', variants: [{ size: 'M', stock: 5 }] },
    ];
    else if (url.pathname === '/rest/v1/customer_profiles' || url.pathname === '/rest/v1/admin_users') data = null;
    else if (url.pathname === '/rest/v1/sample_orders') data = order ? [order] : [];
    else if (url.pathname.startsWith('/rest/v1/')) data = [];
    else if (url.pathname === '/functions/v1/sample-checkout') {
      if (options.checkoutFailure) { status = 503; data = { error: 'Sample invoice service is unavailable. Please try again.' }; }
      else if (body.action === 'resend') {
        expect(body.order_id).toBe(invoiceId);
        order = { ...order, email_status: 'accepted', email_error: '', email_provider_id: 'test-provider-id', email_accepted_at: new Date().toISOString() };
        data = { order };
      } else {
        expect(body.action).toBe('checkout');
        if (!order) {
          ordersCreated += 1;
          order = { id: invoiceId, request_id: body.request_id, user_id: userId, reference: `SAMPLE-${invoiceId.toUpperCase()}`, created_at: new Date().toISOString(), status: 'sample_completed', currency: 'MYR', customer_name: body.customer.name, customer_email: user.email, billing_address: body.customer.address, postcode: body.customer.postcode, country: body.customer.country, items: [{ product_id: productId, name: 'Connected Sample Tee', size: 'M', quantity: 1, unit_price_sen: 18900 }], subtotal_sen: 18900, shipping_sen: 0, total_sen: 18900, item_count: 1, email_status: 'failed', email_error: 'Email provider temporarily unavailable.', email_provider_id: null, email_attempt_count: 1 };
        }
        data = { order };
        if (checkoutGate) await checkoutGate;
        if (options.loseFirstResponse && !lostResponse) {
          lostResponse = true;
          status = 503;
          data = { error: 'The sample invoice response was interrupted. Please retry.' };
        }
      }
    } else throw Error(`Unmocked sample endpoint: ${url.pathname}`);
    await route.fulfill({ status, contentType: 'application/json', headers: { 'x-supabase-api-version': '2024-01-01' }, body: JSON.stringify(data) });
  });
  await page.goto('/sample-connected-fixture.html#/login');
  await page.getByLabel('Email address or username', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('SamplePassword123');
  await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'YOUR INNER CIRCLE.' })).toBeVisible();
  return { calls, token, setPrice: value => { price = value; }, releaseCheckout: () => releaseCheckout?.(), ordersCreated: () => ordersCreated };
}

test('connected email failure preserves the invoice and retries delivery for the same order', async ({ page }) => {
  const { calls, token } = await mockConnected(page);
  await addToCheckout(page, '/sample-connected-fixture.html', productId);
  await complete(page).click();
  await expect(invoiceHeading(page)).toBeVisible();
  await expect(page.locator('.invoice-document')).toContainText('member@example.com');
  await expect(page.getByRole('link', { name: 'BAG (0)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'RETRY INVOICE EMAIL', exact: true }).click();
  await expect(page.locator('.invoice-email-status')).toContainText(/accepted for delivery/i);
  await expect(page).toHaveURL(new RegExp(`#/invoice/${invoiceId}$`));
  const functions = calls.filter(call => call.path === '/functions/v1/sample-checkout');
  expect(functions.map(call => call.body.action)).toEqual(['checkout', 'resend']);
  expect(functions.every(call => call.authorization === `Bearer ${token}`)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('crownetic.sample-orders.v1'))).toBeNull();
  await page.reload();
  await expect(invoiceHeading(page)).toBeVisible();
  await expect(page.locator('.invoice-email-status')).toContainText(/accepted for delivery/i);
});

test('connected service failure retains the bag and never falls back to browser invoices', async ({ page }) => {
  const { calls } = await mockConnected(page, true);
  await addToCheckout(page, '/sample-connected-fixture.html', productId);
  await complete(page).click();
  await expect(page.locator('#checkout-error')).not.toBeEmpty();
  await expect(page.getByRole('link', { name: 'BAG (1)', exact: true })).toBeVisible();
  await expect(invoiceHeading(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('crownetic.sample-orders.v1'))).toBeNull();
  expect(calls.filter(call => call.path === '/functions/v1/sample-checkout')).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('link', { name: 'BAG (1)', exact: true })).toBeVisible();
});

test('a lost response replays the saved quote and billing after refresh and catalog changes', async ({ page }) => {
  const mock = await mockConnected(page, { loseFirstResponse: true });
  await addToCheckout(page, '/sample-connected-fixture.html', productId);
  await page.getByLabel('First name', { exact: true }).fill('Ari');
  await page.getByLabel('Last name', { exact: true }).fill('Invoice');
  await page.getByLabel('Example delivery address', { exact: true }).fill('42 Original Sample Avenue');
  await page.getByLabel('Example postcode', { exact: true }).fill('50480');
  await complete(page).click();
  await expect(page.locator('#checkout-error')).toContainText(/interrupted/i);
  const first = mock.calls.find(call => call.path === '/functions/v1/sample-checkout').body;
  expect(mock.ordersCreated()).toBe(1);
  mock.setPrice(24900);
  await page.reload();
  await expect(page.getByLabel('Example delivery address', { exact: true })).toHaveValue('42 Original Sample Avenue');
  for (const label of ['First name', 'Last name', 'Example delivery address', 'Example postcode']) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('readonly', '');
  }
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Ari');
  await expect(page.getByLabel('Last name', { exact: true })).toHaveValue('Invoice');
  await expect(page.getByLabel('Example postcode', { exact: true })).toHaveValue('50480');
  await expect(page.locator('.summary-total')).toContainText('189.00');
  await complete(page).click();
  await expect(invoiceHeading(page)).toBeVisible();
  const requests = mock.calls.filter(call => call.path === '/functions/v1/sample-checkout');
  expect(requests).toHaveLength(2);
  expect(requests[1].body).toEqual(first);
  expect(mock.ordersCreated()).toBe(1);
  await expect(page.locator('.invoice-document')).toContainText('42 Original Sample Avenue');
  await expect(page.locator('.invoice-document')).toContainText('189.00');
  await expect(page).toHaveURL(new RegExp(`#/invoice/${invoiceId}$`));
});

test('completing an in-flight sample consumes its items while retaining new bag additions', async ({ page }) => {
  const mock = await mockConnected(page, { holdCheckout: true });
  try {
    await addToCheckout(page, '/sample-connected-fixture.html', productId);
    await complete(page).click();
    await expect.poll(() => mock.calls.filter(call => call.path === '/functions/v1/sample-checkout').length).toBe(1);
    // Keep the existing document alive: a hash navigation must not abort the request.
    await page.evaluate(id => { location.hash = `#/product/${id}`; }, secondProductId);
    await expect(page.getByRole('heading', { name: 'Added While Waiting Tee', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'M', exact: true }).click();
    await page.getByRole('button', { name: 'ADD TO BAG', exact: true }).click();
    await expect(page.getByRole('link', { name: 'BAG (2)', exact: true })).toBeVisible();
    mock.releaseCheckout();
    await expect(invoiceHeading(page)).toBeVisible();
    await expect(page.getByRole('link', { name: 'BAG (1)', exact: true })).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('crownetic.bag.v1')));
    expect(saved.data).toEqual([{ productId: secondProductId, size: 'M', quantity: 1 }]);
    const request = mock.calls.find(call => call.path === '/functions/v1/sample-checkout').body;
    expect(saved.completed_sample_requests).toContain(request.request_id);
    await page.getByRole('link', { name: 'BAG (1)', exact: true }).click();
    await expect(page.locator('main')).toContainText('Added While Waiting Tee');
    await expect(page.locator('main')).not.toContainText('Connected Sample Tee');
    await page.reload();
    await expect(page.getByRole('link', { name: 'BAG (1)', exact: true })).toBeVisible();
    expect(mock.ordersCreated()).toBe(1);
  } finally {
    mock.releaseCheckout();
  }
});
