import { describe, expect, it } from "vitest";

import { buildScenarioTree } from "@/lib/research/scenarioTree";
import type { ProjectionScenario } from "@/lib/analysis/projectionEngine";
import type { ChartAnnotation } from "@/lib/market/types";

function projection(
  id: string,
  status: ProjectionScenario["status"],
  direction: ProjectionScenario["direction"] = "up",
): ProjectionScenario {
  return {
    id,
    family: id.includes("elliott") ? "elliott" : "wyckoff",
    title: `${id} title`,
    direction,
    status,
    sourceAnnotationIds: [`annotation-${id}`],
    startDate: "2026-01-05",
    startPrice: 100,
    invalidationPrice: status === "conflicted" ? null : 92,
    targetZone: { min: 118, max: 124 },
    points: [],
    evidence: [`${id} projection evidence`],
    conflicts: status === "conflicted" ? ["directions conflict"] : [],
    confidence: 0.7,
  };
}

function annotation(id: string): ChartAnnotation {
  return {
    id,
    symbol: "TREE.JK",
    timeframe: "1d",
    family: "wyckoff",
    type: "SOS",
    label: "Sign of Strength",
    startDate: "2026-01-04",
    endDate: "2026-01-05",
    priceMin: 90,
    priceMax: 110,
    invalidationPrice: 92,
    status: "confirmed",
    evidence: [`${id} annotation evidence`],
    confidence: 0.6,
  };
}

describe("scenarioTree", () => {
  it("orders active projections before invalidated and conflicted branches", () => {
    const invalidated = projection("wyckoff-invalidated", "invalidated");
    const active = projection("elliott-active", "active", "down");
    const conflicted = projection("wyckoff-conflicted", "conflicted");
    const annotations = [
      annotation("annotation-wyckoff-invalidated"),
      annotation("annotation-elliott-active"),
      annotation("annotation-wyckoff-conflicted"),
    ];

    const tree = buildScenarioTree([invalidated, active, conflicted], annotations);

    expect(tree.map((node) => [node.id, node.status])).toEqual([
      ["scenario-elliott-active", "active"],
      ["scenario-wyckoff-invalidated", "invalidated"],
      ["scenario-wyckoff-conflicted", "conflicted"],
    ]);
    expect(tree[0]).toMatchObject({
      title: "elliott-active title",
      family: "elliott",
      direction: "down",
      invalidationPrice: 92,
      targetZone: { min: 118, max: 124 },
      evidence: [
        "elliott-active projection evidence",
        "Sign of Strength: annotation-elliott-active annotation evidence",
      ],
    });
  });

  it("adds an explicit invalidation child when a scenario has an invalidation price", () => {
    const tree = buildScenarioTree([projection("wyckoff-active", "active")], [
      annotation("annotation-wyckoff-active"),
    ]);

    expect(tree[0].children).toEqual([
      expect.objectContaining({
        id: "scenario-wyckoff-active-invalidation",
        title: "Invalidation below 92",
        status: "invalidated",
        family: "wyckoff",
        direction: "down",
        invalidationPrice: 92,
        targetZone: null,
      }),
    ]);
  });

  it("returns one neutral node when no rule-valid scenario is available", () => {
    expect(buildScenarioTree([], [])).toEqual([
      {
        id: "scenario-neutral-no-rule-valid-projection",
        title: "No rule-valid scenario available",
        status: "pending-data",
        family: "confluence",
        direction: "neutral",
        invalidationPrice: null,
        targetZone: null,
        evidence: ["No projection passed the current rule filters."],
        children: [],
      },
    ]);
  });
});
