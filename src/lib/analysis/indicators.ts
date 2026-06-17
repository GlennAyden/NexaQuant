import type { Bar, SwingPoint } from "@/lib/market/types";

export type IndicatorPoint = {
  time: string;
  value: number;
};

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

export function movingAverage(bars: Bar[], period: number): IndicatorPoint[] {
  if (period <= 0 || bars.length < period) {
    return [];
  }

  const points: IndicatorPoint[] = [];
  let sum = 0;

  bars.forEach((bar, index) => {
    sum += bar.close;

    if (index >= period) {
      sum -= bars[index - period].close;
    }

    if (index >= period - 1) {
      points.push({
        time: bar.date,
        value: sum / period,
      });
    }
  });

  return points;
}

export function relativeStrengthIndex(bars: Bar[], period = 14): IndicatorPoint[] {
  if (period <= 0 || bars.length <= period) {
    return [];
  }

  let gainSum = 0;
  let lossSum = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = bars[index].close - bars[index - 1].close;
    gainSum += Math.max(change, 0);
    lossSum += Math.max(-change, 0);
  }

  let averageGain = gainSum / period;
  let averageLoss = lossSum / period;
  const points: IndicatorPoint[] = [{
    time: bars[period].date,
    value: calculateRsiValue(averageGain, averageLoss),
  }];

  for (let index = period + 1; index < bars.length; index += 1) {
    const change = bars[index].close - bars[index - 1].close;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain = ((averageGain * (period - 1)) + gain) / period;
    averageLoss = ((averageLoss * (period - 1)) + loss) / period;

    points.push({
      time: bars[index].date,
      value: calculateRsiValue(averageGain, averageLoss),
    });
  }

  return points;
}

export function awesomeOscillator(
  bars: Bar[],
  fastPeriod = 5,
  slowPeriod = 34,
): IndicatorPoint[] {
  if (fastPeriod <= 0 || slowPeriod <= 0 || fastPeriod >= slowPeriod || bars.length < slowPeriod) {
    return [];
  }

  const medianPrices = bars.map((bar) => (bar.high + bar.low) / 2);
  const points: IndicatorPoint[] = [];

  for (let index = slowPeriod - 1; index < bars.length; index += 1) {
    points.push({
      time: bars[index].date,
      value: averageWindow(medianPrices, index - fastPeriod + 1, index)
        - averageWindow(medianPrices, index - slowPeriod + 1, index),
    });
  }

  return points;
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

function calculateRsiValue(averageGain: number, averageLoss: number): number {
  if (averageGain === 0 && averageLoss === 0) {
    return 50;
  }

  if (averageLoss === 0) {
    return 100;
  }

  if (averageGain === 0) {
    return 0;
  }

  const relativeStrength = averageGain / averageLoss;
  return 100 - (100 / (1 + relativeStrength));
}

function averageWindow(values: number[], startIndex: number, endIndex: number) {
  let sum = 0;

  for (let index = startIndex; index <= endIndex; index += 1) {
    sum += values[index];
  }

  return sum / (endIndex - startIndex + 1);
}
