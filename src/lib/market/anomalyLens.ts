import type { Bar } from "@/lib/market/types";

export type ChartAnomaly = {
  id: string;
  date: string;
  score: number;
  labels: Array<"Volume" | "Range" | "Return">;
  evidence: string[];
};

export type AnomalyLensOptions = {
  lookback?: number;
  maxResults?: number;
};

export function buildAnomalyLens(bars: Bar[], options: AnomalyLensOptions = {}): ChartAnomaly[] {
  const lookback = Math.max(3, Math.min(60, options.lookback ?? 20));
  const maxResults = Math.max(1, Math.min(50, options.maxResults ?? 12));
  const anomalies: ChartAnomaly[] = [];

  for (let index = 1; index < bars.length; index += 1) {
    const prior = bars.slice(Math.max(0, index - lookback), index);
    if (prior.length < 3) {
      continue;
    }

    const bar = bars[index];
    const previous = bars[index - 1];
    const volumeRatio = ratio(bar.volume, average(prior.map((item) => item.volume)));
    const range = bar.high - bar.low;
    const rangeRatio = ratio(range, average(prior.map((item) => item.high - item.low)));
    const returnPct = Math.abs(percentChange(previous.close, bar.close));
    const averageReturn = average(prior.slice(1).map((item, priorIndex) =>
      Math.abs(percentChange(prior[priorIndex].close, item.close)),
    ));
    const returnRatio = ratio(returnPct, averageReturn);
    const labels: ChartAnomaly["labels"] = [];
    const evidence: string[] = [];

    if (volumeRatio >= 2.4) {
      labels.push("Volume");
      evidence.push(`volume ${volumeRatio.toFixed(2)}x local average`);
    }
    if (rangeRatio >= 3) {
      labels.push("Range");
      evidence.push(`range ${rangeRatio.toFixed(2)}x local average`);
    }
    if (returnRatio >= 4 || returnPct >= 7) {
      labels.push("Return");
      evidence.push(`return ${returnPct.toFixed(2)}%`);
    }

    if (labels.length > 0) {
      anomalies.push({
        id: `anomaly-${bar.date}`,
        date: bar.date,
        score: roundScore(Math.min(1, labels.length * 0.28 + Math.max(volumeRatio, rangeRatio, returnRatio) * 0.08)),
        labels,
        evidence,
      });
    }
  }

  return anomalies
    .sort((left, right) => right.score - left.score || left.date.localeCompare(right.date))
    .slice(0, maxResults)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function ratio(value: number, baseline: number) {
  if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline <= 0) {
    return 0;
  }
  return value / baseline;
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) {
    return 0;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function percentChange(start: number, end: number) {
  if (start === 0) {
    return 0;
  }
  return ((end - start) / start) * 100;
}

function roundScore(value: number) {
  return Number(value.toFixed(3));
}
