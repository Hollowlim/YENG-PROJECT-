# Customer email verification with Supabase and Resend

Supabase Auth creates and verifies customer accounts. Resend delivers Supabase's confirmation email through custom SMTP. The browser never calls the Resend API and does not need the Resend SDK or a Resend API key.

The flow verifies an email when the customer signs up. After confirmation, the customer signs in with their email and password. It does not send a new email code on every login.

## 1. Prepare the sending domain

In Resend, add a domain you own and publish the DNS records Resend supplies. Wait for its verification to succeed, then choose a sender address on that verified domain and the sender name **CROWNETIC**. A production sender has not been chosen for this repository. Resend's onboarding/test sender is not suitable for sending to arbitrary customers.

Create a replacement sending API key in Resend. A key shared in a chat should be revoked and replaced. Enter the replacement only into the secure Supabase SMTP password field described below. Do not paste it into JavaScript, a `VITE_` variable, a committed file, or a public hosting setting that is bundled into the frontend.

## 2. Configure Supabase Auth

In the Supabase Dashboard, open **Authentication** and the **Email** provider settings. Keep email signups enabled and enable **Confirm email**. This server setting is required: an unconfirmed account must not receive a normal password-login session. Browser UI alone cannot enforce email ownership.

Under **Authentication → Emails → SMTP Settings**, enable custom SMTP and enter:

| Setting | Value |
| --- | --- |
| Sender email | Your chosen address on the verified Resend domain |
| Sender name | `CROWNETIC` |
| Host | `smtp.resend.com` |
| Port | `465` (TLS) |
| Username | `resend` |
| Password | The replacement Resend API key, entered securely in the Dashboard |

Dashboard section names may change. Review Supabase's authentication email rate limits, OTP expiry, and email OTP length alongside Resend's sending limits. The app's resend cooldown is a usability aid; Supabase must enforce sending limits. Keep production rate limits and abuse protection enabled.

In **Emails → Templates → Confirm signup**, use [confirmation.html](../supabase/templates/confirmation.html) as the HTML body and a subject such as **Your CROWNETIC verification code**. The essential template expression is:

```html
{{ .Token }}
```

Supabase replaces this expression with its one-time numeric code. Leave it intact. This template intentionally uses code entry instead of a confirmation link so customers can return to the existing hash-routed storefront without an authentication callback competing with `#/account` navigation.

Set **Authentication → URL Configuration → Site URL** to the deployed HTTPS storefront URL. Allow only intended development and production callback URLs in **Redirect URLs** for any other auth flows that use links. Never use `file://` as a production callback. If confirmation or password-reset links are introduced later, disable email click tracking/link rewriting for those emails and implement the relevant callback and recovery screens; they are separate from this code-entry flow.

## 3. Connect and build the storefront

Run the complete [supabase/setup.sql](../supabase/setup.sql) in a new SQL Editor query as `postgres`. This combined script handles a fresh database or one already using this project's numbered migrations, preserving stored rows while refreshing named policies and functions. It configures the product-images bucket as public. Run the complete file; expect `CROWNETIC database setup complete`. The latest numbered `001`–`003` files also support reruns, in order; older copies do not. The combined file remains the simplest setup route. Review an unrelated or custom schema first.

Customer email verification itself uses Supabase Auth and requires no additional application table. Database setup does not enable email confirmation or SMTP; configure those Dashboard settings separately.

Copy `.env.example` to the uncommitted `.env.local` file and set these two public browser settings from the same Supabase project:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Never use a Supabase service-role/secret key here. Restart the development server after changing environment settings, or run `npm run build` again before publishing the generated `index.html` and `public` assets. Deploy over HTTPS.

With no Supabase project configured, the existing local sample remains a browser-only demo. It does not send verification emails or claim that a customer's mailbox has been verified.

## Account flow and SDK calls

1. Submit the customer's name, email, and password with `supabase.auth.signUp`. Keep **Confirm email** enabled so the signup response has no authenticated session until verification succeeds.
2. Show the confirmation screen for the submitted email. Do not save the password or the received code in browser storage. The pending email may be retained to resume the screen after navigation.
3. Submit the code to Supabase:

   ```js
   const { data, error } = await supabase.auth.verifyOtp({
     email,
     token: code,
     type: 'email',
   });
   ```

   Show success and open the account dashboard only when Supabase returns a valid session. The SDK persists that session. Invalid, expired, or already-used codes must leave the customer on the confirmation screen.

4. The resend action for an account that has already started signup is:

   ```js
   const { error } = await supabase.auth.resend({
     type: 'signup',
     email,
   });
   ```

   Keep the action disabled while sending and during the displayed cooldown. A server rate-limit response must remain visible and must not be reported as successful delivery. A successful response means the request was accepted, not that the recipient's mail provider delivered it.

5. Confirmed customers use `signInWithPassword({ email, password })`. If Supabase reports `email_not_confirmed`, offer the confirmation screen and a resend action. Never treat an arbitrary login failure as evidence that an email is unconfirmed.

The installed Supabase SDK documents `type: 'email'` for email-code verification. The separate resend API still requires `type: 'signup'` for a signup confirmation. Do not replace this flow with `signInWithOtp` unintentionally: that would introduce passwordless login with different account-creation and resend behavior.

Password recovery is a separate flow. Before enabling a public **Forgot password** action, configure and test its recovery template, redirect allowlist, recovery-session handling, and password-update page. The signup verification screen does not implement password reset.

## Before enabling customer email delivery

- Use an inbox you control to create a new account. Confirm that the email arrives with the correct sender and subject, the code is readable, and SPF/DKIM checks pass. Check spam folders and Resend's delivery logs if it does not arrive.
- Attempt password login before verification. Supabase must reject it. Submit the correct code, confirm the account dashboard opens, then sign out and sign in with the password.
- Test a wrong code, a code after the configured expiry, and reuse of an already-verified code. No failed verification may create a session.
- Test resend cooldown, Supabase rate-limit errors, sending failures, and correcting the email address. Verify which code remains valid after a resend against the project's configured Auth behavior; do not promise that older codes remain valid.
- Refresh the confirmation screen, change languages, and navigate away and back. Keep pending email state without retaining a password or code. Test the form with keyboard and mobile input.
- Test signup with an existing address without exposing account existence unnecessarily. Test two accounts to confirm profile and loyalty records remain isolated by row-level security.
- Revoke any exposed key, confirm the replacement is stored only in the SMTP settings, and inspect the production HTML/JavaScript for accidental secrets. Test sending after rotation.
- Confirm the deployed URL and any recovery callbacks use the correct HTTPS domain. Test the production build against the actual Supabase project, rather than relying on demo-mode tests.

## Validation status and references

Live Supabase configuration and Resend delivery have not been verified in this workspace. No real verification email was sent. Direct requests to the external documentation were blocked by the workspace network proxy during implementation, so the Dashboard labels and current provider limits should be checked against the official documentation when configuring the account. SDK call signatures were checked against the installed `@supabase/auth-js` source.

- [Resend: send with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)
- [Resend SMTP](https://resend.com/docs/smtp)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Supabase resend](https://supabase.com/docs/reference/javascript/auth-resend)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase authentication rate limits](https://supabase.com/docs/guides/auth/rate-limits)
