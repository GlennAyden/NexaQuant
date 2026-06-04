import type { ProjectionScenario } from "@/lib/analysis/projectionEngine";
import type { ChartAnnotation } from "@/lib/market/types";

export type ProjectionExplanationSource = {
  id: string;
  type: string;
  label: string;
  status: ChartAnnotation["status"];
  date: string;
  evidence: string[];
};

export type ProjectionExplanation = {
  id: string;
  projectionId: string;
  title: string;
  ruleBasis: string;
  targetPath: string;
  targetZone: string;
  invalidation: {
    state: "defined" | "missing";
    label: string;
    price: number | null;
  };
  sourceEvents: ProjectionExplanationSource[];
  evidence: string[];
  conflicts: string[];
  confidenceLabel: string;
};

export function buildProjectionExplanations(
  projections: ProjectionScenario[],
  annotations: ChartAnnotation[],
): ProjectionExplanation[] {
  const annotationById = new Map(annotations.map((annotation) => [annotation.id, annotation]));

  return projections.map((projection) => {
    const sourceEvents = projection.sourceAnnotationIds
      .map((id) => annotationById.get(id))
      .filter((annotation): annotation is ChartAnnotation => Boolean(annotation))
      .map(toSourceEvent);
    const missingSources = projection.sourceAnnotationIds.filter((id) => !annotationById.has(id));

    return {
      id: `explanation-${projection.id}`,
      projectionId: projection.id,
      title: projection.title,
      ruleBasis: getRuleBasis(projection),
      targetPath: formatTargetPath(projection),
      targetZone: `${formatPrice(projection.targetZone.min)} - ${formatPrice(projection.targetZone.max)}`,
      invalidation: buildInvalidation(projection),
      sourceEvents,
      evidence: buildEvidence(projection, sourceEvents),
      conflicts: [
        ...projection.conflicts,
        ...missingSources.map((id) => `source annotation ${id} is no longer visible in this chart window`),
      ],
      confidenceLabel: `${Math.round(projection.confidence * 100)}% rule confidence`,
    };
  });
}

function toSourceEvent(annotation: ChartAnnotation): ProjectionExplanationSource {
  return {
    id: annotation.id,
    type: annotation.type,
    label: annotation.label,
    status: annotation.status,
    date: annotation.endDate,
    evidence: annotation.evidence.slice(0, 2),
  };
}

function getRuleBasis(projection: ProjectionScenario) {
  if (projection.family === "wyckoff") {
    return projection.direction === "up"
      ? "Wyckoff markup uses range height after SOS/LPS evidence."
      : "Wyckoff markdown uses range height after SOW/LPSY evidence.";
  }

  if (projection.family === "elliott") {
    return "Elliott A-B-C uses the primary impulse and Fibonacci retracement guide.";
  }

  return "Confluence checks whether Wyckoff and Elliott point to compatible zones.";
}

function formatTargetPath(projection: ProjectionScenario) {
  if (projection.points.length === 0) {
    return "No drawable path";
  }

  return projection.points.map((point) => formatPrice(point.price)).join(" -> ");
}

function buildInvalidation(projection: ProjectionScenario): ProjectionExplanation["invalidation"] {
  if (projection.invalidationPrice === null) {
    return {
      state: "missing",
      label: "No explicit invalidation",
      price: null,
    };
  }

  return {
    state: "defined",
    label: `Invalid ${getInvalidationTrigger(projection)} ${formatPrice(projection.invalidationPrice)}`,
    price: projection.invalidationPrice,
  };
}

function getInvalidationTrigger(projection: ProjectionScenario) {
  const sourceDirection = projection.family === "elliott" ? oppositeDirection(projection.direction) : projection.direction;
  return sourceDirection === "up" ? "below" : "above";
}

function oppositeDirection(direction: ProjectionScenario["direction"]) {
  return direction === "up" ? "down" : "up";
}

function buildEvidence(
  projection: ProjectionScenario,
  sourceEvents: ProjectionExplanationSource[],
) {
  return [
    ...projection.evidence,
    ...sourceEvents.flatMap((source) =>
      source.evidence.map((item) => `${source.label}: ${item}`),
    ),
  ].slice(0, 8);
}

function formatPrice(price: number) {
  return Math.round(price).toLocaleString("id-ID");
}
