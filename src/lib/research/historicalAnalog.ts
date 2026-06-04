import type { Bar } from "@/lib/market/types";

export type HistoricalAnalogOptions = {
  windowSize?: number;
  horizonBars?: number;
  maxResults?: number;
};

export type HistoricalAnalogMatch = {
  startDate: string;
  endDate: string;
  similarity: number;
  forwardReturnPct: number | null;
  evidence: string[];
};

type WindowProfile = {
  bars: Bar[];
  path: number[];
  rangeWidth: number;
  volumeTrend: number;
};

export function findHistoricalAnalogs(
  bars: Bar[],
  options: HistoricalAnalogOptions = {},
): HistoricalAnalogMatch[] {
  const windowSize = options.windowSize ?? 30;
  const horizonBars = options.horizonBars ?? 20;
  const maxResults = options.maxResults ?? 3;
  const latestStart = bars.length - windowSize;

  if (windowSize < 2 || maxResults < 1 || latestStart < windowSize) {
    return [];
  }

  const latest = profileWindow(bars.slice(latestStart));
  const matches: HistoricalAnalogMatch[] = [];

  for (let start = 0; start + windowSize <= latestStart; start += 1) {
    const end = start + windowSize - 1;
    const candidate = profileWindow(bars.slice(start, start + windowSize));
    const pathDistance = averageDistance(latest.path, candidate.path);
    const rangeDistance = Math.abs(latest.rangeWidth - candidate.rangeWidth);
    const volumeDistance = Math.abs(latest.volumeTrend - candidate.volumeTrend);
    const similarity = clamp01(1 - (pathDistance * 0.7 + rangeDistance * 0.2 + volumeDistance * 0.1));
    const forwardIndex = end + horizonBars;
    const forwardReturnPct = forwardIndex < bars.length
      ? percentChange(bars[end].close, bars[forwardIndex].close)
      : null;

    matches.push({
      startDate: bars[start].date,
      endDate: bars[end].date,
      similarity: round(similarity, 4),
      forwardReturnPct: forwardReturnPct === null ? null : round(forwardReturnPct, 2),
      evidence: [
        `normalized close path distance: ${pathDistance.toFixed(4)}`,
        `range width distance: ${rangeDistance.toFixed(4)}`,
        `volume trend distance: ${volumeDistance.toFixed(4)}`,
        forwardReturnPct === null
          ? `forward return unavailable for the next ${horizonBars} bars`
          : `forward return uses the next ${horizonBars} bars after the analog window`,
      ],
    });
  }

  return matches
    .sort((left, right) =>
      right.similarity - left.similarity || left.startDate.localeCompare(right.startDate),
    )
    .slice(0, maxResults);
}

function profileWindow(bars: Bar[]): WindowProfile {
  const closes = bars.map((bar) => bar.close);
  const volumes = bars.map((bar) => bar.volume);

  return {
    bars,
    path: normalizePath(closes),
    rangeWidth: rangeWidth(closes),
    volumeTrend: trend(volumes),
  };
}

function normalizePath(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = max - min;

  if (width === 0) {
    return values.map(() => 0);
  }

  return values.map((value) => (value - min) / width);
}

function rangeWidth(values: number[]): number {
  const first = Math.abs(values[0]);
  if (first === 0) {
    return 0;
  }
  return (Math.max(...values) - Math.min(...values)) / first;
}

function trend(values: number[]): number {
  const first = Math.abs(values[0]);
  if (first === 0) {
    return 0;
  }
  return (values.at(-1)! - values[0]) / first;
}

function averageDistance(left: number[], right: number[]): number {
  return left.reduce((total, value, index) => total + Math.abs(value - right[index]), 0) / left.length;
}

function percentChange(start: number, end: number): number {
  if (start === 0) {
    return 0;
  }
  return ((end - start) / start) * 100;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
