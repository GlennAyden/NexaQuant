import { describe, expect, it } from "vitest";

import {
  averageTrueRange,
  closeLocationValue,
  findPivotSwings,
  volumeSma,
} from "@/lib/analysis/indicators";
import type { Bar } from "@/lib/market/types";

const bars: Bar[] = [
  { symbol: "TEST.JK", timeframe: "1d", date: "2026-01-01", open: 100, high: 110, low: 95, close: 108, adjClose: 108, volume: 1000, source: "fixture" },
  { symbol: "TEST.JK", timeframe: "1d", date: "2026-01-02", open: 108, high: 112, low: 104, close: 106, adjClose: 106, volume: 1200, source: "fixture" },
  { symbol: "TEST.JK", timeframe: "1d", date: "2026-01-03", open: 106, high: 116, low: 105, close: 115, adjClose: 115, volume: 1600, source: "fixture" },
  { symbol: "TEST.JK", timeframe: "1d", date: "2026-01-04", open: 115, high: 117, low: 109, close: 110, adjClose: 110, volume: 900, source: "fixture" },
  { symbol: "TEST.JK", timeframe: "1d", date: "2026-01-05", open: 110, high: 119, low: 108, close: 118, adjClose: 118, volume: 2000, source: "fixture" },
];

describe("indicators", () => {
  it("computes ATR from true range so volatility uses gaps and candle range", () => {
    expect(averageTrueRange(bars, 3)).toBeCloseTo(10, 5);
  });

  it("computes rolling volume average for effort/result checks", () => {
    expect(volumeSma(bars, 3)).toBeCloseTo(1500, 5);
  });

  it("computes close location value near the top of the candle", () => {
    expect(closeLocationValue(bars[0])).toBeCloseTo(0.86666, 4);
  });

  it("finds deterministic pivot swings from local highs and lows", () => {
    const swings = findPivotSwings(bars, 1);

    expect(swings.map((s) => `${s.kind}:${s.date}:${s.price}`)).toEqual([
      "high:2026-01-03:116",
      "low:2026-01-04:109",
    ]);
  });
});
