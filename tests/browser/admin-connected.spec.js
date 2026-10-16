import { test, expect } from './fixtures.js';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

let html;
const adminId = '11111111-1111-4111-8111-111111111111';
test.beforeAll(async () => {
  const result = await build({
    entryPoints: ['app.js'], bundle: true, jsx: 'automatic', format: 'iife', write: false, outdir: 'test-memory',
    loader: { '.png': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://admin-portal-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-public-key' }) },
  });
  const js = result.outputFiles.find(file => file.path.endsWith('.js')).text.replaceAll('/assets/', './public/assets/').replaceAll('</script', '<\\/script');
  const css = result.outputFiles.find(file => file.path.endsWith('.css')).text + '\n' + await readFile('styles.css', 'utf8');
  html = (await readFile('source.html', 'utf8')).replace('<link rel="stylesheet" href="/styles.css" />', () => `<style>${css}</style>`).replace('<script type="module" src="/app.js"></script>', () => `<script>${js}</script>`);
});

async function mockProject(page, isAdmin) {
  const calls = [];
  const user = { id: adminId, aud: 'authenticated', role: 'authenticated', email: 'sample@example.com', email_confirmed_at: '2026-10-16T00:00:00Z', user_metadata: { name: 'Sample member' }, created_at: '2026-10-16T00:00:00Z' };
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-signature`;
  await page.route('**/admin-connected-fixture.html', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route('https://admin-portal-test.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url());
    calls.push({ path: url.pathname, query: url.searchParams, body: request.postDataJSON() });
    let status = 200, body;
    if (url.pathname === '/auth/v1/token') body = { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user };
    else if (url.pathname === '/auth/v1/user') body = user;
    else if (url.pathname === '/auth/v1/logout') body = {};
    else if (url.pathname === '/rest/v1/admin_users') body = isAdmin ? { user_id: adminId } : null;
    else if (url.pathname === '/rest/v1/rpc/admin_portal_snapshot') { status = 404; body = { code: 'PGRST202', message: 'Could not find the function public.admin_portal_snapshot in the schema cache' }; }
    else if (url.pathname === '/rest/v1/customer_profiles') body = null;
    else if (url.pathname.startsWith('/rest/v1/')) body = [];
    else throw Error(`Unmocked API endpoint: ${url.pathname}`);
    await route.fulfill({ status, headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' }, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}
async function login(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/admin-connected-fixture.html#/login');
  await page.getByLabel('Email address or username', { exact: true }).fill('sample@example.com');
  await page.getByLabel('Password', { exact: true }).fill('SamplePassword123');
  await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
}

test('connected Product Room stays available while new tools explain migration 004', async ({ page }) => {
  const calls = await mockProject(page, true);
  await login(page);
  await expect(page.getByRole('heading', { name: 'THE PRODUCT ROOM.' })).toBeVisible();
  expect(calls.some(call => call.path.includes('/rpc/'))).toBe(false);
  await page.getByRole('navigation', { name: 'Admin navigation' }).getByRole('link', { name: 'Customers', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('supabase/004_admin_portal.sql');
  await expect(page.getByRole('button', { name: 'TRY AGAIN', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Admin navigation' }).getByRole('link', { name: 'Product Room', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'THE PRODUCT ROOM.' })).toBeVisible();
  expect(calls.filter(call => call.path.includes('/rpc/')).map(call => call.path)).toEqual(['/rest/v1/rpc/admin_portal_snapshot']);
});

test('a connected customer cannot open the portal or invoke its customer-list RPC', async ({ page }) => {
  const calls = await mockProject(page, false);
  await login(page);
  await expect(page.getByRole('heading', { name: 'YOUR INNER CIRCLE.' })).toBeVisible();
  const orderReads = calls.filter(call => call.path === '/rest/v1/orders');
  expect(orderReads.length).toBeGreaterThan(0);
  expect(orderReads.every(call => call.query.get('user_id') === `eq.${adminId}`)).toBe(true);
  await page.goto('/admin-connected-fixture.html#/admin?view=customers');
  await expect(page.getByRole('heading', { name: 'ADMIN ACCESS REQUIRED.' })).toBeVisible();
  expect(calls.some(call => call.path.includes('/rpc/'))).toBe(false);
  await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toHaveCount(0);
});
