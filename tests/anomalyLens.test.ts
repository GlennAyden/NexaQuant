import { describe, expect, it } from "vitest";

import { buildAnomalyLens } from "@/lib/market/anomalyLens";
import type { Bar } from "@/lib/market/types";

describe("anomaly lens", () => {
  it("detects volume, range, and return anomalies against prior local context", () => {
    const anomalies = buildAnomalyLens([
      bar("2026-06-10", 100, 99, 101, 100, 1_000),
      bar("2026-06-11", 101, 100, 102, 101, 1_050),
      bar("2026-06-12", 102, 101, 103, 102, 1_100),
      bar("2026-06-13", 112, 100, 116, 112, 4_000),
    ], { lookback: 3 });

    expect(anomalies).toEqual([
      expect.objectContaining({
        date: "2026-06-13",
        score: expect.any(Number),
        labels: expect.arrayContaining(["Volume", "Range", "Return"]),
      }),
    ]);
  });

  it("keeps quiet bars out of the anomaly layer", () => {
    const anomalies = buildAnomalyLens([
      bar("2026-06-10", 100, 99, 101, 100, 1_000),
      bar("2026-06-11", 101, 100, 102, 101, 1_050),
      bar("2026-06-12", 102, 101, 103, 102, 1_100),
      bar("2026-06-13", 103, 102, 104, 103, 1_150),
    ], { lookback: 3 });

    expect(anomalies).toEqual([]);
  });
});

function bar(date: string, open: number, low: number, high: number, close: number, volume: number): Bar {
  return {
    symbol: "BBCA.JK",
    timeframe: "1d",
    date,
    open,
    high,
    low,
    close,
    adjClose: close,
    volume,
    source: "fixture",
  };
}
