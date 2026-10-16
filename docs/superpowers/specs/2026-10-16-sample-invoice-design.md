# Sample checkout and invoice email

The customer wants to rehearse a purchase with **no money charged**, then receive
an invoice by email. This extends the existing simulated checkout. Real gateway
integration is outside this test.

Successful sample payments save a separate immutable sample invoice, clear the
bag only after persistence, and open a receipt that survives refresh. Declined
or cancelled simulations retain the bag and create no invoice or email. A
customer can reopen their own sample invoices from their account. Local guests
can preview a browser-only sample invoice; connected email tests require a
verified signed-in customer.

Invoices contain a unique SAMPLE reference, date, customer and delivery details,
item/size/quantity/price snapshots, MYR totals and zero illustrative shipping.
They prominently say SAMPLE INVOICE, NO PAYMENT COLLECTED, and NOT A TAX INVOICE.
They can be printed/saved as PDF and previewed as an email. No invented seller
address, tax number or actual tax collection is shown.

Connected invoice generation and mail run through an authenticated Supabase
Edge Function. Prices and stock are checked against the server catalogue;
recipient identity comes from verified Auth, never a submitted recipient.
Only the configured Resend account-owner inbox is eligible for this domain-free
email test. The API key stays in function secrets. Provider acceptance is shown
as acceptance, not proof of inbox delivery. Missing setup and provider failures
remain visible; there is no claim that mail was sent when it was not.

Use a separate sample_orders table with owner-only reads and server-only writes.
Samples never enter real sales, stock or loyalty. Existing browser-only demo
points remain illustrative and idempotent. A stable request UUID makes retries
reuse the original invoice. Persist before email; retry the saved invoice using
a stable provider idempotency key, a database send lease and bounded attempts.
Do not automatically retry ambiguous requests after the provider deduplication
window. Limit new samples to ten per customer per day.

This workspace has no usable Resend secret or Supabase deployment credentials.
Implementation and local/mock verification can proceed; live deployment and one
inbox-delivery check require secure backend configuration. Never reuse the old
key exposed in chat. Supabase's built-in Auth mailer cannot send these invoices.
