import { test, expect } from "@playwright/test";
import { login, resetData } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test("[BUG-02] a user cannot read another user's order", async ({ page }) => {
  await login(page); // Ana. Order #3 belongs to Bruno (seed data).
  const res = await page.request.get("/api/orders/3");
  expect([403, 404]).toContain(res.status());
  expect(await res.text()).not.toContain("Evergreen");
});

test("[BUG-02] opening another user's order in the UI does not show their data", async ({ page }) => {
  await login(page);
  await page.goto("/orders/3");
  await expect(page.getByTestId("order-error")).toBeVisible();
  await expect(page.getByTestId("order-shipping")).toHaveCount(0);
});

test("[BUG-10] order dates are shown in Argentina time (late-night order keeps its local day)", async ({ page }) => {
  // Seed order #2 was created at 2026-10-15T02:30Z = Oct 14, 23:30 in Buenos Aires (UTC-3).
  await login(page);
  await page.getByTestId("nav-orders").click();
  await expect(page.getByTestId("order-row-2")).toContainText("10/14/2026");

  await page.getByTestId("order-link-2").click();
  await expect(page.getByTestId("order-date")).toContainText("10/14/2026");
  await expect(page.getByTestId("order-date")).toContainText("23:30");
});
