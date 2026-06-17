import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type {
  NewsArticle,
  NewsArticleFilters,
  NewsArticleMatch,
  NewsArticleResult,
  NewsEnrichmentRun,
  NewsFeedback,
  NewsFeedbackItem,
  NewsFeedbackSummary,
  NewsIngestionHistoryItem,
  NewsIngestionRun,
  NewsSentimentLabel,
  NewsSentimentRun,
  NewsSourceStatus,
  NewsSummary,
} from "@/lib/news/types";

export type NewsStore = ReturnType<typeof createNewsStore>;

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "market.db");
const SENTIMENT_LABELS: NewsSentimentLabel[] = ["positive", "negative", "neutral", "mixed", "unknown"];
const TICKER_TEXT_SEARCH_SQL = "UPPER(' ' || COALESCE(a.title, '') || ' ' || COALESCE(a.excerpt, '') || ' ' || COALESCE(a.matched_keywords, '') || ' ')";
const TICKER_TEXT_MATCH_SQL = `${TICKER_TEXT_SEARCH_SQL} GLOB @tickerTokenGlob`;

export function createNewsStore(dbPath = DEFAULT_DB_PATH) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrateNewsStore(db);

  return {
    insertArticle(input: {
      sourceId: string;
      sourceName: string;
      sourceCategory: string;
      url: string;
      canonicalUrl: string;
      title: string;
      publishedAt: string | null;
      ingestedAt: string;
      excerpt: string;
      content?: string;
      author?: string | null;
      imageUrl?: string | null;
      extractionStatus?: NewsArticle["extractionStatus"];
      contentQualityScore?: number;
      contentHash: string;
      matchedKeywords: string[];
      language?: string;
      status?: "active" | "archived";
    }) {
      const id = randomUUID();
      db.prepare(`
        INSERT INTO news_articles (
          id, source_id, source_name, source_category, url, canonical_url, title,
          published_at, ingested_at, excerpt, content, author, image_url, extraction_status,
          content_quality_score, content_hash, matched_keywords, language, status
        )
        VALUES (
          @id, @sourceId, @sourceName, @sourceCategory, @url, @canonicalUrl, @title,
          @publishedAt, @ingestedAt, @excerpt, @content, @author, @imageUrl, @extractionStatus,
          @contentQualityScore, @contentHash, @matchedKeywords, @language, @status
        )
      `).run({
        ...input,
        id,
        content: input.content ?? "",
        author: input.author ?? null,
        imageUrl: input.imageUrl ?? null,
        extractionStatus: input.extractionStatus ?? "pending",
        contentQualityScore: input.contentQualityScore ?? scoreStoredContentQuality(input.content ?? input.excerpt),
        matchedKeywords: JSON.stringify(input.matchedKeywords),
        language: input.language ?? "id",
        status: input.status ?? "active",
      });
      return id;
    },

    insertArticleIfNew(input: {
      sourceId: string;
      sourceName: string;
      sourceCategory: string;
      url: string;
      canonicalUrl: string;
      title: string;
      publishedAt: string | null;
      ingestedAt: string;
      excerpt: string;
      content?: string;
      author?: string | null;
      imageUrl?: string | null;
      extractionStatus?: NewsArticle["extractionStatus"];
      contentQualityScore?: number;
      contentHash: string;
      matchedKeywords: string[];
      language?: string;
      status?: "active" | "archived";
    }) {
      const result = db.prepare(`
        INSERT OR IGNORE INTO news_articles (
          id, source_id, source_name, source_category, url, canonical_url, title,
          published_at, ingested_at, excerpt, content, author, image_url, extraction_status,
          content_quality_score, content_hash, matched_keywords, language, status
        )
        VALUES (
          @id, @sourceId, @sourceName, @sourceCategory, @url, @canonicalUrl, @title,
          @publishedAt, @ingestedAt, @excerpt, @content, @author, @imageUrl, @extractionStatus,
          @contentQualityScore, @contentHash, @matchedKeywords, @language, @status
        )
      `).run({
        ...input,
        id: randomUUID(),
        content: input.content ?? "",
        author: input.author ?? null,
        imageUrl: input.imageUrl ?? null,
        extractionStatus: input.extractionStatus ?? "pending",
        contentQualityScore: input.contentQualityScore ?? scoreStoredContentQuality(input.content ?? input.excerpt),
        matchedKeywords: JSON.stringify(input.matchedKeywords),
        language: input.language ?? "id",
        status: input.status ?? "active",
      });
      return result.changes === 1;
    },

    createIngestionRun(run: NewsIngestionRun) {
      db.prepare(`
        INSERT INTO news_ingestion_runs (
          id, started_at, finished_at, status, total_sources, success_count, failed_count,
          total_candidates, matched_count, inserted_count, duplicate_count, filtered_count, error_json
        )
        VALUES (
          @id, @startedAt, @finishedAt, @status, @totalSources, @successCount, @failedCount,
          @totalCandidates, @matchedCount, @insertedCount, @duplicateCount, @filteredCount, @errorJson
        )
      `).run({ ...run, errorJson: JSON.stringify(run.error ?? {}) });
    },

    updateIngestionRun(run: NewsIngestionRun) {
      db.prepare(`
        UPDATE news_ingestion_runs SET
          finished_at = @finishedAt,
          status = @status,
          success_count = @successCount,
          failed_count = @failedCount,
          total_candidates = @totalCandidates,
          matched_count = @matchedCount,
          inserted_count = @insertedCount,
          duplicate_count = @duplicateCount,
          filtered_count = @filteredCount,
          error_json = @errorJson
        WHERE id = @id
      `).run({ ...run, errorJson: JSON.stringify(run.error ?? {}) });
    },

    upsertSourceStatus(status: NewsSourceStatus) {
      db.prepare(`
        INSERT INTO news_source_status (
          run_id, source_id, source_name, status, started_at, finished_at,
          items_seen, matched_count, inserted_count, duplicate_count, filtered_count, error_json
        )
        VALUES (
          @runId, @sourceId, @sourceName, @status, @startedAt, @finishedAt,
          @itemsSeen, @matchedCount, @insertedCount, @duplicateCount, @filteredCount, @errorJson
        )
        ON CONFLICT(run_id, source_id) DO UPDATE SET
          status = excluded.status,
          finished_at = excluded.finished_at,
          items_seen = excluded.items_seen,
          matched_count = excluded.matched_count,
          inserted_count = excluded.inserted_count,
          duplicate_count = excluded.duplicate_count,
          filtered_count = excluded.filtered_count,
          error_json = excluded.error_json
      `).run({ ...status, errorJson: JSON.stringify(status.error ?? null) });
    },

    getArticles(filters: NewsArticleFilters = {}): NewsArticleResult {
      const parsed = toArticleFilterParams(filters);
      const rows = db.prepare(`
        WITH latest_sentiment AS (
          SELECT ns.*
          FROM news_sentiment_runs ns
          JOIN (
            SELECT article_id, MAX(created_at) AS created_at
            FROM news_sentiment_runs
            GROUP BY article_id
          ) latest
            ON latest.article_id = ns.article_id
           AND latest.created_at = ns.created_at
        )
        SELECT
          a.*,
          ls.id AS sentiment_id,
          ls.model_name AS sentiment_model_name,
          ls.sentiment_label,
          ls.sentiment_score,
          ls.relevance_score,
          ls.market_scope,
          ls.reasoning,
          ls.created_at AS sentiment_created_at,
          CASE
            WHEN @ticker IS NOT NULL AND ${TICKER_TEXT_MATCH_SQL} THEN @ticker
            ELSE NULL
          END AS ticker_text_match_value
        FROM news_articles a
        LEFT JOIN latest_sentiment ls ON ls.article_id = a.id
        WHERE a.status = 'active'
          AND (@sourceId IS NULL OR a.source_id = @sourceId)
          AND (@query = '%%' OR a.title LIKE @query OR a.excerpt LIKE @query OR a.source_name LIKE @query)
          AND (@dateFrom IS NULL OR COALESCE(a.published_at, a.ingested_at) >= @dateFrom)
          AND (@dateTo IS NULL OR COALESCE(a.published_at, a.ingested_at) <= @dateTo)
          AND (@sentiment IS NULL OR COALESCE(ls.sentiment_label, 'unknown') = @sentiment)
          AND (@minRelevance IS NULL OR COALESCE(ls.relevance_score, 0) >= @minRelevance)
          AND (
            @keyword IS NULL
            OR EXISTS (
              SELECT 1 FROM news_article_matches nam
              WHERE nam.article_id = a.id
                AND nam.match_type = 'keyword'
                AND nam.match_value = @keyword
            )
            OR a.matched_keywords LIKE @keywordPattern
          )
          AND (
            @ticker IS NULL
            OR EXISTS (
              SELECT 1 FROM news_article_matches nam
              WHERE nam.article_id = a.id
                AND nam.match_type IN ('ticker', 'index')
                AND nam.match_value = @ticker
            )
            OR ${TICKER_TEXT_MATCH_SQL}
          )
        ORDER BY COALESCE(a.published_at, a.ingested_at) DESC, a.ingested_at DESC
        LIMIT @limit OFFSET @offset
      `).all(parsed) as StoredArticleRow[];

      const total = db.prepare(`
        WITH latest_sentiment AS (
          SELECT ns.*
          FROM news_sentiment_runs ns
          JOIN (
            SELECT article_id, MAX(created_at) AS created_at
            FROM news_sentiment_runs
            GROUP BY article_id
          ) latest
            ON latest.article_id = ns.article_id
           AND latest.created_at = ns.created_at
        )
        SELECT COUNT(*) AS total
        FROM news_articles a
        LEFT JOIN latest_sentiment ls ON ls.article_id = a.id
        WHERE a.status = 'active'
          AND (@sourceId IS NULL OR a.source_id = @sourceId)
          AND (@query = '%%' OR a.title LIKE @query OR a.excerpt LIKE @query OR a.source_name LIKE @query)
          AND (@dateFrom IS NULL OR COALESCE(a.published_at, a.ingested_at) >= @dateFrom)
          AND (@dateTo IS NULL OR COALESCE(a.published_at, a.ingested_at) <= @dateTo)
          AND (@sentiment IS NULL OR COALESCE(ls.sentiment_label, 'unknown') = @sentiment)
          AND (@minRelevance IS NULL OR COALESCE(ls.relevance_score, 0) >= @minRelevance)
          AND (
            @keyword IS NULL
            OR EXISTS (
              SELECT 1 FROM news_article_matches nam
              WHERE nam.article_id = a.id
                AND nam.match_type = 'keyword'
                AND nam.match_value = @keyword
            )
            OR a.matched_keywords LIKE @keywordPattern
          )
          AND (
            @ticker IS NULL
            OR EXISTS (
              SELECT 1 FROM news_article_matches nam
              WHERE nam.article_id = a.id
                AND nam.match_type IN ('ticker', 'index')
                AND nam.match_value = @ticker
            )
            OR ${TICKER_TEXT_MATCH_SQL}
          )
      `).get(parsed) as { total: number };

      const matches = getMatchesForArticles(db, rows.map((row) => row.id));
      return {
        articles: rows.map((row) => toNewsArticle(row, matches.get(row.id) ?? [])),
        total: total.total,
        limit: parsed.limit,
        offset: parsed.offset,
      };
    },

    getArticleById(articleId: string): NewsArticle | null {
      const row = db.prepare(`
        WITH latest_sentiment AS (
          SELECT ns.*
          FROM news_sentiment_runs ns
          JOIN (
            SELECT article_id, MAX(created_at) AS created_at
            FROM news_sentiment_runs
            GROUP BY article_id
          ) latest
            ON latest.article_id = ns.article_id
           AND latest.created_at = ns.created_at
        )
        SELECT
          a.*,
          ls.id AS sentiment_id,
          ls.model_name AS sentiment_model_name,
          ls.sentiment_label,
          ls.sentiment_score,
          ls.relevance_score,
          ls.market_scope,
          ls.reasoning,
          ls.created_at AS sentiment_created_at,
          NULL AS ticker_text_match_value
        FROM news_articles a
        LEFT JOIN latest_sentiment ls ON ls.article_id = a.id
        WHERE a.id = @articleId
        LIMIT 1
      `).get({ articleId }) as StoredArticleRow | undefined;
      if (!row) {
        return null;
      }
      const matches = getMatchesForArticles(db, [row.id]);
      return toNewsArticle(row, matches.get(row.id) ?? []);
    },

    getArticlesForEnrichment(limit = 25): NewsArticle[] {
      const rows = db.prepare(`
        WITH latest_sentiment AS (
          SELECT ns.*
          FROM news_sentiment_runs ns
          JOIN (
            SELECT article_id, MAX(created_at) AS created_at
            FROM news_sentiment_runs
            GROUP BY article_id
          ) latest
            ON latest.article_id = ns.article_id
           AND latest.created_at = ns.created_at
        )
        SELECT
          a.*,
          ls.id AS sentiment_id,
          ls.model_name AS sentiment_model_name,
          ls.sentiment_label,
          ls.sentiment_score,
          ls.relevance_score,
          ls.market_scope,
          ls.reasoning,
          ls.created_at AS sentiment_created_at,
          NULL AS ticker_text_match_value
        FROM news_articles a
        LEFT JOIN latest_sentiment ls ON ls.article_id = a.id
        WHERE a.status = 'active'
          AND (
            a.extraction_status IN ('pending', 'summary-only', 'failed')
            OR a.content_quality_score < 0.62
            OR TRIM(a.content) = ''
          )
        ORDER BY
          CASE a.extraction_status
            WHEN 'pending' THEN 0
            WHEN 'failed' THEN 1
            WHEN 'summary-only' THEN 2
            ELSE 3
          END ASC,
          a.content_quality_score ASC,
          COALESCE(a.published_at, a.ingested_at) DESC
        LIMIT @limit
      `).all({ limit: Math.max(1, Math.min(200, limit)) }) as StoredArticleRow[];
      const matches = getMatchesForArticles(db, rows.map((row) => row.id));
      return rows.map((row) => toNewsArticle(row, matches.get(row.id) ?? []));
    },

    updateArticleEnrichment(articleId: string, input: {
      excerpt: string;
      content: string;
      author: string | null;
      imageUrl: string | null;
      extractionStatus: NewsArticle["extractionStatus"];
      contentQualityScore: number;
    }) {
      const result = db.prepare(`
        UPDATE news_articles SET
          excerpt = @excerpt,
          content = @content,
          author = @author,
          image_url = @imageUrl,
          extraction_status = @extractionStatus,
          content_quality_score = @contentQualityScore
        WHERE id = @articleId
      `).run({ ...input, articleId });
      return result.changes === 1;
    },

    createEnrichmentRun(run: NewsEnrichmentRun) {
      db.prepare(`
        INSERT INTO news_enrichment_runs (
          id, started_at, finished_at, status, total_articles, enriched_count,
          skipped_count, failed_count, error_json
        )
        VALUES (
          @id, @startedAt, @finishedAt, @status, @totalArticles, @enrichedCount,
          @skippedCount, @failedCount, @errorJson
        )
      `).run({ ...run, errorJson: JSON.stringify(run.error ?? {}) });
    },

    updateEnrichmentRun(run: NewsEnrichmentRun) {
      db.prepare(`
        UPDATE news_enrichment_runs SET
          finished_at = @finishedAt,
          status = @status,
          total_articles = @totalArticles,
          enriched_count = @enrichedCount,
          skipped_count = @skippedCount,
          failed_count = @failedCount,
          error_json = @errorJson
        WHERE id = @id
      `).run({ ...run, errorJson: JSON.stringify(run.error ?? {}) });
    },

    getLatestEnrichmentRun(): NewsEnrichmentRun | null {
      const row = db.prepare(`
        SELECT * FROM news_enrichment_runs ORDER BY started_at DESC LIMIT 1
      `).get() as StoredEnrichmentRun | undefined;
      return row ? toNewsEnrichmentRun(row) : null;
    },

    insertFeedback(input: {
      articleId: string;
      sentimentLabel: NewsSentimentLabel;
      relevanceScore: number;
      note?: string;
      createdAt?: string;
    }): NewsFeedback {
      const id = randomUUID();
      const latest = getLatestSentimentForArticle(db, input.articleId);
      const feedback: NewsFeedback = {
        id,
        articleId: input.articleId,
        sentimentLabel: input.sentimentLabel,
        relevanceScore: input.relevanceScore,
        note: input.note?.trim() ?? "",
        previousSentimentLabel: latest?.sentiment_label ?? null,
        previousRelevanceScore: latest?.relevance_score ?? null,
        createdAt: input.createdAt ?? new Date().toISOString(),
      };
      db.prepare(`
        INSERT INTO news_feedback (
          id, article_id, sentiment_label, relevance_score, note,
          previous_sentiment_label, previous_relevance_score, created_at
        )
        VALUES (
          @id, @articleId, @sentimentLabel, @relevanceScore, @note,
          @previousSentimentLabel, @previousRelevanceScore, @createdAt
        )
      `).run(feedback);
      return feedback;
    },

    getFeedbackSummary(): NewsFeedbackSummary {
      const row = db.prepare(`
        SELECT
          COUNT(*) AS total_feedback,
          MAX(created_at) AS latest_feedback_at,
          SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) AS corrected_positive,
          SUM(CASE WHEN sentiment_label IN ('neutral', 'mixed', 'unknown') THEN 1 ELSE 0 END) AS corrected_neutral,
          SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) AS corrected_negative,
          AVG(relevance_score) AS average_corrected_relevance
        FROM news_feedback
      `).get() as {
        total_feedback: number;
        latest_feedback_at: string | null;
        corrected_positive: number | null;
        corrected_neutral: number | null;
        corrected_negative: number | null;
        average_corrected_relevance: number | null;
      };
      return {
        totalFeedback: row.total_feedback,
        latestFeedbackAt: row.latest_feedback_at,
        correctedPositive: row.corrected_positive ?? 0,
        correctedNeutral: row.corrected_neutral ?? 0,
        correctedNegative: row.corrected_negative ?? 0,
        averageCorrectedRelevance: row.average_corrected_relevance === null ? null : roundScore(row.average_corrected_relevance),
      };
    },

    getFeedbackItems(limit = 50): NewsFeedbackItem[] {
      const rows = db.prepare(`
        SELECT
          nf.*,
          a.title,
          a.source_name,
          a.published_at
        FROM news_feedback nf
        JOIN news_articles a ON a.id = nf.article_id
        ORDER BY nf.created_at DESC
        LIMIT @limit
      `).all({ limit: Math.max(1, Math.min(200, limit)) }) as StoredFeedbackItemRow[];
      return rows.map(toNewsFeedbackItem);
    },

    countArticlesForClassification() {
      const row = db.prepare(`
        SELECT COUNT(*) AS total
        FROM news_articles a
        WHERE a.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM news_sentiment_runs ns
            WHERE ns.article_id = a.id
          )
      `).get() as { total: number };
      return row.total;
    },

    getArticleForClassification(limit = 50): NewsArticle[] {
      const rows = db.prepare(`
        SELECT a.*, NULL AS sentiment_id, NULL AS sentiment_model_name, NULL AS sentiment_label,
          NULL AS sentiment_score, NULL AS relevance_score, NULL AS market_scope,
          NULL AS reasoning, NULL AS sentiment_created_at
        FROM news_articles a
        WHERE a.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM news_sentiment_runs ns
            WHERE ns.article_id = a.id
          )
        ORDER BY COALESCE(a.published_at, a.ingested_at) DESC, a.ingested_at DESC
        LIMIT @limit
      `).all({ limit: Math.max(1, Math.min(200, limit)) }) as StoredArticleRow[];
      const matches = getMatchesForArticles(db, rows.map((row) => row.id));
      return rows.map((row) => toNewsArticle(row, matches.get(row.id) ?? []));
    },

    replaceArticleMatches(articleId: string, matches: Omit<NewsArticleMatch, "articleId">[]) {
      const remove = db.prepare("DELETE FROM news_article_matches WHERE article_id = ?");
      const insert = db.prepare(`
        INSERT INTO news_article_matches (article_id, match_type, match_value, confidence)
        VALUES (@articleId, @matchType, @matchValue, @confidence)
      `);
      const transaction = db.transaction(() => {
        remove.run(articleId);
        for (const match of matches) {
          insert.run({ ...match, articleId });
        }
      });
      transaction();
    },

    insertSentimentRun(run: Omit<NewsSentimentRun, "id">) {
      const id = randomUUID();
      db.prepare(`
        INSERT INTO news_sentiment_runs (
          id, article_id, model_name, sentiment_label, sentiment_score,
          relevance_score, market_scope, reasoning, created_at
        )
        VALUES (
          @id, @articleId, @modelName, @sentimentLabel, @sentimentScore,
          @relevanceScore, @marketScope, @reasoning, @createdAt
        )
      `).run({ ...run, id });
      return id;
    },

    getSummary(filters: NewsArticleFilters = {}): NewsSummary {
      const result = this.getArticles({ ...filters, limit: 200, offset: 0 });
      const articles = [...result.articles];
      for (let offset = result.limit; offset < result.total; offset += result.limit) {
        articles.push(...this.getArticles({ ...filters, limit: result.limit, offset }).articles);
      }
      const sentimentCounts = createEmptySentimentCounts();
      let classifiedArticles = 0;
      let sentimentTotal = 0;
      let relevanceTotal = 0;
      let relevanceWeight = 0;
      let weightedSentiment = 0;
      const dailyTimeline = new Map<string, DailyTimelineAccumulator>();

      for (const article of articles) {
        const sentiment = article.sentiment;
        const label = sentiment?.sentimentLabel ?? "unknown";
        const day = (article.publishedAt ?? article.ingestedAt).slice(0, 10);
        const bucket = dailyTimeline.get(day) ?? createDailyTimelineAccumulator(day);

        sentimentCounts[label] += 1;
        bucket.totalArticles += 1;
        bucket.sentimentCounts[label] += 1;

        if (sentiment) {
          classifiedArticles += 1;
          sentimentTotal += sentiment.sentimentScore;
          relevanceTotal += sentiment.relevanceScore;
          relevanceWeight += sentiment.relevanceScore;
          weightedSentiment += sentiment.sentimentScore * sentiment.relevanceScore;

          bucket.classifiedArticles += 1;
          bucket.relevanceTotal += sentiment.relevanceScore;
          bucket.relevanceWeight += sentiment.relevanceScore;
          bucket.weightedSentiment += sentiment.sentimentScore * sentiment.relevanceScore;
        }
        dailyTimeline.set(day, bucket);
      }

      return {
        totalArticles: result.total,
        classifiedArticles,
        unclassifiedArticles: Math.max(0, result.total - classifiedArticles),
        latestPublishedAt: articles[0]?.publishedAt ?? null,
        latestIngestedAt: articles.reduce<string | null>((latest, article) => (
          !latest || article.ingestedAt > latest ? article.ingestedAt : latest
        ), null),
        latestSync: this.getLatestRun(),
        sentimentCounts,
        dailyTimeline: [...dailyTimeline.values()]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(toDailyTimelineBucket),
        averageSentimentScore: classifiedArticles ? roundScore(sentimentTotal / classifiedArticles) : null,
        averageRelevanceScore: classifiedArticles ? roundScore(relevanceTotal / classifiedArticles) : null,
        weightedSentimentScore: relevanceWeight ? roundScore(weightedSentiment / relevanceWeight) : null,
      };
    },

    getLatestRun(): NewsIngestionRun | null {
      const row = db.prepare(`
        SELECT * FROM news_ingestion_runs ORDER BY started_at DESC LIMIT 1
      `).get() as StoredIngestionRun | undefined;
      return row ? toNewsIngestionRun(row) : null;
    },

    getLatestSourceStatuses(limit = 20): NewsSourceStatus[] {
      const latestRun = this.getLatestRun();
      if (!latestRun) {
        return [];
      }
      const rows = db.prepare(`
        SELECT * FROM news_source_status
        WHERE run_id = ?
        ORDER BY source_id ASC
        LIMIT ?
      `).all(latestRun.id, Math.max(1, Math.min(50, limit))) as StoredSourceStatus[];
      return rows.map(toNewsSourceStatus);
    },

    getRecentIngestionHistory(limit = 6): NewsIngestionHistoryItem[] {
      const runRows = db.prepare(`
        SELECT * FROM news_ingestion_runs
        ORDER BY started_at DESC
        LIMIT ?
      `).all(Math.max(1, Math.min(20, limit))) as StoredIngestionRun[];

      const sourceStatement = db.prepare(`
        SELECT * FROM news_source_status
        WHERE run_id = ?
        ORDER BY source_id ASC
      `);

      return runRows.map((row) => ({
        run: toNewsIngestionRun(row),
        sources: (sourceStatement.all(row.id) as StoredSourceStatus[]).map(toNewsSourceStatus),
      }));
    },

    close() {
      db.close();
    },
  };
}

type DailyTimelineAccumulator = {
  date: string;
  totalArticles: number;
  classifiedArticles: number;
  sentimentCounts: Record<NewsSentimentLabel, number>;
  relevanceTotal: number;
  relevanceWeight: number;
  weightedSentiment: number;
};

function createDailyTimelineAccumulator(date: string): DailyTimelineAccumulator {
  return {
    date,
    totalArticles: 0,
    classifiedArticles: 0,
    sentimentCounts: createEmptySentimentCounts(),
    relevanceTotal: 0,
    relevanceWeight: 0,
    weightedSentiment: 0,
  };
}

function toDailyTimelineBucket(bucket: DailyTimelineAccumulator): NewsSummary["dailyTimeline"][number] {
  return {
    date: bucket.date,
    totalArticles: bucket.totalArticles,
    classifiedArticles: bucket.classifiedArticles,
    sentimentCounts: bucket.sentimentCounts,
    averageRelevanceScore: bucket.classifiedArticles ? roundScore(bucket.relevanceTotal / bucket.classifiedArticles) : null,
    weightedSentimentScore: bucket.relevanceWeight ? roundScore(bucket.weightedSentiment / bucket.relevanceWeight) : null,
  };
}

function createEmptySentimentCounts(): Record<NewsSentimentLabel, number> {
  return Object.fromEntries(SENTIMENT_LABELS.map((label) => [label, 0])) as Record<NewsSentimentLabel, number>;
}

let singleton: NewsStore | null = null;

export function getNewsStore(): NewsStore {
  singleton ??= createNewsStore();
  return singleton;
}

export function migrateNewsStore(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS news_articles (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_category TEXT NOT NULL,
      url TEXT NOT NULL,
      canonical_url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      published_at TEXT,
      ingested_at TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      author TEXT,
      image_url TEXT,
      extraction_status TEXT NOT NULL DEFAULT 'pending',
      content_quality_score REAL NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL UNIQUE,
      matched_keywords TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'id',
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news_ingestion_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      total_sources INTEGER NOT NULL,
      success_count INTEGER NOT NULL,
      failed_count INTEGER NOT NULL,
      total_candidates INTEGER NOT NULL,
      matched_count INTEGER NOT NULL,
      inserted_count INTEGER NOT NULL,
      duplicate_count INTEGER NOT NULL,
      filtered_count INTEGER NOT NULL,
      error_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news_enrichment_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      total_articles INTEGER NOT NULL,
      enriched_count INTEGER NOT NULL,
      skipped_count INTEGER NOT NULL,
      failed_count INTEGER NOT NULL,
      error_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news_source_status (
      run_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      items_seen INTEGER NOT NULL,
      matched_count INTEGER NOT NULL,
      inserted_count INTEGER NOT NULL,
      duplicate_count INTEGER NOT NULL,
      filtered_count INTEGER NOT NULL,
      error_json TEXT NOT NULL,
      PRIMARY KEY (run_id, source_id)
    );

    CREATE TABLE IF NOT EXISTS news_article_matches (
      article_id TEXT NOT NULL,
      match_type TEXT NOT NULL,
      match_value TEXT NOT NULL,
      confidence REAL NOT NULL,
      PRIMARY KEY (article_id, match_type, match_value),
      FOREIGN KEY (article_id) REFERENCES news_articles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS news_sentiment_runs (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      sentiment_label TEXT NOT NULL,
      sentiment_score REAL NOT NULL,
      relevance_score REAL NOT NULL,
      market_scope TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (article_id) REFERENCES news_articles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS news_feedback (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      sentiment_label TEXT NOT NULL,
      relevance_score REAL NOT NULL,
      note TEXT NOT NULL,
      previous_sentiment_label TEXT,
      previous_relevance_score REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (article_id) REFERENCES news_articles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_news_articles_published_source
      ON news_articles (published_at, source_id);

    CREATE INDEX IF NOT EXISTS idx_news_articles_ingested
      ON news_articles (ingested_at);

    CREATE INDEX IF NOT EXISTS idx_news_article_matches_lookup
      ON news_article_matches (match_type, match_value, article_id);

    CREATE INDEX IF NOT EXISTS idx_news_sentiment_article_created
      ON news_sentiment_runs (article_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_news_feedback_article_created
      ON news_feedback (article_id, created_at);
  `);

  ensureColumn(db, "news_articles", "language", "TEXT NOT NULL DEFAULT 'id'");
  ensureColumn(db, "news_articles", "content", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "news_articles", "author", "TEXT");
  ensureColumn(db, "news_articles", "image_url", "TEXT");
  ensureColumn(db, "news_articles", "extraction_status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn(db, "news_articles", "content_quality_score", "REAL NOT NULL DEFAULT 0");
}

type StoredArticleRow = {
  id: string;
  source_id: string;
  source_name: string;
  source_category: string;
  url: string;
  canonical_url: string;
  title: string;
  published_at: string | null;
  ingested_at: string;
  excerpt: string;
  content: string;
  author: string | null;
  image_url: string | null;
  extraction_status: NewsArticle["extractionStatus"];
  content_quality_score: number;
  content_hash: string;
  matched_keywords: string;
  language: string;
  status: "active" | "archived";
  sentiment_id: string | null;
  sentiment_model_name: string | null;
  sentiment_label: NewsSentimentLabel | null;
  sentiment_score: number | null;
  relevance_score: number | null;
  market_scope: NewsSentimentRun["marketScope"] | null;
  reasoning: string | null;
  sentiment_created_at: string | null;
  ticker_text_match_value?: string | null;
};

type StoredMatch = {
  article_id: string;
  match_type: NewsArticleMatch["matchType"];
  match_value: string;
  confidence: number;
};

type StoredFeedbackItemRow = {
  id: string;
  article_id: string;
  sentiment_label: NewsSentimentLabel;
  relevance_score: number;
  note: string;
  previous_sentiment_label: NewsSentimentLabel | null;
  previous_relevance_score: number | null;
  created_at: string;
  title: string;
  source_name: string;
  published_at: string | null;
};

type StoredIngestionRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: NewsIngestionRun["status"];
  total_sources: number;
  success_count: number;
  failed_count: number;
  total_candidates: number;
  matched_count: number;
  inserted_count: number;
  duplicate_count: number;
  filtered_count: number;
  error_json: string;
};

type StoredEnrichmentRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: NewsEnrichmentRun["status"];
  total_articles: number;
  enriched_count: number;
  skipped_count: number;
  failed_count: number;
  error_json: string;
};

type StoredSourceStatus = {
  run_id: string;
  source_id: string;
  source_name: string;
  status: NewsSourceStatus["status"];
  started_at: string;
  finished_at: string | null;
  items_seen: number;
  matched_count: number;
  inserted_count: number;
  duplicate_count: number;
  filtered_count: number;
  error_json: string;
};

type StoredSentimentRow = {
  sentiment_label: NewsSentimentLabel;
  relevance_score: number;
};

function toArticleFilterParams(filters: NewsArticleFilters) {
  const limit = Math.max(1, Math.min(200, filters.limit ?? 50));
  const offset = Math.max(0, Math.min(100_000, filters.offset ?? 0));
  const keyword = filters.keyword?.trim() || null;
  const ticker = normalizeTicker(filters.ticker);
  return {
    sourceId: filters.sourceId?.trim() || null,
    query: `%${filters.query?.trim() ?? ""}%`,
    keyword,
    keywordPattern: keyword ? `%"${keyword}"%` : "%%",
    ticker,
    tickerTokenGlob: ticker ? `*[^A-Z0-9]${ticker}[^A-Z0-9]*` : null,
    sentiment: filters.sentiment ?? null,
    minRelevance: filters.minRelevance ?? null,
    dateFrom: filters.dateFrom ?? null,
    dateTo: filters.dateTo ?? null,
    limit,
    offset,
  };
}

function getMatchesForArticles(db: Database.Database, articleIds: string[]) {
  const matches = new Map<string, NewsArticleMatch[]>();
  if (articleIds.length === 0) {
    return matches;
  }

  const placeholders = articleIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT * FROM news_article_matches
    WHERE article_id IN (${placeholders})
    ORDER BY article_id ASC, match_type ASC, confidence DESC, match_value ASC
  `).all(...articleIds) as StoredMatch[];

  for (const row of rows) {
    const items = matches.get(row.article_id) ?? [];
    items.push({
      articleId: row.article_id,
      matchType: row.match_type,
      matchValue: row.match_value,
      confidence: row.confidence,
    });
    matches.set(row.article_id, items);
  }
  return matches;
}

function toNewsArticle(row: StoredArticleRow, matches: NewsArticleMatch[]): NewsArticle {
  const articleMatches = withTextTickerMatch(row, matches);
  const sentiment: NewsSentimentRun | null = row.sentiment_id && row.sentiment_label && row.sentiment_model_name
    ? {
      id: row.sentiment_id,
      articleId: row.id,
      modelName: row.sentiment_model_name,
      sentimentLabel: row.sentiment_label,
      sentimentScore: row.sentiment_score ?? 0,
      relevanceScore: row.relevance_score ?? 0,
      marketScope: row.market_scope ?? "global",
      reasoning: row.reasoning ?? "",
      createdAt: row.sentiment_created_at ?? "",
    }
    : null;

  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceCategory: row.source_category,
    url: row.url,
    canonicalUrl: row.canonical_url,
    title: row.title,
    publishedAt: row.published_at,
    ingestedAt: row.ingested_at,
    excerpt: row.excerpt,
    content: row.content,
    author: row.author,
    imageUrl: row.image_url,
    extractionStatus: row.extraction_status,
    contentQualityScore: row.content_quality_score,
    contentHash: row.content_hash,
    matchedKeywords: parseJsonArray(row.matched_keywords),
    language: row.language,
    status: row.status,
    matches: articleMatches,
    sentiment,
  };
}

function withTextTickerMatch(row: StoredArticleRow, matches: NewsArticleMatch[]): NewsArticleMatch[] {
  const ticker = row.ticker_text_match_value?.trim();
  if (!ticker) {
    return matches;
  }

  const alreadyMatched = matches.some((match) =>
    (match.matchType === "ticker" || match.matchType === "index")
    && normalizeTicker(match.matchValue) === ticker
  );
  if (alreadyMatched) {
    return matches;
  }

  return [
    ...matches,
    {
      articleId: row.id,
      matchType: "ticker",
      matchValue: ticker,
      confidence: 0.58,
    },
  ];
}

function toNewsIngestionRun(row: StoredIngestionRun): NewsIngestionRun {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    totalSources: row.total_sources,
    successCount: row.success_count,
    failedCount: row.failed_count,
    totalCandidates: row.total_candidates,
    matchedCount: row.matched_count,
    insertedCount: row.inserted_count,
    duplicateCount: row.duplicate_count,
    filteredCount: row.filtered_count,
    error: JSON.parse(row.error_json),
  };
}

function toNewsEnrichmentRun(row: StoredEnrichmentRun): NewsEnrichmentRun {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    totalArticles: row.total_articles,
    enrichedCount: row.enriched_count,
    skippedCount: row.skipped_count,
    failedCount: row.failed_count,
    error: JSON.parse(row.error_json),
  };
}

function toNewsSourceStatus(row: StoredSourceStatus): NewsSourceStatus {
  return {
    runId: row.run_id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    itemsSeen: row.items_seen,
    matchedCount: row.matched_count,
    insertedCount: row.inserted_count,
    duplicateCount: row.duplicate_count,
    filteredCount: row.filtered_count,
    error: JSON.parse(row.error_json),
  };
}

function toNewsFeedbackItem(row: StoredFeedbackItemRow): NewsFeedbackItem {
  return {
    id: row.id,
    articleId: row.article_id,
    sentimentLabel: row.sentiment_label,
    relevanceScore: row.relevance_score,
    note: row.note,
    previousSentimentLabel: row.previous_sentiment_label,
    previousRelevanceScore: row.previous_relevance_score,
    createdAt: row.created_at,
    title: row.title,
    sourceName: row.source_name,
    publishedAt: row.published_at,
  };
}

function getLatestSentimentForArticle(db: Database.Database, articleId: string) {
  return db.prepare(`
    SELECT sentiment_label, relevance_score
    FROM news_sentiment_runs
    WHERE article_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(articleId) as StoredSentimentRow | undefined;
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalizeTicker(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase().replace(/\.JK$/, "");
  if (normalized === "^JKSE") {
    return "IHSG";
  }
  return normalized.replace(/[^A-Z0-9]/g, "") || null;
}

function scoreStoredContentQuality(value: string) {
  const length = value.trim().length;
  if (length >= 1200) {
    return 1;
  }
  if (length >= 600) {
    return 0.82;
  }
  if (length >= 240) {
    return 0.62;
  }
  if (length >= 80) {
    return 0.38;
  }
  return length > 0 ? 0.18 : 0;
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function roundScore(value: number) {
  return Number(value.toFixed(3));
}
