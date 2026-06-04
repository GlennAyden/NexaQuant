import type { Bar } from "@/lib/market/types";

export function normalizeChartBars(bars: Bar[]): Bar[] {
  const visibleBars = bars.filter((bar) => !isZeroVolumeCarryForward(bar));
  return visibleBars.length > 0 ? visibleBars : bars;
}

export function isZeroVolumeCarryForward(bar: Bar): boolean {
  return bar.timeframe === "1d"
    && bar.volume <= 0
    && bar.open === bar.high
    && bar.high === bar.low
    && bar.low === bar.close;
}
