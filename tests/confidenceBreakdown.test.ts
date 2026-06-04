import { describe, expect, it } from "vitest";

import { buildConfidenceBreakdown } from "@/lib/research/confidenceBreakdown";
import type { ProjectionScenario } from "@/lib/analysis/projectionEngine";
import type { ChartAnnotation } from "@/lib/market/types";
import type { DataQualityGuardResult } from "@/lib/research/dataQualityGuard";
import type { TimeframeConflictResult } from "@/lib/research/timeframeConflict";

function annotation(overrides: Partial<ChartAnnotation> = {}): ChartAnnotation {
  return {
    id: overrides.id ?? "ann-1",
    symbol: "CONF.JK",
    timeframe: "1d",
    family: overrides.family ?? "wyckoff",
    type: overrides.type ?? "SOS",
    label: overrides.label ?? "Sign of Strength",
    startDate: "2026-01-01",
    endDate: "2026-01-02",
    priceMin: 95,
    priceMax: 110,
    invalidationPrice: "invalidationPrice" in overrides ? overrides.invalidationPrice! : 94,
    status: overrides.status ?? "confirmed",
    evidence: overrides.evidence ?? ["range breakout confirmed"],
    confidence: overrides.confidence ?? 0.7,
    conflicts: overrides.conflicts,
  };
}

function projection(overrides: Partial<ProjectionScenario> = {}): ProjectionScenario {
  return {
    id: overrides.id ?? "proj-1",
    family: overrides.family ?? "wyckoff",
    title: overrides.title ?? "Measured projection",
    direction: overrides.direction ?? "up",
    status: overrides.status ?? "active",
    sourceAnnotationIds: ["ann-1"],
    startDate: "2026-01-02",
    startPrice: 110,
    invalidationPrice: "invalidationPrice" in overrides ? overrides.invalidationPrice! : 94,
    targetZone: { min: 120, max: 130 },
    points: [{ date: "2026-01-02", price: 110 }],
    evidence: overrides.evidence ?? ["projection remains active"],
    conflicts: overrides.conflicts ?? [],
    confidence: overrides.confidence ?? 0.74,
  };
}

const okGuard: DataQualityGuardResult = {
  status: "ok",
  score: 1,
  reasons: [],
  blockers: [],
};

const alignedConflict: TimeframeConflictResult = {
  status: "aligned",
  primaryBias: "up",
  companionBias: "up",
  evidence: ["1d and 1w structures align"],
  conflicts: [],
};

describe("confidence breakdown", () => {
  it("averages component scores and carries evidence without advice wording", () => {
    const result = buildConfidenceBreakdown(
      [annotation()],
      [projection()],
      alignedConflict,
      okGuard,
    );

    expect(Object.keys(result.components)).toEqual([
      "dataQuality",
      "annotationQuality",
      "projectionQuality",
      "timeframeAlignment",
      "invalidationClarity",
    ]);
    expect(result.components.dataQuality).toMatchObject({
      label: "Data quality",
      score: 1,
      evidence: ["guard status ok"],
    });
    expect(result.components.projectionQuality.score).toBeGreaterThan(0.7);
    expect(result.components.timeframeAlignment.score).toBeGreaterThan(0.8);
    expect(result.components.invalidationClarity.score).toBeGreaterThan(0.8);
    expect(result.overall).toBe(
      Math.round((Object.values(result.components).reduce((sum, component) => sum + component.score, 0) / 5) * 100) / 100,
    );
    expect(JSON.stringify(result)).not.toMatch(/\b(buy|sell)\b/i);
  });

  it("lowers projection and alignment scores when projections are invalidated or conflicted", () => {
    const result = buildConfidenceBreakdown(
      [annotation({ status: "invalidated", conflicts: ["event failed confirmation"] })],
      [
        projection({ id: "invalidated", status: "invalidated", conflicts: ["latest close crossed invalidation"] }),
        projection({ id: "conflicted", status: "conflicted", conflicts: ["projection directions diverge"] }),
      ],
      {
        status: "conflicted",
        primaryBias: "up",
        companionBias: "down",
        evidence: ["1d and 1w structures diverge"],
        conflicts: ["bias conflict"],
      },
      { status: "caution", score: 0.62, reasons: ["fewer than 180 bars available"], blockers: [] },
    );

    expect(result.components.dataQuality.score).toBe(0.62);
    expect(result.components.projectionQuality.score).toBeLessThan(0.4);
    expect(result.components.timeframeAlignment.score).toBeLessThan(0.35);
    expect(result.components.annotationQuality.evidence).toEqual(expect.arrayContaining(["1 of 1 annotations are invalidated"]));
  });

  it("scores insufficient timeframe evidence and missing invalidation levels in the middle range", () => {
    const result = buildConfidenceBreakdown(
      [annotation({ invalidationPrice: null })],
      [projection({ invalidationPrice: null, status: "pending-data" })],
      {
        status: "insufficient",
        primaryBias: "unknown",
        companionBias: "up",
        evidence: ["companion timeframe has no directional evidence"],
        conflicts: [],
      },
      okGuard,
    );

    expect(result.components.timeframeAlignment.score).toBe(0.55);
    expect(result.components.invalidationClarity.score).toBe(0);
    expect(result.components.projectionQuality.score).toBeLessThan(0.6);
  });
});
