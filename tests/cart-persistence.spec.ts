import { test, expect } from "@playwright/test";
import { resetData } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test("[BUG-06] a product added from the catalog is still in the cart after reloading", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("quick-add-3").click();
  await expect(page.getByTestId("catalog-message")).toBeVisible();

  await page.reload();
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line-3")).toBeVisible();
});

test("[BUG-06] mixing detail and catalog adds keeps every product after reloading", async ({ page }) => {
  // Matches the user report: "some things disappear" -> the detail add survives, the catalog add doesn't.
  await page.goto("/product/1");
  await page.getByTestId("add-to-cart").click();
  await page.getByTestId("nav-products").click();
  await page.getByTestId("quick-add-3").click();
  await page.getByTestId("nav-cart").click();
  await expect(page.getByTestId("cart-line-3")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("cart-line-1")).toBeVisible();
  await expect(page.getByTestId("cart-line-3")).toBeVisible();
});

test("[BUG-09] line and order totals are exact to the cent (3 x $8.35 = $25.05)", async ({ page }) => {
  await page.goto("/product/1");
  await page.getByTestId("quantity-select").selectOption("3");
  await page.getByTestId("add-to-cart").click();
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line-total-1")).toHaveText("$25.05");
  await expect(page.getByTestId("cart-total")).toHaveText("$25.05");
});
