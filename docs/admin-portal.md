# CROWNNETIC admin portal

Open **Account**, sign in with your verified Supabase admin account, and enter the admin portal. The account must have an explicit membership in `public.admin_users`; ordinary customer accounts cannot manage the store. Admin operations use authenticated database RPCs that check this membership on the server. The browser uses the public publishable key and the signed-in session, never a Supabase service-role key or Auth admin API.

## Database setup

- **Existing installation:** paste the complete [004_admin_portal.sql](../supabase/004_admin_portal.sql) into Supabase **SQL Editor**, run it as `postgres`, and refresh the website. Run it after the existing catalogue/customer-rewards setup. The migration supports reruns and preserves existing rows.
- **Fresh installation:** run the complete [setup.sql](../supabase/setup.sql), which includes the admin portal alongside the catalogue, photography and customer rewards schema. Then create/verify the owner account and follow [grant_admin.sql](../supabase/grant_admin.sql) to grant access.

The migration has **not been applied to the live Supabase project from this workspace**. It requires an owner to run the SQL in the Dashboard. If the new migration is missing, Product Room remains usable and the other admin sections show setup instructions. SQL setup does not configure email delivery or a payment gateway.

## What each section does

| Section | Use |
| --- | --- |
| Overview | Review the store's customer, recorded-sale and rewards information. |
| Product Room | Add/edit products, photography, stock and each item's reward points. |
| Customers | Search verified customer accounts and open their purchase and points details. Accounts appear even before a customer saves a profile. |
| Orders | Record paid Instagram, offline or website sales with multiple items; update fulfillment and tracking; record a full refund once. |
| Points | Add or deduct points with a reason. |
| Activity | Review the administrator, time and reason associated with recorded actions. |

These orders are **manual records of sales an administrator says have been paid**. Choosing a website sales channel does not connect the sample storefront checkout to these records. No payment gateway verifies or collects money, and no payment or refund is processed by this portal. Confirm payments externally before recording them. Stock remains managed separately in Product Room; recording a sale does not reserve, deduct or restore it automatically.

## Record a sale and check customer rewards

1. Confirm the customer's payment through your actual sales/payment channel.
2. In Orders, choose the customer, select the sales channel, enter a unique sale reference, and add the purchased products, sizes and quantities. Review the displayed prices and points before saving.
3. Save the paid-sale record. Product names, prices and earned points are kept as snapshots, so future catalogue changes do not rewrite this purchase's history. Unique sale references and request IDs prevent retries from awarding the same sale's points again.
4. Open that customer in Customers to check the purchase and points history. The customer can also sign in to their own dashboard to view their own purchases and signed points entries. Other customers cannot view those records.
5. As the order progresses, update its fulfillment status and tracking information. This stores the information; it does not buy postage or arrange delivery.

Each product earns **100 points per item by default**, with an override in Product Room. Points depend on quantity rather than money spent. Membership is Member below 1,000 points, Bronze at **1,000**, Gold at **5,000**, and Platinum at **10,000**. No redemption, discount or other tier benefits are assumed.

## Adjust points or record a refund

Use Points to add or deduct points, entering a reason that explains the change. Manual deductions cannot take a customer's balance below zero. Changes are audited; use a correcting entry if a previous manual adjustment was wrong.

A full refund can be recorded **once per sale**. It reverses the points originally awarded for that sale, using the saved snapshot rather than today's product settings. It does not send money back: complete the financial refund through the original payment channel separately. Refund reversal can leave the points balance negative when later deductions have already reduced it. A negative balance remains visible and has Member status; the refund is not silently skipped or reduced to preserve zero. A refunded sale's points cannot be reversed a second time.

## Try the browser-only sample

```sh
node scripts/build-sample.js --demo --out-dir .test-site
```

Open `.test-site/index.html` with its `public` folder alongside it. Alternatively, explicitly leave both Supabase public environment settings empty and rebuild. This selects local demo mode; the connected website does not accept the fixed demo administrator credentials.

Create a fictional customer through the storefront **first**, then sign out and use Account to log in with username **`admin@123`** and password **`admin@123`**. Customers, sales, adjustments and audit records in this sample are stored in the same browser; they are not shared across devices or uploaded to Supabase. Use sample details. Switching accounts lets you check both the seller and customer views.

A useful rehearsal is to record two items for the test customer, check the earned points and tier, change the product's price/points and verify that the old sale stays unchanged, add an adjustment with a reason, update tracking, and record a refund. Confirm that repeating the sale reference or refund does not award/reverse points twice. Check a second customer sees only their own information.

## Before using live customer records

Validation for this change: 30 Node tests and 180 assertions against disposable PostgreSQL 17 passed. All 27 browser cases passed across the main run and targeted reruns; two animation-heavy storefront cases initially timed out with two workers and passed sequentially. The browser runner now defaults to one worker. Browser Auth/RPC checks use mocks or local demo storage and block access to the real project.

Run the migration in the intended Supabase project, verify the owner account's admin membership, and rebuild/deploy the current website. Test an admin and a normal customer against that actual project: customer search, saving a paid record, customer isolation, signed points, duplicate protection, fulfillment and refunds. Local automated/demo checks do not prove that the live migration is installed or that these authenticated operations work there.

Configure customer confirmation email separately using [the email setup guide](email-verification.md). A public launch still needs hosted HTTPS, actual payment/order integration, shipping rules and the store's customer policies. The existing sample checkout remains a simulation and creates no real purchase or payment.
