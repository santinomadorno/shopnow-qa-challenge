# Spec analysis

Scope: `SPEC.md` (cart and checkout) plus `docs/API.md`, which works as the technical contract. Questions are sorted by risk: money and data first, then UX.

## Questions for the PO (prioritized)

1. **What happens when the payment processor is slow or doesn't answer?** The API doc says it "may take a few seconds". How long must the UI wait? If it gives up, what does the user see? Is the order created or not? Can a retry charge twice? (We need an idempotency rule: one cart / one attempt = at most one charge.) → see BUG-01.
2. **When is stock checked and reserved?** When adding to the cart, at checkout, or both? What if the stock runs out between adding and paying? Does the user see a message and the cart is adjusted? → BUG-04, BUG-08.
3. **Coupons: what exactly is "one per purchase"?** Can the same code be used again in later purchases, or once per user? Do coupons expire, have a minimum amount or apply to specific categories? Is the discount rounded per line or on the subtotal, and to how many decimals?
4. **Cart and login:** whose cart is it? If Ana logs out and Bruno logs in on the same browser, should Bruno see Ana's cart? When an anonymous user logs in to pay, does their cart stay? Should the cart follow the user to another device? ("Persists even if the user closes the browser" only covers the same browser.)
5. **What happens to the cart and the coupon after a failed payment** (declined card)? Kept as is? (Assumed: kept.)
6. **Who can see an order?** (Assumed: only its owner; but there's no mention of an admin/support role.) → BUG-02.
7. **Shipping details validation:** which characters are allowed? Argentine names and addresses use accents, ñ, º, apartment/floor. Is there a max length? Is a phone, zip code or city needed? → BUG-11.
8. **Card:** only 16 digits? No expiry date, CVV, holder name, Luhn check, or cards with 15 digits (Amex)? What happens with a declined card: message text, can the user retry with another card?
9. **Confirmation email:** what does it contain, when is it sent (only for approved payments?), and what if sending fails? Not verifiable in this environment.
10. **Date format:** "Argentina time" is defined for the time zone, but not the format. Should it be `DD/MM/YYYY` (Argentine usage) or `MM/DD/YYYY` (as today)? 24h clock?
11. **Currency:** totals are "in dollars" but the business is in Argentina. USD or ARS? Thousands separator `,` or `.`?
12. **Quantity limits:** the detail page lets you choose at most 10 even if the stock is 25. Is there a max per product per order? Can the cart field exceed 10?
13. **Search:** by name only, or also description? Partial match, case- and accent-insensitive (e.g. "camara" finds "cámara")? Do out-of-stock products appear in the list?
14. **"My payments":** should it also show declined payments? Refunds? What columns?
15. **Taxes and shipping cost:** none mentioned. Is the "order total" the final amount charged?

## Ambiguities found

- **"Users can't buy more than the available stock"** doesn't say where it's enforced (detail page, cart, checkout) nor what happens with concurrent purchases.
- **"Minimum 1"** in the cart: what happens if the user types 0, deletes the number, or types a decimal? Remove the line, or reset to 1?
- **"Only one coupon per purchase"** + **"the current one must be removed first"**: unclear whether that refers to the UI only or must also be enforced by the server.
- **"Case-insensitive"**: what code is shown/stored after applying `flock10` — the typed text or the canonical `FLOCK10`?
- **"Percentage of the subtotal"**: rounding rule is not defined (e.g. 10% of $8.35 = $0.835 → $0.83 or $0.84?).
- **"If the user isn't logged in, they must log in before paying"**: where is the user sent after login (back to checkout?), and is the cart kept?
- **"The payment is processed and the order is created"**: order of operations and what happens if one of the two fails (payment OK but order not created, or vice versa).
- **"Totals are shown in dollars with two decimals"**: does it also apply to line totals and unit prices? How should cents be calculated (rounding vs truncating)?
- **"Their orders with date and total"**: sorting is not defined (assumed newest first). "Detail of each one": which fields?
- **"Argentina time"** applies to "dates and times", but **My payments** doesn't show any date at all.
- The API documents `409 out of stock`, but the spec doesn't describe that case in the UI.

## Assumptions I make to move forward

- The API doc is part of the contract: if it says `409 out of stock` or `400 invalid data`, the server must enforce it, not only the UI. Business rules (stock, one coupon, quantity ≥ 1, order ownership) must be validated **on the server**; the UI is not a security boundary.
- A user can only see their own orders and payments.
- A payment shown to the user as "failed" must never result in a charge, and a retry must not create a second charge.
- Coupons are case-insensitive end to end: `flock10` gives exactly the same discount as `FLOCK10`.
- "One coupon per purchase" means one coupon in the cart and one coupon in the order, including the same code twice.
- Amounts are rounded to the nearest cent (half up), never truncated. The line total is `price × quantity` rounded to 2 decimals.
- "Argentina time" (`America/Argentina/Buenos_Aires`, UTC-3) applies to both the date and the time of an order. I keep the current `MM/DD/YYYY` format until the PO answers Q10.
- Shipping name and address must accept Spanish characters (accents, ñ, º).
- After a declined payment, the cart and the coupon are kept so the user can retry.
- The confirmation email and real payment processor can't be verified locally; I only check that the success message is shown for approved payments.
- `npm run reset` / `POST /api/test/reset` restores the seed: I use seed data (prices, stock, order #3 belongs to Bruno) as the source for expected values.
