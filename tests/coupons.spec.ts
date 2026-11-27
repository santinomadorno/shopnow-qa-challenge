import { test, expect, type Page } from "@playwright/test";
import { login, resetData } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

async function addMugAndOpenCart(page: Page) {
  // Ceramic mug, $8.35
  await page.goto("/product/1");
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("detail-message")).toBeVisible();
  await page.goto("/cart");
}

async function applyCoupon(page: Page, code: string) {
  await page.getByTestId("coupon-input").fill(code);
  await page.getByTestId("coupon-apply").click();
}

test("[BUG-05] a lowercase coupon code applies the same discount as the uppercase one", async ({ page }) => {
  await addMugAndOpenCart(page);
  await applyCoupon(page, "flock10");
  await expect(page.getByTestId("coupon-applied")).toBeVisible();
  // 10% of $8.35 = $0.835 -> $0.84
  await expect(page.getByTestId("cart-discount")).toHaveText("-$0.84");
  await expect(page.getByTestId("cart-total")).toHaveText("$7.51");
});

test("[BUG-05] coupon validation API returns the real percent for a lowercase code", async ({ request }) => {
  const res = await request.post("/api/coupons/validate", { data: { code: "flock10" } });
  expect(res.status()).toBe(200);
  expect((await res.json()).percent).toBe(10);
});

test("[BUG-07] a second coupon cannot be applied after reloading the cart", async ({ page }) => {
  await addMugAndOpenCart(page);
  await applyCoupon(page, "FLOCK10");
  await expect(page.getByTestId("coupon-applied")).toHaveCount(1);

  await page.reload();
  await applyCoupon(page, "BIENVENIDA15");

  await expect(page.getByTestId("coupon-error")).toBeVisible();
  await expect(page.getByTestId("coupon-applied")).toHaveCount(1);
});

test("[BUG-07] checkout API rejects more than one coupon per purchase", async ({ page }) => {
  await login(page);
  for (const coupons of [["FLOCK10", "BIENVENIDA15"], ["FLOCK10", "FLOCK10"]]) {
    const res = await page.request.post("/api/checkout", {
      data: {
        items: [{ productId: 1, quantity: 1 }],
        coupons,
        shipping: { name: "Ana Garcia", address: "1234 Corrientes Ave" },
        card: { number: "4242424242424242" },
      },
    });
    expect(res.status(), `coupons ${coupons.join("+")} were accepted`).toBe(400);
  }
});

test("[BUG-12] after emptying the cart a coupon can be applied again to a new purchase", async ({ page }) => {
  await addMugAndOpenCart(page);
  await applyCoupon(page, "FLOCK10");
  await expect(page.getByTestId("coupon-applied")).toBeVisible();

  // Empty the cart (this also drops the coupon) and start a new purchase without reloading.
  await page.getByTestId("cart-remove-1").click();
  await expect(page.getByTestId("cart-empty")).toBeVisible();
  await page.getByTestId("nav-products").click();
  await page.getByTestId("product-link-1").click();
  await page.getByTestId("add-to-cart").click();
  await page.getByTestId("nav-cart").click();

  await applyCoupon(page, "FLOCK10");
  await expect(page.getByTestId("coupon-error")).toHaveCount(0);
  await expect(page.getByTestId("coupon-applied")).toBeVisible();
});
