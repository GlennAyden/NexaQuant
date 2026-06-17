import { describe, expect, it } from "vitest";

import { buildConfluenceHeatmap } from "@/lib/research/confluenceHeatmap";
import type { Bar, ChartAnnotation } from "@/lib/market/types";
import type { NewsChartEvent } from "@/lib/news/newsEvents";

describe("confluence heatmap", () => {
  it("scores dates where structure, volume, and news evidence overlap", () => {
    const rows = buildConfluenceHeatmap({
      bars: [
        bar("2026-06-10", 100, 1_000),
        bar("2026-06-11", 101, 1_100),
        bar("2026-06-12", 103, 3_000),
        bar("2026-06-13", 104, 1_200),
      ],
      annotations: [
        annotation("pva-1", "pva", "Demand Expansion", "2026-06-12"),
        annotation("wyckoff-1", "wyckoff", "SOS", "2026-06-12"),
      ],
      newsEvents: [newsEvent("2026-06-12", 0.86)],
    });

    expect(rows[0]).toMatchObject({
      date: "2026-06-12",
      score: expect.any(Number),
      tone: "strong",
    });
    expect(rows[0].factors.map((factor) => factor.label)).toEqual(expect.arrayContaining([
      "PVA",
      "Wyckoff",
      "News",
      "Volume spike",
    ]));
  });

  it("returns only evidence-bearing dates in chronological order", () => {
    const rows = buildConfluenceHeatmap({
      bars: [
        bar("2026-06-10", 100, 1_000),
        bar("2026-06-11", 101, 1_100),
        bar("2026-06-12", 103, 1_200),
      ],
      annotations: [annotation("elliott-1", "elliott", "Impulse", "2026-06-11")],
      newsEvents: [newsEvent("2026-06-12", 0.7)],
    });

    expect(rows.map((row) => row.date)).toEqual(["2026-06-11", "2026-06-12"]);
  });
});

function bar(date: string, close: number, volume: number): Bar {
  return {
    symbol: "BBCA.JK",
    timeframe: "1d",
    date,
    open: close,
    high: close,
    low: close,
    close,
    adjClose: close,
    volume,
    source: "fixture",
  };
}

function annotation(id: string, family: ChartAnnotation["family"], type: string, date: string): ChartAnnotation {
  return {
    id,
    symbol: "BBCA.JK",
    timeframe: "1d",
    family,
    type,
    label: type,
    startDate: date,
    endDate: date,
    priceMin: 100,
    priceMax: 105,
    invalidationPrice: null,
    status: "confirmed",
    evidence: ["fixture"],
  };
}

function newsEvent(date: string, materialityScore: number): NewsChartEvent {
  return {
    id: `news-${date}`,
    articleId: `article-${date}`,
    ticker: "BBCA",
    eventDate: date,
    chartDate: date,
    title: "BBCA material news",
    sourceName: "fixture",
    url: "https://example.com",
    eventType: "dividend",
    eventLabel: "Dividen",
    sentimentLabel: "positive",
    sentimentScore: 1,
    relevanceScore: 0.9,
    materialityScore,
    confidenceScore: 0.8,
    return1dPct: 1,
    return3dPct: 2,
    return5dPct: 3,
    volumeRatio: 1.4,
    evidence: "fixture",
  };
}
