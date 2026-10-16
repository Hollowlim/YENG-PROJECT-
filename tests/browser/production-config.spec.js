import { test, expect } from './fixtures.js';
import { readFile } from 'node:fs/promises';
import { supabasePublicConfig } from '../../site-config.js';

test('downloadable build uses the public project settings and keeps live calls mocked', async ({ page }) => {
  const html = await readFile('index.html', 'utf8');
  const requests = [];
  await page.route('**/connected-fixture.html', route => route.fulfill({ contentType: 'text/html', body: html }));
  // All requests to the configured project are handled in memory, before the
  // context-level live-project blocker. This does not validate the real API key.
  await page.route(`${supabasePublicConfig.url}/**`, async route => {
    const request = route.request();
    requests.push({ method: request.method(), path: new URL(request.url()).pathname, key: request.headers().apikey });
    if (request.method() !== 'GET') {
      await route.abort('blockedbyclient');
      throw Error('Production-build smoke test must remain read-only');
    }
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.goto('/connected-fixture.html#/signup');
  await expect(page.getByText('Confirm your email using the link we send before signing in.', { exact: true })).toBeVisible();
  await expect(page.getByText('SAMPLE ACCOUNT', { exact: false })).toHaveCount(0);
  await page.goto('/connected-fixture.html#/shop');
  await expect(page.getByRole('heading', { name: 'Something good is coming.' })).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(request => request.method === 'GET' && request.path === '/rest/v1/products' && request.key === supabasePublicConfig.publishableKey)).toBe(true);
  expect(html).toContain(supabasePublicConfig.publishableKey);
});
