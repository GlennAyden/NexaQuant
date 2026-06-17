/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { TickerNewsEvidencePanel } from "@/components/dashboard/Dashboard";
import type { NewsChartEvent } from "@/lib/news/newsEvents";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

const summary = {
  totalArticles: 8,
  classifiedArticles: 6,
  unclassifiedArticles: 2,
  weightedSentimentScore: 0.32,
  averageRelevanceScore: 0.74,
  sentimentCounts: {
    positive: 4,
    negative: 1,
    neutral: 1,
    mixed: 0,
    unknown: 2,
  },
};

describe("TickerNewsEvidencePanel", () => {
  it("summarizes ticker news evidence and links to the filtered news page", async () => {
    const user = userEvent.setup();
    const onToggleMarkers = vi.fn();

    render(
      <TickerNewsEvidencePanel
        events={[
          event({ id: "low", eventLabel: "Update Emiten", materialityScore: 0.7, confidenceScore: 0.7 }),
          event({ id: "high", eventLabel: "Dividen", materialityScore: 0.92, confidenceScore: 0.88 }),
        ]}
        markerVisible={false}
        newsHref="/news?ticker=BBCA"
        summary={summary}
        ticker="BBCA"
        tone={{
          label: "positive",
          className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        }}
        onToggleMarkers={onToggleMarkers}
      />,
    );

    expect(screen.getByRole("region", { name: "BBCA news evidence" })).toBeInTheDocument();
    expect(screen.getByText("BBCA news evidence")).toBeInTheDocument();
    expect(screen.getByText("8 artikel, 6 classified, 2 belum classified. weighted +0.32; avg relevance 0.74.")).toBeInTheDocument();
    expect(screen.getByText("Dividen")).toBeInTheDocument();
    expect(screen.getByText("Kontan Investasi; 3D +2.40%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open evidence" })).toHaveAttribute("href", "/news?ticker=BBCA");

    await user.click(screen.getByRole("button", { name: "Show markers" }));

    expect(onToggleMarkers).toHaveBeenCalledTimes(1);
  });

  it("keeps an empty ticker news state evidence-first", () => {
    render(
      <TickerNewsEvidencePanel
        events={[]}
        markerVisible
        newsHref="/news?ticker=ACES"
        summary={null}
        ticker="ACES"
        tone={{
          label: "none",
          className: "border-slate-200 bg-white text-slate-700",
        }}
        onToggleMarkers={() => undefined}
      />,
    );

    expect(screen.getByText("Belum ada berita ticker yang cukup relevan di cache lokal.")).toBeInTheDocument();
    expect(screen.getByText("No material event")).toBeInTheDocument();
    expect(screen.getByText("Sync/classify berita untuk membuat marker news.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide markers" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Open evidence" })).toHaveAttribute("href", "/news?ticker=ACES");
  });
});

function event(input: Partial<NewsChartEvent>): NewsChartEvent {
  return {
    id: input.id ?? "news-a1-BBCA",
    articleId: "a1",
    ticker: "BBCA",
    eventDate: "2026-06-12",
    chartDate: "2026-06-12",
    title: "BBCA bagi dividen",
    sourceName: "Kontan Investasi",
    url: "https://example.com/bbca",
    eventType: "dividend",
    eventLabel: input.eventLabel ?? "Dividen",
    sentimentLabel: "positive",
    sentimentScore: 1,
    relevanceScore: 0.86,
    materialityScore: input.materialityScore ?? 0.92,
    confidenceScore: input.confidenceScore ?? 0.88,
    return1dPct: 1.1,
    return3dPct: 2.4,
    return5dPct: 3.2,
    volumeRatio: 1.35,
    evidence: "fixture evidence",
  };
}
