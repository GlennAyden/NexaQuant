import type { Bar, ChartAnnotation } from "@/lib/market/types";
import type { NewsChartEvent } from "@/lib/news/newsEvents";

export type ConfluenceFactor = {
  label: "Wyckoff" | "Elliott" | "PVA" | "Projection" | "News" | "Volume spike";
  weight: number;
  detail: string;
};

export type ConfluenceHeatmapRow = {
  date: string;
  score: number;
  tone: "quiet" | "watch" | "strong";
  factors: ConfluenceFactor[];
};

export type BuildConfluenceHeatmapInput = {
  bars: Bar[];
  annotations: ChartAnnotation[];
  newsEvents: NewsChartEvent[];
};

export function buildConfluenceHeatmap(input: BuildConfluenceHeatmapInput): ConfluenceHeatmapRow[] {
  const rows = new Map<string, ConfluenceFactor[]>();

  for (const annotation of input.annotations) {
    const factor = annotationToFactor(annotation);
    if (!factor) {
      continue;
    }
    addFactor(rows, annotation.endDate, factor);
  }

  for (const event of input.newsEvents) {
    addFactor(rows, event.chartDate, {
      label: "News",
      weight: Math.max(0.08, Math.min(0.28, event.materialityScore * 0.28)),
      detail: `${event.eventLabel}: ${event.title}`,
    });
  }

  for (const spike of detectVolumeSpikes(input.bars)) {
    addFactor(rows, spike.date, {
      label: "Volume spike",
      weight: 0.16,
      detail: `${spike.ratio.toFixed(2)}x average volume`,
    });
  }

  return [...rows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, factors]) => {
      const score = roundScore(Math.min(1, factors.reduce((sum, factor) => sum + factor.weight, 0)));
      return {
        date,
        score,
        tone: score >= 0.62 ? "strong" : score >= 0.32 ? "watch" : "quiet",
        factors,
      };
    });
}

function annotationToFactor(annotation: ChartAnnotation): ConfluenceFactor | null {
  if (annotation.family === "wyckoff") {
    return { label: "Wyckoff", weight: 0.2, detail: annotation.type };
  }
  if (annotation.family === "elliott") {
    return { label: "Elliott", weight: 0.16, detail: annotation.type };
  }
  if (annotation.family === "pva") {
    return { label: "PVA", weight: 0.22, detail: annotation.label };
  }
  if (annotation.family === "structure" && (annotation.type === "Fib Guide" || annotation.phase === "fib")) {
    return { label: "Projection", weight: 0.1, detail: annotation.label };
  }
  return null;
}

function detectVolumeSpikes(bars: Bar[]) {
  return bars.flatMap((bar, index) => {
    const prior = bars.slice(Math.max(0, index - 20), index);
    const averageVolume = average(prior.map((item) => item.volume));
    if (!averageVolume || bar.volume / averageVolume < 1.6) {
      return [];
    }

    return [{ date: bar.date, ratio: bar.volume / averageVolume }];
  });
}

function addFactor(rows: Map<string, ConfluenceFactor[]>, date: string, factor: ConfluenceFactor) {
  const factors = rows.get(date) ?? [];
  factors.push(factor);
  rows.set(date, factors);
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  if (valid.length === 0) {
    return 0;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function roundScore(value: number) {
  return Number(value.toFixed(3));
}
