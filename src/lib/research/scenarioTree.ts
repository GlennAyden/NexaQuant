import type {
  ProjectionDirection,
  ProjectionFamily,
  ProjectionScenario,
  ProjectionStatus,
} from "@/lib/analysis/projectionEngine";
import type { ChartAnnotation } from "@/lib/market/types";

export type ScenarioTreeDirection = ProjectionDirection | "neutral";

export type ScenarioTreeNode = {
  id: string;
  title: string;
  status: ProjectionStatus;
  family: ProjectionFamily;
  direction: ScenarioTreeDirection;
  invalidationPrice: number | null;
  targetZone: ProjectionScenario["targetZone"] | null;
  evidence: string[];
  children: ScenarioTreeNode[];
};

export function buildScenarioTree(
  projections: ProjectionScenario[],
  annotations: ChartAnnotation[],
): ScenarioTreeNode[] {
  if (projections.length === 0) {
    return [{
      id: "scenario-neutral-no-rule-valid-projection",
      title: "No rule-valid scenario available",
      status: "pending-data",
      family: "confluence",
      direction: "neutral",
      invalidationPrice: null,
      targetZone: null,
      evidence: ["No projection passed the current rule filters."],
      children: [],
    }];
  }

  const annotationById = new Map(annotations.map((annotation) => [annotation.id, annotation]));

  return projections
    .map((projection, index) => ({ projection, index }))
    .sort((left, right) =>
      statusRank(left.projection.status) - statusRank(right.projection.status)
      || left.index - right.index,
    )
    .map(({ projection }) => buildScenarioNode(projection, annotationById));
}

function buildScenarioNode(
  projection: ProjectionScenario,
  annotationById: Map<string, ChartAnnotation>,
): ScenarioTreeNode {
  const id = `scenario-${projection.id}`;
  const node: ScenarioTreeNode = {
    id,
    title: projection.title,
    status: projection.status,
    family: projection.family,
    direction: projection.direction,
    invalidationPrice: projection.invalidationPrice,
    targetZone: projection.targetZone,
    evidence: buildEvidence(projection, annotationById),
    children: [],
  };

  if (projection.invalidationPrice !== null) {
    node.children.push(buildInvalidationNode(id, projection));
  }

  return node;
}

function buildInvalidationNode(parentId: string, projection: ProjectionScenario): ScenarioTreeNode {
  const direction = oppositeDirection(projection.direction);
  const trigger = projection.direction === "up" ? "below" : "above";

  return {
    id: `${parentId}-invalidation`,
    title: `Invalidation ${trigger} ${formatPrice(projection.invalidationPrice!)}`,
    status: "invalidated",
    family: projection.family,
    direction,
    invalidationPrice: projection.invalidationPrice,
    targetZone: null,
    evidence: [`Scenario is invalid if price closes ${trigger} ${formatPrice(projection.invalidationPrice!)}.`],
    children: [],
  };
}

function buildEvidence(
  projection: ProjectionScenario,
  annotationById: Map<string, ChartAnnotation>,
) {
  const sourceEvidence = projection.sourceAnnotationIds.flatMap((id) => {
    const annotation = annotationById.get(id);
    if (!annotation) {
      return [];
    }

    return annotation.evidence.slice(0, 2).map((item) => `${annotation.label}: ${item}`);
  });

  return [
    ...projection.evidence,
    ...sourceEvidence,
    ...projection.conflicts.map((conflict) => `Conflict: ${conflict}`),
  ];
}

function statusRank(status: ProjectionStatus) {
  if (status === "active") {
    return 0;
  }

  if (status === "invalidated") {
    return 1;
  }

  if (status === "conflicted") {
    return 2;
  }

  return 3;
}

function oppositeDirection(direction: ProjectionDirection): ProjectionDirection {
  return direction === "up" ? "down" : "up";
}

function formatPrice(price: number) {
  return Number.isInteger(price) ? String(price) : String(Number(price.toFixed(2)));
}
