import { describe, expect, it } from "vitest";

import { detectElliott } from "@/lib/analysis/elliottEngine";
import type { SwingPoint } from "@/lib/market/types";

const upImpulse: SwingPoint[] = [
  { kind: "low", index: 0, date: "2026-01-01", price: 100 },
  { kind: "high", index: 1, date: "2026-01-02", price: 115 },
  { kind: "low", index: 2, date: "2026-01-03", price: 106 },
  { kind: "high", index: 3, date: "2026-01-04", price: 136 },
  { kind: "low", index: 4, date: "2026-01-05", price: 124 },
  { kind: "high", index: 5, date: "2026-01-06", price: 146 },
  { kind: "low", index: 6, date: "2026-01-07", price: 132 },
  { kind: "high", index: 7, date: "2026-01-08", price: 141 },
  { kind: "low", index: 8, date: "2026-01-09", price: 128 },
];

const downImpulse: SwingPoint[] = [
  { kind: "high", index: 0, date: "2026-03-01", price: 146 },
  { kind: "low", index: 1, date: "2026-03-02", price: 131 },
  { kind: "high", index: 2, date: "2026-03-03", price: 140 },
  { kind: "low", index: 3, date: "2026-03-04", price: 110 },
  { kind: "high", index: 4, date: "2026-03-05", price: 122 },
  { kind: "low", index: 5, date: "2026-03-06", price: 100 },
];

describe("elliottEngine", () => {
  it("creates a valid primary 1-5 impulse and ABC correction candidate", () => {
    const annotations = detectElliott("ELLI.JK", "1d", upImpulse, { strictOverlap: false });
    const impulse = annotations.find((a) => a.type === "Impulse");
    const correction = annotations.find((a) => a.type === "Correction");

    expect(annotations.map((a) => a.type)).toEqual(expect.arrayContaining(["Impulse", "Correction"]));
    expect(impulse?.evidence).toEqual(
      expect.arrayContaining([
        "Wave 2 retraces less than 100% of Wave 1",
        "Wave 3 extends beyond Wave 1 and is not the shortest motive wave",
      ]),
    );
    expect(impulse?.meta?.elliottWave).toMatchObject({
      pattern: "impulse",
      rank: "primary",
      direction: "up",
      points: [
        { label: "0", date: "2026-01-01", price: 100 },
        { label: "1", date: "2026-01-02", price: 115 },
        { label: "2", date: "2026-01-03", price: 106 },
        { label: "3", date: "2026-01-04", price: 136 },
        { label: "4", date: "2026-01-05", price: 124 },
        { label: "5", date: "2026-01-06", price: 146 },
      ],
    });
    expect(correction?.meta?.elliottWave).toMatchObject({
      pattern: "correction",
      points: [
        { label: "A", date: "2026-01-07", price: 132 },
        { label: "B", date: "2026-01-08", price: 141 },
        { label: "C", date: "2026-01-09", price: 128 },
      ],
    });
  });

  it("rejects an impulse when Wave 2 retraces beyond the Wave 1 origin", () => {
    const invalid = [...upImpulse];
    invalid[2] = { ...invalid[2], price: 98 };

    const annotations = detectElliott("ELLI.JK", "1d", invalid);

    expect(annotations.some((a) => a.type === "Impulse")).toBe(false);
  });

  it("rejects an impulse when Wave 3 is the shortest motive wave", () => {
    const invalid = [...upImpulse];
    invalid[3] = { ...invalid[3], price: 120 };
    invalid[5] = { ...invalid[5], price: 145 };

    const annotations = detectElliott("ELLI.JK", "1d", invalid);

    expect(annotations.some((a) => a.type === "Impulse")).toBe(false);
  });

  it("scans alternate impulse windows and emits a Fibonacci guide for the primary count", () => {
    const offsetImpulse: SwingPoint[] = [
      { kind: "high", index: 0, date: "2025-12-30", price: 108 },
      { kind: "low", index: 1, date: "2025-12-31", price: 100 },
      ...upImpulse.map((point) => ({
        ...point,
        index: point.index + 2,
        date: `2026-02-${String(point.index + 1).padStart(2, "0")}`,
      })),
      { kind: "low", index: 10, date: "2026-02-07", price: 132 },
      { kind: "high", index: 11, date: "2026-02-08", price: 141 },
      { kind: "low", index: 12, date: "2026-02-09", price: 128 },
    ];

    const annotations = detectElliott("ELLI.JK", "1d", offsetImpulse, { strictOverlap: false });
    const impulse = annotations.find((annotation) => annotation.type === "Impulse");
    const fibGuide = annotations.find((annotation) => annotation.type === "Fib Guide");

    expect(impulse).toMatchObject({
      label: expect.stringContaining("Primary"),
      confidence: expect.any(Number),
      phase: "1-5",
    });
    expect(fibGuide).toMatchObject({
      family: "structure",
      label: expect.stringContaining("38.2%"),
      confidence: 0.5,
    });
    expect(annotations.filter((annotation) => annotation.type === "Impulse").length).toBeGreaterThanOrEqual(1);
  });

  it("creates a bearish impulse candidate without advice wording", () => {
    const annotations = detectElliott("ELLI.JK", "1d", downImpulse, { strictOverlap: false });
    const impulse = annotations.find((annotation) => annotation.type === "Impulse");

    expect(impulse).toMatchObject({
      label: expect.stringContaining("Primary"),
      invalidationPrice: 146,
      meta: {
        elliottWave: {
        pattern: "impulse",
        rank: "primary",
        direction: "down",
        points: [
          { label: "0", date: "2026-03-01", price: 146 },
          { label: "1", date: "2026-03-02", price: 131 },
          { label: "2", date: "2026-03-03", price: 140 },
          { label: "3", date: "2026-03-04", price: 110 },
          { label: "4", date: "2026-03-05", price: 122 },
          { label: "5", date: "2026-03-06", price: 100 },
        ],
        },
      },
      phase: "1-5",
      priceMin: 100,
      priceMax: 146,
      status: "candidate",
    });
    expect(impulse?.evidence).toEqual(
      expect.arrayContaining([
        "Wave 2 retraces less than 100% of Wave 1",
        "Wave 3 extends beyond Wave 1 and is not the shortest motive wave",
      ]),
    );
    expect(`${impulse?.label} ${impulse?.evidence.join(" ")}`).not.toMatch(/buy|sell/i);
  });
});
