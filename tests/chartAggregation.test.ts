import { describe, expect, it } from "vitest";

import { aggregateBarsByCount } from "@/lib/market/chartAggregation";
import type { Bar } from "@/lib/market/types";

const bars: Bar[] = Array.from({ length: 6 }).map((_, index) => {
  const base = 100 + index * 10;
  return {
    symbol: "TEST.JK",
    timeframe: "1d",
    date: `2026-05-${String(index + 1).padStart(2, "0")}`,
    open: base,
    high: base + 7,
    low: base - 5,
    close: base + 2,
    adjClose: base + 2,
    volume: 1000 + index,
    source: "fixture",
  };
});

describe("aggregateBarsByCount", () => {
  it("keeps one-day bars untouched so 1D can show the full raw daily history", () => {
    expect(aggregateBarsByCount(bars, 1)).toEqual(bars);
  });

  it("builds compact OHLC candles from fixed-size trading-day groups", () => {
    expect(aggregateBarsByCount(bars, 5)).toEqual([
      {
        symbol: "TEST.JK",
        timeframe: "1d",
        date: "2026-05-05",
        open: 100,
        high: 147,
        low: 95,
        close: 142,
        adjClose: 142,
        volume: 5010,
        source: "fixture",
      },
      {
        symbol: "TEST.JK",
        timeframe: "1d",
        date: "2026-05-06",
        open: 150,
        high: 157,
        low: 145,
        close: 152,
        adjClose: 152,
        volume: 1005,
        source: "fixture",
      },
    ]);
  });
});
