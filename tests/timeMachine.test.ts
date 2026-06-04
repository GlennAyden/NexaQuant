import { describe, expect, it } from "vitest";

import { detectWyckoff } from "@/lib/analysis/wyckoffEngine";
import {
  buildRecalculatedTimeMachineSnapshot,
  buildTimeMachineSnapshot,
} from "@/lib/research/timeMachine";
import type { Bar, ChartAnnotation } from "@/lib/market/types";

function bar(index: number): Bar {
  const close = 100 + index;
  return {
    symbol: "TIME.JK",
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

function annotation(id: string, endDate: string): ChartAnnotation {
  return {
    id,
    symbol: "TIME.JK",
    timeframe: "1d",
    family: "wyckoff",
    type: id,
    label: id,
    startDate: endDate,
    endDate,
    priceMin: 90,
    priceMax: 110,
    invalidationPrice: null,
    status: "candidate",
    evidence: [`${id} evidence`],
    confidence: 0.6,
  };
}

function wyckoffBar(index: number, close: number, volume: number, high = close + 2, low = close - 2): Bar {
  return {
    symbol: "TIME.JK",
    timeframe: "1d",
    date: `2026-03-${String(index + 1).padStart(2, "0")}`,
    open: close,
    high,
    low,
    close,
    adjClose: close,
    volume,
    source: "fixture",
  };
}

function accumulationBars(): Bar[] {
  return [
    ...[130, 124, 118, 112, 105].map((close, index) => wyckoffBar(index, close, 1000 + index * 100)),
    wyckoffBar(5, 96, 4200, 105, 90),
    wyckoffBar(6, 111, 2500, 114, 100),
    wyckoffBar(7, 101, 1500, 104, 96),
    wyckoffBar(8, 108, 1300, 112, 98),
    wyckoffBar(9, 94, 3800, 103, 88),
    wyckoffBar(10, 109, 2400, 112, 99),
    wyckoffBar(11, 121, 4300, 124, 110),
    wyckoffBar(12, 115, 1900, 119, 111),
  ];
}

describe("timeMachine", () => {
  it("clamps cursor and hides annotations that are not complete as of the cursor date", () => {
    const bars = Array.from({ length: 4 }, (_, index) => bar(index));
    const annotations = [
      annotation("early", "2026-01-01"),
      annotation("current", "2026-01-03"),
      annotation("future", "2026-01-04"),
    ];

    const snapshot = buildTimeMachineSnapshot(bars, annotations, 99);

    expect(snapshot.asOfDate).toBe("2026-01-04");
    expect(snapshot.visibleBars).toEqual(bars);
    expect(snapshot.visibleAnnotations.map((item) => item.id)).toEqual(["early", "current", "future"]);
    expect(snapshot.hiddenAnnotationCount).toBe(0);
    expect(snapshot.progressPct).toBe(100);
    expect(snapshot.calculationMode).toBe("filtered");
  });

  it("returns newest visible active events without adding advice wording", () => {
    const bars = Array.from({ length: 8 }, (_, index) => bar(index));
    const annotations = Array.from({ length: 7 }, (_, index) =>
      annotation(`event-${index + 1}`, bars[index].date),
    );

    const snapshot = buildTimeMachineSnapshot(bars, annotations, 5);

    expect(snapshot.asOfDate).toBe("2026-01-06");
    expect(snapshot.visibleBars.map((item) => item.date)).toEqual(bars.slice(0, 6).map((item) => item.date));
    expect(snapshot.visibleAnnotations.map((item) => item.id)).toEqual([
      "event-1",
      "event-2",
      "event-3",
      "event-4",
      "event-5",
      "event-6",
    ]);
    expect(snapshot.activeEvents.map((item) => item.id)).toEqual([
      "event-6",
      "event-5",
      "event-4",
      "event-3",
      "event-2",
    ]);
    expect(snapshot.hiddenAnnotationCount).toBe(1);
    expect(JSON.stringify(snapshot)).not.toMatch(/\b(?:buy|sell)\b/i);
  });

  it("clamps a negative cursor to the first bar", () => {
    const bars = Array.from({ length: 3 }, (_, index) => bar(index));

    const snapshot = buildTimeMachineSnapshot(bars, [], -4);

    expect(snapshot.asOfDate).toBe("2026-01-01");
    expect(snapshot.visibleBars).toEqual([bars[0]]);
    expect(snapshot.progressPct).toBe(0);
  });

  it("recalculates from cursor bars so full-chart future evidence cannot surface an early event", () => {
    const bars = accumulationBars();
    const fullAnnotations = detectWyckoff(bars, { mode: "loose" });
    const cursorIndex = 5;

    const filteredSnapshot = buildTimeMachineSnapshot(bars, fullAnnotations, cursorIndex);
    const recalculatedSnapshot = buildRecalculatedTimeMachineSnapshot(bars, cursorIndex, {
      fullAnnotationCount: fullAnnotations.length,
      analysisMode: "loose",
    });

    expect(fullAnnotations).toEqual(expect.arrayContaining([expect.objectContaining({ type: "SC" })]));
    expect(filteredSnapshot.visibleAnnotations).toEqual(expect.arrayContaining([expect.objectContaining({ type: "SC" })]));
    expect(recalculatedSnapshot.asOfDate).toBe("2026-03-06");
    expect(recalculatedSnapshot.visibleBars).toEqual(bars.slice(0, cursorIndex + 1));
    expect(recalculatedSnapshot.visibleAnnotations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "SC" })]),
    );
    expect(recalculatedSnapshot.activeEvents).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "SC" })]),
    );
    expect(recalculatedSnapshot.calculationMode).toBe("recalculated");
    expect(recalculatedSnapshot.hiddenAnnotationCount).toBeGreaterThan(0);
  });

  it("returns recalculated annotations at the last cursor", () => {
    const bars = accumulationBars();

    const snapshot = buildRecalculatedTimeMachineSnapshot(bars, bars.length - 1, { analysisMode: "loose" });

    expect(snapshot.calculationMode).toBe("recalculated");
    expect(snapshot.asOfDate).toBe("2026-03-13");
    expect(snapshot.visibleBars).toEqual(bars);
    expect(snapshot.visibleAnnotations).toEqual(expect.arrayContaining([expect.objectContaining({ type: "SC" })]));
    expect(snapshot.activeEvents).toEqual([...snapshot.visibleAnnotations].sort((left, right) => {
      const dateOrder = right.endDate.localeCompare(left.endDate);
      return dateOrder === 0 ? left.id.localeCompare(right.id) : dateOrder;
    }).slice(0, 5));
    expect(snapshot.hiddenAnnotationCount).toBe(0);
  });

  it("marks existing filtered snapshots with calculationMode filtered", () => {
    const bars = Array.from({ length: 2 }, (_, index) => bar(index));

    const snapshot = buildTimeMachineSnapshot(bars, [], 1);

    expect(snapshot.calculationMode).toBe("filtered");
  });
});
