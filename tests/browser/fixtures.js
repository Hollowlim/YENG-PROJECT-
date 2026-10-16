import { test as base, expect } from "@playwright/test";
import { supabasePublicConfig } from "../../site-config.js";
export { expect };
export const test = base.extend({
  protectLiveDatabase: [async ({ context }, use) => {
    const attempted = [];
    // A stale build must never create accounts or send mail in the real project.
    await context.route(`${supabasePublicConfig.url}/**`, async route => {
      attempted.push(new URL(route.request().url()).pathname);
      await route.abort("blockedbyclient");
    });
    await use();
    expect(attempted, "Automated tests must not contact the live Supabase project").toEqual([]);
  }, { auto: true }],
});
