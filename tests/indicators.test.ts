import { describe, expect, it } from "vitest";

import {
  averageTrueRange,
  awesomeOscillator,
  closeLocationValue,
  findPivotSwings,
  movingAverage,
  relativeStrengthIndex,
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

  it("computes close-based moving average only after enough bars exist", () => {
    const points = movingAverage(indicatorBars([100, 103, 102, 106, 105, 108]), 5);

    expect(points).toEqual([
      { time: "2026-02-05", value: 103.2 },
      { time: "2026-02-06", value: 104.8 },
    ]);
  });

  it("computes RSI with Wilder smoothing so momentum panes are reproducible", () => {
    const points = relativeStrengthIndex(indicatorBars([100, 103, 102, 106, 105, 108]), 3);

    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ time: "2026-02-04" });
    expect(points[0].value).toBeCloseTo(87.5, 5);
    expect(points[1].value).toBeCloseTo(73.68421, 5);
    expect(points[2].value).toBeCloseTo(84.61538, 5);
  });

  it("computes awesome oscillator from fast and slow median-price averages", () => {
    const medianPrices = [10, 12, 14, 16, 18];
    const points = awesomeOscillator(indicatorBars(medianPrices), 2, 4);

    expect(points).toEqual([
      { time: "2026-02-04", value: 2 },
      { time: "2026-02-05", value: 2 },
    ]);
  });
});

function indicatorBars(values: number[]): Bar[] {
  return values.map((value, index) => ({
    symbol: "TEST.JK",
    timeframe: "1d",
    date: `2026-02-${String(index + 1).padStart(2, "0")}`,
    open: value,
    high: value + 1,
    low: value - 1,
    close: value,
    adjClose: value,
    volume: 1000 + index * 100,
    source: "fixture",
  }));
}
