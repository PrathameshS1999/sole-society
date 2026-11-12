# Sole Society: static site + Supabase

Plain HTML, CSS and vanilla JS. No frameworks, no build step, no npm. Data lives in
Supabase (Postgres), loaded in the browser via the supabase-js CDN build (pinned 2.45.4). Opens from
`index.html`; deploys by uploading the folder. Relative paths only.
`design-system/`, `supabase/`, `.claude/`, `.mcp.json` and `CLAUDE.md` don't need uploading
(they're tooling and notes, not part of the site).
Code: GitHub, private repo PrathameshS1999/sole-society (branch main). Hosting: Netlify (https://sole-society-shoes.netlify.app),
deploying that repo on every push (netlify.toml: no build, publish the repo root, and
404s for design-system/, supabase/, notes and dotfiles). To publish a change: commit and
`git push`. Netlify rewrites links to pretty URLs (/account), so main.js
normalises page names with `pageOf()`; keep comparisons going through it. `sole-society-netlify.zip` (git-ignored) is only for manual Netlify Drop uploads.
After a new live URL, add it in Supabase → Authentication → URL Configuration.

## Source of truth
`design-system/` holds the design: `index.html` (open it in a browser), `README.md`
(palette and type) and `preview-full-page.png`. Words, prices, colours and components
come from there. Don't invent reviews, prices, client names or statistics, and don't
add sections it doesn't show.

## Design rules (High Street Clean, teal)
- Tokens live at the top of `css/styles.css` (`:root`). Use the variables, not raw hex.
- Action teal `#0E7C7B` (hover `#0A6463`): Add to basket, Checkout, counts, links.
- Sale red `#D7263D`: sale prices, the Sale badge and the Sale nav item only.
- Ink `#0E1A1B`, secondary `#2F3D3E`, muted `#536466`, hairline `#DDE6E6`,
  tile grey `#EFF4F4`, banner `#DCEBEB`, white ground.
- Instrument Sans throughout (Google Fonts): 700 headings, 400–600 body, 14.5px body, tabular figures.
- 4px corners, pill search field, borderless cards separated by space and grey tiles.
- Shadows only on floating layers (search suggestions, basket drawer).
- Tight: 4 product columns on desktop, 2 on phones. Breakpoints are 900px and 640px.

## Pages (19)
- `index.html`: home: banner (photo: product-northpaw-lined-winter-boot-1.jpg), category tiles
  with a product photo and live counts, then rows filled from the data: Top rated, On sale, New in.
- Listings: `women.html`, `men.html`, `kids.html`, `school-shoes.html`, `boots.html`,
  `trainers.html`, `socks.html`, `sale.html`, `womens-boots.html`, `search.html` (`?q=`).
  `main.js` renders the cards and brand filter from the catalogue, then filters, sorts and
  counts them; each page differs only in which filters start ticked.
- `product.html?p=<slug>`: one page renders every product (gallery, colours, sizes, reviews).
- `basket.html`, `checkout.html`, `wishlist.html`, `account.html` (sign in with a "Create an account" link,
  reset password, `#orders`, `#addresses`), `register.html` (create an account, link back to sign in), `help.html` (`#delivery`, `#returns`,
  `#size-guide`, `#faq`, `#contact`), `about.html` (`#privacy`, `#terms`, `#cookies`, `#photo-credits`).

The nav (demo notice, service strip, header, department bar) and the footer (with
the basket drawer and script tags) are **identical on every page**, between the
`SHARED NAV` / `SHARED FOOTER` comments. A change to one means changing all 19 pages.
CSS/JS links carry `?v=…`: bump it on every page when styles.css or a script changes,
or returning visitors may run a stale cached copy.
The current department link is highlighted by JS (`aria-current`), so the markup stays identical.

## Data (Supabase)
- Project ref `dbfaesytgsymemiydqly` (URL is in js/config.js). `.mcp.json` registers the
  Supabase MCP server for Claude Code sessions in this folder; it needs a one-time
  `/mcp` sign-in in a terminal.
- Setup steps for the owner: `supabase/README.md`. Schema, RLS and the `place_order()`
  function: `supabase/schema.sql`. Catalogue seed: `supabase/seed.sql`.
- `js/config.js` holds the project URL and the **public** anon/publishable key only.
  Never the service_role key. Empty config = offline mode.
- Catalogue: tables `products`, `product_colours`, `product_images`, `product_sizes`,
  `reviews`, read in one nested select and cached in sessionStorage for 5 minutes.
  If the database is unset or unreachable, `js/products.js` (same shape) is used instead.
- Accounts: Supabase Auth (email + password, confirm email, reset). `profiles` row made by trigger.
- Wishlist: localStorage, synced to `wishlist_items` when signed in (cleared on sign-out).
- Sign-in is required (when the database is connected) to add to the basket or wishlist and to
  check out: `requireLogin()` sends people to `account.html?reason=…&next=…` and back afterwards.
- Basket: localStorage only, until checkout; cleared on sign-out with the wishlist.
- Orders: only via `rpc('place_order')`, which re-prices everything server-side.
  Guests can check out; signed-in customers see `orders` + `order_items` and `addresses`.
- Contact form inserts into `contact_messages` (insert-only for the public).
- Delivery under €50 is unknown: `DELIVERY_UNDER_FREE` in main.js and `v_fee` in place_order().
- Payments are still test mode: there's no card capture and no payment provider yet.
- Every form is a real `<form>` with named fields and a labelled submit button.

## Catalogue
- 8 products come from the design system (names, prices, ratings, sample reviews).
- 15 more were added on request (sort_order 8–22 in seed.sql). Their names
  and prices are **sample values I made up** using the design's brands and price range,
  and they have **no ratings or reviews** (none were invented). Replace them with real
  products, or confirm them, before going live.

## Assumptions to confirm with the owner
The design system doesn't specify these, so they're placeholders in the data:
- Which departments each product belongs to (`departments` in the products table).
- Sizes for every product except the Burren boot (assumed UK 3–12) and the socks (UK 4–7).
- Colour names, except Chestnut and the socks' "Mixed"; the filter adds Pink and Orange swatches.
- Which products come in Wide (E fit). Only the Burren boot does, as in the design.
- Category-tile and filter counts are live counts of the 23 products, not the design's demo numbers.

## Images
- Product photos are openly licensed images from Wikimedia Commons, Flickr (via Openverse)
  and rawpixel, at 800×800, named `product-<slug>-1.jpg`, `-2.jpg`… (1 is the main photo).
  Most products are a multi-angle set of one shoe (mostly the shop spera.de, CC BY 2.0).
  The touch-fasten school shoe, waterproof hiker and light-up runner have one photo plus
  a close-up crop of it; the socks have one photo. No open multi-angle sets were found for those. They show other makers' shoes, and a few show those
  makers' logos. Credits are in `images/CREDITS.md` and on `about.html#photo-credits`.
  CC BY / BY-SA photos must keep their credit while they're used.
- To swap in a real photo, keep the file name (800×800 JPG), then remove its credit line
  from both places.
- `images/placeholder-banner-seasonal-boots.svg` is still a placeholder (1200×540). The
  headline sits over it, so recheck text contrast after swapping.

## Real details
- Owner link: https://prathameshshinde.com (demo notice and footer).
- Per the design README, products, brands and reviews (tagged "Sample review") are demo data.
