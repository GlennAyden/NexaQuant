import { buildEventProfile } from "@/lib/news/newsInsights";
import type { Bar } from "@/lib/market/types";
import type { NewsArticle, NewsSentimentLabel } from "@/lib/news/types";

export type NewsChartEvent = {
  id: string;
  articleId: string;
  ticker: string;
  eventDate: string;
  chartDate: string;
  title: string;
  sourceName: string;
  url: string;
  eventType: string;
  eventLabel: string;
  sentimentLabel: NewsSentimentLabel;
  sentimentScore: number | null;
  relevanceScore: number | null;
  materialityScore: number;
  confidenceScore: number;
  return1dPct: number | null;
  return3dPct: number | null;
  return5dPct: number | null;
  volumeRatio: number | null;
  evidence: string;
};

export type BuildNewsChartEventsInput = {
  articles: NewsArticle[];
  getBarsForTicker: (ticker: string) => Bar[];
  minMateriality?: number;
  limit?: number;
};

export function buildNewsChartEvents(input: BuildNewsChartEventsInput): NewsChartEvent[] {
  const minMateriality = input.minMateriality ?? 0.65;
  const limit = Math.max(1, Math.min(50, input.limit ?? 12));
  const events: NewsChartEvent[] = [];

  for (const article of input.articles) {
    const profile = buildEventProfile(article);
    if (profile.materialityScore < minMateriality) {
      continue;
    }

    for (const ticker of profile.tickers.slice(0, 2)) {
      const bars = input.getBarsForTicker(ticker);
      const impact = computeEventImpact(article, bars);
      if (!impact) {
        continue;
      }

      events.push({
        id: `news-${article.id}-${ticker}`,
        articleId: article.id,
        ticker,
        eventDate: impact.eventDate,
        chartDate: impact.chartDate,
        title: article.title,
        sourceName: article.sourceName,
        url: article.url,
        eventType: profile.eventType,
        eventLabel: profile.eventLabel,
        sentimentLabel: article.sentiment?.sentimentLabel ?? "unknown",
        sentimentScore: article.sentiment?.sentimentScore ?? null,
        relevanceScore: article.sentiment?.relevanceScore ?? null,
        materialityScore: profile.materialityScore,
        confidenceScore: profile.confidenceScore,
        return1dPct: impact.return1dPct,
        return3dPct: impact.return3dPct,
        return5dPct: impact.return5dPct,
        volumeRatio: impact.volumeRatio,
        evidence: [
          `Event date ${impact.eventDate}`,
          `1D ${formatSignedPct(impact.return1dPct)}`,
          `3D ${formatSignedPct(impact.return3dPct)}`,
          `volume ratio ${impact.volumeRatio ?? "n/a"}`,
        ].join("; "),
      });
    }
  }

  return ensureUniqueEventIds([...events]
    .sort((left, right) => right.materialityScore - left.materialityScore)
    .slice(0, limit)
    .sort((left, right) => left.chartDate.localeCompare(right.chartDate) || right.materialityScore - left.materialityScore));
}

function ensureUniqueEventIds(events: NewsChartEvent[]): NewsChartEvent[] {
  const counts = new Map<string, number>();
  events.forEach((event) => counts.set(event.id, (counts.get(event.id) ?? 0) + 1));

  const seen = new Map<string, number>();
  return events.map((event) => {
    if ((counts.get(event.id) ?? 0) <= 1) {
      return event;
    }

    const occurrence = (seen.get(event.id) ?? 0) + 1;
    seen.set(event.id, occurrence);
    if (occurrence === 1) {
      return event;
    }

    return {
      ...event,
      id: `${event.id}-${shortStableHash(`${event.articleId}|${event.ticker}|${event.chartDate}|${event.url}|${occurrence}`)}`,
    };
  });
}

function computeEventImpact(article: NewsArticle, bars: Bar[]) {
  const eventDate = (article.publishedAt ?? article.ingestedAt).slice(0, 10);
  const startIndex = bars.findIndex((bar) => bar.date >= eventDate);
  if (startIndex < 0) {
    return null;
  }

  const startBar = bars[startIndex];
  const priorBars = bars.slice(Math.max(0, startIndex - 20), startIndex);
  const averageVolume = average(priorBars.map((bar) => bar.volume));

  return {
    eventDate,
    chartDate: startBar.date,
    return1dPct: returnPct(startBar, bars[Math.min(bars.length - 1, startIndex + 1)]),
    return3dPct: returnPct(startBar, bars[Math.min(bars.length - 1, startIndex + 3)]),
    return5dPct: returnPct(startBar, bars[Math.min(bars.length - 1, startIndex + 5)]),
    volumeRatio: averageVolume ? roundScore(startBar.volume / averageVolume) : null,
  };
}

function returnPct(startBar: Bar, endBar: Bar | undefined) {
  if (!endBar || startBar.close === 0) {
    return null;
  }
  return roundScore(((endBar.close - startBar.close) / startBar.close) * 100);
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) {
    return 0;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function roundScore(value: number) {
  return Number(value.toFixed(3));
}

function shortStableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function formatSignedPct(value: number | null) {
  if (value === null) {
    return "n/a";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}
