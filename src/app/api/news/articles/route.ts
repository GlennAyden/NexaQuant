import { getNewsStore } from "@/lib/news/newsStore";
import { rankNewsArticlesSemantically } from "@/lib/news/newsSemanticSearch";
import type { NewsArticleFilters, NewsSentimentLabel, NewsSearchMode } from "@/lib/news/types";

export const dynamic = "force-dynamic";

const MAX_SEMANTIC_SEARCH_ARTICLES = 1_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const store = getNewsStore();
  const sentiment = parseSentiment(url.searchParams.get("sentiment"));
  const minRelevance = parseOptionalNumber(url.searchParams.get("minRelevance"), 0, 1);
  const queryMode = parseQueryMode(url.searchParams.get("queryMode"));
  const query = optionalString(url.searchParams.get("query"));
  const limit = clampNumber(url.searchParams.get("limit"), 1, 200, 50);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 100_000, 0);
  const dateFrom = optionalString(url.searchParams.get("dateFrom")) ?? dateFromDays(url.searchParams.get("days"));

  if (url.searchParams.has("sentiment") && !sentiment) {
    return Response.json({ error: "sentiment must be positive, negative, neutral, mixed, or unknown" }, { status: 400 });
  }

  if (url.searchParams.has("minRelevance") && minRelevance === null) {
    return Response.json({ error: "minRelevance must be a number from 0 to 1" }, { status: 400 });
  }

  if (!queryMode) {
    return Response.json({ error: "queryMode must be text or semantic" }, { status: 400 });
  }

  const filters: NewsArticleFilters = {
    sourceId: optionalString(url.searchParams.get("sourceId")),
    query,
    keyword: optionalString(url.searchParams.get("keyword")),
    ticker: optionalString(url.searchParams.get("ticker")),
    sentiment: sentiment ?? undefined,
    minRelevance: minRelevance ?? undefined,
    dateFrom,
    dateTo: optionalString(url.searchParams.get("dateTo")),
    limit,
    offset,
  };

  if (queryMode === "semantic" && query) {
    const articles = loadSemanticSearchCorpus(store, { ...filters, query: undefined });
    return Response.json(rankNewsArticlesSemantically(articles, query, limit, offset));
  }

  return Response.json(store.getArticles(filters));
}

function parseSentiment(value: string | null): NewsSentimentLabel | null {
  if (!value) {
    return null;
  }
  return value === "positive" || value === "negative" || value === "neutral" || value === "mixed" || value === "unknown"
    ? value
    : null;
}

function parseOptionalNumber(value: string | null, min: number, max: number): number | null | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(max, Math.max(min, parsed));
}

function parseQueryMode(value: string | null): NewsSearchMode | null {
  if (!value) {
    return "text";
  }
  return value === "text" || value === "semantic" ? value : null;
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

function dateFromDays(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const days = clampNumber(value, 1, 365, 7);
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function loadSemanticSearchCorpus(store: ReturnType<typeof getNewsStore>, filters: NewsArticleFilters) {
  const first = store.getArticles({ ...filters, limit: 200, offset: 0 });
  const articles = [...first.articles];
  for (let offset = first.limit; offset < first.total && articles.length < MAX_SEMANTIC_SEARCH_ARTICLES; offset += first.limit) {
    articles.push(...store.getArticles({ ...filters, limit: first.limit, offset }).articles);
  }
  return articles.slice(0, MAX_SEMANTIC_SEARCH_ARTICLES);
}
