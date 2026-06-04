import type { Bar, ChartAnnotation } from "@/lib/market/types";

export type ProjectionDirection = "up" | "down";
export type ProjectionFamily = "wyckoff" | "elliott" | "confluence";
export type ProjectionStatus = "active" | "invalidated" | "conflicted" | "pending-data";

export type ProjectionPoint = {
  date: string;
  price: number;
};

export type ProjectionScenario = {
  id: string;
  family: ProjectionFamily;
  title: string;
  direction: ProjectionDirection;
  status: ProjectionStatus;
  sourceAnnotationIds: string[];
  startDate: string;
  startPrice: number;
  invalidationPrice: number | null;
  targetZone: {
    min: number;
    max: number;
  };
  points: ProjectionPoint[];
  evidence: string[];
  conflicts: string[];
  confidence: number;
};

type ElliottWaveMeta = {
  rank?: unknown;
  direction?: unknown;
  points?: unknown;
};

type ElliottWavePoint = {
  label: string;
  date: string;
  price: number;
};

export function buildProjectionScenarios(
  annotations: ChartAnnotation[],
  bars: Bar[],
): ProjectionScenario[] {
  if (bars.length === 0) {
    return [];
  }

  const baseScenarios = [
    ...buildWyckoffProjectionScenarios(annotations, bars),
    ...buildElliottProjectionScenarios(annotations, bars),
  ];

  return [
    ...baseScenarios,
    ...buildConfluenceScenarios(baseScenarios),
  ];
}

function buildWyckoffProjectionScenarios(
  annotations: ChartAnnotation[],
  bars: Bar[],
): ProjectionScenario[] {
  const range = findLatestAnnotation(annotations, (annotation) =>
    annotation.family === "wyckoff" && annotation.type === "Trading Range",
  );
  const markup = findLatestAnnotation(annotations, (annotation) =>
    annotation.family === "wyckoff" && ["LPS", "SOS", "Phase E"].includes(annotation.type),
  );
  const markdown = findLatestAnnotation(annotations, (annotation) =>
    annotation.family === "wyckoff" && ["LPSY", "SOW", "Phase E"].includes(annotation.type),
  );

  if (markup && isAccumulationProjectionSource(markup) && (!markdown || markup.endDate >= markdown.endDate)) {
    const low = range?.priceMin ?? markup.priceMin;
    const high = range?.priceMax ?? markup.priceMax;
    const height = high - low;
    if (height <= 0) {
      return [];
    }

    const target1 = high + height;
    const target2 = high + height * 1.5;
    const status = isProjectionInvalidated(markup, "up", bars) ? "invalidated" : "active";
    return [{
      id: `projection-wyckoff-markup-${markup.id}`,
      family: "wyckoff",
      title: "Wyckoff markup projection",
      direction: "up",
      status,
      sourceAnnotationIds: [range?.id, markup.id].filter((id): id is string => Boolean(id)),
      startDate: markup.endDate,
      startPrice: markup.priceMax,
      invalidationPrice: markup.invalidationPrice,
      targetZone: normalizeZone(target1, target2),
      points: [
        { date: markup.endDate, price: markup.priceMax },
        { date: addProjectionDate(markup.endDate, bars, 20), price: target1 },
        { date: addProjectionDate(markup.endDate, bars, 40), price: target2 },
      ],
      evidence: [
        `source event ${markup.type} appeared after range development`,
        range ? "measured target uses current trading range height" : "measured target uses source event height",
        ...markup.evidence.slice(0, 2),
      ],
      conflicts: status === "invalidated" ? ["latest close has crossed the source invalidation level"] : [],
      confidence: combineConfidence(range?.confidence, markup.confidence, status),
    }];
  }

  if (markdown && isDistributionProjectionSource(markdown)) {
    const low = range?.priceMin ?? markdown.priceMin;
    const high = range?.priceMax ?? markdown.priceMax;
    const height = high - low;
    if (height <= 0) {
      return [];
    }

    const target1 = low - height;
    const target2 = low - height * 1.5;
    const status = isProjectionInvalidated(markdown, "down", bars) ? "invalidated" : "active";
    return [{
      id: `projection-wyckoff-markdown-${markdown.id}`,
      family: "wyckoff",
      title: "Wyckoff markdown projection",
      direction: "down",
      status,
      sourceAnnotationIds: [range?.id, markdown.id].filter((id): id is string => Boolean(id)),
      startDate: markdown.endDate,
      startPrice: markdown.priceMin,
      invalidationPrice: markdown.invalidationPrice,
      targetZone: normalizeZone(target1, target2),
      points: [
        { date: markdown.endDate, price: markdown.priceMin },
        { date: addProjectionDate(markdown.endDate, bars, 20), price: target1 },
        { date: addProjectionDate(markdown.endDate, bars, 40), price: target2 },
      ],
      evidence: [
        `source event ${markdown.type} appeared after range development`,
        range ? "measured target uses current trading range height" : "measured target uses source event height",
        ...markdown.evidence.slice(0, 2),
      ],
      conflicts: status === "invalidated" ? ["latest close has crossed the source invalidation level"] : [],
      confidence: combineConfidence(range?.confidence, markdown.confidence, status),
    }];
  }

  return [];
}

function buildElliottProjectionScenarios(
  annotations: ChartAnnotation[],
  bars: Bar[],
): ProjectionScenario[] {
  const impulse = findLatestAnnotation(annotations, (annotation) =>
    annotation.family === "elliott"
    && annotation.type === "Impulse"
    && getElliottRank(annotation) === "primary"
    && getElliottWavePoints(annotation).length >= 6,
  );

  if (!impulse) {
    return [];
  }

  const points = getElliottWavePoints(impulse);
  const wave5 = points.at(-1);
  if (!wave5) {
    return [];
  }

  const impulseDirection = getElliottDirection(impulse, points);
  const direction = impulseDirection === "up" ? "down" : "up";
  const targets = getElliottCorrectionTargets(annotations, impulse, points);
  if (!targets) {
    return [];
  }

  const [target1, target2] = targets;
  if (!Number.isFinite(target1) || !Number.isFinite(target2)) {
    return [];
  }

  const status = isProjectionInvalidated(impulse, impulseDirection, bars) ? "invalidated" : "active";
  return [{
    id: `projection-elliott-correction-${impulse.id}`,
    family: "elliott",
    title: "Elliott A-B-C projection",
    direction,
    status,
    sourceAnnotationIds: [impulse.id],
    startDate: wave5.date,
    startPrice: wave5.price,
    invalidationPrice: impulse.invalidationPrice,
    targetZone: normalizeZone(target1, target2),
    points: [
      { date: wave5.date, price: wave5.price },
      { date: addProjectionDate(wave5.date, bars, 12), price: target1 },
      { date: addProjectionDate(wave5.date, bars, 24), price: target2 },
    ],
    evidence: [
      "primary Elliott impulse has six validated pivot points",
      "A-B-C guide uses common Fibonacci retracement levels",
      ...impulse.evidence.slice(0, 2),
    ],
    conflicts: status === "invalidated" ? ["latest close has crossed the Elliott count invalidation level"] : [],
    confidence: combineConfidence(impulse.confidence, 0.54, status),
  }];
}

function buildConfluenceScenarios(scenarios: ProjectionScenario[]): ProjectionScenario[] {
  const wyckoff = scenarios.find((scenario) => scenario.family === "wyckoff" && scenario.status === "active");
  const elliott = scenarios.find((scenario) => scenario.family === "elliott" && scenario.status === "active");
  if (!wyckoff || !elliott) {
    return [];
  }

  if (wyckoff.direction !== elliott.direction) {
    return [{
      id: `projection-confluence-conflict-${wyckoff.id}-${elliott.id}`,
      family: "confluence",
      title: "Projection confluence check",
      direction: wyckoff.direction,
      status: "conflicted",
      sourceAnnotationIds: [...wyckoff.sourceAnnotationIds, ...elliott.sourceAnnotationIds],
      startDate: maxDate(wyckoff.startDate, elliott.startDate),
      startPrice: wyckoff.startPrice,
      invalidationPrice: null,
      targetZone: normalizeZone(wyckoff.targetZone.min, elliott.targetZone.max),
      points: [],
      evidence: ["Wyckoff and Elliott both produced projections"],
      conflicts: ["Wyckoff and Elliott projection directions are not aligned"],
      confidence: 0.25,
    }];
  }

  const overlap = overlapZone(wyckoff.targetZone, elliott.targetZone);
  const tolerance = Math.max(wyckoff.startPrice, elliott.startPrice) * 0.03;
  const near = Math.abs(zoneMidpoint(wyckoff.targetZone) - zoneMidpoint(elliott.targetZone)) <= tolerance;
  if (!overlap && !near) {
    return [{
      id: `projection-confluence-conflict-${wyckoff.id}-${elliott.id}`,
      family: "confluence",
      title: "Projection confluence check",
      direction: wyckoff.direction,
      status: "conflicted",
      sourceAnnotationIds: [...wyckoff.sourceAnnotationIds, ...elliott.sourceAnnotationIds],
      startDate: maxDate(wyckoff.startDate, elliott.startDate),
      startPrice: wyckoff.startPrice,
      invalidationPrice: null,
      targetZone: normalizeZone(wyckoff.targetZone.min, elliott.targetZone.max),
      points: [],
      evidence: ["Wyckoff and Elliott directions align"],
      conflicts: ["Target zones are too far apart for confluence"],
      confidence: 0.34,
    }];
  }

  const targetZone = overlap ?? normalizeZone(zoneMidpoint(wyckoff.targetZone), zoneMidpoint(elliott.targetZone));
  const startDate = maxDate(wyckoff.startDate, elliott.startDate);
  const startPrice = (wyckoff.startPrice + elliott.startPrice) / 2;
  const targetPrice = zoneMidpoint(targetZone);

  return [{
    id: `projection-confluence-${wyckoff.id}-${elliott.id}`,
    family: "confluence",
    title: "Confluence projection",
    direction: wyckoff.direction,
    status: "active",
    sourceAnnotationIds: [...wyckoff.sourceAnnotationIds, ...elliott.sourceAnnotationIds],
    startDate,
    startPrice,
    invalidationPrice: null,
    targetZone,
    points: [
      { date: startDate, price: startPrice },
      { date: maxDate(wyckoff.points.at(-1)?.date ?? startDate, elliott.points.at(-1)?.date ?? startDate), price: targetPrice },
    ],
    evidence: ["Wyckoff and Elliott projections align within a nearby target zone"],
    conflicts: [],
    confidence: Math.min(0.88, (wyckoff.confidence + elliott.confidence) / 2 + 0.12),
  }];
}

function isAccumulationProjectionSource(annotation: ChartAnnotation) {
  return ["LPS", "SOS"].includes(annotation.type)
    || (annotation.type === "Phase E" && annotation.label.toLowerCase().includes("accumulation"));
}

function isDistributionProjectionSource(annotation: ChartAnnotation) {
  return ["LPSY", "SOW"].includes(annotation.type)
    || (annotation.type === "Phase E" && annotation.label.toLowerCase().includes("distribution"));
}

function getElliottCorrectionTargets(
  annotations: ChartAnnotation[],
  impulse: ChartAnnotation,
  points: ElliottWavePoint[],
): [number, number] | null {
  const wave5 = points.at(-1);
  if (!wave5) {
    return null;
  }

  const direction = getElliottDirection(impulse, points);
  const fibGuide = findLatestAnnotation(annotations, (annotation) =>
    annotation.type === "Fib Guide" || annotation.phase === "fib",
  );
  const fib382 = fibGuide?.meta?.retracement382;
  const fib618 = fibGuide?.meta?.retracement618;
  if (typeof fib382 === "number" && typeof fib618 === "number") {
    const levelsMatchDirection = direction === "down"
      ? fib382 > wave5.price && fib618 > wave5.price
      : fib382 < wave5.price && fib618 < wave5.price;

    if (!levelsMatchDirection) {
      return null;
    }

    return [fib382, fib618];
  }

  const first = points[0];
  const height = Math.abs(wave5.price - first.price);
  return direction === "down"
    ? [wave5.price + height * 0.382, wave5.price + height * 0.618]
    : [wave5.price - height * 0.382, wave5.price - height * 0.618];
}

function getElliottWavePoints(annotation: ChartAnnotation): ElliottWavePoint[] {
  const wave = getElliottWaveMeta(annotation);
  if (!Array.isArray(wave?.points)) {
    return [];
  }

  return wave.points.filter(isElliottWavePoint);
}

function getElliottWaveMeta(annotation: ChartAnnotation): ElliottWaveMeta | null {
  const value = annotation.meta?.elliottWave;
  return value && typeof value === "object" ? value as ElliottWaveMeta : null;
}

function isElliottWavePoint(value: unknown): value is ElliottWavePoint {
  if (!value || typeof value !== "object") {
    return false;
  }

  const point = value as Record<string, unknown>;
  return typeof point.label === "string"
    && typeof point.date === "string"
    && typeof point.price === "number"
    && Number.isFinite(point.price);
}

function getElliottRank(annotation: ChartAnnotation) {
  const rank = getElliottWaveMeta(annotation)?.rank;
  return typeof rank === "string" ? rank : "primary";
}

function getElliottDirection(annotation: ChartAnnotation, points: ElliottWavePoint[]): ProjectionDirection {
  const direction = getElliottWaveMeta(annotation)?.direction;
  if (direction === "up" || direction === "down") {
    return direction;
  }

  return points.at(-1)!.price >= points[0].price ? "up" : "down";
}

function findLatestAnnotation(
  annotations: ChartAnnotation[],
  predicate: (annotation: ChartAnnotation) => boolean,
) {
  return [...annotations].reverse().find(predicate) ?? null;
}

function addProjectionDate(date: string, bars: Bar[], steps: number) {
  const source = new Date(`${date}T00:00:00.000Z`);
  const stepDays = bars.at(-1)?.timeframe === "1w" ? 7 : 1;
  source.setUTCDate(source.getUTCDate() + steps * stepDays);
  return source.toISOString().slice(0, 10);
}

function isProjectionInvalidated(annotation: ChartAnnotation, direction: ProjectionDirection, bars: Bar[]) {
  if (annotation.status === "invalidated") {
    return true;
  }

  if (annotation.invalidationPrice === null) {
    return false;
  }

  const latestClose = bars.at(-1)?.close;
  if (latestClose === undefined) {
    return false;
  }

  return direction === "up"
    ? latestClose < annotation.invalidationPrice
    : latestClose > annotation.invalidationPrice;
}

function combineConfidence(
  left: number | undefined,
  right: number | undefined,
  status: ProjectionStatus,
) {
  const raw = ((left ?? 0.46) + (right ?? 0.48)) / 2;
  const adjusted = status === "invalidated" ? raw * 0.35 : raw;
  return Math.max(0, Math.min(1, Number(adjusted.toFixed(2))));
}

function normalizeZone(left: number, right: number) {
  return {
    min: Math.min(left, right),
    max: Math.max(left, right),
  };
}

function overlapZone(
  left: ProjectionScenario["targetZone"],
  right: ProjectionScenario["targetZone"],
) {
  const min = Math.max(left.min, right.min);
  const max = Math.min(left.max, right.max);
  return min <= max ? { min, max } : null;
}

function zoneMidpoint(zone: ProjectionScenario["targetZone"]) {
  return (zone.min + zone.max) / 2;
}

function maxDate(left: string, right: string) {
  return left >= right ? left : right;
}
