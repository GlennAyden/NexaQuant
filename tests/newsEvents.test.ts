import { describe, expect, it } from "vitest";

import { buildNewsChartEvents } from "@/lib/news/newsEvents";
import type { Bar } from "@/lib/market/types";
import type { NewsArticle } from "@/lib/news/types";

describe("news chart events", () => {
  it("turns material ticker news into chart-ready events with return and volume impact", () => {
    const events = buildNewsChartEvents({
      articles: [
        article({
          id: "a1",
          title: "ENRG Akuisisi aset gas senilai Rp1 triliun",
          content: "ENRG menyelesaikan akuisisi aset gas senilai Rp1 triliun dengan potensi pendapatan baru.",
          sentimentLabel: "positive",
          sentimentScore: 1,
          relevanceScore: 0.92,
        }),
        article({
          id: "a2",
          title: "ENRG disebut dalam ringkasan pasar",
          content: "ENRG bergerak tipis tanpa detail korporasi.",
          sentimentLabel: "neutral",
          sentimentScore: 0,
          relevanceScore: 0.2,
        }),
      ],
      getBarsForTicker: () => [
        bar("2026-06-10", 100, 1000),
        bar("2026-06-11", 101, 1200),
        bar("2026-06-12", 105, 2400),
        bar("2026-06-15", 110, 1800),
        bar("2026-06-16", 112, 1600),
        bar("2026-06-17", 116, 1500),
      ],
      minMateriality: 0.65,
    });

    expect(events).toEqual([
      expect.objectContaining({
        id: "news-a1-ENRG",
        articleId: "a1",
        ticker: "ENRG",
        eventDate: "2026-06-12",
        chartDate: "2026-06-12",
        eventType: "ownership",
        eventLabel: "Kepemilikan",
        sentimentLabel: "positive",
        materialityScore: expect.any(Number),
        return1dPct: 4.762,
        return3dPct: 10.476,
        return5dPct: 10.476,
        volumeRatio: 2.182,
      }),
    ]);
  });

  it("keeps the highest-materiality events while returning them in chart order", () => {
    const events = buildNewsChartEvents({
      articles: [
        article({ id: "late", title: "BBCA Dividen Rp10 triliun", content: "BBCA membagikan dividen Rp10 triliun.", publishedAt: "2026-06-14T09:00:00.000Z", relevanceScore: 0.9 }),
        article({ id: "early", title: "BBCA Buyback Rp5 triliun", content: "BBCA melakukan buyback Rp5 triliun.", publishedAt: "2026-06-12T09:00:00.000Z", relevanceScore: 0.88 }),
        article({ id: "small", title: "BBCA RUPS", content: "BBCA menggelar RUPS.", publishedAt: "2026-06-13T09:00:00.000Z", relevanceScore: 0.2 }),
      ],
      getBarsForTicker: () => [
        bar("2026-06-12", 100, 1000),
        bar("2026-06-13", 101, 1000),
        bar("2026-06-14", 102, 1000),
        bar("2026-06-15", 103, 1000),
      ],
      limit: 2,
      minMateriality: 0,
    });

    expect(events.map((event) => event.articleId)).toEqual(["early", "late"]);
  });

  it("keeps duplicate article ids selectable by assigning unique event ids", () => {
    const events = buildNewsChartEvents({
      articles: [
        article({
          id: "same",
          title: "ENRG Akuisisi aset gas senilai Rp1 triliun",
          content: "ENRG menyelesaikan akuisisi aset gas senilai Rp1 triliun dengan potensi pendapatan baru.",
          publishedAt: "2026-06-12T09:00:00.000Z",
        }),
        article({
          id: "same",
          title: "ENRG Akuisisi aset gas senilai Rp1 triliun",
          content: "ENRG menyelesaikan akuisisi aset gas senilai Rp1 triliun dengan potensi pendapatan baru.",
          publishedAt: "2026-06-13T09:00:00.000Z",
        }),
      ],
      getBarsForTicker: () => [
        bar("2026-06-12", 100, 1000),
        bar("2026-06-13", 102, 1100),
        bar("2026-06-15", 105, 1500),
      ],
      minMateriality: 0.65,
    });

    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.id)).size).toBe(2);
    expect(events[0].id).toBe("news-same-ENRG");
    expect(events[1].id).toMatch(/^news-same-ENRG-[a-z0-9]+$/);
  });
});

function article(input: Partial<NewsArticle> & {
  id: string;
  title: string;
  content: string;
  sentimentLabel?: NewsArticle["sentiment"] extends infer Sentiment ? Sentiment extends { sentimentLabel: infer Label } ? Label : never : never;
  sentimentScore?: number;
  relevanceScore?: number;
}): NewsArticle {
  return {
    id: input.id,
    sourceId: "emitennews-emiten",
    sourceName: "EmitenNews Emiten",
    sourceCategory: "market",
    url: `https://example.com/${input.id}`,
    canonicalUrl: `https://example.com/${input.id}`,
    title: input.title,
    publishedAt: input.publishedAt ?? "2026-06-12T09:00:00.000Z",
    ingestedAt: input.ingestedAt ?? "2026-06-12T09:05:00.000Z",
    excerpt: input.excerpt ?? input.content,
    content: input.content,
    author: null,
    imageUrl: null,
    extractionStatus: "extracted",
    contentQualityScore: input.contentQualityScore ?? 0.8,
    contentHash: `hash-${input.id}`,
    matchedKeywords: [],
    language: "id",
    status: "active",
    matches: [{ articleId: input.id, matchType: "ticker", matchValue: "ENRG", confidence: 0.9 }],
    sentiment: {
      id: `sentiment-${input.id}`,
      articleId: input.id,
      modelName: "fixture",
      sentimentLabel: input.sentimentLabel ?? "positive",
      sentimentScore: input.sentimentScore ?? 1,
      relevanceScore: input.relevanceScore ?? 0.85,
      marketScope: "ticker",
      reasoning: "fixture",
      createdAt: "2026-06-12T09:10:00.000Z",
    },
  };
}

function bar(date: string, close: number, volume: number): Bar {
  return {
    symbol: "ENRG.JK",
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
