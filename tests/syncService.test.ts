import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMarketStore, type MarketStore } from "@/lib/market/marketStore";
import { buildAnnotationsForBars, recalculateSymbol, recalculateSymbols, runMarketSync } from "@/lib/market/syncService";
import type { Bar, SymbolRecord } from "@/lib/market/types";

let dir = "";
let store: MarketStore | null = null;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "idx-sync-"));
});

afterEach(() => {
  store?.close();
  store = null;
  rmSync(dir, { recursive: true, force: true });
});

function makeBar(index: number, close: number, volume = 1000): Bar {
  return {
    symbol: "SYNC.JK",
    timeframe: "1d",
    date: `2026-04-${String(index + 1).padStart(2, "0")}`,
    open: close,
    high: close + 2,
    low: close - 2,
    close,
    adjClose: close,
    volume,
    source: "fixture",
  };
}

const syncSymbol: SymbolRecord = {
  symbol: "SYNC.JK",
  name: "Sync Fixture",
  sector: "Test",
  exchange: "IDX",
  isActive: true,
  source: "fixture",
  lastSeenAt: "2026-05-31T00:00:00.000Z",
};

describe("syncService", () => {
  it("recalculates chart annotations from cached daily bars", () => {
    store = createMarketStore(path.join(dir, "market.db"));
    const bars = [130, 124, 118, 112, 105, 96, 111, 101, 108, 94, 109, 121, 115]
      .map((close, index) => makeBar(index, close, index === 5 || index === 11 ? 4200 : 1200));

    store.upsertSymbols([syncSymbol]);
    store.upsertBars(bars);

    const annotations = recalculateSymbol(store, "SYNC.JK", "1d");

    expect(annotations.map((annotation) => annotation.family)).toContain("wyckoff");
    expect(store.getChart("SYNC.JK", "1d").annotations.length).toBeGreaterThan(0);
  });

  it("builds Wyckoff, Elliott, and PVA annotations through one shared path", () => {
    const impulseCloses = [
      110, 108, 105, 100, 106, 115, 110, 106, 120, 136, 130, 124,
      132, 146, 138, 132, 136, 141, 136, 128, 132, 130,
    ];
    const bars = Array.from({ length: 42 }, (_, index) =>
      makeBar(index, impulseCloses[index] ?? 100),
    );
    bars[30] = {
      ...makeBar(30, 111, 3200),
      open: 101,
      high: 112,
      low: 100,
      close: 111,
      adjClose: 111,
    };
    bars[31] = makeBar(31, 115);

    const annotations = buildAnnotationsForBars("SYNC.JK", "1d", bars);

    expect(annotations.map((annotation) => annotation.family)).toEqual(expect.arrayContaining([
      "wyckoff",
      "elliott",
      "pva",
    ]));
  });

  it("summarizes batch recalculation results per symbol", () => {
    store = createMarketStore(path.join(dir, "market.db"));
    const firstBars = [130, 124, 118, 112, 105, 96, 111, 101, 108, 94, 109, 121, 115]
      .map((close, index) => makeBar(index, close, index === 5 || index === 11 ? 4200 : 1200));
    const secondBars = [90, 94, 91, 98, 95, 102, 99, 106, 103, 110, 107, 114, 111]
      .map((close, index) => ({ ...makeBar(index, close), symbol: "BATCH.JK" }));

    store.upsertSymbols([
      syncSymbol,
      { ...syncSymbol, symbol: "BATCH.JK", name: "Batch Fixture" },
    ]);
    store.upsertBars([...firstBars, ...secondBars]);

    const result = recalculateSymbols(store, ["SYNC.JK", "BATCH.JK"], "1d");

    expect(result).toMatchObject({ total: 2, successCount: 2, failedCount: 0, errors: {} });
    expect(result.symbols.map((item) => item.symbol)).toEqual(["SYNC.JK", "BATCH.JK"]);
  });

  it("records partial sync failures without dropping successful symbols", async () => {
    store = createMarketStore(path.join(dir, "market.db"));
    const okBars = [100, 106, 99, 112, 105, 118, 110, 124].map((close, index) =>
      makeBar(index, close),
    );

    const run = await runMarketSync({
      store,
      symbols: [
        syncSymbol,
        { ...syncSymbol, symbol: "FAIL.JK", name: "Fail Fixture" },
      ],
      provider: {
        fetchDailyBars: async (symbol) => {
          if (symbol === "FAIL.JK") {
            throw new Error("Yahoo rejected fixture");
          }
          return okBars.map((bar) => ({ ...bar, symbol }));
        },
      },
    });

    expect(run).toMatchObject({ status: "completed", successCount: 1, failedCount: 1 });
    expect(store.getBars("SYNC.JK", "1d")).toHaveLength(okBars.length);
    expect(store.getLatestSyncRun()).toMatchObject({ successCount: 1, failedCount: 1 });
  });

  it("fails loud when a provider returns no daily bars for a symbol", async () => {
    store = createMarketStore(path.join(dir, "market.db"));

    const run = await runMarketSync({
      store,
      symbols: [syncSymbol],
      provider: {
        fetchDailyBars: async () => [],
      },
    });

    expect(run).toMatchObject({ status: "failed", successCount: 0, failedCount: 1 });
    expect(store.getSyncSymbolStatuses(run.id)[0]).toMatchObject({
      symbol: "SYNC.JK",
      status: "failed",
      attempts: 2,
      barsCount: 0,
    });
  });

  it("records per-symbol progress and skips fresh symbols during resilient sync", async () => {
    store = createMarketStore(path.join(dir, "market.db"));
    const existingBars = [100, 101, 102].map((close, index) => ({
      ...makeBar(index, close),
      date: `2026-05-${String(27 + index).padStart(2, "0")}`,
    }));
    store.upsertSymbols([syncSymbol]);
    store.upsertBars(existingBars);

    const run = await runMarketSync({
      store,
      symbols: [
        syncSymbol,
        { ...syncSymbol, symbol: "NEW.JK", name: "New Fixture" },
      ],
      provider: {
        fetchDailyBars: async (symbol) => {
          return [98, 104, 99, 109, 103, 114, 108, 119].map((close, index) => ({
            ...makeBar(index, close),
            symbol,
          }));
        },
      },
      concurrency: 2,
      skipFreshDays: 3,
      now: new Date("2026-05-31T00:00:00.000Z"),
    });

    expect(run).toMatchObject({ successCount: 1, skippedCount: 1, failedCount: 0 });
    expect(store.getSyncSymbolStatuses(run.id).map((status) => `${status.symbol}:${status.status}`)).toEqual([
      "NEW.JK:success",
      "SYNC.JK:skipped",
    ]);
  });
});
