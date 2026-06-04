import type { ProjectionDirection, ProjectionScenario } from "@/lib/analysis/projectionEngine";
import type { Bar } from "@/lib/market/types";

const DEFAULT_PROJECTION_HORIZONS = [20, 60];

export type ProjectionBacktestStatus = "target_hit" | "invalidated" | "expired" | "pending";

export type ProjectionBacktestOutcome = {
  projectionId: string;
  title: string;
  family: ProjectionScenario["family"];
  direction: ProjectionDirection;
  horizonBars: number;
  startDate: string;
  targetPrice: number;
  invalidationPrice: number | null;
  barsElapsed: number;
  maxFavorablePct: number;
  maxAdversePct: number;
  status: ProjectionBacktestStatus;
};

export function evaluateProjectionOutcomes(
  bars: Bar[],
  projections: ProjectionScenario[],
  horizons = DEFAULT_PROJECTION_HORIZONS,
): ProjectionBacktestOutcome[] {
  const indexByDate = new Map(bars.map((bar, index) => [bar.date, index]));
  const outcomes: ProjectionBacktestOutcome[] = [];

  for (const projection of projections) {
    if (projection.status === "conflicted" || projection.points.length === 0) {
      continue;
    }

    const startIndex = indexByDate.get(projection.startDate);
    if (startIndex === undefined) {
      continue;
    }

    for (const horizon of horizons) {
      outcomes.push(evaluateProjectionWindow(bars, projection, startIndex, horizon));
    }
  }

  return outcomes.sort((left, right) =>
    left.startDate.localeCompare(right.startDate)
    || left.title.localeCompare(right.title)
    || left.horizonBars - right.horizonBars,
  );
}

function evaluateProjectionWindow(
  bars: Bar[],
  projection: ProjectionScenario,
  startIndex: number,
  horizonBars: number,
): ProjectionBacktestOutcome {
  const startPrice = projection.startPrice;
  const targetPrice = getFirstTargetPrice(projection);
  const endIndex = Math.min(bars.length - 1, startIndex + horizonBars);
  const window = bars.slice(startIndex + 1, endIndex + 1);
  let status: ProjectionBacktestStatus = "pending";
  let barsElapsed = window.length;
  let maxFavorablePct = 0;
  let maxAdversePct = 0;

  for (let offset = 0; offset < window.length; offset += 1) {
    const bar = window[offset];
    const favorablePct = getFavorablePct(projection.direction, startPrice, bar);
    const adversePct = getAdversePct(projection.direction, startPrice, bar);
    maxFavorablePct = Math.max(maxFavorablePct, favorablePct);
    maxAdversePct = Math.min(maxAdversePct, adversePct);

    if (isInvalidationHit(projection, bar)) {
      status = "invalidated";
      barsElapsed = offset + 1;
      break;
    }

    if (isTargetHit(projection.direction, targetPrice, bar)) {
      status = "target_hit";
      barsElapsed = offset + 1;
      break;
    }
  }

  if (status === "pending" && window.length >= horizonBars) {
    status = "expired";
  }

  if (projection.status === "invalidated" && status === "pending") {
    status = "invalidated";
  }

  return {
    projectionId: projection.id,
    title: projection.title,
    family: projection.family,
    direction: projection.direction,
    horizonBars,
    startDate: projection.startDate,
    targetPrice,
    invalidationPrice: projection.invalidationPrice,
    barsElapsed,
    maxFavorablePct: roundPct(maxFavorablePct),
    maxAdversePct: roundPct(maxAdversePct),
    status,
  };
}

function getFirstTargetPrice(projection: ProjectionScenario) {
  return projection.direction === "up" ? projection.targetZone.min : projection.targetZone.max;
}

function isTargetHit(direction: ProjectionDirection, targetPrice: number, bar: Bar) {
  return direction === "up" ? bar.high >= targetPrice : bar.low <= targetPrice;
}

function isInvalidationHit(projection: ProjectionScenario, bar: Bar) {
  if (projection.invalidationPrice === null) {
    return false;
  }

  return projection.direction === "up"
    ? bar.low < projection.invalidationPrice
    : bar.high > projection.invalidationPrice;
}

function getFavorablePct(direction: ProjectionDirection, startPrice: number, bar: Bar) {
  return direction === "up"
    ? ((bar.high - startPrice) / startPrice) * 100
    : ((startPrice - bar.low) / startPrice) * 100;
}

function getAdversePct(direction: ProjectionDirection, startPrice: number, bar: Bar) {
  return direction === "up"
    ? ((bar.low - startPrice) / startPrice) * 100
    : ((startPrice - bar.high) / startPrice) * 100;
}

function roundPct(value: number) {
  return Math.trunc(value * 100) / 100;
}
