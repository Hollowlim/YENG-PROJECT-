# CROWNETIC Admin Portal Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans to implement each task, with tests and a final independent review.

**Goal:** Let administrators manage customers, manually recorded paid purchases and auditable rewards while customers see their own histories.

**Architecture:** Add focused `admin/` modules to the existing hash-routed storefront. Shared demo storage and a Supabase RPC adapter expose the same data contract; database functions enforce privileged mutations atomically.

**Tech Stack:** JavaScript, plain CSS, existing esbuild/Vite, Supabase PostgreSQL/Auth, Node test runner and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-admin-portal-design.md`

## Global Constraints

- Preserve Product Room and the downloadable standalone HTML.
- No payment integration, live database writes, new dependencies or browser secrets.
- Default 100 points/item; tiers 1,000/5,000/10,000.
- All signed mutations audited; sales/refunds idempotent; customer access remains owner-only.
- Sample sales record history/points; inventory is managed separately.

## Review Focus

- Duplicate submissions and reused references must not double rewards.
- Unprivileged customers cannot list accounts, read another customer's history or grant points.
- Refunds use historical snapshots after products/prices/points change.
- Negative balances, zero-item bonus events and old demo rewards render correctly.
- Empty accounts, missing migration and mobile layout remain usable.

### Task 1: Protected database operations

Files: `supabase/004_admin_portal.sql`, `supabase/setup.sql`, SQL regression checks.

- [x] Add order/item/audit storage, signed ledger extensions and owner/admin read policies.
- [x] Implement guarded RPCs: `admin_portal_snapshot()`, `admin_record_sale(sale_data)`, `admin_adjust_points(adjustment_data)`, `admin_refund_order(p_order_id,p_reason)`, `admin_update_fulfillment(p_order_id,p_status,p_tracking_number)`.
- [x] Exercise reruns, role isolation, validation, duplicate requests/references, historical refunds and rollback in disposable PostgreSQL.

### Task 2: Shared local state and data adapter

Files: `customer/storage.js`, `customer/service.js`, `admin/model.js`, `admin/service.js`, Node tests.

- [x] Reproduce missing sale/adjustment/refund behavior with failing tests.
- [x] Share the existing customer storage document, preserving legacy users/events; add orders/activity arrays.
- [x] Expose `adminStore.snapshot/recordSale/adjustPoints/refundOrder/updateFulfillment`; mirror atomic validations in local demo and map connected calls to the exact RPC parameters.
- [x] Add `customers.orders()` for the current customer's order snapshots.
- [x] Verify mutation guards, repeat requests, duplicate references, rollback, stripped password data and RPC mapping.

### Task 3: Admin and customer screens

Files: `admin/pages.js`, `admin/portal.js`, `admin/styles.css`, `app.js`, `customer/pages.js`, `customer/model.js`, `customer/styles.css`, translations.

- [x] Add sidebar/tab navigation, overview, customer search/detail, order recording/detail, reward adjustments and activity screens.
- [x] Keep `/admin` opening Product Room; use query parameters for other views/details.
- [x] Scope controller listeners and clean them on route changes. Disable pending submissions; retain request UUIDs for retries; report errors inline.
- [x] Extend `dashboard(user, activity, orders = [])` to display purchases and signed events, and fix negative-balance tier progress with a failing test first.
- [x] Explain missing migration inside the protected admin shell while keeping Product Room available.

### Task 4: Integration and release verification

Files: browser regression tests, `docs/admin-portal.md`, README, generated `index.html`.

- [x] Reproduce missing admin navigation before integration.
- [x] Test a complete sample journey: signup, admin sale, bonus/deduction, fulfillment, refund and customer-visible histories with refresh/isolation checks.
- [x] Test mocked connected RPC calls and missing setup, and phone layout; block all live-project calls.
- [x] Run Node suite, build and relevant browser regressions; review source and SQL independently.
- [x] Regenerate downloadable HTML, commit and push authorized changes to GitHub main. Report hosted migration as a user action, not as already applied.
