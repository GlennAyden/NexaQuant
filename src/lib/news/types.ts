export type NewsSentimentLabel = "positive" | "negative" | "neutral" | "mixed" | "unknown";

export type NewsMarketScope = "ihsg" | "sector" | "ticker" | "macro" | "global";

export type NewsArticleStatus = "active" | "archived";

export type NewsArticleMatchType = "keyword" | "ticker" | "index" | "macro";

export type NewsSearchMode = "text" | "semantic";

export type NewsArticle = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceCategory: string;
  url: string;
  canonicalUrl: string;
  title: string;
  publishedAt: string | null;
  ingestedAt: string;
  excerpt: string;
  content: string;
  author: string | null;
  imageUrl: string | null;
  extractionStatus: "pending" | "summary-only" | "extracted" | "failed";
  contentQualityScore: number;
  contentHash: string;
  matchedKeywords: string[];
  language: string;
  status: NewsArticleStatus;
  matches: NewsArticleMatch[];
  sentiment: NewsSentimentRun | null;
  searchMode?: NewsSearchMode;
  semanticScore?: number;
  semanticReasons?: string[];
};

export type NewsArticleMatch = {
  articleId: string;
  matchType: NewsArticleMatchType;
  matchValue: string;
  confidence: number;
};

export type NewsSentimentRun = {
  id: string;
  articleId: string;
  modelName: string;
  sentimentLabel: NewsSentimentLabel;
  sentimentScore: number;
  relevanceScore: number;
  marketScope: NewsMarketScope;
  reasoning: string;
  createdAt: string;
};

export type NewsIngestionRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "completed" | "failed";
  totalSources: number;
  successCount: number;
  failedCount: number;
  totalCandidates: number;
  matchedCount: number;
  insertedCount: number;
  duplicateCount: number;
  filteredCount: number;
  error: unknown;
};

export type NewsEnrichmentRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "completed" | "failed";
  totalArticles: number;
  enrichedCount: number;
  skippedCount: number;
  failedCount: number;
  error: unknown;
};

export type NewsSourceStatus = {
  runId: string;
  sourceId: string;
  sourceName: string;
  status: "running" | "success" | "failed";
  startedAt: string;
  finishedAt: string | null;
  itemsSeen: number;
  matchedCount: number;
  insertedCount: number;
  duplicateCount: number;
  filteredCount: number;
  error: unknown;
};

export type NewsIngestionHistoryItem = {
  run: NewsIngestionRun;
  sources: NewsSourceStatus[];
};

export type NewsFeedback = {
  id: string;
  articleId: string;
  sentimentLabel: NewsSentimentLabel;
  relevanceScore: number;
  note: string;
  previousSentimentLabel: NewsSentimentLabel | null;
  previousRelevanceScore: number | null;
  createdAt: string;
};

export type NewsFeedbackItem = NewsFeedback & {
  title: string;
  sourceName: string;
  publishedAt: string | null;
};

export type NewsFeedbackSummary = {
  totalFeedback: number;
  latestFeedbackAt: string | null;
  correctedPositive: number;
  correctedNeutral: number;
  correctedNegative: number;
  averageCorrectedRelevance: number | null;
};

export type NewsArticleFilters = {
  sourceId?: string;
  query?: string;
  keyword?: string;
  ticker?: string;
  sentiment?: NewsSentimentLabel;
  minRelevance?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export type NewsArticleResult = {
  articles: NewsArticle[];
  total: number;
  limit: number;
  offset: number;
};

export type NewsSummary = {
  totalArticles: number;
  classifiedArticles: number;
  unclassifiedArticles: number;
  latestPublishedAt: string | null;
  latestIngestedAt: string | null;
  latestSync: NewsIngestionRun | null;
  sentimentCounts: Record<NewsSentimentLabel, number>;
  dailyTimeline: Array<{
    date: string;
    totalArticles: number;
    classifiedArticles: number;
    sentimentCounts: Record<NewsSentimentLabel, number>;
    averageRelevanceScore: number | null;
    weightedSentimentScore: number | null;
  }>;
  averageSentimentScore: number | null;
  averageRelevanceScore: number | null;
  weightedSentimentScore: number | null;
};
