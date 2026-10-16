# Sample Invoice Implementation Plan

> **For agentic workers:** Use the existing checkout and parallelize the independent backend, database and frontend tasks. Verify their shared contracts before integration.

**Goal:** Complete a no-charge sample purchase and produce a persistent invoice with a secure, retryable test email.

**Architecture:** A shared JavaScript model validates and snapshots invoices. The browser demo persists separate local samples; connected checkout uses an authenticated Supabase Edge Function and a separate sample_orders table. Resend sends only to a configured test inbox.

**Tech Stack:** Existing vanilla HTML/CSS/JavaScript, Supabase Postgres/Auth/Edge Functions, Resend HTTP API, Node tests and Playwright.

**Spec:** ../specs/2026-10-16-sample-invoice-design.md

## Global constraints

- No money charged; no change to real stock, loyalty or paid-sales reports.
- No mail or database secret in browser code, logs, fixtures or committed files.
- Server derives the verified recipient and catalogue pricing.
- Persist one immutable invoice before mail; no duplicate order/email on retry.
- Label sample, provider acceptance and configuration failures honestly.

## Review focus

- Lost responses and duplicate submissions reuse the request and frozen invoice.
- Changed catalogue prices require review; missing/draft/out-of-stock items fail.
- Another customer cannot read or resend an invoice.
- Ambiguous mail attempts cannot be retried outside the idempotency window.
- A declined payment, failed persistence or email outage cannot silently lose the bag or invoice.

## Tasks

1. Backend/model: first test canonical validation, snapshots, escaping, auth, ownership, retries and mail failure. Implement checkout/invoice.js and supabase/functions/sample-checkout with dependency-injected handler tests.
2. Database: add rerunnable 005_sample_checkout.sql, owner-only reads and service-only creation/send RPCs; validate permissions, request replay, send claims and quotas against disposable PostgreSQL.
3. Browser: first test isolated checkout storage/service behavior. Add checkout/service.js, checkout/pages.js and styles; integrate completion, invoice routes/actions and own sample history into app.js and customer/pages.js. Preserve demo points and existing navigation.
4. Integration: test no-charge success/decline, refresh, ownership, preview/print, mock connected email acceptance/failure/retry and existing product/admin flows. Run npm test, build and selected Playwright checks.
5. Document/deploy: append the migration to combined setup, add exact secure function setup instructions, rebuild the downloadable index.html and push the complete change. Report actual deployment/email prerequisites separately from tested local behavior.
