import { describe, expect, it } from "vitest";

import { buildVolumeProfile } from "@/lib/market/volumeProfile";
import type { Bar } from "@/lib/market/types";

describe("volume profile", () => {
  it("builds price buckets with POC and value area from cached bars", () => {
    const profile = buildVolumeProfile([
      bar(100, 1_000),
      bar(101, 2_000),
      bar(102, 9_000),
      bar(103, 3_000),
      bar(104, 1_000),
    ], { bucketCount: 5, valueAreaPct: 0.7 });

    expect(profile).toMatchObject({
      totalVolume: 16_000,
      pocPrice: 102,
      valueAreaLow: 101,
      valueAreaHigh: 103,
    });
    expect(profile.buckets).toHaveLength(5);
    expect(profile.buckets[2]).toMatchObject({
      midPrice: 102,
      volume: 9_000,
      share: 0.563,
      isPoc: true,
      inValueArea: true,
    });
  });

  it("returns an empty profile when bars do not contain finite price and volume evidence", () => {
    const profile = buildVolumeProfile([], { bucketCount: 12 });

    expect(profile).toEqual({
      buckets: [],
      totalVolume: 0,
      pocPrice: null,
      valueAreaLow: null,
      valueAreaHigh: null,
    });
  });
});

function bar(close: number, volume: number): Bar {
  return {
    symbol: "BBCA.JK",
    timeframe: "1d",
    date: `2026-06-${String(close - 99).padStart(2, "0")}`,
    open: close,
    high: close,
    low: close,
    close,
    adjClose: close,
    volume,
    source: "fixture",
  };
}
