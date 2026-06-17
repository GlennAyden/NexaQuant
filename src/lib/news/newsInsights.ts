import { NEWS_SENTIMENT_MODEL } from "@/lib/news/sentimentEngine";
import type { NewsArticle, NewsEnrichmentRun, NewsFeedbackItem, NewsFeedbackSummary, NewsSourceStatus, NewsSummary } from "@/lib/news/types";
import type { Bar } from "@/lib/market/types";

export type NewsInsights = {
  generatedAt: string;
  phases: NewsInsightPhase[];
  quality: NewsQualityInsight;
  events: NewsEventInsight;
  discovery: NewsDiscoveryInsight;
  market: NewsMarketInsight;
  model: NewsModelInsight;
  wild: NewsWildInsight;
};

export type NewsInsightPhase = {
  id: "quality" | "intelligence" | "discovery" | "market" | "model";
  phase: string;
  title: string;
  status: "live" | "partial" | "needs-data";
  progress: number;
  signal: string;
  evidence: string[];
  nextStep: string;
};

export type NewsQualityInsight = {
  totalArticles: number;
  classifiedArticles: number;
  pendingClassifications: number;
  contentCoveragePct: number;
  extractionCoveragePct: number;
  emptyExcerptCount: number;
  averageContentQuality: number;
  latestEnrichmentRun: NewsEnrichmentRun | null;
  sourceDiagnostics: Array<{
    sourceName: string;
    totalArticles: number;
    emptyExcerptCount: number;
    averageContentQuality: number;
    latestStatus: NewsSourceStatus["status"] | "unknown";
    duplicateCount: number;
    filteredCount: number;
  }>;
};

export type NewsEventInsight = {
  eventCoveragePct: number;
  highMaterialityCount: number;
  eventCounts: Array<{ eventType: string; total: number }>;
  topEvents: NewsEventProfile[];
};

export type NewsEventProfile = {
  articleId: string;
  title: string;
  sourceName: string;
  eventType: string;
  eventLabel: string;
  materialityScore: number;
  confidenceScore: number;
  tickers: string[];
  moneyAmounts: string[];
  percentages: string[];
};

export type NewsDiscoveryInsight = {
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

export type NewsMarketInsight = {
  linkedTickerCount: number;
  impactSamples: Array<{
    articleId: string;
    title: string;
    ticker: string;
    eventDate: string;
    startClose: number | null;
    return3dPct: number | null;
    volumeRatio: number | null;
    evidence: string;
  }>;
};

export type NewsModelInsight = {
  modelName: string;
  averageConfidence: number;
  lowConfidenceCount: number;
  feedbackReady: boolean;
  feedbackSummary: NewsFeedbackSummary;
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

export type NewsWildInsight = {
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

type BuildNewsInsightsInput = {
  articles: NewsArticle[];
  historyArticles?: NewsArticle[];
  summary: NewsSummary;
  sourceStatuses: NewsSourceStatus[];
  latestEnrichmentRun?: NewsEnrichmentRun | null;
  feedbackSummary?: NewsFeedbackSummary;
  feedbackItems?: NewsFeedbackItem[];
  getBarsForTicker?: (ticker: string) => Bar[];
};

const EMPTY_FEEDBACK_SUMMARY: NewsFeedbackSummary = {
  totalFeedback: 0,
  latestFeedbackAt: null,
  correctedPositive: 0,
  correctedNeutral: 0,
  correctedNegative: 0,
  averageCorrectedRelevance: null,
};

const EVENT_RULES = [
  { type: "right_issue", label: "Right Issue", terms: ["right issue", "hmtd", "hak memesan efek"], base: 0.86 },
  { type: "buyback", label: "Buyback", terms: ["buyback", "pembelian kembali"], base: 0.78 },
  { type: "dividend", label: "Dividen", terms: ["dividen", "cum date", "ex date"], base: 0.76 },
  { type: "ipo", label: "IPO", terms: ["ipo", "initial public offering", "penawaran umum"], base: 0.72 },
  { type: "earnings", label: "Laba/Rugi", terms: ["laba", "rugi", "pendapatan", "kinerja keuangan"], base: 0.74 },
  { type: "ownership", label: "Kepemilikan", terms: ["kepemilikan", "afiliasi", "akuisisi", "divestasi", "saham treasury"], base: 0.8 },
  { type: "rups", label: "RUPS", terms: ["rups", "rupst", "direktur", "komisaris"], base: 0.58 },
  { type: "debt", label: "Obligasi/Utang", terms: ["obligasi", "sukuk", "utang", "peringkat"], base: 0.62 },
  { type: "macro_policy", label: "Makro/Kebijakan", terms: ["rupiah", "inflasi", "suku bunga", "bank indonesia", "bi rate"], base: 0.66 },
  { type: "price_action", label: "Gerak Pasar", terms: ["ihsg", "menguat", "melemah", "rebound", "terkoreksi"], base: 0.54 },
] as const;

const SEMANTIC_GROUPS = [
  { label: "Corporate Action", keywords: ["right issue", "hmtd", "dividen", "buyback", "stock split", "rups"] },
  { label: "Earnings & Fundamental", keywords: ["laba", "rugi", "pendapatan", "margin", "kinerja keuangan"] },
  { label: "Flow & Liquidity", keywords: ["asing", "net buy", "volume", "likuiditas", "transaksi"] },
  { label: "Macro Rate & Currency", keywords: ["rupiah", "inflasi", "suku bunga", "bi rate", "bank indonesia"] },
  { label: "Commodity & Sector", keywords: ["batubara", "emas", "nikel", "cpo", "minyak"] },
] as const;

const OFFICIAL_DISCLOSURE_SOURCE = {
  name: "IDX Keterbukaan Informasi",
  url: "https://www.idx.co.id/id/perusahaan-tercatat/keterbukaan-informasi",
};

export function buildNewsInsights(input: BuildNewsInsightsInput): NewsInsights {
  const eventProfiles = input.articles.map(buildEventProfile);
  const historyArticles = input.historyArticles ?? input.articles;
  const historyEventProfiles = historyArticles.map(buildEventProfile);
  const quality = buildQualityInsight(input.articles, input.summary, input.sourceStatuses, input.latestEnrichmentRun ?? null);
  const events = buildEventInsight(eventProfiles);
  const discovery = buildDiscoveryInsight(input.articles, eventProfiles);
  const market = buildMarketInsight(input.articles, eventProfiles, input.getBarsForTicker);
  const model = buildModelInsight(input.articles, eventProfiles, input.feedbackSummary ?? EMPTY_FEEDBACK_SUMMARY, input.feedbackItems ?? []);
  const wild = buildWildInsight({
    articles: input.articles,
    eventProfiles,
    historyArticles,
    historyEventProfiles,
    sourceStatuses: input.sourceStatuses,
    discovery,
    getBarsForTicker: input.getBarsForTicker,
  });

  return {
    generatedAt: new Date().toISOString(),
    phases: buildPhaseCards({ quality, events, discovery, market, model }),
    quality,
    events,
    discovery,
    market,
    model,
    wild,
  };
}

export function buildEventProfile(article: NewsArticle): NewsEventProfile {
  const text = `${article.title} ${article.excerpt} ${article.content}`.toLocaleLowerCase("id-ID");
  const matchedRule = EVENT_RULES
    .map((rule) => ({
      ...rule,
      hits: rule.terms.filter((term) => text.includes(term)),
    }))
    .filter((rule) => rule.hits.length > 0)
    .sort((a, b) => b.base + b.hits.length * 0.04 - (a.base + a.hits.length * 0.04))[0];
  const tickers = getArticleTickers(article);
  const moneyAmounts = extractMatches(`${article.title} ${article.excerpt} ${article.content}`, /\bRp\s?[\d.,]+\s?(?:triliun|t|miliar|m|juta)?\b/gi);
  const percentages = extractMatches(`${article.title} ${article.excerpt} ${article.content}`, /\b\d+(?:[,.]\d+)?%\b/g);
  const eventType = matchedRule?.type ?? (tickers.length > 0 ? "issuer_update" : "general_market");
  const eventLabel = matchedRule?.label ?? (tickers.length > 0 ? "Update Emiten" : "Market Umum");
  const relevance = article.sentiment?.relevanceScore ?? 0.3;
  const contentQuality = getArticleContentQuality(article);
  const confidenceScore = clampScore((matchedRule?.base ?? 0.42) + Math.min(0.12, tickers.length * 0.04) + contentQuality * 0.12);
  const materialityScore = clampScore(
    relevance * 0.48
    + confidenceScore * 0.34
    + Math.min(0.18, moneyAmounts.length * 0.06 + percentages.length * 0.04 + tickers.length * 0.03),
  );

  return {
    articleId: article.id,
    title: article.title,
    sourceName: article.sourceName,
    eventType,
    eventLabel,
    materialityScore,
    confidenceScore,
    tickers,
    moneyAmounts,
    percentages,
  };
}

function buildQualityInsight(
  articles: NewsArticle[],
  summary: NewsSummary,
  sourceStatuses: NewsSourceStatus[],
  latestEnrichmentRun: NewsEnrichmentRun | null,
): NewsQualityInsight {
  const bySource = new Map<string, NewsArticle[]>();
  for (const article of articles) {
    const items = bySource.get(article.sourceName) ?? [];
    items.push(article);
    bySource.set(article.sourceName, items);
  }
  const statusBySource = new Map<string, NewsSourceStatus>(sourceStatuses.map((status) => [status.sourceName, status]));
  const qualityScores = articles.map(getArticleContentQuality);
  const contentCount = articles.filter((article) => article.content.trim().length > 0).length;
  const extractedCount = articles.filter((article) => article.extractionStatus === "extracted").length;
  const emptyExcerptCount = articles.filter((article) => article.excerpt.trim().length === 0).length;

  return {
    totalArticles: summary.totalArticles,
    classifiedArticles: summary.classifiedArticles,
    pendingClassifications: summary.unclassifiedArticles,
    contentCoveragePct: pct(contentCount, articles.length),
    extractionCoveragePct: pct(extractedCount, articles.length),
    emptyExcerptCount,
    averageContentQuality: average(qualityScores),
    latestEnrichmentRun,
    sourceDiagnostics: [...bySource.entries()]
      .map(([sourceName, items]) => {
        const latestStatus = statusBySource.get(sourceName);
        const latestStatusValue: NewsQualityInsight["sourceDiagnostics"][number]["latestStatus"] =
          latestStatus?.status ?? "unknown";
        return {
          sourceName,
          totalArticles: items.length,
          emptyExcerptCount: items.filter((article) => article.excerpt.trim().length === 0).length,
          averageContentQuality: average(items.map(getArticleContentQuality)),
          latestStatus: latestStatusValue,
          duplicateCount: latestStatus?.duplicateCount ?? 0,
          filteredCount: latestStatus?.filteredCount ?? 0,
        };
      })
      .sort((a, b) => b.emptyExcerptCount - a.emptyExcerptCount || b.totalArticles - a.totalArticles),
  };
}

function buildEventInsight(eventProfiles: NewsEventProfile[]): NewsEventInsight {
  const counts = countBy(eventProfiles.map((event) => event.eventLabel));
  const meaningfulEvents = eventProfiles.filter((event) => event.eventType !== "general_market");
  return {
    eventCoveragePct: pct(meaningfulEvents.length, eventProfiles.length),
    highMaterialityCount: eventProfiles.filter((event) => event.materialityScore >= 0.75).length,
    eventCounts: [...counts.entries()].map(([eventType, total]) => ({ eventType, total })).sort((a, b) => b.total - a.total),
    topEvents: [...eventProfiles].sort((a, b) => b.materialityScore - a.materialityScore).slice(0, 8),
  };
}

function buildDiscoveryInsight(articles: NewsArticle[], eventProfiles: NewsEventProfile[]): NewsDiscoveryInsight {
  const topicCounts = countBy(articles.flatMap((article) => [
    ...article.matchedKeywords,
    ...article.matches.map((match) => match.matchValue),
  ]).filter(Boolean).map((item) => item.toUpperCase()));
  const clusterMap = new Map<string, {
    key: string;
    label: string;
    total: number;
    sentimentMix: Record<string, number>;
    sampleTitles: string[];
  }>();
  const semanticMap = new Map<string, {
    label: string;
    total: number;
    keywords: string[];
    sampleTitles: string[];
  }>();

  for (const [index, article] of articles.entries()) {
    const event = eventProfiles[index];
    const primaryTicker = event.tickers[0] ?? getArticleTickers(article)[0] ?? "MARKET";
    const key = `${event.eventLabel}:${primaryTicker}`;
    const cluster = clusterMap.get(key) ?? {
      key,
      label: `${event.eventLabel} - ${primaryTicker}`,
      total: 0,
      sentimentMix: {},
      sampleTitles: [],
    };
    cluster.total += 1;
    const label = article.sentiment?.sentimentLabel ?? "unknown";
    cluster.sentimentMix[label] = (cluster.sentimentMix[label] ?? 0) + 1;
    if (cluster.sampleTitles.length < 3) {
      cluster.sampleTitles.push(article.title);
    }
    clusterMap.set(key, cluster);

    const articleText = `${article.title} ${article.excerpt} ${article.content}`.toLocaleLowerCase("id-ID");
    for (const theme of SEMANTIC_GROUPS) {
      const hits = theme.keywords.filter((keyword) => articleText.includes(keyword));
      if (hits.length === 0) {
        continue;
      }
      const group = semanticMap.get(theme.label) ?? {
        label: theme.label,
        total: 0,
        keywords: [],
        sampleTitles: [],
      };
      group.total += 1;
      group.keywords = [...new Set([...group.keywords, ...hits])].slice(0, 6);
      if (group.sampleTitles.length < 3) {
        group.sampleTitles.push(article.title);
      }
      semanticMap.set(theme.label, group);
    }
  }

  return {
    topics: [...topicCounts.entries()]
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
      .slice(0, 12),
    clusters: [...clusterMap.values()].sort((a, b) => b.total - a.total).slice(0, 8),
    semanticGroups: [...semanticMap.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)).slice(0, 6),
  };
}

function buildMarketInsight(
  articles: NewsArticle[],
  eventProfiles: NewsEventProfile[],
  getBarsForTicker: BuildNewsInsightsInput["getBarsForTicker"],
): NewsMarketInsight {
  if (!getBarsForTicker) {
    return { linkedTickerCount: 0, impactSamples: [] };
  }
  const samples: NewsMarketInsight["impactSamples"] = [];
  const linkedTickers = new Set<string>();

  for (const [index, event] of eventProfiles.entries()) {
    const article = articles[index];
    for (const ticker of event.tickers.slice(0, 2)) {
      const bars = getBarsForTicker(ticker);
      const impact = computeImpact(article, ticker, bars);
      if (impact) {
        linkedTickers.add(ticker);
        samples.push(impact);
      }
      if (samples.length >= 8) {
        break;
      }
    }
    if (samples.length >= 8) {
      break;
    }
  }

  return {
    linkedTickerCount: linkedTickers.size,
    impactSamples: samples,
  };
}

function buildModelInsight(
  articles: NewsArticle[],
  eventProfiles: NewsEventProfile[],
  feedbackSummary: NewsFeedbackSummary,
  feedbackItems: NewsFeedbackItem[],
): NewsModelInsight {
  const confidences = articles.map((article, index) => {
    const relevance = article.sentiment?.relevanceScore ?? 0;
    const contentQuality = getArticleContentQuality(article);
    return clampScore(relevance * 0.54 + eventProfiles[index].confidenceScore * 0.3 + contentQuality * 0.16);
  });
  const lowConfidenceCount = confidences.filter((score) => score < 0.5).length;
  const feedbackDiagnostics = buildFeedbackDiagnostics(feedbackItems);

  return {
    modelName: NEWS_SENTIMENT_MODEL,
    averageConfidence: average(confidences),
    lowConfidenceCount,
    feedbackReady: true,
    feedbackSummary,
    feedbackDiagnostics,
    evaluationQueueCount: lowConfidenceCount + feedbackDiagnostics.sampleSize,
    calibrationNotes: [
      "Lexicon score remains inspectable.",
      `${feedbackDiagnostics.sampleSize} human feedback items are ready for calibration.`,
      "Optional FinBERT/LLM layer should be treated as a cross-check, not a trading signal.",
    ],
  };
}

function buildFeedbackDiagnostics(feedbackItems: NewsFeedbackItem[]): NewsModelInsight["feedbackDiagnostics"] {
  const comparable = feedbackItems.filter((item) => item.previousSentimentLabel !== null);
  const changed = comparable.filter((item) => item.previousSentimentLabel !== item.sentimentLabel);
  const deltas = feedbackItems
    .map((item) => item.previousRelevanceScore === null ? null : item.relevanceScore - item.previousRelevanceScore)
    .filter((value): value is number => value !== null);

  return {
    sampleSize: feedbackItems.length,
    sentimentChangeCount: changed.length,
    disagreementRatePct: comparable.length > 0 ? pct(changed.length, comparable.length) : null,
    averageRelevanceDelta: deltas.length > 0 ? roundScore(average(deltas)) : null,
    latestCorrections: feedbackItems.slice(0, 5).map((item) => ({
      articleId: item.articleId,
      title: item.title,
      sourceName: item.sourceName,
      from: item.previousSentimentLabel ?? "unclassified",
      to: item.sentimentLabel,
      relevanceDelta: item.previousRelevanceScore === null ? null : roundScore(item.relevanceScore - item.previousRelevanceScore),
      note: item.note,
    })),
  };
}

function buildWildInsight(input: {
  articles: NewsArticle[];
  eventProfiles: NewsEventProfile[];
  historyArticles: NewsArticle[];
  historyEventProfiles: NewsEventProfile[];
  sourceStatuses: NewsSourceStatus[];
  discovery: NewsDiscoveryInsight;
  getBarsForTicker: BuildNewsInsightsInput["getBarsForTicker"];
}): NewsWildInsight {
  const marketMemory = buildMarketMemory(input.articles, input.eventProfiles, input.historyArticles, input.historyEventProfiles, input.getBarsForTicker);
  const eventImpactLab = buildEventImpactLab(input.historyArticles, input.historyEventProfiles, input.getBarsForTicker);
  const narrativeRadar = buildNarrativeRadar(input.articles);
  const velocity = buildVelocityInsight(input.articles);
  const sourceQuality = buildSourceQualityInsight(input.articles, input.sourceStatuses);
  const disclosureRadar = buildDisclosureRadar(input.articles, input.eventProfiles);
  const entityGraph = buildEntityGraph(input.articles, input.eventProfiles);
  const activeLearning = buildActiveLearningQueue(input.articles, input.eventProfiles);
  const dailyBriefing = buildDailyBriefing({
    events: input.eventProfiles,
    discovery: input.discovery,
    marketMemory,
    eventImpactLab,
    narrativeRadar,
    velocity,
    sourceQuality,
    disclosureRadar,
    activeLearning,
  });

  return {
    marketMemory,
    eventImpactLab,
    narrativeRadar,
    velocity,
    sourceQuality,
    disclosureRadar,
    entityGraph,
    activeLearning,
    dailyBriefing,
  };
}

function buildMarketMemory(
  articles: NewsArticle[],
  eventProfiles: NewsEventProfile[],
  historyArticles: NewsArticle[],
  historyEventProfiles: NewsEventProfile[],
  getBarsForTicker: BuildNewsInsightsInput["getBarsForTicker"],
): NewsWildInsight["marketMemory"] {
  if (!getBarsForTicker) {
    return { examples: [] };
  }

  const examples = [...eventProfiles]
    .map((event, index) => ({ event, article: articles[index] }))
    .filter(({ event }) => event.tickers.length > 0)
    .sort((a, b) => b.event.materialityScore - a.event.materialityScore)
    .slice(0, 8)
    .map(({ event, article }) => {
      const ticker = event.tickers[0];
      const similar = findSimilarHistoricalEvents(article, event, historyArticles, historyEventProfiles).slice(0, 20);
      const impacts = similar
        .map(({ article: historyArticle, event: historyEvent }) => computeImpact(historyArticle, historyEvent.tickers[0] ?? ticker, getBarsForTicker(historyEvent.tickers[0] ?? ticker)))
        .filter((impact): impact is NonNullable<ReturnType<typeof computeImpact>> => Boolean(impact));
      const returnValues = impacts.map((impact) => impact.return3dPct).filter((value): value is number => value !== null);
      const volumeValues = impacts.map((impact) => impact.volumeRatio).filter((value): value is number => value !== null);
      const averageReturn = returnValues.length > 0 ? average(returnValues) : null;
      const winRate = returnValues.length > 0 ? pct(returnValues.filter((value) => value > 0).length, returnValues.length) : null;
      const averageVolume = volumeValues.length > 0 ? average(volumeValues) : null;

      return {
        articleId: article.id,
        title: article.title,
        ticker,
        eventLabel: event.eventLabel,
        similarCount: similar.length,
        averageReturn3dPct: averageReturn,
        winRatePct: winRate,
        averageVolumeRatio: averageVolume,
        sampleTitles: similar.map((item) => item.article.title).slice(0, 3),
        evidence: similar.length > 0
          ? `${similar.length} similar stories; avg 3D return ${formatSignedPct(averageReturn)}; win rate ${winRate ?? "n/a"}%.`
          : "No similar historical stories in the current local news memory.",
      };
    })
    .filter((item) => item.similarCount > 0)
    .slice(0, 5);

  return { examples };
}

function buildEventImpactLab(
  historyArticles: NewsArticle[],
  historyEventProfiles: NewsEventProfile[],
  getBarsForTicker: BuildNewsInsightsInput["getBarsForTicker"],
): NewsWildInsight["eventImpactLab"] {
  if (!getBarsForTicker) {
    return { eventStats: [] };
  }

  const groups = new Map<string, {
    eventLabel: string;
    returns: number[];
    volumeRatios: number[];
    tickers: string[];
    count: number;
  }>();

  for (const [index, event] of historyEventProfiles.entries()) {
    const article = historyArticles[index];
    const group = groups.get(event.eventLabel) ?? {
      eventLabel: event.eventLabel,
      returns: [],
      volumeRatios: [],
      tickers: [],
      count: 0,
    };
    for (const ticker of event.tickers.slice(0, 2)) {
      const impact = computeImpact(article, ticker, getBarsForTicker(ticker));
      if (!impact) {
        continue;
      }
      group.count += 1;
      group.tickers.push(ticker);
      if (impact.return3dPct !== null) {
        group.returns.push(impact.return3dPct);
      }
      if (impact.volumeRatio !== null) {
        group.volumeRatios.push(impact.volumeRatio);
      }
    }
    groups.set(event.eventLabel, group);
  }

  return {
    eventStats: [...groups.values()]
      .filter((group) => group.count > 0)
      .map((group) => ({
        eventLabel: group.eventLabel,
        sampleCount: group.count,
        averageReturn3dPct: group.returns.length > 0 ? average(group.returns) : null,
        winRatePct: group.returns.length > 0 ? pct(group.returns.filter((value) => value > 0).length, group.returns.length) : null,
        averageVolumeRatio: group.volumeRatios.length > 0 ? average(group.volumeRatios) : null,
        topTickers: topCounts(group.tickers, 4),
      }))
      .sort((a, b) => b.sampleCount - a.sampleCount || Math.abs(b.averageReturn3dPct ?? 0) - Math.abs(a.averageReturn3dPct ?? 0))
      .slice(0, 8),
  };
}

function buildNarrativeRadar(articles: NewsArticle[]): NewsWildInsight["narrativeRadar"] {
  const latestTime = getLatestArticleTime(articles);
  const recentCutoff = latestTime - 48 * 3_600_000;
  const priorCutoff = latestTime - 7 * 86_400_000;
  const groups = new Map<string, {
    label: string;
    total: number;
    recentCount: number;
    priorCount: number;
    sampleTitles: string[];
  }>();

  for (const article of articles) {
    const articleTime = getArticleTime(article);
    for (const label of getSemanticLabelsForArticle(article)) {
      const group = groups.get(label) ?? {
        label,
        total: 0,
        recentCount: 0,
        priorCount: 0,
        sampleTitles: [],
      };
      group.total += 1;
      if (articleTime >= recentCutoff) {
        group.recentCount += 1;
      } else if (articleTime >= priorCutoff) {
        group.priorCount += 1;
      }
      if (group.sampleTitles.length < 3) {
        group.sampleTitles.push(article.title);
      }
      groups.set(label, group);
    }
  }

  return {
    alerts: [...groups.values()]
      .map((group) => {
        const expectedRecent = group.priorCount / 2.5;
        const momentumScore = roundScore(group.recentCount - expectedRecent);
        return {
          ...group,
          momentumScore,
          signal: momentumScore > 2
            ? "accelerating"
            : momentumScore < -1
              ? "cooling"
              : "steady",
        };
      })
      .filter((group) => group.total > 0)
      .sort((a, b) => b.momentumScore - a.momentumScore || b.total - a.total)
      .slice(0, 6),
  };
}

function buildVelocityInsight(articles: NewsArticle[]): NewsWildInsight["velocity"] {
  const latestTime = getLatestArticleTime(articles);
  const last24Cutoff = latestTime - 24 * 3_600_000;
  const previous24Cutoff = latestTime - 48 * 3_600_000;
  const last24 = articles.filter((article) => getArticleTime(article) >= last24Cutoff);
  const previous24 = articles.filter((article) => {
    const time = getArticleTime(article);
    return time >= previous24Cutoff && time < last24Cutoff;
  });
  const accelerationPct = previous24.length > 0
    ? Math.round(((last24.length - previous24.length) / previous24.length) * 100)
    : last24.length > 0 ? 100 : null;

  return {
    last24hCount: last24.length,
    previous24hCount: previous24.length,
    accelerationPct,
    topSources: topCountEntries(last24.map((article) => article.sourceName), 5).map(([sourceName, total]) => ({ sourceName, total })),
  };
}

function buildSourceQualityInsight(articles: NewsArticle[], sourceStatuses: NewsSourceStatus[]): NewsWildInsight["sourceQuality"] {
  const bySource = new Map<string, NewsArticle[]>();
  for (const article of articles) {
    const items = bySource.get(article.sourceName) ?? [];
    items.push(article);
    bySource.set(article.sourceName, items);
  }
  const statusBySource = new Map(sourceStatuses.map((status) => [status.sourceName, status]));

  return [...bySource.entries()].map(([sourceName, items]) => {
    const status = statusBySource.get(sourceName);
    const classificationCoveragePct = pct(items.filter((article) => article.sentiment).length, items.length);
    const averageRelevance = average(items.map((article) => article.sentiment?.relevanceScore ?? 0));
    const averageContentQuality = average(items.map(getArticleContentQuality));
    const duplicateCount = status?.duplicateCount ?? 0;
    const duplicatePenalty = duplicateCount > items.length ? 0.15 : 0;
    const score = clampScore(
      averageContentQuality * 0.35
      + (classificationCoveragePct / 100) * 0.25
      + averageRelevance * 0.25
      + Math.min(0.15, items.length / 100)
      - duplicatePenalty,
    );
    return {
      sourceName,
      score,
      totalArticles: items.length,
      classificationCoveragePct,
      averageRelevance,
      averageContentQuality,
      duplicateCount,
      warning: averageContentQuality < 0.3
        ? "low extraction quality"
        : classificationCoveragePct < 50
          ? "classification sparse"
          : duplicatePenalty > 0
            ? "duplicate heavy"
            : null,
    };
  }).sort((a, b) => b.score - a.score || b.totalArticles - a.totalArticles);
}

function buildDisclosureRadar(articles: NewsArticle[], eventProfiles: NewsEventProfile[]): NewsWildInsight["disclosureRadar"] {
  const confirmedCount = eventProfiles.filter((_event, index) => isOfficialDisclosureSource(articles[index])).length;
  const openItems = eventProfiles
    .map((event, index) => ({ event, article: articles[index] }))
    .filter(({ event, article }) =>
      event.tickers.length > 0
      && isDisclosureSensitiveEvent(event)
      && !isOfficialDisclosureSource(article),
    )
    .sort((a, b) => b.event.materialityScore - a.event.materialityScore)
    .slice(0, 8)
    .map(({ event, article }) => ({
      articleId: article.id,
      title: article.title,
      ticker: event.tickers[0],
      eventLabel: event.eventLabel,
      severity: event.materialityScore >= 0.75 ? "high" as const : "medium" as const,
      evidence: `${event.eventLabel} for ${event.tickers[0]} came from ${article.sourceName}; official disclosure source not captured in this set.`,
      officialSourceName: OFFICIAL_DISCLOSURE_SOURCE.name,
      officialSearchUrl: OFFICIAL_DISCLOSURE_SOURCE.url,
    }));

  return {
    confirmedCount,
    needsReviewCount: openItems.length,
    openItems,
  };
}

function buildEntityGraph(articles: NewsArticle[], eventProfiles: NewsEventProfile[]): NewsWildInsight["entityGraph"] {
  const nodes = new Map<string, NewsWildInsight["entityGraph"]["nodes"][number]>();
  const edges = new Map<string, NewsWildInsight["entityGraph"]["edges"][number]>();

  const addNode = (id: string, label: string, type: NewsWildInsight["entityGraph"]["nodes"][number]["type"]) => {
    const node = nodes.get(id) ?? { id, label, type, total: 0 };
    node.total += 1;
    nodes.set(id, node);
  };
  const addEdge = (from: string, to: string, evidence: string) => {
    const key = `${from}->${to}`;
    const edge = edges.get(key) ?? { from, to, weight: 0, evidence };
    edge.weight += 1;
    edges.set(key, edge);
  };

  for (const [index, article] of articles.entries()) {
    const event = eventProfiles[index];
    const sourceId = `source:${article.sourceName}`;
    const eventId = `event:${event.eventLabel}`;
    addNode(sourceId, article.sourceName, "source");
    addNode(eventId, event.eventLabel, "event");

    for (const ticker of event.tickers.slice(0, 3)) {
      const tickerId = `ticker:${ticker}`;
      addNode(tickerId, ticker, "ticker");
      addEdge(sourceId, tickerId, `${article.sourceName} covered ${ticker}`);
      addEdge(eventId, tickerId, `${event.eventLabel} linked to ${ticker}`);
    }

    for (const theme of getSemanticLabelsForArticle(article).slice(0, 2)) {
      const themeId = `theme:${theme}`;
      addNode(themeId, theme, "theme");
      addEdge(themeId, eventId, `${theme} narrative maps to ${event.eventLabel}`);
    }
  }

  const topNodes = [...nodes.values()]
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .slice(0, 12);
  const topNodeIds = new Set(topNodes.map((node) => node.id));
  const topEdges = [...edges.values()]
    .filter((edge) => topNodeIds.has(edge.from) && topNodeIds.has(edge.to))
    .sort((a, b) => b.weight - a.weight || a.from.localeCompare(b.from))
    .slice(0, 12);

  return {
    topHub: topNodes[0]?.label ?? null,
    nodes: topNodes,
    edges: topEdges,
  };
}

function buildActiveLearningQueue(articles: NewsArticle[], eventProfiles: NewsEventProfile[]): NewsWildInsight["activeLearning"] {
  const queue = articles
    .map((article, index) => {
      const event = eventProfiles[index];
      const relevance = article.sentiment?.relevanceScore ?? 0;
      const sentimentUnknown = !article.sentiment || article.sentiment.sentimentLabel === "unknown";
      const contentSparse = article.extractionStatus === "summary-only" || getArticleContentQuality(article) < 0.35;
      const materialEventLowRelevance = event.materialityScore >= 0.72 && relevance < 0.6;
      const priority = clampScore(
        (sentimentUnknown ? 0.35 : 0)
        + (contentSparse ? 0.25 : 0)
        + (materialEventLowRelevance ? 0.25 : 0)
        + Math.max(0, 0.55 - relevance) * 0.2
        + event.materialityScore * 0.12,
      );
      const reasons = [
        sentimentUnknown ? "sentiment unknown" : null,
        contentSparse ? "content sparse" : null,
        materialEventLowRelevance ? "material event with low relevance" : null,
      ].filter((item): item is string => Boolean(item));

      return {
        articleId: article.id,
        title: article.title,
        sourceName: article.sourceName,
        priority,
        reason: reasons.join(", ") || "confidence calibration sample",
      };
    })
    .filter((item) => item.priority >= 0.35)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8)
    .map((item) => ({ ...item, priority: roundScore(item.priority) }));

  return {
    total: queue.length,
    queue,
  };
}

function buildDailyBriefing(input: {
  events: NewsEventProfile[];
  discovery: NewsDiscoveryInsight;
  marketMemory: NewsWildInsight["marketMemory"];
  eventImpactLab: NewsWildInsight["eventImpactLab"];
  narrativeRadar: NewsWildInsight["narrativeRadar"];
  velocity: NewsWildInsight["velocity"];
  sourceQuality: NewsWildInsight["sourceQuality"];
  disclosureRadar: NewsWildInsight["disclosureRadar"];
  activeLearning: NewsWildInsight["activeLearning"];
}): NewsWildInsight["dailyBriefing"] {
  const topNarrative = input.narrativeRadar.alerts[0];
  const topEvent = [...input.events].sort((a, b) => b.materialityScore - a.materialityScore)[0];
  const topMemory = input.marketMemory.examples[0];
  const topImpact = input.eventImpactLab.eventStats[0];
  const topSource = input.sourceQuality[0];
  const bullets = [
    topNarrative ? `${topNarrative.label} is ${topNarrative.signal} with ${topNarrative.recentCount} recent articles.` : "No dominant narrative detected yet.",
    topEvent ? `${topEvent.eventLabel} is the highest-materiality event cluster in the visible set.` : "No material event cluster detected yet.",
    topMemory ? `${topMemory.ticker} memory: ${topMemory.evidence}` : "Market memory has no comparable local story yet.",
    `News velocity: ${input.velocity.last24hCount} articles in the last 24h versus ${input.velocity.previous24hCount} before.`,
    input.disclosureRadar.needsReviewCount > 0
      ? `${input.disclosureRadar.needsReviewCount} disclosure-sensitive stories still need official-source review.`
      : "No disclosure gap detected in the visible set.",
  ];
  const watchlist = [
    topImpact ? `${topImpact.eventLabel}: avg 3D ${formatSignedPct(topImpact.averageReturn3dPct)}, win ${topImpact.winRatePct ?? "n/a"}%` : "Event lab needs more OHLCV-linked samples.",
    topSource ? `${topSource.sourceName}: source score ${Math.round(topSource.score * 100)}%` : "Source scoring needs article data.",
    input.discovery.semanticGroups[0] ? `${input.discovery.semanticGroups[0].label}: ${input.discovery.semanticGroups[0].total} articles` : "Semantic groups need more matched text.",
    input.activeLearning.total > 0 ? `${input.activeLearning.total} articles queued for manual calibration.` : "Active-learning queue is clear.",
  ];

  return {
    title: "Daily Market Briefing",
    bullets,
    watchlist,
  };
}

function buildPhaseCards(input: {
  quality: NewsQualityInsight;
  events: NewsEventInsight;
  discovery: NewsDiscoveryInsight;
  market: NewsMarketInsight;
  model: NewsModelInsight;
}): NewsInsightPhase[] {
  return [
    {
      id: "quality",
      phase: "Phase 1",
      title: "Quality & Extraction",
      status: input.quality.contentCoveragePct >= 70 ? "live" : "partial",
      progress: Math.max(input.quality.contentCoveragePct, input.quality.extractionCoveragePct),
      signal: `${input.quality.contentCoveragePct}% content coverage, ${input.quality.emptyExcerptCount} empty excerpts`,
      evidence: [
        `${input.quality.classifiedArticles}/${input.quality.totalArticles} classified`,
        input.quality.latestEnrichmentRun
          ? `${input.quality.latestEnrichmentRun.enrichedCount} enriched in last backfill`
          : `${input.quality.sourceDiagnostics.length} sources monitored`,
      ],
      nextStep: input.quality.latestEnrichmentRun ? "Review sources that still produce summary-only content." : "Run enrichment backfill for older summary-only articles.",
    },
    {
      id: "intelligence",
      phase: "Phase 2",
      title: "Event Intelligence",
      status: input.events.eventCoveragePct >= 60 ? "live" : "partial",
      progress: input.events.eventCoveragePct,
      signal: `${input.events.highMaterialityCount} high-materiality events`,
      evidence: input.events.eventCounts.slice(0, 2).map((item) => `${item.eventType}: ${item.total}`),
      nextStep: "Persist reviewed event labels and add correction workflow.",
    },
    {
      id: "discovery",
      phase: "Phase 3",
      title: "Discovery & Clustering",
      status: input.discovery.clusters.length > 0 ? "live" : "needs-data",
      progress: Math.min(100, input.discovery.clusters.length * 10 + input.discovery.topics.length * 2 + input.discovery.semanticGroups.length * 5),
      signal: `${input.discovery.clusters.length} story clusters, ${input.discovery.semanticGroups.length} semantic groups`,
      evidence: input.discovery.semanticGroups.length > 0
        ? input.discovery.semanticGroups.slice(0, 3).map((item) => `${item.label}: ${item.total}`)
        : input.discovery.topics.slice(0, 3).map((item) => `${item.label}: ${item.total}`),
      nextStep: "Upgrade semantic groups to embedding search after manual labels stabilize.",
    },
    {
      id: "market",
      phase: "Phase 4",
      title: "Market Linkage",
      status: input.market.impactSamples.length > 0 ? "live" : "partial",
      progress: Math.min(100, input.market.impactSamples.length * 12.5),
      signal: `${input.market.linkedTickerCount} tickers linked to OHLCV impact`,
      evidence: input.market.impactSamples.slice(0, 2).map((item) => `${item.ticker}: ${formatSignedPct(item.return3dPct)}`),
      nextStep: "Render linked events directly on symbol charts.",
    },
    {
      id: "model",
      phase: "Phase 5",
      title: "Model Governance",
      status: "partial",
      progress: Math.round(input.model.averageConfidence * 100),
      signal: `${Math.round(input.model.averageConfidence * 100)}% average confidence`,
      evidence: [`${input.model.feedbackSummary.totalFeedback} feedback items`, `${input.model.lowConfidenceCount} low-confidence articles`],
      nextStep: "Use feedback history as the evaluation set for the next classifier.",
    },
  ];
}

function computeImpact(article: NewsArticle, ticker: string, bars: Bar[]) {
  const eventDate = (article.publishedAt ?? article.ingestedAt).slice(0, 10);
  const startIndex = bars.findIndex((bar) => bar.date >= eventDate);
  if (startIndex < 0) {
    return null;
  }
  const startBar = bars[startIndex];
  const endBar = bars[Math.min(bars.length - 1, startIndex + 3)];
  const priorBars = bars.slice(Math.max(0, startIndex - 20), startIndex);
  const averageVolume = average(priorBars.map((bar) => bar.volume));
  const return3dPct = endBar ? roundScore(((endBar.close - startBar.close) / startBar.close) * 100) : null;
  const volumeRatio = averageVolume ? roundScore(startBar.volume / averageVolume) : null;

  return {
    articleId: article.id,
    title: article.title,
    ticker,
    eventDate,
    startClose: startBar.close,
    return3dPct,
    volumeRatio,
    evidence: `Event date ${eventDate}; 3D return ${formatSignedPct(return3dPct)}; volume ratio ${volumeRatio ?? "n/a"}.`,
  };
}

function getArticleTickers(article: NewsArticle) {
  return [...new Set(article.matches
    .filter((match) => match.matchType === "ticker")
    .map((match) => match.matchValue.toUpperCase()))];
}

function findSimilarHistoricalEvents(
  article: NewsArticle,
  event: NewsEventProfile,
  historyArticles: NewsArticle[],
  historyEventProfiles: NewsEventProfile[],
) {
  const articleTokens = tokenizeArticle(article);
  const tickerSet = new Set(event.tickers);
  return historyEventProfiles
    .map((historyEvent, index) => {
      const historyArticle = historyArticles[index];
      const tickerOverlap = historyEvent.tickers.some((ticker) => tickerSet.has(ticker));
      const eventMatch = historyEvent.eventType === event.eventType;
      const tokenScore = jaccard(articleTokens, tokenizeArticle(historyArticle));
      const score = (eventMatch ? 0.45 : 0) + (tickerOverlap ? 0.35 : 0) + tokenScore * 0.2;
      return {
        article: historyArticle,
        event: historyEvent,
        score,
      };
    })
    .filter((item) => item.article.id !== article.id && item.score >= 0.28)
    .sort((a, b) => b.score - a.score);
}

function tokenizeArticle(article: NewsArticle) {
  const text = `${article.title} ${article.excerpt} ${article.content} ${article.matchedKeywords.join(" ")}`.toLocaleLowerCase("id-ID");
  return new Set(text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 80));
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (left.size + right.size - intersection);
}

function getSemanticLabelsForArticle(article: NewsArticle) {
  const text = `${article.title} ${article.excerpt} ${article.content}`.toLocaleLowerCase("id-ID");
  return SEMANTIC_GROUPS
    .filter((group) => group.keywords.some((keyword) => text.includes(keyword)))
    .map((group) => group.label);
}

function isDisclosureSensitiveEvent(event: NewsEventProfile) {
  return [
    "right_issue",
    "buyback",
    "dividend",
    "ipo",
    "earnings",
    "ownership",
    "rups",
    "debt",
  ].includes(event.eventType);
}

function isOfficialDisclosureSource(article: NewsArticle) {
  const text = `${article.sourceId} ${article.sourceName}`.toLocaleLowerCase("id-ID");
  return text.includes("idx-official-disclosure")
    || text.includes("keterbukaan")
    || text.includes("official disclosure")
    || text.includes("ksei")
    || text.includes("kustodian");
}

function getLatestArticleTime(articles: NewsArticle[]) {
  if (articles.length === 0) {
    return Date.now();
  }
  return Math.max(...articles.map(getArticleTime));
}

function getArticleTime(article: NewsArticle) {
  const value = Date.parse(article.publishedAt ?? article.ingestedAt);
  return Number.isFinite(value) ? value : 0;
}

function getArticleContentQuality(article: NewsArticle) {
  if (article.contentQualityScore > 0) {
    return article.contentQualityScore;
  }
  const text = article.content || article.excerpt;
  if (text.length >= 1200) {
    return 1;
  }
  if (text.length >= 600) {
    return 0.82;
  }
  if (text.length >= 240) {
    return 0.62;
  }
  if (text.length >= 80) {
    return 0.38;
  }
  return text.trim() ? 0.18 : 0;
}

function extractMatches(value: string, pattern: RegExp) {
  return [...new Set(value.match(pattern)?.map((item) => item.trim()) ?? [])].slice(0, 5);
}

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function topCounts(values: string[], limit: number) {
  return topCountEntries(values, limit).map(([value]) => value);
}

function topCountEntries(values: string[], limit: number) {
  return [...countBy(values).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) {
    return 0;
  }
  return roundScore(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function clampScore(value: number) {
  return roundScore(Math.max(0, Math.min(1, value)));
}

function roundScore(value: number) {
  return Number(value.toFixed(3));
}

function formatSignedPct(value: number | null) {
  if (value === null) {
    return "n/a";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}
