import { test, expect } from "@playwright/test";
import { resetData } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test("the cart total is calculated correctly", async ({ page }) => {
  await page.goto("/product/1");
  await page.getByTestId("quantity-select").selectOption("2");
  await page.getByTestId("add-to-cart").click();
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line-1")).toBeVisible();
  // 2 x $8.35 = $16.70 (the original version only checked that the total was visible)
  await expect(page.getByTestId("cart-line-total-1")).toHaveText("$16.70");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$16.70");
  await expect(page.getByTestId("cart-total")).toHaveText("$16.70");
});
