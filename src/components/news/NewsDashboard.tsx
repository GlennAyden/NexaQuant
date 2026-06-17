"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Brain,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Filter,
  Gauge,
  Loader2,
  Newspaper,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";

import newsSources from "@/lib/news/newsSources.json";
import {
  NEWS_SOURCE_POLICY_ROWS,
  summarizeNewsSourcePolicies,
  type NewsSourcePolicyRow,
} from "@/lib/news/sourcePolicy";

type SentimentLabel = "positive" | "negative" | "neutral" | "mixed" | "unknown";

type NewsArticle = {
  id: string;
  sourceId: string;
  sourceName: string;
  url: string;
  title: string;
  publishedAt: string | null;
  ingestedAt: string;
  excerpt: string;
  content?: string;
  author?: string | null;
  imageUrl?: string | null;
  extractionStatus?: "pending" | "summary-only" | "extracted" | "failed";
  contentQualityScore?: number;
  matchedKeywords: string[];
  searchMode?: "text" | "semantic";
  semanticScore?: number;
  semanticReasons?: string[];
  matches: Array<{
    matchType: string;
    matchValue: string;
    confidence: number;
  }>;
  sentiment: {
    sentimentLabel: SentimentLabel;
    sentimentScore: number;
    relevanceScore: number;
    marketScope: string;
    reasoning: string;
  } | null;
};

type ArticlesResponse = {
  articles: NewsArticle[];
  total: number;
  limit: number;
  offset: number;
};

type SummaryResponse = {
  totalArticles: number;
  classifiedArticles: number;
  unclassifiedArticles: number;
  latestPublishedAt: string | null;
  latestIngestedAt: string | null;
  sentimentCounts: Record<SentimentLabel, number>;
  dailyTimeline: Array<{
    date: string;
    totalArticles: number;
    classifiedArticles: number;
    sentimentCounts: Record<SentimentLabel, number>;
    averageRelevanceScore: number | null;
    weightedSentimentScore: number | null;
  }>;
  averageSentimentScore: number | null;
  averageRelevanceScore: number | null;
  weightedSentimentScore: number | null;
  latestSync: {
    status: string;
    successCount: number;
    failedCount: number;
    matchedCount: number;
    insertedCount: number;
    duplicateCount: number;
    finishedAt: string | null;
  } | null;
};

type SyncRunResponse = {
  id?: string;
  startedAt?: string;
  finishedAt: string | null;
  status: string;
  totalSources?: number;
  successCount: number;
  failedCount: number;
  totalCandidates?: number;
  matchedCount: number;
  insertedCount: number;
  duplicateCount: number;
  filteredCount?: number;
  error?: unknown;
};

type SourceStatusView = {
  sourceId: string;
  sourceName: string;
  status: string;
  startedAt?: string | null;
  itemsSeen: number;
  matchedCount: number;
  insertedCount: number;
  duplicateCount: number;
  filteredCount: number;
  finishedAt: string | null;
  error?: unknown;
};

type SyncResponse = {
  active: boolean;
  run: SyncRunResponse | null;
  sources: SourceStatusView[];
  history?: Array<{
    run: SyncRunResponse;
    sources: SourceStatusView[];
  }>;
};
type SyncHistoryItem = NonNullable<SyncResponse["history"]>[number];

type SourceHealthStatus = "success" | "failed" | "running" | "idle";
type SourceHealthRow = {
  sourceId: string;
  sourceName: string;
  status: SourceHealthStatus;
  accessLabel: string;
  category: string;
  itemsSeen: number;
  matchedCount: number;
  insertedCount: number;
  duplicateCount: number;
  filteredCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorText: string | null;
  policy: NewsSourcePolicyRow;
};
type SourceReliabilityStatus = "stable" | "watch" | "flaky" | "no-data";
type SourceReliabilityRow = {
  sourceId: string;
  sourceName: string;
  status: SourceReliabilityStatus;
  score: number;
  checkedRuns: number;
  totalRuns: number;
  successCount: number;
  failedCount: number;
  runningCount: number;
  itemsSeen: number;
  matchedCount: number;
  coveragePct: number;
  successRatePct: number | null;
  matchRatePct: number | null;
  lastCheckedAt: string | null;
  latestStatus: SourceHealthStatus;
};
type SourceQualityDiagnostic = NewsInsightsResponse["quality"]["sourceDiagnostics"][number];
type SourceQualityScore = NewsInsightsResponse["wild"]["sourceQuality"][number];

type ReadinessStatus = "ready" | "watch" | "blocked";
type ReadinessItem = {
  id: string;
  label: string;
  status: ReadinessStatus;
  metric: string;
  detail: string;
  action: string;
};

type EnrichmentResponse = {
  active: boolean;
  run: {
    status: "running" | "completed" | "failed";
    totalArticles: number;
    enrichedCount: number;
    skippedCount: number;
    failedCount: number;
    finishedAt: string | null;
  } | null;
};

type NewsInsightsResponse = {
  generatedAt: string;
  phases: Array<{
    id: string;
    phase: string;
    title: string;
    status: "live" | "partial" | "needs-data";
    progress: number;
    signal: string;
    evidence: string[];
    nextStep: string;
  }>;
  quality: {
    totalArticles: number;
    classifiedArticles: number;
    pendingClassifications: number;
    contentCoveragePct: number;
    extractionCoveragePct: number;
    emptyExcerptCount: number;
    averageContentQuality: number;
    latestEnrichmentRun: EnrichmentResponse["run"];
    sourceDiagnostics: Array<{
      sourceName: string;
      totalArticles: number;
      emptyExcerptCount: number;
      averageContentQuality: number;
      latestStatus: string;
      duplicateCount: number;
      filteredCount: number;
    }>;
  };
  events: {
    eventCoveragePct: number;
    highMaterialityCount: number;
    eventCounts: Array<{ eventType: string; total: number }>;
    topEvents: Array<{
      articleId: string;
      title: string;
      sourceName: string;
      eventLabel: string;
      materialityScore: number;
      confidenceScore: number;
      tickers: string[];
    }>;
  };
  discovery: {
    topics: Array<{ label: string; total: number }>;
    clusters: Array<{
      key: string;
      label: string;
      total: number;
      sentimentMix: Record<string, number>;
      sampleTitles: string[];
    }>;
    semanticGroups: Array<{
      label: string;
      total: number;
      keywords: string[];
      sampleTitles: string[];
    }>;
  };
  market: {
    linkedTickerCount: number;
    impactSamples: Array<{
      articleId: string;
      title: string;
      ticker: string;
      eventDate: string;
      return3dPct: number | null;
      volumeRatio: number | null;
      evidence: string;
    }>;
  };
  model: {
    modelName: string;
    averageConfidence: number;
    lowConfidenceCount: number;
    feedbackReady: boolean;
    feedbackSummary: {
      totalFeedback: number;
      latestFeedbackAt: string | null;
      correctedPositive: number;
      correctedNeutral: number;
      correctedNegative: number;
      averageCorrectedRelevance: number | null;
    };
    feedbackDiagnostics: {
      sampleSize: number;
      sentimentChangeCount: number;
      disagreementRatePct: number | null;
      averageRelevanceDelta: number | null;
      latestCorrections: Array<{
        articleId: string;
        title: string;
        sourceName: string;
        from: string;
        to: string;
        relevanceDelta: number | null;
        note: string;
      }>;
    };
    evaluationQueueCount: number;
    calibrationNotes: string[];
  };
  wild: {
    marketMemory: {
      examples: Array<{
        articleId: string;
        title: string;
        ticker: string;
        eventLabel: string;
        similarCount: number;
        averageReturn3dPct: number | null;
        winRatePct: number | null;
        averageVolumeRatio: number | null;
        sampleTitles: string[];
        evidence: string;
      }>;
    };
    eventImpactLab: {
      eventStats: Array<{
        eventLabel: string;
        sampleCount: number;
        averageReturn3dPct: number | null;
        winRatePct: number | null;
        averageVolumeRatio: number | null;
        topTickers: string[];
      }>;
    };
    narrativeRadar: {
      alerts: Array<{
        label: string;
        total: number;
        recentCount: number;
        priorCount: number;
        momentumScore: number;
        signal: string;
        sampleTitles: string[];
      }>;
    };
    velocity: {
      last24hCount: number;
      previous24hCount: number;
      accelerationPct: number | null;
      topSources: Array<{ sourceName: string; total: number }>;
    };
    sourceQuality: Array<{
      sourceName: string;
      score: number;
      totalArticles: number;
      classificationCoveragePct: number;
      averageRelevance: number;
      averageContentQuality: number;
      duplicateCount: number;
      warning: string | null;
    }>;
    disclosureRadar: {
      confirmedCount: number;
      needsReviewCount: number;
      openItems: Array<{
        articleId: string;
        title: string;
        ticker: string;
        eventLabel: string;
        severity: "high" | "medium";
        evidence: string;
        officialSourceName: string;
        officialSearchUrl: string;
      }>;
    };
    entityGraph: {
      topHub: string | null;
      nodes: Array<{
        id: string;
        label: string;
        type: "ticker" | "source" | "theme" | "event";
        total: number;
      }>;
      edges: Array<{
        from: string;
        to: string;
        weight: number;
        evidence: string;
      }>;
    };
    activeLearning: {
      total: number;
      queue: Array<{
        articleId: string;
        title: string;
        sourceName: string;
        priority: number;
        reason: string;
      }>;
    };
    dailyBriefing: {
      title: string;
      bullets: string[];
      watchlist: string[];
    };
  };
};

type SyncProgressSummary = {
  runId: string;
  status: "running" | "completed" | "failed";
  totalSources: number;
  completedSources: number;
  successCount: number;
  failedCount: number;
  totalCandidates: number;
  matchedCount: number;
  insertedCount: number;
  duplicateCount: number;
  filteredCount: number;
};

type SyncProgressEvent = {
  type: "run-started" | "source-started" | "page-started" | "page-completed" | "page-failed" | "source-updated" | "source-completed" | "run-completed" | "run-error";
  sourceId?: string;
  sourceName?: string;
  sourceIndex?: number;
  pageNumber?: number;
  pageUrl?: string;
  pageItemCount?: number;
  newItemCount?: number;
  collectedItemCount?: number;
  stopReason?: string;
  error?: string;
  message: string;
  summary?: SyncProgressSummary;
};

type SyncProgressView = {
  active: boolean;
  completed: boolean;
  currentSourceName: string | null;
  currentPageNumber: number | null;
  currentPageUrl: string | null;
  message: string;
  summary: SyncProgressSummary;
  events: string[];
};

type ClassifyProgressSummary = {
  total: number;
  classifiedCount: number;
  skippedCount: number;
  remainingCount: number;
};

type ClassifyProgressEvent = {
  type: "classification-started" | "article-started" | "article-classified" | "classification-completed" | "classification-error";
  articleId?: string;
  title?: string;
  index?: number;
  message: string;
  summary?: ClassifyProgressSummary;
};

type ClassifyProgressView = {
  active: boolean;
  completed: boolean;
  currentTitle: string | null;
  message: string;
  summary: ClassifyProgressSummary;
  events: string[];
};

type EnrichmentProgressSummary = {
  totalArticles: number;
  processedCount: number;
  enrichedCount: number;
  skippedCount: number;
  failedCount: number;
  remainingCount: number;
};

type EnrichmentProgressEvent = {
  type: "enrichment-started" | "article-started" | "article-enriched" | "article-skipped" | "article-failed" | "enrichment-completed" | "enrichment-error";
  articleId?: string;
  title?: string;
  index?: number;
  url?: string;
  extractionStatus?: "summary-only" | "extracted" | "failed";
  contentQualityScore?: number;
  message: string;
  summary?: EnrichmentProgressSummary;
};

type EnrichmentProgressView = {
  active: boolean;
  completed: boolean;
  currentTitle: string | null;
  currentUrl: string | null;
  message: string;
  summary: EnrichmentProgressSummary;
  events: string[];
};

type ClassifyResponse = ClassifyProgressSummary & {
  articles: unknown[];
};

const SENTIMENTS: Array<SentimentLabel | "all"> = ["all", "positive", "negative", "neutral", "mixed", "unknown"];
const DEFAULT_NEWS_DAYS = 7;
const NEWS_DAY_OPTIONS = [1, 3, 7, 14, 30, 90, 180, 365] as const;
const SYNC_DAY_OPTIONS = [1, 3, 7, 14, 30] as const;
const SOURCE_OPTIONS = [
  ["all", "All sources"],
  ...newsSources.map((source) => [source.id, source.name] as const),
] satisfies Array<readonly [string, string]>;
const SYNC_SOURCE_OPTIONS = SOURCE_OPTIONS.filter(([value]) => value !== "all");
const SOURCE_POLICIES = NEWS_SOURCE_POLICY_ROWS;
const SOURCE_POLICY_SUMMARY = summarizeNewsSourcePolicies(SOURCE_POLICIES);

function normalizeInitialQueryMode(value: string): "text" | "semantic" {
  return value.trim().toLowerCase() === "semantic" ? "semantic" : "text";
}

type NewsDashboardProps = {
  initialTicker?: string;
  initialQuery?: string;
  initialTimeframe?: string;
  initialDays?: string;
  initialSentiment?: string;
  initialSourceId?: string;
  initialMinRelevance?: string;
  initialQueryMode?: string;
};

export function NewsDashboard({ initialTicker = "", initialQuery = "", initialTimeframe = "", initialDays = "", initialSentiment = "", initialSourceId = "", initialMinRelevance = "", initialQueryMode = "" }: NewsDashboardProps) {
  const normalizedInitialTicker = initialTicker.trim().toUpperCase();
  const normalizedInitialQuery = initialQuery.trim();
  const normalizedInitialQueryMode = normalizeInitialQueryMode(initialQueryMode);
  const normalizedInitialTimeframe = normalizeChartTimeframe(initialTimeframe);
  const normalizedInitialDays = normalizeNewsDays(initialDays);
  const normalizedInitialSentiment = normalizeInitialSentiment(initialSentiment);
  const normalizedInitialSourceId = normalizeInitialSourceId(initialSourceId);
  const normalizedInitialMinRelevance = normalizeInitialMinRelevance(initialMinRelevance);
  const [articlesResponse, setArticlesResponse] = useState<ArticlesResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [insights, setInsights] = useState<NewsInsightsResponse | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncResponse | null>(null);
  const [enrichmentStatus, setEnrichmentStatus] = useState<EnrichmentResponse | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [query, setQuery] = useState(normalizedInitialQuery);
  const [queryMode, setQueryMode] = useState<"text" | "semantic">(normalizedInitialQueryMode);
  const [ticker, setTicker] = useState(normalizedInitialTicker);
  const [sourceId, setSourceId] = useState(normalizedInitialSourceId);
  const [sentiment, setSentiment] = useState<SentimentLabel | "all">(normalizedInitialSentiment);
  const [minRelevance, setMinRelevance] = useState(normalizedInitialMinRelevance);
  const [days, setDays] = useState(normalizedInitialDays);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncDays, setSyncDays] = useState(getSyncDaysFromNewsWindow(normalizedInitialDays));
  const [syncSources, setSyncSources] = useState<string[]>(() => SYNC_SOURCE_OPTIONS.map(([value]) => value));
  const [syncFormError, setSyncFormError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgressView | null>(null);
  const [classifyProgress, setClassifyProgress] = useState<ClassifyProgressView | null>(null);
  const [enrichmentProgress, setEnrichmentProgress] = useState<EnrichmentProgressView | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const articleParams = new URLSearchParams({
        limit: "100",
        minRelevance: String(minRelevance),
        days: String(days),
      });
      if (query.trim()) {
        articleParams.set("query", query.trim());
        if (queryMode === "semantic") {
          articleParams.set("queryMode", queryMode);
        }
      }
      if (ticker.trim()) {
        articleParams.set("ticker", ticker.trim().toUpperCase());
      }
      if (sourceId !== "all") {
        articleParams.set("sourceId", sourceId);
      }
      if (sentiment !== "all") {
        articleParams.set("sentiment", sentiment);
      }

      const summaryParams = new URLSearchParams({ days: String(days) });
      if (ticker.trim()) {
        summaryParams.set("ticker", ticker.trim().toUpperCase());
      }
      if (sourceId !== "all") {
        summaryParams.set("sourceId", sourceId);
      }

      const [articlesResult, summaryResult, syncResult, insightsResult, enrichmentResult] = await Promise.all([
        fetch(`/api/news/articles?${articleParams.toString()}`),
        fetch(`/api/news/summary?${summaryParams.toString()}`),
        fetch("/api/news/sync"),
        fetch(`/api/news/insights?${summaryParams.toString()}`),
        fetch("/api/news/enrich"),
      ]);

      if (!articlesResult.ok || !summaryResult.ok || !syncResult.ok || !insightsResult.ok || !enrichmentResult.ok) {
        throw new Error("News data request failed");
      }

      setArticlesResponse(await articlesResult.json() as ArticlesResponse);
      setSummary(await summaryResult.json() as SummaryResponse);
      setSyncStatus(await syncResult.json() as SyncResponse);
      setInsights(await insightsResult.json() as NewsInsightsResponse);
      setEnrichmentStatus(await enrichmentResult.json() as EnrichmentResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [
    days,
    minRelevance,
    query,
    queryMode,
    sentiment,
    setArticlesResponse,
    setEnrichmentStatus,
    setError,
    setInsights,
    setLoading,
    setSummary,
    setSyncStatus,
    sourceId,
    ticker,
  ]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  const articles = useMemo(() => articlesResponse?.articles ?? [], [articlesResponse?.articles]);
  const selectedArticle = articles.find((article) => article.id === selectedArticleId) ?? articles[0] ?? null;
  const timeline = useMemo(() => buildTimeline(summary?.dailyTimeline, articles), [summary?.dailyTimeline, articles]);
  const keywordStats = useMemo(() => buildKeywordStats(articles), [articles]);
  const tickerContext = getTickerContext(ticker, selectedArticle);
  const chartContextUrl = chartContextHref(tickerContext, normalizedInitialTimeframe);
  const classifiedCount = summary?.classifiedArticles ?? 0;
  const totalArticles = summary?.totalArticles ?? 0;
  const timelineArticleCount = summary?.totalArticles ?? articles.length;
  const hasActiveFilters = Boolean(query.trim() || ticker.trim() || sourceId !== "all" || sentiment !== "all" || minRelevance > 0 || days !== DEFAULT_NEWS_DAYS);
  const syncSourceCount = syncSources.length;
  const sourceHealthRows = useMemo(
    () => buildSourceHealthRows(SOURCE_POLICIES, syncStatus?.sources ?? []),
    [syncStatus?.sources],
  );
  const sourceReliabilityRows = useMemo(
    () => buildSourceReliabilityRows(SOURCE_POLICIES, syncStatus?.history ?? []),
    [syncStatus?.history],
  );
  const monitoredSourceCount = sourceHealthRows.filter((source) => source.status !== "idle").length;
  const selectedSourceHealth = sourceId === "all"
    ? null
    : sourceHealthRows.find((source) => source.sourceId === sourceId) ?? null;
  const selectedSourcePolicy = selectedSourceHealth?.policy
    ?? (sourceId === "all" ? null : SOURCE_POLICIES.find((policy) => policy.sourceId === sourceId) ?? null);
  const selectedSourceDiagnostics = insights && selectedSourceHealth
    ? getSourceDiagnostics(insights, selectedSourceHealth.sourceName)
    : { diagnostic: null, quality: null };

  async function runSync() {
    if (syncSources.length === 0) {
      setSyncFormError("Pilih minimal satu sumber berita.");
      return;
    }

    setSyncing(true);
    setError(null);
    setSyncFormError(null);
    setSyncProgress(createInitialSyncProgress(syncSourceCount));
    try {
      const response = await fetch("/api/news/sync", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ days: syncDays, limit: 40, sources: syncSources }),
      });
      if (!response.ok) {
        throw new Error(await readSyncErrorMessage(response));
      }
      const fallbackStatus = await readSyncProgressResponse(response, (event) => {
        setSyncProgress((current) => reduceSyncProgress(current, event, syncSourceCount));
      });
      if (fallbackStatus) {
        setSyncStatus(fallbackStatus);
        setSyncProgress((current) => ({
          ...(current ?? createInitialSyncProgress(syncSourceCount)),
          active: false,
          completed: true,
          message: "Sync selesai.",
        }));
      }
      setDays(syncDays);
      await loadData();
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      setError(message);
      setSyncProgress((current) => current ? {
        ...current,
        active: false,
        completed: false,
        message,
      } : null);
    } finally {
      setSyncing(false);
    }
  }

  function openSyncModal() {
    setSyncDays(getSyncDaysFromNewsWindow(days));
    setSyncFormError(null);
    setSyncProgress(null);
    setSyncModalOpen(true);
  }

  function toggleSyncSource(value: string) {
    setSyncSources((current) =>
      current.includes(value)
        ? current.filter((source) => source !== value)
        : [...current, value],
    );
  }

  async function classifyNews() {
    setClassifying(true);
    setError(null);
    setClassifyProgress(createInitialClassifyProgress());
    try {
      const response = await fetch("/api/news/sentiment", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ limit: 5000 }),
      });
      if (!response.ok) {
        throw new Error(await readClassifyErrorMessage(response));
      }
      const fallbackResult = await readClassifyProgressResponse(response, (event) => {
        setClassifyProgress((current) => reduceClassifyProgress(current, event));
      });
      if (fallbackResult) {
        setClassifyProgress((current) => ({
          ...(current ?? createInitialClassifyProgress()),
          active: false,
          completed: true,
          message: `Classify selesai: ${fallbackResult.classifiedCount} berita dianalisis.`,
          summary: {
            total: fallbackResult.total,
            classifiedCount: fallbackResult.classifiedCount,
            skippedCount: fallbackResult.skippedCount ?? 0,
            remainingCount: fallbackResult.remainingCount ?? 0,
          },
        }));
      }
      await loadData();
    } catch (classifyError) {
      const message = classifyError instanceof Error ? classifyError.message : String(classifyError);
      setError(message);
      setClassifyProgress((current) => current ? {
        ...current,
        active: false,
        completed: false,
        message,
      } : null);
    } finally {
      setClassifying(false);
    }
  }

  async function runEnrichment() {
    setEnriching(true);
    setError(null);
    setFeedbackNotice(null);
    setEnrichmentProgress(createInitialEnrichmentProgress());
    try {
      const response = await fetch("/api/news/enrich", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ limit: 50 }),
      });
      if (!response.ok) {
        throw new Error(await readEnrichmentErrorMessage(response));
      }
      const fallbackStatus = await readEnrichmentProgressResponse(response, (event) => {
        setEnrichmentProgress((current) => reduceEnrichmentProgress(current, event));
      });
      if (fallbackStatus) {
        setEnrichmentStatus(fallbackStatus);
        setEnrichmentProgress((current) => ({
          ...(current ?? createInitialEnrichmentProgress()),
          active: false,
          completed: true,
          message: "Enrichment selesai.",
        }));
      }
      await loadData();
    } catch (enrichmentError) {
      const message = enrichmentError instanceof Error ? enrichmentError.message : String(enrichmentError);
      setError(message);
      setEnrichmentProgress((current) => current ? {
        ...current,
        active: false,
        completed: false,
        message,
      } : null);
    } finally {
      setEnriching(false);
    }
  }

  async function submitFeedback(input: { articleId: string; sentimentLabel: SentimentLabel; relevanceScore: number; note: string }) {
    setFeedbackSaving(true);
    setFeedbackNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/news/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(await readFeedbackErrorMessage(response));
      }
      setFeedbackNotice("Feedback tersimpan dan sentiment artikel diperbarui.");
      await loadData();
    } catch (feedbackError) {
      setError(feedbackError instanceof Error ? feedbackError.message : String(feedbackError));
    } finally {
      setFeedbackSaving(false);
    }
  }

  function clearFilters() {
    setQuery("");
    setQueryMode("text");
    setTicker("");
    setSourceId("all");
    setSentiment("all");
    setMinRelevance(0);
    setDays(DEFAULT_NEWS_DAYS);
    setSelectedArticleId(null);
  }

  function searchNarrative(label: string) {
    setQuery(label);
    setQueryMode("semantic");
    setSelectedArticleId(null);
  }

  function focusTickerFilter(value: string) {
    setTicker(value.trim().toUpperCase());
    setSelectedArticleId(null);
  }

  return (
    <main className="min-h-screen bg-[#f5f7fa] text-slate-900">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={chartContextUrl} className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-950">
              <ArrowLeft className="h-4 w-4" />
              Structure Screener
            </Link>
            <div className="min-w-0 sm:border-l sm:border-slate-200 sm:pl-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-normal text-slate-950 lg:text-[28px]">NexaQuant News Sentiment</h1>
                {tickerContext !== "ALL" ? (
                  <span className="inline-flex h-8 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700">
                    {tickerContext}
                    <button
                      type="button"
                      aria-label="Clear ticker context"
                      onClick={() => setTicker("")}
                      className="rounded text-blue-500 hover:text-blue-800"
                    >
                      x
                    </button>
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-slate-600">IDX evidence console for ticker context, article relevance, and inspectable sentiment.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              label="Refresh"
              title="Refresh"
              icon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              onClick={() => void loadData()}
              disabled={loading}
              tone="light"
            />
            <ActionButton
              label="Sync"
              title="Sync news"
              icon={syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              onClick={openSyncModal}
              disabled={syncing || loading}
              tone="dark"
            />
            <ActionButton
              label={classifying ? "Classifying" : "Classify"}
              title="Classify sentiment"
              icon={classifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              onClick={() => void classifyNews()}
              disabled={classifying || loading}
              tone="green"
            />
            <ActionButton
              label={enriching ? "Enriching" : "Enrich"}
              title="Enrich article content"
              icon={enriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Newspaper className="h-4 w-4" />}
              onClick={() => void runEnrichment()}
              disabled={enriching || loading}
              tone="blue"
            />
          </div>
        </header>

        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : null}

        {feedbackNotice ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {feedbackNotice}
          </div>
        ) : null}

        {classifyProgress ? (
          <ClassifyProgressPanel progress={classifyProgress} onClose={() => setClassifyProgress(null)} />
        ) : null}

        {enrichmentProgress ? (
          <EnrichmentProgressPanel progress={enrichmentProgress} onClose={() => setEnrichmentProgress(null)} />
        ) : null}

        {insights ? (
          <PhaseImplementationPanel insights={insights} />
        ) : null}

        {insights ? (
          <NewsReadinessPanel
            insights={insights}
            sourceHealthRows={sourceHealthRows}
            summary={summary}
          />
        ) : null}

        {insights ? (
          <EvidenceActionQueue
            articles={articles}
            insights={insights}
            sourceReliabilityRows={sourceReliabilityRows}
            onFocusTicker={focusTickerFilter}
            onSearchNarrative={searchNarrative}
            onSelectArticle={setSelectedArticleId}
            onSelectSource={setSourceId}
          />
        ) : null}

        {insights ? (
          <MaterialEventRadar
            insights={insights}
            onFocusTicker={focusTickerFilter}
            onSearchEvent={searchNarrative}
          />
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_340px]">
          <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
            <section className="rounded-md border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-normal text-slate-600">Ticker Context</h2>
                  <Star className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-3">
                  <div className="text-3xl font-bold tracking-normal text-blue-700">{tickerContext}</div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {tickerContext === "ALL" ? "Market-wide evidence" : "Focused ticker evidence"}
                  </p>
                </div>
              </div>

              <div className="space-y-4 px-4 py-4">
                <MetricBlock label={`Articles (${days}D)`} value={totalArticles} detail={`${classifiedCount} classified`} />
                <MetricBlock label="Weighted Tone" value={formatScore(summary?.weightedSentimentScore)} detail="relevance adjusted" accent={getToneAccent(summary?.weightedSentimentScore)} />
                <MetricBlock label="Avg Relevance" value={formatScore(summary?.averageRelevanceScore)} detail={`Latest sync: ${formatDateTime(summary?.latestSync?.finishedAt)}`} />
                <MetricBlock
                  label="Content Enrich"
                  value={enrichmentStatus?.run?.enrichedCount ?? 0}
                  detail={`Latest: ${formatDateTime(enrichmentStatus?.run?.finishedAt)}`}
                />
                <ToneMiniBars counts={summary?.sentimentCounts} />
              </div>
            </section>

            <section className="rounded-md border border-slate-200 bg-white shadow-sm">
              <PanelHeader title="Top Matched Keywords" icon={<Gauge className="h-4 w-4" />} />
              <div className="flex flex-wrap gap-2 px-4 pb-4">
                {keywordStats.length > 0 ? keywordStats.slice(0, 8).map((keyword) => (
                  <span key={keyword.label} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                    {keyword.label}
                    <span className="text-slate-400">{keyword.count}</span>
                  </span>
                )) : (
                  <p className="text-sm text-slate-500">No matched keywords in the visible article set.</p>
                )}
              </div>
            </section>

            <section className="rounded-md border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs font-bold uppercase tracking-normal text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  News Sources
                </span>
                <span className="text-[11px] font-semibold normal-case text-slate-500">{monitoredSourceCount}/{sourceHealthRows.length} checked</span>
              </div>
              <div className="space-y-1 px-2 pb-3">
                <button
                  type="button"
                  onClick={() => setSourceId("all")}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs font-semibold ${sourceId === "all" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  All sources
                  <span>{syncStatus?.active ? "running" : "idle"}</span>
                </button>
                {sourceHealthRows.map((source) => (
                  <button
                    key={source.sourceId}
                    type="button"
                    aria-label={`Filter source ${source.sourceName}`}
                    onClick={() => setSourceId(source.sourceId)}
                    className={`grid w-full grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-2 text-left ${sourceId === source.sourceId ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-slate-700">{source.sourceName}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {source.category} - {source.accessLabel} - {source.itemsSeen} seen / {source.matchedCount} matched
                      </span>
                      <span className="block truncate text-[10px] font-medium text-slate-400">
                        {source.finishedAt ? `last ${formatShortDate(source.finishedAt)}` : "not checked in latest run"}
                      </span>
                      {source.errorText ? (
                        <span className="block truncate text-[10px] font-semibold text-rose-600">{source.errorText}</span>
                      ) : null}
                    </span>
                    <SourceHealthBadge status={source.status} />
                  </button>
                ))}
                {sourceHealthRows.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">No sources are catalogued yet</div>
                ) : null}
              </div>
            </section>

            <SourceReliabilityPanel
              rows={sourceReliabilityRows}
              selectedSourceId={sourceId}
              onSelectSource={setSourceId}
            />

            <SourcePolicyPanel
              selectedPolicy={selectedSourcePolicy}
              selectedHealth={selectedSourceHealth}
              sourceDiagnostic={selectedSourceDiagnostics.diagnostic}
              sourceQuality={selectedSourceDiagnostics.quality}
              summary={SOURCE_POLICY_SUMMARY}
            />

            <SyncHistoryPanel
              history={syncStatus?.history ?? []}
              selectedSourceId={sourceId}
            />
          </aside>

          <section className="min-w-0 space-y-3">
            <section className="rounded-md border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-slate-700">
                    <Filter className="h-4 w-4" />
                    Filters
                  </h2>
                  <span className="text-sm font-medium text-slate-500">{articlesResponse?.total ?? 0} matched</span>
                </div>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Clear all
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 px-4 py-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.15fr)_160px_0.7fr_0.9fr]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Search news"
                    placeholder={queryMode === "semantic" ? "Semantic search" : "Search title, excerpt, source"}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500"
                  />
                </label>
                <div className="grid h-10 min-w-[160px] grid-cols-2 rounded-md border border-slate-300 bg-white p-1" aria-label="Search mode">
                  {(["text", "semantic"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setQueryMode(mode)}
                      aria-pressed={queryMode === mode}
                      className={`whitespace-nowrap rounded px-2 text-xs font-bold capitalize ${queryMode === mode ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <input
                  value={ticker}
                  onChange={(event) => setTicker(event.target.value.toUpperCase())}
                  placeholder="Ticker"
                  aria-label="Ticker filter"
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold uppercase outline-none focus:border-blue-500"
                />
                <select
                  aria-label="Source filter"
                  value={sourceId}
                  onChange={(event) => setSourceId(event.target.value)}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  {SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select
                  aria-label="Sentiment filter"
                  value={sentiment}
                  onChange={(event) => setSentiment(event.target.value as SentimentLabel | "all")}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm capitalize"
                >
                  {SENTIMENTS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select
                  aria-label="News days filter"
                  value={days}
                  onChange={(event) => setDays(normalizeNewsDays(event.target.value))}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  {NEWS_DAY_OPTIONS.map((value) => <option key={value} value={value}>{value} days</option>)}
                </select>
                <label className="flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm text-slate-700">
                  <span className="whitespace-nowrap font-semibold">Rel {minRelevance.toFixed(1)}</span>
                  <input
                    type="range"
                    aria-label="Minimum relevance filter"
                    min={0}
                    max={1}
                    step={0.1}
                    value={minRelevance}
                    onChange={(event) => setMinRelevance(Number(event.target.value))}
                    className="w-full accent-blue-600"
                  />
                </label>
              </div>

              {hasActiveFilters ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 text-xs font-medium text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                    Filters active{ticker.trim() ? `: ticker ${ticker.trim().toUpperCase()}` : ""}
                  </span>
                  {query.trim() ? <span className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">query {query.trim()}</span> : null}
                  {query.trim() && queryMode === "semantic" ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">semantic search</span> : null}
                  {sourceId !== "all" ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">source {getSourceLabel(sourceId)}</span> : null}
                  {sentiment !== "all" ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">sentiment {sentiment}</span> : null}
                  {minRelevance > 0 ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">relevance &gt;= {minRelevance.toFixed(1)}</span> : null}
                  {days !== DEFAULT_NEWS_DAYS ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">window {days} days</span> : null}
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Clear filters
                  </button>
                </div>
              ) : null}
            </section>

            {insights ? (
              <NewsIntelligenceCockpit insights={insights} />
            ) : null}

            {insights ? (
              <WildIntelligenceLab insights={insights} />
            ) : null}

            {insights ? (
              <WildInsightDrilldown
                articles={articles}
                insights={insights}
                onFocusTicker={focusTickerFilter}
                onSearchNarrative={searchNarrative}
                onSelectArticle={setSelectedArticleId}
              />
            ) : null}

            <section className="rounded-md border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-4 p-4 lg:grid-cols-[1fr_150px]">
                <div className="min-w-0">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-slate-700">
                      <BarChart3 className="h-4 w-4" />
                      Sentiment Timeline ({days}D)
                    </h2>
                    <span className="text-xs font-semibold text-slate-500">
                      {formatNumber(timelineArticleCount)} matched articles{articles.length !== timelineArticleCount ? `, ${formatNumber(articles.length)} visible` : ""}
                    </span>
                  </div>
                  <TimelineChart timeline={timeline} />
                </div>
                <TimelineSummary summary={summary} days={days} />
              </div>
            </section>

            <section className="flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-normal text-slate-500">
                <span>Article</span>
                <span className="hidden w-24 text-center md:block">Sentiment</span>
                <span className="hidden w-24 text-center md:block">Relevance</span>
                <span className="w-16 text-right">Time</span>
              </div>

              <div
                aria-label="Article list"
                className="news-article-scroll divide-y divide-slate-100 overflow-y-auto overscroll-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                role="region"
                tabIndex={0}
              >
                {articles.map((article) => (
                  <ArticleStreamRow
                    key={article.id}
                    article={article}
                    selected={selectedArticle?.id === article.id}
                    onSelect={() => setSelectedArticleId(article.id)}
                  />
                ))}
              </div>

              {!loading && articles.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">
                  <Newspaper className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <div>No articles match the current filters</div>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Clear filters and show all news
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>Showing {articles.length} of {articlesResponse?.total ?? 0} articles</span>
                <span>{loading ? "Loading evidence..." : "Sorted by latest captured evidence"}</span>
              </div>
            </section>
          </section>

          <EvidenceInspector
            article={selectedArticle}
            chartContextTimeframe={normalizedInitialTimeframe}
            tickerContext={tickerContext}
            onSubmitFeedback={(input) => void submitFeedback(input)}
            savingFeedback={feedbackSaving}
          />
        </div>
      </div>

      {syncModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="news-sync-title"
            className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-md bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="news-sync-title" className="text-base font-bold text-slate-950">Sync Berita</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">{syncSourceCount} sumber dipilih</p>
              </div>
              <button
                type="button"
                aria-label="Close sync modal"
                onClick={() => setSyncModalOpen(false)}
                disabled={syncing}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 px-5 py-5">
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-normal text-slate-500">Rentang berita</span>
                <select
                  aria-label="Rentang berita"
                  value={syncDays}
                  onChange={(event) => setSyncDays(Number(event.target.value))}
                  disabled={syncing}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 disabled:opacity-60"
                >
                  {SYNC_DAY_OPTIONS.map((value) => <option key={value} value={value}>{value} hari terakhir</option>)}
                </select>
              </label>

              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-normal text-slate-500">Sumber berita</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSyncSources(SYNC_SOURCE_OPTIONS.map(([value]) => value))}
                      disabled={syncing}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setSyncSources([])}
                      disabled={syncing}
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Kosongkan
                    </button>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200">
                  {SYNC_SOURCE_OPTIONS.map(([value, label]) => {
                    const policy = getSourcePolicy(value);
                    return (
                    <label
                      key={value}
                      className="flex min-h-14 items-start gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={syncSources.includes(value)}
                        onChange={() => toggleSyncSource(value)}
                        disabled={syncing}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-950 disabled:opacity-60"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-700">{label}</span>
                        <span aria-hidden="true" className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">
                          {policy.accessLabel} - original link retained - public review required
                        </span>
                      </span>
                    </label>
                    );
                  })}
                </div>
              </section>

              {syncProgress ? (
                <SyncProgressPanel progress={syncProgress} />
              ) : null}

              {syncFormError ? (
                <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  {syncFormError}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSyncModalOpen(false)}
                disabled={syncing}
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {syncProgress?.completed ? "Tutup" : "Batal"}
              </button>
              <button
                type="button"
                onClick={() => void runSync()}
                disabled={syncing || syncSourceCount === 0}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-950 bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                {syncing ? "Sync berjalan" : "Mulai sync"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function ActionButton({
  label,
  title,
  icon,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  title: string;
  icon: ReactNode;
  onClick(): void;
  disabled?: boolean;
  tone: "light" | "dark" | "green" | "blue";
}) {
  const classes = tone === "dark"
    ? "border-slate-950 bg-slate-950 text-white hover:bg-slate-800"
    : tone === "green"
      ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-600"
      : tone === "blue"
        ? "border-blue-700 bg-blue-700 text-white hover:bg-blue-600"
        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold shadow-sm disabled:opacity-60 ${classes}`}
    >
      {icon}
      {label}
    </button>
  );
}

function PanelHeader({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-normal text-slate-600">
      {icon}
      {title}
    </div>
  );
}

function SourcePolicyPanel({
  selectedPolicy,
  selectedHealth,
  sourceDiagnostic,
  sourceQuality,
  summary,
}: {
  selectedPolicy: NewsSourcePolicyRow | null;
  selectedHealth: SourceHealthRow | null;
  sourceDiagnostic: SourceQualityDiagnostic | null;
  sourceQuality: SourceQualityScore | null;
  summary: ReturnType<typeof summarizeNewsSourcePolicies>;
}) {
  const activePolicy = selectedPolicy ?? null;

  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <PanelHeader title="Open Source Guardrails" icon={<ShieldCheck className="h-4 w-4" />} />
      <div className="space-y-3 px-4 pb-4 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <PolicyMetric label="Sources" value={summary.totalSources} />
          <PolicyMetric label="Review" value={`${summary.reviewRequiredCount}/${summary.totalSources}`} />
        </div>
        {activePolicy ? (
          <SourceInspectorDetail
            policy={activePolicy}
            health={selectedHealth}
            diagnostic={sourceDiagnostic}
            quality={sourceQuality}
          />
        ) : (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="font-bold text-slate-800">All source policy</div>
            <div className="mt-1 font-semibold text-slate-500">
              {summary.rssSources} RSS, {summary.publicPageSources} public pages, {summary.officialDisclosureSources} official disclosure
            </div>
            <div className="mt-2 font-medium leading-5 text-slate-600">
              Select a source from the health matrix to inspect its latest run, parser quality, and compliance note.
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <PolicyCheck label="Source attribution retained" ok={summary.attributionRequiredCount === summary.totalSources} />
          <PolicyCheck label="Original links required" ok={summary.originalLinkRequiredCount === summary.totalSources} />
          <PolicyCheck label="No full article republication" ok />
          <PolicyCheck label="Terms/robots review before public deployment" ok={summary.reviewRequiredCount === summary.totalSources} />
        </div>
      </div>
    </section>
  );
}

function SourceInspectorDetail({
  policy,
  health,
  diagnostic,
  quality,
}: {
  policy: NewsSourcePolicyRow;
  health: SourceHealthRow | null;
  diagnostic: SourceQualityDiagnostic | null;
  quality: SourceQualityScore | null;
}) {
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-bold text-slate-800">{policy.sourceName}</div>
            <div className="mt-1 font-semibold text-slate-500">{policy.accessLabel} - {policy.category}</div>
          </div>
          <SourceHealthBadge status={health?.status ?? "idle"} />
        </div>
        <div className="mt-2 line-clamp-2 font-medium leading-5 text-slate-600">{policy.complianceNote}</div>
      </div>

      <div className="rounded-md border border-slate-200 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-normal text-slate-500">Source run</div>
        <div className="mt-1 font-bold text-slate-800">
          {health ? `${formatNumber(health.itemsSeen)} seen / ${formatNumber(health.matchedCount)} matched` : "Not checked in latest run"}
        </div>
        <div className="mt-1 font-medium leading-5 text-slate-500">
          {health
            ? `${formatNumber(health.insertedCount)} new, ${formatNumber(health.duplicateCount)} duplicates, ${formatNumber(health.filteredCount)} filtered`
            : "Run sync with this source selected to capture source-level counters."}
        </div>
        <div className="mt-1 font-medium text-slate-400">
          Last finished: {formatDateTime(health?.finishedAt)}
        </div>
        {health?.errorText ? (
          <div className="mt-2 rounded-md border border-rose-100 bg-rose-50 px-2 py-1 font-semibold text-rose-700">{health.errorText}</div>
        ) : null}
      </div>

      <div className="rounded-md border border-slate-200 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-normal text-slate-500">Quality diagnostics</div>
        <div className="mt-1 font-bold text-slate-800">
          {diagnostic ? `${formatNumber(diagnostic.totalArticles)} articles / ${formatNumber(diagnostic.emptyExcerptCount)} empty` : "No article diagnostics yet"}
        </div>
        <div className="mt-1 font-medium leading-5 text-slate-500">
          {diagnostic ? `avg quality ${formatScore(diagnostic.averageContentQuality)}, latest ${diagnostic.latestStatus}` : "Sync and enrich this source to build quality diagnostics."}
        </div>
        <div className="mt-1 font-medium leading-5 text-slate-500">
          {quality ? `score ${Math.round(quality.score * 100)}%, classification ${Math.round(quality.classificationCoveragePct)}%, relevance ${formatScore(quality.averageRelevance)}` : "No source score yet"}
        </div>
        {quality?.warning ? (
          <div className="mt-2 rounded-md border border-amber-100 bg-amber-50 px-2 py-1 font-semibold text-amber-700">{quality.warning}</div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {policy.operationalGuardrails.slice(0, 4).map((item) => (
          <span key={item} className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">{item}</span>
        ))}
      </div>
    </div>
  );
}

function SourceReliabilityPanel({
  rows,
  selectedSourceId,
  onSelectSource,
}: {
  rows: SourceReliabilityRow[];
  selectedSourceId: string;
  onSelectSource(sourceId: string): void;
}) {
  const scoredCount = rows.filter((row) => row.status !== "no-data").length;
  const problemCount = rows.filter((row) => row.status === "flaky" || row.status === "watch").length;

  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs font-bold uppercase tracking-normal text-slate-600">
        <span className="inline-flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Source Reliability
        </span>
        <span className="text-[11px] font-semibold normal-case text-slate-500">{scoredCount}/{rows.length} scored</span>
      </div>
      <div className="max-h-80 space-y-1 overflow-y-auto px-2 pb-3">
        {rows.length > 0 ? rows.map((row) => (
          <button
            key={row.sourceId}
            type="button"
            aria-label={`Inspect source reliability ${row.sourceName}`}
            onClick={() => onSelectSource(row.sourceId)}
            className={`grid w-full grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-2 text-left ${selectedSourceId === row.sourceId ? "bg-blue-50" : "hover:bg-slate-50"}`}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-slate-700">{row.sourceName}</span>
              <span className="block truncate text-[11px] text-slate-500">
                {formatNumber(row.checkedRuns)}/{formatNumber(row.totalRuns)} checked - {formatPercentValue(row.successRatePct)} success
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200">
                <span className={`block h-1.5 rounded-full ${getReliabilityBarClass(row.status)}`} style={{ width: `${Math.max(4, row.score)}%` }} />
              </span>
              <span className="mt-1 block truncate text-[10px] font-medium text-slate-400">
                {row.matchRatePct === null ? "no match rate yet" : `${formatPercentValue(row.matchRatePct)} match rate`} - last {formatDateTime(row.lastCheckedAt)}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-sm font-bold text-slate-800">{Math.round(row.score)}%</span>
              <SourceReliabilityBadge status={row.status} />
            </span>
          </button>
        )) : (
          <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
            No source reliability data yet.
          </div>
        )}
      </div>
      {rows.length > 0 ? (
        <div className="border-t border-slate-100 px-4 py-3 text-[11px] font-semibold text-slate-500">
          {problemCount > 0 ? `${problemCount} sources need attention across recent syncs.` : "No recurring source reliability issue detected."}
        </div>
      ) : null}
    </section>
  );
}

function SourceReliabilityBadge({ status }: { status: SourceReliabilityStatus }) {
  const classes: Record<SourceReliabilityStatus, string> = {
    stable: "border-emerald-200 bg-emerald-50 text-emerald-700",
    watch: "border-amber-200 bg-amber-50 text-amber-700",
    flaky: "border-rose-200 bg-rose-50 text-rose-700",
    "no-data": "border-slate-200 bg-slate-50 text-slate-500",
  };

  return <span className={`inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-bold capitalize ${classes[status]}`}>{formatReliabilityStatus(status)}</span>;
}

function SyncHistoryPanel({
  history,
  selectedSourceId,
}: {
  history: NonNullable<SyncResponse["history"]>;
  selectedSourceId: string;
}) {
  const scopedSourceLabel = selectedSourceId === "all" ? null : getSourceLabel(selectedSourceId);

  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs font-bold uppercase tracking-normal text-slate-600">
        <span className="inline-flex items-center gap-2">
          <Clock3 className="h-4 w-4" />
          Sync History
        </span>
        <span className="text-[11px] font-semibold normal-case text-slate-500">{history.length} runs</span>
      </div>
      <div className="space-y-2 px-3 pb-4">
        {scopedSourceLabel ? (
          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            Source filter: {scopedSourceLabel}
          </div>
        ) : null}

        {history.length > 0 ? history.slice(0, 6).map((item) => {
          const sourceStatus = selectedSourceId === "all"
            ? null
            : item.sources.find((source) => source.sourceId === selectedSourceId) ?? null;
          const failedSources = item.sources.filter((source) => source.status === "failed");
          return (
            <article key={item.run.id ?? `${item.run.startedAt}-${item.run.finishedAt}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-slate-800">{formatDateTime(item.run.finishedAt ?? item.run.startedAt)}</div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">
                    {formatNumber(item.run.matchedCount)} matched / {formatNumber(item.run.insertedCount)} new
                  </div>
                </div>
                <RunStatusBadge status={item.run.status} />
              </div>

              <div className="mt-2 text-[11px] font-medium leading-4 text-slate-600">
                {sourceStatus ? (
                  <span>
                    {sourceStatus.sourceName}: {formatSourceHealthStatus(normalizeSourceHealthStatus(sourceStatus.status))} - {formatNumber(sourceStatus.itemsSeen)} seen / {formatNumber(sourceStatus.matchedCount)} matched
                  </span>
                ) : selectedSourceId === "all" ? (
                  <span>
                    {formatNumber(item.run.successCount)}/{formatNumber(item.run.totalSources ?? item.sources.length)} sources ok, {formatNumber(item.run.failedCount)} failed, {formatNumber(item.run.duplicateCount)} duplicate
                  </span>
                ) : (
                  <span>Source was not selected in this run.</span>
                )}
              </div>

              {failedSources.length > 0 ? (
                <div className="mt-2 line-clamp-2 text-[10px] font-semibold text-rose-700">
                  Failed: {failedSources.slice(0, 3).map((source) => source.sourceName).join(", ")}
                </div>
              ) : null}
            </article>
          );
        }) : (
          <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
            No sync history yet.
          </div>
        )}
      </div>
    </section>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const classes = normalized === "completed"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : normalized === "failed"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-blue-200 bg-blue-50 text-blue-700";

  return <span className={`inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-[10px] font-bold capitalize ${classes}`}>{normalized}</span>;
}

function PolicyMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
      <div className="text-[10px] font-bold uppercase tracking-normal text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-950">{value}</div>
    </div>
  );
}

function PolicyCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold text-slate-600">{label}</span>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertCircle className="h-3.5 w-3.5 text-amber-600" />}
    </div>
  );
}

function NewsReadinessPanel({
  insights,
  sourceHealthRows,
  summary,
}: {
  insights: NewsInsightsResponse;
  sourceHealthRows: SourceHealthRow[];
  summary: SummaryResponse | null;
}) {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const items = buildNewsReadinessItems(summary, insights, sourceHealthRows);
  const score = getReadinessScore(items);
  const status = getOverallReadinessStatus(score, items);
  const readyCount = items.filter((item) => item.status === "ready").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const scorePct = Math.round(score * 100);

  async function copyResearchBrief() {
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard is not available");
      }
      await navigator.clipboard.writeText(buildNewsResearchBrief(summary, insights, sourceHealthRows));
      setCopyNotice("Brief copied.");
    } catch (copyError) {
      setCopyNotice(copyError instanceof Error ? copyError.message : "Brief copy failed.");
    }
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-slate-700">
            <Gauge className="h-4 w-4" />
            Research Readiness
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className={`text-3xl font-bold tracking-normal ${getReadinessTextClass(status)}`}>{scorePct}%</div>
            <ReadinessPill status={status} label={getReadinessLabel(status)} />
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="News research readiness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={scorePct}>
            <div className={`h-2 rounded-full ${getReadinessBarClass(status)}`} style={{ width: `${Math.max(4, scorePct)}%` }} />
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            {readyCount}/{items.length} gates ready, {blockedCount} blocked.
          </p>
          <button
            type="button"
            onClick={() => void copyResearchBrief()}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy brief
          </button>
          {copyNotice ? <p className="mt-2 text-xs font-semibold text-slate-500">{copyNotice}</p> : null}
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <ReadinessGate key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function EvidenceActionQueue({
  articles,
  insights,
  sourceReliabilityRows,
  onFocusTicker,
  onSearchNarrative,
  onSelectArticle,
  onSelectSource,
}: {
  articles: NewsArticle[];
  insights: NewsInsightsResponse;
  sourceReliabilityRows: SourceReliabilityRow[];
  onFocusTicker(ticker: string): void;
  onSearchNarrative(label: string): void;
  onSelectArticle(articleId: string): void;
  onSelectSource(sourceId: string): void;
}) {
  const visibleArticleIds = new Set(articles.map((article) => article.id));
  const sourceAction = sourceReliabilityRows.find((row) => row.status === "flaky" || row.status === "watch") ?? null;
  const disclosureAction = insights.wild.disclosureRadar.openItems[0] ?? null;
  const reviewAction = insights.wild.activeLearning.queue[0] ?? null;
  const narrativeAction = insights.wild.narrativeRadar.alerts[0] ?? null;
  const actionCount = [sourceAction, disclosureAction, reviewAction, narrativeAction].filter(Boolean).length;

  if (actionCount === 0) {
    return (
      <section className="rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-slate-700">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Evidence Action Queue
          </h2>
          <span className="text-xs font-semibold text-emerald-700">clear</span>
        </div>
        <div className="border-t border-slate-100 px-4 py-4 text-sm font-medium text-slate-500">
          No priority evidence action in the current view.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-slate-700">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          Evidence Action Queue
        </h2>
        <span className="text-xs font-semibold text-slate-500">{actionCount} actions</span>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        {sourceAction ? (
          <EvidenceActionCard
            title={sourceAction.status === "flaky" ? "Inspect flaky source" : "Inspect watched source"}
            detail={`${sourceAction.sourceName}: ${formatReliabilityStatus(sourceAction.status)}, score ${Math.round(sourceAction.score)}%`}
            meta={`${formatNumber(sourceAction.checkedRuns)}/${formatNumber(sourceAction.totalRuns)} checked runs`}
            tone={sourceAction.status === "flaky" ? "rose" : "amber"}
            buttonLabel="Inspect source"
            buttonAriaLabel={`Inspect action source ${sourceAction.sourceName}`}
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            onClick={() => onSelectSource(sourceAction.sourceId)}
          />
        ) : null}

        {disclosureAction ? (
          <EvidenceActionCard
            title="Review disclosure gap"
            detail={`${disclosureAction.ticker} ${disclosureAction.eventLabel}: ${disclosureAction.severity} official-source gap`}
            meta={disclosureAction.officialSourceName}
            tone={disclosureAction.severity === "high" ? "rose" : "amber"}
            buttonLabel="Focus ticker"
            buttonAriaLabel={`Focus action ticker ${disclosureAction.ticker}`}
            icon={<Gauge className="h-3.5 w-3.5" />}
            onClick={() => onFocusTicker(disclosureAction.ticker)}
          />
        ) : null}

        {reviewAction ? (
          <EvidenceActionCard
            title="Review calibration item"
            detail={`${reviewAction.sourceName}: ${reviewAction.reason}`}
            meta={visibleArticleIds.has(reviewAction.articleId) ? "visible in current article list" : "search article title to review"}
            tone="blue"
            buttonLabel={visibleArticleIds.has(reviewAction.articleId) ? "Review article" : "Search article"}
            buttonAriaLabel={`Review action article ${reviewAction.title}`}
            icon={<Brain className="h-3.5 w-3.5" />}
            onClick={() => {
              if (visibleArticleIds.has(reviewAction.articleId)) {
                onSelectArticle(reviewAction.articleId);
                return;
              }
              onSearchNarrative(reviewAction.title);
            }}
          />
        ) : null}

        {narrativeAction ? (
          <EvidenceActionCard
            title="Search top narrative"
            detail={`${narrativeAction.label}: ${narrativeAction.signal}, momentum ${formatScore(narrativeAction.momentumScore)}`}
            meta={`${formatNumber(narrativeAction.recentCount)} recent / ${formatNumber(narrativeAction.total)} total`}
            tone="slate"
            buttonLabel="Search narrative"
            buttonAriaLabel={`Search action narrative ${narrativeAction.label}`}
            icon={<Search className="h-3.5 w-3.5" />}
            onClick={() => onSearchNarrative(narrativeAction.label)}
          />
        ) : null}
      </div>
    </section>
  );
}

function EvidenceActionCard({
  title,
  detail,
  meta,
  tone,
  buttonLabel,
  buttonAriaLabel,
  icon,
  onClick,
}: {
  title: string;
  detail: string;
  meta: string;
  tone: "amber" | "blue" | "rose" | "slate";
  buttonLabel: string;
  buttonAriaLabel: string;
  icon: ReactNode;
  onClick(): void;
}) {
  return (
    <article className={`min-w-0 rounded-md border px-3 py-3 ${getEvidenceActionToneClass(tone)}`}>
      <div className="text-[11px] font-bold uppercase tracking-normal text-slate-500">{title}</div>
      <p className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-slate-900">{detail}</p>
      <p className="mt-2 line-clamp-1 text-[11px] font-semibold text-slate-500">{meta}</p>
      <button
        type="button"
        aria-label={buttonAriaLabel}
        onClick={onClick}
        className="mt-3 inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
      >
        {icon}
        {buttonLabel}
      </button>
    </article>
  );
}

function getEvidenceActionToneClass(tone: "amber" | "blue" | "rose" | "slate") {
  const classes = {
    amber: "border-amber-200 bg-amber-50",
    blue: "border-blue-200 bg-blue-50",
    rose: "border-rose-200 bg-rose-50",
    slate: "border-slate-200 bg-slate-50",
  };
  return classes[tone];
}

function MaterialEventRadar({
  insights,
  onFocusTicker,
  onSearchEvent,
}: {
  insights: NewsInsightsResponse;
  onFocusTicker(ticker: string): void;
  onSearchEvent(label: string): void;
}) {
  const events = insights.events.topEvents
    .slice()
    .sort((left, right) => right.materialityScore - left.materialityScore || right.confidenceScore - left.confidenceScore)
    .slice(0, 4);

  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-slate-700">
          <BarChart3 className="h-4 w-4" />
          Material Event Radar
        </h2>
        <span className="text-xs font-semibold text-slate-500">
          {formatNumber(insights.events.highMaterialityCount)} high materiality
        </span>
      </div>

      {events.length > 0 ? (
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          {events.map((event) => {
            const ticker = event.tickers[0] ?? null;
            return (
              <article key={event.articleId} className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-normal text-slate-500">{event.sourceName}</div>
                    <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-slate-950">{event.eventLabel}</h3>
                  </div>
                  <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                    {ticker ?? "market"}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">{event.title}</p>
                <p className="mt-2 text-[11px] font-semibold text-slate-500">
                  materiality {formatScore(event.materialityScore)}, confidence {formatScore(event.confidenceScore)}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-label={`Search material event ${event.eventLabel}`}
                    onClick={() => onSearchEvent(event.eventLabel)}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Search
                  </button>
                  {ticker ? (
                    <button
                      type="button"
                      aria-label={`Focus material event ticker ${ticker}`}
                      onClick={() => onFocusTicker(ticker)}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-blue-200 bg-white px-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
                    >
                      <Filter className="h-3.5 w-3.5" />
                      {ticker}
                    </button>
                  ) : (
                    <span className="inline-flex h-8 items-center justify-center rounded-md border border-dashed border-slate-200 px-2 text-xs font-semibold text-slate-400">
                      no ticker
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="p-4">
          <div className="rounded-md border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-medium text-slate-500">
            No material event has enough evidence in the current filter.
          </div>
        </div>
      )}
    </section>
  );
}

function ReadinessGate({ item }: { item: ReadinessItem }) {
  return (
    <article className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-bold uppercase tracking-normal text-slate-500">{item.label}</div>
          <div className="mt-1 text-xl font-bold text-slate-950">{item.metric}</div>
        </div>
        <ReadinessPill status={item.status} label={item.status} />
      </div>
      <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-700">{item.detail}</p>
      <p className="mt-2 line-clamp-2 text-[11px] font-medium leading-4 text-slate-500">{item.action}</p>
    </article>
  );
}

function ReadinessPill({ status, label }: { status: ReadinessStatus; label: string }) {
  const classes: Record<ReadinessStatus, string> = {
    ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    watch: "bg-amber-50 text-amber-700 ring-amber-200",
    blocked: "bg-rose-50 text-rose-700 ring-rose-200",
  };

  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ring-1 ${classes[status]}`}>{label}</span>;
}

function PhaseImplementationPanel({ insights }: { insights: NewsInsightsResponse }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-slate-700">
          <ShieldCheck className="h-4 w-4" />
          News Intelligence Phases
        </h2>
        <span className="text-xs font-semibold text-slate-500">Updated {formatTime(insights.generatedAt)}</span>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
        {insights.phases.map((phase) => (
          <article key={phase.id} className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-normal text-slate-500">{phase.phase}</div>
                <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-slate-950">{phase.title}</h3>
              </div>
              <StatusPill value={phase.status} />
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
              <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${Math.max(4, Math.min(100, phase.progress))}%` }} />
            </div>
            <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-700">{phase.signal}</p>
            <div className="mt-2 space-y-1">
              {phase.evidence.slice(0, 2).map((item) => (
                <div key={item} className="line-clamp-1 text-[11px] font-medium text-slate-500">{item}</div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function NewsIntelligenceCockpit({ insights }: { insights: NewsInsightsResponse }) {
  const topSource = insights.quality.sourceDiagnostics[0];
  const topEvent = insights.events.topEvents[0];
  const topCluster = insights.discovery.clusters[0];
  const topSemanticGroup = insights.discovery.semanticGroups[0];
  const topImpact = insights.market.impactSamples[0];

  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-slate-700">
          <Brain className="h-4 w-4" />
          Intelligence Cockpit
        </h2>
        <span className="text-xs font-semibold text-slate-500">{insights.quality.totalArticles} articles scanned</span>
      </div>

      <div className="grid gap-3 p-4 lg:grid-cols-2">
        <InsightBlock
          title="Quality"
          metric={`${insights.quality.contentCoveragePct}%`}
          detail={`${insights.quality.emptyExcerptCount} empty excerpts, avg quality ${formatScore(insights.quality.averageContentQuality)}`}
          evidence={topSource ? `${topSource.sourceName}: ${topSource.emptyExcerptCount} empty / ${topSource.totalArticles}` : "No source diagnostics"}
        />
        <InsightBlock
          title="Events"
          metric={`${insights.events.highMaterialityCount}`}
          detail={`${insights.events.eventCoveragePct}% event coverage`}
          evidence={topEvent ? `${topEvent.eventLabel}: ${topEvent.tickers.slice(0, 3).join(", ") || "market"} (${formatScore(topEvent.materialityScore)})` : "No events yet"}
        />
        <InsightBlock
          title="Discovery"
          metric={`${insights.discovery.semanticGroups.length}`}
          detail={`${insights.discovery.clusters.length} story clusters`}
          evidence={topSemanticGroup ? `${topSemanticGroup.label}: ${topSemanticGroup.keywords.join(", ")}` : topCluster ? `${topCluster.label}: ${topCluster.total} articles` : "No clusters yet"}
        />
        <InsightBlock
          title="Market Linkage"
          metric={`${insights.market.linkedTickerCount}`}
          detail={`${insights.market.impactSamples.length} impact samples`}
          evidence={topImpact ? `${topImpact.ticker}: ${formatSignedPercent(topImpact.return3dPct)} in 3D, volume ${formatScore(topImpact.volumeRatio)}` : "No linked OHLCV sample yet"}
        />
      </div>

      <div className="grid gap-3 border-t border-slate-100 px-4 py-3 lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-500">Top Topics</div>
          <div className="flex flex-wrap gap-2">
            {insights.discovery.topics.slice(0, 8).map((topic) => (
              <span key={topic.label} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{topic.label} {topic.total}</span>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-500">Model Governance</div>
          <p className="text-xs font-semibold leading-5 text-slate-600">
            {insights.model.modelName}: {Math.round(insights.model.averageConfidence * 100)}% confidence, {insights.model.feedbackSummary.totalFeedback} feedback stored.
          </p>
        </div>
      </div>
    </section>
  );
}

function InsightBlock({ title, metric, detail, evidence }: { title: string; metric: string; detail: string; evidence: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-[11px] font-bold uppercase tracking-normal text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-bold text-slate-950">{metric}</div>
      <div className="mt-1 text-xs font-semibold text-slate-600">{detail}</div>
      <div className="mt-2 line-clamp-1 text-[11px] font-medium text-slate-500">{evidence}</div>
    </div>
  );
}

function WildIntelligenceLab({ insights }: { insights: NewsInsightsResponse }) {
  const memory = insights.wild.marketMemory.examples[0];
  const impact = insights.wild.eventImpactLab.eventStats[0];
  const narrative = insights.wild.narrativeRadar.alerts[0];
  const topSource = insights.wild.sourceQuality[0];
  const weakSource = [...insights.wild.sourceQuality].reverse().find((source) => source.warning);
  const disclosureItem = insights.wild.disclosureRadar.openItems[0];
  const graphEdge = insights.wild.entityGraph.edges[0];
  const reviewItem = insights.wild.activeLearning.queue[0];
  const correctionItem = insights.model.feedbackDiagnostics.latestCorrections[0];

  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-slate-700">
          <Activity className="h-4 w-4" />
          Wild Intelligence Lab
        </h2>
        <span className="text-xs font-semibold text-slate-500">memory, impact, radar, graph</span>
      </div>

      <div className="grid gap-3 p-4 lg:grid-cols-3">
        <InsightBlock
          title="Market Memory"
          metric={memory ? `${memory.similarCount}` : "0"}
          detail={memory ? `${memory.ticker} ${memory.eventLabel}` : "no similar memory"}
          evidence={memory ? memory.evidence : "Local history has not found a comparable article yet"}
        />
        <InsightBlock
          title="Event Impact Lab"
          metric={impact ? formatSignedPercent(impact.averageReturn3dPct) : "n/a"}
          detail={impact ? `${impact.eventLabel}, ${impact.sampleCount} samples` : "no linked samples"}
          evidence={impact ? `Win ${impact.winRatePct ?? "n/a"}%, volume ${formatScore(impact.averageVolumeRatio)}` : "Needs more ticker-linked articles"}
        />
        <InsightBlock
          title="Narrative Radar"
          metric={narrative ? narrative.signal : "quiet"}
          detail={narrative ? `${narrative.label}: ${narrative.recentCount} recent` : "no dominant narrative"}
          evidence={narrative ? `momentum ${formatScore(narrative.momentumScore)}, total ${narrative.total}` : "Waiting for enough articles"}
        />
        <InsightBlock
          title="News Velocity"
          metric={`${insights.wild.velocity.last24hCount}`}
          detail={`${insights.wild.velocity.previous24hCount} previous 24h`}
          evidence={`Acceleration ${formatSignedPercent(insights.wild.velocity.accelerationPct)}`}
        />
        <InsightBlock
          title="Source Quality"
          metric={topSource ? `${Math.round(topSource.score * 100)}%` : "n/a"}
          detail={topSource ? topSource.sourceName : "no source score"}
          evidence={weakSource ? `${weakSource.sourceName}: ${weakSource.warning}` : "No source warnings"}
        />
        <InsightBlock
          title="Disclosure Gap"
          metric={`${insights.wild.disclosureRadar.needsReviewCount}`}
          detail={`${insights.wild.disclosureRadar.confirmedCount} official-source hits`}
          evidence={disclosureItem ? disclosureItem.evidence : "No disclosure-sensitive gap detected"}
        />
        <InsightBlock
          title="Entity Graph"
          metric={`${insights.wild.entityGraph.nodes.length}`}
          detail={insights.wild.entityGraph.topHub ?? "no hub yet"}
          evidence={graphEdge ? `${graphEdge.evidence} (${graphEdge.weight})` : "No strong graph edge yet"}
        />
        <InsightBlock
          title="Review Queue"
          metric={`${insights.wild.activeLearning.total}`}
          detail={reviewItem ? reviewItem.reason : "queue clear"}
          evidence={reviewItem ? `${reviewItem.sourceName}; priority ${formatScore(reviewItem.priority)}` : "No manual calibration item needed"}
        />
        <InsightBlock
          title="Model Calibration"
          metric={formatPercentValue(insights.model.feedbackDiagnostics.disagreementRatePct)}
          detail={`${insights.model.feedbackDiagnostics.sampleSize} feedback samples`}
          evidence={correctionItem ? `${correctionItem.from} -> ${correctionItem.to}; rel ${formatSignedDecimal(correctionItem.relevanceDelta)}` : "Waiting for human feedback samples"}
        />
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="text-[11px] font-bold uppercase tracking-normal text-slate-500">{insights.wild.dailyBriefing.title}</div>
          <div className="mt-2 space-y-1">
            {insights.wild.dailyBriefing.bullets.slice(0, 3).map((item) => (
              <p key={item} className="line-clamp-2 text-xs font-semibold leading-5 text-slate-700">{item}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-slate-100 px-4 py-3 lg:grid-cols-4">
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-500">Watchlist Evidence</div>
          <div className="flex flex-wrap gap-2">
            {insights.wild.dailyBriefing.watchlist.map((item) => (
              <span key={item} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{item}</span>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-500">Velocity Sources</div>
          <div className="flex flex-wrap gap-2">
            {insights.wild.velocity.topSources.length > 0 ? insights.wild.velocity.topSources.map((source) => (
              <span key={source.sourceName} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{source.sourceName} {source.total}</span>
            )) : (
              <span className="text-xs font-semibold text-slate-500">No source velocity yet</span>
            )}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-500">Disclosure & Review</div>
          <div className="flex flex-wrap gap-2">
            {insights.wild.disclosureRadar.openItems.slice(0, 3).map((item) => (
              <a
                key={item.articleId}
                href={item.officialSearchUrl}
                target="_blank"
                rel="noreferrer"
                className={`rounded-md px-2 py-1 text-xs font-semibold ${item.severity === "high" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}
                title={`Review in ${item.officialSourceName}`}
              >
                {item.ticker} {item.eventLabel}
              </a>
            ))}
            {insights.wild.activeLearning.queue.slice(0, 2).map((item) => (
              <span key={item.articleId} className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{item.reason}</span>
            ))}
            {insights.wild.disclosureRadar.openItems.length === 0 && insights.wild.activeLearning.queue.length === 0 ? (
              <span className="text-xs font-semibold text-slate-500">No review item</span>
            ) : null}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-500">Model Feedback</div>
          <div className="flex flex-wrap gap-2">
            {insights.model.feedbackDiagnostics.latestCorrections.length > 0 ? insights.model.feedbackDiagnostics.latestCorrections.slice(0, 3).map((item) => (
              <span key={item.articleId} className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                {item.from} to {item.to}
              </span>
            )) : (
              <span className="text-xs font-semibold text-slate-500">No feedback sample</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function WildInsightDrilldown({
  articles,
  insights,
  onFocusTicker,
  onSearchNarrative,
  onSelectArticle,
}: {
  articles: NewsArticle[];
  insights: NewsInsightsResponse;
  onFocusTicker(ticker: string): void;
  onSearchNarrative(label: string): void;
  onSelectArticle(articleId: string): void;
}) {
  const visibleArticleIds = new Set(articles.map((article) => article.id));
  const storyClusters = insights.discovery.clusters.slice(0, 3);
  const eventImpacts = insights.wild.eventImpactLab.eventStats.slice(0, 3);
  const topNarratives = insights.wild.narrativeRadar.alerts.slice(0, 3);
  const marketMemories = insights.wild.marketMemory.examples.slice(0, 3);
  const graphEdges = insights.wild.entityGraph.edges.slice(0, 4);
  const disclosureItems = insights.wild.disclosureRadar.openItems.slice(0, 3);
  const reviewItems = insights.wild.activeLearning.queue.slice(0, 3);

  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-slate-700">
          <SlidersHorizontal className="h-4 w-4" />
          Insight Drilldown
        </h2>
        <span className="text-xs font-semibold text-slate-500">
          {storyClusters.length + eventImpacts.length + topNarratives.length + marketMemories.length + disclosureItems.length + reviewItems.length} actionable signals
        </span>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-2">
        <DrilldownSection title="Story Cluster Explorer" emptyLabel="No story cluster yet">
          {storyClusters.map((item) => (
            <div key={item.key} className="border-b border-slate-100 py-3 last:border-b-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-950">{item.label}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {formatClusterSummary(item)}
                  </div>
                </div>
                <DrilldownAction
                  label="Search cluster"
                  ariaLabel={`Search story cluster ${item.label}`}
                  icon={<Search className="h-3.5 w-3.5" />}
                  onClick={() => onSearchNarrative(item.label)}
                />
              </div>
              <div className="mt-2 space-y-1">
                {item.sampleTitles.slice(0, 2).map((title) => (
                  <p key={title} className="line-clamp-1 text-xs font-medium text-slate-600">{title}</p>
                ))}
              </div>
            </div>
          ))}
        </DrilldownSection>

        <DrilldownSection title="Event Impact Explorer" emptyLabel="No event impact sample yet">
          {eventImpacts.map((item) => (
            <div key={item.eventLabel} className="border-b border-slate-100 py-3 last:border-b-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-950">{item.eventLabel}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {formatEventImpactSummary(item)}
                  </div>
                </div>
                <DrilldownAction
                  label="Search event"
                  ariaLabel={`Search event impact ${item.eventLabel}`}
                  icon={<Search className="h-3.5 w-3.5" />}
                  onClick={() => onSearchNarrative(item.eventLabel)}
                />
              </div>
              <p className="mt-2 line-clamp-1 text-xs font-medium text-slate-600">
                {item.topTickers.length > 0 ? `Top tickers: ${item.topTickers.join(", ")}` : "No ticker concentration yet"}
              </p>
            </div>
          ))}
        </DrilldownSection>

        <DrilldownSection title="Narrative Radar" emptyLabel="No narrative alert yet">
          {topNarratives.map((item) => (
            <div key={item.label} className="border-b border-slate-100 py-3 last:border-b-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-950">{item.label}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {item.signal}, momentum {formatScore(item.momentumScore)}, recent {item.recentCount}/{item.total}
                  </div>
                </div>
                <DrilldownAction
                  label="Search narrative"
                  ariaLabel={`Search narrative ${item.label}`}
                  icon={<Search className="h-3.5 w-3.5" />}
                  onClick={() => onSearchNarrative(item.label)}
                />
              </div>
              <div className="mt-2 space-y-1">
                {item.sampleTitles.slice(0, 2).map((title) => (
                  <p key={title} className="line-clamp-1 text-xs font-medium text-slate-600">{title}</p>
                ))}
              </div>
            </div>
          ))}
        </DrilldownSection>

        <DrilldownSection title="Market Memory" emptyLabel="No comparable market memory yet">
          {marketMemories.map((item) => (
            <div key={`${item.articleId}-${item.ticker}`} className="border-b border-slate-100 py-3 last:border-b-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-950">{item.ticker} {item.eventLabel}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {item.similarCount} similar, avg 3D {formatSignedPercent(item.averageReturn3dPct)}, win {item.winRatePct ?? "n/a"}%
                  </div>
                </div>
                <DrilldownAction
                  label="Focus ticker"
                  ariaLabel={`Focus ticker ${item.ticker} from market memory`}
                  icon={<Gauge className="h-3.5 w-3.5" />}
                  onClick={() => onFocusTicker(item.ticker)}
                />
              </div>
              <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-600">{item.evidence}</p>
            </div>
          ))}
        </DrilldownSection>

        <DrilldownSection title="Entity Graph" emptyLabel="No graph edge yet">
          {graphEdges.map((edge) => (
            <div key={`${edge.from}-${edge.to}`} className="border-b border-slate-100 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-950">
                    {getGraphNodeLabel(insights, edge.from)} {"->"} {getGraphNodeLabel(insights, edge.to)}
                  </div>
                  <div className="mt-1 line-clamp-1 text-xs font-medium text-slate-500">{edge.evidence}</div>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">x{edge.weight}</span>
              </div>
            </div>
          ))}
        </DrilldownSection>

        <DrilldownSection title="Review Queue" emptyLabel="No review queue item">
          {disclosureItems.map((item) => (
            <div key={`disclosure-${item.articleId}`} className="border-b border-slate-100 py-3 last:border-b-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-950">{item.ticker} {item.eventLabel}</div>
                  <div className={`mt-1 text-xs font-bold ${item.severity === "high" ? "text-rose-700" : "text-amber-700"}`}>
                    {item.severity} disclosure gap
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <DrilldownAction
                    label="Focus ticker"
                    ariaLabel={`Focus ticker ${item.ticker} from disclosure gap`}
                    icon={<Gauge className="h-3.5 w-3.5" />}
                    onClick={() => onFocusTicker(item.ticker)}
                  />
                  <a
                    href={item.officialSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    IDX
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-600">{item.evidence}</p>
            </div>
          ))}

          {reviewItems.map((item) => {
            const visible = visibleArticleIds.has(item.articleId);
            return (
              <div key={`review-${item.articleId}`} className="border-b border-slate-100 py-3 last:border-b-0">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="line-clamp-1 text-sm font-bold text-slate-950">{item.title}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      {item.reason}, priority {formatScore(item.priority)}
                    </div>
                  </div>
                  <DrilldownAction
                    label="Review article"
                    ariaLabel={`Review article ${item.title}`}
                    icon={<Brain className="h-3.5 w-3.5" />}
                    onClick={() => onSelectArticle(item.articleId)}
                    disabled={!visible}
                  />
                </div>
                {!visible ? (
                  <p className="mt-2 text-xs font-medium text-slate-500">Clear filters to review this article in the inspector.</p>
                ) : null}
              </div>
            );
          })}
        </DrilldownSection>
      </div>
    </section>
  );
}

function DrilldownSection({ title, emptyLabel, children }: { title: string; emptyLabel: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(items) ? items.length === 0 : !items;

  return (
    <div className="min-w-0">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-500">{title}</div>
      <div className="rounded-md border border-slate-200 px-3">
        {isEmpty ? (
          <div className="py-4 text-sm font-medium text-slate-500">{emptyLabel}</div>
        ) : items}
      </div>
    </div>
  );
}

function formatClusterSummary(cluster: NewsInsightsResponse["discovery"]["clusters"][number]) {
  const positive = cluster.sentimentMix.positive ?? 0;
  const negative = cluster.sentimentMix.negative ?? 0;
  const neutral = (cluster.sentimentMix.neutral ?? 0) + (cluster.sentimentMix.mixed ?? 0) + (cluster.sentimentMix.unknown ?? 0);
  return `${formatNumber(cluster.total)} ${cluster.total === 1 ? "article" : "articles"} - positive ${positive}, neutral/mixed/unknown ${neutral}, negative ${negative}`;
}

function formatEventImpactSummary(item: NewsInsightsResponse["wild"]["eventImpactLab"]["eventStats"][number]) {
  return `${formatNumber(item.sampleCount)} ${item.sampleCount === 1 ? "sample" : "samples"} - avg 3D ${formatSignedPercent(item.averageReturn3dPct)}, win ${item.winRatePct ?? "n/a"}%, volume ${formatScore(item.averageVolumeRatio)}`;
}

function DrilldownAction({
  label,
  ariaLabel,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  ariaLabel: string;
  icon: ReactNode;
  onClick(): void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ value }: { value: NewsInsightsResponse["phases"][number]["status"] }) {
  const label = value === "live" ? "live" : value === "partial" ? "partial" : "needs data";
  const classes = value === "live"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : value === "partial"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-slate-100 text-slate-600 ring-slate-200";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${classes}`}>{label}</span>;
}

function MetricBlock({
  label,
  value,
  detail,
  accent = "text-slate-950",
}: {
  label: string;
  value: string | number;
  detail: string;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-normal text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tracking-normal ${accent}`}>{value}</div>
      <div className="mt-1 text-xs font-medium leading-5 text-slate-500">{detail}</div>
    </div>
  );
}

function ToneMiniBars({ counts }: { counts: SummaryResponse["sentimentCounts"] | undefined }) {
  const positive = counts?.positive ?? 0;
  const neutral = (counts?.neutral ?? 0) + (counts?.mixed ?? 0) + (counts?.unknown ?? 0);
  const negative = counts?.negative ?? 0;
  const max = Math.max(1, positive, neutral, negative);

  return (
    <div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-500">Tone Mix</div>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold">
        <ToneBar label="pos" value={positive} max={max} className="bg-emerald-500" />
        <ToneBar label="neu" value={neutral} max={max} className="bg-slate-400" />
        <ToneBar label="neg" value={negative} max={max} className="bg-rose-500" />
      </div>
    </div>
  );
}

function ToneBar({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  return (
    <div>
      <div className="mb-1 text-slate-700">{value}</div>
      <div className="h-1.5 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${className}`} style={{ width: `${Math.max(8, (value / max) * 100)}%` }} />
      </div>
      <div className="mt-1 text-slate-400">{label}</div>
    </div>
  );
}

function SyncProgressPanel({ progress }: { progress: SyncProgressView }) {
  const pct = getSyncProgressPercent(progress);
  const summary = progress.summary;
  const currentSource = progress.currentSourceName ?? "Menunggu sumber";
  const currentPage = progress.currentPageNumber ? `Halaman ${progress.currentPageNumber}` : "Halaman belum dibuka";
  const sourceLine = `${summary.completedSources}/${Math.max(1, summary.totalSources)} sumber selesai`;

  return (
    <section className="rounded-md border border-blue-200 bg-blue-50/70 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {progress.active ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
            ) : progress.completed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-700" />
            )}
            <h3 className="text-sm font-bold text-slate-950">{progress.active ? "Sedang scraping" : progress.completed ? "Sync selesai" : "Sync berhenti"}</h3>
          </div>
          <p className="mt-1 text-sm font-semibold leading-5 text-slate-700">{progress.message}</p>
          <p className="mt-1 truncate text-xs font-medium text-slate-500">{currentSource} - {currentPage}</p>
          {progress.currentPageUrl ? (
            <p className="mt-1 truncate text-[11px] font-medium text-slate-400">{formatCompactUrl(progress.currentPageUrl)}</p>
          ) : null}
        </div>
        <div className="text-left sm:text-right">
          <div className="text-2xl font-bold text-blue-700">{pct}%</div>
          <div className="text-xs font-semibold text-slate-500">{sourceLine}</div>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div
          aria-label="Progress sync berita"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={pct}
          role="progressbar"
          className="h-2 rounded-full bg-blue-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
        <ProgressMetric label="Kandidat" value={summary.totalCandidates} />
        <ProgressMetric label="Cocok" value={summary.matchedCount} />
        <ProgressMetric label="Baru" value={summary.insertedCount} />
        <ProgressMetric label="Duplikat" value={summary.duplicateCount} />
        <ProgressMetric label="Terfilter" value={summary.filteredCount} />
      </div>

      {progress.events.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-blue-100 pt-3">
          {progress.events.map((event, index) => (
            <div key={`${event}-${index}`} className="line-clamp-1 text-xs font-medium text-slate-600">{event}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ClassifyProgressPanel({ progress, onClose }: { progress: ClassifyProgressView; onClose(): void }) {
  const pct = getClassifyProgressPercent(progress);
  const summary = progress.summary;
  const currentTitle = progress.currentTitle ?? "Menunggu artikel";

  return (
    <section className="rounded-md border border-emerald-200 bg-emerald-50/70 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {progress.active ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
            ) : progress.completed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-700" />
            )}
            <h3 className="text-sm font-bold text-slate-950">{progress.active ? "Sedang classify" : progress.completed ? "Classify selesai" : "Classify berhenti"}</h3>
          </div>
          <p className="mt-1 text-sm font-semibold leading-5 text-slate-700">{progress.message}</p>
          <p className="mt-1 truncate text-xs font-medium text-slate-500">{currentTitle}</p>
        </div>
        <div className="flex items-start justify-between gap-3 text-left sm:text-right">
          {!progress.active ? (
            <button
              type="button"
              aria-label="Close classify progress"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-white text-emerald-700 shadow-sm hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <div>
            <div className="text-2xl font-bold text-emerald-700">{pct}%</div>
            <div className="text-xs font-semibold text-slate-500">{formatNumber(summary.classifiedCount)}/{formatNumber(summary.total)} selesai</div>
          </div>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div
          aria-label="Progress classify berita"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={pct}
          role="progressbar"
          className="h-2 rounded-full bg-emerald-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <ProgressMetric label="Target" value={summary.total} />
        <ProgressMetric label="Selesai" value={summary.classifiedCount} />
        <ProgressMetric label="Terlewati" value={summary.skippedCount} />
        <ProgressMetric label="Sisa" value={summary.remainingCount} />
      </div>

      {progress.events.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-emerald-100 pt-3">
          {progress.events.map((event, index) => (
            <div key={`${event}-${index}`} className="line-clamp-1 text-xs font-medium text-slate-600">{event}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EnrichmentProgressPanel({ progress, onClose }: { progress: EnrichmentProgressView; onClose(): void }) {
  const pct = getEnrichmentProgressPercent(progress);
  const summary = progress.summary;
  const currentTitle = progress.currentTitle ?? "Menunggu artikel";

  return (
    <section className="rounded-md border border-blue-200 bg-blue-50/70 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {progress.active ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
            ) : progress.completed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-700" />
            )}
            <h3 className="text-sm font-bold text-slate-950">{progress.active ? "Sedang enrich" : progress.completed ? "Enrich selesai" : "Enrich berhenti"}</h3>
          </div>
          <p className="mt-1 text-sm font-semibold leading-5 text-slate-700">{progress.message}</p>
          <p className="mt-1 truncate text-xs font-medium text-slate-500">{currentTitle}</p>
          {progress.currentUrl ? (
            <p className="mt-1 truncate text-[11px] font-medium text-slate-400">{formatCompactUrl(progress.currentUrl)}</p>
          ) : null}
        </div>
        <div className="flex items-start justify-between gap-3 text-left sm:text-right">
          {!progress.active ? (
            <button
              type="button"
              aria-label="Close enrichment progress"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-white text-blue-700 shadow-sm hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <div>
            <div className="text-2xl font-bold text-blue-700">{pct}%</div>
            <div className="text-xs font-semibold text-slate-500">{formatNumber(summary.processedCount)}/{formatNumber(summary.totalArticles)} diproses</div>
          </div>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div
          aria-label="Progress enrich berita"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={pct}
          role="progressbar"
          className="h-2 rounded-full bg-blue-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
        <ProgressMetric label="Target" value={summary.totalArticles} />
        <ProgressMetric label="Diproses" value={summary.processedCount} />
        <ProgressMetric label="Enriched" value={summary.enrichedCount} />
        <ProgressMetric label="Gagal" value={summary.failedCount} />
        <ProgressMetric label="Sisa" value={summary.remainingCount} />
      </div>

      {progress.events.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-blue-100 pt-3">
          {progress.events.map((event, index) => (
            <div key={`${event}-${index}`} className="line-clamp-1 text-xs font-medium text-slate-600">{event}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProgressMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-blue-100 bg-white px-2 py-2">
      <div className="text-[11px] font-bold uppercase tracking-normal text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-900">{formatNumber(value)}</div>
    </div>
  );
}

function TimelineChart({ timeline }: { timeline: ReturnType<typeof buildTimeline> }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="grid min-h-28 min-w-[420px] items-end gap-2"
        style={{ gridTemplateColumns: `repeat(${timeline.length}, minmax(22px, 1fr))` }}
      >
        {timeline.map((bucket) => (
          <div key={bucket.date} className="flex min-w-0 flex-col gap-2">
            <div className="flex h-24 items-end justify-center gap-1 border-b border-slate-200">
              <span className="block w-3 rounded-t-sm bg-emerald-500" style={{ height: `${bucket.positiveHeight}%` }} title={`${bucket.positive} positive`} />
              <span className="block w-3 rounded-t-sm bg-slate-400" style={{ height: `${bucket.neutralHeight}%` }} title={`${bucket.neutral} neutral, mixed, or unknown`} />
              <span className="block w-3 rounded-t-sm bg-rose-500" style={{ height: `${bucket.negativeHeight}%` }} title={`${bucket.negative} negative`} />
            </div>
            <span className="truncate text-center text-[11px] font-semibold text-slate-500" title={`${bucket.date}: ${bucket.totalArticles} articles`}>
              {bucket.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineSummary({ summary, days }: { summary: SummaryResponse | null; days: number }) {
  const counts = summary?.sentimentCounts;
  const total = Math.max(1, summary?.totalArticles ?? 0);
  const rows = [
    ["Positive", counts?.positive ?? 0, "text-emerald-700"],
    ["Neutral", (counts?.neutral ?? 0) + (counts?.mixed ?? 0) + (counts?.unknown ?? 0), "text-slate-600"],
    ["Negative", counts?.negative ?? 0, "text-rose-700"],
  ] as const;

  return (
    <div className="border-t border-slate-100 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-normal text-slate-500">{days}D Summary</div>
      <div className="space-y-3">
        {rows.map(([label, value, color]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-slate-500">{label}</span>
            <span className={`font-bold ${color}`}>{value} ({Math.round((value / total) * 100)}%)</span>
          </div>
        ))}
        <div className="border-t border-slate-100 pt-3 text-xs font-bold text-slate-800">
          Total <span className="float-right">{summary?.totalArticles ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

function ArticleStreamRow({ article, selected, onSelect }: { article: NewsArticle; selected: boolean; onSelect(): void }) {
  const sentimentValue = article.sentiment?.sentimentLabel ?? "unknown";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid w-full grid-cols-[18px_minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition hover:bg-slate-50 md:grid-cols-[18px_minmax(0,1fr)_96px_100px_64px] ${
        selected ? "border-l-4 border-blue-600 bg-blue-50/70 pl-3" : "border-l-4 border-transparent"
      }`}
    >
      <span className={`mt-1 h-3.5 w-3.5 rounded-full border ${selected ? "border-blue-600 bg-blue-600 ring-2 ring-blue-100" : "border-slate-300 bg-white"}`} />
      <span className="min-w-0">
        <span className="line-clamp-2 text-sm font-bold leading-5 text-slate-900">{article.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <span>{article.sourceName}</span>
          <span>{article.sentiment?.marketScope ?? "unclassified"}</span>
          {article.searchMode === "semantic" && article.semanticScore !== undefined ? (
            <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">semantic {formatScore(article.semanticScore)}</span>
          ) : null}
          {getEvidenceChips(article).slice(0, 4).map((item) => (
            <span key={item} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{compactEvidenceChip(item)}</span>
          ))}
        </span>
        <span className="mt-2 line-clamp-1 text-xs leading-5 text-slate-600">{(article.sentiment?.reasoning ?? article.excerpt) || "Pending classification."}</span>
      </span>
      <span className="hidden justify-self-center md:block"><SentimentPill value={sentimentValue} /></span>
      <span className="hidden w-24 justify-self-center md:block"><RelevanceMeter value={article.sentiment?.relevanceScore} /></span>
      <span className="text-right text-xs font-semibold leading-5 text-slate-600">
        {formatTime(article.publishedAt ?? article.ingestedAt)}
        <span className="block font-medium text-slate-400">{formatShortDate(article.publishedAt ?? article.ingestedAt)}</span>
      </span>
    </button>
  );
}

function EvidenceInspector({
  article,
  chartContextTimeframe,
  tickerContext,
  onSubmitFeedback,
  savingFeedback,
}: {
  article: NewsArticle | null;
  chartContextTimeframe: "1w" | null;
  tickerContext: string;
  onSubmitFeedback(input: { articleId: string; sentimentLabel: SentimentLabel; relevanceScore: number; note: string }): void;
  savingFeedback: boolean;
}) {
  return (
    <aside className="rounded-md border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4 xl:self-start">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-normal text-slate-700">
          <SlidersHorizontal className="h-4 w-4" />
          Evidence Inspector
        </h2>
        <span className="text-xs font-semibold text-slate-400">{article ? "selected" : "empty"}</span>
      </div>

      {article ? (
        <div className="space-y-5 p-4">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-normal text-slate-500">{article.sourceName}</span>
              <span className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white">Selected</span>
            </div>
            <h3 className="text-base font-bold leading-6 text-slate-950">{article.title}</h3>
            <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              {formatDateTime(article.publishedAt ?? article.ingestedAt)}
            </div>
          </div>

          <section className="border-t border-slate-100 pt-4">
            <h4 className="mb-3 text-[11px] font-bold uppercase tracking-normal text-slate-500">Overview</h4>
            <div className="space-y-3 text-sm">
              <InspectorLine label="Sentiment"><SentimentPill value={article.sentiment?.sentimentLabel ?? "unknown"} /></InspectorLine>
              <InspectorLine label="Scope">{article.sentiment?.marketScope ?? "unclassified"}</InspectorLine>
              <InspectorLine label="Relevance"><RelevanceMeter value={article.sentiment?.relevanceScore} wide /></InspectorLine>
              {article.searchMode === "semantic" ? (
                <InspectorLine label="Semantic">{formatScore(article.semanticScore)}</InspectorLine>
              ) : null}
            </div>
          </section>

          <InspectorText title="Excerpt" body={article.excerpt || "No excerpt captured."} />
          <InspectorText title="Reasoning" body={article.sentiment?.reasoning ?? "Pending classification."} />

          <FeedbackForm
            key={article.id}
            article={article}
            onSubmitFeedback={onSubmitFeedback}
            savingFeedback={savingFeedback}
          />

          <section>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-500">Matched Keywords</h4>
            <div className="flex flex-wrap gap-2">
              {getEvidenceChips(article).slice(0, 8).map((item) => (
                <span key={item} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{compactEvidenceChip(item)}</span>
              ))}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-500">Evidence Stack</h4>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <EvidenceStackRow label="Keyword match" value={`${article.matchedKeywords.length} captured`} ok={article.matchedKeywords.length > 0} />
              <EvidenceStackRow label="Ticker match" value={findTickerMatch(article) ?? "-"} ok={Boolean(findTickerMatch(article))} />
              <EvidenceStackRow label="Source match" value={article.sourceName} ok />
              <EvidenceStackRow label="Scope match" value={article.sentiment?.marketScope ?? "-"} ok={Boolean(article.sentiment?.marketScope)} />
              {article.searchMode === "semantic" ? (
                <EvidenceStackRow label="Semantic reason" value={article.semanticReasons?.join(", ") ?? "-"} ok={Boolean(article.semanticReasons?.length)} />
              ) : null}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-500">Source</h4>
            <a href={article.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-xs font-semibold leading-5 text-blue-700 hover:text-blue-900">
              {article.url}
            </a>
            {tickerContext !== "ALL" ? (
              <Link
                href={chartContextHref(tickerContext, chartContextTimeframe, article.publishedAt ?? article.ingestedAt)}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 text-sm font-bold text-blue-700 hover:bg-blue-100"
              >
                Open chart context
                <BarChart3 className="h-4 w-4" />
              </Link>
            ) : null}
            <a href={article.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50">
              Open original
              <ExternalLink className="h-4 w-4" />
            </a>
          </section>
        </div>
      ) : (
        <div className="p-4">
          <div className="rounded-md border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">No article selected</div>
        </div>
      )}
    </aside>
  );
}

function chartContextHref(ticker: string, timeframe: "1w" | null = null, asOf: string | null = null) {
  const normalized = ticker.trim().toUpperCase();
  const params = new URLSearchParams();
  if (normalized && normalized !== "ALL") {
    params.set("symbol", normalized.endsWith(".JK") ? normalized : `${normalized}.JK`);
  }
  if (timeframe) {
    params.set("timeframe", timeframe);
  }
  const asOfDate = asOf?.slice(0, 10);
  if (asOfDate) {
    params.set("asOf", asOfDate);
  }
  const queryString = params.toString();
  return queryString ? `/?${queryString}` : "/";
}

function normalizeChartTimeframe(value: string) {
  return value.trim().toLowerCase() === "1w" || value.trim().toLowerCase() === "weekly" ? "1w" : null;
}

function normalizeNewsDays(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_NEWS_DAYS;
  }

  const days = Math.trunc(parsed);
  return (NEWS_DAY_OPTIONS as readonly number[]).includes(days) ? days : DEFAULT_NEWS_DAYS;
}

function normalizeInitialSentiment(value: string): SentimentLabel | "all" {
  const normalized = value.trim().toLowerCase();
  return (SENTIMENTS as readonly string[]).includes(normalized) ? normalized as SentimentLabel | "all" : "all";
}

function normalizeInitialSourceId(value: string) {
  const normalized = value.trim();
  return SOURCE_OPTIONS.some(([sourceId]) => sourceId === normalized) ? normalized : "all";
}

function normalizeInitialMinRelevance(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.round(Math.min(1, Math.max(0, parsed)) * 10) / 10;
}

function getSyncDaysFromNewsWindow(days: number) {
  return (SYNC_DAY_OPTIONS as readonly number[]).includes(days) ? days : 30;
}

function FeedbackForm({
  article,
  onSubmitFeedback,
  savingFeedback,
}: {
  article: NewsArticle;
  onSubmitFeedback(input: { articleId: string; sentimentLabel: SentimentLabel; relevanceScore: number; note: string }): void;
  savingFeedback: boolean;
}) {
  const [feedbackSentiment, setFeedbackSentiment] = useState<SentimentLabel>(article.sentiment?.sentimentLabel ?? "unknown");
  const [feedbackRelevance, setFeedbackRelevance] = useState(article.sentiment?.relevanceScore ?? 0.5);
  const [feedbackNote, setFeedbackNote] = useState("");

  return (
    <section className="rounded-md border border-emerald-100 bg-emerald-50/60 p-3">
      <h4 className="mb-3 text-[11px] font-bold uppercase tracking-normal text-emerald-800">Feedback</h4>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Sentiment</span>
          <select
            value={feedbackSentiment}
            onChange={(event) => setFeedbackSentiment(event.target.value as SentimentLabel)}
            disabled={savingFeedback}
            className="h-9 w-full rounded-md border border-emerald-200 bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500 disabled:opacity-60"
          >
            {SENTIMENTS.filter((value) => value !== "all").map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Relevance {feedbackRelevance.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={feedbackRelevance}
            onChange={(event) => setFeedbackRelevance(Number(event.target.value))}
            disabled={savingFeedback}
            className="w-full accent-emerald-700 disabled:opacity-60"
          />
        </label>
        <textarea
          value={feedbackNote}
          onChange={(event) => setFeedbackNote(event.target.value)}
          disabled={savingFeedback}
          placeholder="Catatan koreksi"
          className="min-h-20 w-full resize-none rounded-md border border-emerald-200 bg-white px-2 py-2 text-sm text-slate-700 outline-none focus:border-emerald-500 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => onSubmitFeedback({
            articleId: article.id,
            sentimentLabel: feedbackSentiment,
            relevanceScore: feedbackRelevance,
            note: feedbackNote,
          })}
          disabled={savingFeedback}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
        >
          {savingFeedback ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Save feedback
        </button>
      </div>
    </section>
  );
}

function InspectorLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-3">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className="min-w-0 font-bold text-slate-800">{children}</span>
    </div>
  );
}

function InspectorText({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-normal text-slate-500">{title}</h4>
      <p className="text-sm leading-6 text-slate-600">{body}</p>
    </section>
  );
}

function EvidenceStackRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0">
      <span className="font-semibold text-slate-600">{label}</span>
      <span className="inline-flex items-center gap-2 font-bold text-slate-700">
        <span className="max-w-[150px] truncate">{value}</span>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />}
      </span>
    </div>
  );
}

function SentimentPill({ value }: { value: SentimentLabel }) {
  const classes: Record<SentimentLabel, string> = {
    positive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    negative: "bg-red-50 text-red-700 ring-red-200",
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    mixed: "bg-amber-50 text-amber-700 ring-amber-200",
    unknown: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  };

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${classes[value]}`}>{value}</span>;
}

function SourceHealthBadge({ status }: { status: SourceHealthStatus }) {
  const classes: Record<SourceHealthStatus, string> = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    failed: "border-rose-200 bg-rose-50 text-rose-700",
    running: "border-blue-200 bg-blue-50 text-blue-700",
    idle: "border-slate-200 bg-slate-50 text-slate-500",
  };

  return (
    <span className={`inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-[10px] font-bold ${classes[status]}`}>
      {formatSourceHealthStatus(status)}
    </span>
  );
}

function RelevanceMeter({ value, wide = false }: { value: number | null | undefined; wide?: boolean }) {
  const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(1, value));
  return (
    <span className={`inline-flex items-center gap-2 ${wide ? "w-full" : "w-24"}`}>
      <span className="w-9 text-right text-xs font-bold text-slate-700">{formatScore(value)}</span>
      <span className="h-1.5 flex-1 rounded-full bg-slate-200">
        <span className={`block h-1.5 rounded-full ${pct >= 0.7 ? "bg-emerald-600" : pct >= 0.45 ? "bg-slate-500" : "bg-rose-500"}`} style={{ width: `${pct * 100}%` }} />
      </span>
    </span>
  );
}

function buildTimeline(summaryTimeline: SummaryResponse["dailyTimeline"] | undefined, articles: NewsArticle[]) {
  const source = summaryTimeline && summaryTimeline.length > 0
    ? summaryTimeline.slice(-30).map((bucket) => ({
      date: bucket.date,
      positive: bucket.sentimentCounts.positive,
      negative: bucket.sentimentCounts.negative,
      neutral: bucket.sentimentCounts.neutral + bucket.sentimentCounts.mixed + bucket.sentimentCounts.unknown,
      totalArticles: bucket.totalArticles,
    }))
    : buildVisibleArticleTimeline(articles);

  const padded = source.length > 0 ? source : [{
    date: new Date().toISOString().slice(0, 10),
    positive: 0,
    negative: 0,
    neutral: 0,
    totalArticles: 0,
  }];

  return padded.map((bucket) => {
    const total = Math.max(1, bucket.positive + bucket.negative + bucket.neutral);
    return {
      date: bucket.date,
      label: bucket.date.slice(5),
      totalArticles: bucket.totalArticles,
      positive: bucket.positive,
      negative: bucket.negative,
      neutral: bucket.neutral,
      positiveHeight: barHeight(bucket.positive, total),
      negativeHeight: barHeight(bucket.negative, total),
      neutralHeight: barHeight(bucket.neutral, total),
    };
  });
}

function buildVisibleArticleTimeline(articles: NewsArticle[]) {
  const buckets = new Map<string, { positive: number; negative: number; neutral: number }>();
  for (const article of articles) {
    const day = (article.publishedAt ?? article.ingestedAt).slice(0, 10);
    const bucket = buckets.get(day) ?? { positive: 0, negative: 0, neutral: 0 };
    const label = article.sentiment?.sentimentLabel ?? "unknown";
    if (label === "positive") {
      bucket.positive += 1;
    } else if (label === "negative") {
      bucket.negative += 1;
    } else {
      bucket.neutral += 1;
    }
    buckets.set(day, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, bucket]) => ({
      date,
      ...bucket,
      totalArticles: bucket.positive + bucket.negative + bucket.neutral,
    }));
}

function barHeight(value: number, total: number) {
  return value > 0 ? Math.max(4, (value / total) * 100) : 0;
}

function getEvidenceChips(article: NewsArticle) {
  return [...new Set([
    ...article.matchedKeywords.map((keyword) => `keyword:${keyword}`),
    ...article.matches.map((match) => `${match.matchType}:${match.matchValue}`),
  ])];
}

function buildKeywordStats(articles: NewsArticle[]) {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const item of getEvidenceChips(article)) {
      const label = compactEvidenceChip(item);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function getTickerContext(ticker: string, article: NewsArticle | null) {
  const explicitTicker = ticker.trim().toUpperCase();
  if (explicitTicker) {
    return explicitTicker;
  }

  const tickerMatch = article?.matches.find((match) =>
    match.matchType.toLowerCase().includes("ticker") || /^[A-Z]{3,5}$/.test(match.matchValue.toUpperCase()),
  );
  return tickerMatch?.matchValue.toUpperCase() ?? "ALL";
}

function getSourceDiagnostics(insights: NewsInsightsResponse, sourceName: string) {
  return {
    diagnostic: insights.quality.sourceDiagnostics.find((source) => source.sourceName === sourceName) ?? null,
    quality: insights.wild.sourceQuality.find((source) => source.sourceName === sourceName) ?? null,
  };
}

export function buildSourceHealthRows(policies: NewsSourcePolicyRow[], statuses: SourceStatusView[]): SourceHealthRow[] {
  const statusBySource = new Map(statuses.map((status) => [status.sourceId, status]));

  return policies
    .map((policy) => {
      const status = statusBySource.get(policy.sourceId);
      return {
        sourceId: policy.sourceId,
        sourceName: policy.sourceName,
        status: normalizeSourceHealthStatus(status?.status),
        accessLabel: policy.accessLabel,
        category: policy.category,
        itemsSeen: status?.itemsSeen ?? 0,
        matchedCount: status?.matchedCount ?? 0,
        insertedCount: status?.insertedCount ?? 0,
        duplicateCount: status?.duplicateCount ?? 0,
        filteredCount: status?.filteredCount ?? 0,
        startedAt: status?.startedAt ?? null,
        finishedAt: status?.finishedAt ?? null,
        errorText: formatSourceError(status?.error),
        policy,
      };
    })
    .sort((left, right) =>
      getSourceHealthRank(left.status) - getSourceHealthRank(right.status)
      || right.matchedCount - left.matchedCount
      || left.sourceName.localeCompare(right.sourceName),
    );
}

export function buildSourceReliabilityRows(policies: NewsSourcePolicyRow[], history: SyncHistoryItem[]): SourceReliabilityRow[] {
  const totalRuns = history.length;

  return policies
    .map((policy) => {
      const sourceRuns = history
        .map((item) => item.sources.find((source) => source.sourceId === policy.sourceId) ?? null)
        .filter((source): source is SourceStatusView => Boolean(source));
      const checkedRuns = sourceRuns.length;
      const successCount = sourceRuns.filter((source) => normalizeSourceHealthStatus(source.status) === "success").length;
      const failedCount = sourceRuns.filter((source) => normalizeSourceHealthStatus(source.status) === "failed").length;
      const runningCount = sourceRuns.filter((source) => normalizeSourceHealthStatus(source.status) === "running").length;
      const itemsSeen = sourceRuns.reduce((total, source) => total + source.itemsSeen, 0);
      const matchedCount = sourceRuns.reduce((total, source) => total + source.matchedCount, 0);
      const productiveRuns = sourceRuns.filter((source) => source.matchedCount > 0).length;
      const coveragePct = totalRuns > 0 ? (checkedRuns / totalRuns) * 100 : 0;
      const successRatePct = checkedRuns > 0 ? (successCount / checkedRuns) * 100 : null;
      const productivePct = checkedRuns > 0 ? (productiveRuns / checkedRuns) * 100 : 0;
      const matchRatePct = itemsSeen > 0 ? (matchedCount / itemsSeen) * 100 : null;
      const score = checkedRuns > 0
        ? Math.round((successRatePct ?? 0) * 0.45 + coveragePct * 0.4 + productivePct * 0.15)
        : 0;
      const latestRun = sourceRuns[0] ?? null;
      const status = getReliabilityStatus({ checkedRuns, failedCount, score, successRatePct });

      return {
        sourceId: policy.sourceId,
        sourceName: policy.sourceName,
        status,
        score,
        checkedRuns,
        totalRuns,
        successCount,
        failedCount,
        runningCount,
        itemsSeen,
        matchedCount,
        coveragePct: Math.round(coveragePct),
        successRatePct: successRatePct === null ? null : Math.round(successRatePct),
        matchRatePct: matchRatePct === null ? null : Math.round(matchRatePct),
        lastCheckedAt: latestRun?.finishedAt ?? latestRun?.startedAt ?? null,
        latestStatus: normalizeSourceHealthStatus(latestRun?.status),
      };
    })
    .sort((left, right) =>
      getReliabilityRank(left.status) - getReliabilityRank(right.status)
      || left.score - right.score
      || right.checkedRuns - left.checkedRuns
      || left.sourceName.localeCompare(right.sourceName),
    );
}

function getReliabilityStatus(input: {
  checkedRuns: number;
  failedCount: number;
  score: number;
  successRatePct: number | null;
}): SourceReliabilityStatus {
  if (input.checkedRuns === 0) {
    return "no-data";
  }

  if (input.failedCount > 0 && (input.successRatePct ?? 0) < 70) {
    return "flaky";
  }

  if (input.score >= 75) {
    return "stable";
  }

  if (input.score >= 45) {
    return "watch";
  }

  return "flaky";
}

function getReliabilityRank(status: SourceReliabilityStatus) {
  const ranks: Record<SourceReliabilityStatus, number> = {
    flaky: 0,
    watch: 1,
    "no-data": 2,
    stable: 3,
  };
  return ranks[status];
}

function formatReliabilityStatus(status: SourceReliabilityStatus) {
  const labels: Record<SourceReliabilityStatus, string> = {
    stable: "Stable",
    watch: "Watch",
    flaky: "Flaky",
    "no-data": "No data",
  };
  return labels[status];
}

function getReliabilityBarClass(status: SourceReliabilityStatus) {
  const classes: Record<SourceReliabilityStatus, string> = {
    stable: "bg-emerald-600",
    watch: "bg-amber-500",
    flaky: "bg-rose-600",
    "no-data": "bg-slate-400",
  };
  return classes[status];
}

export function buildNewsReadinessItems(
  summary: SummaryResponse | null,
  insights: NewsInsightsResponse,
  sourceHealthRows: SourceHealthRow[],
): ReadinessItem[] {
  const sourceTotal = sourceHealthRows.length;
  const checkedSources = sourceHealthRows.filter((source) => source.status !== "idle").length;
  const failedSources = sourceHealthRows.filter((source) => source.status === "failed").length;
  const runningSources = sourceHealthRows.filter((source) => source.status === "running").length;
  const totalArticles = Math.max(0, summary?.totalArticles ?? insights.quality.totalArticles);
  const classifiedArticles = Math.max(0, summary?.classifiedArticles ?? insights.quality.classifiedArticles);
  const classifiedPct = totalArticles > 0 ? (classifiedArticles / totalArticles) * 100 : 0;
  const contentCoverage = insights.quality.contentCoveragePct;
  const eventCoverage = insights.events.eventCoveragePct;
  const reviewLoad = insights.wild.disclosureRadar.needsReviewCount + insights.wild.activeLearning.total;
  const modelConfidencePct = Math.round(insights.model.averageConfidence * 100);

  return [
    {
      id: "sources",
      label: "Source coverage",
      status: getSourceReadinessStatus(sourceTotal, checkedSources, failedSources, runningSources),
      metric: `${checkedSources}/${sourceTotal}`,
      detail: `${failedSources} failed, ${runningSources} running, ${Math.max(0, sourceTotal - checkedSources)} not checked`,
      action: failedSources > 0 ? "Open failed source rows before trusting broad sentiment." : "Sync missing sources when the market session changes.",
    },
    {
      id: "classification",
      label: "Classification",
      status: getThresholdStatus(classifiedPct, 85, 50, totalArticles > 0),
      metric: `${Math.round(classifiedPct)}%`,
      detail: `${formatNumber(classifiedArticles)}/${formatNumber(totalArticles)} articles classified`,
      action: classifiedPct < 85 ? "Run classify until unknown sentiment stops dominating." : "Sentiment coverage is strong enough for overview use.",
    },
    {
      id: "content",
      label: "Content quality",
      status: getThresholdStatus(contentCoverage, 75, 40, insights.quality.totalArticles > 0),
      metric: `${Math.round(contentCoverage)}%`,
      detail: `${insights.quality.emptyExcerptCount} empty excerpts, avg ${formatScore(insights.quality.averageContentQuality)}`,
      action: contentCoverage < 75 ? "Run enrichment or inspect sources with thin excerpts." : "Article evidence has enough extractable context.",
    },
    {
      id: "events",
      label: "Event coverage",
      status: getThresholdStatus(eventCoverage, 70, 35, insights.quality.totalArticles > 0),
      metric: `${Math.round(eventCoverage)}%`,
      detail: `${insights.events.highMaterialityCount} high-materiality events`,
      action: eventCoverage < 70 ? "Review top narratives and event labels before drawing conclusions." : "Event extraction is covering most visible news.",
    },
    {
      id: "review",
      label: "Review load",
      status: reviewLoad === 0 ? "ready" : reviewLoad <= 4 ? "watch" : "blocked",
      metric: `${reviewLoad}`,
      detail: `${insights.wild.disclosureRadar.needsReviewCount} disclosure gaps, ${insights.wild.activeLearning.total} calibration items`,
      action: reviewLoad > 0 ? "Clear review queue for disclosure-sensitive or low-confidence stories." : "No manual review item is blocking the current view.",
    },
    {
      id: "model",
      label: "Model confidence",
      status: getThresholdStatus(modelConfidencePct, 72, 55, insights.quality.classifiedArticles > 0),
      metric: `${modelConfidencePct}%`,
      detail: `${insights.model.lowConfidenceCount} low-confidence articles`,
      action: modelConfidencePct < 72 ? "Add feedback samples to improve calibration." : "Model confidence is acceptable for research triage.",
    },
  ];
}

export function buildNewsResearchBrief(
  summary: SummaryResponse | null,
  insights: NewsInsightsResponse,
  sourceHealthRows: SourceHealthRow[],
) {
  const items = buildNewsReadinessItems(summary, insights, sourceHealthRows);
  const score = getReadinessScore(items);
  const status = getOverallReadinessStatus(score, items);
  const totalArticles = summary?.totalArticles ?? insights.quality.totalArticles;
  const classifiedArticles = summary?.classifiedArticles ?? insights.quality.classifiedArticles;
  const topNarrative = insights.wild.narrativeRadar.alerts[0];
  const topEvent = insights.events.topEvents[0];
  const failedSources = sourceHealthRows.filter((source) => source.status === "failed").map((source) => source.sourceName);
  const reviewLines = [
    ...insights.wild.disclosureRadar.openItems.slice(0, 2).map((item) => `${item.ticker} ${item.eventLabel}: ${item.severity} disclosure gap`),
    ...insights.wild.activeLearning.queue.slice(0, 2).map((item) => `${item.sourceName}: ${item.reason}`),
  ];

  return [
    "NexaQuant News Brief",
    `Generated: ${formatDateTime(insights.generatedAt)}`,
    `Articles: ${formatNumber(totalArticles)} total, ${formatNumber(classifiedArticles)} classified`,
    `Readiness: ${getReadinessLabel(status)} (${Math.round(score * 100)}%)`,
    "",
    "Readiness gates:",
    ...items.map((item) => `- ${item.label}: ${item.status} - ${item.metric}; ${item.detail}`),
    "",
    "Signals:",
    `- Top narrative: ${topNarrative ? `${topNarrative.label} (${topNarrative.signal})` : "not available"}`,
    `- Top event: ${topEvent ? `${topEvent.eventLabel} ${topEvent.tickers.slice(0, 3).join(", ") || "market"}` : "not available"}`,
    `- Source failures: ${failedSources.length > 0 ? failedSources.join(", ") : "none"}`,
    "",
    "Watchlist evidence:",
    ...toBriefList(insights.wild.dailyBriefing.watchlist.slice(0, 4), "No watchlist evidence"),
    "",
    "Review queue:",
    ...toBriefList(reviewLines, "No review item"),
    "",
    "Evidence only; not a trade instruction.",
  ].join("\n");
}

function toBriefList(items: string[], emptyLabel: string) {
  return items.length > 0 ? items.map((item) => `- ${item}`) : [`- ${emptyLabel}`];
}

function getSourceReadinessStatus(sourceTotal: number, checkedSources: number, failedSources: number, runningSources: number): ReadinessStatus {
  if (sourceTotal === 0 || failedSources > 0) {
    return "blocked";
  }
  if (runningSources > 0 || checkedSources < sourceTotal) {
    return "watch";
  }
  return "ready";
}

function getThresholdStatus(value: number, readyAt: number, watchAt: number, hasData: boolean): ReadinessStatus {
  if (!hasData) {
    return "blocked";
  }
  if (value >= readyAt) {
    return "ready";
  }
  if (value >= watchAt) {
    return "watch";
  }
  return "blocked";
}

function getReadinessScore(items: ReadinessItem[]) {
  if (items.length === 0) {
    return 0;
  }
  const score = items.reduce((total, item) => {
    if (item.status === "ready") {
      return total + 1;
    }
    if (item.status === "watch") {
      return total + 0.55;
    }
    return total;
  }, 0);
  return score / items.length;
}

function getOverallReadinessStatus(score: number, items: ReadinessItem[]): ReadinessStatus {
  if (items.some((item) => item.status === "blocked") && score < 0.72) {
    return "blocked";
  }
  if (score >= 0.8) {
    return "ready";
  }
  return "watch";
}

function getReadinessLabel(status: ReadinessStatus) {
  const labels: Record<ReadinessStatus, string> = {
    ready: "research-ready",
    watch: "needs review",
    blocked: "needs data",
  };
  return labels[status];
}

function getReadinessTextClass(status: ReadinessStatus) {
  const classes: Record<ReadinessStatus, string> = {
    ready: "text-emerald-700",
    watch: "text-amber-700",
    blocked: "text-rose-700",
  };
  return classes[status];
}

function getReadinessBarClass(status: ReadinessStatus) {
  const classes: Record<ReadinessStatus, string> = {
    ready: "bg-emerald-600",
    watch: "bg-amber-500",
    blocked: "bg-rose-600",
  };
  return classes[status];
}

function normalizeSourceHealthStatus(value: unknown): SourceHealthStatus {
  if (value === "success" || value === "failed" || value === "running") {
    return value;
  }
  return "idle";
}

function getSourceHealthRank(status: SourceHealthStatus) {
  const ranks: Record<SourceHealthStatus, number> = {
    failed: 0,
    running: 1,
    success: 2,
    idle: 3,
  };
  return ranks[status];
}

function formatSourceHealthStatus(status: SourceHealthStatus) {
  const labels: Record<SourceHealthStatus, string> = {
    success: "Healthy",
    failed: "Failed",
    running: "Running",
    idle: "Not checked",
  };
  return labels[status];
}

function formatSourceError(error: unknown) {
  if (!error) {
    return null;
  }

  const message = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : stringifySourceError(error);

  if (!message || message === "{}") {
    return null;
  }

  return message.length > 96 ? `${message.slice(0, 93)}...` : message;
}

function stringifySourceError(error: unknown) {
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getSourceLabel(value: string) {
  return SOURCE_OPTIONS.find(([sourceValue]) => sourceValue === value)?.[1] ?? value;
}

function getSourcePolicy(value: string) {
  return SOURCE_POLICIES.find((policy) => policy.sourceId === value)
    ?? SOURCE_POLICIES[0]
    ?? {
      sourceId: value,
      sourceName: value,
      category: "unknown",
      accessMode: "public-page" as const,
      accessLabel: "public listing page",
      usagePolicy: "metadata-excerpt-derived" as const,
      originalLinkRequired: true,
      attributionRequired: true,
      publicDeploymentReviewRequired: true,
      operationalGuardrails: [],
      complianceNote: "Source policy is not catalogued yet.",
    };
}

function getGraphNodeLabel(insights: NewsInsightsResponse, nodeId: string) {
  return insights.wild.entityGraph.nodes.find((node) => node.id === nodeId)?.label ?? nodeId.replace(/^[^:]+:/, "");
}

async function readSyncProgressResponse(
  response: Response,
  onEvent: (event: SyncProgressEvent) => void,
) {
  if (!response.body || !("getReader" in response.body)) {
    return await response.json() as SyncResponse;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    buffer += decoder.decode(result.value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const event = parseSyncProgressChunk(chunk);
      if (!event) {
        continue;
      }
      onEvent(event);
      if (event.type === "run-error") {
        throw new Error(event.message);
      }
    }
  }

  const finalEvent = parseSyncProgressChunk(buffer);
  if (finalEvent) {
    onEvent(finalEvent);
    if (finalEvent.type === "run-error") {
      throw new Error(finalEvent.message);
    }
  }

  return null;
}

async function readSyncErrorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === "string") {
      return body.error;
    }
  } catch {
    return "News sync failed";
  }
  return "News sync failed";
}

async function readClassifyProgressResponse(
  response: Response,
  onEvent: (event: ClassifyProgressEvent) => void,
) {
  if (!response.body || !("getReader" in response.body)) {
    return await response.json() as ClassifyResponse;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    buffer += decoder.decode(result.value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const event = parseClassifyProgressChunk(chunk);
      if (!event) {
        continue;
      }
      onEvent(event);
      if (event.type === "classification-error") {
        throw new Error(event.message);
      }
    }
  }

  const finalEvent = parseClassifyProgressChunk(buffer);
  if (finalEvent) {
    onEvent(finalEvent);
    if (finalEvent.type === "classification-error") {
      throw new Error(finalEvent.message);
    }
  }

  return null;
}

async function readEnrichmentProgressResponse(
  response: Response,
  onEvent: (event: EnrichmentProgressEvent) => void,
) {
  if (!response.body || !("getReader" in response.body)) {
    return await response.json() as EnrichmentResponse;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    buffer += decoder.decode(result.value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const event = parseEnrichmentProgressChunk(chunk);
      if (!event) {
        continue;
      }
      onEvent(event);
      if (event.type === "enrichment-error") {
        throw new Error(event.message);
      }
    }
  }

  const finalEvent = parseEnrichmentProgressChunk(buffer);
  if (finalEvent) {
    onEvent(finalEvent);
    if (finalEvent.type === "enrichment-error") {
      throw new Error(finalEvent.message);
    }
  }

  return null;
}

async function readClassifyErrorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === "string") {
      return body.error;
    }
  } catch {
    return "News classification failed";
  }
  return "News classification failed";
}

async function readEnrichmentErrorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === "string") {
      return body.error;
    }
  } catch {
    return "News enrichment failed";
  }
  return "News enrichment failed";
}

async function readFeedbackErrorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === "string") {
      return body.error;
    }
  } catch {
    return "News feedback failed";
  }
  return "News feedback failed";
}

function parseSyncProgressChunk(chunk: string) {
  const data = chunk
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data) {
    return null;
  }
  return JSON.parse(data) as SyncProgressEvent;
}

function parseClassifyProgressChunk(chunk: string) {
  const data = chunk
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data) {
    return null;
  }
  return JSON.parse(data) as ClassifyProgressEvent;
}

function parseEnrichmentProgressChunk(chunk: string) {
  const data = chunk
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data) {
    return null;
  }
  return JSON.parse(data) as EnrichmentProgressEvent;
}

function createInitialSyncProgress(totalSources: number): SyncProgressView {
  return {
    active: true,
    completed: false,
    currentSourceName: null,
    currentPageNumber: null,
    currentPageUrl: null,
    message: "Menyiapkan sync berita.",
    summary: {
      runId: "",
      status: "running",
      totalSources,
      completedSources: 0,
      successCount: 0,
      failedCount: 0,
      totalCandidates: 0,
      matchedCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
      filteredCount: 0,
    },
    events: [],
  };
}

function createInitialClassifyProgress(): ClassifyProgressView {
  return {
    active: true,
    completed: false,
    currentTitle: null,
    message: "Menyiapkan classify berita.",
    summary: {
      total: 0,
      classifiedCount: 0,
      skippedCount: 0,
      remainingCount: 0,
    },
    events: [],
  };
}

function createInitialEnrichmentProgress(): EnrichmentProgressView {
  return {
    active: true,
    completed: false,
    currentTitle: null,
    currentUrl: null,
    message: "Menyiapkan enrichment berita.",
    summary: {
      totalArticles: 0,
      processedCount: 0,
      enrichedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      remainingCount: 0,
    },
    events: [],
  };
}

function reduceSyncProgress(current: SyncProgressView | null, event: SyncProgressEvent, totalSources: number): SyncProgressView {
  const base = current ?? createInitialSyncProgress(totalSources);
  const eventText = formatSyncProgressEvent(event);
  const active = event.type !== "run-completed" && event.type !== "run-error";
  return {
    active,
    completed: event.type === "run-completed",
    currentSourceName: event.sourceName ?? base.currentSourceName,
    currentPageNumber: event.type === "source-started" ? null : event.pageNumber ?? base.currentPageNumber,
    currentPageUrl: event.type === "source-started" ? null : event.pageUrl ?? base.currentPageUrl,
    message: event.message || base.message,
    summary: event.summary ?? base.summary,
    events: eventText ? [...base.events, eventText].slice(-5) : base.events,
  };
}

function reduceClassifyProgress(current: ClassifyProgressView | null, event: ClassifyProgressEvent): ClassifyProgressView {
  const base = current ?? createInitialClassifyProgress();
  const eventText = formatClassifyProgressEvent(event);
  const active = event.type !== "classification-completed" && event.type !== "classification-error";
  return {
    active,
    completed: event.type === "classification-completed",
    currentTitle: event.title ?? base.currentTitle,
    message: event.message || base.message,
    summary: event.summary ?? base.summary,
    events: eventText ? [...base.events, eventText].slice(-5) : base.events,
  };
}

function reduceEnrichmentProgress(current: EnrichmentProgressView | null, event: EnrichmentProgressEvent): EnrichmentProgressView {
  const base = current ?? createInitialEnrichmentProgress();
  const eventText = formatEnrichmentProgressEvent(event);
  const active = event.type !== "enrichment-completed" && event.type !== "enrichment-error";
  return {
    active,
    completed: event.type === "enrichment-completed",
    currentTitle: event.title ?? base.currentTitle,
    currentUrl: event.url ?? base.currentUrl,
    message: event.message || base.message,
    summary: event.summary ?? base.summary,
    events: eventText ? [...base.events, eventText].slice(-5) : base.events,
  };
}

function formatSyncProgressEvent(event: SyncProgressEvent) {
  if (event.type === "page-completed" && event.sourceName && event.pageNumber) {
    return `${event.sourceName} halaman ${event.pageNumber}: ${event.pageItemCount ?? 0} artikel, ${event.newItemCount ?? 0} baru dibaca.`;
  }
  return event.message;
}

function formatClassifyProgressEvent(event: ClassifyProgressEvent) {
  if ((event.type === "article-started" || event.type === "article-classified") && event.title) {
    return `${event.index ?? "-"}: ${event.title}`;
  }
  return event.message;
}

function formatEnrichmentProgressEvent(event: EnrichmentProgressEvent) {
  if ((event.type === "article-started" || event.type === "article-enriched" || event.type === "article-failed") && event.title) {
    const quality = event.contentQualityScore === undefined ? "" : ` quality ${formatScore(event.contentQualityScore)}`;
    return `${event.index ?? "-"}: ${event.title}${quality}`;
  }
  return event.message;
}

function getSyncProgressPercent(progress: SyncProgressView) {
  const totalSources = Math.max(1, progress.summary.totalSources);
  const activeSourceCredit = progress.active && progress.summary.completedSources < totalSources ? 0.35 : 0;
  const pct = ((progress.summary.completedSources + activeSourceCredit) / totalSources) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function getClassifyProgressPercent(progress: ClassifyProgressView) {
  if (progress.summary.total === 0) {
    return progress.completed ? 100 : 0;
  }
  const done = progress.summary.classifiedCount + progress.summary.skippedCount;
  return Math.max(0, Math.min(100, Math.round((done / progress.summary.total) * 100)));
}

function getEnrichmentProgressPercent(progress: EnrichmentProgressView) {
  if (progress.summary.totalArticles === 0) {
    return progress.completed ? 100 : 0;
  }
  return Math.max(0, Math.min(100, Math.round((progress.summary.processedCount / progress.summary.totalArticles) * 100)));
}

function compactEvidenceChip(item: string) {
  const [, rawValue = item] = item.split(":");
  return rawValue.trim();
}

function findTickerMatch(article: NewsArticle) {
  return article.matches.find((match) =>
    match.matchType.toLowerCase().includes("ticker") || /^[A-Z]{3,5}$/.test(match.matchValue.toUpperCase()),
  )?.matchValue.toUpperCase() ?? null;
}

function getToneAccent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "text-slate-950";
  }

  if (value > 0.15) {
    return "text-emerald-700";
  }

  if (value < -0.15) {
    return "text-rose-700";
  }

  return "text-amber-700";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "not available";
  }
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShortDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCompactUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return value;
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatScore(value: number | null | undefined) {
  return value === null || value === undefined ? "n/a" : value.toFixed(2);
}

function formatPercentValue(value: number | null | undefined) {
  return value === null || value === undefined ? "n/a" : `${Math.round(value)}%`;
}

function formatSignedDecimal(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatSignedPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}
