import { describe, expect, it } from "vitest";

import { evaluateAnnotationOutcomes } from "@/lib/backtest/eventBacktest";
import type { Bar, ChartAnnotation } from "@/lib/market/types";

function bar(index: number, close: number): Bar {
  return {
    symbol: "BTST.JK",
    timeframe: "1d",
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    adjClose: close,
    volume: 1000,
    source: "fixture",
  };
}

describe("eventBacktest", () => {
  it("summarizes forward returns after structure annotations without producing advice", () => {
    const bars = [100, 102, 104, 108, 112, 116, 120].map((close, index) => bar(index, close));
    const annotations: ChartAnnotation[] = [{
      id: "spring-1",
      symbol: "BTST.JK",
      timeframe: "1d",
      family: "wyckoff",
      type: "Spring",
      label: "Spring",
      startDate: "2026-01-02",
      endDate: "2026-01-02",
      priceMin: 98,
      priceMax: 110,
      invalidationPrice: 97,
      status: "candidate",
      evidence: ["fixture event"],
    }];

    const outcomes = evaluateAnnotationOutcomes(bars, annotations, [3, 20]);

    expect(outcomes[0]).toMatchObject({
      annotationId: "spring-1",
      eventType: "Spring",
      horizonBars: 3,
      status: "complete",
      returnPct: expect.closeTo(13.72, 2),
    });
    expect(outcomes[1]).toMatchObject({
      horizonBars: 20,
      status: "pending",
      returnPct: null,
    });
    expect(JSON.stringify(outcomes)).not.toMatch(/\b(buy|sell)\b/i);
  });
});
