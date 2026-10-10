import { expect, test } from "@playwright/test";
import type { PriceHistory } from "../../src/lib/pricing/price-history";

const payload = (market = "US"): PriceHistory => ({
  market: market as PriceHistory["market"],
  currency: market === "UK" ? "GBP" : market === "EU" ? "EUR" : "USD",
  now: "2026-10-10T00:00:00.000Z",
  points: [
    {
      timestamp: "2024-01-01T00:00:00.000Z",
      lowMinor: 290000,
      typicalMinor: 300000,
      highMinor: 330000,
    },
    {
      timestamp: "2026-01-01T00:00:00.000Z",
      lowMinor: 310000,
      typicalMinor: 320000,
      highMinor: 340000,
    },
    {
      timestamp: "2026-10-01T00:00:00.000Z",
      lowMinor: 320000,
      typicalMinor: 325500,
      highMinor: 350000,
    },
  ],
});

test.setTimeout(60_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("country.locale.v2", JSON.stringify("us")),
  );
});

test("lazy history loads with skeleton, switches periods locally and precedes reviews", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/gear/*/price-history?*", async (route) => {
    requests++;
    await gate;
    await route.fulfill({ json: payload() });
  });
  await page.goto("/gear/nikon-z6iii", { waitUntil: "domcontentloaded" });
  const section = page.locator("#price-history");
  await section.scrollIntoViewIfNeeded();
  await expect.poll(() => requests, { timeout: 20_000 }).toBe(1);
  await expect(section.locator('[aria-busy="true"]')).toBeVisible();
  release();
  await expect(section.getByTestId("price-history-value")).toHaveAttribute(
    "aria-label",
    "$3,255",
  );
  await expect(
    section.getByRole("button", { name: "1 year", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(section.getByText("+8.5%", { exact: true })).toBeVisible();
  await section.getByRole("button", { name: "30d", exact: true }).click();
  await expect(section.getByText("+1.7%", { exact: true })).toBeVisible();
  await section.getByRole("button", { name: "All time", exact: true }).click();
  await expect(section.getByText("+8.5%", { exact: true })).toBeVisible();
  expect(requests).toBe(1);
  await expect(section.locator(".recharts-surface")).toBeVisible();
  expect(
    await section.evaluate((el) =>
      Boolean(
        el.compareDocumentPosition(document.getElementById("reviews")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ),
  ).toBe(true);
});

test("hides insufficient history", async ({ page }) => {
  let requested = false;
  await page.route("**/api/gear/*/price-history?*", async (route) => {
    requested = true;
    const data = payload();
    data.points = data.points.slice(0, 1);
    await route.fulfill({ json: data });
  });
  await page.goto("/gear/nikon-z6iii", { waitUntil: "domcontentloaded" });
  await page.locator("#price-history").scrollIntoViewIfNeeded();
  await expect.poll(() => requested, { timeout: 20_000 }).toBe(true);
  await expect(page.locator("#price-history")).toHaveCount(0);
});

test("failed history can retry", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/gear/*/price-history?*", async (route) => {
    attempts++;
    await route.fulfill(
      attempts === 1
        ? { status: 500, json: { error: "Unavailable" } }
        : { json: payload() },
    );
  });
  await page.goto("/gear/nikon-z6iii", { waitUntil: "domcontentloaded" });
  const section = page.locator("#price-history");
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("alert")).toBeVisible();
  await section.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(section.getByTestId("price-history-value")).toHaveAttribute(
    "aria-label",
    "$3,255",
  );
});

test("follows the persisted market without converting history", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("country.locale.v2", JSON.stringify("uk")),
  );
  const markets: string[] = [];
  await page.route("**/api/gear/*/price-history?*", async (route) => {
    const market = new URL(route.request().url()).searchParams.get("market")!;
    markets.push(market);
    await route.fulfill({ json: payload(market) });
  });
  await page.goto("/gear/nikon-z6iii", { waitUntil: "domcontentloaded" });
  const section = page.locator("#price-history");
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByTestId("price-history-value")).toHaveAttribute(
    "aria-label",
    "£3,255",
  );
  expect(markets).toContain("UK");
});

test("chart inspection updates the animated header and restores the current price", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/gear/*/price-history?*", (route) =>
    route.fulfill({ json: payload() }),
  );
  await page.goto("/gear/nikon-z6iii", { waitUntil: "domcontentloaded" });
  const section = page.locator("#price-history");
  await section.scrollIntoViewIfNeeded();
  const value = section.getByTestId("price-history-value");
  await expect(value).toHaveAttribute("aria-label", "$3,255");
  const chart = section.locator(".recharts-wrapper");
  await expect(section.locator(".recharts-line-curve")).toBeVisible();
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + 85, box.y + 100);
  await expect(value).toHaveAttribute("aria-label", "$3,000");
  await expect(section.getByText("0%", { exact: true })).toBeVisible();
  await expect(section.locator("time")).toHaveAttribute(
    "datetime",
    "2025-10-10T00:00:00.000Z",
  );
  await expect(section.locator(".recharts-tooltip-wrapper")).toHaveText("");
  await section.getByRole("button", { name: "1 year", exact: true }).hover();
  await expect(value).toHaveAttribute("aria-label", "$3,255");
  await page.mouse.move(box.x + 85, box.y + 100);
  await expect(value).toHaveAttribute("aria-label", "$3,000");
  await section.getByRole("button", { name: "30d", exact: true }).click();
  await expect(value).toHaveAttribute("aria-label", "$3,255");
  const svg = section.locator(".recharts-surface");
  await svg.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(value).toHaveAttribute("aria-label", "$3,200");
  await section.getByRole("button", { name: "All time", exact: true }).focus();
  await expect(value).toHaveAttribute("aria-label", "$3,255");
});

test("touch inspection resets after release and supports repeated taps, drags and cancellation", async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Real touch event regression uses Chromium CDP.",
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    await context.addInitScript(() =>
      localStorage.setItem("country.locale.v2", JSON.stringify("us")),
    );
    const page = await context.newPage();
    await page.route("**/api/gear/*/price-history?*", (route) =>
      route.fulfill({ json: payload() }),
    );
    await page.goto("/gear/nikon-z6iii", { waitUntil: "domcontentloaded" });
    const section = page.locator("#price-history");
    await section.scrollIntoViewIfNeeded();
    const value = section.getByTestId("price-history-value");
    await expect(value).toHaveAttribute("aria-label", "$3,255");
    await expect(section.locator(".recharts-line-curve")).toBeVisible();
    const box = (await section.locator(".recharts-wrapper").boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const first = { x: box.x + 85, y: box.y + 80 };
    const middle = { x: box.x + 80 + (box.width - 92) * 0.25, y: first.y };
    for (let repeat = 0; repeat < 2; repeat++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [first],
      });
      await expect(value).toHaveAttribute("aria-label", "$3,000");
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [middle],
      });
      await expect(value).toHaveAttribute("aria-label", "$3,200");
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(value).toHaveAttribute("aria-label", "$3,255");
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [first],
    });
    await expect(value).toHaveAttribute("aria-label", "$3,000");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(value).toHaveAttribute("aria-label", "$3,255");
  } finally {
    await context.close();
  }
});
