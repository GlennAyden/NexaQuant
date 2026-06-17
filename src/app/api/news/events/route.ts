import { getMarketStore } from "@/lib/market/marketStore";
import { buildNewsChartEvents } from "@/lib/news/newsEvents";
import { getNewsStore } from "@/lib/news/newsStore";
import type { NewsArticleFilters } from "@/lib/news/types";

export const dynamic = "force-dynamic";

const MAX_EVENT_ARTICLES = 1000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = clampNumber(url.searchParams.get("days"), 1, 730, 180);
  const limit = clampNumber(url.searchParams.get("limit"), 1, 50, 12);
  const minMateriality = clampDecimal(url.searchParams.get("minMateriality"), 0, 1, 0.65);
  const dateFrom = optionalString(url.searchParams.get("dateFrom")) ?? new Date(Date.now() - days * 86_400_000).toISOString();
  const dateTo = optionalString(url.searchParams.get("dateTo"));
  const filters: NewsArticleFilters = {
    ticker: optionalString(url.searchParams.get("ticker")),
    sourceId: optionalString(url.searchParams.get("sourceId")),
    keyword: optionalString(url.searchParams.get("keyword")),
    dateFrom,
    dateTo,
  };
  const newsStore = getNewsStore();
  const marketStore = getMarketStore();
  const articles = loadEventArticles(newsStore, filters);
  const barsCache = new Map<string, ReturnType<typeof marketStore.getBars>>();

  const events = buildNewsChartEvents({
    articles,
    limit,
    minMateriality,
    getBarsForTicker: (ticker) => {
      const symbol = resolveMarketSymbol(ticker, filters.ticker);
      if (!barsCache.has(symbol)) {
        barsCache.set(symbol, marketStore.getBars(symbol, "1d"));
      }
      return barsCache.get(symbol) ?? [];
    },
  });

  return Response.json({
    generatedAt: new Date().toISOString(),
    filters: {
      ...filters,
      limit,
      minMateriality,
    },
    total: events.length,
    events,
  });
}

function loadEventArticles(store: ReturnType<typeof getNewsStore>, filters: NewsArticleFilters) {
  const first = store.getArticles({ ...filters, limit: 200, offset: 0 });
  const articles = [...first.articles];
  for (let offset = first.limit; offset < first.total && articles.length < MAX_EVENT_ARTICLES; offset += first.limit) {
    articles.push(...store.getArticles({ ...filters, limit: first.limit, offset }).articles);
  }
  return articles;
}

function resolveMarketSymbol(ticker: string, requestedTicker: string | undefined) {
  const candidate = (requestedTicker || ticker).trim().toUpperCase();
  return candidate.endsWith(".JK") ? candidate : `${candidate}.JK`;
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

function clampDecimal(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
