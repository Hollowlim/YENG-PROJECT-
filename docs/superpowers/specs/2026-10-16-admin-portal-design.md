# CROWNETIC admin portal

Extend the existing Product Room with Overview, Customers, Orders, Points and Activity. Admins can find verified customers, record paid Instagram/offline/website sales, give or deduct points with a reason, update fulfillment and reverse refunded purchases. Customers see their own purchase snapshots and signed points history. The existing storefront checkout remains a simulation.

Use protected Supabase RPCs with explicit administrator membership checks and fixed search paths. New order/item records retain product names, prices and per-item points at the time of recording. Customer data is restricted to its owner; only administrators may list customers or mutate the ledger. Never expose service-role credentials in browser code. A new rerunnable `004_admin_portal.sql` installs these capabilities; fresh combined setup includes them. Missing setup must leave Product Room usable and explain the required migration.

The optional local demo uses the existing registered browser accounts and one shared storage document. Each operation validates before a single write and requires the demo admin session. No automatic fake customer or payment records are created.

Record sale accepts a unique reference, request UUID, customer, channel and 1–100 product/size lines with quantities 1–9,999. Current catalogue values determine the total and reward, defaulting to 100 points per item. Manual records do not deduct stock; stock is managed in Product Room. Retrying a request cannot award twice; reusing it with different input is rejected. All totals fit PostgreSQL integer bounds.

Manual adjustments are nonzero signed integers up to 100,000 in magnitude, require a 3–500 character reason and cannot make the balance negative. Refunds reverse the stored original reward once and may produce a negative balance after earlier deductions. Tiers use net points: Member below 1,000, Bronze 1,000, Gold 5,000, Platinum 10,000; a negative balance remains Member with 0% progress. Fulfillment is unfulfilled/processing/shipped/delivered, applies only to paid records, and accepts optional tracking up to 200 characters. Admin actions retain actor, time, customer, reference and reason.

Validate pure ledger behavior and idempotency, actual PostgreSQL privileges/RLS and transactions, and complete browser flows covering admin/customer views, refunds, persistence, isolation and mobile layout. No automated test sends real email or writes to the live Supabase project. This work does not configure payment processing or automatically apply SQL to the hosted project.
