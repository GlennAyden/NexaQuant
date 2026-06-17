import { describe, expect, it } from "vitest";

import { summarizeTopicImpact } from "@/lib/news/topicImpact";
import type { NewsChartEvent } from "@/lib/news/newsEvents";

describe("topic impact", () => {
  it("groups news events by event label with average market impact", () => {
    const topics = summarizeTopicImpact([
      event("Dividen", 1.2, 2),
      event("Dividen", 2.4, 1.4),
      event("Buyback", -1.5, 1.1),
    ]);

    expect(topics).toEqual([
      expect.objectContaining({
        label: "Dividen",
        total: 2,
        averageReturn3dPct: 1.8,
        averageVolumeRatio: 1.7,
      }),
      expect.objectContaining({
        label: "Buyback",
        total: 1,
        averageReturn3dPct: -1.5,
      }),
    ]);
  });
});

function event(label: string, return3dPct: number | null, volumeRatio: number | null): NewsChartEvent {
  return {
    id: `news-${label}-${return3dPct}`,
    articleId: `article-${label}-${return3dPct}`,
    ticker: "BBCA",
    eventDate: "2026-06-12",
    chartDate: "2026-06-12",
    title: `${label} event`,
    sourceName: "fixture",
    url: "https://example.com",
    eventType: label.toLowerCase(),
    eventLabel: label,
    sentimentLabel: "positive",
    sentimentScore: 1,
    relevanceScore: 0.9,
    materialityScore: 0.8,
    confidenceScore: 0.8,
    return1dPct: null,
    return3dPct,
    return5dPct: null,
    volumeRatio,
    evidence: "fixture",
  };
}
