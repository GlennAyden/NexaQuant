import { describe, expect, it } from "vitest";

import { detectWyckoff } from "@/lib/analysis/wyckoffEngine";
import type { Bar } from "@/lib/market/types";

function makeBar(index: number, close: number, volume: number, high = close + 2, low = close - 2): Bar {
  return {
    symbol: "WYCK.JK",
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

describe("wyckoffEngine", () => {
  it("labels accumulation range events through Spring and SOS without creating advice", () => {
    const bars = [
      ...[130, 124, 118, 112, 105].map((close, i) => makeBar(i, close, 1000 + i * 100)),
      makeBar(5, 96, 4200, 105, 90),
      makeBar(6, 111, 2500, 114, 100),
      makeBar(7, 101, 1500, 104, 96),
      makeBar(8, 108, 1300, 112, 98),
      makeBar(9, 94, 3800, 103, 88),
      makeBar(10, 109, 2400, 112, 99),
      makeBar(11, 121, 4300, 124, 110),
      makeBar(12, 115, 1900, 119, 111),
    ];

    const annotations = detectWyckoff(bars, { mode: "loose" });

    expect(annotations.map((a) => a.type)).toEqual(
      expect.arrayContaining(["SC", "AR", "ST", "Spring", "SOS", "LPS"]),
    );
    expect(annotations.every((a) => !/buy|sell/i.test(`${a.label} ${a.evidence.join(" ")}`))).toBe(true);
  });

  it("adds accumulation PS, Test, and Phase E when price-volume evidence exists", () => {
    const bars = [
      ...[130, 124, 118, 112, 105].map((close, i) => makeBar(i, close, 1000 + i * 100)),
      makeBar(5, 96, 4200, 105, 90),
      makeBar(6, 111, 2500, 114, 100),
      makeBar(7, 101, 1500, 104, 96),
      makeBar(8, 108, 1300, 112, 98),
      makeBar(9, 94, 3800, 103, 88),
      makeBar(10, 109, 2400, 112, 99),
      makeBar(11, 121, 4300, 124, 110),
      makeBar(12, 115, 1900, 119, 111),
    ];

    const annotations = detectWyckoff(bars, { mode: "loose" });

    expect(annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: "wyckoff", type: "PS", phase: "A" }),
        expect.objectContaining({ family: "wyckoff", type: "Test", phase: "C" }),
        expect.objectContaining({ family: "wyckoff", type: "Phase E", phase: "E" }),
      ]),
    );
  });

  it("labels distribution inverse events when supply dominates a range", () => {
    const bars = [
      ...[80, 88, 95, 102, 110].map((close, i) => makeBar(i, close, 1000 + i * 100)),
      makeBar(5, 122, 4200, 128, 116),
      makeBar(6, 108, 2600, 121, 105),
      makeBar(7, 120, 1600, 125, 116),
      makeBar(8, 114, 1300, 123, 109),
      makeBar(9, 130, 3900, 136, 120),
      makeBar(10, 112, 2600, 124, 108),
      makeBar(11, 98, 4300, 110, 94),
    ];

    const annotations = detectWyckoff(bars, { mode: "loose" });

    expect(annotations.map((a) => a.type)).toEqual(
      expect.arrayContaining(["BC", "AR", "ST", "UTAD", "SOW", "LPSY"]),
    );
  });

  it("adds distribution PSY, UT, and Phase E when price-volume evidence exists", () => {
    const bars = [
      ...[80, 88, 95, 102, 110].map((close, i) => makeBar(i, close, 1000 + i * 100)),
      makeBar(5, 122, 4200, 128, 116),
      makeBar(6, 108, 2600, 121, 105),
      makeBar(7, 120, 1600, 125, 116),
      makeBar(8, 114, 1300, 123, 109),
      makeBar(9, 130, 3900, 136, 120),
      makeBar(10, 112, 2600, 124, 108),
      makeBar(11, 98, 4300, 110, 94),
    ];

    const annotations = detectWyckoff(bars, { mode: "loose" });

    expect(annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: "wyckoff", type: "PSY", phase: "A" }),
        expect.objectContaining({ family: "wyckoff", type: "UT", phase: "B" }),
        expect.objectContaining({ family: "wyckoff", type: "Phase E", phase: "E" }),
      ]),
    );
  });

  it("adds Wyckoff phase and confidence evidence for a bounded trading range", () => {
    const bars = [
      ...[130, 124, 118, 112, 105].map((close, i) => makeBar(i, close, 1000 + i * 100)),
      makeBar(5, 96, 4200, 105, 90),
      makeBar(6, 111, 2500, 114, 100),
      makeBar(7, 101, 1500, 104, 96),
      makeBar(8, 108, 1300, 112, 98),
      makeBar(9, 94, 3800, 103, 88),
      makeBar(10, 109, 2400, 112, 99),
      makeBar(11, 121, 4300, 124, 110),
      makeBar(12, 115, 1900, 119, 111),
    ];

    const annotations = detectWyckoff(bars, { mode: "loose" });
    const range = annotations.find((annotation) => annotation.type === "Trading Range");
    const spring = annotations.find((annotation) => annotation.type === "Spring");

    expect(range).toMatchObject({
      phase: "B",
      status: "candidate",
      confidence: expect.any(Number),
    });
    expect(range?.confidence).toBeGreaterThan(0.45);
    expect(spring).toMatchObject({
      phase: "C",
      confidence: expect.any(Number),
    });
  });

  it("strict mode reports no valid range instead of labeling a runaway trend", () => {
    const bars = Array.from({ length: 30 }, (_, index) =>
      makeBar(index, 80 + index * 4, 1000, 82 + index * 4, 78 + index * 4),
    );

    const annotations = detectWyckoff(bars);

    expect(annotations).toEqual([
      expect.objectContaining({
        type: "No Valid Range",
        status: "insufficient_data",
        quality: "weak",
      }),
    ]);
  });
});
