# Connecting Sole Society to Supabase

The site works without a database (it shows the offline catalogue in `js/products.js`),
but accounts, checkout, order history, saved addresses, a synced wishlist and the
contact form need Supabase. Setup takes about 10 minutes.

## 1. Create the project
1. Sign up at https://supabase.com and create a **new project** (Free plan).
2. Pick the region closest to your customers. For Ireland that's **West EU (Ireland)**.
3. Save the database password somewhere safe. The site never needs it.

## 2. Create the tables
1. In the project, open **SQL Editor → New query**.
2. Paste all of `supabase/schema.sql` and click **Run**.
3. Open another new query, paste all of `supabase/seed.sql` and click **Run**.
   This loads the 23 products, their photos, colours, sizes and the sample reviews.

## 3. Connect the site
1. Open **Project Settings → API** (called **API Keys** on newer projects).
2. Copy the **Project URL** and the public **anon** key (or the **publishable** key,
   starting `sb_publishable_`).
3. Paste them into `js/config.js`:
   ```js
   window.SS_CONFIG = {
     supabaseUrl: "https://YOUR-PROJECT.supabase.co",
     supabaseKey: "YOUR-ANON-OR-PUBLISHABLE-KEY"
   };
   ```
   Never use the **service_role / secret** key here: it bypasses all the security rules.

## 4. Set up sign-in emails
1. **Authentication → URL Configuration**
   - **Site URL**: your live address, e.g. `https://www.your-domain.ie`
   - **Redirect URLs**: add `https://www.your-domain.ie/account.html` and,
     for testing, `http://localhost:8765/account.html`
2. **Authentication → Sign In / Providers → Email**: leave it on, with
   "Confirm email" on, so new customers confirm their address.
3. The free plan's built-in email sender is rate-limited (a few emails an hour) and
   meant for testing. Before launch, add your own SMTP (e.g. Resend, Postmark,
   Brevo) under **Authentication → Emails → SMTP Settings**.

## 5. Test it
Run the site locally (`python3 -m http.server 8765` in the project folder, then open
http://localhost:8765) and:
- browse a listing (products now come from the database),
- register, click the confirmation email, sign in,
- save a few items to the wishlist, then place an order (test mode, no payment),
- check **Table Editor → orders / order_items / addresses / wishlist_items**,
- send a contact message and find it in **contact_messages**.

## Day-to-day
- **Add or edit products**: Table Editor → `products`, then its `product_colours`,
  `product_images` (position 0 is the main photo) and `product_sizes`
  (`stock` is `in`, `low`, `out` or `unknown`). Set `active` to false to hide one.
  Image URLs can be relative (`images/…`, uploaded with the site) or a full https URL,
  for example from a public Supabase Storage bucket.
  Visitors see changes within 5 minutes (the catalogue is cached per browser tab).
- **Orders and messages**: Table Editor → `orders` (with `order_items`) and `contact_messages`.
- **Delivery under €50**: still unknown, so it shows "To be confirmed". When you
  know it, set it in `place_order()` in `schema.sql` (run that function again)
  and in `DELIVERY_UNDER_FREE` in `js/main.js`.

## How it's protected
- Row Level Security is on for every table. The public key can only read active
  products, read and change a signed-in customer's own profile, addresses,
  wishlist and orders, and send contact messages.
- Orders can only be created through the `place_order()` function. It looks
  up every price, size, colour and width in the database, so a visitor can't
  change a price in their browser.
- Passwords are handled entirely by Supabase Auth.

## Free plan limits to know
- A free project **pauses after about a week with no activity**. Restore it from the
  dashboard, or upgrade before running a real shop.
- Limits change, so check https://supabase.com/pricing. A site this size fits easily.

## Payments
Checkout is still test mode: no card details are collected. Real payments (e.g.
Stripe) need a server-side step, such as a Supabase Edge Function, that creates
the payment and marks the order paid. That isn't built yet.
