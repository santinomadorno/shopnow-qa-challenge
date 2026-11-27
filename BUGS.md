# Bugs found

Sorted by priority (most important first). All reproduced on a fresh install (`npm run reset`) with the seed users, through the UI and/or the documented API.
Full request/response evidence for the API-reproducible bugs (BUG-01/02/03/04/05/07/09/10/11): [`evidence/api-evidence.md`](evidence/api-evidence.md).
Seed data used as the source for expected values: Ceramic mug #1 ($8.35, stock 25), Bluetooth headphones #2 ($49.99, stock 3), Basic T-shirt #3 ($14.35), Ergonomic chair #8 ($129.00, stock 2). Order #3 belongs to Bruno.

| ID | Title | Source | Severity | Priority |
|---|---|---|---|---|
| BUG-01 | Orders over $100 show "payment failed" but the card is charged; retrying charges twice | Report 1 | Critical | P1 |
| BUG-02 | Any logged-in user can read any other user's order (name + address) | Found by me | Critical | P1 |
| BUG-03 | Checkout API accepts negative and zero quantities (negative / $0 orders) | Found by me | Critical | P1 |
| BUG-04 | Checkout does not check stock: overselling and negative stock | Found by me | High | P1 |
| BUG-05 | Lowercase coupon code is accepted but gives 0% discount | Report 2 | High | P1 |
| BUG-06 | Products added with "Add" from the catalog disappear after reloading | Report 3 | High | P2 |
| BUG-07 | More than one coupon per purchase can be applied (UI after reload, and API) | Found by me | High | P2 |
| BUG-08 | Adding the same product twice from the detail page exceeds the stock in the cart | Found by me | Medium | P2 |
| BUG-09 | Line totals lose a cent (3 × $8.35 shows $25.04) | Found by me | Medium | P2 |
| BUG-10 | Late-night orders show the next day's date (date in UTC, time in Argentina) | Found by me | Medium | P3 |
| BUG-11 | Shipping name/address with accents, ñ or º are rejected with a misleading error | Found by me | Medium | P3 |
| BUG-12 | After emptying the cart, no coupon can be applied until the page is reloaded | Found by me | Low | P3 |

---

## BUG-01 — Orders over $100 show "payment failed" but the card is charged; retrying charges twice

- **Source:** user report 1 ("Sometimes when I pay it says it failed, but I still got charged")
- **Type:** Integration / Logic
- **Severity:** Critical — money is taken while the user is told it wasn't; the natural reaction (retry) charges again.
- **Priority:** P1 — affects every order above $100, i.e. the highest-value sales. Generates chargebacks and support load.
- **Preconditions:** logged in as Ana. Cart with a total > $100 (e.g. 1 × Ergonomic chair, $129.00).
- **Steps to reproduce:**
  1. Open `/product/8`, add 1 unit, go to Checkout.
  2. Fill name `Ana Garcia`, address `1234 Corrientes Ave`, card `4242424242424242`, click **Pay**.
  3. After ~3 s the page shows "We couldn't process your payment. Please try again." The cart is still full.
  4. Open **My payments** / **My orders**.
  5. (Optional) Go back and click **Pay** again.
- **Expected result:** the UI waits for the processor (the API doc says it "may take a few seconds") and shows the order confirmation. If the payment really fails, no order and no payment are created.
- **Actual result:** a new order and an **approved** payment of $129.00 exist and the stock was decremented, but the user saw an error. Step 5 creates a second order and a second charge. Orders ≤ $100 work, which is why users say "sometimes".
- **Evidence:** `POST /api/checkout` with a $129 cart answers `201` after ~4.0 s; the UI gives up at 3.0 s. Test output: `user saw 'payment failed' but was charged — Expected: 2, Received: 3` payments.
- **Automated test:** `tests/checkout.spec.ts` → `[BUG-01] …` (2 tests)
- **Root cause in the code (optional):** `app/web/src/pages/Checkout.tsx` aborts the request after `PAYMENT_TIMEOUT_MS = 3000`, while `/checkout` in `app/server/api.ts` waits `4000 ms` when `total > 100` and then creates the order anyway. The client treats its own timeout as a payment failure and keeps the cart. There's no idempotency key, so a retry is a new charge.

## BUG-02 — Any logged-in user can read any other user's order

- **Source:** found by me
- **Type:** Security
- **Severity:** Critical — exposes personal data (full name, shipping address, purchases) of other customers.
- **Priority:** P1 — trivially exploitable by changing the number in the URL (order IDs are sequential).
- **Preconditions:** logged in as Ana. Order #3 belongs to Bruno.
- **Steps to reproduce:**
  1. Log in as `ana@shopnow.test`.
  2. Open `/orders/3` (or `GET /api/orders/3`).
- **Expected result:** `404` (or `403`); the UI shows an error and no order data.
- **Actual result:** `200` with Bruno's order and the page renders it: `"shipping":{"name":"Bruno Diaz","address":"742 Evergreen St, Rosario"}`, items and total.
- **Evidence:** `GET /api/orders/3` with Ana's cookie → `{"id":3,"userId":2,…,"shipping":{"name":"Bruno Diaz","address":"742 Evergreen St, Rosario"},…}`
- **Automated test:** `tests/orders.spec.ts` → `[BUG-02] …` (API + UI)
- **Root cause in the code (optional):** `GET /orders/:id` in `app/server/api.ts` looks the order up by id only and never compares `order.userId` with the logged-in user (the list endpoint does).

## BUG-03 — Checkout API accepts negative and zero quantities

- **Source:** found by me
- **Type:** Security / Logic
- **Severity:** Critical — a user can lower the price of an order (even below $0) or create $0 orders.
- **Priority:** P1 — only needs a modified request to the documented API.
- **Preconditions:** logged in.
- **Steps to reproduce:**
  1. `POST /api/checkout` with `items: [{productId:1, quantity:1}, {productId:3, quantity:-1}]`, valid shipping and card `4242424242424242`.
  2. Repeat with `quantity: 0`.
- **Expected result:** `400 invalid data`. Quantities must be integers ≥ 1 (spec: "minimum 1").
- **Actual result:** `201`. With `-1`: `subtotal: -6, total: -6` and an **approved payment of -$6.00**; the T-shirt stock goes **up**. With `0`: an order and an approved payment of $0.00.
- **Evidence:** response `{"subtotal":-6,"discount":0,"total":-6,…}`; `GET /api/payments` lists `"amount":-6,"status":"approved"`.
- **Automated test:** `tests/checkout.spec.ts` → `[BUG-03] …`
- **Root cause in the code (optional):** `/checkout` in `app/server/api.ts` does `Number(item.quantity)` with no validation (decimals and `NaN` also pass). The UI limits the quantity; the server doesn't.

## BUG-04 — Checkout does not check stock: overselling and negative stock

- **Source:** found by me
- **Type:** Logic / Data
- **Severity:** High — the store sells products it doesn't have; stock data becomes negative.
- **Priority:** P1 — spec rule "users can't buy more than the available stock"; the API contract documents `409 out of stock`, which is never returned.
- **Preconditions:** logged in. Ergonomic chair (#8) has stock 2.
- **Steps to reproduce:**
  1. `POST /api/checkout` with `items: [{productId:8, quantity:5}]`, valid data.
  2. `GET /api/products/8`.
  3. Same from the UI: with BUG-08 the cart holds more than the stock and checkout accepts it; also two users buying the last units at the same time.
- **Expected result:** `409` and stock unchanged (2).
- **Actual result:** `201`, order of 5 chairs ($645.00) and stock `-3`.
- **Automated test:** `tests/checkout.spec.ts` → `[BUG-04] …`
- **Root cause in the code (optional):** `/checkout` in `app/server/api.ts` never compares `quantity` with `product.stock` and decrements blindly.

## BUG-05 — Lowercase coupon code is accepted but gives 0% discount

- **Source:** user report 2 ("The discount code is accepted but the price doesn't change")
- **Type:** Logic
- **Severity:** High — the user sees "Coupon applied" and pays full price; the spec explicitly says codes are case-insensitive.
- **Priority:** P1 — affects any user who types the code in lowercase (very common on mobile).
- **Preconditions:** any user, 1 × Ceramic mug ($8.35) in the cart.
- **Steps to reproduce:**
  1. Go to Cart, type `flock10`, click **Apply**.
- **Expected result:** coupon applied at 10%: Discount `-$0.84`, Total `$7.51` (same as `FLOCK10`).
- **Actual result:** "Coupon flock10 applied (0%)", Discount `-$0.00`, Total `$8.35`. The order is also created with 0% discount. Same for `Flock10`, `bienvenida15`, etc.
- **Evidence:** `POST /api/coupons/validate {"code":"flock10"}` → `{"code":"flock10","percent":0}`; with `FLOCK10` → `percent: 10`.
- **Automated test:** `tests/coupons.spec.ts` → `[BUG-05] …` (UI + API)
- **Root cause in the code (optional):** `findCoupon` in `app/server/api.ts` finds the key case-insensitively but then reads `COUPONS[typed]` (the text as typed) instead of `COUPONS[key]`, so it falls back to `?? 0`. It also returns the typed code instead of the canonical one.

## BUG-06 — Products added with "Add" from the catalog disappear after reloading

- **Source:** user report 3 ("Some things disappear from my cart when I reload the page")
- **Type:** Logic / Data
- **Severity:** High — lost cart items mean lost sales; the spec says the cart persists even if the browser is closed.
- **Priority:** P2 — the catalog "Add" button is the main add-to-cart path, but the user can re-add.
- **Preconditions:** empty cart.
- **Steps to reproduce:**
  1. On the catalog, click **Add** on Basic T-shirt. The header shows `Cart (1)`.
  2. Reload the page (or close and reopen the browser).
- **Expected result:** the T-shirt is still in the cart.
- **Actual result:** the cart is empty. It's "some things" because products added from the detail page **do** persist: add the mug from its detail page, then the T-shirt from the catalog, reload → the mug stays, the T-shirt is gone.
- **Automated test:** `tests/cart-persistence.spec.ts` → `[BUG-06] …` (2 tests)
- **Root cause in the code (optional):** `app/web/src/pages/Catalog.tsx` calls `cart.setItems(...)` directly instead of `cart.add(...)`, which skips `writeStoredCart` (localStorage).

## BUG-07 — More than one coupon per purchase can be applied

- **Source:** found by me
- **Type:** Logic
- **Severity:** High — direct revenue loss (FLOCK10 + BIENVENIDA15 = 25% off; the same coupon twice = 20%).
- **Priority:** P2 — spec says "only one per purchase".
- **Preconditions:** mug in the cart.
- **Steps to reproduce (UI):**
  1. In Cart apply `FLOCK10` → applied.
  2. Reload the page.
  3. Apply `BIENVENIDA15`.
- **Steps to reproduce (API):** `POST /api/checkout` with `coupons: ["FLOCK10","BIENVENIDA15"]` or `["FLOCK10","FLOCK10"]`.
- **Expected result:** UI: error "Only one coupon can be used per purchase." API: `400`.
- **Actual result:** UI: both coupons are listed and both discounts apply (25%). API: `201` with discount `$2.09` (25% of $8.35) or `$1.68` (20%, same code twice).
- **Automated test:** `tests/coupons.spec.ts` → `[BUG-07] …` (UI + API)
- **Root cause in the code (optional):** `app/web/src/cart.tsx` keeps the "one coupon" rule in `couponAppliedRef`, which starts as `false` on every page load even when a coupon was restored from localStorage. `/checkout` on the server loops over every coupon without limit or dedupe.

## BUG-08 — Adding the same product twice from the detail page exceeds the stock in the cart

- **Source:** found by me
- **Type:** Logic / UI
- **Severity:** Medium — the user builds a cart that can't be fulfilled; combined with BUG-04 it actually gets sold.
- **Priority:** P2.
- **Preconditions:** Bluetooth headphones (#2), stock 3.
- **Steps to reproduce:**
  1. `/product/2`, quantity 3, **Add to cart**.
  2. Quantity 2, **Add to cart** again. Message "Added 2 × Bluetooth headphones to your cart."
  3. Go to Cart.
- **Expected result:** quantity capped at 3, with a message that there's no more stock.
- **Actual result:** the cart holds 5 units (the input has `max=3` but shows 5).
- **Automated test:** `tests/checkout.spec.ts` → `[BUG-08] …`
- **Root cause in the code (optional):** `mergeItem` in `app/web/src/cart.tsx` sums quantities without capping at `stock` (`updateQuantity` does cap).

## BUG-09 — Line totals lose a cent

- **Source:** found by me
- **Type:** Logic
- **Severity:** Medium — wrong amount charged (in the store's disfavour) and totals that don't match price × quantity.
- **Priority:** P2 — small amount per order, but it's a money calculation and it reaches the charged total.
- **Preconditions:** empty cart.
- **Steps to reproduce:**
  1. `/product/1` (Ceramic mug, $8.35), quantity 3, add, go to Cart.
- **Expected result:** line total and total `$25.05`.
- **Actual result:** `$25.04` in cart, checkout, order and payment.
- **Automated test:** `tests/cart-persistence.spec.ts` → `[BUG-09] …`
- **Root cause in the code (optional):** `lineTotal` in `app/shared/money.ts` uses `Math.floor(price * quantity * 100) / 100`; `8.35 * 3 = 25.0499999…` in floating point, so `floor` drops a cent. It should round (or work in integer cents).

## BUG-10 — Late-night orders show the next day's date

- **Source:** found by me
- **Type:** Logic / UI
- **Severity:** Medium — wrong order date for every purchase made between 21:00 and 23:59 Argentina time; confusing for users and support.
- **Priority:** P3 — no money impact.
- **Preconditions:** logged in as Ana. Seed order #2 was created at `2026-10-15T02:30:00Z` = **Oct 14, 23:30** in Buenos Aires (UTC-3).
- **Steps to reproduce:**
  1. **My orders** → look at row #2.
  2. Open order #2.
- **Expected result:** `10/14/2026` in the list and `10/14/2026 · 23:30` in the detail.
- **Actual result:** `10/15/2026` and `10/15/2026 · 23:30` (the next day's date with the previous day's time).
- **Automated test:** `tests/orders.spec.ts` → `[BUG-10] …`
- **Root cause in the code (optional):** `formatOrderDate` in `app/server/api.ts` formats the time in the Argentina time zone but takes the date from `iso.slice(0, 10)`, which is the UTC date.

## BUG-11 — Shipping data with accents, ñ or º is rejected

- **Source:** found by me
- **Type:** Logic / UI
- **Severity:** Medium — blocks checkout for very common Argentine names and addresses (José, Peña, Córdoba, 5º B) and the error doesn't say what's wrong. Workaround: type without accents.
- **Priority:** P3 (higher if most users write in Spanish — question for the PO).
- **Preconditions:** logged in, mug in the cart.
- **Steps to reproduce:**
  1. Checkout with name `José Peña`, address `Av. Córdoba 1234 5º B`, card `4242424242424242`, **Pay**.
- **Expected result:** the order is created.
- **Actual result:** "Please fill in the shipping details." although both fields are filled.
- **Automated test:** `tests/checkout.spec.ts` → `[BUG-11] …`
- **Root cause in the code (optional):** `SAFE_TEXT = /^[A-Za-z0-9 .,#/-]+$/` in `/checkout` (`app/server/api.ts`) only allows ASCII, and reuses the "fill in" message.

## BUG-12 — After emptying the cart, no coupon can be applied until reload

- **Source:** found by me
- **Type:** Logic
- **Severity:** Low — workaround: reload the page.
- **Priority:** P3.
- **Preconditions:** mug in the cart.
- **Steps to reproduce:**
  1. Cart → apply `FLOCK10`.
  2. Click **Remove** on the mug (the cart is empty and the coupon is dropped too).
  3. Without reloading, add the mug again from Products and go to Cart.
  4. Apply `FLOCK10`.
- **Expected result:** coupon applied.
- **Actual result:** "Only one coupon can be used per purchase." although no coupon is shown.
- **Automated test:** `tests/coupons.spec.ts` → `[BUG-12] …`
- **Root cause in the code (optional):** `remove` in `app/web/src/cart.tsx` clears the coupons when the cart becomes empty but doesn't reset `couponAppliedRef`.

---

## Observations (not filed as bugs — need a PO decision)

- **Cart shared between users on the same browser:** the cart lives in localStorage and logout doesn't clear it, so Ana logs out, Bruno logs in and would see Ana's cart (found reading `app/web/src/cart.tsx`; not automated). I assume that's not intended; if the PO confirms the cart belongs to the user, this is a bug (ANALYSIS.md Q4).
- **`GET /api/products?category=home` returns `[]`:** the category filter is case-sensitive while the name search isn't. The UI uses a fixed dropdown, so no user impact today.
- **Dates use `MM/DD/YYYY`** although the spec targets Argentina, where `DD/MM/YYYY` is expected (ANALYSIS.md Q10).
- **Confirmation email** can't be verified locally; the success page says it was sent.
- **Card validation** only checks 16 digits (no Luhn, expiry or CVV), which matches the documented simulator.
- **The team's existing test** `tests/cart.spec.ts` ("the cart total is calculated correctly") only checked that the total was *visible*, so it could never catch a wrong total. I changed it to assert the actual values.
