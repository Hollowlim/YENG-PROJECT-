# Sample purchases, points and invoice emails

Every signed-in customer can complete a **no-charge sample purchase**, earn sample
points and open their own printable invoice. Default rewards are **100 points per
item**; Product Room can override this for each product. Quantity counts. The
account dashboard shows a separate Sample Rewards balance with Member below
1,000, Bronze at 1,000, Gold at 5,000 and Platinum at 10,000 points.

Sample points come from the saved invoice, independently of email delivery. A
retry, refresh or reopened invoice never awards them again. The invoice snapshots
prices and rewards, so later product changes do not rewrite history. Older sample
invoices without a points snapshot stay at zero. Guest browser previews earn zero
account points. Existing local demo membership events remain in their old ledger;
new samples use the separate balance.

These are sample rewards with no cash value. Samples do not become real paid
sales, reduce stock or dispatch goods. The invoice says **SAMPLE INVOICE — NO
PAYMENT COLLECTED — NOT A TAX INVOICE**. It is a demonstration, not a Malaysian
LHDN/MyInvois submission. The email contains the invoice itself; PDF is available
through Print / Save PDF on the website, without an email attachment.

## Set up email for any customer's sample purchase

Use **SendGrid Single Sender Verification** for this test. Unlike Resend's shared
onboarding sender, it does not intentionally limit the recipient to the store
owner. It still requires a verified sender and an account authorized by SendGrid
to send mail, within its current trial/plan limits. It does not guarantee delivery
or remove spam filtering. Free mailbox sender addresses can also encounter DMARC
filtering. Domain authentication is the recommended launch setup.

The repository changes do **not** install SQL, deploy the Edge Function or
configure secrets in your live Supabase project. Automated tests send no mail.

1. Create/access a [SendGrid account](https://app.sendgrid.com/). In **Settings →
   Sender Authentication → Single Sender Verification**, create a sender using
   an inbox you control, complete the required sender details and click the
   verification email. Use the exact verified address in the next step. Do not
   use Resend's `onboarding@resend.dev` address as a SendGrid sender.
2. In **SendGrid → Settings → API Keys**, create a restricted key with **Mail Send**
   permission. Store the key directly in Supabase below; never paste it in chat,
   commit it, or put it in a `VITE_` variable.
3. In **Supabase → SQL Editor → New query**, paste the entire
   [006_sample_rewards.sql](../supabase/006_sample_rewards.sql) and run as
   `postgres`, after the existing 001–004 schema. This **one new query** includes
   sample invoice storage and works whether or not you previously ran 005. It is
   rerunnable and preserves existing rows. Expect **006 complete: isolated SAMPLE invoice points**. Fresh projects can instead run the combined
   [setup.sql](../supabase/setup.sql).
4. In **Supabase → Edge Functions → Secrets**, add:

   | Secret | Value |
   | --- | --- |
   | `INVOICE_EMAIL_PROVIDER` | `sendgrid` |
   | `SENDGRID_API_KEY` | The restricted SendGrid key from step 2. |
   | `INVOICE_FROM_EMAIL` | The exact sender email verified in step 1. |
   | `INVOICE_ALLOWED_ORIGINS` | Comma-separated storefront origins, e.g. `http://localhost:5173,http://127.0.0.1:5173`. For a double-clicked local `index.html`, explicitly include `null`. For hosting, include the actual HTTPS origin without a path. |

5. In **Edge Functions**, deploy a function named **`sample-checkout`**. In the
   editor, use **index.js** as its JavaScript entry and paste the entire generated
   [supabase/sample-checkout.js](../supabase/sample-checkout.js). Redeploy if an
   older version already exists. Disable the gateway's **Verify JWT with legacy
   secret** option for this project's newer signing keys. The function itself
   always verifies the access token with Supabase Auth and requires a confirmed
   customer. It does not permit anonymous purchases or caller-selected recipients.
6. Open the updated website, sign in as a verified customer, add a published item
   with stock, then choose **Bag → Sample Checkout → Successful sample payment →
   Complete sample order**. Check the invoice points and **Account → Sample
   Rewards**. Inspect **SendGrid → Email Activity** and the customer's inbox/spam.
   API acceptance means accepted for delivery, not confirmed inbox receipt.
7. Repeat with a different verified customer. Each customer receives their own
   invoice and sees only their own sample points and history.

The server uses `CROWNNETIC Sample` as the sender name. Supabase supplies
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` automatically
inside deployed functions. Never copy the privileged key into the frontend.
Catalogue prices and reward values are loaded on the server, not trusted from the
browser.

### Let other customers receive signup confirmations too

Invoice delivery and signup confirmation are **separate**. Supabase's default
signup mailer is limited to organization-team addresses. To test with ordinary
customer addresses, configure the same verified SendGrid sender under **Supabase
→ Authentication → Emails → SMTP Settings**:

| Setting | Value |
| --- | --- |
| Sender email | Your exact SendGrid verified sender email |
| Sender name | `CROWNNETIC` |
| Host | `smtp.sendgrid.net` |
| Port | `587` (STARTTLS) |
| Username | `apikey` — this exact word, not your email |
| Password | Your SendGrid API key, entered only in the secure Dashboard field |

Keep **Confirm email** enabled and the default confirmation-link template for the
current website mode. Set Supabase's **Site URL** to a reachable HTTPS storefront;
a free hosting address works for the sample. `localhost` on a phone points to the
phone. See [email verification](email-verification.md) for optional numeric codes
and redirect troubleshooting. Provider approval and Supabase/Auth limits still
apply; test both signup and invoice delivery separately.

### If email fails or is still processing

The invoice and points remain saved. An explicit provider rejection offers **Retry
invoice email**, with at least a minute between attempts and at most five attempts.
Fix the sender, permission, account or configuration error first. Retrying reuses
the same invoice and points.

SendGrid has no supported mail-send idempotency key. If a timeout, server error or
interrupted worker makes acceptance uncertain, automatic sends stop and the
invoice asks the store to review delivery. Check Email Activity and the inbox;
creating another sample to retry can send another invoice. Accepted or uncertain
messages are never automatically resent. There is no delivery webhook/background
worker or customer duplicate-send override in this sample. Store investigation is
required for uncertain sends. A live request may still complete with an accepted
status after the page initially shows processing.

## Existing Resend test setup

The previous owner-inbox test remains available with `INVOICE_EMAIL_PROVIDER=resend`
(or omit that variable), `RESEND_API_KEY` and `INVOICE_TEST_RECIPIENT` set to the
exact email used to register Resend. Keep `INVOICE_ALLOWED_ORIGINS` as above.
The sender is `CROWNNETIC Sample <onboarding@resend.dev>`. Delivery is restricted to
that inbox; another customer's invoice is never forwarded to it. Other customers
still save their own invoice and sample points, with email marked restricted.

Resend retries reuse the same idempotency key for an invoice, within a 23-hour
window. Older uncertain requests, provider changes involving uncertain requests,
and legacy failures without enough delivery metadata require store review before
another send. To use Resend for arbitrary customers later, verify your own sending
domain and deliberately configure the production sender and recipient policy.

## Deploy from the CLI instead

From the extracted repository, on a machine authenticated to Supabase:

```sh
npx supabase login
npx supabase functions deploy sample-checkout --project-ref sfcxzqtthmfmpakobrpa --no-verify-jwt
```

Set the Dashboard secrets above separately. The CLI deploys the source entry and
local imports. To regenerate the editor's single-file JavaScript after edits:

```sh
npm ci
npm run build:invoice-function
```

## Preview without deploying a backend

```sh
node scripts/build-sample.js --demo --out-dir .test-site
```

Open `.test-site/index.html` beside its `public` folder. Fictional sample accounts
can purchase, view sample tiers, reopen invoices and print/save PDF. This mode says
**No email has been sent** and cannot send email from the browser. The connected
root website never silently falls back to local orders when its backend fails.

## Recovery, privacy and verification

A lost checkout response keeps its original request, form and quote for recovery.
Repeated requests reuse the saved invoice. Bag consumption is saved with its
request ID, preserving new additions and preventing duplicate removal.

Owner-only RLS protects invoice reads. Browser roles cannot write sample records
or call service-only RPCs. Creation verifies the customer's current Auth email and
is limited to ten samples per customer per UTC day. Sample records and balances
remain separate from real loyalty events, admin sales and stock.

Unit and browser tests use local data or mocked providers and block real project
requests. Disposable PostgreSQL tests cover migration reruns, old rows, rewards,
permissions, quotas, concurrent sends and uncertain-delivery protection. Deno
checks both the source function and generated JavaScript. A live signup,
purchase, second-account check and inbox check are still required after you
configure and deploy the backend.

References: [Single Sender Verification](https://www.twilio.com/docs/sendgrid/ui/sending-email/sender-verification),
[SendGrid SMTP](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/integrating-with-the-smtp-api),
[Mail Send API](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send).

Local verification for this update: **97 unit tests, 13 distinct browser journeys
and 170 PostgreSQL assertions passed**. Source and generated Edge Function Deno
checks passed; the generated runtime returned expected 204 preflight, 401 unsigned
and 403 disallowed-origin responses. The development server served source.html
successfully. No live database, customer account or email delivery was changed by
these checks.
