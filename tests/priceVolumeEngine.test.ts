import { describe, expect, it } from "vitest";

import { detectPriceVolume } from "@/lib/analysis/priceVolumeEngine";
import type { Bar } from "@/lib/market/types";

function baseBar(index: number, overrides: Partial<Bar> = {}): Bar {
  const close = overrides.close ?? 100;
  const open = overrides.open ?? close;
  const high = overrides.high ?? close + 2;
  const low = overrides.low ?? close - 2;

  return {
    symbol: "PVA.JK",
    timeframe: "1d",
    date: `2026-03-${String(index + 1).padStart(2, "0")}`,
    open,
    high,
    low,
    close,
    adjClose: close,
    volume: overrides.volume ?? 1000,
    source: "fixture",
    ...overrides,
  };
}

function stableBars(length = 35): Bar[] {
  return Array.from({ length }, (_, index) => baseBar(index));
}

describe("priceVolumeEngine", () => {
  it("detects demand expansion when rising price has high effort and strong close location", () => {
    const bars = stableBars();
    bars[10] = baseBar(10, { open: 109, high: 113, low: 108, close: 110 });
    bars[30] = baseBar(30, { open: 101, high: 112, low: 100, close: 111, volume: 2200 });
    bars[31] = baseBar(31, { open: 111, high: 116, low: 110, close: 115 });

    const annotations = detectPriceVolume(bars);

    expect(annotations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: "pva",
        type: "Demand Expansion",
        status: "confirmed",
        invalidationPrice: 100,
        meta: {
          pva: expect.objectContaining({
            abbreviation: "DX",
            bias: "bullish",
          }),
        },
      }),
    ]));
  });

  it("detects supply expansion when falling price has high effort and weak close location", () => {
    const bars = stableBars();
    bars[10] = baseBar(10, { open: 90, high: 92, low: 87, close: 89 });
    bars[30] = baseBar(30, { open: 99, high: 100, low: 88, close: 89, volume: 2200 });
    bars[31] = baseBar(31, { open: 89, high: 90, low: 84, close: 85 });

    const annotations = detectPriceVolume(bars);

    expect(annotations.map((annotation) => annotation.type)).toContain("Supply Expansion");
    expect(annotations.find((annotation) => annotation.type === "Supply Expansion")).toMatchObject({
      status: "confirmed",
      invalidationPrice: 100,
      meta: { pva: expect.objectContaining({ abbreviation: "SX", bias: "bearish" }) },
    });
  });

  it("detects absorption when volume is high but price result stays compressed", () => {
    const bars = stableBars();
    bars[30] = baseBar(30, { open: 100, high: 101, low: 99, close: 100.2, volume: 2200 });
    bars[31] = baseBar(31, { open: 100.2, high: 103, low: 99.5, close: 102.8 });

    const absorption = detectPriceVolume(bars).find((annotation) => annotation.type === "Absorption");

    expect(absorption).toMatchObject({
      family: "pva",
      label: "Effort/result absorption",
      status: "confirmed",
      invalidationPrice: null,
      meta: { pva: expect.objectContaining({ abbreviation: "ABS", bias: "neutral" }) },
    });
  });

  it("detects supply dry-up when a pullback loses volume and range", () => {
    const bars = stableBars();
    [25, 26, 27, 28, 29].forEach((index, offset) => {
      bars[index] = baseBar(index, { close: 105 - offset, open: 106 - offset, high: 107 - offset, low: 103 - offset });
    });
    bars[30] = baseBar(30, { open: 100, high: 100.8, low: 99.2, close: 99.5, volume: 480 });
    bars[31] = baseBar(31, { open: 99.5, high: 102, low: 99, close: 101.5 });

    const dryUp = detectPriceVolume(bars).find((annotation) => annotation.type === "Supply Dry-Up");

    expect(dryUp).toMatchObject({
      status: "confirmed",
      invalidationPrice: 99.2,
      meta: { pva: expect.objectContaining({ abbreviation: "VDU", bias: "bullish" }) },
    });
  });

  it("separates confirmed breakouts from failed breakout attempts", () => {
    const breakoutBars = stableBars();
    breakoutBars[30] = baseBar(30, { open: 101, high: 108, low: 100, close: 107, volume: 1800 });
    breakoutBars[31] = baseBar(31, { open: 107, high: 110, low: 106, close: 109 });

    const failedBars = stableBars();
    failedBars[30] = baseBar(30, { open: 101, high: 108, low: 99, close: 101, volume: 1600 });
    failedBars[31] = baseBar(31, { open: 101, high: 102, low: 96, close: 97 });

    expect(detectPriceVolume(breakoutBars).map((annotation) => annotation.type)).toContain("Breakout Confirmed");
    expect(detectPriceVolume(failedBars).map((annotation) => annotation.type)).toContain("Failed Breakout");
  });

  it("keeps only the twelve latest deduped PVA annotations", () => {
    const bars = stableBars(58);
    for (let index = 30; index < bars.length; index += 1) {
      const open = 100 + (index - 30) * 2;
      bars[index] = baseBar(index, {
        open,
        high: open + 14,
        low: open,
        close: open + 13,
        volume: 1000 * Math.pow(1.4, index - 29),
      });
    }

    const annotations = detectPriceVolume(bars);

    expect(annotations).toHaveLength(12);
    expect(annotations[0].endDate).toBe("2026-03-47");
    expect(annotations.at(-1)?.endDate).toBe("2026-03-58");
  });
});
