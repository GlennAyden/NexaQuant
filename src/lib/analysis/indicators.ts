import type { Bar, SwingPoint } from "@/lib/market/types";

export function trueRange(bar: Bar, previous?: Bar): number {
  if (!previous) {
    return bar.high - bar.low;
  }

  return Math.max(
    bar.high - bar.low,
    Math.abs(bar.high - previous.close),
    Math.abs(bar.low - previous.close),
  );
}

export function averageTrueRange(bars: Bar[], period: number): number {
  if (bars.length === 0 || period <= 0) {
    return 0;
  }

  const ranges = bars.map((bar, index) => trueRange(bar, bars[index - 1]));
  const window = ranges.slice(-period);
  return window.reduce((sum, value) => sum + value, 0) / window.length;
}

export function volumeSma(bars: Bar[], period: number): number {
  if (bars.length === 0 || period <= 0) {
    return 0;
  }

  const window = bars.slice(-period);
  return window.reduce((sum, bar) => sum + bar.volume, 0) / window.length;
}

export function closeLocationValue(bar: Bar): number {
  const range = bar.high - bar.low;
  if (range === 0) {
    return 0.5;
  }

  return (bar.close - bar.low) / range;
}

export function candleSpread(bar: Bar): number {
  return bar.high - bar.low;
}

export function rollingHigh(bars: Bar[]): number {
  return Math.max(...bars.map((bar) => bar.high));
}

export function rollingLow(bars: Bar[]): number {
  return Math.min(...bars.map((bar) => bar.low));
}

export function findPivotSwings(bars: Bar[], strength: number): SwingPoint[] {
  if (bars.length < strength * 2 + 1) {
    return [];
  }

  const swings: SwingPoint[] = [];

  for (let index = strength + 1; index < bars.length - strength; index += 1) {
    const bar = bars[index];
    const left = bars.slice(index - strength, index);
    const right = bars.slice(index + 1, index + strength + 1);
    const isHigh = left.every((candidate) => bar.close > candidate.close)
      && right.every((candidate) => bar.close > candidate.close);
    const isLow = left.every((candidate) => bar.close < candidate.close)
      && right.every((candidate) => bar.close < candidate.close);

    if (isHigh) {
      swings.push({ kind: "high", index, date: bar.date, price: bar.high });
    }

    if (isLow) {
      swings.push({ kind: "low", index, date: bar.date, price: bar.low });
    }
  }

  return swings;
}

export function assessDataQuality(bars: Bar[]): import("@/lib/market/types").DataQuality {
  const last = bars.at(-1);
  const reasons: string[] = [];

  if (bars.length < 180) {
    reasons.push("fewer than 180 daily bars");
  }

  if (bars.some((bar) => bar.volume <= 0)) {
    reasons.push("one or more bars are missing volume");
  }

  return {
    status: bars.length < 180
      ? "insufficient_data"
      : bars.some((bar) => bar.volume <= 0)
        ? "missing_volume"
        : "ok",
    reasons,
    barCount: bars.length,
    lastBarDate: last?.date ?? null,
  };
}
