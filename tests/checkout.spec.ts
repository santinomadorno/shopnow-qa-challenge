import { test, expect, type Page } from "@playwright/test";
import { login, resetData } from "./helpers";

const SHIPPING = { name: "Ana Garcia", address: "1234 Corrientes Ave" };
const CARD_OK = "4242424242424242";

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

async function addFromDetail(page: Page, productId: number, quantity: number) {
  await page.goto(`/product/${productId}`);
  await page.getByTestId("quantity-select").selectOption(String(quantity));
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("detail-message")).toBeVisible();
}

async function payInUi(page: Page, shipping = SHIPPING) {
  await page.goto("/checkout");
  await page.getByTestId("shipping-name").fill(shipping.name);
  await page.getByTestId("shipping-address").fill(shipping.address);
  await page.getByTestId("card-number").fill(CARD_OK);
  await page.getByTestId("pay-button").click();
}

test("[BUG-01] paying an order over $100 shows the confirmation and charges the card exactly once", async ({ page }) => {
  await login(page);
  const before = (await (await page.request.get("/api/payments")).json()).length;

  await addFromDetail(page, 8, 1); // Ergonomic chair, $129.00
  await payInUi(page);

  // The processor takes a few seconds (documented). The UI must wait for it, not report a failure.
  await expect(page.getByTestId("order-success")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("checkout-error")).toHaveCount(0);

  const after = (await (await page.request.get("/api/payments")).json()).length;
  expect(after).toBe(before + 1);
});

test("[BUG-01] a payment reported as failed must not create an order nor a charge", async ({ page }) => {
  await login(page);
  const paymentsBefore = (await (await page.request.get("/api/payments")).json()).length;

  await addFromDetail(page, 8, 1);
  await payInUi(page);
  await expect(page.getByTestId("checkout-error").or(page.getByTestId("order-success"))).toBeVisible({ timeout: 10_000 });

  if (await page.getByTestId("checkout-error").isVisible()) {
    // Give the server time to finish whatever it was doing, then check nothing was charged.
    await page.waitForTimeout(3_000);
    const paymentsAfter = (await (await page.request.get("/api/payments")).json()).length;
    expect(paymentsAfter, "user saw 'payment failed' but was charged").toBe(paymentsBefore);
  }
});

test("[BUG-04] checkout API rejects buying more units than the available stock", async ({ page }) => {
  await login(page);
  const res = await page.request.post("/api/checkout", {
    data: { items: [{ productId: 8, quantity: 3 }], coupons: [], shipping: SHIPPING, card: { number: CARD_OK } },
  });
  expect(res.status()).toBe(409);

  const product = await (await page.request.get("/api/products/8")).json();
  expect(product.stock).toBe(2);
});

test("[BUG-03] checkout API rejects zero or negative quantities", async ({ page }) => {
  await login(page);
  for (const quantity of [-1, 0]) {
    const res = await page.request.post("/api/checkout", {
      data: {
        items: [{ productId: 1, quantity: 1 }, { productId: 3, quantity }],
        coupons: [],
        shipping: SHIPPING,
        card: { number: CARD_OK },
      },
    });
    expect(res.status(), `quantity ${quantity} was accepted`).toBe(400);
  }
});

test("[BUG-11] checkout accepts names and addresses with accents, ñ and º", async ({ page }) => {
  await login(page);
  await addFromDetail(page, 1, 1);
  await payInUi(page, { name: "José Peña", address: "Av. Córdoba 1234 5º B" });
  await expect(page.getByTestId("order-success")).toBeVisible({ timeout: 10_000 });
});

test("[BUG-08] the cart never holds more units than the available stock", async ({ page }) => {
  // Bluetooth headphones: stock 3
  await addFromDetail(page, 2, 3);
  await addFromDetail(page, 2, 2);
  await page.goto("/cart");
  const qty = Number(await page.getByTestId("cart-qty-2").inputValue());
  expect(qty).toBeLessThanOrEqual(3);
});
