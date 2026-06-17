import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyzeNewsArticle, extractTickerMatches } from "@/lib/news/sentimentEngine";
import { createNewsStore } from "@/lib/news/newsStore";
import { classifyPendingNewsArticles } from "@/lib/news/sentimentService";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "news-sentiment-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("news sentiment engine", () => {
  it("classifies positive ticker-relevant IDX evidence with inspectable reasoning", () => {
    const result = analyzeNewsArticle({
      sourceCategory: "market",
      title: "IHSG menguat, BBCA jadi motor kenaikan",
      excerpt: "Rupiah stabil dan pasar modal positif.",
      matchedKeywords: ["IHSG", "rupiah", "saham"],
    }, ["BBCA.JK", "TLKM.JK"]);

    expect(result).toMatchObject({
      sentimentLabel: "positive",
      sentimentScore: 1,
      marketScope: "ticker",
    });
    expect(result.relevanceScore).toBeGreaterThanOrEqual(0.9);
    expect(result.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ matchType: "ticker", matchValue: "BBCA" }),
      expect.objectContaining({ matchType: "index", matchValue: "IHSG" }),
      expect.objectContaining({ matchType: "macro", matchValue: "rupiah" }),
    ]));
    expect(result.reasoning).toContain("Positive evidence");
  });

  it("keeps foreign flow terms but removes recommendation-shaped wording from generated reasoning", () => {
    const result = analyzeNewsArticle({
      sourceCategory: "market",
      title: "IHSG naik setelah net buy asing berlanjut",
      excerpt: "Investor asing mencatat arus masuk di saham utama.",
      matchedKeywords: ["IHSG", "net buy asing"],
    }, []);

    expect(result.sentimentLabel).toBe("positive");
    expect(result.reasoning.toLowerCase()).not.toMatch(/\bbuy\b|\bsell\b|\bentry\b|\btarget\b|\bstop loss\b/);
    expect(result.reasoning).toContain("foreign accumulation flow");
  });

  it("detects mixed and negative market tone without overstating relevance", () => {
    const mixed = analyzeNewsArticle({
      sourceCategory: "economy",
      title: "Rupiah menguat tetapi IHSG terkoreksi",
      excerpt: "Pasar modal masih tertekan.",
      matchedKeywords: ["rupiah", "IHSG"],
    }, []);
    const negative = analyzeNewsArticle({
      sourceCategory: "global",
      title: "Bursa global tertekan perang dagang",
      excerpt: "Tekanan geopolitik meningkat.",
      matchedKeywords: ["bursa"],
    }, []);

    expect(mixed.sentimentLabel).toBe("mixed");
    expect(mixed.marketScope).toBe("ihsg");
    expect(negative.sentimentLabel).toBe("negative");
    expect(negative.relevanceScore).toBeLessThan(mixed.relevanceScore);
  });

  it("uses known IDX symbols before fallback uppercase token matching", () => {
    expect(extractTickerMatches("BBCA dan TRON menguat", ["BBCA.JK"])).toEqual(["BBCA"]);
    expect(extractTickerMatches("TRON dan BAJA memimpin kenaikan", [])).toEqual(["TRON", "BAJA"]);
  });
});

describe("news sentiment service", () => {
  it("classifies pending articles and persists matches plus sentiment runs", async () => {
    const store = createNewsStore(path.join(dir, "market.db"));
    const articleId = store.insertArticle({
      sourceId: "cnbc-market",
      sourceName: "CNBC Indonesia Market",
      sourceCategory: "market",
      url: "https://example.com/bbca",
      canonicalUrl: "https://example.com/bbca",
      title: "IHSG rebound, BBCA menguat",
      publishedAt: "2026-06-15T09:30:00.000Z",
      ingestedAt: "2026-06-15T09:31:00.000Z",
      excerpt: "Pasar modal positif.",
      contentHash: "hash-bbca",
      matchedKeywords: ["IHSG", "saham"],
    });

    try {
      const result = await classifyPendingNewsArticles(store, { limit: 5, symbolCodes: ["BBCA.JK"] });

      expect(result).toMatchObject({
        total: 1,
        classifiedCount: 1,
        skippedCount: 0,
      });
      expect(store.getArticles({ ticker: "BBCA", sentiment: "positive" }).articles[0]).toMatchObject({
        id: articleId,
        sentiment: {
          modelName: "nexaquant-lexicon-v1",
          sentimentLabel: "positive",
          marketScope: "ticker",
        },
      });
      await expect(classifyPendingNewsArticles(store, { limit: 5, symbolCodes: ["BBCA.JK"] })).resolves.toMatchObject({
        total: 0,
        classifiedCount: 0,
      });
    } finally {
      store.close();
    }
  });

  it("continues classifying pending articles beyond one store batch", async () => {
    const store = createNewsStore(path.join(dir, "market.db"));
    try {
      for (let index = 0; index < 205; index += 1) {
        store.insertArticle({
          sourceId: "emitennews-emiten",
          sourceName: "EmitenNews Emiten",
          sourceCategory: "market",
          url: `https://example.com/article-${index}`,
          canonicalUrl: `https://example.com/article-${index}`,
          title: `IHSG dan saham batch ${index}`,
          publishedAt: `2026-06-${String(1 + (index % 15)).padStart(2, "0")}T09:00:00.000Z`,
          ingestedAt: "2026-06-16T09:31:00.000Z",
          excerpt: "Pasar modal positif.",
          contentHash: `hash-${index}`,
          matchedKeywords: ["IHSG", "saham"],
        });
      }

      const progress: string[] = [];
      const result = await classifyPendingNewsArticles(store, {
        limit: 205,
        symbolCodes: [],
        onProgress: (event) => {
          progress.push(event.type);
        },
      });

      expect(result).toMatchObject({
        total: 205,
        classifiedCount: 205,
        skippedCount: 0,
        remainingCount: 0,
      });
      expect(store.countArticlesForClassification()).toBe(0);
      expect(progress).toContain("classification-started");
      expect(progress).toContain("classification-completed");
    } finally {
      store.close();
    }
  });
});
