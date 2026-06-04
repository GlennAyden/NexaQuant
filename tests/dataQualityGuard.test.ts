import { describe, expect, it } from "vitest";

import { buildDataQualityGuard } from "@/lib/research/dataQualityGuard";
import type { Bar, DataQuality } from "@/lib/market/types";

function bar(index: number, overrides: Partial<Bar> = {}): Bar {
  const close = overrides.close ?? 100;
  return {
    symbol: "DQG.JK",
    timeframe: "1d",
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: overrides.open ?? close,
    high: overrides.high ?? close + 2,
    low: overrides.low ?? close - 2,
    close,
    adjClose: overrides.adjClose ?? close,
    volume: overrides.volume ?? 1000,
    source: "fixture",
  };
}

function bars(count: number, build: (index: number) => Partial<Bar> = () => ({})): Bar[] {
  return Array.from({ length: count }, (_, index) => bar(index, build(index)));
}

describe("data quality guard", () => {
  it("blocks research when fewer than sixty bars are available", () => {
    const guard = buildDataQualityGuard(bars(59));

    expect(guard).toMatchObject({
      status: "blocked",
      blockers: expect.arrayContaining(["fewer than 60 bars available"]),
    });
    expect(guard.score).toBeLessThan(0.5);
    expect(JSON.stringify(guard)).not.toMatch(/\b(buy|sell)\b/i);
  });

  it("blocks when missing volume covers at least thirty-five percent of bars", () => {
    const guard = buildDataQualityGuard(bars(100, (index) => ({ volume: index < 35 ? 0 : 1000 })));

    expect(guard.status).toBe("blocked");
    expect(guard.blockers).toEqual(expect.arrayContaining(["missing volume ratio 35%"]));
  });

  it("blocks when upstream quality marks the data as insufficient", () => {
    const dataQuality: DataQuality = {
      status: "insufficient_data",
      reasons: ["provider returned too few rows"],
      barCount: 220,
      lastBarDate: "2026-05-29",
    };

    const guard = buildDataQualityGuard(bars(220), dataQuality);

    expect(guard.status).toBe("blocked");
    expect(guard.blockers).toEqual(expect.arrayContaining(["upstream data quality is insufficient_data"]));
  });

  it("cautions on short history, stale quality, zero-volume bars, and extreme gaps", () => {
    const guardedBars = bars(100, (index) => {
      if (index < 12) {
        return { volume: 0 };
      }
      if (index >= 12 && index < 20) {
        return { open: 130, close: 100 };
      }
      return {};
    });
    const dataQuality: DataQuality = {
      status: "stale",
      reasons: ["last bar is older than expected"],
      barCount: 100,
      lastBarDate: "2026-04-01",
    };

    const guard = buildDataQualityGuard(guardedBars, dataQuality);

    expect(guard.status).toBe("caution");
    expect(guard.reasons).toEqual(expect.arrayContaining([
      "fewer than 180 bars available",
      "upstream data quality is stale",
      "extreme gap ratio 8%",
    ]));
    expect(guard.blockers).toEqual([]);
  });

  it("returns ok for a deep history without guardrail issues", () => {
    const guard = buildDataQualityGuard(bars(220));

    expect(guard).toEqual({
      status: "ok",
      score: 1,
      reasons: [],
      blockers: [],
    });
  });
});
