import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/best-examples/route";
import type { BestExample } from "@/lib/market/types";

const examples: BestExample[] = [
  {
    symbol: "BBCA.JK",
    name: "PT Bank Central Asia Tbk",
    sector: "Financials",
    timeframe: "1w",
    score: 0.9,
    quality: "strong",
    annotationTypes: ["SOS", "Impulse"],
    families: ["wyckoff", "elliott"],
    lastAnnotationDate: "2026-05-29",
  },
];

const mocks = vi.hoisted(() => ({
  store: {
    getBestExamples: vi.fn(),
  },
  getMarketStore: vi.fn(),
}));

vi.mock("@/lib/market/marketStore", () => ({
  getMarketStore: mocks.getMarketStore,
}));

describe("GET /api/best-examples", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMarketStore.mockReturnValue(mocks.store);
    mocks.store.getBestExamples.mockReturnValue(examples);
  });

  it("returns examples for the requested timeframe and limit", async () => {
    const response = await GET(new Request("http://localhost/api/best-examples?timeframe=1w&limit=3"));

    expect(response.status).toBe(200);
    expect(mocks.store.getBestExamples).toHaveBeenCalledWith(3, "1w");
    expect(await response.json()).toEqual({
      timeframe: "1w",
      limit: 3,
      examples,
    });
  });

  it("defaults invalid query values to daily examples with the compact panel limit", async () => {
    const response = await GET(new Request("http://localhost/api/best-examples?timeframe=1m&limit=abc"));

    expect(response.status).toBe(200);
    expect(mocks.store.getBestExamples).toHaveBeenCalledWith(8, "1d");
    expect(await response.json()).toEqual({
      timeframe: "1d",
      limit: 8,
      examples,
    });
  });
});
