import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getArticles } from "@/app/api/news/articles/route";
import { GET as getEvents } from "@/app/api/news/events/route";
import { POST as postEnrich } from "@/app/api/news/enrich/route";
import { POST as postFeedback } from "@/app/api/news/feedback/route";
import { GET as getInsights } from "@/app/api/news/insights/route";
import { POST as postSentiment } from "@/app/api/news/sentiment/route";
import { GET as getSummary } from "@/app/api/news/summary/route";
import { GET as getSync } from "@/app/api/news/sync/route";

const mocks = vi.hoisted(() => ({
  store: {
    getArticles: vi.fn(),
    getArticleById: vi.fn(),
    getArticlesForEnrichment: vi.fn(),
    updateArticleEnrichment: vi.fn(),
    createEnrichmentRun: vi.fn(),
    updateEnrichmentRun: vi.fn(),
    getLatestEnrichmentRun: vi.fn(),
    insertFeedback: vi.fn(),
    insertSentimentRun: vi.fn(),
    getFeedbackSummary: vi.fn(),
    getFeedbackItems: vi.fn(),
    getLatestRun: vi.fn(),
    getLatestSourceStatuses: vi.fn(),
    getRecentIngestionHistory: vi.fn(),
    getSummary: vi.fn(),
  },
  marketStore: {
    getBars: vi.fn(),
    listSymbolCodes: vi.fn(),
  },
  getNewsStore: vi.fn(),
  getMarketStore: vi.fn(),
  classifyPendingNewsArticles: vi.fn(),
}));

vi.mock("@/lib/news/newsStore", () => ({
  getNewsStore: mocks.getNewsStore,
}));

vi.mock("@/lib/market/marketStore", () => ({
  getMarketStore: mocks.getMarketStore,
}));

vi.mock("@/lib/news/sentimentService", () => ({
  classifyPendingNewsArticles: mocks.classifyPendingNewsArticles,
}));

describe("news API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNewsStore.mockReturnValue(mocks.store);
    mocks.getMarketStore.mockReturnValue(mocks.marketStore);
    mocks.store.getArticles.mockReturnValue({ articles: [], total: 0, limit: 50, offset: 0 });
    mocks.store.getArticleById.mockReturnValue(null);
    mocks.store.getArticlesForEnrichment.mockReturnValue([]);
    mocks.store.updateArticleEnrichment.mockReturnValue(true);
    mocks.store.getLatestEnrichmentRun.mockReturnValue(null);
    mocks.store.insertFeedback.mockReturnValue({
      id: "feedback-1",
      articleId: "a1",
      sentimentLabel: "negative",
      relevanceScore: 0.9,
      note: "",
      previousSentimentLabel: "positive",
      previousRelevanceScore: 0.8,
      createdAt: "2026-06-16T10:00:00.000Z",
    });
    mocks.store.insertSentimentRun.mockReturnValue("sentiment-feedback-1");
    mocks.store.getFeedbackSummary.mockReturnValue({
      totalFeedback: 0,
      latestFeedbackAt: null,
      correctedPositive: 0,
      correctedNeutral: 0,
      correctedNegative: 0,
      averageCorrectedRelevance: null,
    });
    mocks.store.getFeedbackItems.mockReturnValue([]);
    mocks.store.getLatestRun.mockReturnValue(null);
    mocks.store.getLatestSourceStatuses.mockReturnValue([]);
    mocks.store.getRecentIngestionHistory.mockReturnValue([]);
    mocks.store.getSummary.mockReturnValue({
      totalArticles: 0,
      classifiedArticles: 0,
      unclassifiedArticles: 0,
      latestPublishedAt: null,
      latestIngestedAt: null,
      latestSync: null,
      sentimentCounts: { positive: 0, negative: 0, neutral: 0, mixed: 0, unknown: 0 },
      dailyTimeline: [],
      averageSentimentScore: null,
      averageRelevanceScore: null,
      weightedSentimentScore: null,
    });
    mocks.marketStore.getBars.mockReturnValue([]);
    mocks.marketStore.listSymbolCodes.mockReturnValue(["BBCA.JK"]);
    mocks.classifyPendingNewsArticles.mockReturnValue({ total: 0, classifiedCount: 0, articles: [] });
  });

  it("passes article filters into the news store", async () => {
    const response = await getArticles(new Request(
      "http://localhost/api/news/articles?sourceId=cnbc-market&keyword=IHSG&ticker=bbca.jk&sentiment=positive&minRelevance=0.6&limit=10&offset=5",
    ));

    expect(response.status).toBe(200);
    expect(mocks.store.getArticles).toHaveBeenCalledWith({
      sourceId: "cnbc-market",
      query: undefined,
      keyword: "IHSG",
      ticker: "bbca.jk",
      sentiment: "positive",
      minRelevance: 0.6,
      dateFrom: undefined,
      dateTo: undefined,
      limit: 10,
      offset: 5,
    });
  });

  it("builds a bounded article window when days is provided", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T00:00:00.000Z"));
    try {
      const response = await getArticles(new Request("http://localhost/api/news/articles?days=14&ticker=ENRG&limit=20"));

      expect(response.status).toBe(200);
      expect(mocks.store.getArticles).toHaveBeenCalledWith(expect.objectContaining({
        ticker: "ENRG",
        dateFrom: "2026-06-03T00:00:00.000Z",
        limit: 20,
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("ranks article search semantically from a bounded local corpus", async () => {
    mocks.store.getArticles.mockReturnValueOnce({
      articles: [
        {
          id: "a1",
          sourceName: "EmitenNews Emiten",
          title: "PYFA Tunda Right Issue",
          publishedAt: "2026-06-12T01:29:00.000Z",
          ingestedAt: "2026-06-12T01:30:00.000Z",
          excerpt: "Pyridam Farma menunda right issue Rp500 miliar.",
          content: "Pyridam Farma menunda right issue Rp500 miliar.",
          matchedKeywords: ["saham"],
          matches: [{ articleId: "a1", matchType: "ticker", matchValue: "PYFA", confidence: 0.9 }],
          sentiment: null,
        },
        {
          id: "a2",
          sourceName: "CNBC Market",
          title: "IHSG Bergerak Datar",
          publishedAt: "2026-06-12T01:29:00.000Z",
          ingestedAt: "2026-06-12T01:30:00.000Z",
          excerpt: "Indeks bergerak datar sepanjang sesi pertama.",
          content: "Indeks bergerak datar sepanjang sesi pertama.",
          matchedKeywords: ["IHSG"],
          matches: [{ articleId: "a2", matchType: "index", matchValue: "IHSG", confidence: 0.9 }],
          sentiment: null,
        },
      ],
      total: 2,
      limit: 200,
      offset: 0,
    });

    const response = await getArticles(new Request("http://localhost/api/news/articles?query=aksi%20korporasi&queryMode=semantic&limit=5"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.articles).toHaveLength(1);
    expect(body.articles[0]).toMatchObject({
      id: "a1",
      searchMode: "semantic",
      semanticReasons: expect.arrayContaining(["concept Corporate Action"]),
    });
    expect(mocks.store.getArticles).toHaveBeenCalledWith(expect.objectContaining({
      query: undefined,
      limit: 200,
      offset: 0,
    }));
  });

  it("fails loudly for invalid sentiment and relevance filters", async () => {
    const sentimentResponse = await getArticles(new Request("http://localhost/api/news/articles?sentiment=bullish"));
    const relevanceResponse = await getArticles(new Request("http://localhost/api/news/articles?minRelevance=high"));

    expect(sentimentResponse.status).toBe(400);
    expect(await sentimentResponse.json()).toEqual({ error: "sentiment must be positive, negative, neutral, mixed, or unknown" });
    expect(relevanceResponse.status).toBe(400);
    expect(await relevanceResponse.json()).toEqual({ error: "minRelevance must be a number from 0 to 1" });
  });

  it("builds a bounded summary window for dashboard and news page consumers", async () => {
    const response = await getSummary(new Request("http://localhost/api/news/summary?days=14&ticker=BBCA.JK"));

    expect(response.status).toBe(200);
    expect(mocks.store.getSummary).toHaveBeenCalledWith(expect.objectContaining({
      ticker: "BBCA.JK",
      keyword: undefined,
      sourceId: undefined,
    }));
    expect(mocks.store.getSummary.mock.calls[0][0].dateFrom).toEqual(expect.any(String));
  });

  it("returns sync status with recent ingestion history", async () => {
    mocks.store.getLatestRun.mockReturnValueOnce({
      id: "run-2",
      startedAt: "2026-06-15T10:00:00.000Z",
      finishedAt: "2026-06-15T10:01:00.000Z",
      status: "completed",
      totalSources: 1,
      successCount: 1,
      failedCount: 0,
      totalCandidates: 12,
      matchedCount: 9,
      insertedCount: 7,
      duplicateCount: 2,
      filteredCount: 3,
      error: {},
    });
    mocks.store.getLatestSourceStatuses.mockReturnValueOnce([
      {
        runId: "run-2",
        sourceId: "cnbc-market",
        sourceName: "CNBC Indonesia Market",
        status: "success",
        startedAt: "2026-06-15T10:00:00.000Z",
        finishedAt: "2026-06-15T10:01:00.000Z",
        itemsSeen: 12,
        matchedCount: 9,
        insertedCount: 7,
        duplicateCount: 2,
        filteredCount: 3,
        error: null,
      },
    ]);
    mocks.store.getRecentIngestionHistory.mockReturnValueOnce([
      {
        run: {
          id: "run-2",
          startedAt: "2026-06-15T10:00:00.000Z",
          finishedAt: "2026-06-15T10:01:00.000Z",
          status: "completed",
          totalSources: 1,
          successCount: 1,
          failedCount: 0,
          totalCandidates: 12,
          matchedCount: 9,
          insertedCount: 7,
          duplicateCount: 2,
          filteredCount: 3,
          error: {},
        },
        sources: [],
      },
    ]);

    const response = await getSync();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      active: false,
      run: { id: "run-2", status: "completed" },
      sources: [expect.objectContaining({ sourceId: "cnbc-market", status: "success" })],
      history: [expect.objectContaining({ run: expect.objectContaining({ id: "run-2" }) })],
    });
  });

  it("builds news intelligence insights from article, source, and market evidence", async () => {
    mocks.store.getArticles.mockReturnValueOnce({
      articles: [{
        id: "a1",
        sourceId: "emitennews-emiten",
        sourceName: "EmitenNews Emiten",
        sourceCategory: "market",
        url: "https://example.com/pyfa",
        canonicalUrl: "https://example.com/pyfa",
        title: "PYFA Tunda Right Issue",
        publishedAt: "2026-06-12T01:29:00.000Z",
        ingestedAt: "2026-06-12T01:30:00.000Z",
        excerpt: "Pyridam Farma menunda right issue Rp500 miliar.",
        content: "Pyridam Farma menunda right issue Rp500 miliar.",
        author: null,
        imageUrl: null,
        extractionStatus: "extracted",
        contentQualityScore: 0.7,
        contentHash: "hash",
        matchedKeywords: ["saham"],
        language: "id",
        status: "active",
        matches: [{ articleId: "a1", matchType: "ticker", matchValue: "PYFA", confidence: 0.9 }],
        sentiment: {
          id: "s1",
          articleId: "a1",
          modelName: "fixture",
          sentimentLabel: "neutral",
          sentimentScore: 0,
          relevanceScore: 0.8,
          marketScope: "ticker",
          reasoning: "Neutral evidence.",
          createdAt: "2026-06-12T01:31:00.000Z",
        },
      }],
      total: 1,
      limit: 200,
      offset: 0,
    });
    mocks.store.getArticles.mockReturnValueOnce({
      articles: [{
        id: "a2",
        sourceId: "emitennews-emiten",
        sourceName: "EmitenNews Emiten",
        sourceCategory: "market",
        url: "https://example.com/pyfa-history",
        canonicalUrl: "https://example.com/pyfa-history",
        title: "PYFA Right Issue Rp400 miliar",
        publishedAt: "2026-06-10T01:29:00.000Z",
        ingestedAt: "2026-06-10T01:30:00.000Z",
        excerpt: "Pyridam Farma right issue Rp400 miliar.",
        content: "Pyridam Farma right issue Rp400 miliar.",
        author: null,
        imageUrl: null,
        extractionStatus: "extracted",
        contentQualityScore: 0.7,
        contentHash: "hash-history",
        matchedKeywords: ["saham"],
        language: "id",
        status: "active",
        matches: [{ articleId: "a2", matchType: "ticker", matchValue: "PYFA", confidence: 0.9 }],
        sentiment: {
          id: "s2",
          articleId: "a2",
          modelName: "fixture",
          sentimentLabel: "neutral",
          sentimentScore: 0,
          relevanceScore: 0.8,
          marketScope: "ticker",
          reasoning: "Neutral evidence.",
          createdAt: "2026-06-10T01:31:00.000Z",
        },
      }],
      total: 1,
      limit: 200,
      offset: 0,
    });
    mocks.store.getSummary.mockReturnValue({
      totalArticles: 1,
      classifiedArticles: 1,
      unclassifiedArticles: 0,
      latestPublishedAt: "2026-06-12T01:29:00.000Z",
      latestIngestedAt: "2026-06-12T01:30:00.000Z",
      latestSync: null,
      sentimentCounts: { positive: 0, negative: 0, neutral: 1, mixed: 0, unknown: 0 },
      dailyTimeline: [
        {
          date: "2026-06-12",
          totalArticles: 1,
          classifiedArticles: 1,
          sentimentCounts: { positive: 0, negative: 0, neutral: 1, mixed: 0, unknown: 0 },
          averageRelevanceScore: 0.8,
          weightedSentimentScore: 0,
        },
      ],
      averageSentimentScore: 0,
      averageRelevanceScore: 0.8,
      weightedSentimentScore: 0,
    });
    mocks.marketStore.getBars.mockReturnValue([
      { symbol: "PYFA.JK", timeframe: "1d", date: "2026-06-12", open: 100, high: 100, low: 100, close: 100, adjClose: 100, volume: 1000, source: "fixture" },
      { symbol: "PYFA.JK", timeframe: "1d", date: "2026-06-15", open: 105, high: 105, low: 105, close: 105, adjClose: 105, volume: 1500, source: "fixture" },
    ]);

    const response = await getInsights(new Request("http://localhost/api/news/insights?days=14&ticker=PYFA"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.phases.map((phase: { title: string }) => phase.title)).toContain("Market Linkage");
    expect(body.events.topEvents[0]).toMatchObject({ eventLabel: "Right Issue" });
    expect(body.wild.marketMemory.examples[0]).toMatchObject({ ticker: "PYFA", similarCount: 1 });
    expect(body.wild.eventImpactLab.eventStats[0]).toMatchObject({ eventLabel: "Right Issue" });
    expect(mocks.store.getArticles).toHaveBeenCalledWith(expect.objectContaining({ ticker: "PYFA", limit: 200 }));
    expect(mocks.store.getFeedbackItems).toHaveBeenCalledWith(50);
    expect(mocks.marketStore.getBars).toHaveBeenCalledWith("PYFA.JK", "1d");
  });

  it("builds chart-ready news events for a ticker dashboard overlay", async () => {
    mocks.store.getArticles.mockReturnValueOnce({
      articles: [{
        id: "a1",
        sourceId: "emitennews-emiten",
        sourceName: "EmitenNews Emiten",
        sourceCategory: "market",
        url: "https://example.com/enrg",
        canonicalUrl: "https://example.com/enrg",
        title: "ENRG Akuisisi aset gas Rp1 triliun",
        publishedAt: "2026-06-12T01:29:00.000Z",
        ingestedAt: "2026-06-12T01:30:00.000Z",
        excerpt: "ENRG menyelesaikan akuisisi aset gas Rp1 triliun.",
        content: "ENRG menyelesaikan akuisisi aset gas Rp1 triliun.",
        author: null,
        imageUrl: null,
        extractionStatus: "extracted",
        contentQualityScore: 0.8,
        contentHash: "hash",
        matchedKeywords: ["akuisisi"],
        language: "id",
        status: "active",
        matches: [{ articleId: "a1", matchType: "ticker", matchValue: "ENRG", confidence: 0.9 }],
        sentiment: {
          id: "s1",
          articleId: "a1",
          modelName: "fixture",
          sentimentLabel: "positive",
          sentimentScore: 1,
          relevanceScore: 0.9,
          marketScope: "ticker",
          reasoning: "Positive evidence.",
          createdAt: "2026-06-12T01:31:00.000Z",
        },
      }],
      total: 1,
      limit: 200,
      offset: 0,
    });
    mocks.marketStore.getBars.mockReturnValue([
      { symbol: "ENRG.JK", timeframe: "1d", date: "2026-06-11", open: 100, high: 100, low: 100, close: 100, adjClose: 100, volume: 1000, source: "fixture" },
      { symbol: "ENRG.JK", timeframe: "1d", date: "2026-06-12", open: 105, high: 105, low: 105, close: 105, adjClose: 105, volume: 2000, source: "fixture" },
      { symbol: "ENRG.JK", timeframe: "1d", date: "2026-06-15", open: 110, high: 110, low: 110, close: 110, adjClose: 110, volume: 1500, source: "fixture" },
    ]);

    const response = await getEvents(new Request("http://localhost/api/news/events?ticker=ENRG.JK&days=30&limit=12&minMateriality=0.6"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.store.getArticles).toHaveBeenCalledWith(expect.objectContaining({
      ticker: "ENRG.JK",
      limit: 200,
    }));
    expect(mocks.marketStore.getBars).toHaveBeenCalledWith("ENRG.JK", "1d");
    expect(body.events).toEqual([
      expect.objectContaining({
        articleId: "a1",
        ticker: "ENRG",
        chartDate: "2026-06-12",
        eventLabel: "Kepemilikan",
        return1dPct: expect.any(Number),
      }),
    ]);
  });

  it("streams enrichment progress for low-quality article backfill", async () => {
    mocks.store.getArticlesForEnrichment.mockReturnValue([]);

    const response = await postEnrich(new Request("http://localhost/api/news/enrich", {
      method: "POST",
      headers: { accept: "text/event-stream" },
      body: JSON.stringify({ limit: 5 }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain("\"type\":\"enrichment-started\"");
    expect(body).toContain("\"type\":\"enrichment-completed\"");
    expect(mocks.store.getArticlesForEnrichment).toHaveBeenCalledWith(5);
    expect(mocks.store.createEnrichmentRun).toHaveBeenCalled();
    expect(mocks.store.updateEnrichmentRun).toHaveBeenCalled();
  });

  it("records human sentiment feedback and writes an auditable sentiment run", async () => {
    mocks.store.getArticleById.mockReturnValue({
      id: "a1",
      sourceId: "cnbc-market",
      sourceName: "CNBC Indonesia Market",
      sourceCategory: "market",
      url: "https://example.com/ihsg",
      canonicalUrl: "https://example.com/ihsg",
      title: "IHSG menguat",
      publishedAt: "2026-06-16T10:00:00.000Z",
      ingestedAt: "2026-06-16T10:01:00.000Z",
      excerpt: "IHSG menguat.",
      content: "IHSG menguat.",
      author: null,
      imageUrl: null,
      extractionStatus: "summary-only",
      contentQualityScore: 0.2,
      contentHash: "hash",
      matchedKeywords: ["IHSG"],
      language: "id",
      status: "active",
      matches: [],
      sentiment: {
        id: "s1",
        articleId: "a1",
        modelName: "fixture",
        sentimentLabel: "positive",
        sentimentScore: 1,
        relevanceScore: 0.8,
        marketScope: "ihsg",
        reasoning: "Positive.",
        createdAt: "2026-06-16T10:02:00.000Z",
      },
    });

    const response = await postFeedback(new Request("http://localhost/api/news/feedback", {
      method: "POST",
      body: JSON.stringify({
        articleId: "a1",
        sentimentLabel: "negative",
        relevanceScore: 0.9,
        note: "Nada berita sebenarnya negatif.",
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.store.insertFeedback).toHaveBeenCalledWith(expect.objectContaining({
      articleId: "a1",
      sentimentLabel: "negative",
      relevanceScore: 0.9,
    }));
    expect(mocks.store.insertSentimentRun).toHaveBeenCalledWith(expect.objectContaining({
      articleId: "a1",
      modelName: "nexaquant-lexicon-v1+human-feedback",
      sentimentLabel: "negative",
      sentimentScore: -1,
      marketScope: "ihsg",
    }));
  });

  it("classifies pending articles with known IDX symbols", async () => {
    const response = await postSentiment(new Request("http://localhost/api/news/sentiment", {
      method: "POST",
      body: JSON.stringify({ limit: 25 }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.classifyPendingNewsArticles).toHaveBeenCalledWith(mocks.store, {
      limit: 25,
      symbolCodes: ["BBCA.JK"],
    });
  });

  it("streams sentiment classification progress when requested", async () => {
    mocks.classifyPendingNewsArticles.mockImplementation(async (_store, options) => {
      await options.onProgress?.({
        type: "article-classified",
        timestamp: "2026-06-16T10:00:00.000Z",
        articleId: "article-1",
        title: "IHSG menguat",
        index: 1,
        message: "Selesai: IHSG menguat",
        summary: {
          total: 1,
          classifiedCount: 1,
          skippedCount: 0,
          remainingCount: 0,
        },
      });
      return { total: 1, classifiedCount: 1, skippedCount: 0, remainingCount: 0, articles: [] };
    });

    const response = await postSentiment(new Request("http://localhost/api/news/sentiment", {
      method: "POST",
      headers: { accept: "text/event-stream" },
      body: JSON.stringify({ limit: 2 }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain("\"type\":\"article-classified\"");
    expect(mocks.classifyPendingNewsArticles).toHaveBeenCalledWith(mocks.store, expect.objectContaining({
      limit: 2,
      symbolCodes: ["BBCA.JK"],
      onProgress: expect.any(Function),
    }));
  });

  it("rejects invalid sentiment classification payloads", async () => {
    const response = await postSentiment(new Request("http://localhost/api/news/sentiment", {
      method: "POST",
      body: JSON.stringify({ limit: "large" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "limit must be a positive integer" });
  });
});
