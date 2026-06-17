import { getMarketStore } from "@/lib/market/marketStore";
import { buildNewsInsights } from "@/lib/news/newsInsights";
import { getNewsStore } from "@/lib/news/newsStore";
import type { NewsArticleFilters } from "@/lib/news/types";

export const dynamic = "force-dynamic";

const MAX_INSIGHT_ARTICLES = 1500;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = clampNumber(url.searchParams.get("days"), 1, 365, 7);
  const historyDays = clampNumber(url.searchParams.get("historyDays"), days, 365, 180);
  const dateFrom = new Date(Date.now() - days * 86_400_000).toISOString();
  const historyDateFrom = new Date(Date.now() - historyDays * 86_400_000).toISOString();
  const filters: NewsArticleFilters = {
    dateFrom,
    ticker: optionalString(url.searchParams.get("ticker")),
    keyword: optionalString(url.searchParams.get("keyword")),
    sourceId: optionalString(url.searchParams.get("sourceId")),
  };
  const historyFilters: NewsArticleFilters = {
    ...filters,
    dateFrom: historyDateFrom,
  };
  const newsStore = getNewsStore();
  const marketStore = getMarketStore();
  const articles = loadInsightArticles(newsStore, filters);
  const historyArticles = loadInsightArticles(newsStore, historyFilters);
  const summary = newsStore.getSummary(filters);
  const sourceStatuses = newsStore.getLatestSourceStatuses(50);
  const latestEnrichmentRun = newsStore.getLatestEnrichmentRun();
  const feedbackSummary = newsStore.getFeedbackSummary();
  const feedbackItems = newsStore.getFeedbackItems(50);
  const barsCache = new Map<string, ReturnType<typeof marketStore.getBars>>();

  return Response.json(buildNewsInsights({
    articles,
    historyArticles,
    summary,
    sourceStatuses,
    latestEnrichmentRun,
    feedbackSummary,
    feedbackItems,
    getBarsForTicker: (ticker) => {
      const candidates = [`${ticker}.JK`, ticker];
      for (const symbol of candidates) {
        if (!barsCache.has(symbol)) {
          barsCache.set(symbol, marketStore.getBars(symbol, "1d"));
        }
        const bars = barsCache.get(symbol) ?? [];
        if (bars.length > 0) {
          return bars;
        }
      }
      return [];
    },
  }));
}

function loadInsightArticles(store: ReturnType<typeof getNewsStore>, filters: NewsArticleFilters) {
  const first = store.getArticles({ ...filters, limit: 200, offset: 0 });
  const articles = [...first.articles];
  for (let offset = first.limit; offset < first.total && articles.length < MAX_INSIGHT_ARTICLES; offset += first.limit) {
    articles.push(...store.getArticles({ ...filters, limit: first.limit, offset }).articles);
  }
  return articles;
}

function optionalString(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function clampNumber(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
