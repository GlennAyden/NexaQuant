import { describe, expect, it } from "vitest";

import { buildProjectionScenarios } from "@/lib/analysis/projectionEngine";
import type { Bar, ChartAnnotation } from "@/lib/market/types";

function bar(index: number, close = 100): Bar {
  return {
    symbol: "PROJ.JK",
    timeframe: "1d",
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: close,
    high: close + 2,
    low: close - 2,
    close,
    adjClose: close,
    volume: 1000,
    source: "fixture",
  };
}

function annotation(type: string, date: string, family: ChartAnnotation["family"] = "wyckoff"): ChartAnnotation {
  return {
    id: `${family}-${type}-${date}`,
    symbol: "PROJ.JK",
    timeframe: "1d",
    family,
    type,
    label: type,
    startDate: date,
    endDate: date,
    priceMin: 90,
    priceMax: 120,
    invalidationPrice: null,
    status: "candidate",
    evidence: ["fixture evidence"],
    confidence: 0.6,
  };
}

describe("projectionEngine", () => {
  it("builds a Wyckoff markup projection only after SOS/LPS evidence", () => {
    const bars = Array.from({ length: 12 }, (_, index) => bar(index, 118));
    const range = annotation("Trading Range", bars[3].date);
    range.startDate = bars[0].date;
    range.priceMin = 90;
    range.priceMax = 110;
    const st = annotation("ST", bars[4].date);
    const sos = annotation("SOS", bars[7].date);
    sos.priceMin = 90;
    sos.priceMax = 114;
    sos.invalidationPrice = 90;

    expect(buildProjectionScenarios([range, st], bars)).toEqual([]);

    const scenarios = buildProjectionScenarios([range, st, sos], bars);

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]).toMatchObject({
      id: "projection-wyckoff-markup-wyckoff-SOS-2026-01-08",
      family: "wyckoff",
      title: "Wyckoff markup projection",
      direction: "up",
      status: "active",
      targetZone: { min: 130, max: 140 },
      points: [
        { date: "2026-01-08", price: 114 },
        { date: "2026-01-28", price: 130 },
        { date: "2026-02-17", price: 140 },
      ],
    });
  });

  it("marks projection invalidated without drawing it as active later", () => {
    const bars = Array.from({ length: 12 }, (_, index) => bar(index, index === 11 ? 84 : 104));
    const range = annotation("Trading Range", bars[3].date);
    range.priceMin = 90;
    range.priceMax = 110;
    const sos = annotation("SOS", bars[7].date);
    sos.priceMax = 114;
    sos.invalidationPrice = 90;

    const scenarios = buildProjectionScenarios([range, sos], bars);

    expect(scenarios[0]).toMatchObject({
      status: "invalidated",
      conflicts: ["latest close has crossed the source invalidation level"],
    });
  });

  it("builds Elliott correction projection from primary impulse Fibonacci guide", () => {
    const bars = Array.from({ length: 8 }, (_, index) => bar(index, 150));
    const impulse = annotation("Impulse", bars[5].date, "elliott");
    impulse.invalidationPrice = 100;
    impulse.meta = {
      elliottWave: {
        pattern: "impulse",
        rank: "primary",
        direction: "up",
        points: [
          { label: "0", date: bars[0].date, price: 100 },
          { label: "1", date: bars[1].date, price: 112 },
          { label: "2", date: bars[2].date, price: 106 },
          { label: "3", date: bars[3].date, price: 132 },
          { label: "4", date: bars[4].date, price: 124 },
          { label: "5", date: bars[5].date, price: 146 },
        ],
      },
    };
    const fib = annotation("Fib Guide", bars[5].date, "structure");
    fib.meta = {
      retracement382: 128.4,
      retracement618: 117.6,
    };

    const scenarios = buildProjectionScenarios([impulse, fib], bars);

    expect(scenarios[0]).toMatchObject({
      id: "projection-elliott-correction-elliott-Impulse-2026-01-06",
      family: "elliott",
      direction: "down",
      status: "active",
      targetZone: { min: 117.6, max: 128.4 },
    });
  });

  it("adds confluence when Wyckoff and Elliott projection zones overlap", () => {
    const bars = Array.from({ length: 12 }, (_, index) => bar(index, 100));
    const range = annotation("Trading Range", bars[3].date);
    range.priceMin = 100;
    range.priceMax = 120;
    const sow = annotation("SOW", bars[7].date);
    sow.priceMin = 98;
    sow.priceMax = 120;
    sow.invalidationPrice = 125;
    const impulse = annotation("Impulse", bars[8].date, "elliott");
    impulse.invalidationPrice = 90;
    impulse.meta = {
      elliottWave: {
        rank: "primary",
        direction: "up",
        points: [
          { label: "0", date: bars[0].date, price: 90 },
          { label: "1", date: bars[1].date, price: 110 },
          { label: "2", date: bars[2].date, price: 96 },
          { label: "3", date: bars[3].date, price: 130 },
          { label: "4", date: bars[4].date, price: 118 },
          { label: "5", date: bars[8].date, price: 140 },
        ],
      },
    };
    const fib = annotation("Fib Guide", bars[8].date, "structure");
    fib.meta = {
      retracement382: 110,
      retracement618: 80,
    };

    const scenarios = buildProjectionScenarios([range, sow, impulse, fib], bars);

    expect(scenarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: "confluence",
          status: "active",
          direction: "down",
        }),
      ]),
    );
  });
});
