import { describe, expect, it } from "vitest";

import { compareTimeframeStructures } from "@/lib/research/timeframeConflict";
import type { ChartAnnotation, Timeframe } from "@/lib/market/types";

function annotation(type: string, timeframe: Timeframe, meta?: ChartAnnotation["meta"]): ChartAnnotation {
  return {
    id: `${timeframe}-${type}`,
    symbol: "TEST.JK",
    timeframe,
    family: meta?.elliottWave ? "elliott" : "wyckoff",
    type,
    label: type,
    startDate: "2026-01-01",
    endDate: "2026-01-02",
    priceMin: 100,
    priceMax: 120,
    invalidationPrice: null,
    status: "candidate",
    evidence: [`${type} evidence`],
    meta,
  };
}

describe("timeframeConflict research", () => {
  it("marks daily accumulation and weekly distribution as conflicted without advice wording", () => {
    const result = compareTimeframeStructures(
      [annotation("Spring", "1d"), annotation("SOS", "1d")],
      "1d",
      [annotation("UTAD", "1w"), annotation("SOW", "1w")],
      "1w",
    );

    expect(result).toMatchObject({
      status: "conflicted",
      primaryBias: "up",
      companionBias: "down",
    });
    expect(result.conflicts).toEqual([
      "1d bias is up/accumulation while 1w bias is down/distribution",
    ]);
    expect(`${result.evidence.join(" ")} ${result.conflicts.join(" ")}`).not.toMatch(/buy|sell/i);
  });

  it("uses Elliott meta direction when present and returns aligned for matching biases", () => {
    const result = compareTimeframeStructures(
      [annotation("Impulse", "1d", { elliottWave: { direction: "down" } })],
      "1d",
      [annotation("Phase E Markdown", "1w")],
      "1w",
    );

    expect(result).toMatchObject({
      status: "aligned",
      primaryBias: "down",
      companionBias: "down",
      conflicts: [],
    });
  });

  it("returns insufficient when either timeframe lacks directional evidence", () => {
    const result = compareTimeframeStructures(
      [annotation("AR", "1d")],
      "1d",
      [annotation("Spring", "1w")],
      "1w",
    );

    expect(result).toMatchObject({
      status: "insufficient",
      primaryBias: "unknown",
      companionBias: "up",
      conflicts: [],
    });
  });
});
