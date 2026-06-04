import { describe, expect, it } from "vitest";

import type { ProjectionScenario } from "@/lib/analysis/projectionEngine";
import type { ChartAnnotation } from "@/lib/market/types";
import { buildProjectionExplanations } from "@/lib/research/projectionExplanation";

function annotation(overrides: Partial<ChartAnnotation> = {}): ChartAnnotation {
  return {
    id: overrides.id ?? "fixture-sos",
    symbol: "BBCA.JK",
    timeframe: "1d",
    family: overrides.family ?? "wyckoff",
    type: overrides.type ?? "SOS",
    label: overrides.label ?? "SOS",
    startDate: overrides.startDate ?? "2026-05-18",
    endDate: overrides.endDate ?? "2026-05-18",
    priceMin: overrides.priceMin ?? 8700,
    priceMax: overrides.priceMax ?? 9250,
    invalidationPrice: "invalidationPrice" in overrides ? overrides.invalidationPrice! : 8700,
    status: overrides.status ?? "candidate",
    evidence: overrides.evidence ?? ["close exceeded the range high after the Spring/Test area"],
    confidence: overrides.confidence ?? 0.68,
    phase: overrides.phase,
    conflicts: overrides.conflicts,
    meta: overrides.meta,
  };
}

function projection(overrides: Partial<ProjectionScenario> = {}): ProjectionScenario {
  return {
    id: overrides.id ?? "projection-wyckoff-markup-fixture-sos",
    family: overrides.family ?? "wyckoff",
    title: overrides.title ?? "Wyckoff markup projection",
    direction: overrides.direction ?? "up",
    status: overrides.status ?? "active",
    sourceAnnotationIds: overrides.sourceAnnotationIds ?? ["fixture-range", "fixture-sos"],
    startDate: overrides.startDate ?? "2026-05-18",
    startPrice: overrides.startPrice ?? 9250,
    invalidationPrice: "invalidationPrice" in overrides ? overrides.invalidationPrice! : 8700,
    targetZone: overrides.targetZone ?? { min: 9800, max: 10350 },
    points: overrides.points ?? [
      { date: "2026-05-18", price: 9250 },
      { date: "2026-06-07", price: 9800 },
      { date: "2026-06-27", price: 10350 },
    ],
    evidence: overrides.evidence ?? ["source event SOS appeared after range development"],
    conflicts: overrides.conflicts ?? [],
    confidence: overrides.confidence ?? 0.64,
  };
}

describe("projectionExplanation", () => {
  it("links each prediction to its source events, rule basis, target path, and invalidation", () => {
    const explanations = buildProjectionExplanations(
      [projection()],
      [
        annotation({ id: "fixture-range", type: "Trading Range", label: "Phase B Trading Range", evidence: ["range stayed compact"] }),
        annotation(),
      ],
    );

    expect(explanations).toHaveLength(1);
    expect(explanations[0]).toMatchObject({
      projectionId: "projection-wyckoff-markup-fixture-sos",
      title: "Wyckoff markup projection",
      ruleBasis: "Wyckoff markup uses range height after SOS/LPS evidence.",
      targetPath: "9.250 -> 9.800 -> 10.350",
      invalidation: {
        state: "defined",
        label: "Invalid below 8.700",
      },
      sourceEvents: [
        { id: "fixture-range", type: "Trading Range", label: "Phase B Trading Range" },
        { id: "fixture-sos", type: "SOS", label: "SOS" },
      ],
    });
    expect(explanations[0].evidence).toEqual(expect.arrayContaining([
      "source event SOS appeared after range development",
      "Phase B Trading Range: range stayed compact",
      "SOS: close exceeded the range high after the Spring/Test area",
    ]));
  });

  it("surfaces conflicts and missing source annotations loudly", () => {
    const explanations = buildProjectionExplanations([
      projection({
        family: "confluence",
        title: "Projection confluence check",
        status: "conflicted",
        sourceAnnotationIds: ["missing-source"],
        invalidationPrice: null,
        conflicts: ["Wyckoff and Elliott projection directions are not aligned"],
        points: [],
      }),
    ], []);

    expect(explanations[0]).toMatchObject({
      ruleBasis: "Confluence checks whether Wyckoff and Elliott point to compatible zones.",
      targetPath: "No drawable path",
      invalidation: {
        state: "missing",
        label: "No explicit invalidation",
      },
      conflicts: [
        "Wyckoff and Elliott projection directions are not aligned",
        "source annotation missing-source is no longer visible in this chart window",
      ],
    });
  });
});
