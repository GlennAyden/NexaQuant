import { normalizeChartBars } from "@/lib/market/chartBars";
import type { Bar } from "@/lib/market/types";

export function aggregateBarsByCount(bars: Bar[], groupSize: number): Bar[] {
  const normalizedBars = normalizeChartBars(bars);
  if (groupSize <= 1 || normalizedBars.length <= 1) {
    return normalizedBars;
  }

  const aggregated: Bar[] = [];
  for (let index = 0; index < normalizedBars.length; index += groupSize) {
    const group = normalizedBars.slice(index, index + groupSize);
    const first = group[0];
    const last = group[group.length - 1];
    aggregated.push({
      symbol: first.symbol,
      timeframe: first.timeframe,
      date: last.date,
      open: first.open,
      high: Math.max(...group.map((bar) => bar.high)),
      low: Math.min(...group.map((bar) => bar.low)),
      close: last.close,
      adjClose: last.adjClose,
      volume: group.reduce((sum, bar) => sum + bar.volume, 0),
      source: first.source,
    });
  }

  return aggregated;
}
