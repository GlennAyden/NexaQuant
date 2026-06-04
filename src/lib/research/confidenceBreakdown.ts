import type { ProjectionScenario } from "@/lib/analysis/projectionEngine";
import type { ChartAnnotation } from "@/lib/market/types";
import type { DataQualityGuardResult } from "@/lib/research/dataQualityGuard";
import type { TimeframeConflictResult } from "@/lib/research/timeframeConflict";

export type ConfidenceComponent = {
  label: string;
  score: number;
  evidence: string[];
};

export type ConfidenceBreakdown = {
  overall: number;
  components: {
    dataQuality: ConfidenceComponent;
    annotationQuality: ConfidenceComponent;
    projectionQuality: ConfidenceComponent;
    timeframeAlignment: ConfidenceComponent;
    invalidationClarity: ConfidenceComponent;
  };
};

export function buildConfidenceBreakdown(
  annotations: ChartAnnotation[],
  projections: ProjectionScenario[],
  conflict: TimeframeConflictResult,
  guard: DataQualityGuardResult,
): ConfidenceBreakdown {
  const components = {
    dataQuality: buildDataQualityComponent(guard),
    annotationQuality: buildAnnotationQualityComponent(annotations),
    projectionQuality: buildProjectionQualityComponent(projections),
    timeframeAlignment: buildTimeframeAlignmentComponent(conflict),
    invalidationClarity: buildInvalidationClarityComponent(annotations, projections),
  };

  return {
    overall: round2(Object.values(components).reduce((sum, component) => sum + component.score, 0) / 5),
    components,
  };
}

function buildDataQualityComponent(guard: DataQualityGuardResult): ConfidenceComponent {
  return {
    label: "Data quality",
    score: clamp(guard.score),
    evidence: [`guard status ${guard.status}`, ...guard.blockers, ...guard.reasons],
  };
}

function buildAnnotationQualityComponent(annotations: ChartAnnotation[]): ConfidenceComponent {
  if (annotations.length === 0) {
    return {
      label: "Annotation quality",
      score: 0.25,
      evidence: ["no annotations available"],
    };
  }

  const invalidated = annotations.filter((annotation) => annotation.status === "invalidated").length;
  const conflicted = annotations.filter((annotation) => (annotation.conflicts?.length ?? 0) > 0).length;
  const averageConfidence = annotations.reduce((sum, annotation) => sum + (annotation.confidence ?? 0.5), 0) / annotations.length;
  const score = clamp(round2(averageConfidence - invalidated * 0.22 / annotations.length - conflicted * 0.12 / annotations.length));

  return {
    label: "Annotation quality",
    score,
    evidence: [
      `${annotations.length} annotations reviewed`,
      `${invalidated} of ${annotations.length} annotations are invalidated`,
      `${conflicted} of ${annotations.length} annotations have conflicts`,
    ],
  };
}

function buildProjectionQualityComponent(projections: ProjectionScenario[]): ConfidenceComponent {
  if (projections.length === 0) {
    return {
      label: "Projection quality",
      score: 0.25,
      evidence: ["no projections available"],
    };
  }

  const active = projections.filter((projection) => projection.status === "active");
  const invalidatedOrConflicted = projections.filter((projection) =>
    projection.status === "invalidated" || projection.status === "conflicted",
  );
  const pending = projections.filter((projection) => projection.status === "pending-data").length;

  if (active.length === 0 && invalidatedOrConflicted.length === projections.length) {
    return {
      label: "Projection quality",
      score: 0.22,
      evidence: [`0 of ${projections.length} projections are active`, "all projections are invalidated or conflicted"],
    };
  }

  const averageConfidence = projections.reduce((sum, projection) => sum + projection.confidence, 0) / projections.length;
  const score = clamp(round2(averageConfidence + active.length * 0.12 / projections.length - pending * 0.18 / projections.length));

  return {
    label: "Projection quality",
    score,
    evidence: [
      `${active.length} of ${projections.length} projections are active`,
      `${pending} of ${projections.length} projections are pending data`,
    ],
  };
}

function buildTimeframeAlignmentComponent(conflict: TimeframeConflictResult): ConfidenceComponent {
  const score = conflict.status === "aligned" ? 0.9 : conflict.status === "insufficient" ? 0.55 : 0.2;
  return {
    label: "Timeframe alignment",
    score,
    evidence: [...conflict.evidence, ...conflict.conflicts],
  };
}

function buildInvalidationClarityComponent(
  annotations: ChartAnnotation[],
  projections: ProjectionScenario[],
): ConfidenceComponent {
  const items = [...annotations, ...projections];
  if (items.length === 0) {
    return {
      label: "Invalidation clarity",
      score: 0,
      evidence: ["no annotations or projections available"],
    };
  }

  const withInvalidation = items.filter((item) => item.invalidationPrice !== null).length;
  return {
    label: "Invalidation clarity",
    score: round2(withInvalidation / items.length),
    evidence: [`${withInvalidation} of ${items.length} items include invalidation levels`],
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
