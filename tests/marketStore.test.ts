import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMarketStore } from "@/lib/market/marketStore";
import type { Bar, ChartAnnotation, SymbolRecord, SyncSymbolStatus, WatchlistItem } from "@/lib/market/types";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "idx-store-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("marketStore", () => {
  it("upserts symbols, bars, annotations, and returns stable chart payloads", () => {
    const store = createMarketStore(path.join(dir, "market.db"));
    const symbol: SymbolRecord = {
      symbol: "BBCA.JK",
      name: "Bank Central Asia Tbk",
      sector: "Financials",
      exchange: "IDX",
      isActive: true,
      source: "fixture",
      lastSeenAt: "2026-05-31T00:00:00.000Z",
    };
    const bar: Bar = {
      symbol: "BBCA.JK",
      timeframe: "1d",
      date: "2026-05-29",
      open: 9000,
      high: 9150,
      low: 8950,
      close: 9100,
      adjClose: 9100,
      volume: 1200000,
      source: "fixture",
    };
    const annotation: ChartAnnotation = {
      id: "a1",
      symbol: "BBCA.JK",
      timeframe: "1d",
      family: "pva",
      type: "Absorption",
      label: "Effort/result absorption",
      startDate: "2026-05-29",
      endDate: "2026-05-29",
      priceMin: 8950,
      priceMax: 9150,
      invalidationPrice: 8950,
      status: "candidate",
      evidence: ["wide spread on higher volume"],
    };

    store.upsertSymbols([
      symbol,
      { ...symbol, symbol: "NOAN.JK", name: "No Annotation Fixture" },
    ]);
    store.upsertBars([bar]);
    store.replaceAnnotations("BBCA.JK", "1d", [annotation]);

    expect(store.getSymbols({ query: "BBCA" })[0]).toMatchObject({ symbol: "BBCA.JK" });
    expect(store.getSymbols({ family: "pva" }).map((item) => item.symbol)).toEqual(["BBCA.JK"]);
    expect(store.getChart("BBCA.JK", "1d")).toMatchObject({
      symbol: "BBCA.JK",
      bars: [bar],
      annotations: [annotation],
    });
    store.close();
  });

  it("persists annotation metadata, watchlist notes, and per-symbol sync status", () => {
    const store = createMarketStore(path.join(dir, "market.db"));
    const symbol: SymbolRecord = {
      symbol: "TLKM.JK",
      name: "Telkom Indonesia Tbk",
      sector: "Infrastructure",
      exchange: "IDX",
      isActive: true,
      source: "fixture",
      lastSeenAt: "2026-05-31T00:00:00.000Z",
    };
    const annotation: ChartAnnotation = {
      id: "meta-1",
      symbol: "TLKM.JK",
      timeframe: "1d",
      family: "wyckoff",
      type: "Spring",
      label: "Phase C Spring",
      startDate: "2026-05-20",
      endDate: "2026-05-20",
      priceMin: 2800,
      priceMax: 3200,
      invalidationPrice: 2780,
      status: "candidate",
      evidence: ["support breach recovered into the range"],
      confidence: 0.78,
      qualityScore: 0.78,
      quality: "plausible",
      phase: "C",
      conflicts: ["range has fewer than four support tests"],
    };
    const watchlistItem: WatchlistItem = {
      symbol: "TLKM.JK",
      note: "Review weekly structure after local sync",
      tags: ["monitor", "weekly"],
      createdAt: "2026-05-31T00:00:00.000Z",
      updatedAt: "2026-05-31T00:00:00.000Z",
    };
    const status: SyncSymbolStatus = {
      runId: "run-1",
      symbol: "TLKM.JK",
      status: "success",
      attempts: 2,
      startedAt: "2026-05-31T00:00:00.000Z",
      finishedAt: "2026-05-31T00:00:03.000Z",
      error: null,
      barsCount: 720,
      lastBarDate: "2026-05-29",
    };

    store.upsertSymbols([symbol]);
    store.replaceAnnotations("TLKM.JK", "1d", [annotation]);
    store.upsertWatchlistItem(watchlistItem);
    store.upsertSyncSymbolStatus(status);

    expect(store.getChart("TLKM.JK", "1d").annotations[0]).toMatchObject({
      confidence: 0.78,
      qualityScore: 0.78,
      quality: "plausible",
      phase: "C",
      conflicts: ["range has fewer than four support tests"],
    });
    expect(store.getWatchlist()).toEqual([watchlistItem]);
    expect(store.getSymbols({ query: "TLKM" })[0]).toMatchObject({
      isWatchlisted: true,
      watchlistNote: "Review weekly structure after local sync",
    });
    expect(store.getSyncSymbolStatuses("run-1")).toEqual([status]);

    store.close();
  });

  it("filters summary rows by annotation family and status while preserving latest daily bar quality", () => {
    const store = createMarketStore(path.join(dir, "market.db"));
    const baseSymbol: SymbolRecord = {
      symbol: "QUAL.JK",
      name: "Quality Fixture",
      sector: "Test",
      exchange: "IDX",
      isActive: true,
      source: "fixture",
      lastSeenAt: "2026-05-31T00:00:00.000Z",
    };
    const bars: Bar[] = Array.from({ length: 180 }, (_, index) => ({
      symbol: "QUAL.JK",
      timeframe: "1d",
      date: `2026-${String(Math.floor(index / 30) + 1).padStart(2, "0")}-${String((index % 30) + 1).padStart(2, "0")}`,
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close: 101 + index,
      adjClose: 101 + index,
      volume: 1000,
      source: "fixture",
    }));
    const confirmed: ChartAnnotation = {
      id: "confirmed-1",
      symbol: "QUAL.JK",
      timeframe: "1d",
      family: "wyckoff",
      type: "SOS",
      label: "Sign of Strength",
      startDate: "2026-05-15",
      endDate: "2026-05-15",
      priceMin: 200,
      priceMax: 205,
      invalidationPrice: 198,
      status: "confirmed",
      evidence: ["confirmed structure"],
    };
    const candidate: ChartAnnotation = {
      ...confirmed,
      id: "candidate-1",
      type: "Spring",
      status: "candidate",
      startDate: "2026-05-10",
      evidence: ["candidate structure"],
    };

    store.upsertSymbols([
      baseSymbol,
      { ...baseSymbol, symbol: "OTHER.JK", name: "Other Fixture" },
    ]);
    store.upsertBars(bars);
    store.replaceAnnotations("QUAL.JK", "1d", [candidate, confirmed]);

    try {
      expect(store.getSymbols({ family: "wyckoff", status: "confirmed" })).toEqual([
        expect.objectContaining({
          symbol: "QUAL.JK",
          latestAnnotations: ["SOS"],
          lastClose: 280,
          lastSyncedAt: "2026-06-30",
          dataQuality: {
            status: "ok",
            reasons: [],
            barCount: 180,
            lastBarDate: "2026-06-30",
          },
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("ranks PVA annotations as best examples without dropping their family label", () => {
    const store = createMarketStore(path.join(dir, "market.db"));
    const symbol: SymbolRecord = {
      symbol: "PVAX.JK",
      name: "PVA Fixture",
      sector: "Test",
      exchange: "IDX",
      isActive: true,
      source: "fixture",
      lastSeenAt: "2026-05-31T00:00:00.000Z",
    };
    const annotation: ChartAnnotation = {
      id: "pva-best",
      symbol: "PVAX.JK",
      timeframe: "1d",
      family: "pva",
      type: "Absorption",
      label: "Effort/result absorption",
      startDate: "2026-05-29",
      endDate: "2026-05-29",
      priceMin: 100,
      priceMax: 104,
      invalidationPrice: null,
      status: "confirmed",
      evidence: ["relative volume 2.10x with compressed spread"],
      confidence: 0.82,
      qualityScore: 0.82,
      quality: "strong",
    };

    store.upsertSymbols([symbol]);
    store.replaceAnnotations("PVAX.JK", "1d", [annotation]);

    try {
      expect(store.getBestExamples(4, "1d")).toEqual([
        expect.objectContaining({
          symbol: "PVAX.JK",
          annotationTypes: ["Absorption"],
          families: ["pva"],
          quality: "strong",
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("lists symbol codes without requiring summary data", () => {
    const store = createMarketStore(path.join(dir, "market.db"));
    const baseSymbol: SymbolRecord = {
      symbol: "CODEA.JK",
      name: "Code A Fixture",
      sector: "Test",
      exchange: "IDX",
      isActive: true,
      source: "fixture",
      lastSeenAt: "2026-05-31T00:00:00.000Z",
    };
    const annotation: ChartAnnotation = {
      id: "code-annotation",
      symbol: "CODEB.JK",
      timeframe: "1d",
      family: "elliott",
      type: "Wave 3",
      label: "Wave 3",
      startDate: "2026-05-29",
      endDate: "2026-05-29",
      priceMin: 100,
      priceMax: 120,
      invalidationPrice: null,
      status: "candidate",
      evidence: ["impulse extension"],
    };

    store.upsertSymbols([
      baseSymbol,
      { ...baseSymbol, symbol: "CODEB.JK", name: "Code B Fixture" },
    ]);
    store.replaceAnnotations("CODEB.JK", "1d", [annotation]);

    try {
      expect(store.listSymbolCodes()).toEqual(["CODEA.JK", "CODEB.JK"]);
      expect(store.listSymbolCodes({ query: "Code B" })).toEqual(["CODEB.JK"]);
      expect(store.listSymbolCodes({ family: "elliott", status: "candidate" })).toEqual(["CODEB.JK"]);
    } finally {
      store.close();
    }
  });

  it("returns only plausible or strong event examples ranked by quality and recency", () => {
    const store = createMarketStore(path.join(dir, "market.db"));
    const baseSymbol: SymbolRecord = {
      symbol: "STRONG.JK",
      name: "Strong Fixture",
      sector: "Test",
      exchange: "IDX",
      isActive: true,
      source: "fixture",
      lastSeenAt: "2026-05-31T00:00:00.000Z",
    };
    const annotation = (
      symbol: string,
      overrides: Partial<ChartAnnotation> = {},
    ): ChartAnnotation => ({
      id: `${symbol}-${overrides.timeframe ?? "1d"}-${overrides.type ?? "SOS"}`,
      symbol,
      timeframe: "1d",
      family: "wyckoff",
      type: "SOS",
      label: "Sign of Strength",
      startDate: "2026-05-18",
      endDate: "2026-05-20",
      priceMin: 100,
      priceMax: 120,
      invalidationPrice: 98,
      status: "candidate",
      evidence: ["rankable event fixture"],
      qualityScore: 0.7,
      quality: "plausible",
      ...overrides,
    });

    store.upsertSymbols([
      baseSymbol,
      { ...baseSymbol, symbol: "PLAUS.JK", name: "Plausible Fixture" },
      { ...baseSymbol, symbol: "WEAK.JK", name: "Weak Fixture" },
      { ...baseSymbol, symbol: "GUIDE.JK", name: "Guide Fixture" },
      { ...baseSymbol, symbol: "WEEK.JK", name: "Weekly Fixture" },
    ]);
    store.replaceAnnotations("STRONG.JK", "1d", [
      annotation("STRONG.JK", {
        status: "confirmed",
        qualityScore: 0.82,
        quality: "strong",
      }),
    ]);
    store.replaceAnnotations("PLAUS.JK", "1d", [
      annotation("PLAUS.JK", {
        family: "elliott",
        type: "Impulse",
        label: "Primary impulse",
        qualityScore: 0.76,
        quality: "plausible",
      }),
    ]);
    store.replaceAnnotations("WEAK.JK", "1d", [
      annotation("WEAK.JK", {
        qualityScore: 0.95,
        quality: "weak",
      }),
    ]);
    store.replaceAnnotations("GUIDE.JK", "1d", [
      annotation("GUIDE.JK", {
        type: "Fib Guide",
        label: "Fib Guide",
        qualityScore: 0.99,
        quality: "strong",
      }),
    ]);
    store.replaceAnnotations("WEEK.JK", "1w", [
      annotation("WEEK.JK", {
        timeframe: "1w",
        type: "LPS",
        label: "Last Point of Support",
        qualityScore: 0.8,
        quality: "strong",
      }),
    ]);

    try {
      expect(store.getBestExamples(10, "1d")).toEqual([
        expect.objectContaining({
          symbol: "STRONG.JK",
          timeframe: "1d",
          score: 0.9,
          quality: "strong",
          annotationTypes: ["SOS"],
          families: ["wyckoff"],
          lastAnnotationDate: "2026-05-20",
        }),
        expect.objectContaining({
          symbol: "PLAUS.JK",
          timeframe: "1d",
          score: 0.76,
          quality: "plausible",
          annotationTypes: ["Impulse"],
          families: ["elliott"],
        }),
      ]);
      expect(store.getBestExamples(10, "1w")).toEqual([
        expect.objectContaining({
          symbol: "WEEK.JK",
          timeframe: "1w",
          annotationTypes: ["LPS"],
        }),
      ]);
    } finally {
      store.close();
    }
  });
});
