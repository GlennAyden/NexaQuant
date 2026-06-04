import type { AnalysisMode, Bar, ChartAnnotation, Timeframe } from "@/lib/market/types";

export type ResearchCacheKeyParts = {
  symbol: string;
  timeframe: Timeframe;
  rangeLabel: string;
  bars: Bar[];
  annotations: ChartAnnotation[];
  companionAnnotations: ChartAnnotation[];
  cursorIndex: number;
  timeMachineEnabled: boolean;
  analysisMode?: AnalysisMode;
};

export type ResearchCache<T> = {
  getOrCompute: (keyParts: ResearchCacheKeyParts, compute: () => T) => T;
  size: () => number;
  clear: () => void;
};

const DEFAULT_MAX_ENTRIES = 50;

export function createResearchCache<T>(maxEntries = DEFAULT_MAX_ENTRIES): ResearchCache<T> {
  const entries = new Map<string, T>();
  const limit = Math.max(0, Math.trunc(maxEntries));

  return {
    getOrCompute(keyParts, compute) {
      const key = buildResearchCacheKey(keyParts);

      if (entries.has(key)) {
        return entries.get(key)!;
      }

      const value = compute();
      entries.set(key, value);

      while (entries.size > limit) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) {
          break;
        }
        entries.delete(oldestKey);
      }

      return value;
    },
    size() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
  };
}

export function buildResearchCacheKey(keyParts: ResearchCacheKeyParts): string {
  const firstBar = keyParts.bars[0];
  const lastBar = keyParts.bars.at(-1);

  return JSON.stringify({
    symbol: keyParts.symbol,
    timeframe: keyParts.timeframe,
    rangeLabel: keyParts.rangeLabel,
    cursorIndex: keyParts.cursorIndex,
    timeMachineEnabled: keyParts.timeMachineEnabled,
    analysisMode: keyParts.analysisMode ?? "strict",
    bars: {
      length: keyParts.bars.length,
      firstDate: firstBar?.date ?? null,
      lastDate: lastBar?.date ?? null,
      lastClose: lastBar?.close ?? null,
    },
    annotations: summarizeAnnotations(keyParts.annotations),
    companionAnnotations: summarizeAnnotations(keyParts.companionAnnotations),
  });
}

function summarizeAnnotations(annotations: ChartAnnotation[]) {
  return annotations
    .map((annotation) => ({
      id: annotation.id,
      endDate: annotation.endDate,
      status: annotation.status,
    }))
    .sort((left, right) =>
      left.id.localeCompare(right.id)
      || left.endDate.localeCompare(right.endDate)
      || left.status.localeCompare(right.status),
    );
}
