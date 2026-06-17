import { describe, expect, it } from "vitest";

import { buildEventProfile, buildNewsInsights } from "@/lib/news/newsInsights";
import type { NewsArticle, NewsSummary } from "@/lib/news/types";
import type { Bar } from "@/lib/market/types";

const article: NewsArticle = {
  id: "a1",
  sourceId: "emitennews-emiten",
  sourceName: "EmitenNews Emiten",
  sourceCategory: "market",
  url: "https://example.com/pyfa",
  canonicalUrl: "https://example.com/pyfa",
  title: "PYFA Tunda Right Issue, Begini Penjelasan Pyridam Farma",
  publishedAt: "2026-06-12T01:29:00.000Z",
  ingestedAt: "2026-06-12T01:30:00.000Z",
  excerpt: "Pyridam Farma menunda pelaksanaan right issue senilai Rp500 miliar.",
  content: "Pyridam Farma menunda pelaksanaan right issue senilai Rp500 miliar. Manajemen menyampaikan alasan perubahan jadwal.",
  author: "Reporter",
  imageUrl: "https://example.com/image.jpg",
  extractionStatus: "extracted",
  contentQualityScore: 0.74,
  contentHash: "hash",
  matchedKeywords: ["saham"],
  language: "id",
  status: "active",
  matches: [
    { articleId: "a1", matchType: "ticker", matchValue: "PYFA", confidence: 0.9 },
    { articleId: "a1", matchType: "keyword", matchValue: "saham", confidence: 0.82 },
  ],
  sentiment: {
    id: "s1",
    articleId: "a1",
    modelName: "fixture",
    sentimentLabel: "neutral",
    sentimentScore: 0,
    relevanceScore: 0.82,
    marketScope: "ticker",
    reasoning: "Neutral evidence.",
    createdAt: "2026-06-12T01:31:00.000Z",
  },
};

const historicalArticle: NewsArticle = {
  ...article,
  id: "a2",
  url: "https://example.com/pyfa-history",
  canonicalUrl: "https://example.com/pyfa-history",
  title: "PYFA Right Issue Rp400 miliar Jadi Perhatian Pasar",
  publishedAt: "2026-06-09T01:29:00.000Z",
  ingestedAt: "2026-06-09T01:30:00.000Z",
  contentHash: "hash-history",
  matches: [
    { articleId: "a2", matchType: "ticker", matchValue: "PYFA", confidence: 0.9 },
    { articleId: "a2", matchType: "keyword", matchValue: "saham", confidence: 0.82 },
  ],
  sentiment: article.sentiment ? {
    ...article.sentiment,
    id: "s2",
    articleId: "a2",
  } : null,
};

const summary: NewsSummary = {
  totalArticles: 1,
  classifiedArticles: 1,
  unclassifiedArticles: 0,
  latestPublishedAt: article.publishedAt,
  latestIngestedAt: article.ingestedAt,
  latestSync: null,
  sentimentCounts: {
    positive: 0,
    negative: 0,
    neutral: 1,
    mixed: 0,
    unknown: 0,
  },
  dailyTimeline: [
    {
      date: "2026-06-12",
      totalArticles: 1,
      classifiedArticles: 1,
      sentimentCounts: {
        positive: 0,
        negative: 0,
        neutral: 1,
        mixed: 0,
        unknown: 0,
      },
      averageRelevanceScore: 0.82,
      weightedSentimentScore: 0,
    },
  ],
  averageSentimentScore: 0,
  averageRelevanceScore: 0.82,
  weightedSentimentScore: 0,
};

describe("news insights", () => {
  it("classifies corporate action events with entities and materiality", () => {
    expect(buildEventProfile(article)).toMatchObject({
      eventType: "right_issue",
      eventLabel: "Right Issue",
      tickers: ["PYFA"],
      moneyAmounts: ["Rp500 miliar"],
    });
  });

  it("builds visible phase evidence from quality, events, discovery, market, and model data", () => {
    const bars: Bar[] = [
      bar("2026-06-09", 98, 900),
      bar("2026-06-10", 100, 1100),
      bar("2026-06-11", 100, 1000),
      bar("2026-06-12", 102, 1600),
      bar("2026-06-13", 104, 1300),
      bar("2026-06-14", 106, 1400),
      bar("2026-06-15", 108, 1500),
    ];

    const insights = buildNewsInsights({
      articles: [article],
      historyArticles: [article, historicalArticle],
      summary,
      sourceStatuses: [],
      latestEnrichmentRun: {
        id: "enrich-1",
        startedAt: "2026-06-12T02:00:00.000Z",
        finishedAt: "2026-06-12T02:01:00.000Z",
        status: "completed",
        totalArticles: 1,
        enrichedCount: 1,
        skippedCount: 0,
        failedCount: 0,
        error: {},
      },
      feedbackSummary: {
        totalFeedback: 1,
        latestFeedbackAt: "2026-06-12T02:02:00.000Z",
        correctedPositive: 0,
        correctedNeutral: 1,
        correctedNegative: 0,
        averageCorrectedRelevance: 0.8,
      },
      feedbackItems: [{
        id: "feedback-1",
        articleId: "a1",
        title: article.title,
        sourceName: article.sourceName,
        publishedAt: article.publishedAt,
        sentimentLabel: "negative",
        relevanceScore: 0.9,
        note: "Correction sample.",
        previousSentimentLabel: "neutral",
        previousRelevanceScore: 0.82,
        createdAt: "2026-06-12T02:02:00.000Z",
      }],
      getBarsForTicker: () => bars,
    });

    expect(insights.phases.map((phase) => phase.title)).toEqual([
      "Quality & Extraction",
      "Event Intelligence",
      "Discovery & Clustering",
      "Market Linkage",
      "Model Governance",
    ]);
    expect(insights.quality.contentCoveragePct).toBe(100);
    expect(insights.events.topEvents[0]).toMatchObject({ eventLabel: "Right Issue" });
    expect(insights.discovery.clusters[0]).toMatchObject({ label: "Right Issue - PYFA" });
    expect(insights.discovery.semanticGroups[0]).toMatchObject({ label: "Corporate Action" });
    expect(insights.market.impactSamples[0]).toMatchObject({
      ticker: "PYFA",
      return3dPct: expect.any(Number),
    });
    expect(insights.model.feedbackReady).toBe(true);
    expect(insights.model.feedbackSummary.totalFeedback).toBe(1);
    expect(insights.model.feedbackDiagnostics).toMatchObject({
      sampleSize: 1,
      sentimentChangeCount: 1,
      disagreementRatePct: 100,
      averageRelevanceDelta: 0.08,
    });
    expect(insights.wild.marketMemory.examples[0]).toMatchObject({
      ticker: "PYFA",
      similarCount: 1,
    });
    expect(insights.wild.eventImpactLab.eventStats[0]).toMatchObject({
      eventLabel: "Right Issue",
      sampleCount: expect.any(Number),
    });
    expect(insights.wild.narrativeRadar.alerts[0]).toMatchObject({ label: "Corporate Action" });
    expect(insights.wild.disclosureRadar.openItems[0]).toMatchObject({
      ticker: "PYFA",
      eventLabel: "Right Issue",
      severity: "high",
      officialSourceName: "IDX Keterbukaan Informasi",
    });
    expect(insights.wild.entityGraph.nodes.map((node) => node.label)).toContain("PYFA");
    expect(insights.wild.dailyBriefing.bullets.length).toBeGreaterThan(0);
  });

  it("queues sparse high-uncertainty articles for human calibration", () => {
    const sparseArticle: NewsArticle = {
      ...article,
      id: "a3",
      title: "PYFA Right Issue Butuh Konfirmasi Lanjutan",
      publishedAt: "2026-06-13T01:29:00.000Z",
      ingestedAt: "2026-06-13T01:30:00.000Z",
      excerpt: "PYFA right issue.",
      content: "",
      extractionStatus: "summary-only",
      contentQualityScore: 0.1,
      contentHash: "hash-sparse",
      matches: [
        { articleId: "a3", matchType: "ticker", matchValue: "PYFA", confidence: 0.9 },
        { articleId: "a3", matchType: "keyword", matchValue: "saham", confidence: 0.82 },
      ],
      sentiment: null,
    };

    const insights = buildNewsInsights({
      articles: [sparseArticle],
      historyArticles: [sparseArticle],
      summary: {
        ...summary,
        classifiedArticles: 0,
        unclassifiedArticles: 1,
      },
      sourceStatuses: [],
      feedbackSummary: {
        totalFeedback: 0,
        latestFeedbackAt: null,
        correctedPositive: 0,
        correctedNeutral: 0,
        correctedNegative: 0,
        averageCorrectedRelevance: null,
      },
    });

    expect(insights.wild.activeLearning.queue[0]).toMatchObject({
      articleId: "a3",
      reason: expect.stringContaining("sentiment unknown"),
    });
    expect(insights.wild.disclosureRadar.needsReviewCount).toBe(1);
  });

  it("treats IDX official disclosure as confirmed disclosure evidence", () => {
    const officialArticle: NewsArticle = {
      ...article,
      id: "idx-1",
      sourceId: "idx-official-disclosure",
      sourceName: "IDX Official Disclosure",
      title: "PYFA Tunda Right Issue [PYFA]",
      contentHash: "hash-idx",
      matches: [
        { articleId: "idx-1", matchType: "ticker", matchValue: "PYFA", confidence: 0.98 },
      ],
    };

    const insights = buildNewsInsights({
      articles: [officialArticle],
      summary,
      sourceStatuses: [],
      feedbackSummary: {
        totalFeedback: 0,
        latestFeedbackAt: null,
        correctedPositive: 0,
        correctedNeutral: 0,
        correctedNegative: 0,
        averageCorrectedRelevance: null,
      },
    });

    expect(insights.wild.disclosureRadar).toMatchObject({
      confirmedCount: 1,
      needsReviewCount: 0,
      openItems: [],
    });
  });
});

function bar(date: string, close: number, volume: number): Bar {
  return {
    symbol: "PYFA.JK",
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
