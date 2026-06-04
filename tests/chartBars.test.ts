import { describe, expect, it } from "vitest";

import { normalizeChartBars } from "@/lib/market/chartBars";
import type { Bar } from "@/lib/market/types";

const baseBar: Bar = {
  symbol: "BBCA.JK",
  timeframe: "1d",
  date: "2026-05-29",
  open: 5700,
  high: 5875,
  low: 5700,
  close: 5700,
  adjClose: 5700,
  volume: 1_014_028_000,
  source: "fixture",
};

describe("normalizeChartBars", () => {
  it("removes Yahoo daily carry-forward placeholders before charting", () => {
    const placeholder: Bar = {
      ...baseBar,
      date: "2026-05-28",
      open: 5975,
      high: 5975,
      low: 5975,
      close: 5975,
      adjClose: 5975,
      volume: 0,
    };

    expect(normalizeChartBars([placeholder, baseBar])).toEqual([baseBar]);
  });

  it("keeps real flat candles when volume exists", () => {
    const realFlatBar: Bar = {
      ...baseBar,
      open: 6000,
      high: 6000,
      low: 6000,
      close: 6000,
      volume: 100_000,
    };

    expect(normalizeChartBars([realFlatBar])).toEqual([realFlatBar]);
  });

  it("keeps the original bars if every row would otherwise be hidden", () => {
    const placeholder: Bar = {
      ...baseBar,
      open: 5975,
      high: 5975,
      low: 5975,
      close: 5975,
      volume: 0,
    };

    expect(normalizeChartBars([placeholder])).toEqual([placeholder]);
  });
});
