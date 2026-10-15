# CROWNETIC sample design

## Goal and approved visual direction

Create a premium streetwear shopping sample for Malaysian customers, with MYR prices and an admin interface for managing products. The user selected the first displayed concept: Concrete Archive, an ivory editorial layout with a very large black CROWNETIC wordmark, concrete fashion photography, and generous spacing.

Visual reference: `/workspace/generated_images/exec-7981d7fc-1a25-475b-a8d4-1a7d086ded69.png`. The image is a visual target, not the page implementation. Keep the original generated image and copy any needed assets into the application. Use original sample products and clearly describe their images as illustrative. The TikTok references were inaccessible; the user authorized an original direction instead.

The sample must demonstrate browsing products, choosing a size, managing a bag, completing a clearly simulated checkout, and adding a product through the admin editor so that it appears in the storefront.

## Scope and approach

Use React, TypeScript, and Vite for a responsive sample. Supabase is the intended persistent backend. Include an explicit local demo mode so the full sample works before a Supabase project is connected. Supabase credentials and a payment provider have not been supplied.

This balances three possible approaches: a static visual mockup cannot demonstrate admin publishing; a fully connected store needs external configuration before it works; an interactive sample with a shared demo/Supabase data interface demonstrates the requested flows immediately and supports later connection. The third approach is recommended.

## Storefront

- Home: oversized typographic wordmark, slim navigation, editorial campaign hero, collection call to action, featured products, and restrained footer.
- Shop: responsive product grid with category filtering and useful empty states.
- Product: images, MYR price, description, available sizes, quantity, and add-to-bag action. Require an available size before adding.
- Bag: update quantity, remove items, and calculate the subtotal from integer sen amounts. Persist the bag locally across refreshes. Recheck product availability before checkout.
- Sample checkout: collect only fictional/example customer information, show an order summary, and return a clearly marked simulated confirmation. Do not collect payment-card details, charge money, claim real payment success, or imply orders are being fulfilled. Show that shipping is illustrative rather than a configured delivery service.
- About: a short brand introduction without invented claims about manufacturing or sustainability.

Use the reference's warm ivory, black typography, sharp corners, light dividers, and large photography. Create a responsive mobile arrangement with legible headings and two-column product tiles where space permits. Provide keyboard access, visible focus, labeled controls, image descriptions, sufficient contrast, and reduced-motion support. Use a temporary wordmark until the user supplies the final logo.

## Admin

Provide a distinct `/admin` area with a product list and create/edit form. Fields: name, category, MYR price, description, image, sizes, stock per size, and draft/published status. Validate required fields and nonnegative prices and stock. Show save errors without discarding edits. Products published through admin become visible in the storefront; drafts remain hidden.

Demo mode is visibly labeled and has an accessible demo entry, not a pretend secure login. Demo edits persist in local storage and can be reset to seed products. Real connected mode requires Supabase email/password authentication and an administrator allowlist enforced by database policies. A hidden link or client-side role check is not an authorization boundary.

## Supabase integration

Keep catalogue access behind one repository interface with local and Supabase implementations. Select connected mode only when the project URL and publishable key are configured. An unavailable configured backend must produce a useful error, rather than silently displaying demo data.

Supply SQL migrations and connection instructions for products, product variants, administrator membership, and product-image storage. Public users may read published products and their variants. Authorized administrators may manage catalogue rows and upload images. Use row-level security and storage policies; ordinary authenticated accounts cannot publish products or grant themselves admin access. Bootstrap the first administrator manually through documented privileged SQL. Never expose a service-role key in the browser.

Use integer sen for prices. Product variants hold size and stock. Use safe image URLs in demo mode and storage uploads in connected mode. This sample does not implement real order storage, reservation, payment processing, or fulfillment.

## Payment boundary

The market is Malaysia and the currency is MYR. The payment provider and required methods are not selected. Keep the sample checkout simulated. Real cards, FPX, and DuitNow require a later provider decision, server-side payment creation, trusted webhook verification, and paid-order persistence. Do not imply these methods are enabled in this sample.

## Validation and delivery

Verify a production build and TypeScript checks. Test meaningful behaviour: size selection, bag quantity and totals, validation of product edits, and publishing an admin-created item to the storefront. Exercise the running app through browser automation if available, including narrow-screen layout and the simulated checkout. If browser access is unavailable, report the visual verification limitation explicitly.

Connected Supabase operations and policy enforcement can only be claimed verified after a real project is configured and exercised. Deliver the runnable local sample, setup instructions, Supabase migrations, and a clear account of what is simulated versus connected. Do not deploy or create external services as part of this sample.
