# Test a sample payment and invoice email

The checkout now supports a **successful**, **declined** or **cancelled** sample
payment. No money is charged. Success saves a separate sample invoice, shows
email status, and lets the customer print/save PDF or preview the email. Signed-in
customers can reopen their own samples from their account. Failure retains the
bag. An interrupted request is recovered with its original details and quote.

Samples never enter real paid sales, reduce stock or award real rewards. Existing
browser-only demo points remain illustrative. The invoice says **SAMPLE INVOICE —
NO PAYMENT COLLECTED — NOT A TAX INVOICE**. The email contains the invoice itself;
there is no PDF attachment in this test.

## Enable actual test email in your Supabase project

The code is supplied in this repository; the migration and Edge Function are **not
automatically installed in your live project**. Supabase's signup email/SMTP page
cannot send purchase invoices. No real emails were sent by automated tests.

1. In **Supabase → SQL Editor → New query**, paste all of
   [005_sample_checkout.sql](../supabase/005_sample_checkout.sql) and run it as
   `postgres`. Your current project needs the existing 001–004 setup first. This
   new script is rerunnable and preserves sample rows. Expect **005 complete:
   isolated no-charge sample invoices**.
2. In **Edge Functions → Secrets**, add the values below. Enter the API key there
   directly. Use a new replacement key if an earlier key was exposed in chat.
   Never put these secrets in `site-config.js`, a `VITE_` variable or GitHub.

   | Secret | Value |
   | --- | --- |
   | `RESEND_API_KEY` | Your replacement Resend API key, with permission to send email. |
   | `INVOICE_TEST_RECIPIENT` | The exact email address you used to register your Resend account. |
   | `INVOICE_ALLOWED_ORIGINS` | Comma-separated origins of your storefront, for example `http://localhost:5173,http://127.0.0.1:5173`. If testing by double-clicking `index.html`, explicitly include `null`. Use the actual HTTPS origin when hosted. |

3. In **Edge Functions**, deploy a new function named **`sample-checkout`** using
   the editor. Use **index.js** as the JavaScript entry file and replace its
   example source with the entire ready-to-paste file
   [supabase/sample-checkout.js](../supabase/sample-checkout.js), then deploy.
   Disable the function gateway's **Verify JWT with legacy secret** setting when
   using the project's newer signing keys. The function always verifies the
   supplied access token with Supabase Auth itself and refuses unconfirmed or
   unauthenticated customers; disabling the legacy gateway check does not bypass
   this application authentication.
4. Sign up/verify a customer account using the same email as
   `INVOICE_TEST_RECIPIENT`. Log in as that customer on the updated website. Add
   one published product with stock, open Bag → Sample Checkout, leave
   **Successful sample payment** selected and complete the sample order.
5. Open the saved invoice. Expect **accepted for delivery**, then check that inbox
   and spam folder. In Resend → Emails, inspect the request/delivery result. API
   acceptance alone does not prove inbox delivery. A provider failure keeps the
   invoice; wait a minute and use **Retry invoice email**. After fixing missing
   configuration, retry the saved invoice rather than creating another one.

The server uses **`CROWNNETIC Sample <onboarding@resend.dev>`**. Resend's domain-free
test sender is restricted to its account-owner inbox. Another customer's private
invoice is never forwarded to that owner. Other accounts can save/preview their
sample invoice, but delivery shows **restricted**. A verified sending domain and
a deliberate server change are needed before emailing arbitrary customers.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are normally
provided automatically inside Supabase Edge Functions. Do not copy the privileged
key into the frontend. The function reads catalogue prices itself and writes
through service-only database operations.

### CLI alternative

From the extracted repository, on a machine authenticated to your Supabase account:

```sh
npx supabase login
npx supabase functions deploy sample-checkout --project-ref sfcxzqtthmfmpakobrpa --no-verify-jwt
```

Set the three secrets in the Dashboard as above. The CLI deploys the source entry
and its local imports; the editor uses the generated single-file version. To
refresh that file after source changes:

```sh
npm ci
npm run build:invoice-function
```

## Preview without backend deployment

```sh
node scripts/build-sample.js --demo --out-dir .test-site
```

Open `.test-site/index.html` beside its `public` folder. A guest or sample account
can complete a sample, reopen the receipt after refresh, print/save PDF, and open
**Preview invoice email**. This mode clearly says **No email has been sent**.
It cannot securely send mail from the browser. The connected root build never
silently falls back to this local mode when its backend fails.

## Recovery, privacy and limits

An invoice snapshots the original names, prices, sizes, quantities, billing and
verified recipient. Repeated requests reuse its UUID and snapshot. A lost response
keeps the original form and quote for recovery before another invoice is created.
Bag consumption and the completed request ID are saved together, preserving new
items and preventing duplicate removal after refresh.

Only the invoice's customer can read it through RLS. Customers cannot directly
insert, update, delete or send sample records. The function validates the signed-in
customer again for creation and retry, escapes email content, checks request sizes,
and allows only configured storefront origins.

New invoices are limited to ten per customer per UTC day. Email claims have a
60-second lease/cooldown and five attempts maximum. Provider requests use one stable
idempotency key per invoice; ambiguous attempts older than 23 hours require store
review before another send, keeping within Resend's documented deduplication window.
No automatic delivery webhook or background retry worker is included. Use Resend's
delivery log to confirm actual delivery or investigate a rejection/bounce.

## Verification

Unit and browser tests use local data or a mocked email/function project and block
requests to the real Supabase project. SQL permissions, replay, send leases, quotas,
and isolation are tested in disposable PostgreSQL using
`tests/sql/sample_checkout.py`. Deno checks the actual function entry. A real
inbox check remains necessary after live deployment and secret configuration.

Current local verification: **71 unit tests, 16 distinct browser journeys and 54
PostgreSQL assertions passed**. The combined setup was rerun with existing samples;
invoices and permission restrictions were preserved. Deno checked both the source
entry and generated JavaScript; a running generated function returned the expected
204 preflight, 401 unauthenticated and 403 disallowed-origin responses. No live
database changes or invoice emails were made.
