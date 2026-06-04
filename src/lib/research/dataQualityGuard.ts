import type { Bar, DataQuality } from "@/lib/market/types";

export type DataQualityGuardStatus = "ok" | "caution" | "blocked";

export type DataQualityGuardResult = {
  status: DataQualityGuardStatus;
  score: number;
  reasons: string[];
  blockers: string[];
};

export function buildDataQualityGuard(bars: Bar[], dataQuality?: DataQuality): DataQualityGuardResult {
  const blockers: string[] = [];
  const reasons: string[] = [];
  const barCount = bars.length;
  const missingVolumeRatio = ratio(bars.filter((bar) => !Number.isFinite(bar.volume) || bar.volume <= 0).length, barCount);
  const zeroVolumeRatio = ratio(bars.filter((bar) => bar.volume === 0).length, barCount);
  const extremeGapRatio = ratio(countExtremeGaps(bars), Math.max(0, barCount - 1));

  if (barCount < 60) {
    blockers.push("fewer than 60 bars available");
  } else if (barCount < 180) {
    reasons.push("fewer than 180 bars available");
  }

  if (missingVolumeRatio >= 0.35) {
    blockers.push(`missing volume ratio ${formatPercent(missingVolumeRatio)}`);
  }

  if (dataQuality?.status === "insufficient_data") {
    blockers.push("upstream data quality is insufficient_data");
  } else if (dataQuality?.status === "stale" || dataQuality?.status === "missing_volume") {
    reasons.push(`upstream data quality is ${dataQuality.status}`);
  }

  if (zeroVolumeRatio >= 0.12 && missingVolumeRatio < 0.35) {
    reasons.push(`zero-volume ratio ${formatPercent(zeroVolumeRatio)}`);
  }

  if (extremeGapRatio >= 0.08) {
    reasons.push(`extreme gap ratio ${formatPercent(extremeGapRatio)}`);
  }

  const status: DataQualityGuardStatus = blockers.length > 0 ? "blocked" : reasons.length > 0 ? "caution" : "ok";
  return {
    status,
    score: scoreFor(status, reasons.length, blockers.length),
    reasons,
    blockers,
  };
}

function countExtremeGaps(bars: Bar[]): number {
  let count = 0;
  for (let index = 1; index < bars.length; index += 1) {
    const previousClose = bars[index - 1].close;
    if (previousClose !== 0 && Math.abs(bars[index].open - previousClose) / Math.abs(previousClose) > 0.15) {
      count += 1;
    }
  }
  return count;
}

function scoreFor(status: DataQualityGuardStatus, reasonCount: number, blockerCount: number): number {
  if (status === "blocked") {
    return clamp(round2(0.4 - Math.max(0, blockerCount - 1) * 0.08));
  }
  if (status === "caution") {
    return clamp(round2(0.82 - Math.max(0, reasonCount - 1) * 0.06));
  }
  return 1;
}

function ratio(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
