import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createNewsStore } from "@/lib/news/newsStore";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "news-store-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("newsStore", () => {
  it("stores auditable articles and filters them by source, keyword, ticker, and sentiment", () => {
    const store = createNewsStore(path.join(dir, "market.db"));
    const firstId = store.insertArticle({
      sourceId: "cnbc-market",
      sourceName: "CNBC Indonesia Market",
      sourceCategory: "market",
      url: "https://example.com/ihsg",
      canonicalUrl: "https://example.com/ihsg",
      title: "IHSG menguat bersama BBCA",
      publishedAt: "2026-06-15T09:30:00.000Z",
      ingestedAt: "2026-06-15T09:31:00.000Z",
      excerpt: "Pasar modal bergerak positif.",
      contentHash: "hash-1",
      matchedKeywords: ["IHSG", "saham"],
    });
    store.insertArticle({
      sourceId: "antara-ekonomi",
      sourceName: "Antara Ekonomi",
      sourceCategory: "economy",
      url: "https://example.com/rupiah",
      canonicalUrl: "https://example.com/rupiah",
      title: "Rupiah stabil",
      publishedAt: "2026-06-14T09:30:00.000Z",
      ingestedAt: "2026-06-14T09:31:00.000Z",
      excerpt: "Makro stabil.",
      contentHash: "hash-2",
      matchedKeywords: ["rupiah"],
    });
    store.replaceArticleMatches(firstId, [
      { matchType: "keyword", matchValue: "IHSG", confidence: 0.9 },
      { matchType: "ticker", matchValue: "BBCA", confidence: 0.85 },
    ]);
    store.insertSentimentRun({
      articleId: firstId,
      modelName: "fixture",
      sentimentLabel: "positive",
      sentimentScore: 0.7,
      relevanceScore: 0.9,
      marketScope: "ticker",
      reasoning: "positive evidence for index context",
      createdAt: "2026-06-15T09:32:00.000Z",
    });

    try {
      expect(store.getArticles({ sourceId: "cnbc-market" }).total).toBe(1);
      expect(store.getArticles({ keyword: "IHSG" }).articles.map((item) => item.id)).toEqual([firstId]);
      expect(store.getArticles({ ticker: "BBCA.JK" }).articles.map((item) => item.id)).toEqual([firstId]);
      expect(store.getArticles({ sentiment: "positive", minRelevance: 0.8 }).articles[0]).toMatchObject({
        title: "IHSG menguat bersama BBCA",
        sentiment: {
          sentimentLabel: "positive",
          relevanceScore: 0.9,
        },
        matches: [
          expect.objectContaining({ matchType: "keyword", matchValue: "IHSG" }),
          expect.objectContaining({ matchType: "ticker", matchValue: "BBCA" }),
        ],
      });
    } finally {
      store.close();
    }
  });

  it("summarizes classified and unclassified news without hiding unknowns", () => {
    const store = createNewsStore(path.join(dir, "market.db"));
    const classifiedId = store.insertArticle({
      sourceId: "idx-channel",
      sourceName: "IDX Channel",
      sourceCategory: "market",
      url: "https://example.com/a",
      canonicalUrl: "https://example.com/a",
      title: "IHSG rebound",
      publishedAt: "2026-06-15T09:30:00.000Z",
      ingestedAt: "2026-06-15T09:31:00.000Z",
      excerpt: "Evidence sample.",
      contentHash: "hash-a",
      matchedKeywords: ["IHSG"],
    });
    store.insertArticle({
      sourceId: "idx-channel",
      sourceName: "IDX Channel",
      sourceCategory: "market",
      url: "https://example.com/b",
      canonicalUrl: "https://example.com/b",
      title: "Berita emiten",
      publishedAt: "2026-06-15T08:30:00.000Z",
      ingestedAt: "2026-06-15T08:31:00.000Z",
      excerpt: "Evidence sample.",
      contentHash: "hash-b",
      matchedKeywords: ["emiten"],
    });
    store.insertSentimentRun({
      articleId: classifiedId,
      modelName: "fixture",
      sentimentLabel: "positive",
      sentimentScore: 0.5,
      relevanceScore: 0.8,
      marketScope: "ihsg",
      reasoning: "positive evidence for index context",
      createdAt: "2026-06-15T09:32:00.000Z",
    });

    try {
      expect(store.getSummary()).toMatchObject({
        totalArticles: 2,
        classifiedArticles: 1,
        unclassifiedArticles: 1,
        sentimentCounts: {
          positive: 1,
          negative: 0,
          neutral: 0,
          mixed: 0,
          unknown: 1,
        },
        dailyTimeline: [
          {
            date: "2026-06-15",
            totalArticles: 2,
            classifiedArticles: 1,
            sentimentCounts: {
              positive: 1,
              negative: 0,
              neutral: 0,
              mixed: 0,
              unknown: 1,
            },
            averageRelevanceScore: 0.8,
            weightedSentimentScore: 0.5,
          },
        ],
        averageSentimentScore: 0.5,
        averageRelevanceScore: 0.8,
        weightedSentimentScore: 0.5,
      });
    } finally {
      store.close();
    }
  });

  it("summarizes all matching articles beyond the visible table page", () => {
    const store = createNewsStore(path.join(dir, "market.db"));

    try {
      for (let index = 0; index < 205; index += 1) {
        const articleId = store.insertArticle({
          sourceId: "idx-channel",
          sourceName: "IDX Channel",
          sourceCategory: "market",
          url: `https://example.com/summary-${index}`,
          canonicalUrl: `https://example.com/summary-${index}`,
          title: `IHSG summary sample ${index}`,
          publishedAt: `2026-06-${String(1 + (index % 15)).padStart(2, "0")}T09:30:00.000Z`,
          ingestedAt: "2026-06-15T09:31:00.000Z",
          excerpt: "Evidence sample.",
          contentHash: `summary-hash-${index}`,
          matchedKeywords: ["IHSG"],
        });
        store.insertSentimentRun({
          articleId,
          modelName: "fixture",
          sentimentLabel: "positive",
          sentimentScore: 0.5,
          relevanceScore: 0.8,
          marketScope: "ihsg",
          reasoning: "positive evidence for index context",
          createdAt: "2026-06-15T09:32:00.000Z",
        });
      }

      const summary = store.getSummary();

      expect(summary).toMatchObject({
        totalArticles: 205,
        classifiedArticles: 205,
        unclassifiedArticles: 0,
        sentimentCounts: {
          positive: 205,
          negative: 0,
          neutral: 0,
          mixed: 0,
          unknown: 0,
        },
      });
      expect(summary.dailyTimeline.reduce((total, bucket) => total + bucket.totalArticles, 0)).toBe(205);
      expect(summary.dailyTimeline).toHaveLength(15);
    } finally {
      store.close();
    }
  });

  it("filters old unclassified articles by explicit ticker text", () => {
    const store = createNewsStore(path.join(dir, "market.db"));
    const enrgId = store.insertArticle({
      sourceId: "emitennews-emiten",
      sourceName: "EmitenNews Emiten",
      sourceCategory: "market",
      url: "https://example.com/enrg-rights-issue",
      canonicalUrl: "https://example.com/enrg-rights-issue",
      title: "Rights Issue ENRG Rp4,1 Triliun",
      publishedAt: "2026-05-20T09:30:00.000Z",
      ingestedAt: "2026-06-15T09:31:00.000Z",
      excerpt: "Artikel lama belum punya klasifikasi sentiment.",
      contentHash: "hash-enrg",
      matchedKeywords: [],
    });
    store.insertArticle({
      sourceId: "emitennews-emiten",
      sourceName: "EmitenNews Emiten",
      sourceCategory: "market",
      url: "https://example.com/energi",
      canonicalUrl: "https://example.com/energi",
      title: "Energi nasional menjadi sorotan",
      publishedAt: "2026-05-19T09:30:00.000Z",
      ingestedAt: "2026-06-15T09:31:00.000Z",
      excerpt: "Tidak menyebut kode saham.",
      contentHash: "hash-energi",
      matchedKeywords: [],
    });

    try {
      const result = store.getArticles({ ticker: "ENRG.JK" });

      expect(result.articles.map((article) => article.id)).toEqual([enrgId]);
      expect(result.articles[0].matches).toContainEqual(expect.objectContaining({
        matchType: "ticker",
        matchValue: "ENRG",
      }));
    } finally {
      store.close();
    }
  });

  it("tracks enrichment runs, enrichment candidates, and human feedback", () => {
    const store = createNewsStore(path.join(dir, "market.db"));
    const articleId = store.insertArticle({
      sourceId: "bisnis-bursa-saham",
      sourceName: "Bisnis Bursa Saham",
      sourceCategory: "market",
      url: "https://example.com/empty",
      canonicalUrl: "https://example.com/empty",
      title: "Saham Bank Menguat",
      publishedAt: "2026-06-15T09:30:00.000Z",
      ingestedAt: "2026-06-15T09:31:00.000Z",
      excerpt: "",
      content: "",
      extractionStatus: "failed",
      contentQualityScore: 0,
      contentHash: "hash-empty",
      matchedKeywords: ["saham"],
    });
    store.insertSentimentRun({
      articleId,
      modelName: "fixture",
      sentimentLabel: "positive",
      sentimentScore: 1,
      relevanceScore: 0.8,
      marketScope: "ticker",
      reasoning: "Positive.",
      createdAt: "2026-06-15T09:32:00.000Z",
    });

    try {
      expect(store.getArticlesForEnrichment(10).map((article) => article.id)).toEqual([articleId]);
      expect(store.updateArticleEnrichment(articleId, {
        excerpt: "Ringkasan baru.",
        content: "Konten artikel lengkap yang lebih panjang dan dapat dipakai untuk sentiment.",
        author: "Reporter",
        imageUrl: "https://example.com/image.jpg",
        extractionStatus: "extracted",
        contentQualityScore: 0.7,
      })).toBe(true);

      store.createEnrichmentRun({
        id: "enrich-1",
        startedAt: "2026-06-15T10:00:00.000Z",
        finishedAt: null,
        status: "running",
        totalArticles: 1,
        enrichedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        error: {},
      });
      store.updateEnrichmentRun({
        id: "enrich-1",
        startedAt: "2026-06-15T10:00:00.000Z",
        finishedAt: "2026-06-15T10:01:00.000Z",
        status: "completed",
        totalArticles: 1,
        enrichedCount: 1,
        skippedCount: 0,
        failedCount: 0,
        error: {},
      });

      const feedback = store.insertFeedback({
        articleId,
        sentimentLabel: "negative",
        relevanceScore: 0.9,
        note: "Correction.",
        createdAt: "2026-06-15T10:02:00.000Z",
      });

      expect(store.getArticleById(articleId)).toMatchObject({
        contentQualityScore: 0.7,
        extractionStatus: "extracted",
      });
      expect(store.getLatestEnrichmentRun()).toMatchObject({ id: "enrich-1", enrichedCount: 1 });
      expect(feedback).toMatchObject({
        previousSentimentLabel: "positive",
        previousRelevanceScore: 0.8,
      });
      expect(store.getFeedbackSummary()).toMatchObject({
        totalFeedback: 1,
        correctedNegative: 1,
        averageCorrectedRelevance: 0.9,
      });
      expect(store.getFeedbackItems()).toEqual([
        expect.objectContaining({
          articleId,
          title: "Saham Bank Menguat",
          sourceName: "Bisnis Bursa Saham",
          sentimentLabel: "negative",
          previousSentimentLabel: "positive",
          previousRelevanceScore: 0.8,
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("returns recent ingestion history with source-level statuses", () => {
    const store = createNewsStore(path.join(dir, "market.db"));

    try {
      store.createIngestionRun({
        id: "run-old",
        startedAt: "2026-06-14T09:00:00.000Z",
        finishedAt: "2026-06-14T09:01:00.000Z",
        status: "completed",
        totalSources: 1,
        successCount: 1,
        failedCount: 0,
        totalCandidates: 12,
        matchedCount: 8,
        insertedCount: 5,
        duplicateCount: 3,
        filteredCount: 4,
        error: {},
      });
      store.upsertSourceStatus({
        runId: "run-old",
        sourceId: "cnbc-market",
        sourceName: "CNBC Indonesia Market",
        status: "success",
        startedAt: "2026-06-14T09:00:00.000Z",
        finishedAt: "2026-06-14T09:01:00.000Z",
        itemsSeen: 12,
        matchedCount: 8,
        insertedCount: 5,
        duplicateCount: 3,
        filteredCount: 4,
        error: null,
      });
      store.createIngestionRun({
        id: "run-new",
        startedAt: "2026-06-15T09:00:00.000Z",
        finishedAt: "2026-06-15T09:01:00.000Z",
        status: "failed",
        totalSources: 1,
        successCount: 0,
        failedCount: 1,
        totalCandidates: 0,
        matchedCount: 0,
        insertedCount: 0,
        duplicateCount: 0,
        filteredCount: 0,
        error: { message: "network down" },
      });
      store.upsertSourceStatus({
        runId: "run-new",
        sourceId: "idx-channel",
        sourceName: "IDX Channel",
        status: "failed",
        startedAt: "2026-06-15T09:00:00.000Z",
        finishedAt: "2026-06-15T09:01:00.000Z",
        itemsSeen: 0,
        matchedCount: 0,
        insertedCount: 0,
        duplicateCount: 0,
        filteredCount: 0,
        error: "HTTP 503",
      });

      expect(store.getRecentIngestionHistory(2)).toEqual([
        expect.objectContaining({
          run: expect.objectContaining({ id: "run-new", status: "failed" }),
          sources: [expect.objectContaining({ sourceId: "idx-channel", status: "failed", error: "HTTP 503" })],
        }),
        expect.objectContaining({
          run: expect.objectContaining({ id: "run-old", status: "completed", insertedCount: 5 }),
          sources: [expect.objectContaining({ sourceId: "cnbc-market", status: "success" })],
        }),
      ]);
    } finally {
      store.close();
    }
  });
});
