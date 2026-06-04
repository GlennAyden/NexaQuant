import { describe, expect, it } from "vitest";

import { buildResearchCacheKey, createResearchCache } from "@/lib/research/researchCache";
import type { Bar, ChartAnnotation } from "@/lib/market/types";

function bar(index: number, close = 100 + index): Bar {
  return {
    symbol: "CACHE.JK",
    timeframe: "1d",
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    adjClose: close,
    volume: 1000 + index,
    source: "fixture",
  };
}

function annotation(id: string, endDate: string, status: ChartAnnotation["status"]): ChartAnnotation {
  return {
    id,
    symbol: "CACHE.JK",
    timeframe: "1d",
    family: "wyckoff",
    type: id,
    label: id,
    startDate: endDate,
    endDate,
    priceMin: 90,
    priceMax: 110,
    invalidationPrice: null,
    status,
    evidence: [`${id} evidence`],
    confidence: 0.7,
  };
}

function keyParts(overrides: Partial<Parameters<typeof buildResearchCacheKey>[0]> = {}) {
  return {
    symbol: "CACHE.JK",
    timeframe: "1d" as const,
    rangeLabel: "1Y",
    bars: [bar(0), bar(1), bar(2, 108)],
    annotations: [
      annotation("wyckoff-a", "2026-01-02", "candidate"),
      annotation("wyckoff-b", "2026-01-03", "confirmed"),
    ],
    companionAnnotations: [annotation("structure-a", "2026-01-01", "confirmed")],
    cursorIndex: 2,
    timeMachineEnabled: true,
    ...overrides,
  };
}

describe("research cache", () => {
  it("builds the same key from equivalent primitive chart facts", () => {
    const first = keyParts();
    const equivalent = keyParts({
      bars: [bar(0), bar(1), bar(2, 108)],
      annotations: [
        annotation("wyckoff-a", "2026-01-02", "candidate"),
        annotation("wyckoff-b", "2026-01-03", "confirmed"),
      ],
      companionAnnotations: [annotation("structure-a", "2026-01-01", "confirmed")],
    });

    expect(buildResearchCacheKey(equivalent)).toBe(buildResearchCacheKey(first));
  });

  it("changes the key when a cached chart fact changes", () => {
    const base = buildResearchCacheKey(keyParts());

    expect(buildResearchCacheKey(keyParts({ bars: [bar(0), bar(1), bar(2, 109)] }))).not.toBe(base);
    expect(
      buildResearchCacheKey(keyParts({
        annotations: [annotation("wyckoff-a", "2026-01-02", "invalidated")],
      })),
    ).not.toBe(base);
  });

  it("returns cached values without rerunning compute for equivalent keys", () => {
    const cache = createResearchCache<string>();
    let calls = 0;

    const first = cache.getOrCompute(keyParts(), () => {
      calls += 1;
      return "research-result";
    });
    const second = cache.getOrCompute(keyParts(), () => {
      calls += 1;
      return "unexpected";
    });

    expect(first).toBe("research-result");
    expect(second).toBe("research-result");
    expect(calls).toBe(1);
    expect(cache.size()).toBe(1);
  });

  it("evicts the oldest entry when maxEntries is exceeded", () => {
    const cache = createResearchCache<string>(2);

    cache.getOrCompute(keyParts({ symbol: "FIRST.JK" }), () => "first");
    cache.getOrCompute(keyParts({ symbol: "SECOND.JK" }), () => "second");
    cache.getOrCompute(keyParts({ symbol: "THIRD.JK" }), () => "third");

    expect(cache.size()).toBe(2);
    expect(cache.getOrCompute(keyParts({ symbol: "FIRST.JK" }), () => "first-again")).toBe("first-again");
  });

  it("clears cached entries", () => {
    const cache = createResearchCache<string>();

    cache.getOrCompute(keyParts(), () => "result");
    cache.clear();

    expect(cache.size()).toBe(0);
  });
});
