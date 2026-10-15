# CROWNETIC Sample Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the selected ivory streetwear storefront with a functioning demo catalogue, bag, checkout, and admin product editor, plus an optional Supabase backend.

**Architecture:** A React SPA shares typed catalogue and bag logic between storefront and admin routes. A repository interface selects local demo storage or Supabase explicitly; configured backend errors never silently switch to demo data. Demo checkout remains separate from payment processing.

**Tech Stack:** React, TypeScript, Vite, React Router, Supabase JS, Vitest, Testing Library; Playwright for browser verification when available.

**Spec:** `docs/superpowers/specs/2026-10-15-crownetic-sample-design.md`

## Global Constraints

- “Use React, TypeScript, and Vite for a responsive sample.”
- “Use integer sen for prices.”
- “Never expose a service-role key in the browser.”
- “Demo mode is visibly labeled and has an accessible demo entry, not a pretend secure login.”
- “Do not deploy or create external services as part of this sample.”
- Preserve the selected Concrete Archive visual direction and the original generated reference image.
- No real payments, fulfillment, or stored orders; no invented manufacturing claims.
- Use the existing isolated checkout; do not create a worktree.

## Review Focus

- Corrupt or outdated local storage must recover safely without crashing the page; pin in Task 1.
- Invalid prices, unsafe image URLs, and negative/fractional stock must be rejected; pin in Task 1.
- Hidden, deleted, or depleted products already in a bag must block simulated checkout; pin in Task 3.
- A configured but unreachable Supabase backend must show an error, not demo products; pin in Task 4.
- A normal signed-in account must not gain admin privileges or read drafts; pin through SQL policies and mark live verification pending in Task 4.

## Files and shared interfaces

- `src/catalog/types.ts`: `Product { id, name, category, description, priceSen, imageUrl, published, variants: Variant[] }`; `Variant { size: string, stock: number }`; `ProductInput = Omit<Product, 'id'>`.
- `src/catalog/repository.ts`: `CatalogRepository` with `list(includeDrafts?: boolean): Promise<Product[]>`, `save(input: ProductInput, id?: string): Promise<Product>`, `resetDemo?(): Promise<void>`, and `uploadImage?(file: File): Promise<string>`; select adapter from configuration.
- `src/catalog/validation.ts`: `validateProduct(input: ProductInput): Record<string, string>`; `parsePriceSen(value: string): number` rejects invalid precision and negative/nonfinite prices.
- `src/catalog/local.ts`, `src/catalog/seed.ts`: versioned demo persistence and illustrative seed products.
- `src/bag/model.ts`: `BagLine { productId: string, size: string, quantity: number }`; `subtotalSen(lines: BagLine[], products: Product[]): number`; `validateBag(lines: BagLine[], products: Product[]): string[]`.
- `src/app/`: routing, application providers, shared navigation and footer.
- `src/storefront/`: home, shop, product, bag, checkout, and about pages.
- `src/admin/`: login, catalogue list, and reusable product form.
- `src/catalog/supabase.ts`, `src/auth/`: connected catalogue, storage, session and admin membership checks.
- `src/styles/`: design tokens, shared styles, and responsive page styles; `public/images/`: campaign and product assets.
- `supabase/migrations/001_catalog.sql`: schema, RLS, admin helper, storage policies, transactional catalogue save RPC.
- `README.md`, `.env.example`: development, demo, Supabase and simulation instructions.

## Task 1: Working application foundation and demo catalogue

**Files:** package/config files, `src/catalog/*` except Supabase adapter, `src/app/*`, `src/styles/tokens.css`, `src/catalog/catalog.test.ts`.

**Interfaces:** Produce the product types, validation functions and local repository above. Use a single `CatalogRepository` instance through application context; refresh catalogue after mutations.

- [ ] Scaffold Vite React/TypeScript, routing and Vitest tooling; provide `dev`, `build`, `typecheck`, and `test` scripts and install dependencies with a committed lockfile.
- [ ] Write failing tests asserting RM 189 becomes 18900 sen, excess decimal places and negative values fail, unsafe image protocols fail, fractional/negative stock fails, corrupt storage safely restores seed data, and draft products are excluded from public lists.
- [ ] Run `npm test -- --run src/catalog/catalog.test.ts`; confirm the new assertions fail before implementation.
- [ ] Implement the shared types, validated input handling, seed catalogue and versioned local adapter. Preserve valid stored edits, expose demo reset, and reject partial backend configuration rather than falling back.
- [ ] Run the catalogue tests and `npm run typecheck`; require all assertions and type checks to pass. Commit the foundation.

## Task 2: Selected visual direction and shopping pages

**Files:** `public/images/*`, `src/styles/*`, `src/storefront/{Home,Shop,Product,About}.tsx`, `src/app/{App,Layout}.tsx`, `src/storefront/Product.test.tsx`.

**Interfaces:** Consume `CatalogRepository.list()` through catalogue context; product detail uses `/product/:id`, shop `/shop`, about `/about`.

- [ ] Write a failing product interaction test: adding without a selected size fails, unavailable sizes are disabled, selecting an in-stock size and valid quantity emits the expected bag line.
- [ ] Run `npm test -- --run src/storefront/Product.test.tsx`; confirm expected failure.
- [ ] Build the ivory editorial layout against the approved image: oversized black wordmark, concrete hero, slim navigation, restrained collection grid and footer. Generate or source separate illustrative assets; do not use a screenshot as the interface. Implement category filters, product lookup, not-found/error/empty states, and brief brand copy.
- [ ] Provide responsive layouts, semantic controls, focus states, alt text, reduced motion and clearly labeled illustrative imagery/demo status. Keep asset licensing/source notes.
- [ ] Rerun product tests, typecheck and build. Commit storefront pages.

## Task 3: Persistent bag and simulated checkout

**Files:** `src/bag/{model,context}.tsx` (use `.ts` for model), `src/bag/model.test.ts`, `src/storefront/{Bag,Checkout}.tsx`, `src/storefront/Checkout.test.tsx`.

**Interfaces:** Consume product types and repository; produce `useBag()` with `lines`, `add(line)`, `update(productId,size,quantity)`, `remove(productId,size)`, and `clear()`.

- [ ] Write failing tests for size-specific line merging, quantity limits, persisted bag restoration and integer-sen subtotals. Assert hidden/deleted/depleted products prevent checkout, and submitting an empty bag cannot create a confirmation.
- [ ] Run the bag and checkout tests; verify expected failures.
- [ ] Implement persistent bag state, accessible controls and totals. Re-fetch current products immediately before confirmation and validate quantities and publication status. Display current catalogue prices and require review if they change.
- [ ] Build an explicitly simulated checkout using fictional example contact details, no card fields, illustrative shipping, and a clear simulated confirmation. Do not persist customer information or claim stock reservation; clear the bag only after successful simulation.
- [ ] Run the bag/checkout tests, typecheck and build. Commit bag and checkout.

## Task 4: Admin publishing and optional Supabase persistence

**Files:** `src/admin/*`, `src/auth/*`, `src/catalog/{repository,supabase}.ts`, `supabase/migrations/001_catalog.sql`, `.env.example`, `src/admin/Admin.test.tsx`, `src/catalog/supabase.test.ts`.

**Interfaces:** Consume `CatalogRepository.save()` and validation; connected mode reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Use public browser-safe credentials only. Connected auth offers sign-in/sign-out and verifies membership in `public.admin_users`.

- [ ] Write failing tests proving a newly published admin product appears publicly, a draft stays hidden, save failures preserve editor inputs, invalid forms cannot save, and a configured remote error never shows seeded products.
- [ ] Run those tests; verify expected failures.
- [ ] Implement labeled demo admin access, product list, create/edit form, stock per size, draft/published toggle, image preview, save feedback and confirmed demo reset. Demo image uploads use validated, size-limited local image data; connected uploads use Supabase storage.
- [ ] Implement Supabase adapter and email/password admin login with loading/error/access-denied states. Save product and variants atomically through an administrator-only database function; ensure clearing all variants does not leave stale inventory.
- [ ] Write schema constraints and RLS: public reads only published products/variants; only allowlisted admins mutate catalogue and storage; clients cannot mutate admin membership. Use a safely scoped admin helper and document privileged bootstrap SQL. Storage is publicly readable for published product imagery and writable only by admins.
- [ ] Verify adapter/error tests, admin publishing tests, typecheck and build. Without a supplied project, explicitly leave live auth, database, upload and RLS enforcement verification pending. Commit admin and integration.

## Task 5: End-to-end verification and handoff

**Files:** `tests/storefront.spec.ts`, `playwright.config.ts` if browser automation is available, `README.md`, final responsive/style adjustments.

**Interfaces:** Exercise `/`, `/shop`, `/product/:id`, `/bag`, `/checkout`, `/about`, `/admin` through the real running application.

- [ ] Write an end-to-end scenario: publish a demo product in admin, find it in shop, select size, add to bag, change quantity, reload, and complete a simulated checkout; assert the final simulation label and empty bag. Include narrow-screen navigation and no horizontal overflow at 390px.
- [ ] Start the app and run the scenario, inspect desktop/mobile screenshots against the selected concept, and fix observed defects. If browser tooling cannot be provisioned, record that limitation and run available functional tests plus HTTP serving checks.
- [ ] Document install/start/test commands, demo persistence/reset, sample imagery, Supabase migration/bootstrap/configuration, absent live backend verification and simulated payments.
- [ ] Run `npm test -- --run`, `npm run typecheck`, and `npm run build`; inspect Git changes and ensure no secrets, generated browser artifacts, or dependency caches are tracked. Commit the verified sample.
- [ ] Report tested capabilities, how to run the sample, and external setup remaining. Do not claim deployment, live payments, or connected Supabase validation.
