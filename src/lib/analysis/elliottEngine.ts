import type { AnalysisMode, AnnotationQuality, ChartAnnotation, SwingPoint, Timeframe } from "@/lib/market/types";

export type ElliottOptions = {
  mode?: AnalysisMode;
  strictOverlap?: boolean;
};

type ElliottCandidate = {
  points: SwingPoint[];
  score: number;
};

type ImpulseDirection = "up" | "down";
type ElliottWavePoint = {
  label: string;
  index: number;
  kind: SwingPoint["kind"];
  date: string;
  price: number;
};

export function detectElliott(
  symbol: string,
  timeframe: Timeframe,
  swings: SwingPoint[],
  options: ElliottOptions = {},
): ChartAnnotation[] {
  const mode = options.mode ?? "strict";
  const normalizedOptions = {
    ...options,
    mode,
    strictOverlap: options.strictOverlap ?? mode === "strict",
  };
  const impulseCandidates = findImpulseCandidates(swings, normalizedOptions).slice(0, 3);
  const latestSwingIndex = swings.at(-1)?.index;
  const annotations = impulseCandidates.map((candidate, index) =>
    buildImpulse(symbol, timeframe, candidate.points, candidate.score, index, latestSwingIndex, mode),
  );
  const primary = impulseCandidates[0];
  const correction = findCorrectionCandidates(swings, primary?.points.at(-1)?.index).at(0);

  if (correction) {
    annotations.push(buildCorrection(symbol, timeframe, correction.points, correction.score, mode));
  }

  if (primary) {
    annotations.push(buildFibGuide(symbol, timeframe, primary.points, mode));
  }

  return annotations;
}

function findImpulseCandidates(swings: SwingPoint[], options: ElliottOptions): ElliottCandidate[] {
  const candidates: ElliottCandidate[] = [];
  const latestSwingPosition = swings.length - 1;
  const currentWindowStart = options.mode === "strict"
    ? Math.max(0, latestSwingPosition - 12)
    : 0;

  for (let start = 0; start <= swings.length - 6; start += 1) {
    if (start + 5 < currentWindowStart) {
      continue;
    }
    const points = swings.slice(start, start + 6);
    if (isImpulse(points, options)) {
      candidates.push({ points, score: scoreImpulse(points, swings.at(-1)?.index) });
    }
  }

  return candidates.sort((left, right) =>
    right.points[5].index - left.points[5].index || right.score - left.score,
  );
}

function findCorrectionCandidates(swings: SwingPoint[], afterIndex: number | undefined): ElliottCandidate[] {
  const candidates: ElliottCandidate[] = [];

  for (let start = 0; start <= swings.length - 4; start += 1) {
    const points = swings.slice(start, start + 4);
    if (afterIndex !== undefined && points[0].index < afterIndex) {
      continue;
    }
    if (isCorrection(points)) {
      candidates.push({ points, score: scoreCorrection(points) });
    }
  }

  return candidates.sort((left, right) =>
    right.score - left.score || left.points[0].index - right.points[0].index,
  );
}

function isImpulse(points: SwingPoint[], options: ElliottOptions): boolean {
  if (points.length !== 6 || !alternates(points)) {
    return false;
  }

  const direction = impulseDirection(points);
  const [origin, wave1, wave2, wave3, wave4, wave5] = points;
  if (!isBeyond(wave1.price, origin.price, direction)) {
    return false;
  }

  if (!isBeyond(wave2.price, origin.price, direction)) {
    return false;
  }

  if (!isBeyond(wave3.price, wave1.price, direction)) {
    return false;
  }

  if (!isBeyond(wave4.price, wave2.price, direction)) {
    return false;
  }

  if (!isBeyond(wave5.price, wave3.price, direction)) {
    return false;
  }

  if (options.strictOverlap && !isBeyond(wave4.price, wave1.price, direction)) {
    return false;
  }

  const wave1Length = motiveLength(origin, wave1, direction);
  const wave3Length = motiveLength(wave2, wave3, direction);
  const wave5Length = motiveLength(wave4, wave5, direction);
  const shortest = Math.min(wave1Length, wave3Length, wave5Length);

  return wave3Length > shortest;
}

function isCorrection(points: SwingPoint[]): boolean {
  if (points.length !== 4 || !alternates(points)) {
    return false;
  }

  const [start, waveA, waveB, waveC] = points;
  return start.kind === "high"
    && waveA.price < start.price
    && waveB.price < start.price
    && waveB.price > waveA.price
    && waveC.price < waveA.price;
}

function alternates(points: SwingPoint[]): boolean {
  return points.every((point, index) => index === 0 || point.kind !== points[index - 1].kind);
}

function scoreImpulse(points: SwingPoint[], latestSwingIndex: number | undefined): number {
  const direction = impulseDirection(points);
  const [origin, wave1, wave2, wave3, wave4, wave5] = points;
  const wave1Length = motiveLength(origin, wave1, direction);
  const wave3Length = motiveLength(wave2, wave3, direction);
  const wave5Length = motiveLength(wave4, wave5, direction);
  const retrace2 = motiveLength(wave2, wave1, direction) / Math.max(1, wave1Length);
  const retrace4 = motiveLength(wave4, wave3, direction) / Math.max(1, wave3Length);
  const extension3 = wave3Length / Math.max(1, wave1Length);
  const balance = 1 - Math.min(1, Math.abs(wave5Length - wave1Length) / Math.max(1, wave1Length));
  const fibFit = near(retrace2, 0.618, 0.25) + near(retrace4, 0.382, 0.25) + near(extension3, 1.618, 0.8);

  const recency = latestSwingIndex === undefined ? 0 : 1 - Math.min(1, (latestSwingIndex - wave5.index) / Math.max(1, latestSwingIndex));
  return clamp(0.35 + fibFit * 0.12 + balance * 0.15 + (wave3Length > wave1Length ? 0.12 : 0) + recency * 0.12);
}

function scoreCorrection(points: SwingPoint[]): number {
  const [start, waveA, waveB, waveC] = points;
  const aLength = start.price - waveA.price;
  const cLength = waveB.price - waveC.price;
  const symmetry = 1 - Math.min(1, Math.abs(aLength - cLength) / Math.max(1, aLength));
  return clamp(0.45 + symmetry * 0.25);
}

function buildImpulse(
  symbol: string,
  timeframe: Timeframe,
  points: SwingPoint[],
  confidence: number,
  rank: number,
  latestSwingIndex: number | undefined,
  mode: AnalysisMode,
): ChartAnnotation {
  const prices = points.map((point) => point.price);
  const labels = ["0", "1", "2", "3", "4", "5"];
  const rankLabel = rank === 0 ? "Primary" : `Alternate ${rank + 1}`;
  const direction = impulseDirection(points);
  const qualityScore = scoreWithMode(confidence, mode, latestSwingIndex, points[5].index);
  const quality = qualityFromScore(qualityScore);
  return {
    id: `${symbol}-${timeframe}-elliott-impulse-${points[0].index}-${points[5].index}`,
    symbol,
    timeframe,
    family: "elliott",
    type: "Impulse",
    label: `${rankLabel} ${labels.map((label, index) => `${label}@${points[index].date}`).join(" ")}`,
    startDate: points[0].date,
    endDate: points[5].date,
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
    invalidationPrice: points[0].price,
    status: mode === "strict" && quality === "strong" && latestSwingIndex !== undefined && latestSwingIndex > points[5].index
      ? "confirmed"
      : "candidate",
    evidence: [
      "Wave 2 retraces less than 100% of Wave 1",
      "Wave 3 extends beyond Wave 1 and is not the shortest motive wave",
      "Wave 4 respects the Wave 2 pivot in the impulse direction",
      "Wave 5 extends beyond the Wave 3 pivot",
    ],
    confidence: qualityScore,
    qualityScore,
    quality,
    phase: "1-5",
    conflicts: [],
    meta: {
      elliottWave: {
        pattern: "impulse",
        rank: rank === 0 ? "primary" : `alternate-${rank + 1}`,
        direction,
        points: toWavePoints(points, labels),
      },
      analysisMode: mode,
    },
  };
}

function buildCorrection(symbol: string, timeframe: Timeframe, points: SwingPoint[], confidence: number, mode: AnalysisMode): ChartAnnotation {
  const prices = points.map((point) => point.price);
  const [origin, waveA, waveB, waveC] = points;
  const qualityScore = scoreWithMode(confidence, mode, points.at(-1)?.index, points.at(-1)?.index);
  const quality = qualityFromScore(qualityScore);
  return {
    id: `${symbol}-${timeframe}-elliott-correction-${points[0].index}-${points[3].index}`,
    symbol,
    timeframe,
    family: "elliott",
    type: "Correction",
    label: `A@${points[1].date} B@${points[2].date} C@${points[3].date}`,
    startDate: points[0].date,
    endDate: points[3].date,
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
    invalidationPrice: points[0].price,
    status: mode === "strict" && quality === "strong" ? "confirmed" : "candidate",
    evidence: [
      "A-B-C correction candidate follows a completed impulse swing",
      "B remains below the prior impulse high",
    ],
    confidence: qualityScore,
    qualityScore,
    quality,
    phase: "A-B-C",
    conflicts: [],
    meta: {
      elliottWave: {
        pattern: "correction",
        origin: toWavePoint(origin, "origin"),
        points: toWavePoints([waveA, waveB, waveC], ["A", "B", "C"]),
      },
      analysisMode: mode,
    },
  };
}

function buildFibGuide(symbol: string, timeframe: Timeframe, points: SwingPoint[], mode: AnalysisMode): ChartAnnotation {
  const direction = impulseDirection(points);
  const [origin, wave1, wave2, wave3, wave4, wave5] = points;
  const wave1Length = motiveLength(origin, wave1, direction);
  const wave3Length = motiveLength(wave2, wave3, direction);
  const impulseHeight = motiveLength(origin, wave5, direction);
  const retrace382 = projectAgainstDirection(wave5.price, impulseHeight * 0.382, direction);
  const retrace618 = projectAgainstDirection(wave5.price, impulseHeight * 0.618, direction);
  const projection1618 = projectWithDirection(wave4.price, wave1Length * 1.618, direction);
  const wave3Extension = projectWithDirection(wave3.price, wave3Length * 0.618, direction);
  const prices = [retrace382, retrace618, projection1618, wave3Extension];

  return {
    id: `${symbol}-${timeframe}-elliott-fib-${points[0].index}-${points[5].index}`,
    symbol,
    timeframe,
    family: "structure",
    type: "Fib Guide",
    label: `38.2% ${Math.round(retrace382)} / 61.8% ${Math.round(retrace618)} / 161.8% ${Math.round(projection1618)}`,
    startDate: origin.date,
    endDate: wave5.date,
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
    invalidationPrice: origin.price,
    status: "candidate",
    evidence: [
      "Fibonacci levels are context guides for the primary Elliott count",
      "levels are not hard predictions or trade recommendations",
    ],
    confidence: 0.5,
    qualityScore: 0.5,
    quality: "plausible",
    phase: "fib",
    conflicts: [],
    meta: {
      retracement382: retrace382,
      retracement618: retrace618,
      projection1618,
      analysisMode: mode,
    },
  };
}

function near(value: number, target: number, tolerance: number): number {
  const distance = Math.abs(value - target);
  return Math.max(0, 1 - distance / tolerance);
}

function impulseDirection(points: SwingPoint[]): ImpulseDirection {
  return points[0].kind === "low" ? "up" : "down";
}

function isBeyond(price: number, pivot: number, direction: ImpulseDirection): boolean {
  return direction === "up" ? price > pivot : price < pivot;
}

function motiveLength(start: SwingPoint, end: SwingPoint, direction: ImpulseDirection): number {
  return direction === "up" ? end.price - start.price : start.price - end.price;
}

function projectWithDirection(price: number, distance: number, direction: ImpulseDirection): number {
  return direction === "up" ? price + distance : price - distance;
}

function projectAgainstDirection(price: number, distance: number, direction: ImpulseDirection): number {
  return direction === "up" ? price - distance : price + distance;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function scoreWithMode(
  confidence: number,
  mode: AnalysisMode,
  latestSwingIndex: number | undefined,
  endIndex: number | undefined,
) {
  const recencyPenalty = latestSwingIndex === undefined || endIndex === undefined
    ? 0
    : Math.min(0.12, Math.max(0, latestSwingIndex - endIndex) * 0.01);
  return clamp(confidence + (mode === "strict" ? 0.04 : 0) - recencyPenalty);
}

function qualityFromScore(score: number): AnnotationQuality {
  if (score >= 0.72) {
    return "strong";
  }

  if (score >= 0.5) {
    return "plausible";
  }

  return "weak";
}

function toWavePoints(points: SwingPoint[], labels: string[]): ElliottWavePoint[] {
  return points.map((point, index) => toWavePoint(point, labels[index]));
}

function toWavePoint(point: SwingPoint, label: string): ElliottWavePoint {
  return {
    label,
    index: point.index,
    kind: point.kind,
    date: point.date,
    price: point.price,
  };
}
