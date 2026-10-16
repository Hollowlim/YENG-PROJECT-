# CROWNETIC

A premium black-and-chrome streetwear storefront for Malaysia with MYR prices. Public Supabase connection settings for CROWNETIC are included in `site-config.js`; checkout remains a simulation. Built with **HTML, CSS and JavaScript**, using Vite for development and bundling.

## Open the website — no installation needed

1. Download this repository as a ZIP from GitHub and **extract the entire folder**.
2. Double-click **`index.html`**. Open it in Chrome, Edge or Firefox.
3. Browse the user storefront. Click **Account** for customer or administrator login.
4. Sign in with your real Supabase account. Administrator access requires a matching UUID in `public.admin_users`; the fixed `admin@123` demo login is disabled in connected mode.
5. Add an item, choose stock, check Published and save. Go to Shop All to see it.

Keep `index.html` beside the `public` folder: product and campaign images live in `public/assets`. CSS, fonts and JavaScript are already bundled inside the HTML. Do not open `source.html` directly; it is the development entry.

Connected mode uses Supabase Auth, catalogue storage, and database access rules. The repository includes only a public publishable key, never a service-role/secret key. Existing local demo products and accounts are not transferred automatically: add real products through an authorized admin account. Checkout is still simulated. For the isolated browser-only sample with `admin@123`, use the demo command below.

Navigation uses `#/shop`, `#/admin`, and similar hash routes so refresh works from a local file or static hosting, including GitHub Pages.

### Developer commands

```sh
npm ci
npm run dev
npm run build

# Optional browser-only demo, with no Supabase requests:
node scripts/build-sample.js --demo --out-dir .test-site
```

The editable source is `source.html`, `styles.css`, `app.js`, `catalog.js` and `model.js`. `npm run build` regenerates the ready-to-open root `index.html` and the `dist` folder using the public project defaults, with optional `VITE_` overrides. `--demo --out-dir .test-site` writes only to the ignored demo directory and preserves the connected root build. Source edits require a rebuild to update the sample HTML. The dev server opens `/source.html` for source development.

## Where the code is

- `index.html`: generated ready-to-open sample; `source.html`: editable HTML entry point.
- `styles.css`: responsive design, typography, layout and component styles.
- `app.js`: pages, navigation, product editor, bag and checkout interactions.
- `model.js`: price, stock, product validation and bag calculations.
- `catalog.js`: sample catalogue, local persistence and optional Supabase adapter.
- `public/assets/`: locally served, AI-generated illustrative fashion images.

Fonts are bundled locally through Fontsource (Barlow Condensed and DM Sans); no external font request is required. The CROWNETIC wordmark is temporary and can be replaced by the final brand logo.

## Try adding products

Use Account to sign in with an authorized Supabase admin email and password. In an explicitly built demo, use `admin@123` / `admin@123`; demo mode is labeled. Enter a name, description, price, image and stock, check **Published**, and create the product. It appears in `/shop` immediately. Drafts are hidden from the public shop. Use stock 0 for unavailable sizes. The editor includes S, M, L, XL and ONE SIZE.

Product images can be HTTPS URLs or JPEG/PNG/WebP uploads up to 2 MB. Demo uploads and catalogue edits are stored in this browser's local storage; they are not shared between customers or devices. If browser storage is full, save errors are displayed without discarding the form. Reset Demo restores the original sample catalogue after confirmation. The bag also persists locally, independently of catalogue resets.

## Connect Supabase

This checkout defaults to CROWNETIC’s project through `site-config.js`. A publishable key is designed to be bundled in the browser; RLS and admin membership enforce access. To configure another project or review the setup:

1. Create or choose your Supabase project.
2. Open **SQL Editor → New query**, paste the entire [supabase/setup.sql](supabase/setup.sql) file and run it as `postgres`. It combines the catalogue, product photography and customer rewards setup. It can be rerun against this project's existing schema without duplicate-table/policy/function errors and preserves stored rows. It refreshes the named application policies, product functions, and public `product-images` bucket settings. Expect `CROWNETIC database setup complete`. The current numbered `001`–`003` scripts are also rerunnable if you prefer the separate steps; use their latest versions in order. Older copies may still raise “already exists” errors. Each corrected numbered script returns its own completion message. An unrelated or differently shaped schema still requires review.
3. Create an administrator account using **Supabase → Authentication → Users → Add user**. Set the password there; do not share or commit it. For your manually created owner account you can enable **Auto Confirm User**, or complete email verification through the configured provider.
4. Open [supabase/grant_admin.sql](supabase/grant_admin.sql), replace `YOUR_ADMIN_EMAIL_HERE` with that verified account's email, and run it in SQL Editor as `postgres`. It refuses missing, unconfirmed or ambiguous accounts, preserves existing admins, and returns **Admin access enabled**. The generic file intentionally contains no personal email.

5. The existing public connection is in `site-config.js`. To override it, copy `.env.example` to `.env.local` and set both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from your project. Explicitly leaving both empty selects local demo mode. These are browser-safe public settings. **Never put a service-role key in the frontend.** Restart Vite after changing them.
6. Open `/admin`, sign in and create products. A new backend starts empty: local demo edits are not automatically migrated. Upload images or provide HTTPS URLs for connected products; local `/assets/` URLs are demo-only.

Both settings must be supplied together. Remote failures show errors instead of silently switching to a sample catalogue. Row-level security restricts product management to allowlisted admins. Public readers see only published products and their variants. The storage bucket is public: all uploaded images, including those intended for draft products, are public assets. Do not upload confidential content.

The project URL and public publishable key are configured. Live read-only checks on 16 October 2026 reached Supabase successfully: email signup and email confirmation are enabled, the published catalogue query (including product photos, reward points and size/stock relation) returns HTTP 200 with no published items, and anonymous requests to admin memberships, customer profiles and rewards are denied with HTTP 401. No real signups, verification emails, or database writes were performed during these checks. SMTP delivery and signed-in account/admin operations still require live verification. Before launch, verify sign-in, customer isolation, product publishing/saves and image upload permissions against the actual project.

## Payments and shipping

Checkout is a simulation: no money is charged, no order is persisted, stock is not reserved, and no delivery is arranged. Use fictional example contact details. The form does not request card details or persist customer information. Shipping is an illustrative RM 0.00. Cards, FPX and DuitNow are not integrated. A real launch needs a selected payment provider, server-side payment creation, verified webhooks, order storage, shipping rates and stock reservation.

## Validation

```sh
npm test
npm run build
npm run test:browser
```

Browser tests use `/usr/bin/chromium` when present. Else run `npx playwright install chromium` and set `CHROMIUM_PATH` to the installed Chrome executable, or adjust the launch settings in `playwright.config.js`. Browser tests cover admin publishing, draft visibility, bag persistence, simulated checkout, corrupt storage recovery and a 390px layout. The test server builds and serves an isolated demo in `.test-site`, and the browser fixture blocks/fails any attempt to contact the real Supabase project. Email-verification tests use a mocked project. Tests do not validate the live Supabase project.

`npm run preview` serves the production build. The bundled sample uses hash routes and needs no server rewrite rules. This repository has not been deployed.

## Homepage reflective products

Homepage product images use React Bits' exact JS-CSS `ReflectiveCard` component, with white tint, metalness 1, roughness 0.3, blur 6, shine 1 and glare 0.5. The existing product content is passed through `children`; the example personal ID is not shown. Webcam access is disabled. `public/videos/reflection.mp4` is a generated abstract light-sweep clip that supplies the reflection and can be replaced with your own video. Hover a homepage item to see the tilt and glare; reduced-motion preferences disable tilt. Shop, product and admin pages keep their original layout.

The upstream JSX/CSS and license are in `components/ReflectiveCard`; the integration and presentation overrides are in `components/home-product-effects.js` and `.css`. React is bundled into the sample HTML, so opening the sample still requires no npm installation. Rebuild after source changes. See the component README for source provenance and dependency versions.

## Midnight theme and ScrollExpand campaign

The sample now uses a black background, light wordmark, readable dark controls and gently rounded images, cards and buttons. The homepage campaign uses the complete JavaScript/CSS `ScrollExpand` source supplied in the user's pasted instructions, stored in `components/ScrollExpand`. Integration is in `components/home-scroll-effect.jsx`.

The campaign follows page scrolling, expands from a rounded frame, fades the opening headline and reveals the collection action. Reduced motion renders an expanded static campaign and shortens the scroll section. Homepage product reflections continue below the campaign. No additional dependencies were needed beyond the installed React runtime.

## Original ambient light waves

`components/ambient-waves.css` adds original animated silver/violet light waves behind the homepage collection text and button. This is a CSS alternative, **not React Bits Pro Chroma Waves**. The Pro registry remains unavailable until `REACTBITS_LICENSE_KEY` and network access are configured. No license key or Pro source is included in the website. The original background respects reduced-motion preferences.

The original ambient waves now form a fixed, page-wide background on customer routes, rather than a bordered Concrete Archive panel. Admin keeps a plain background. `components.json` configures both official React Bits Pro registries with `Authorization: Bearer ${REACTBITS_LICENSE_KEY}`. The requested shadcn Chroma Waves installation was attempted but stopped due to the missing license variable. Supply that variable securely in environment settings or a local ignored `.env.local`, then run `npx shadcn@latest add @reactbits-starter/chroma-waves-tw`. The license must never use a `VITE_` prefix or appear in client code. The exact licensed component is not yet installed.

## Three-angle product viewer

Open the Core Heavyweight Tee to view the illustrative model from the **left, front and right**. Use angle buttons, previous/next arrows, keyboard arrow keys or a horizontal swipe/drag. These are three photographs, not a live 3D garment renderer. Products without side photography keep their front image and disable missing angles.

Admin now has optional left/right image URLs and uploads; the existing primary image supplies the front view. Replacing the sample photography switches to those uploaded images. Angle photos persist alongside products in local demo storage. For connected Supabase projects, run `supabase/002_product_angles.sql` after `001_catalog.sql` before saving products with the new editor. Read-only Supabase connectivity has been checked; authenticated product saves and uploads remain to be verified live.

## All-item views and reflections

All three existing sample products (tee, cargo trousers and cap) include distinct illustrative left/front/right images. The same ReflectiveCard effect now wraps homepage cards, shop cards and each large angle viewer. Tilt, shine, keyboard navigation and swipe controls work together; camera capture remains disabled. The pasted component source matches the existing upstream JSX.

For new admin products, supply the main/front photo plus left/right URLs or uploads. Missing photos remain visibly unavailable rather than showing a repeated front image as another angle. Older untouched demo products receive their new sample views automatically; customized angle uploads are preserved.

## Metallic monogram page loading

Page navigation displays the supplied CRWN-style monogram with React Bits MetallicPaint (exact pasted JavaScript/CSS source in `components/MetallicPaint`). Integration is in `components/page-loader.jsx`. The overlay runs briefly while each route loads, cleans up its WebGL context afterwards, and uses a static monogram for reduced-motion users or if WebGL fails. Product quantity and editor updates do not force another page-loading animation.

The Left / Front / Right text-button row has been removed. Product angles still work with the previous/next arrows, keyboard arrows and swipes. The current-angle label remains available for orientation and screen readers.

The loading monogram now uses liquid chrome MetallicPaint instead of electricity. The first load lasts at least 1.5 seconds, and page changes at least 1 second; reduced-motion users get a short static monogram. `components/prepare-monogram.js` keys the existing white backdrop into an in-memory alpha mask for MetallicPaint without altering the source logo. No new dependencies were needed.

## Customer accounts, rewards and languages

The header account icon opens customer login/sign-up, a membership dashboard and profile settings. Customer accounts are separate from the sample admin login. In local demo mode, use fictional details: accounts and points are stored only in this browser, passwords are salted and hashed with PBKDF2, and signing out clears the customer session. This demo storage is not production access control. Connecting Supabase switches customer authentication to Supabase Auth and profiles/history to owner-restricted tables.

Each product earns **100 points per item by default**, configurable in the admin product editor. Points depend on quantity, not money spent. Tiers are Member below 1,000 points; Bronze at 1,000; Gold at 5,000; Platinum at 10,000. Tiers recognize accumulated points; no redemption, discounts or unstated benefits are implemented. Signed-in demo customers earn clearly labeled demo points after sample checkout. Guests earn no points, and no real points are awarded by the connected sample checkout.

The combined `supabase/setup.sql` installs the customer rewards schema along with the catalogue and photography fields. Existing installations may also have applied the original migrations 001, 002 and 003. Customers can update only their own profile and read only their own rewards. Browser roles cannot write reward events or call the award RPC. A trusted server must verify a real paid order before invoking `award_purchase_points`; order references are unique to prevent duplicate awards. Payment/webhook integration and live Supabase verification remain outstanding. No service-role key belongs in the frontend.

The language selector offers **English, Bahasa Melayu, Chinese and Tamil**, remembers the choice and translates customer account screens and key storefront navigation, controls and checkout labels. Brand copy and product content entered by admin remain in their original language; arbitrary automatic translation is not provided. Language changes preserve form inputs. Admin remains primarily English.

Admin access: click Account and use the shared login form. Connected accounts are routed by their Supabase `admin_users` membership. The optional isolated demo accepts `admin@123` / `admin@123`. The public Studio / Admin footer link has been removed. Customer signup remains customer-only.

## Customer email verification with Resend

The connected signup flow requires email confirmation, shows a numeric-code entry screen at `#/verify`, and supports resending with a 60-second browser cooldown. Supabase validates codes, expiry and sending limits. Unconfirmed password logins return to verification; confirmed customers keep normal email/password login. This is signup email ownership verification, not an extra email code on every login. Resend delivers through Supabase custom SMTP, so no Resend API key or SDK is bundled in the website.

Follow [the Resend/Supabase setup guide](docs/email-verification.md) to enable **Confirm email**, configure custom SMTP, and install [the CROWNETIC confirmation email](supabase/templates/confirmation.html) using `{{ .Token }}`. A signup response that grants a session before code confirmation is rejected and signed out as a misconfiguration safeguard. The server-side **Confirm email** setting remains essential. The browser remembers only the pending email and resend time, never the password or verification code.

The local sample remains browser-only and sends no emails. Automated verification uses mocked Supabase responses; real delivery and hosted Auth settings cannot be validated until the project and verified sender are connected. Rotate any API key shared in chat; put the replacement only in the secure Supabase SMTP password field.
