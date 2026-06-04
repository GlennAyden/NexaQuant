import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/recalculate/route";

const mocks = vi.hoisted(() => ({
  store: {
    listSymbolCodes: vi.fn(),
    getWatchlist: vi.fn(),
  },
  getMarketStore: vi.fn(),
  recalculateSymbol: vi.fn(),
  recalculateSymbols: vi.fn(),
}));

vi.mock("@/lib/market/marketStore", () => ({
  getMarketStore: mocks.getMarketStore,
}));

vi.mock("@/lib/market/syncService", () => ({
  recalculateSymbol: mocks.recalculateSymbol,
  recalculateSymbols: mocks.recalculateSymbols,
}));

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/recalculate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/recalculate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMarketStore.mockReturnValue(mocks.store);
    mocks.store.listSymbolCodes.mockReturnValue(["BBCA.JK", "TLKM.JK"]);
    mocks.store.getWatchlist.mockReturnValue([{ symbol: "BBCA.JK" }]);
    mocks.recalculateSymbol.mockReturnValue([{ id: "single-annotation" }]);
    mocks.recalculateSymbols.mockImplementation((_store, symbols: string[], timeframe: string) => ({
      total: symbols.length,
      successCount: symbols.length,
      failedCount: 0,
      errors: {},
      symbols: symbols.map((symbol) => ({
        symbol,
        timeframe,
        annotationCount: timeframe === "1d" ? 2 : 3,
      })),
    }));
  });

  it("passes analysisMode into single-symbol recalculation", async () => {
    const response = await POST(request({
      symbol: "bbca.jk",
      timeframe: "1d",
      analysisMode: "loose",
    }));

    expect(response.status).toBe(200);
    expect(mocks.recalculateSymbol).toHaveBeenCalledWith(
      mocks.store,
      "BBCA.JK",
      "1d",
      { analysisMode: "loose" },
    );
    expect(await response.json()).toMatchObject({
      symbol: "BBCA.JK",
      analysisMode: "loose",
      timeframes: ["1d"],
    });
  });

  it("recalculates all cached symbols for both daily and weekly timeframes", async () => {
    const response = await POST(request({
      mode: "all",
      timeframe: "all",
      analysisMode: "strict",
    }));

    expect(response.status).toBe(200);
    expect(mocks.recalculateSymbols).toHaveBeenCalledTimes(2);
    expect(mocks.recalculateSymbols).toHaveBeenNthCalledWith(
      1,
      mocks.store,
      ["BBCA.JK", "TLKM.JK"],
      "1d",
      { analysisMode: "strict" },
    );
    expect(mocks.recalculateSymbols).toHaveBeenNthCalledWith(
      2,
      mocks.store,
      ["BBCA.JK", "TLKM.JK"],
      "1w",
      { analysisMode: "strict" },
    );
    const body = await response.json();
    expect(body).toMatchObject({
      timeframes: ["1d", "1w"],
      analysisMode: "strict",
      total: 4,
      successCount: 4,
      failedCount: 0,
      errors: {},
    });
    expect(body.symbols).toEqual([
      { symbol: "BBCA.JK", timeframe: "1d", annotationCount: 2 },
      { symbol: "TLKM.JK", timeframe: "1d", annotationCount: 2 },
      { symbol: "BBCA.JK", timeframe: "1w", annotationCount: 3 },
      { symbol: "TLKM.JK", timeframe: "1w", annotationCount: 3 },
    ]);
    expect(body.results.map((result: { timeframe: string }) => result.timeframe)).toEqual(["1d", "1w"]);
  });

  it("fails loudly when analysisMode is not strict or loose", async () => {
    const response = await POST(request({
      mode: "selected",
      symbols: ["BBCA.JK"],
      timeframe: "1d",
      analysisMode: "optimistic",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "analysisMode must be strict or loose" });
    expect(mocks.recalculateSymbol).not.toHaveBeenCalled();
    expect(mocks.recalculateSymbols).not.toHaveBeenCalled();
  });
});
