# CROWNETIC

A working premium streetwear sample for Malaysia, with MYR prices and an ivory editorial design. Built with **HTML, CSS and JavaScript**, using Vite for development and bundling.

## Open the sample — no installation needed

1. Download this repository as a ZIP from GitHub and **extract the entire folder**.
2. Double-click **`index.html`**. Open it in Chrome, Edge or Firefox.
3. Browse the user storefront. Click **Studio / Admin** in the footer for the admin page.
4. Sign in with username **`admin@123`** and password **`admin@123`**.
5. Add an item, choose stock, check Published and save. Go to Shop All to see it.

Keep `index.html` beside the `public` folder: product and campaign images live in `public/assets`. CSS, fonts and JavaScript are already bundled inside the HTML. Do not open `source.html` directly; it is the development entry.

The requested fixed login is **sample-only**, implemented in the browser; it is not production authentication. Changes remain in this browser. Signing out hides the admin interface; Supabase provides actual access control when connected later. Checkout is simulated.

Navigation uses `#/shop`, `#/admin`, and similar hash routes so refresh works from a local file or static hosting, including GitHub Pages.

### Developer commands

```sh
npm ci
npm run dev
npm run build
```

The editable source is `source.html`, `styles.css`, `app.js`, `catalog.js` and `model.js`. `npm run build` regenerates the ready-to-open root `index.html` and the `dist` folder. Source edits require a rebuild to update the sample HTML. The dev server opens `/source.html` for source development.

## Where the code is

- `index.html`: generated ready-to-open sample; `source.html`: editable HTML entry point.
- `styles.css`: responsive design, typography, layout and component styles.
- `app.js`: pages, navigation, product editor, bag and checkout interactions.
- `model.js`: price, stock, product validation and bag calculations.
- `catalog.js`: sample catalogue, local persistence and optional Supabase adapter.
- `public/assets/`: locally served, AI-generated illustrative fashion images.

Fonts are bundled locally through Fontsource (Barlow Condensed and DM Sans); no external font request is required. The CROWNETIC wordmark is temporary and can be replaced by the final brand logo.

## Try adding products

Open `/admin`. Sign in using the sample username `admin@123` and password `admin@123`. Demo mode is explicitly labeled. Enter a name, description, price, image and stock, check **Published**, and create the product. It appears in `/shop` immediately. Drafts are hidden from the public shop. Use stock 0 for unavailable sizes. The editor includes S, M, L, XL and ONE SIZE.

Product images can be HTTPS URLs or JPEG/PNG/WebP uploads up to 2 MB. Demo uploads and catalogue edits are stored in this browser's local storage; they are not shared between customers or devices. If browser storage is full, save errors are displayed without discarding the form. Reset Demo restores the original sample catalogue after confirmation. The bag also persists locally, independently of catalogue resets.

## Connect Supabase

The site works without Supabase in local demo mode. To use real catalogue storage:

1. Create or choose your Supabase project.
2. Run `supabase/001_catalog.sql` once in the project's SQL editor. It creates tables, database policies, a transactional product-save function and a public `product-images` bucket. Run this against a new catalogue schema; existing tables/policies require a migration review.
3. Create an administrator account using Supabase Authentication > Users.
4. In the SQL editor, add its UUID to the administrator allowlist:

   ```sql
   insert into public.admin_users(user_id) values ('YOUR-AUTH-USER-UUID');
   ```

5. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from your project. These are browser-safe public settings. **Never put a service-role key in the frontend.** Restart Vite after changing them.
6. Open `/admin`, sign in and create products. A new backend starts empty: local demo edits are not automatically migrated. Upload images or provide HTTPS URLs for connected products; local `/assets/` URLs are demo-only.

Both settings must be supplied together. Remote failures show errors instead of silently switching to a sample catalogue. Row-level security restricts product management to allowlisted admins. Public readers see only published products and their variants. The storage bucket is public: all uploaded images, including those intended for draft products, are public assets. Do not upload confidential content.

Supabase integration is implemented but **not live-validated** because no project settings have been supplied. Before launch, verify sign-in, nonadmin denial, published/draft visibility, transactional saves and image upload permissions against your actual project.

## Payments and shipping

Checkout is a simulation: no money is charged, no order is persisted, stock is not reserved, and no delivery is arranged. Use fictional example contact details. The form does not request card details or persist customer information. Shipping is an illustrative RM 0.00. Cards, FPX and DuitNow are not integrated. A real launch needs a selected payment provider, server-side payment creation, verified webhooks, order storage, shipping rates and stock reservation.

## Validation

```sh
npm test
npm run build
npm run test:browser
```

Browser tests use `/usr/bin/chromium` when present. Else run `npx playwright install chromium` and set `CHROMIUM_PATH` to the installed Chrome executable, or adjust the launch settings in `playwright.config.js`. Browser tests cover admin publishing, draft visibility, bag persistence, simulated checkout, corrupt storage recovery and a 390px layout. They do not validate a live Supabase project.

`npm run preview` serves the production build. The bundled sample uses hash routes and needs no server rewrite rules. This repository has not been deployed.
