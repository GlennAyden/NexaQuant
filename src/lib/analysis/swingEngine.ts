import { findPivotSwings } from "@/lib/analysis/indicators";
import type { Bar, SwingPoint } from "@/lib/market/types";

export type ZigZagOptions = {
  reversalPercent: number;
  pivotStrength: number;
};

export function buildZigZagSwings(
  bars: Bar[],
  options: ZigZagOptions = { reversalPercent: 5, pivotStrength: 3 },
): SwingPoint[] {
  const pivots = findPivotSwings(bars, options.pivotStrength);
  const accepted: SwingPoint[] = [];

  for (const pivot of pivots) {
    const last = accepted.at(-1);

    if (!last) {
      accepted.push(pivot);
      continue;
    }

    if (last.kind === pivot.kind) {
      const moreExtreme = pivot.kind === "high"
        ? pivot.price > last.price
        : pivot.price < last.price;
      if (moreExtreme) {
        accepted[accepted.length - 1] = pivot;
      }
      continue;
    }

    const change = Math.abs((pivot.price - last.price) / last.price) * 100;
    if (change >= options.reversalPercent) {
      accepted.push(pivot);
    }
  }

  return accepted;
}
