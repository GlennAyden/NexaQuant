import { describe, expect, it } from "vitest";

import { findHistoricalAnalogs } from "@/lib/research/historicalAnalog";
import type { Bar } from "@/lib/market/types";

function bar(index: number, close: number, volume: number): Bar {
  return {
    symbol: "ANLG.JK",
    timeframe: "1d",
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: close,
    high: close + 2,
    low: close - 2,
    close,
    adjClose: close,
    volume,
    source: "fixture",
  };
}

describe("historicalAnalog research", () => {
  it("finds prior non-overlapping windows ranked by normalized path similarity", () => {
    const bars = [
      bar(0, 100, 1000),
      bar(1, 120, 1200),
      bar(2, 110, 1400),
      bar(3, 140, 1600),
      bar(4, 147, 1700),
      bar(5, 154, 1800),
      bar(6, 90, 900),
      bar(7, 91, 850),
      bar(8, 10, 2000),
      bar(9, 12, 2400),
      bar(10, 11, 2800),
      bar(11, 14, 3200),
    ];

    const matches = findHistoricalAnalogs(bars, { windowSize: 4, horizonBars: 2, maxResults: 2 });

    expect(matches[0]).toMatchObject({
      startDate: "2026-01-01",
      endDate: "2026-01-04",
      similarity: 1,
      forwardReturnPct: 10,
    });
    expect(matches[0].evidence).toEqual(
      expect.arrayContaining([
        "normalized close path distance: 0.0000",
        "forward return uses the next 2 bars after the analog window",
      ]),
    );
    expect(matches.every((match) => match.endDate < "2026-01-09")).toBe(true);
  });

  it("returns an empty list when there are not enough bars for a prior window", () => {
    const bars = [bar(0, 10, 100), bar(1, 11, 110), bar(2, 12, 120), bar(3, 13, 130)];

    expect(findHistoricalAnalogs(bars, { windowSize: 3, horizonBars: 1 })).toEqual([]);
  });
});
