import type { BacktestOutcome, Bar, ChartAnnotation } from "@/lib/market/types";

const DEFAULT_HORIZONS = [5, 20, 60];

export function evaluateAnnotationOutcomes(
  bars: Bar[],
  annotations: ChartAnnotation[],
  horizons = DEFAULT_HORIZONS,
): BacktestOutcome[] {
  const outcomes: BacktestOutcome[] = [];
  const indexByDate = new Map(bars.map((bar, index) => [bar.date, index]));

  for (const annotation of annotations) {
    const eventIndex = indexByDate.get(annotation.endDate);
    if (eventIndex === undefined) {
      continue;
    }

    const startClose = bars[eventIndex].close;

    for (const horizon of horizons) {
      const endBar = bars[eventIndex + horizon + 1];
      outcomes.push({
        annotationId: annotation.id,
        symbol: annotation.symbol,
        timeframe: annotation.timeframe,
        family: annotation.family,
        eventType: annotation.type,
        eventDate: annotation.endDate,
        horizonBars: horizon,
        startClose,
        endClose: endBar?.close ?? null,
        returnPct: endBar ? roundPct(((endBar.close - startClose) / startClose) * 100) : null,
        status: endBar ? "complete" : "pending",
      });
    }
  }

  return outcomes.sort((left, right) =>
    left.eventDate.localeCompare(right.eventDate)
    || left.eventType.localeCompare(right.eventType)
    || left.horizonBars - right.horizonBars,
  );
}

function roundPct(value: number): number {
  return Math.trunc(value * 100) / 100;
}
