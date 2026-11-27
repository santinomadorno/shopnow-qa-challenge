# AI usage

## Tools and models

- **My own QA agent**, which I built on top of **Claude Code** (Anthropic, model Claude Opus 5.5) and run inside VS Code, with access to the repo, a terminal and Playwright.
- The agent works with my own QA rules and workflow: every expected value needs a source, nothing is reported as a bug unless it can be reproduced, and nothing is marked as passing without evidence. The agent itself (its configuration and instructions) is private and not part of this repo.
- No other AI tools.

## What I delegated to AI

- **Reading the codebase fast:** the agent read `SPEC.md`, `docs/API.md`, `USER_REPORTS.md`, the server (`app/server/api.ts`, `app/shared/money.ts`) and the React pages, and gave me a list of *candidate* bugs with the line that would cause each one. I used that list as hypotheses, not as findings.
- **API probes:** a small curl script (log in as Ana, then call `/coupons/validate`, `/orders/:id`, `/checkout` with edge-case payloads: two coupons, the same coupon twice, quantity −1 / 0, more than the stock, accents in the address, total > $100 with timing).
- **First drafts** of the Playwright tests, `BUGS.md` and `ANALYSIS.md`, following the templates and the README's test rules (bug ID in the name, `resetData` in `beforeEach`, `data-testid` locators, no `test.fail`/`skip`, no reading `app/`).
- **Troubleshooting the environment:** Playwright 1.48 couldn't download Chromium (its old `azureedge.net` download URLs no longer answer, so `npm install` hangs). The agent found that and downloaded the same build (chromium-1140) from Playwright's current CDN into a git-ignored local folder (`PLAYWRIGHT_BROWSERS_PATH=.pw-browsers`). It didn't touch `playwright.config.ts`.

## What I verified and how

- **Every bug was reproduced against the running app** (`npm run dev`, fresh `POST /api/test/reset`), not just inferred from the code. Example outputs I checked by hand:
  - `POST /coupons/validate {"code":"flock10"}` → `{"percent":0}` vs `FLOCK10` → `10` (BUG-05).
  - `GET /orders/3` as Ana → Bruno's name and address (BUG-02).
  - Checkout with quantity `-1` → `201`, total `-6`, approved payment of `-6` (BUG-03).
  - Checkout of 5 chairs with stock 2 → `201`, stock `-3` (BUG-04).
  - Checkout of $129 → `201` after 4.0 s, while the UI aborts at 3 s (BUG-01).
  - 3 × $8.35 → `25.04` (BUG-09); order #2 at `02:30Z` shows `10/15/2026 · 23:30` (BUG-10).
- **Expected values come from a source, not from the code:** the spec (case-insensitive coupons, one coupon, minimum 1, Argentina time), the API doc (`409 out of stock`, `400 invalid data`), seed prices and stock, and plain arithmetic (10% of $8.35 = $0.835 → $0.84).
- **Each test was checked to fail *for the bug*, not because of a broken locator.** I ran the suite and read every failure: they show the bug's value (`Received: "$25.04"`, `Received: 201`, `Received: 0`, `Received: 5`, `"10/15/2026"`, `Expected: 2 payments, Received: 3`). None fail with "element not found" on a locator that should exist.
- **Result:** 17 bug tests fail today; the two non-bug tests (login example and the strengthened cart total test) pass.

## What I discarded or corrected from the output, and why

- **A BUG-06 test that would have passed.** The first draft added a product from the catalog and *then* one from the detail page. The detail add saves the whole cart, including the catalog item, so the test passed and proved nothing. I rewrote it in the order the user report describes (detail first, then catalog → the catalog item disappears).
- **Things the AI flagged that I didn't file as bugs**, because the spec doesn't say what should happen: cart shared between users on the same browser, category filter case-sensitive in the API (the UI uses a dropdown), `MM/DD/YYYY` format, no Luhn/CVV check. They're listed as observations / PO questions.
- **Shell quirk:** the first API probe returned empty results because zsh doesn't word-split variables; the agent re-ran it with bash. I only used outputs from the second run.
- **Existing team test:** the AI pointed out that `tests/cart.spec.ts` only checked that the total was *visible*. I kept the test and made it assert the real amounts ($16.70).

## Evidence

- API probe script used during the session: [`probe.sh`](probe.sh).
- Captured API requests/responses (re-run with a Node `fetch` script after a reset per block): [`../evidence/api-evidence.md`](../evidence/api-evidence.md).
- Test run: `npx playwright test` → 17 failed (one per bug scenario), 2 passed. The HTML report is generated in `playwright-report/` (not committed).
