# Customer email verification with Supabase

Start with **Supabase's built-in email service and its default confirmation link**. A custom domain, Resend account, SMTP credentials, and a customized email template are not required for this limited sample. The website defaults to `emailVerificationMode = 'link'` in `site-config.js`.

Email verification happens when a customer signs up. After confirmation, the customer signs in with their email and password. The website does not send another email code on every login.

## 1. Test the sample with Supabase's default email

1. In **Supabase → Authentication → Sign In / Providers → Email**, keep email signups enabled and enable **Confirm email**. Dashboard labels may vary. This server setting is required: an unconfirmed account must not receive a normal password-login session.
2. Leave **Confirm signup** on its default template containing a confirmation link. Do not replace it with the optional CROWNETIC numeric-code template yet. If that template was already changed to show only `{{ .Token }}`, restore a confirmation-link template before testing link mode; the template and website mode must match.
3. Use an email address belonging to a member of the Supabase project's organization. The built-in mailer sends only to pre-authorized **organization team addresses**, not to every address entered in **Authentication → Users**. Manage organization members in the **Team** settings. Delivery is subject to Supabase's low rate limits and has no production delivery guarantee.
4. Open the website, choose **Account → Create an account**, and sign up with that test address. Open the confirmation email and click its link. Return to the original website and log in with the same email and password.
5. If a message does not arrive, check spam and Supabase Auth logs, confirm the address is an authorized organization-team recipient, and respect the sending limit. A successful request does not prove that an email reached the inbox.

Keep **Confirm email** enabled for customers. Manually creating and auto-confirming your own owner account in Supabase is a separate admin setup step; it does not demonstrate customer email delivery.

### If the email link opens localhost or a page that will not load

Supabase's **Authentication → URL Configuration → Site URL** controls the default destination after confirmation. `localhost` always refers to the device opening the link. For example, a link opened on a phone cannot reach a development server running only on a laptop at `localhost`.

The Supabase confirmation endpoint may verify the email **before** redirecting to that unavailable address. A failed destination page does not necessarily mean verification failed. Return to the original CROWNETIC website and try logging in first. You can also inspect that user's email-confirmation status in Supabase. If the account is already confirmed, do not keep requesting or reusing confirmation links. If it is still unconfirmed, correct the destination and then request a new email.

For development, use a browser-accessible development URL. For a shared sample, a static host's HTTPS URL is enough; you do not need to buy a custom domain. Set **Site URL** to that storefront and allow only intended development/production addresses in **Redirect URLs**. Do not configure `file://` as an Auth redirect. Opening the downloaded `index.html` can still let you return manually and sign in after verification, but a reachable hosted URL provides a smoother email-link experience.

### If Supabase asks you to set up SMTP before editing a template

There are two different messages. **“Set up custom SMTP”** can be a recommendation about the built-in mailer's limits. **“Set up custom SMTP to edit templates”** can be an actual editing restriction.

Current public Studio source applies this restriction to Free projects created on or after **3 June 2026** without configured custom SMTP or an enabled Send Email hook. Older projects and paid plans are exempt in that source. Dashboard rollout and project eligibility determine the actual behavior. The restriction does not mean you must customize a template to test signup: keep the default confirmation-link email and the website's default `link` mode.

## 2. Connect and build the storefront

Run the complete [supabase/setup.sql](../supabase/setup.sql) in a new SQL Editor query as `postgres`. This combined script handles a fresh database or one already using this project's numbered migrations, preserving stored rows while refreshing named policies and functions. It configures the product-images bucket as public. Run the complete file; expect `CROWNETIC database setup complete`. The latest numbered `001`–`003` files also support reruns, in order; older copies do not. Review an unrelated or custom schema first.

Customer email verification uses Supabase Auth and requires no additional application table. Database setup does not configure email confirmation, SMTP, or redirect URLs; those are separate Dashboard settings.

CROWNETIC's public project URL and publishable key are included in `site-config.js`. To use a different project, copy `.env.example` to the uncommitted `.env.local` file and set both public browser settings from that project:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Never use a Supabase service-role/secret key here. Restart the development server after environment changes, or run `npm run build` again before publishing the generated `index.html` and `public` assets. Changing `emailVerificationMode` also requires a rebuild. Deploy the shared website over HTTPS.

For a browser-only sample with no real email requests, build with `node scripts/build-sample.js --demo --out-dir .test-site`, or explicitly override both public settings with empty strings in `.env.local`. Local demo accounts do not send emails or claim that a mailbox has been verified.

## 3. Add Resend for customer delivery when ready

The built-in sender is limited to the project team's test recipients. To send confirmation messages to ordinary customer addresses, configure a suitable custom mail provider such as Resend. For Resend production delivery, add a domain you own, publish its required DNS records, wait for verification, and choose a sender on that verified domain. Resend's onboarding/test sender is not suitable for arbitrary customers.

A key shared in chat should be revoked and replaced. Enter the replacement only in Supabase's secure SMTP password field. Do not put it in JavaScript, a `VITE_` variable, a committed file, or any hosting setting bundled into the frontend. The browser never calls Resend and needs neither its SDK nor its API key.

Under **Authentication → Emails → SMTP Settings**, enable custom SMTP and enter:

| Setting | Value |
| --- | --- |
| Sender email | Your chosen address on the verified Resend domain |
| Sender name | `CROWNETIC` |
| Host | `smtp.resend.com` |
| Port | `465` (TLS) |
| Username | `resend` |
| Password | The replacement Resend API key, entered securely in the Dashboard |

Review Supabase's sending limits and Resend's limits, and test delivery before opening registration to the public. SMTP does not require switching the website away from link verification: you can keep the default link flow with Resend.

### Optional: switch to numeric confirmation codes

Only switch after template editing and delivery are configured. In **Emails → Templates → Confirm signup**, use [confirmation.html](../supabase/templates/confirmation.html) with a subject such as **Your CROWNETIC verification code**. Keep the essential expression intact:

```html
{{ .Token }}
```

Supabase replaces it with a one-time numeric code. Then change the exported `emailVerificationMode` in `site-config.js` from `'link'` to `'code'` and rebuild. The optional `VITE_EMAIL_VERIFICATION_MODE` environment setting takes precedence over `site-config.js`; if it is set, change it to `'code'` or remove it when switching. Restart the development server after environment changes. Verify the configured OTP length and expiry. A default confirmation-link email does not automatically contain the numeric code expected by code mode.

Code verification uses `supabase.auth.verifyOtp({ email, token: code, type: 'email' })`. The website opens the account dashboard only after Supabase returns a confirmed user and valid session. Invalid, expired, or reused codes must not grant access.

## Account and resend behavior

Signup uses `supabase.auth.signUp` with **Confirm email** enabled. The website remembers only the pending address and resend time, never the password or an entered code. A signup response that grants an immediate session is rejected as a configuration safeguard; browser checks do not replace Supabase's server-side confirmation setting.

Resending an existing signup confirmation uses `supabase.auth.resend({ type: 'signup', email })` in either mode. The app's 60-second cooldown is a usability aid; Supabase must enforce actual sending limits. Provider errors remain errors, and an accepted send request is not a delivery guarantee. Try logging in after following a link before requesting another one, particularly if its redirect destination failed.

Confirmed customers use `signInWithPassword({ email, password })`. The `email_not_confirmed` response opens confirmation guidance. Other login failures must not be treated as proof that the email is unconfirmed. Do not replace this flow with `signInWithOtp` unintentionally: that would introduce passwordless login with different behavior.

Password recovery is a separate flow. Before adding a public **Forgot password** action, configure and test its template, redirect allowlist, recovery-session handling, and password-update page. Signup confirmation does not implement password reset.

## Validation before public registration

- With an authorized test inbox, verify that the default link email arrives, login is rejected before confirmation, and password login succeeds after following the link. Test returning to the original site after an unavailable redirect, including opening the email on a phone.
- Check invalid, expired, and already-used confirmation links. Verify resend cooldown and server-rate-limit errors. Do not promise an older link or code remains valid after a resend.
- Refresh the confirmation screen, change languages, and navigate away and back. Confirm that no password or verification code is retained in browser storage.
- Test signup with an existing address without unnecessarily exposing account existence. Test two accounts to confirm profile and reward records remain isolated by RLS.
- Before enabling public recipients, configure the mail provider and verify delivery from the intended sender, including SPF/DKIM and spam handling. If code mode is enabled, test the matching template, a valid code, invalid/expired codes, and confirmed-session requirements.
- Revoke exposed credentials, store replacement SMTP credentials securely, and inspect production HTML/JavaScript for accidental secrets. Confirm the deployed HTTPS URL and any recovery callbacks.

## Validation status and references

Read-only checks reached this project's Supabase API and confirmed that email signup and email confirmation are enabled. Those checks did not create an account, send email, inspect SMTP credentials, or prove delivery. Automated Auth tests use mocked responses. Live email delivery, the project's template-editing eligibility, signed-in account/admin operations, and a complete email-link journey remain to be checked against the actual hosted project.

The built-in mailer limitations and Studio restriction above were checked against Supabase's public documentation/source; Dashboard labels and limits can change.

- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Official SMTP guide source](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-smtp.mdx)
- [Studio template restriction logic](https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/Auth/EmailTemplates/EmailTemplates.utils.ts)
- [Studio template restriction message](https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/Auth/EmailTemplates/CustomEmailTemplateRestrictionAdmonition.tsx)
- [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Supabase resend](https://supabase.com/docs/reference/javascript/auth-resend)
- [Supabase authentication rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Resend: send with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)
- [Resend SMTP](https://resend.com/docs/smtp)
