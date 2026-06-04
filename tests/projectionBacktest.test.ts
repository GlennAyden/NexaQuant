import { describe, expect, it } from "vitest";

import type { ProjectionScenario } from "@/lib/analysis/projectionEngine";
import { evaluateProjectionOutcomes } from "@/lib/backtest/projectionBacktest";
import type { Bar } from "@/lib/market/types";

function bar(index: number, high: number, low: number, close: number): Bar {
  return {
    symbol: "PROJ.JK",
    timeframe: "1d",
    date: `2026-02-${String(index + 1).padStart(2, "0")}`,
    open: close,
    high,
    low,
    close,
    adjClose: close,
    volume: 1000,
    source: "fixture",
  };
}

function projection(direction: "up" | "down" = "up"): ProjectionScenario {
  return {
    id: `projection-${direction}`,
    family: "wyckoff",
    title: "Fixture projection",
    direction,
    status: "active",
    sourceAnnotationIds: ["source"],
    startDate: "2026-02-01",
    startPrice: 100,
    invalidationPrice: direction === "up" ? 90 : 110,
    targetZone: direction === "up" ? { min: 120, max: 130 } : { min: 70, max: 80 },
    points: [
      { date: "2026-02-01", price: 100 },
      { date: "2026-02-21", price: direction === "up" ? 120 : 80 },
    ],
    evidence: ["fixture"],
    conflicts: [],
    confidence: 0.6,
  };
}

describe("projectionBacktest", () => {
  it("detects target hit before horizon expiry", () => {
    const bars = [
      bar(0, 102, 98, 100),
      bar(1, 110, 97, 108),
      bar(2, 121, 105, 120),
      bar(3, 118, 106, 116),
    ];

    const outcomes = evaluateProjectionOutcomes(bars, [projection("up")], [3]);

    expect(outcomes[0]).toMatchObject({
      projectionId: "projection-up",
      status: "target_hit",
      barsElapsed: 2,
      targetPrice: 120,
    });
  });

  it("detects invalidation before target hit", () => {
    const bars = [
      bar(0, 102, 98, 100),
      bar(1, 108, 88, 92),
      bar(2, 125, 118, 122),
    ];

    const outcomes = evaluateProjectionOutcomes(bars, [projection("up")], [3]);

    expect(outcomes[0]).toMatchObject({
      status: "invalidated",
      barsElapsed: 1,
    });
  });

  it("marks projection pending when future bars are still missing", () => {
    const bars = [
      bar(0, 102, 98, 100),
      bar(1, 108, 95, 104),
    ];

    const outcomes = evaluateProjectionOutcomes(bars, [projection("up")], [5]);

    expect(outcomes[0]).toMatchObject({
      status: "pending",
      barsElapsed: 1,
    });
  });
});
