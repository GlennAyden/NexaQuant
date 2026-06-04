import { describe, expect, it } from "vitest";

import { buildZigZagSwings } from "@/lib/analysis/swingEngine";
import type { Bar } from "@/lib/market/types";

function bar(index: number, close: number): Bar {
  return {
    symbol: "TEST.JK",
    timeframe: "1d",
    date: `2026-02-${String(index + 1).padStart(2, "0")}`,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    adjClose: close,
    volume: 1000 + index * 10,
    source: "fixture",
  };
}

describe("swingEngine", () => {
  it("keeps only meaningful alternating swings so Elliott counts are stable", () => {
    const bars = [100, 104, 111, 106, 118, 112, 126, 121, 132].map((close, index) =>
      bar(index, close),
    );

    const swings = buildZigZagSwings(bars, { reversalPercent: 4, pivotStrength: 1 });

    expect(swings.map((s) => `${s.kind}:${s.price}`)).toEqual([
      "high:113",
      "low:104",
      "high:120",
      "low:110",
      "high:128",
      "low:119",
    ]);
  });
});
