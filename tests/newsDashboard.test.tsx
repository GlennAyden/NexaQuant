/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewsDashboard, buildNewsReadinessItems, buildNewsResearchBrief, buildSourceHealthRows, buildSourceReliabilityRows } from "@/components/news/NewsDashboard";
import newsSources from "@/lib/news/newsSources.json";
import { NEWS_SOURCE_POLICY_ROWS } from "@/lib/news/sourcePolicy";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

const summary = {
  totalArticles: 2,
  classifiedArticles: 1,
  unclassifiedArticles: 1,
  latestPublishedAt: "2026-06-15T09:30:00.000Z",
  latestIngestedAt: "2026-06-15T09:31:00.000Z",
  sentimentCounts: {
    positive: 1,
    negative: 0,
    neutral: 0,
    mixed: 0,
    unknown: 1,
  },
  dailyTimeline: [
    {
      date: "2026-06-15",
      totalArticles: 2,
      classifiedArticles: 1,
      sentimentCounts: {
        positive: 1,
        negative: 0,
        neutral: 0,
        mixed: 0,
        unknown: 1,
      },
      averageRelevanceScore: 0.9,
      weightedSentimentScore: 0.7,
    },
  ],
  averageSentimentScore: 0.7,
  averageRelevanceScore: 0.9,
  weightedSentimentScore: 0.7,
  latestSync: {
    status: "completed",
    successCount: 5,
    failedCount: 0,
    matchedCount: 41,
    insertedCount: 0,
    duplicateCount: 41,
    finishedAt: "2026-06-15T10:00:00.000Z",
  },
};

const articles = {
  articles: [
    {
      id: "a1",
      sourceId: "cnbc-market",
      sourceName: "CNBC Indonesia Market",
      url: "https://example.com/ihsg",
      title: "IHSG Hari Ini Melesat",
      publishedAt: "2026-06-15T09:30:00.000Z",
      ingestedAt: "2026-06-15T09:31:00.000Z",
      excerpt: "Saham bank menjadi bahan bakar utama.",
      matchedKeywords: ["IHSG", "saham"],
      matches: [{ matchType: "index", matchValue: "IHSG", confidence: 0.95 }],
      sentiment: {
        sentimentLabel: "positive",
        sentimentScore: 1,
        relevanceScore: 0.95,
        marketScope: "ihsg",
        reasoning: "Positive evidence: market strength tone. Relevance 0.95 because IHSG or market index context.",
      },
    },
  ],
  total: 1,
  limit: 100,
  offset: 0,
};

const sync = {
  active: false,
  run: summary.latestSync,
  sources: [
    {
      sourceId: "cnbc-market",
      sourceName: "CNBC Indonesia Market",
      status: "success",
      startedAt: "2026-06-15T09:59:00.000Z",
      itemsSeen: 20,
      matchedCount: 15,
      insertedCount: 0,
      duplicateCount: 15,
      filteredCount: 5,
      finishedAt: "2026-06-15T10:00:00.000Z",
      error: null,
    },
  ],
  history: [
    {
      run: {
        id: "sync-2",
        startedAt: "2026-06-15T09:59:00.000Z",
        finishedAt: "2026-06-15T10:00:00.000Z",
        status: "completed",
        totalSources: 1,
        successCount: 1,
        failedCount: 0,
        totalCandidates: 20,
        matchedCount: 15,
        insertedCount: 0,
        duplicateCount: 15,
        filteredCount: 5,
        error: {},
      },
      sources: [
        {
          sourceId: "cnbc-market",
          sourceName: "CNBC Indonesia Market",
          status: "success",
          startedAt: "2026-06-15T09:59:00.000Z",
          itemsSeen: 20,
          matchedCount: 15,
          insertedCount: 0,
          duplicateCount: 15,
          filteredCount: 5,
          finishedAt: "2026-06-15T10:00:00.000Z",
          error: null,
        },
      ],
    },
    {
      run: {
        id: "sync-1",
        startedAt: "2026-06-14T09:59:00.000Z",
        finishedAt: "2026-06-14T10:00:00.000Z",
        status: "failed",
        totalSources: 2,
        successCount: 1,
        failedCount: 1,
        totalCandidates: 8,
        matchedCount: 4,
        insertedCount: 2,
        duplicateCount: 2,
        filteredCount: 4,
        error: { message: "IDX Channel failed" },
      },
      sources: [
        {
          sourceId: "idx-channel",
          sourceName: "IDX Channel",
          status: "failed",
          startedAt: "2026-06-14T09:59:00.000Z",
          itemsSeen: 0,
          matchedCount: 0,
          insertedCount: 0,
          duplicateCount: 0,
          filteredCount: 0,
          finishedAt: "2026-06-14T10:00:00.000Z",
          error: "HTTP 503",
        },
      ],
    },
  ],
};

const insights: Parameters<typeof buildNewsReadinessItems>[1] = {
  generatedAt: "2026-06-16T10:00:00.000Z",
  phases: [
    {
      id: "quality",
      phase: "Phase 1",
      title: "Quality & Extraction",
      status: "live",
      progress: 80,
      signal: "80% content coverage, 0 empty excerpts",
      evidence: ["1/2 classified", "1 sources monitored"],
      nextStep: "Backfill full content.",
    },
    {
      id: "intelligence",
      phase: "Phase 2",
      title: "Event Intelligence",
      status: "partial",
      progress: 65,
      signal: "1 high-materiality events",
      evidence: ["Gerak Pasar: 1"],
      nextStep: "Persist reviewed labels.",
    },
    {
      id: "discovery",
      phase: "Phase 3",
      title: "Discovery & Clustering",
      status: "live",
      progress: 60,
      signal: "1 story clusters, 2 topics",
      evidence: ["IHSG: 1"],
      nextStep: "Add semantic embeddings.",
    },
    {
      id: "market",
      phase: "Phase 4",
      title: "Market Linkage",
      status: "partial",
      progress: 25,
      signal: "1 tickers linked to OHLCV impact",
      evidence: ["BBCA: +1.20%"],
      nextStep: "Render linked events on charts.",
    },
    {
      id: "model",
      phase: "Phase 5",
      title: "Model Governance",
      status: "partial",
      progress: 72,
      signal: "72% average confidence",
      evidence: ["1 low-confidence articles", "nexaquant-lexicon-v1"],
      nextStep: "Add feedback storage.",
    },
  ],
  quality: {
    totalArticles: 2,
    classifiedArticles: 1,
    pendingClassifications: 1,
    contentCoveragePct: 80,
    extractionCoveragePct: 20,
    emptyExcerptCount: 0,
    averageContentQuality: 0.72,
    latestEnrichmentRun: {
      status: "completed",
      totalArticles: 2,
      enrichedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      finishedAt: "2026-06-16T10:01:00.000Z",
    },
    sourceDiagnostics: [{
      sourceName: "CNBC Indonesia Market",
      totalArticles: 1,
      emptyExcerptCount: 0,
      averageContentQuality: 0.72,
      latestStatus: "success",
      duplicateCount: 15,
      filteredCount: 5,
    }],
  },
  events: {
    eventCoveragePct: 65,
    highMaterialityCount: 1,
    eventCounts: [{ eventType: "Gerak Pasar", total: 1 }],
    topEvents: [{
      articleId: "a1",
      title: "IHSG Hari Ini Melesat",
      sourceName: "CNBC Indonesia Market",
      eventLabel: "Gerak Pasar",
      materialityScore: 0.82,
      confidenceScore: 0.76,
      tickers: ["BBCA"],
    }],
  },
  discovery: {
    topics: [{ label: "IHSG", total: 1 }, { label: "SAHAM", total: 1 }],
    clusters: [{
      key: "Gerak Pasar:BBCA",
      label: "Gerak Pasar - BBCA",
      total: 1,
      sentimentMix: { positive: 1 },
      sampleTitles: ["IHSG Hari Ini Melesat"],
    }],
    semanticGroups: [{
      label: "Flow & Liquidity",
      total: 1,
      keywords: ["asing", "volume"],
      sampleTitles: ["IHSG Hari Ini Melesat"],
    }],
  },
  market: {
    linkedTickerCount: 1,
    impactSamples: [{
      articleId: "a1",
      title: "IHSG Hari Ini Melesat",
      ticker: "BBCA",
      eventDate: "2026-06-15",
      return3dPct: 1.2,
      volumeRatio: 1.4,
      evidence: "Event date 2026-06-15; 3D return +1.20%; volume ratio 1.4.",
    }],
  },
  model: {
    modelName: "nexaquant-lexicon-v1",
    averageConfidence: 0.72,
    lowConfidenceCount: 1,
    feedbackReady: true,
    feedbackSummary: {
      totalFeedback: 0,
      latestFeedbackAt: null,
      correctedPositive: 0,
      correctedNeutral: 0,
      correctedNegative: 0,
      averageCorrectedRelevance: null,
    },
    feedbackDiagnostics: {
      sampleSize: 1,
      sentimentChangeCount: 1,
      disagreementRatePct: 100,
      averageRelevanceDelta: 0.1,
      latestCorrections: [{
        articleId: "a1",
        title: "IHSG Hari Ini Melesat",
        sourceName: "CNBC Indonesia Market",
        from: "neutral",
        to: "positive",
        relevanceDelta: 0.1,
        note: "Tone lebih positif.",
      }],
    },
    evaluationQueueCount: 1,
    calibrationNotes: ["Lexicon score remains inspectable."],
  },
  wild: {
    marketMemory: {
      examples: [{
        articleId: "a1",
        title: "IHSG Hari Ini Melesat",
        ticker: "BBCA",
        eventLabel: "Gerak Pasar",
        similarCount: 4,
        averageReturn3dPct: 1.2,
        winRatePct: 75,
        averageVolumeRatio: 1.4,
        sampleTitles: ["Asing Borong BBCA"],
        evidence: "4 similar stories; avg 3D return +1.20%; win rate 75%.",
      }],
    },
    eventImpactLab: {
      eventStats: [{
        eventLabel: "Gerak Pasar",
        sampleCount: 6,
        averageReturn3dPct: 0.8,
        winRatePct: 67,
        averageVolumeRatio: 1.2,
        topTickers: ["BBCA", "BBRI"],
      }],
    },
    narrativeRadar: {
      alerts: [{
        label: "Flow & Liquidity",
        total: 3,
        recentCount: 2,
        priorCount: 1,
        momentumScore: 1.6,
        signal: "steady",
        sampleTitles: ["IHSG Hari Ini Melesat"],
      }],
    },
    velocity: {
      last24hCount: 5,
      previous24hCount: 2,
      accelerationPct: 150,
      topSources: [{ sourceName: "CNBC Indonesia Market", total: 3 }],
    },
    sourceQuality: [{
      sourceName: "CNBC Indonesia Market",
      score: 0.82,
      totalArticles: 1,
      classificationCoveragePct: 100,
      averageRelevance: 0.9,
      averageContentQuality: 0.72,
      duplicateCount: 15,
      warning: null,
    }],
    disclosureRadar: {
      confirmedCount: 0,
      needsReviewCount: 1,
      openItems: [{
        articleId: "a1",
        title: "IHSG Hari Ini Melesat",
        ticker: "BBCA",
        eventLabel: "Gerak Pasar",
        severity: "medium",
        evidence: "Gerak Pasar for BBCA came from CNBC Indonesia Market; official disclosure source not captured in this set.",
        officialSourceName: "IDX Keterbukaan Informasi",
        officialSearchUrl: "https://www.idx.co.id/id/perusahaan-tercatat/keterbukaan-informasi",
      }],
    },
    entityGraph: {
      topHub: "CNBC Indonesia Market",
      nodes: [
        { id: "source:CNBC Indonesia Market", label: "CNBC Indonesia Market", type: "source", total: 1 },
        { id: "ticker:BBCA", label: "BBCA", type: "ticker", total: 1 },
      ],
      edges: [{
        from: "source:CNBC Indonesia Market",
        to: "ticker:BBCA",
        weight: 1,
        evidence: "CNBC Indonesia Market covered BBCA",
      }],
    },
    activeLearning: {
      total: 1,
      queue: [{
        articleId: "a1",
        title: "IHSG Hari Ini Melesat",
        sourceName: "CNBC Indonesia Market",
        priority: 0.51,
        reason: "confidence calibration sample",
      }],
    },
    dailyBriefing: {
      title: "Daily Market Briefing",
      bullets: [
        "Flow & Liquidity is steady with 2 recent articles.",
        "Gerak Pasar is the highest-materiality event cluster.",
        "BBCA memory: 4 similar stories.",
        "1 disclosure-sensitive stories still need official-source review.",
      ],
      watchlist: [
        "Gerak Pasar: avg 3D +0.80%, win 67%",
        "CNBC Indonesia Market: source score 82%",
        "1 articles queued for manual calibration.",
      ],
    },
  },
};

const enrich = {
  active: false,
  run: {
    status: "completed",
    totalArticles: 2,
    enrichedCount: 1,
    skippedCount: 0,
    failedCount: 0,
    finishedAt: "2026-06-16T10:01:00.000Z",
  },
};

describe("buildSourceHealthRows", () => {
  it("keeps every catalog source visible and ranks failed sources first", () => {
    const rows = buildSourceHealthRows(NEWS_SOURCE_POLICY_ROWS, [
      {
        sourceId: "cnbc-market",
        sourceName: "CNBC Indonesia Market",
        status: "success",
        startedAt: "2026-06-15T09:59:00.000Z",
        itemsSeen: 20,
        matchedCount: 15,
        insertedCount: 0,
        duplicateCount: 15,
        filteredCount: 5,
        finishedAt: "2026-06-15T10:00:00.000Z",
        error: null,
      },
      {
        sourceId: "idx-channel",
        sourceName: "IDX Channel",
        status: "failed",
        startedAt: "2026-06-15T09:58:00.000Z",
        itemsSeen: 0,
        matchedCount: 0,
        insertedCount: 0,
        duplicateCount: 0,
        filteredCount: 0,
        finishedAt: "2026-06-15T09:59:00.000Z",
        error: "HTTP 503",
      },
    ]);

    expect(rows).toHaveLength(newsSources.length);
    expect(rows[0]).toMatchObject({ sourceId: "idx-channel", status: "failed", errorText: "HTTP 503" });
    expect(rows.find((row) => row.sourceId === "antara-ekonomi")).toMatchObject({ status: "idle", matchedCount: 0 });
    expect(rows.find((row) => row.sourceId === "cnbc-market")).toMatchObject({ status: "success", matchedCount: 15 });
  });
});

describe("buildSourceReliabilityRows", () => {
  it("scores stable, flaky, and unobserved sources from sync history", () => {
    const rows = buildSourceReliabilityRows(NEWS_SOURCE_POLICY_ROWS, sync.history);

    expect(rows).toHaveLength(newsSources.length);
    expect(rows.find((row) => row.sourceId === "cnbc-market")).toMatchObject({
      status: "stable",
      score: 80,
      checkedRuns: 1,
      totalRuns: 2,
      successRatePct: 100,
      matchRatePct: 75,
    });
    expect(rows.find((row) => row.sourceId === "idx-channel")).toMatchObject({
      status: "flaky",
      score: 20,
      checkedRuns: 1,
      failedCount: 1,
    });
    expect(rows.find((row) => row.sourceId === "antara-ekonomi")).toMatchObject({
      status: "no-data",
      score: 0,
      checkedRuns: 0,
    });
  });
});

describe("buildNewsReadinessItems", () => {
  it("turns source, classification, quality, review, and model signals into explicit gates", () => {
    const sourceRows = buildSourceHealthRows(NEWS_SOURCE_POLICY_ROWS, sync.sources);
    const items = buildNewsReadinessItems(summary, insights as Parameters<typeof buildNewsReadinessItems>[1], sourceRows);

    expect(items).toHaveLength(6);
    expect(items.find((item) => item.id === "sources")).toMatchObject({
      status: "watch",
      metric: `1/${newsSources.length}`,
    });
    expect(items.find((item) => item.id === "classification")).toMatchObject({
      status: "watch",
      metric: "50%",
    });
    expect(items.find((item) => item.id === "content")).toMatchObject({
      status: "ready",
      metric: "80%",
    });
    expect(items.find((item) => item.id === "review")).toMatchObject({
      status: "watch",
      metric: "2",
    });
    expect(items.find((item) => item.id === "model")).toMatchObject({
      status: "ready",
      metric: "72%",
    });
  });
});

describe("buildNewsResearchBrief", () => {
  it("creates an evidence-only brief from readiness and intelligence signals", () => {
    const sourceRows = buildSourceHealthRows(NEWS_SOURCE_POLICY_ROWS, sync.sources);
    const brief = buildNewsResearchBrief(summary, insights as Parameters<typeof buildNewsResearchBrief>[1], sourceRows);

    expect(brief).toContain("NexaQuant News Brief");
    expect(brief).toContain("Readiness: needs review (70%)");
    expect(brief).toContain("- Source coverage: watch");
    expect(brief).toContain("Flow & Liquidity");
    expect(brief).toContain("Gerak Pasar: avg 3D +0.80%, win 67%");
    expect(brief).toContain("BBCA Gerak Pasar: medium disclosure gap");
    expect(brief).toContain("Evidence only; not a trade instruction.");
  });
});

describe("NewsDashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/news/articles")) {
        return jsonResponse(articles);
      }
      if (url.startsWith("/api/news/summary")) {
        return jsonResponse(summary);
      }
      if (url.startsWith("/api/news/insights")) {
        return jsonResponse(insights);
      }
      if (url === "/api/news/enrich") {
        return jsonResponse(enrich);
      }
      if (url === "/api/news/feedback") {
        return jsonResponse({ ok: true });
      }
      if (url === "/api/news/sync") {
        return jsonResponse(sync);
      }
      if (url === "/api/news/sentiment") {
        return jsonResponse({ total: 1, classifiedCount: 1, articles: [] });
      }
      throw new Error(`Unexpected request ${url}`);
    }));
  });

  it("renders the evidence console with summary, source health, table, and inspector", async () => {
    render(<NewsDashboard />);

    expect(await screen.findByText("NexaQuant News Sentiment")).toBeInTheDocument();
    expect(await screen.findByText("News Intelligence Phases")).toBeInTheDocument();
    expect(screen.getByText("Quality & Extraction")).toBeInTheDocument();
    expect(screen.getByText("Event Intelligence")).toBeInTheDocument();
    expect(screen.getByText("Discovery & Clustering")).toBeInTheDocument();
    expect(screen.getAllByText("Market Linkage").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Model Governance").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Research Readiness")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "News research readiness" })).toHaveAttribute("aria-valuenow", "70");
    expect(screen.getByText("2/6 gates ready, 0 blocked.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy brief" })).toBeInTheDocument();
    expect(screen.getByText("Evidence Action Queue")).toBeInTheDocument();
    expect(screen.getByText("4 actions")).toBeInTheDocument();
    expect(screen.getByText("Inspect flaky source")).toBeInTheDocument();
    expect(screen.getByText("IDX Channel: Flaky, score 20%")).toBeInTheDocument();
    expect(screen.getByText("Review disclosure gap")).toBeInTheDocument();
    expect(screen.getByText("BBCA Gerak Pasar: medium official-source gap")).toBeInTheDocument();
    expect(screen.getByText("Search top narrative")).toBeInTheDocument();
    expect(screen.getByText("Material Event Radar")).toBeInTheDocument();
    expect(screen.getByText("1 high materiality")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search material event Gerak Pasar" })).toBeInTheDocument();
    expect(screen.getByText("materiality 0.82, confidence 0.76")).toBeInTheDocument();
    expect(screen.getByText("Source coverage")).toBeInTheDocument();
    expect(screen.getByText("Event coverage")).toBeInTheDocument();
    expect(screen.getByText("Intelligence Cockpit")).toBeInTheDocument();
    expect(screen.getByText("Wild Intelligence Lab")).toBeInTheDocument();
    expect(screen.getByText("Open Source Guardrails")).toBeInTheDocument();
    expect(screen.getByText("Source attribution retained")).toBeInTheDocument();
    expect(screen.getByText("No full article republication")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter source CNBC Indonesia Market" })).toHaveTextContent("Healthy");
    expect(screen.getByRole("button", { name: "Filter source Antara Ekonomi" })).toHaveTextContent("Not checked");
    expect(screen.getByRole("button", { name: "Filter source Antara Ekonomi" })).toHaveTextContent("RSS feed");
    expect(screen.getByText("Source Reliability")).toBeInTheDocument();
    expect(screen.getByText("2/13 scored")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect source reliability CNBC Indonesia Market" })).toHaveTextContent("80%");
    expect(screen.getByRole("button", { name: "Inspect source reliability CNBC Indonesia Market" })).toHaveTextContent("Stable");
    expect(screen.getByRole("button", { name: "Inspect source reliability IDX Channel" })).toHaveTextContent("Flaky");
    expect(screen.getByText("Sync History")).toBeInTheDocument();
    expect(screen.getByText("2 runs")).toBeInTheDocument();
    expect(screen.getByText("15 matched / 0 new")).toBeInTheDocument();
    expect(screen.getByText("Failed: IDX Channel")).toBeInTheDocument();
    expect(screen.getAllByText("Market Memory").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Event Impact Lab")).toBeInTheDocument();
    expect(screen.getAllByText("Narrative Radar").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Daily Market Briefing")).toBeInTheDocument();
    expect(screen.getByText("Disclosure Gap")).toBeInTheDocument();
    expect(screen.getAllByText("Entity Graph").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Review Queue").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Model Calibration")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "BBCA Gerak Pasar" })).toHaveAttribute("href", "https://www.idx.co.id/id/perusahaan-tercatat/keterbukaan-informasi");
    expect((await screen.findAllByText("IHSG Hari Ini Melesat")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("CNBC Indonesia Market").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("2 matched articles, 1 visible")).toBeInTheDocument();
    expect(screen.getByTitle("1 positive")).toBeInTheDocument();
    expect(screen.getByTitle("1 neutral, mixed, or unknown")).toBeInTheDocument();
    for (const source of newsSources) {
      expect(screen.getByRole("option", { name: source.name })).toBeInTheDocument();
    }
    expect(screen.getAllByText("Positive evidence: market strength tone. Relevance 0.95 because IHSG or market index context.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
  }, 10000);

  it("copies the research brief from the readiness panel", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<NewsDashboard />);

    expect(await screen.findByText("Research Readiness")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy brief" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("NexaQuant News Brief"));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Evidence only; not a trade instruction."));
    expect(screen.getByText("Brief copied.")).toBeInTheDocument();
  });

  it("drills into source run and quality details from the source health matrix", async () => {
    const user = userEvent.setup();
    render(<NewsDashboard />);

    expect(await screen.findByText("NexaQuant News Sentiment")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filter source CNBC Indonesia Market" }));

    expect(await screen.findByText("Source run")).toBeInTheDocument();
    expect(screen.getAllByText("20 seen / 15 matched").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("0 new, 15 duplicates, 5 filtered")).toBeInTheDocument();
    expect(screen.getByText("Quality diagnostics")).toBeInTheDocument();
    expect(screen.getByText("1 articles / 0 empty")).toBeInTheDocument();
    expect(screen.getByText("score 82%, classification 100%, relevance 0.90")).toBeInTheDocument();
    expect(screen.getByText("RSS items are stored as metadata, excerpts, links, and derived signals only.")).toBeInTheDocument();
    expect(screen.getByText("Source filter: CNBC Indonesia Market")).toBeInTheDocument();
    expect(screen.getByText("CNBC Indonesia Market: Healthy - 20 seen / 15 matched")).toBeInTheDocument();
  });

  it("opens source context from the reliability score panel", async () => {
    const user = userEvent.setup();
    render(<NewsDashboard />);

    expect(await screen.findByText("Source Reliability")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Inspect source reliability CNBC Indonesia Market" }));

    expect(screen.getByLabelText("Source filter")).toHaveValue("cnbc-market");
    expect(screen.getByText("Source filter: CNBC Indonesia Market")).toBeInTheDocument();
    expect(screen.getByText("CNBC Indonesia Market: Healthy - 20 seen / 15 matched")).toBeInTheDocument();
  });

  it("makes the evidence action queue drive source, ticker, and narrative filters", async () => {
    const user = userEvent.setup();
    render(<NewsDashboard />);

    expect(await screen.findByText("Evidence Action Queue")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Inspect action source IDX Channel" }));

    expect(screen.getByLabelText("Source filter")).toHaveValue("idx-channel");
    expect(screen.getByText("Source filter: IDX Channel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Focus action ticker BBCA" }));

    expect(screen.getByLabelText("Ticker filter")).toHaveValue("BBCA");
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("ticker=BBCA"))).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "Search action narrative Flow & Liquidity" }));

    expect(screen.getByRole("button", { name: "semantic" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("query=Flow+%26+Liquidity") && url.includes("queryMode=semantic"))).toBe(true);
    });
  });

  it("makes material event radar drive ticker focus and semantic event search", async () => {
    const user = userEvent.setup();
    render(<NewsDashboard />);

    expect(await screen.findByText("Material Event Radar")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Focus material event ticker BBCA" }));

    expect(screen.getByLabelText("Ticker filter")).toHaveValue("BBCA");
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("ticker=BBCA"))).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "Search material event Gerak Pasar" }));

    expect(screen.getByRole("button", { name: "semantic" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("query=Gerak+Pasar") && url.includes("queryMode=semantic"))).toBe(true);
    });
  });

  it("makes wild insight drilldowns actionable through semantic search and ticker focus", async () => {
    const user = userEvent.setup();
    render(<NewsDashboard />);

    expect(await screen.findByText("Insight Drilldown")).toBeInTheDocument();
    expect(screen.getByText("Story Cluster Explorer")).toBeInTheDocument();
    expect(screen.getByText("Gerak Pasar - BBCA")).toBeInTheDocument();
    expect(screen.getByText("1 article - positive 1, neutral/mixed/unknown 0, negative 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search story cluster Gerak Pasar - BBCA" })).toBeEnabled();
    expect(screen.getByText("Event Impact Explorer")).toBeInTheDocument();
    expect(screen.getByText("6 samples - avg 3D +0.80%, win 67%, volume 1.20")).toBeInTheDocument();
    expect(screen.getByText("Top tickers: BBCA, BBRI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search event impact Gerak Pasar" })).toBeEnabled();
    expect(screen.getByText("Flow & Liquidity")).toBeInTheDocument();
    expect(screen.getByText("CNBC Indonesia Market -> BBCA")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "IDX" })).toHaveAttribute("href", "https://www.idx.co.id/id/perusahaan-tercatat/keterbukaan-informasi");
    expect(screen.getByRole("button", { name: "Review article IHSG Hari Ini Melesat" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Search story cluster Gerak Pasar - BBCA" }));

    expect(screen.getByRole("button", { name: "semantic" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("query=Gerak+Pasar+-+BBCA") && url.includes("queryMode=semantic"))).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "Search event impact Gerak Pasar" }));

    expect(screen.getByRole("button", { name: "semantic" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("query=Gerak+Pasar") && url.includes("queryMode=semantic"))).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "Search narrative Flow & Liquidity" }));

    expect(screen.getByRole("button", { name: "semantic" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("query=Flow+%26+Liquidity") && url.includes("queryMode=semantic"))).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "Focus ticker BBCA from market memory" }));

    expect(screen.getByLabelText("Ticker filter")).toHaveValue("BBCA");
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("ticker=BBCA"))).toBe(true);
    });
  });

  it("runs classification and reloads page data", async () => {
    const user = userEvent.setup();
    render(<NewsDashboard />);

    await waitFor(() => expect(screen.getAllByText("IHSG Hari Ini Melesat").length).toBeGreaterThanOrEqual(2));
    await user.click(screen.getByRole("button", { name: /classify/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/news/sentiment", expect.objectContaining({ method: "POST" }));
    });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/news/articles"));
  });

  it("passes semantic search mode to the article request", async () => {
    const user = userEvent.setup();
    render(<NewsDashboard />);

    await waitFor(() => expect(screen.getAllByText("IHSG Hari Ini Melesat").length).toBeGreaterThanOrEqual(2));
    await user.click(screen.getByRole("button", { name: "semantic" }));
    await user.type(screen.getByPlaceholderText("Semantic search"), "aksi korporasi");

    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("query=aksi+korporasi") && url.includes("queryMode=semantic"))).toBe(true);
    });
  });

  it("shows live classification progress and locks the classify button", async () => {
    const user = userEvent.setup();
    const encoder = new TextEncoder();
    let closeClassifyStream = () => {};

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/news/articles")) {
        return jsonResponse(articles);
      }
      if (url.startsWith("/api/news/summary")) {
        return jsonResponse(summary);
      }
      if (url.startsWith("/api/news/insights")) {
        return jsonResponse(insights);
      }
      if (url === "/api/news/sync") {
        return jsonResponse(sync);
      }
      if (url === "/api/news/enrich") {
        return jsonResponse(enrich);
      }
      if (url === "/api/news/sentiment" && init?.method === "POST") {
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "article-classified",
                title: "PYFA Tunda Right Issue",
                index: 1,
                message: "Selesai: PYFA Tunda Right Issue",
                summary: {
                  total: 2,
                  classifiedCount: 1,
                  skippedCount: 0,
                  remainingCount: 1,
                },
              })}\n\n`));
              closeClassifyStream = () => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: "classification-completed",
                  message: "Classify selesai: 2 berita dianalisis.",
                  summary: {
                    total: 2,
                    classifiedCount: 2,
                    skippedCount: 0,
                    remainingCount: 0,
                  },
                })}\n\n`));
                controller.close();
              };
            },
          }),
        } as Response;
      }
      throw new Error(`Unexpected request ${url}`);
    }));

    render(<NewsDashboard />);

    await waitFor(() => expect(screen.getAllByText("IHSG Hari Ini Melesat").length).toBeGreaterThanOrEqual(2));
    await user.click(screen.getByRole("button", { name: /classify/i }));

    expect(await screen.findByText("Sedang classify")).toBeInTheDocument();
    expect(screen.getByText("PYFA Tunda Right Issue")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progress classify berita" })).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByRole("button", { name: /classifying/i })).toBeDisabled();

    await act(async () => {
      closeClassifyStream();
    });

    await waitFor(() => expect(screen.getByText("Classify selesai")).toBeInTheDocument());
    expect(screen.getByRole("progressbar", { name: "Progress classify berita" })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("button", { name: /^classify$/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Close classify progress" }));

    expect(screen.queryByText("Classify selesai")).not.toBeInTheDocument();
  });

  it("shows live enrichment progress and locks the enrich button", async () => {
    const user = userEvent.setup();
    const encoder = new TextEncoder();
    let closeEnrichmentStream = () => {};

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/news/articles")) {
        return jsonResponse(articles);
      }
      if (url.startsWith("/api/news/summary")) {
        return jsonResponse(summary);
      }
      if (url.startsWith("/api/news/insights")) {
        return jsonResponse(insights);
      }
      if (url === "/api/news/sync") {
        return jsonResponse(sync);
      }
      if (url === "/api/news/enrich" && init?.method === "POST") {
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "article-enriched",
                title: "Bisnis artikel kosong",
                index: 1,
                url: "https://market.bisnis.com/read/a",
                contentQualityScore: 0.72,
                message: "Enriched: Bisnis artikel kosong",
                summary: {
                  totalArticles: 2,
                  processedCount: 1,
                  enrichedCount: 1,
                  skippedCount: 0,
                  failedCount: 0,
                  remainingCount: 1,
                },
              })}\n\n`));
              closeEnrichmentStream = () => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: "enrichment-completed",
                  message: "Enrich selesai: 2 berhasil, 0 gagal, 0 dilewati.",
                  summary: {
                    totalArticles: 2,
                    processedCount: 2,
                    enrichedCount: 2,
                    skippedCount: 0,
                    failedCount: 0,
                    remainingCount: 0,
                  },
                })}\n\n`));
                controller.close();
              };
            },
          }),
        } as Response;
      }
      if (url === "/api/news/enrich") {
        return jsonResponse(enrich);
      }
      throw new Error(`Unexpected request ${url}`);
    }));

    render(<NewsDashboard />);

    await waitFor(() => expect(screen.getAllByText("IHSG Hari Ini Melesat").length).toBeGreaterThanOrEqual(2));
    await user.click(screen.getByRole("button", { name: /^enrich$/i }));

    expect(await screen.findByText("Sedang enrich")).toBeInTheDocument();
    expect(screen.getByText("Bisnis artikel kosong")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progress enrich berita" })).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByRole("button", { name: /enriching/i })).toBeDisabled();

    await act(async () => {
      closeEnrichmentStream();
    });

    await waitFor(() => expect(screen.getByText("Enrich selesai")).toBeInTheDocument());
    expect(screen.getByRole("progressbar", { name: "Progress enrich berita" })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("button", { name: /^enrich$/i })).toBeEnabled();
  });

  it("submits human sentiment feedback from the inspector", async () => {
    const user = userEvent.setup();
    render(<NewsDashboard />);

    await waitFor(() => expect(screen.getAllByText("IHSG Hari Ini Melesat").length).toBeGreaterThanOrEqual(2));
    await user.selectOptions(screen.getByLabelText("Sentiment"), "negative");
    await user.click(screen.getByRole("button", { name: "Save feedback" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/news/feedback", expect.objectContaining({ method: "POST" }));
    });
    const feedbackCall = vi.mocked(fetch).mock.calls.find((call) => {
      const [, init] = call;
      return String(call[0]) === "/api/news/feedback" && init && "method" in init && init.method === "POST";
    });
    expect(JSON.parse(String((feedbackCall?.[1] as RequestInit).body))).toMatchObject({
      articleId: "a1",
      sentimentLabel: "negative",
    });
    expect(await screen.findByText("Feedback tersimpan dan sentiment artikel diperbarui.")).toBeInTheDocument();
  });

  it("opens source and date controls before syncing news", async () => {
    const user = userEvent.setup();
    render(<NewsDashboard />);

    await waitFor(() => expect(screen.getAllByText("IHSG Hari Ini Melesat").length).toBeGreaterThanOrEqual(2));
    await user.click(screen.getByRole("button", { name: "Sync" }));

    expect(screen.getByRole("dialog", { name: "Sync Berita" })).toBeInTheDocument();
    for (const source of newsSources) {
      expect(screen.getByRole("checkbox", { name: source.name })).toBeInTheDocument();
    }
    expect(screen.getAllByText(/original link retained/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/public review required/i).length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText("Rentang berita"), "14");
    await user.click(screen.getByRole("button", { name: "Kosongkan" }));
    await user.click(screen.getByRole("checkbox", { name: "Bisnis Bursa Saham" }));
    await user.click(screen.getByRole("button", { name: /mulai sync/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/news/sync", expect.objectContaining({ method: "POST" }));
    });
    const syncCall = vi.mocked(fetch).mock.calls.find((call) => {
      const [, init] = call;
      return String(call[0]) === "/api/news/sync" && init && "method" in init && init.method === "POST";
    });
    expect(JSON.parse(String((syncCall?.[1] as RequestInit).body))).toEqual({
      days: 14,
      limit: 40,
      sources: ["bisnis-bursa-saham"],
    });
  });

  it("shows live sync progress and locks controls while scraping is running", async () => {
    const user = userEvent.setup();
    const encoder = new TextEncoder();
    let closeSyncStream = () => {};

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/news/articles")) {
        return jsonResponse(articles);
      }
      if (url.startsWith("/api/news/summary")) {
        return jsonResponse(summary);
      }
      if (url.startsWith("/api/news/insights")) {
        return jsonResponse(insights);
      }
      if (url === "/api/news/enrich") {
        return jsonResponse(enrich);
      }
      if (url === "/api/news/sync" && init?.method === "POST") {
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "page-completed",
                sourceName: "EmitenNews Emiten",
                pageNumber: 2,
                pageUrl: "https://emitennews.com/category/emiten/9",
                pageItemCount: 12,
                newItemCount: 12,
                message: "EmitenNews Emiten: halaman 2 selesai, 12 artikel ditemukan.",
                summary: {
                  runId: "run-1",
                  status: "running",
                  totalSources: 1,
                  completedSources: 0,
                  successCount: 0,
                  failedCount: 0,
                  totalCandidates: 12,
                  matchedCount: 0,
                  insertedCount: 0,
                  duplicateCount: 0,
                  filteredCount: 0,
                },
              })}\n\n`));
              closeSyncStream = () => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: "run-completed",
                  message: "Sync selesai: 7 artikel baru dari 9 artikel cocok.",
                  summary: {
                    runId: "run-1",
                    status: "completed",
                    totalSources: 1,
                    completedSources: 1,
                    successCount: 1,
                    failedCount: 0,
                    totalCandidates: 12,
                    matchedCount: 9,
                    insertedCount: 7,
                    duplicateCount: 2,
                    filteredCount: 3,
                  },
                })}\n\n`));
                controller.close();
              };
            },
          }),
        } as Response;
      }
      if (url === "/api/news/sync") {
        return jsonResponse(sync);
      }
      throw new Error(`Unexpected request ${url}`);
    }));

    render(<NewsDashboard />);

    await waitFor(() => expect(screen.getAllByText("IHSG Hari Ini Melesat").length).toBeGreaterThanOrEqual(2));
    await user.click(screen.getByRole("button", { name: "Sync" }));
    await user.click(screen.getByRole("button", { name: "Kosongkan" }));
    await user.click(screen.getByRole("checkbox", { name: "EmitenNews Emiten" }));
    await user.click(screen.getByRole("button", { name: /mulai sync/i }));

    expect(await screen.findByText("Sedang scraping")).toBeInTheDocument();
    expect(screen.getByText("EmitenNews Emiten - Halaman 2")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progress sync berita" })).toHaveAttribute("aria-valuenow", "35");
    expect(screen.getByRole("button", { name: /sync berjalan/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Kosongkan" })).toBeDisabled();

    await act(async () => {
      closeSyncStream();
    });

    await waitFor(() => expect(screen.getByText("Sync selesai")).toBeInTheDocument());
    expect(screen.getAllByText("Sync selesai: 7 artikel baru dari 9 artikel cocok.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /mulai sync/i })).toBeEnabled();
  });

  it("uses the route ticker as the initial evidence filter", async () => {
    render(<NewsDashboard initialTicker="bbca" />);

    expect(await screen.findByLabelText("Ticker filter")).toHaveValue("BBCA");
    await waitFor(() => expect(screen.getAllByText("IHSG Hari Ini Melesat").length).toBeGreaterThanOrEqual(2));
    expect(screen.getByRole("link", { name: "Structure Screener" })).toHaveAttribute("href", "/?symbol=BBCA.JK");
    expect(await screen.findByRole("link", { name: "Open chart context" })).toHaveAttribute("href", "/?symbol=BBCA.JK&asOf=2026-06-15");
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/news/articles?"));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("ticker=BBCA"));
    });
  });

  it("uses the route query as the initial text evidence filter", async () => {
    render(<NewsDashboard initialTicker="bbca" initialQuery="Dividen" />);

    expect(await screen.findByLabelText("Ticker filter")).toHaveValue("BBCA");
    expect(screen.getByLabelText("Search news")).toHaveValue("Dividen");
    expect(screen.getByText("query Dividen")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/news/articles?"));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("ticker=BBCA"));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("query=Dividen"));
    });
  });

  it("uses the route query mode as the initial semantic evidence filter", async () => {
    render(<NewsDashboard initialQuery="aksi korporasi" initialQueryMode="semantic" />);

    expect(await screen.findByLabelText("Search news")).toHaveValue("aksi korporasi");
    expect(screen.getByRole("button", { name: "semantic" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("query aksi korporasi")).toBeInTheDocument();
    expect(screen.getByText("semantic search")).toBeInTheDocument();
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("query=aksi+korporasi") && url.includes("queryMode=semantic"))).toBe(true);
    });
  });

  it("uses the route days as the initial evidence window", async () => {
    render(<NewsDashboard initialTicker="bbca" initialDays="365" />);

    expect(await screen.findByLabelText("News days filter")).toHaveValue("365");
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/news/articles?limit=100&minRelevance=0&days=365"));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/news/summary?days=365"));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/news/insights?days=365"));
    });
  });

  it("uses the route sentiment as the initial evidence filter", async () => {
    render(<NewsDashboard initialSentiment="positive" />);

    expect(await screen.findByLabelText("Sentiment filter")).toHaveValue("positive");
    expect(screen.getByText("sentiment positive")).toBeInTheDocument();
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("sentiment=positive"))).toBe(true);
    });
  });

  it("uses the route source as the initial evidence filter", async () => {
    render(<NewsDashboard initialSourceId="cnbc-market" />);

    expect(await screen.findByLabelText("Source filter")).toHaveValue("cnbc-market");
    expect(screen.getByText("source CNBC Indonesia Market")).toBeInTheDocument();
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("sourceId=cnbc-market"))).toBe(true);
    });
  });

  it("uses the route relevance threshold as the initial evidence filter", async () => {
    render(<NewsDashboard initialMinRelevance="0.4" />);

    expect(await screen.findByLabelText("Minimum relevance filter")).toHaveValue("0.4");
    expect(screen.getByText("relevance >= 0.4")).toBeInTheDocument();
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("minRelevance=0.4"))).toBe(true);
    });
  });

  it("treats a custom days window as an active filter that can be cleared", async () => {
    const user = userEvent.setup();
    render(<NewsDashboard initialDays="365" />);

    expect(await screen.findByLabelText("News days filter")).toHaveValue("365");
    expect(screen.getByText("window 365 days")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByLabelText("News days filter")).toHaveValue("7");
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("days=7"))).toBe(true);
    });
  });

  it("shows and clears the active relevance threshold", async () => {
    const user = userEvent.setup();
    render(<NewsDashboard />);

    const relevanceFilter = await screen.findByLabelText("Minimum relevance filter");
    fireEvent.change(relevanceFilter, { target: { value: "0.4" } });

    expect(screen.getByText("relevance >= 0.4")).toBeInTheDocument();
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("minRelevance=0.4"))).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(relevanceFilter).toHaveValue("0");
    expect(screen.queryByText("relevance >= 0.4")).not.toBeInTheDocument();
  });

  it("shows and clears the active sentiment filter", async () => {
    const user = userEvent.setup();
    render(<NewsDashboard />);

    const sentimentFilter = await screen.findByLabelText("Sentiment filter");
    await user.selectOptions(sentimentFilter, "positive");

    expect(screen.getByText("sentiment positive")).toBeInTheDocument();
    await waitFor(() => {
      const articleUrls = vi.mocked(fetch).mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/news/articles"));
      expect(articleUrls.some((url) => url.includes("sentiment=positive"))).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(sentimentFilter).toHaveValue("all");
    expect(screen.queryByText("sentiment positive")).not.toBeInTheDocument();
  });

  it("keeps the route timeframe when returning from news to chart context", async () => {
    render(<NewsDashboard initialTicker="bbca" initialTimeframe="1w" />);

    expect(await screen.findByLabelText("Ticker filter")).toHaveValue("BBCA");
    await waitFor(() => expect(screen.getAllByText("IHSG Hari Ini Melesat").length).toBeGreaterThanOrEqual(2));
    expect(screen.getByRole("link", { name: "Structure Screener" })).toHaveAttribute("href", "/?symbol=BBCA.JK&timeframe=1w");
    expect(await screen.findByRole("link", { name: "Open chart context" })).toHaveAttribute("href", "/?symbol=BBCA.JK&timeframe=1w&asOf=2026-06-15");
  });

  it("lets users clear a ticker filter when no news matches it", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/news/articles") && url.includes("ticker=BBCA")) {
        return jsonResponse({ articles: [], total: 0, limit: 100, offset: 0 });
      }
      if (url.startsWith("/api/news/articles")) {
        return jsonResponse(articles);
      }
      if (url.startsWith("/api/news/summary")) {
        return jsonResponse(summary);
      }
      if (url.startsWith("/api/news/insights")) {
        return jsonResponse(insights);
      }
      if (url === "/api/news/enrich") {
        return jsonResponse(enrich);
      }
      if (url === "/api/news/sync") {
        return jsonResponse(sync);
      }
      throw new Error(`Unexpected request ${url}`);
    }));
    const user = userEvent.setup();
    render(<NewsDashboard initialTicker="bbca" />);

    expect(await screen.findByText("No articles match the current filters")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /clear filters and show all news/i }));

    await waitFor(() => expect(screen.getAllByText("IHSG Hari Ini Melesat").length).toBeGreaterThanOrEqual(2));
    expect(screen.getByLabelText("Ticker filter")).toHaveValue("");
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}
