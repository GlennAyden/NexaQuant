import { expect, test } from "@playwright/test";

const symbols = [
  {
    symbol: "BBCA.JK",
    name: "Bank Central Asia Tbk",
    sector: "Financials",
    exchange: "IDX",
    isActive: true,
    source: "fixture",
    lastSeenAt: "2026-05-31T00:00:00.000Z",
    latestAnnotations: ["SC", "Spring", "SOS", "Impulse", "Absorption"],
    lastClose: 9250,
    lastSyncedAt: "2026-05-29",
    dataQuality: { status: "ok", reasons: [], barCount: 220, lastBarDate: "2026-05-29" },
    isWatchlisted: false,
    watchlistNote: null,
  },
  {
    symbol: "BMRI.JK",
    name: "Bank Mandiri Tbk",
    sector: "Financials",
    exchange: "IDX",
    isActive: true,
    source: "fixture",
    lastSeenAt: "2026-05-31T00:00:00.000Z",
    latestAnnotations: ["BC", "UTAD", "SOW", "Volume Climax"],
    lastClose: 4730,
    lastSyncedAt: "2026-05-29",
    dataQuality: { status: "ok", reasons: [], barCount: 220, lastBarDate: "2026-05-29" },
    isWatchlisted: false,
    watchlistNote: null,
  },
  ...Array.from({ length: 14 }).map((_, index) => ({
    symbol: `TEST${String(index + 1).padStart(2, "0")}.JK`,
    name: `Test Fixture ${index + 1}`,
    sector: "Fixtures",
    exchange: "IDX",
    isActive: true,
    source: "fixture",
    lastSeenAt: "2026-05-31T00:00:00.000Z",
    latestAnnotations: index % 2 === 0 ? ["Spring"] : ["Correction"],
    lastClose: 1000 + index,
    lastSyncedAt: "2026-05-29",
    dataQuality: { status: "ok", reasons: [], barCount: 220, lastBarDate: "2026-05-29" },
    isWatchlisted: false,
    watchlistNote: null,
  })),
];

function fixtureDate(index: number) {
  const date = new Date(Date.UTC(2026, 4, 1));
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

const bars = Array.from({ length: 90 }).map((_, index) => {
  const close = 8800 + index * 35 + (index % 5) * 18;
  return {
    symbol: "BBCA.JK",
    timeframe: "1d",
    date: fixtureDate(index),
    open: close - 25,
    high: close + 80,
    low: close - 90,
    close,
    adjClose: close,
    volume: 1_000_000 + index * 25_000,
    source: "fixture",
  };
});

const weeklyBars = bars.filter((_, index) => index % 5 === 0).map((bar) => ({
  ...bar,
  timeframe: "1w",
}));

let postedWatchlistBody: unknown;
let postedRecalculateBody: unknown;
let postedSyncBody: unknown;
let chartRequestUrls: string[];
let deletedWatchlistSymbol: string | null;
let watchlistItems: Array<{
  symbol: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}>;

test.beforeEach(async ({ page }) => {
  postedWatchlistBody = null;
  postedRecalculateBody = null;
  postedSyncBody = null;
  chartRequestUrls = [];
  deletedWatchlistSymbol = null;
  watchlistItems = [];

  await page.route(/.*\/api\/symbols.*/, async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("query")?.trim().toUpperCase() ?? "";
    const filtered = query
      ? symbols.filter((symbol) =>
        symbol.symbol.includes(query) || symbol.name.toUpperCase().includes(query),
      )
      : symbols;
    await route.fulfill({ json: { symbols: filtered, total: filtered.length } });
  });
  await page.route(/.*\/api\/sync.*/, async (route) => {
    if (route.request().method() === "POST") {
      postedSyncBody = route.request().postDataJSON();
    }

    await route.fulfill({
      json: {
        active: false,
        run: {
          id: "run-fixture",
          status: "completed",
          totalSymbols: 16,
          successCount: 14,
          skippedCount: 1,
          failedCount: 1,
          startedAt: "2026-05-31T01:00:00.000Z",
          finishedAt: "2026-05-31T01:02:00.000Z",
        },
        statuses: [
          {
            runId: "run-fixture",
            symbol: "BBCA.JK",
            status: "success",
            attempts: 1,
            startedAt: "2026-05-31T01:00:00.000Z",
            finishedAt: "2026-05-31T01:00:10.000Z",
            error: null,
            barsCount: 220,
            lastBarDate: "2026-05-29",
          },
          {
            runId: "run-fixture",
            symbol: "BMRI.JK",
            status: "failed",
            attempts: 2,
            startedAt: "2026-05-31T01:00:00.000Z",
            finishedAt: "2026-05-31T01:01:10.000Z",
            error: "network timeout",
            barsCount: 0,
            lastBarDate: null,
          },
          {
            runId: "run-fixture",
            symbol: "ADRO.JK",
            status: "skipped",
            attempts: 1,
            startedAt: "2026-05-31T01:00:00.000Z",
            finishedAt: "2026-05-31T01:00:02.000Z",
            error: "fresh data already cached",
            barsCount: 220,
            lastBarDate: "2026-05-29",
          },
          {
            runId: "run-fixture",
            symbol: "ANTM.JK",
            status: "running",
            attempts: 1,
            startedAt: "2026-05-31T01:01:00.000Z",
            finishedAt: null,
            error: null,
            barsCount: 0,
            lastBarDate: null,
          },
          ...Array.from({ length: 8 }).map((_, index) => ({
            runId: "run-fixture",
            symbol: `TEST${String(index + 1).padStart(2, "0")}.JK`,
            status: "success",
            attempts: 1,
            startedAt: "2026-05-31T01:00:00.000Z",
            finishedAt: "2026-05-31T01:00:10.000Z",
            error: null,
            barsCount: 220,
            lastBarDate: "2026-05-29",
          })),
        ],
        totalStatuses: 12,
      },
    });
  });
  await page.route(/.*\/api\/recalculate.*/, async (route) => {
    postedRecalculateBody = route.request().postDataJSON();
    await route.fulfill({
      json: {
        analysisMode: "strict",
        timeframes: ["1d", "1w"],
        total: 32,
        successCount: 32,
        failedCount: 0,
        errors: {},
        symbols: [],
      },
    });
  });
  await page.route(/.*\/api\/best-examples.*/, async (route) => {
    const url = new URL(route.request().url());
    const requestedTimeframe = url.searchParams.get("timeframe") === "1w" ? "1w" : "1d";
    await route.fulfill({
      json: {
        timeframe: requestedTimeframe,
        limit: 8,
        examples: [
          {
            symbol: "BBCA.JK",
            name: "Bank Central Asia Tbk",
            sector: "Financials",
            timeframe: requestedTimeframe,
            score: 0.84,
            quality: "strong",
            annotationTypes: ["SOS", "Impulse"],
            families: ["wyckoff", "elliott"],
            lastAnnotationDate: "2026-05-29",
          },
        ],
      },
    });
  });
  await page.route(/.*\/api\/watchlist.*/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { items: watchlistItems } });
      return;
    }

    if (route.request().method() === "DELETE") {
      const url = new URL(route.request().url());
      const symbol = url.searchParams.get("symbol") ?? "";
      deletedWatchlistSymbol = symbol;
      watchlistItems = watchlistItems.filter((item) => item.symbol !== symbol);
      await route.fulfill({ json: { symbol, removed: true } });
      return;
    }

    postedWatchlistBody = route.request().postDataJSON();
    const body = postedWatchlistBody as { symbol?: string; note?: string; tags?: string[] } | null;
    const symbol = body?.symbol ?? "BBCA.JK";
    const now = "2026-05-31T01:00:00.000Z";
    const item = {
      symbol,
      note: body?.note ?? "",
      tags: body?.tags ?? ["structure"],
      createdAt: watchlistItems.find((candidate) => candidate.symbol === symbol)?.createdAt ?? now,
      updatedAt: now,
    };
    watchlistItems = [item, ...watchlistItems.filter((candidate) => candidate.symbol !== symbol)];
    await route.fulfill({
      json: {
        item,
      },
    });
  });
  await page.route(/.*\/api\/backtest.*/, async (route) => {
    await route.fulfill({
      json: {
        symbol: "BBCA.JK",
        timeframe: "1d",
        outcomes: [
          {
            annotationId: "fixture-sos",
            symbol: "BBCA.JK",
            timeframe: "1d",
            family: "wyckoff",
            eventType: "SOS",
            eventDate: "2026-05-18",
            horizonBars: 5,
            startClose: 9300,
            endClose: 9540,
            returnPct: 2.58,
            status: "complete",
          },
        ],
      },
    });
  });
  await page.route(/.*\/api\/chart.*/, async (route) => {
    chartRequestUrls.push(route.request().url());
    const url = new URL(route.request().url());
    const requestedTimeframe = url.searchParams.get("timeframe") === "1w" ? "1w" : "1d";
    const responseBars = requestedTimeframe === "1w" ? weeklyBars : bars;
    const annotations = requestedTimeframe === "1w" ? [
      {
        id: "fixture-weekly-sow",
        symbol: "BBCA.JK",
        timeframe: "1w",
        family: "wyckoff",
        type: "SOW",
        label: "SOW",
        startDate: "2026-06-05",
        endDate: "2026-06-05",
        priceMin: 8700,
        priceMax: 9600,
        invalidationPrice: 9600,
        status: "candidate",
        evidence: ["weekly structure broke below the range low after supply"],
      },
    ] : [
      {
        id: "fixture-range",
        symbol: "BBCA.JK",
        timeframe: "1d",
        family: "wyckoff",
        type: "Trading Range",
        label: "Phase B Trading Range",
        startDate: "2026-05-01",
        endDate: "2026-07-29",
        priceMin: 8700,
        priceMax: 9250,
        invalidationPrice: null,
        status: "candidate",
        evidence: ["range width stayed compact across the cached window"],
      },
      {
        id: "fixture-sos",
        symbol: "BBCA.JK",
        timeframe: "1d",
        family: "wyckoff",
        type: "SOS",
        label: "SOS",
        startDate: "2026-05-18",
        endDate: "2026-05-18",
        priceMin: 8700,
        priceMax: 9250,
        invalidationPrice: 8700,
        status: "candidate",
        evidence: ["close exceeded the range high after the Spring/Test area"],
      },
      {
        id: "fixture-impulse",
        symbol: "BBCA.JK",
        timeframe: "1d",
        family: "elliott",
        type: "Impulse",
        label: "1-5 impulse candidate",
        startDate: "2026-05-01",
        endDate: "2026-05-22",
        priceMin: 8700,
        priceMax: 9600,
        invalidationPrice: 8700,
        status: "candidate",
        evidence: ["Wave 3 extends beyond Wave 1 and is not the shortest motive wave"],
        meta: {
          elliottWave: {
            pattern: "impulse",
            rank: "primary",
            direction: "up",
            points: [
              { label: "0", date: "2026-05-01", price: 8700 },
              { label: "1", date: "2026-05-05", price: 9100 },
              { label: "2", date: "2026-05-08", price: 8900 },
              { label: "3", date: "2026-05-14", price: 9500 },
              { label: "4", date: "2026-05-18", price: 9250 },
              { label: "5", date: "2026-05-22", price: 9600 },
            ],
          },
        },
      },
      {
        id: "fixture-pva-absorption",
        symbol: "BBCA.JK",
        timeframe: "1d",
        family: "pva",
        type: "Absorption",
        label: "Effort/result absorption",
        startDate: "2026-05-24",
        endDate: "2026-05-24",
        priceMin: 9220,
        priceMax: 9310,
        invalidationPrice: null,
        status: "confirmed",
        evidence: ["relative volume 2.10x appeared with compressed spread", "large effort produced limited price result"],
        confidence: 0.82,
        qualityScore: 0.82,
        quality: "strong",
        phase: "pva",
        conflicts: [],
        meta: {
          pva: {
            abbreviation: "ABS",
            bias: "neutral",
            relativeVolume: 2.1,
            spreadRatio: 0.62,
            closeLocation: 0.54,
          },
        },
      },
      {
        id: "fixture-fib",
        symbol: "BBCA.JK",
        timeframe: "1d",
        family: "structure",
        type: "Fib Guide",
        label: "38.2% 9256 / 61.8% 9044 / 161.8% 10016",
        startDate: "2026-05-01",
        endDate: "2026-05-22",
        priceMin: 9044,
        priceMax: 10016,
        invalidationPrice: null,
        status: "candidate",
        evidence: ["Fibonacci levels are context guides for the primary Elliott count"],
        confidence: 0.5,
        phase: "fib",
        conflicts: [],
        meta: {
          retracement382: 9256,
          retracement618: 9044,
          projection1618: 10016,
        },
      },
    ];

    await route.fulfill({
      json: {
        symbol: "BBCA.JK",
        timeframe: requestedTimeframe,
        bars: responseBars,
        annotations,
        dataQuality: { status: "ok", reasons: [], barCount: responseBars.length, lastBarDate: responseBars.at(-1)?.date ?? null },
      },
    });
  });
});

test("dashboard exposes the approved layout contract", async ({ page }) => {
  await page.goto("/");

  const topCommandBar = page.getByLabel("Top command bar");
  await expect(topCommandBar).toBeVisible();
  await expect(topCommandBar.getByRole("heading", { name: "IDX Structure" })).toBeVisible();
  await expect(topCommandBar.getByText("BBCA.JK", { exact: true })).toBeVisible();
  await expect(
    topCommandBar
      .getByRole("searchbox", { name: /search/i })
      .or(topCommandBar.getByRole("textbox", { name: /search/i }))
      .first(),
  ).toBeVisible();
  await expect(topCommandBar.getByRole("button", { name: "Daily" })).toBeVisible();
  await expect(topCommandBar.getByRole("button", { name: "Weekly" })).toBeVisible();
  await expect(topCommandBar.getByRole("button", { name: "1D", exact: true })).toBeVisible();
  await expect(topCommandBar.getByRole("button", { name: "Watchlist" })).toBeVisible();
  await expect(topCommandBar.getByRole("button", { name: "Recalculate" })).toBeVisible();

  const marketScanner = page.getByLabel("Market scanner");
  await expect(marketScanner.getByText("Watchlist", { exact: true })).toBeVisible();
  await expect(marketScanner.getByRole("button", { name: "Accumulation" })).toBeVisible();
  await expect(marketScanner.getByRole("button", { name: "Distribution" })).toBeVisible();
  await expect(marketScanner.getByRole("button", { name: "Structure" })).toBeVisible();
  await expect(marketScanner.getByRole("button", { name: "Price Volume" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Best Examples" })).toBeVisible();

  const annotationMode = page.getByRole("radiogroup", { name: "Annotation mode" });
  await expect(annotationMode).toBeVisible();
  await expect(annotationMode.getByRole("radio", { name: "Strict" })).toBeChecked();
  await expect(annotationMode.getByRole("radio", { name: "Loose" })).toBeVisible();

  const chartWorkspace = page.getByLabel("Chart workspace");
  await expect(chartWorkspace).toBeVisible();
  await expect(chartWorkspace.getByLabel("Prediction line selector")).toBeVisible();

  const metricsRibbon = page.getByLabel("Research metrics ribbon");
  await expect(metricsRibbon).toBeVisible();
  await expect(metricsRibbon).toContainText("Time Machine");
  await expect(metricsRibbon).toContainText("Trust");
  await expect(metricsRibbon).toContainText("Cache");
  await expect(metricsRibbon).toContainText("Analog");

  await expect(page.getByLabel("Screener strip")).toBeVisible();

  await page.getByRole("button", { name: "Explain Elliott A-B-C projection" }).click();
  await page.getByRole("tab", { name: "Explain", exact: true }).click();
  await expect(page.getByLabel("Selected prediction explanation")).toBeVisible();
  await expect(page.getByLabel("Selected prediction explanation")).toContainText("Elliott A-B-C uses the primary impulse");
});

test("dashboard renders chart annotations and avoids advice wording", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "IDX Structure" })).toBeVisible();
  await expect(page.getByText("BBCA.JK").first()).toBeVisible();
  await expect(page.getByText("SOS").first()).toBeVisible();
  await expect(page.getByText("Impulse").first()).toBeVisible();
  await expect(page.getByText("Absorption").first()).toBeVisible();
  await expect(page.getByLabel("Chart guides")).toContainText("Invalidation SOS");
  await expect(page.getByLabel("Chart guides")).toContainText("Fib 38.2");
  await expect(page.getByLabel("Elliott wave overlay")).toHaveCount(1);
  await expect(page.getByLabel("Projection overlay")).toHaveCount(1);
  await expect(page.getByLabel("Research metrics ribbon")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Time Machine" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conflict" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trust" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cache" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Analog" })).toBeVisible();
  await expect(page.getByLabel("Research cache state")).toContainText("cached");
  await expect(page.getByLabel("Data guard status")).toContainText(/ok|caution|blocked/);
  await expect(page.getByLabel("Confidence breakdown")).toContainText(/confidence/i);
  await expect(page.getByLabel("Time machine scrubber")).toBeVisible();
  await page.getByRole("button", { name: "Enable time machine" }).click();
  await expect(page.getByLabel("Time machine as of")).toContainText("2026-");
  await expect(page.getByLabel("Time machine calculation mode")).toContainText("recalculated");
  await page.getByRole("button", { name: "Disable time machine" }).click();
  await expect(page.getByLabel("Time machine calculation mode")).toContainText("filtered");
  await expect(page.getByRole("button", { name: "Hide Wyckoff markers" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Hide Elliott markers" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Hide PVA markers" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Hide Projection markers" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Fit projection range" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Fit projection range" }).click();
  await expect(page.getByRole("button", { name: "Use compact projection range" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Use compact projection range" }).click();
  await page.getByRole("button", { name: "Hide Wyckoff markers" }).click();
  await expect(page.getByRole("button", { name: "Show Wyckoff markers" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Show Wyckoff markers" }).click();
  await expect(page.getByRole("button", { name: "Hide Wyckoff markers" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Hide PVA markers" }).click();
  await expect(page.getByRole("button", { name: "Show PVA markers" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Show PVA markers" }).click();
  await expect(page.getByRole("button", { name: "Hide PVA markers" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Hide Projection markers" }).click();
  await expect(page.getByRole("button", { name: "Show Projection markers" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Projection overlay")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Projection markers" }).click();
  await expect(page.getByLabel("Projection overlay")).toHaveCount(1);
  await expect(page.getByLabel("Prediction line selector")).toBeVisible();
  await page.getByRole("button", { name: "Explain Elliott A-B-C projection" }).click();
  await page.getByRole("button", { name: "Hide Elliott markers" }).click();
  await expect(page.getByRole("button", { name: "Show Elliott markers" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Elliott wave overlay")).toHaveCount(0);
  await expect(page.getByLabel("Chart guides")).not.toContainText("Fib 38.2");
  await page.getByRole("tab", { name: "Explain", exact: true }).click();
  await expect(page.getByLabel("Projection status").first()).toContainText(/active|conflicted|invalidated/);
  await expect(page.getByLabel("Selected prediction explanation")).toContainText("Elliott A-B-C uses the primary impulse");
  await expect(page.getByLabel("Selected prediction explanation")).toContainText("Invalid below 8.700");
  await page.getByLabel("Prediction inspector").getByRole("tab", { name: "PVA" }).click();
  await expect(page.getByText("Price Volume Analysis")).toBeVisible();
  await expect(page.getByText("Effort/result absorption")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\b(?:buy|sell)\b/i);
  await expect(page.getByRole("button", { name: "Recalculate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recalculate all cached annotations" })).toBeVisible();

  await Promise.all([
    page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === "/api/chart" && url.searchParams.get("timeframe") === "1w";
    }),
    page.getByRole("button", { name: "Weekly" }).click(),
  ]);
  await expect(page.getByRole("columnheader", { name: "Quality" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "PVA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "1W", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "1D", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "5D", exact: true })).toHaveCount(0);

  await Promise.all([
    page.waitForRequest((request) => new URL(request.url()).pathname === "/api/recalculate"),
    page.getByRole("button", { name: "Recalculate all cached annotations" }).click(),
  ]);
  expect(postedRecalculateBody).toMatchObject({ mode: "all", timeframe: "all", analysisMode: "strict" });
});

test("dashboard integrates watchlist, backtest, sync detail, search, and paged screener rows", async ({ page }) => {
  await page.goto("/");
  const scanner = page.getByLabel("Market scanner");
  const watchlistSection = scanner.getByRole("region", { name: "Watchlist" });
  await expect(watchlistSection).toBeVisible();
  await expect(scanner.getByRole("button", { name: "Accumulation" })).toBeVisible();
  await expect(scanner.getByRole("button", { name: "Distribution" })).toBeVisible();
  await expect(scanner.getByRole("button", { name: "Structure" })).toBeVisible();
  await expect(scanner.getByRole("button", { name: "Price Volume" })).toBeVisible();

  await page.getByPlaceholder(/Search ticker/).fill("BMRI");
  await scanner.getByRole("button", { name: "Distribution" }).click();
  await expect(page.getByRole("row", { name: /BMRI\.JK/ })).toBeVisible();
  await page.getByRole("button", { name: "Add BMRI.JK to watchlist" }).click();
  expect(postedWatchlistBody).toMatchObject({ symbol: "BMRI.JK", tags: ["structure"] });
  await expect(watchlistSection).toContainText("BMRI");
  await watchlistSection.getByRole("button", { name: "Remove BMRI.JK from watchlist" }).click();
  expect(deletedWatchlistSymbol).toBe("BMRI.JK");
  await expect(watchlistSection).not.toContainText("BMRI");

  await page.getByLabel("Watchlist note").fill("Review after weekly close");
  await page.getByRole("button", { name: "Track structure" }).click();
  await expect(page.getByRole("button", { name: "Tracked structure" })).toBeVisible();
  await expect(watchlistSection).toContainText("BBCA");
  expect(postedWatchlistBody).toMatchObject({
    symbol: "BBCA.JK",
    note: "Review after weekly close",
    tags: ["structure"],
  });

  await page.getByLabel("Universe").selectOption("watchlist");
  await expect(page.getByRole("row", { name: /BBCA\.JK/ })).toBeVisible();

  await page.getByLabel("Universe").selectOption("all");
  await expect(page.getByRole("row", { name: /BMRI\.JK/ })).toBeVisible();

  await page.getByLabel("Sync mode").selectOption("watchlist");
  await page.getByRole("button", { name: "Sync data" }).click();
  expect(postedSyncBody).toMatchObject({ mode: "watchlist", concurrency: 3, skipFreshDays: 2 });

  await page.getByLabel("Prediction inspector").getByRole("tab", { name: "Wyckoff" }).click();
  await expect(page.getByText("Backtest Outcomes")).toBeVisible();
  await expect(page.getByText("SOS 5 bars")).toBeVisible();

  await page.getByPlaceholder(/Search ticker/).fill("");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await expect(page.getByRole("row", { name: /TEST12\.JK/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByRole("row", { name: /TEST12\.JK/ })).toBeVisible();
  await watchlistSection.getByRole("button", { name: "Remove BBCA.JK from watchlist" }).click();
  expect(deletedWatchlistSymbol).toBe("BBCA.JK");
  await expect(watchlistSection).not.toContainText("BBCA");
  await expect(page.getByRole("button", { name: "Track structure" })).toBeVisible();
  await expect.poll(async () => page.evaluate(() =>
    document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1,
  )).toBeTruthy();
  await expect(page.locator("body")).not.toContainText(/\b(?:buy|sell)\b/i);
});

test("dashboard range selector compacts cached OHLC without refetching sliced bars", async ({ page }) => {
  const initialChartRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/chart" && url.searchParams.get("timeframe") === "1d";
  });
  await page.goto("/");
  const initialRequest = new URL((await initialChartRequest).url());
  expect(initialRequest.pathname).toBe("/api/chart");
  expect(initialRequest.searchParams.has("limitBars")).toBe(false);

  await expect.poll(() => chartRequestUrls.length).toBeGreaterThan(0);
  chartRequestUrls = [];
  await page.getByRole("button", { name: "5D" }).click();
  await expect(page.getByRole("button", { name: "5D" })).toHaveClass(/text-teal-700/);
  expect(chartRequestUrls).toHaveLength(0);

  await Promise.all([
    page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === "/api/chart" && url.searchParams.get("timeframe") === "1w" && !url.searchParams.has("limitBars");
    }),
    page.getByRole("button", { name: "Weekly" }).click(),
  ]);
  await expect(page.getByRole("button", { name: "1W" })).toHaveClass(/text-teal-700/);
});
