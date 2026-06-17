import { detectElliott } from "@/lib/analysis/elliottEngine";
import { buildZigZagSwings } from "@/lib/analysis/swingEngine";
import { detectWyckoff } from "@/lib/analysis/wyckoffEngine";
import type { AnalysisMode, Bar, ChartAnnotation } from "@/lib/market/types";

export type TimeMachineSnapshot = {
  visibleBars: Bar[];
  visibleAnnotations: ChartAnnotation[];
  asOfDate: string | null;
  progressPct: number;
  activeEvents: ChartAnnotation[];
  hiddenAnnotationCount: number;
  calculationMode: "filtered" | "recalculated";
};

export type RecalculatedTimeMachineOptions = {
  fullAnnotationCount?: number;
  analysisMode?: AnalysisMode;
};

export function buildTimeMachineSnapshot(
  bars: Bar[],
  annotations: ChartAnnotation[],
  cursorIndex: number,
): TimeMachineSnapshot {
  if (bars.length === 0) {
    return {
      visibleBars: [],
      visibleAnnotations: [],
      asOfDate: null,
      progressPct: 0,
      activeEvents: [],
      hiddenAnnotationCount: annotations.length,
      calculationMode: "filtered",
    };
  }

  const cursor = clamp(Math.trunc(cursorIndex), 0, bars.length - 1);
  const asOfDate = bars[cursor].date;
  const visibleBars = bars.slice(0, cursor + 1);
  const visibleAnnotations = annotations.filter((annotation) => annotation.endDate <= asOfDate);
  const activeEvents = [...visibleAnnotations]
    .sort(compareNewestAnnotation)
    .slice(0, 5);

  return {
    visibleBars,
    visibleAnnotations,
    asOfDate,
    progressPct: bars.length === 1 ? 100 : Math.round((cursor / (bars.length - 1)) * 100),
    activeEvents,
    hiddenAnnotationCount: annotations.length - visibleAnnotations.length,
    calculationMode: "filtered",
  };
}

export function buildRecalculatedTimeMachineSnapshot(
  bars: Bar[],
  cursorIndex: number,
  options: RecalculatedTimeMachineOptions = {},
): TimeMachineSnapshot {
  if (bars.length === 0) {
    return {
      visibleBars: [],
      visibleAnnotations: [],
      asOfDate: null,
      progressPct: 0,
      activeEvents: [],
      hiddenAnnotationCount: options.fullAnnotationCount ?? 0,
      calculationMode: "recalculated",
    };
  }

  const cursor = clamp(Math.trunc(cursorIndex), 0, bars.length - 1);
  const visibleBars = bars.slice(0, cursor + 1);
  const asOfDate = bars[cursor].date;
  const { symbol, timeframe } = visibleBars.at(-1)!;
  const analysisMode = options.analysisMode ?? "strict";
  const wyckoff = detectWyckoff(visibleBars, { mode: analysisMode });
  const swings = buildZigZagSwings(visibleBars, {
    reversalPercent: analysisMode === "loose" ? (timeframe === "1w" ? 6 : 4) : (timeframe === "1w" ? 7 : 5),
    pivotStrength: analysisMode === "loose" ? 1 : 2,
  });
  const elliott = detectElliott(symbol, timeframe, swings, { mode: analysisMode });
  const visibleAnnotations = [...wyckoff, ...elliott];
  const activeEvents = [...visibleAnnotations]
    .sort(compareNewestAnnotation)
    .slice(0, 5);
  const hiddenAnnotationCount = options.fullAnnotationCount === undefined
    ? 0
    : Math.max(0, options.fullAnnotationCount - visibleAnnotations.length);

  return {
    visibleBars,
    visibleAnnotations,
    asOfDate,
    progressPct: bars.length === 1 ? 100 : Math.round((cursor / (bars.length - 1)) * 100),
    activeEvents,
    hiddenAnnotationCount,
    calculationMode: "recalculated",
  };
}

export function buildTimeMachineNarrative(snapshot: TimeMachineSnapshot): string[] {
  if (!snapshot.asOfDate) {
    return ["No time machine evidence is visible yet."];
  }

  const latest = snapshot.activeEvents[0];
  return [
    `As of ${snapshot.asOfDate}, ${snapshot.visibleBars.length} bars are visible in ${snapshot.calculationMode} mode.`,
    `${snapshot.activeEvents.length} active structure events are visible; ${snapshot.hiddenAnnotationCount} future annotations remain hidden.`,
    latest ? `Latest evidence: ${latest.type}.` : "Latest evidence: no structure event yet.",
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function compareNewestAnnotation(left: ChartAnnotation, right: ChartAnnotation) {
  const dateOrder = right.endDate.localeCompare(left.endDate);
  return dateOrder === 0 ? left.id.localeCompare(right.id) : dateOrder;
}
