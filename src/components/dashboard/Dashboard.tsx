"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  LineChart,
  Loader2,
  Newspaper,
  Plus,
  RefreshCw,
  Search,
  Star,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import {
  DEFAULT_INDICATOR_VISIBILITY,
  StructureChart,
  type IndicatorVisibility,
} from "@/components/dashboard/StructureChart";
import { buildProjectionScenarios, type ProjectionScenario } from "@/lib/analysis/projectionEngine";
import { aggregateBarsByCount } from "@/lib/market/chartAggregation";
import { buildAnomalyLens, type ChartAnomaly } from "@/lib/market/anomalyLens";
import type { AnalysisMode, BacktestOutcome, BestExample, ChartPayload, SymbolSummary, SyncSymbolStatus, Timeframe, WatchlistItem } from "@/lib/market/types";
import { buildConfidenceBreakdown, type ConfidenceBreakdown } from "@/lib/research/confidenceBreakdown";
import { buildConfluenceHeatmap, type ConfluenceHeatmapRow } from "@/lib/research/confluenceHeatmap";
import { buildDataQualityGuard, type DataQualityGuardResult } from "@/lib/research/dataQualityGuard";
import { findHistoricalAnalogs, type HistoricalAnalogMatch } from "@/lib/research/historicalAnalog";
import { buildProjectionExplanations, type ProjectionExplanation } from "@/lib/research/projectionExplanation";
import { createResearchCache } from "@/lib/research/researchCache";
import { buildScenarioTree, type ScenarioTreeNode } from "@/lib/research/scenarioTree";
import { buildRecalculatedTimeMachineSnapshot, buildTimeMachineNarrative, buildTimeMachineSnapshot, type TimeMachineSnapshot } from "@/lib/research/timeMachine";
import { compareTimeframeStructures, type TimeframeConflictResult } from "@/lib/research/timeframeConflict";
import { summarizeTopicImpact, type TopicImpactSummary } from "@/lib/news/topicImpact";
import type { NewsChartEvent } from "@/lib/news/newsEvents";

type SyncResponse = {
  active: boolean;
  run: {
    id: string;
    status: string;
    totalSymbols: number;
    successCount: number;
    skippedCount?: number;
    failedCount: number;
    startedAt: string;
    finishedAt: string | null;
  } | null;
  statuses: SyncSymbolStatus[];
  totalStatuses?: number;
};

const SCREENER_PAGE_SIZE = 10;
const SCANNER_GROUP_COMPACT_LIMIT = 40;
const DEFAULT_WATCHLIST_NOTE = "Monitor weekly structure";
const DEFAULT_SYMBOL = "BBCA.JK";
const BRAND_ICON_SRC = "/brand/nexa-quant-concept-1-icon-tight.png";
const BRAND_LOGO_SRC = "/brand/nexa-quant-concept-1-primary.png";
const CHART_NEWS_EVIDENCE_DAYS = 365;
type RangeLabel = "1D" | "5D" | "1W" | "1M" | "3M" | "6M" | "1Y";
type RangeOption = { label: RangeLabel; groupSize: number };
type ScannerTab = "accumulation" | "distribution" | "structure" | "pva";

const DAILY_RANGE_OPTIONS: RangeOption[] = [
  { label: "1D", groupSize: 1 },
  { label: "5D", groupSize: 5 },
  { label: "1M", groupSize: 22 },
  { label: "3M", groupSize: 66 },
  { label: "6M", groupSize: 132 },
  { label: "1Y", groupSize: 252 },
];

const WEEKLY_RANGE_OPTIONS: RangeOption[] = [
  { label: "1W", groupSize: 1 },
  { label: "1M", groupSize: 4 },
  { label: "3M", groupSize: 13 },
  { label: "6M", groupSize: 26 },
  { label: "1Y", groupSize: 52 },
];

const ELLIOTT_LABELS = new Set(["Impulse", "Correction"]);
const PVA_LABELS = new Set([
  "Demand Expansion",
  "Supply Expansion",
  "Absorption",
  "Volume Climax",
  "Supply Dry-Up",
  "Weak Rally",
  "Breakout Confirmed",
  "Breakdown Confirmed",
  "Failed Breakout",
  "Failed Breakdown",
]);
const PVA_SCANNER_LABELS = new Set(["Absorption", "Breakout Confirmed", "Supply Dry-Up", "Volume Climax"]);

type UniverseMode = "all" | "watchlist";
type SyncMode = "all" | "watchlist" | "failed";
type ResearchBundle = {
  projections: ProjectionScenario[];
  conflict: TimeframeConflictResult;
  analogs: HistoricalAnalogMatch[];
  guard: DataQualityGuardResult;
  confidence: ConfidenceBreakdown;
  explanations: ProjectionExplanation[];
  scenarios: ScenarioTreeNode[];
};
type NewsTickerSummary = {
  totalArticles: number;
  classifiedArticles: number;
  unclassifiedArticles: number;
  weightedSentimentScore: number | null;
  averageRelevanceScore: number | null;
  sentimentCounts: {
    positive: number;
    negative: number;
    neutral: number;
    mixed: number;
    unknown: number;
  };
};
type NewsEventsResponse = {
  events: NewsChartEvent[];
};

const researchCache = createResearchCache<ResearchBundle>(80);

type DashboardProps = {
  initialSymbol?: string;
  initialTimeframe?: string;
  initialAsOf?: string;
};

export function Dashboard({ initialSymbol = "", initialTimeframe = "", initialAsOf = "" }: DashboardProps) {
  const normalizedInitialTimeframe = normalizeRouteTimeframe(initialTimeframe);
  const normalizedInitialAsOf = normalizeRouteAsOf(initialAsOf);
  const [symbols, setSymbols] = useState<SymbolSummary[]>([]);
  const [symbolTotal, setSymbolTotal] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState(() => normalizeRouteSymbol(initialSymbol));
  const [timeframe, setTimeframe] = useState<Timeframe>(normalizedInitialTimeframe);
  const [chart, setChart] = useState<ChartPayload | null>(null);
  const [companionChart, setCompanionChart] = useState<ChartPayload | null>(null);
  const [backtest, setBacktest] = useState<BacktestOutcome[]>([]);
  const [bestExamples, setBestExamples] = useState<BestExample[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistNote, setWatchlistNote] = useState(DEFAULT_WATCHLIST_NOTE);
  const [universe, setUniverse] = useState<UniverseMode>("all");
  const [scannerTab, setScannerTab] = useState<ScannerTab>("accumulation");
  const [range, setRange] = useState<RangeLabel>(() => resolveRangeForTimeframe(normalizedInitialTimeframe, "1D"));
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("strict");
  const [markerVisibility, setMarkerVisibility] = useState({ wyckoff: true, elliott: true, pva: true, projection: true, news: true, anomaly: false });
  const [indicatorVisibility, setIndicatorVisibility] = useState<IndicatorVisibility>(DEFAULT_INDICATOR_VISIBILITY);
  const [fitProjection, setFitProjection] = useState(false);
  const [selectedProjectionId, setSelectedProjectionId] = useState<string | null>(null);
  const [timeMachineEnabled, setTimeMachineEnabled] = useState(false);
  const [timeMachineCursor, setTimeMachineCursor] = useState<number | null>(null);
  const [showChartGuides, setShowChartGuides] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [showAnalogGhost, setShowAnalogGhost] = useState(false);
  const [selectedConfluenceDate, setSelectedConfluenceDate] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>("all");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 220);
  const [screenerPage, setScreenerPage] = useState(0);
  const [sync, setSync] = useState<SyncResponse | null>(null);
  const [newsSummary, setNewsSummary] = useState<NewsTickerSummary | null>(null);
  const [newsEvents, setNewsEvents] = useState<NewsChartEvent[]>([]);
  const [selectedNewsEventId, setSelectedNewsEventId] = useState<string | null>(null);
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [watchlistBusy, setWatchlistBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const symbolsRequestRef = useRef(0);
  const chartRequestRef = useRef(0);
  const companionChartRequestRef = useRef(0);
  const backtestRequestRef = useRef(0);
  const newsSummaryRequestRef = useRef(0);
  const newsEventsRequestRef = useRef(0);
  const routeAsOfAppliedRef = useRef(false);
  const rangeOptions = useMemo(() => getRangeOptions(timeframe), [timeframe]);
  const effectiveRange = resolveRangeForTimeframe(timeframe, range);
  const displayBars = useMemo(
    () => aggregateBarsByCount(chart?.bars ?? [], getRangeGroupSize(timeframe, effectiveRange)),
    [chart?.bars, effectiveRange, timeframe],
  );
  const baseAnnotations = useMemo(() => chart?.annotations ?? [], [chart?.annotations]);
  const maxTimeMachineCursor = Math.max(0, displayBars.length - 1);
  const effectiveTimeMachineCursor = timeMachineCursor ?? maxTimeMachineCursor;
  const timeMachineSnapshot = useMemo(
    () => timeMachineEnabled
      ? buildRecalculatedTimeMachineSnapshot(displayBars, effectiveTimeMachineCursor, {
        fullAnnotationCount: baseAnnotations.length,
        analysisMode,
      })
      : buildTimeMachineSnapshot(displayBars, baseAnnotations, maxTimeMachineCursor),
    [analysisMode, baseAnnotations, displayBars, effectiveTimeMachineCursor, maxTimeMachineCursor, timeMachineEnabled],
  );
  const researchBars = timeMachineEnabled ? timeMachineSnapshot.visibleBars : displayBars;
  const researchAnnotations = timeMachineEnabled ? timeMachineSnapshot.visibleAnnotations : baseAnnotations;

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/watchlist", { cache: "no-store" });
      const data = await response.json() as { items: WatchlistItem[] };
      setWatchlist(data.items);
      setWatchlistNote(data.items.find((item) => item.symbol === DEFAULT_SYMBOL)?.note || DEFAULT_WATCHLIST_NOTE);
    })();
    void loadSync();
  }, []);

  useEffect(() => {
    void loadChart(selectedSymbol, timeframe, analysisMode);
    void loadCompanionChart(selectedSymbol, oppositeTimeframe(timeframe), analysisMode);
    void loadBacktest(selectedSymbol, timeframe);
    // Request helpers use refs to guard stale responses; these state keys are the intended reload triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisMode, selectedSymbol, timeframe]);

  useEffect(() => {
    void loadSymbols(debouncedQuery);
  }, [debouncedQuery]);

  useEffect(() => {
    void loadBestExamples(timeframe);
  }, [timeframe]);

  useEffect(() => {
    void loadNewsSummary(selectedSymbol);
    void loadNewsEvents(selectedSymbol);
  }, [selectedSymbol]);

  useEffect(() => {
    if (!sync?.active) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadSync();
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [sync?.active]);

  useEffect(() => {
    if (!normalizedInitialAsOf || routeAsOfAppliedRef.current || displayBars.length === 0) {
      return;
    }

    setTimeMachineEnabled(true);
    setTimeMachineCursor(findTimeMachineCursorForDate(displayBars, normalizedInitialAsOf));
    routeAsOfAppliedRef.current = true;
  }, [displayBars, normalizedInitialAsOf]);

  const trackedSymbols = useMemo(() => new Set(watchlist.map((item) => item.symbol)), [watchlist]);
  const watchlistRows = useMemo(() => watchlist.map((item) => ({
    item,
    symbol: symbols.find((candidate) => candidate.symbol === item.symbol) ?? null,
  })), [symbols, watchlist]);
  const filteredSymbols = useMemo(() => {
    if (universe === "watchlist") {
      return symbols.filter((symbol) => trackedSymbols.has(symbol.symbol));
    }

    return symbols;
  }, [symbols, trackedSymbols, universe]);
  const displayTotal = universe === "watchlist" ? trackedSymbols.size : symbolTotal;

  const grouped = useMemo(() => ({
    accumulation: filteredSymbols.filter((symbol) =>
      symbol.latestAnnotations.some((label) => ["SC", "Spring", "SOS", "LPS"].includes(label)),
    ),
    distribution: filteredSymbols.filter((symbol) =>
      symbol.latestAnnotations.some((label) => ["BC", "UTAD", "SOW", "LPSY"].includes(label)),
    ),
    trending: filteredSymbols.filter((symbol) =>
      symbol.latestAnnotations.some((label) => ELLIOTT_LABELS.has(label)),
    ),
    pva: filteredSymbols.filter((symbol) =>
      symbol.latestAnnotations.some((label) => PVA_SCANNER_LABELS.has(label)),
    ),
  }), [filteredSymbols]);
  const scannerGroups = useMemo(() => ({
    accumulation: {
      label: "Accumulation",
      tone: "green" as const,
      rows: grouped.accumulation,
    },
    distribution: {
      label: "Distribution",
      tone: "red" as const,
      rows: grouped.distribution,
    },
    structure: {
      label: "Structure",
      tone: "blue" as const,
      rows: grouped.trending,
    },
    pva: {
      label: "Price Volume",
      tone: "amber" as const,
      rows: grouped.pva,
    },
  }), [grouped]);
  const activeScannerGroup = scannerGroups[scannerTab];
  const scannerQuery = query.trim().toLowerCase();
  const activeScannerRows = scannerQuery
    ? filteredSymbols.filter((symbol) =>
      symbol.symbol.toLowerCase().includes(scannerQuery)
      || symbol.name.toLowerCase().includes(scannerQuery)
      || symbol.sector.toLowerCase().includes(scannerQuery),
    )
    : activeScannerGroup.rows;

  const wyckoff = researchAnnotations.filter((annotation) => annotation.family === "wyckoff");
  const elliott = researchAnnotations.filter((annotation) => annotation.family === "elliott");
  const pva = researchAnnotations.filter((annotation) => annotation.family === "pva");
  const companionAnnotations = useMemo(() => companionChart?.annotations ?? [], [companionChart?.annotations]);
  const researchBundle = useMemo(
    () => researchCache.getOrCompute({
      symbol: selectedSymbol,
      timeframe,
      rangeLabel: effectiveRange,
      bars: researchBars,
      annotations: researchAnnotations,
      companionAnnotations,
      cursorIndex: effectiveTimeMachineCursor,
      timeMachineEnabled,
      analysisMode,
    }, () => {
      const projections = buildProjectionScenarios(researchAnnotations, researchBars);
      const conflict = compareTimeframeStructures(
        researchAnnotations,
        timeframe,
        companionAnnotations,
        oppositeTimeframe(timeframe),
      );
      const guard = buildDataQualityGuard(researchBars, chart?.dataQuality);
      const confidence = buildConfidenceBreakdown(researchAnnotations, projections, conflict, guard);
      return {
        projections,
        conflict,
        analogs: findHistoricalAnalogs(researchBars),
        guard,
        confidence,
        explanations: buildProjectionExplanations(projections, researchAnnotations),
        scenarios: buildScenarioTree(projections, researchAnnotations),
      };
    }),
    [
      chart?.dataQuality,
      companionAnnotations,
      effectiveRange,
      effectiveTimeMachineCursor,
      researchAnnotations,
      researchBars,
      selectedSymbol,
      timeframe,
      timeMachineEnabled,
      analysisMode,
    ],
  );
  const researchCacheSize = researchBundle ? 1 : 0;
  const confluenceHeatmap = useMemo(
    () => buildConfluenceHeatmap({
      bars: researchBars,
      annotations: researchAnnotations,
      newsEvents,
    }),
    [newsEvents, researchAnnotations, researchBars],
  );
  const selectedConfluenceRow = useMemo(
    () => confluenceHeatmap.find((row) => row.date === selectedConfluenceDate) ?? confluenceHeatmap.at(-1) ?? null,
    [confluenceHeatmap, selectedConfluenceDate],
  );
  const anomalies = useMemo(() => buildAnomalyLens(researchBars), [researchBars]);
  const topicImpact = useMemo(() => summarizeTopicImpact(newsEvents), [newsEvents]);
  const selectedNewsEvent = useMemo(
    () => newsEvents.find((event) => event.id === selectedNewsEventId) ?? newsEvents[0] ?? null,
    [newsEvents, selectedNewsEventId],
  );
  const selectedAnomaly = useMemo(
    () => anomalies.find((anomaly) => anomaly.id === selectedAnomalyId) ?? anomalies[0] ?? null,
    [anomalies, selectedAnomalyId],
  );
  const projectionScenarios = researchBundle.projections;
  const effectiveSelectedProjectionId = getEffectiveProjectionId(selectedProjectionId, projectionScenarios);
  const selected = symbols.find((symbol) => symbol.symbol === selectedSymbol);
  const isSelectedTracked = trackedSymbols.has(selectedSymbol);
  const latestBar = researchBars.at(-1);
  const previousBar = researchBars.at(-2);
  const change = latestBar && previousBar ? latestBar.close - previousBar.close : 0;
  const changePct = latestBar && previousBar ? (change / previousBar.close) * 100 : 0;
  const newsTone = getNewsTone(newsSummary);
  const newsTicker = selectedSymbol.replace(/\.JK$/i, "");
  const newsHref = newsPageHref({ timeframe });
  const tickerNewsHref = newsPageHref({ ticker: newsTicker, timeframe });
  const handleChartMarkerSelect = useCallback((markerId: string) => {
    if (markerId.startsWith("news-")) {
      setSelectedNewsEventId(markerId);
      return;
    }

    if (markerId.startsWith("anomaly-")) {
      setSelectedAnomalyId(markerId);
    }
  }, []);
  const workspaceGridClass = sidebarCollapsed
    ? "grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 md:grid-cols-[72px_minmax(0,1fr)] md:overflow-hidden xl:grid-cols-[72px_minmax(0,1fr)_340px]"
    : "grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 md:grid-cols-[240px_minmax(0,1fr)] md:overflow-hidden xl:grid-cols-[260px_minmax(0,1fr)_340px]";
  const activeAnnotationsCount = researchAnnotations.filter((annotation) => annotation.status !== "invalidated").length;

  async function loadSymbols(nextQuery = "") {
    const requestId = symbolsRequestRef.current + 1;
    symbolsRequestRef.current = requestId;
    const params = new URLSearchParams({ limit: "1000" });
    if (nextQuery.trim()) {
      params.set("query", nextQuery.trim());
    }

    const response = await fetch(`/api/symbols?${params}`, { cache: "no-store" });
    const data = await response.json() as { symbols: SymbolSummary[]; total?: number };
    if (requestId !== symbolsRequestRef.current) {
      return;
    }

    setSymbols(data.symbols);
    setSymbolTotal(data.total ?? data.symbols.length);
  }

  async function loadChart(symbol: string, nextTimeframe: Timeframe, nextAnalysisMode = analysisMode) {
    const requestId = chartRequestRef.current + 1;
    chartRequestRef.current = requestId;
    setLoadingChart(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        symbol,
        timeframe: nextTimeframe,
        analysisMode: nextAnalysisMode,
      });

      const response = await fetch(`/api/chart?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load chart");
      }

      if (requestId !== chartRequestRef.current) {
        return;
      }

      setChart(data as ChartPayload);
    } catch (err) {
      if (requestId === chartRequestRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (requestId === chartRequestRef.current) {
        setLoadingChart(false);
      }
    }
  }

  async function loadCompanionChart(symbol: string, nextTimeframe: Timeframe, nextAnalysisMode = analysisMode) {
    const requestId = companionChartRequestRef.current + 1;
    companionChartRequestRef.current = requestId;
    try {
      const params = new URLSearchParams({
        symbol,
        timeframe: nextTimeframe,
        analysisMode: nextAnalysisMode,
      });
      const response = await fetch(`/api/chart?${params}`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load companion chart");
      }

      if (requestId === companionChartRequestRef.current) {
        setCompanionChart(data as ChartPayload);
      }
    } catch {
      if (requestId === companionChartRequestRef.current) {
        setCompanionChart(null);
      }
    }
  }

  async function loadSync() {
    const response = await fetch("/api/sync?limit=1000", { cache: "no-store" });
    setSync(await response.json() as SyncResponse);
  }

  async function loadBacktest(symbol: string, nextTimeframe: Timeframe) {
    const requestId = backtestRequestRef.current + 1;
    backtestRequestRef.current = requestId;
    const response = await fetch(`/api/backtest?symbol=${encodeURIComponent(symbol)}&timeframe=${nextTimeframe}&horizons=5,20,60`, {
      cache: "no-store",
    });
    const data = await response.json() as { outcomes: BacktestOutcome[] };
    if (requestId !== backtestRequestRef.current) {
      return;
    }

    setBacktest(data.outcomes);
  }

  async function loadBestExamples(nextTimeframe: Timeframe) {
    const response = await fetch(`/api/best-examples?timeframe=${nextTimeframe}&limit=8`, { cache: "no-store" });
    const data = await response.json() as { examples?: BestExample[] };
    if (response.ok) {
      setBestExamples(data.examples ?? []);
    }
  }

  async function loadNewsSummary(symbol: string) {
    const requestId = newsSummaryRequestRef.current + 1;
    newsSummaryRequestRef.current = requestId;
    try {
      const ticker = symbol.replace(/\.JK$/i, "");
      const response = await fetch(`/api/news/summary?days=7&ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" });
      const data = await response.json() as NewsTickerSummary;
      if (requestId === newsSummaryRequestRef.current && response.ok) {
        setNewsSummary(data);
      }
    } catch {
      if (requestId === newsSummaryRequestRef.current) {
        setNewsSummary(null);
      }
    }
  }

  async function loadNewsEvents(symbol: string) {
    const requestId = newsEventsRequestRef.current + 1;
    newsEventsRequestRef.current = requestId;
    try {
      const ticker = symbol.replace(/\.JK$/i, "");
      const response = await fetch(`/api/news/events?days=365&limit=12&minMateriality=0.65&ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" });
      const data = await response.json() as NewsEventsResponse;
      if (requestId === newsEventsRequestRef.current && response.ok) {
        setNewsEvents(data.events);
      }
    } catch {
      if (requestId === newsEventsRequestRef.current) {
        setNewsEvents([]);
      }
    }
  }

  async function startSync() {
    setError(null);
    setSync({ active: true, run: sync?.run ?? null, statuses: sync?.statuses ?? [], totalStatuses: sync?.totalStatuses });
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: syncMode, concurrency: 3, skipFreshDays: 2 }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Unable to start sync");
    }
    await loadSync();
  }

  async function recalculateCached() {
    setRecalculating(true);
    setError(null);
    try {
      const response = await fetch("/api/recalculate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: universe === "watchlist" ? "watchlist" : "all",
          timeframe: "all",
          analysisMode,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to recalculate cached structures");
      }

      await Promise.all([
        loadChart(selectedSymbol, timeframe, analysisMode),
        loadCompanionChart(selectedSymbol, oppositeTimeframe(timeframe), analysisMode),
        loadBacktest(selectedSymbol, timeframe),
        loadSymbols(debouncedQuery),
        loadBestExamples(timeframe),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecalculating(false);
    }
  }

  async function addWatchlistSymbol(symbol: string, note = "") {
    if (watchlistBusy.has(symbol)) {
      return;
    }

    setError(null);
    setWatchlistBusy((items) => new Set(items).add(symbol));
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, note: note.trim(), tags: ["structure"] }),
      });
      const data = await response.json() as { item?: WatchlistItem; error?: string };

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "Unable to add ticker to watchlist");
      }

      const item = data.item;
      setWatchlist((items) => [item, ...items.filter((candidate) => candidate.symbol !== item.symbol)]);
      if (symbol === selectedSymbol) {
        setWatchlistNote(item.note || DEFAULT_WATCHLIST_NOTE);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWatchlistBusy((items) => {
        const next = new Set(items);
        next.delete(symbol);
        return next;
      });
    }
  }

  async function removeWatchlistSymbol(symbol: string) {
    if (watchlistBusy.has(symbol)) {
      return;
    }

    setError(null);
    setWatchlistBusy((items) => new Set(items).add(symbol));
    try {
      const response = await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to remove ticker from watchlist");
      }

      setWatchlist((items) => items.filter((item) => item.symbol !== symbol));
      if (symbol === selectedSymbol) {
        setWatchlistNote(DEFAULT_WATCHLIST_NOTE);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWatchlistBusy((items) => {
        const next = new Set(items);
        next.delete(symbol);
        return next;
      });
    }
  }

  async function toggleWatchlist() {
    if (isSelectedTracked) {
      await removeWatchlistSymbol(selectedSymbol);
      return;
    }

    await addWatchlistSymbol(selectedSymbol, watchlistNote);
  }

  async function toggleScannerWatchlist(symbol: SymbolSummary) {
    if (trackedSymbols.has(symbol.symbol)) {
      await removeWatchlistSymbol(symbol.symbol);
      return;
    }

    await addWatchlistSymbol(symbol.symbol, symbol.watchlistNote ?? "Monitor structure");
  }

  function selectSymbol(symbol: string) {
    setSelectedSymbol(symbol);
    setWatchlistNote(watchlist.find((item) => item.symbol === symbol)?.note || DEFAULT_WATCHLIST_NOTE);
  }

  function selectBestExample(example: BestExample) {
    setSelectedSymbol(example.symbol);
    setTimeframe(example.timeframe);
    setRange(resolveRangeForTimeframe(example.timeframe, range));
    setWatchlistNote(watchlist.find((item) => item.symbol === example.symbol)?.note || DEFAULT_WATCHLIST_NOTE);
  }

  function changeAnalysisMode(nextMode: AnalysisMode) {
    setAnalysisMode(nextMode);
    setSelectedProjectionId(null);
  }

  function toggleMarkerLayer(layer: keyof typeof markerVisibility) {
    setMarkerVisibility((current) => ({
      ...current,
      [layer]: !current[layer],
    }));
  }

  function toggleIndicatorLayer(layer: keyof IndicatorVisibility) {
    setIndicatorVisibility((current) => ({
      ...current,
      [layer]: !current[layer],
    }));
  }

  return (
    <div className="h-screen overflow-hidden bg-[#f5f7fa] text-slate-900">
      <main className="flex h-screen min-w-0 flex-col overflow-hidden">
        <header
          aria-label="Top command bar"
          className="grid min-h-16 shrink-0 grid-cols-1 gap-2 border-b border-slate-200 bg-white px-3 py-2 md:grid-cols-[310px_minmax(0,1fr)] md:items-center lg:grid-cols-[310px_minmax(0,1fr)_auto] xl:grid-cols-[310px_minmax(0,1fr)_auto]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src={BRAND_ICON_SRC}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-lg object-cover shadow-sm ring-1 ring-slate-900/10"
            />
            <div className="min-w-0 w-[132px]">
              <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">Nexa Quant cockpit</p>
              <h1 className="truncate text-lg font-bold tracking-tight text-slate-900">IDX Structure</h1>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="min-w-0 w-[112px] rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-sm font-bold text-slate-900">{selectedSymbol}</h2>
                <span className="text-[10px] font-bold uppercase text-slate-400">IDX</span>
              </div>
              <p className="truncate text-[11px] text-slate-500">{selected?.name ?? "IDX symbol"}</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden">
            <div className="flex h-9 min-w-[150px] flex-1 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3">
              <Search size={15} className="shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setScreenerPage(0);
                }}
                placeholder="Search ticker, company, sector..."
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
                aria-label="Search ticker..."
              />
            </div>
            <select
              value={universe}
              onChange={(event) => {
                const nextUniverse = event.target.value as UniverseMode;
                setUniverse(nextUniverse);
                setScreenerPage(0);
                if (nextUniverse === "watchlist") {
                  setQuery("");
                }
              }}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
              aria-label="Universe"
            >
              <option value="all">All IDX</option>
              <option value="watchlist">Watchlist</option>
            </select>
            <div className="flex h-9 rounded-md border border-slate-200 bg-slate-50 p-1">
              {(["1d", "1w"] as Timeframe[]).map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    setTimeframe(item);
                    setRange(resolveRangeForTimeframe(item, range));
                  }}
                  className={`rounded px-2.5 text-xs font-semibold ${timeframe === item ? "bg-teal-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {item === "1d" ? "Daily" : "Weekly"}
                </button>
              ))}
            </div>
            <div className="flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-1">
              {rangeOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setRange(option.label)}
                  className={`h-7 min-w-8 rounded px-1.5 text-xs font-semibold ${effectiveRange === option.label ? "bg-teal-50 text-teal-700 ring-1 ring-teal-200" : "text-slate-500 hover:bg-slate-50"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div
              role="radiogroup"
              aria-label="Annotation mode"
              className="flex h-9 shrink-0 items-center rounded-md border border-slate-200 bg-slate-50 p-1"
            >
              {(["strict", "loose"] as AnalysisMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={analysisMode === mode}
                  onClick={() => changeAnalysisMode(mode)}
                  className={`h-7 rounded px-2 text-xs font-semibold ${analysisMode === mode ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-slate-800"}`}
                >
                  {mode === "strict" ? "Strict" : "Loose"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-start gap-2 text-xs text-slate-500 md:col-span-2 md:justify-end lg:col-span-1">
            <Link
              href={tickerNewsHref}
              className={`flex h-9 items-center gap-2 rounded-md border px-3 font-semibold ${newsTone.className}`}
              aria-label={`Open ${newsTicker} news evidence`}
            >
              <Newspaper size={14} />
              <span className="hidden sm:inline">News</span>
              <span>{newsSummary?.totalArticles ?? 0}</span>
              <span className="hidden text-[10px] uppercase md:inline">{newsTone.label}</span>
            </Link>
            <span className="hidden items-center gap-1 font-semibold text-slate-600 md:flex">
              <span className={`h-2 w-2 rounded-full ${sync?.active ? "bg-amber-500" : "bg-teal-600"}`} />
              {sync?.active ? "Sync running" : "Synced"}
            </span>
            <button
              onClick={toggleWatchlist}
              disabled={watchlistBusy.has(selectedSymbol)}
              className={`flex h-9 items-center gap-2 rounded-md border px-3 font-semibold ${isSelectedTracked ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              aria-label={`${isSelectedTracked ? "Tracked structure" : "Track structure"} Watchlist`}
            >
              <Star size={14} fill={isSelectedTracked ? "currentColor" : "none"} />
              Watchlist
            </button>
            <button
              onClick={recalculateCached}
              className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50"
              aria-label="Recalculate all cached annotations"
            >
              {recalculating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Recalculate
            </button>
          </div>
        </header>

        <div className={workspaceGridClass}>
          <aside className="hidden min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm [contain:layout_paint] md:flex" aria-label="Market scanner">
            <DashboardSidebar
              collapsed={sidebarCollapsed}
              newsHref={newsHref}
              onToggle={() => setSidebarCollapsed((current) => !current)}
            />

            {sidebarCollapsed ? null : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                  <WatchlistSection
                    rows={watchlistRows}
                    selectedSymbol={selectedSymbol}
                    busySymbols={watchlistBusy}
                    onSelect={selectSymbol}
                    onRemove={removeWatchlistSymbol}
                  />
                  <BestExamplesSection
                    examples={bestExamples}
                    selectedSymbol={selectedSymbol}
                    onSelect={selectBestExample}
                  />
                  <section className="flex min-h-[260px] flex-col px-3 py-3">
                    <div className="sticky top-0 z-10 mb-3 grid grid-cols-4 gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-sm" aria-label="Scanner tabs">
                      {(Object.entries(scannerGroups) as Array<[ScannerTab, typeof activeScannerGroup]>).map(([key, group]) => (
                        <button
                          key={key}
                          type="button"
                          aria-label={group.label}
                          onPointerDown={() => setScannerTab(key)}
                          onClick={() => setScannerTab(key)}
                          className={`h-10 rounded px-1 text-[12px] font-bold transition-colors ${scannerTab === key ? "bg-teal-700 text-white shadow-sm" : "bg-slate-50 text-slate-600 hover:bg-white hover:text-slate-900"}`}
                        >
                          {key === "accumulation" ? "Accum" : key === "distribution" ? "Distrib" : key === "pva" ? "PVA" : "Struct"}
                        </button>
                      ))}
                    </div>
                    <ScannerGroup
                      title={activeScannerGroup.label}
                      tone={activeScannerGroup.tone}
                      rows={activeScannerRows}
                      selectedSymbol={selectedSymbol}
                      onSelect={selectSymbol}
                      trackedSymbols={trackedSymbols}
                      busySymbols={watchlistBusy}
                      onToggleWatchlist={toggleScannerWatchlist}
                    />
                  </section>
                </div>
                <div className="shrink-0 border-t border-slate-200 bg-white p-3 text-[11px] text-slate-500 shadow-[0_-8px_16px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-700">{sync?.active ? "Sync running" : "Local data ready"}</span>
                    <button
                      onClick={startSync}
                      className="grid h-7 w-7 place-items-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      aria-label="Sync data"
                    >
                      {sync?.active ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    </button>
                  </div>
                  <select
                    value={syncMode}
                    onChange={(event) => setSyncMode(event.target.value as SyncMode)}
                    className="mt-2 h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none"
                    aria-label="Sync mode"
                  >
                    <option value="all">Sync all</option>
                    <option value="watchlist">Sync watchlist</option>
                    <option value="failed">Retry failed</option>
                  </select>
                  {sync?.run ? (
                    <p className="mt-1">
                      {sync.run.successCount}/{sync.run.totalSymbols} cached, {sync.run.failedCount} failed
                    </p>
                  ) : null}
                </div>
              </>
            )}
            {sidebarCollapsed ? (
              <div className="mt-auto border-t border-slate-200 p-2">
                <button
                  onClick={startSync}
                  className="grid h-9 w-full place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  aria-label="Sync data"
                >
                  {sync?.active ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
              </div>
            ) : null}
          </aside>

          <section aria-label="Chart workspace" className="flex min-w-0 flex-col gap-3 overflow-y-auto overflow-x-hidden [contain:layout_paint]">
            <EvidenceSummaryBand
              bundle={researchBundle}
              quality={chart?.dataQuality}
              newsSummary={newsSummary}
              newsTone={newsTone}
              activeAnnotationsCount={activeAnnotationsCount}
            />

            <TickerNewsEvidencePanel
              events={newsEvents}
              markerVisible={markerVisibility.news}
              newsHref={tickerNewsHref}
              summary={newsSummary}
              ticker={newsTicker}
              tone={newsTone}
              onToggleMarkers={() => toggleMarkerLayer("news")}
            />

            <div className="flex min-h-[460px] shrink-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm [contain:layout_paint] md:min-h-[560px]">
            <div className="flex shrink-0 flex-col gap-2 overflow-hidden border-b border-slate-200 px-4 py-2 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden">
                <Metric label="Close" value={latestBar ? latestBar.close.toLocaleString("id-ID") : "-"} />
                <Metric label="Change" value={`${change >= 0 ? "+" : ""}${change.toLocaleString("id-ID")} (${changePct.toFixed(2)}%)`} tone={change >= 0 ? "green" : "red"} />
                <Metric label="Volume" value={latestBar ? compact(latestBar.volume) : "-"} />
                <input
                  value={watchlistNote}
                  onChange={(event) => setWatchlistNote(event.target.value)}
                  placeholder="Watchlist note"
                  className="hidden h-8 w-36 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none placeholder:text-slate-400 focus:border-teal-300 lg:block"
                  aria-label="Watchlist note"
                />
              </div>
              <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden">
                <MarkerToggle
                  label="Wyckoff"
                  active={markerVisibility.wyckoff}
                  onClick={() => toggleMarkerLayer("wyckoff")}
                />
                <MarkerToggle
                  label="Elliott"
                  active={markerVisibility.elliott}
                  onClick={() => toggleMarkerLayer("elliott")}
                />
                <MarkerToggle
                  label="PVA"
                  active={markerVisibility.pva}
                  onClick={() => toggleMarkerLayer("pva")}
                />
                <IndicatorToggle
                  label="MA5"
                  active={indicatorVisibility.ma5}
                  onClick={() => toggleIndicatorLayer("ma5")}
                />
                <IndicatorToggle
                  label="MA10"
                  active={indicatorVisibility.ma10}
                  onClick={() => toggleIndicatorLayer("ma10")}
                />
                <IndicatorToggle
                  label="RSI"
                  active={indicatorVisibility.rsi}
                  onClick={() => toggleIndicatorLayer("rsi")}
                />
                <IndicatorToggle
                  label="AO"
                  active={indicatorVisibility.ao}
                  onClick={() => toggleIndicatorLayer("ao")}
                />
                <MarkerToggle
                  label="Projection"
                  active={markerVisibility.projection}
                  onClick={() => toggleMarkerLayer("projection")}
                />
                <MarkerToggle
                  label="News"
                  active={markerVisibility.news}
                  onClick={() => toggleMarkerLayer("news")}
                />
                <MarkerToggle
                  label="Anomaly"
                  active={markerVisibility.anomaly}
                  onClick={() => toggleMarkerLayer("anomaly")}
                />
                <button
                  type="button"
                  onClick={() => setShowChartGuides((current) => !current)}
                  aria-pressed={showChartGuides}
                  aria-label={showChartGuides ? "Hide chart guides" : "Show chart guides"}
                  className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold ${showChartGuides ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                >
                  {showChartGuides ? <EyeOff size={13} /> : <Eye size={13} />}
                  Guides
                </button>
                <button
                  type="button"
                  onClick={() => setShowVolumeProfile((current) => !current)}
                  aria-pressed={showVolumeProfile}
                  aria-label={showVolumeProfile ? "Hide volume profile" : "Show volume profile"}
                  className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold ${showVolumeProfile ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                >
                  <LineChart size={13} />
                  Profile
                </button>
                <button
                  type="button"
                  onClick={() => setShowAnalogGhost((current) => !current)}
                  aria-pressed={showAnalogGhost}
                  aria-label={showAnalogGhost ? "Hide analog ghost" : "Show analog ghost"}
                  className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold ${showAnalogGhost ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                >
                  <LineChart size={13} />
                  Ghost
                </button>
                <button
                  type="button"
                  onClick={() => setFitProjection((current) => !current)}
                  aria-pressed={fitProjection}
                  aria-label={fitProjection ? "Use compact projection range" : "Fit projection range"}
                  className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold ${fitProjection ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                >
                  <LineChart size={13} />
                  Fit
                </button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1">
              {loadingChart ? (
                <div className="absolute inset-0 z-20 grid place-items-center bg-white/70 text-sm text-slate-500">
                  <Loader2 className="mb-2 animate-spin" />
                  Loading structure data
                </div>
              ) : null}
              <StructureChart
                bars={researchBars}
                annotations={researchAnnotations}
                newsEvents={newsEvents}
                anomalies={anomalies}
                markerVisibility={markerVisibility}
                indicatorVisibility={indicatorVisibility}
                fitProjection={fitProjection}
                guidesVisible={showChartGuides}
                volumeProfileVisible={showVolumeProfile}
                analogGhostVisible={showAnalogGhost}
                analogs={researchBundle.analogs}
                selectedProjectionId={effectiveSelectedProjectionId}
                onMarkerSelect={handleChartMarkerSelect}
              />
              <PredictionLineSelector
                projections={projectionScenarios}
                selectedProjectionId={effectiveSelectedProjectionId}
                visible={markerVisibility.projection}
                onSelect={setSelectedProjectionId}
              />
              {error ? (
                <div className="absolute left-5 top-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {error}
                </div>
              ) : null}
            </div>

            <ResearchMetricsRibbon
              snapshot={timeMachineSnapshot}
              enabled={timeMachineEnabled}
              cursor={effectiveTimeMachineCursor}
              maxCursor={maxTimeMachineCursor}
              cacheSize={researchCacheSize}
              bundle={researchBundle}
              onToggle={() => setTimeMachineEnabled((current) => !current)}
              onCursorChange={(value) => setTimeMachineCursor(value)}
            />
            <ConfluenceHeatmapStrip
              rows={confluenceHeatmap}
              selectedDate={selectedConfluenceRow?.date ?? null}
              onSelect={setSelectedConfluenceDate}
            />
            </div>
            <StructureEventTimeline
              annotations={researchAnnotations}
              explanations={researchBundle.explanations}
              newsEvents={markerVisibility.news ? newsEvents : []}
              selectedNewsEventId={selectedNewsEvent?.id ?? null}
              onNewsEventSelect={setSelectedNewsEventId}
              selectedProjectionId={effectiveSelectedProjectionId}
            />
            <ScreenerGrid
              symbols={filteredSymbols}
              total={displayTotal}
              page={screenerPage}
              pageSize={SCREENER_PAGE_SIZE}
              selectedSymbol={selectedSymbol}
              onPageChange={setScreenerPage}
              onSelect={selectSymbol}
            />
          </section>

          <Inspector
            wyckoff={wyckoff}
            elliott={elliott}
            pva={pva}
            quality={chart?.dataQuality}
            backtest={backtest}
            projections={projectionScenarios}
            explanations={researchBundle.explanations}
            bundle={researchBundle}
            newsSummary={newsSummary}
            newsEvents={newsEvents}
            newsTicker={newsTicker}
            timeframe={timeframe}
            selectedNewsEvent={selectedNewsEvent}
            anomalies={anomalies}
            selectedAnomaly={selectedAnomaly}
            selectedConfluenceRow={selectedConfluenceRow}
            topicImpact={topicImpact}
            selectedProjectionId={effectiveSelectedProjectionId}
            onProjectionSelect={setSelectedProjectionId}
            onAnomalySelect={setSelectedAnomalyId}
          />
        </div>
      </main>
    </div>
  );
}

function EvidenceSummaryBand({
  bundle,
  quality,
  newsSummary,
  newsTone,
  activeAnnotationsCount,
}: {
  bundle: ResearchBundle;
  quality: ChartPayload["dataQuality"] | undefined;
  newsSummary: NewsTickerSummary | null;
  newsTone: { label: string; className: string };
  activeAnnotationsCount: number;
}) {
  const conflictLabel = bundle.conflict.status === "conflicted"
    ? "Needs Review"
    : bundle.conflict.status === "aligned"
      ? "Aligned"
      : "Limited";
  const qualityStatus = quality?.status ?? bundle.guard.status;
  const activeProjectionCount = bundle.projections.filter((projection) => projection.status === "active").length;

  return (
    <section
      aria-label="Evidence summary"
      className="grid shrink-0 grid-cols-2 gap-2 rounded-md border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-5"
    >
      <EvidenceSummaryMetric
        label="Structure Confidence"
        value={`${Math.round(bundle.confidence.overall * 100)}%`}
        detail={`${activeProjectionCount}/${bundle.projections.length || 0} active paths`}
        tone={bundle.confidence.overall >= 0.7 ? "green" : bundle.confidence.overall >= 0.45 ? "amber" : "red"}
      />
      <EvidenceSummaryMetric
        label="Conflict"
        value={conflictLabel}
        detail={`${bundle.conflict.primaryBias} / ${bundle.conflict.companionBias}`}
        tone={bundle.conflict.status === "aligned" ? "green" : bundle.conflict.status === "conflicted" ? "amber" : "slate"}
      />
      <EvidenceSummaryMetric
        label="Data Quality"
        value={formatQualityStatus(qualityStatus)}
        detail={`${quality?.barCount ?? 0} bars`}
        tone={qualityStatus === "ok" ? "green" : qualityStatus === "missing_volume" || qualityStatus === "caution" ? "amber" : "red"}
      />
      <EvidenceSummaryMetric
        label="News Tone"
        value={newsTone.label}
        detail={`${newsSummary?.totalArticles ?? 0} articles`}
        tone={newsTone.label === "positive" ? "green" : newsTone.label === "negative" ? "red" : newsTone.label === "mixed" ? "amber" : "slate"}
      />
      <EvidenceSummaryMetric
        label="Active Annotations"
        value={activeAnnotationsCount.toString()}
        detail={`${bundle.guard.status} guard`}
        tone={activeAnnotationsCount > 4 ? "green" : activeAnnotationsCount > 0 ? "amber" : "slate"}
      />
    </section>
  );
}

function EvidenceSummaryMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "green" | "amber" | "red" | "slate";
}) {
  const toneClass = tone === "green"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "red"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className="min-w-0 rounded border border-slate-200 bg-slate-50/60 px-3 py-2">
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex min-w-0 items-baseline justify-between gap-2">
        <p className="truncate text-sm font-bold text-slate-900">{value}</p>
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${toneClass}`}>
          {tone}
        </span>
      </div>
      <p className="mt-1 truncate text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

export function TickerNewsEvidencePanel({
  ticker,
  summary,
  events,
  tone,
  markerVisible,
  newsHref,
  onToggleMarkers,
}: {
  ticker: string;
  summary: NewsTickerSummary | null;
  events: NewsChartEvent[];
  tone: { label: string; className: string };
  markerVisible: boolean | undefined;
  newsHref: string;
  onToggleMarkers(): void;
}) {
  const topEvent = events
    .slice()
    .sort((left, right) => scoreNewsEventPriority(right) - scoreNewsEventPriority(left))[0] ?? null;
  const classified = summary?.classifiedArticles ?? 0;
  const total = summary?.totalArticles ?? 0;
  const unclassified = summary?.unclassifiedArticles ?? 0;
  const coveragePct = total > 0 ? Math.round((classified / total) * 100) : 0;
  const toneDetail = summary?.weightedSentimentScore === null || summary?.weightedSentimentScore === undefined
    ? "tone belum tersedia"
    : `weighted ${formatSignedDecimal(summary.weightedSentimentScore)}`;

  return (
    <section
      aria-label={`${ticker} news evidence`}
      className="grid shrink-0 gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm lg:grid-cols-[1.1fr_1fr_auto]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-bold ${tone.className}`}>
            <Newspaper size={13} />
            {ticker} news evidence
          </span>
          <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold uppercase text-slate-500">
            evidence only
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-700">
          {total > 0
            ? `${total} artikel, ${classified} classified, ${unclassified} belum classified. ${toneDetail}; avg relevance ${formatScore(summary?.averageRelevanceScore)}.`
            : "Belum ada berita ticker yang cukup relevan di cache lokal."}
        </p>
      </div>

      <div className="grid min-w-0 grid-cols-3 gap-2 text-xs">
        <TickerNewsMetric label="Tone" value={tone.label} />
        <TickerNewsMetric label="Coverage" value={`${coveragePct}%`} />
        <TickerNewsMetric label="Markers" value={`${events.length}`} />
      </div>

      <div className="flex min-w-0 flex-col gap-2 lg:w-[280px]">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-bold text-slate-800">
              {topEvent ? topEvent.eventLabel : "No material event"}
            </span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${topEvent ? newsSentimentClass(topEvent.sentimentLabel) : "bg-slate-100 text-slate-500"}`}>
              {topEvent?.sentimentLabel ?? "pending"}
            </span>
          </div>
          <p className="mt-1 line-clamp-1 font-semibold text-slate-500">
            {topEvent ? `${topEvent.sourceName}; 3D ${formatSignedPercent(topEvent.return3dPct)}` : "Sync/classify berita untuk membuat marker news."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={Boolean(markerVisible)}
            onClick={onToggleMarkers}
            className={`inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs font-bold ${markerVisible ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {markerVisible ? "Hide markers" : "Show markers"}
          </button>
          <Link
            href={newsHref}
            className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Open evidence
          </Link>
        </div>
      </div>
    </section>
  );
}

function TickerNewsMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-slate-200 bg-slate-50 px-2 py-2">
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function StructureEventTimeline({
  annotations,
  explanations,
  newsEvents,
  selectedNewsEventId,
  onNewsEventSelect,
  selectedProjectionId,
}: {
  annotations: ChartPayload["annotations"];
  explanations: ProjectionExplanation[];
  newsEvents: NewsChartEvent[];
  selectedNewsEventId: string | null;
  onNewsEventSelect(id: string): void;
  selectedProjectionId: string | null;
}) {
  const selectedExplanation = explanations.find((explanation) => explanation.projectionId === selectedProjectionId)
    ?? explanations[0]
    ?? null;
  const sourceEvents = selectedExplanation?.sourceEvents ?? [];
  const fallbackEvents = annotations
    .slice()
    .sort((left, right) => left.endDate.localeCompare(right.endDate))
    .slice(-5)
    .map((annotation) => ({
      id: annotation.id,
      type: annotation.type,
      label: annotation.label,
      status: annotation.status,
      date: annotation.endDate,
      evidence: annotation.evidence.slice(0, 2),
    }));
  const events = sourceEvents.length > 0 ? sourceEvents : fallbackEvents;
  const newsTimeline = newsEvents
    .slice()
    .sort((left, right) => left.chartDate.localeCompare(right.chartDate))
    .slice(-6);

  return (
    <section
      aria-label="Key structure events"
      className="shrink-0 rounded-md border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex h-8 items-center justify-between border-b border-slate-200 px-4">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Key Structure Events</h3>
        <span className="text-[11px] font-semibold text-slate-400">Source timeline</span>
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 py-2">
        {events.length === 0 && newsTimeline.length === 0 ? (
          <p className="text-xs text-slate-500">No visible source event in this chart window.</p>
        ) : events.map((event) => (
          <div key={event.id} className="min-w-[190px] rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-bold text-slate-900">{event.type}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${annotationStatusClass(event.status)}`}>
                {event.status}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">{event.date} - {event.label}</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{event.evidence[0] ?? "Evidence cached from structure engine."}</p>
          </div>
        ))}
        {newsTimeline.map((event, index) => (
          <button
            key={`${event.id}-${event.chartDate}-${index}`}
            type="button"
            onClick={() => onNewsEventSelect(event.id)}
            aria-pressed={selectedNewsEventId === event.id}
            aria-label={`Inspect news event ${event.title}`}
            className={`min-w-[230px] rounded border px-3 py-2 text-left text-xs text-slate-700 hover:border-emerald-300 hover:bg-emerald-100 ${selectedNewsEventId === event.id ? "border-emerald-400 bg-emerald-100 ring-1 ring-emerald-300" : "border-emerald-200 bg-emerald-50"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-bold text-slate-900">{event.eventLabel}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${newsSentimentClass(event.sentimentLabel)}`}>
                {event.sentimentLabel}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] font-semibold text-slate-700">{event.chartDate} - {event.title}</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-600">
              {event.sourceName}; 3D {formatSignedPercent(event.return3dPct)}; volume {event.volumeRatio ?? "n/a"}x
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

function ConfluenceHeatmapStrip({
  rows,
  selectedDate,
  onSelect,
}: {
  rows: ConfluenceHeatmapRow[];
  selectedDate: string | null;
  onSelect(date: string): void;
}) {
  const visibleRows = rows.slice(-14);

  return (
    <section
      aria-label="Confluence heatmap"
      className="border-t border-slate-200 bg-white px-4 py-2"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Confluence Heatmap</h3>
        <span className="text-[11px] font-semibold text-slate-400">Evidence density</span>
      </div>
      {visibleRows.length === 0 ? (
        <p className="text-xs text-slate-500">No evidence overlap in this chart window.</p>
      ) : (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {visibleRows.map((row) => {
            const selected = row.date === selectedDate;

            return (
            <button
              key={row.date}
              type="button"
              aria-pressed={selected}
              aria-label={`Inspect confluence ${row.date} ${row.factors.map((factor) => factor.label).join(" ")}`}
              onClick={() => onSelect(row.date)}
              className={`min-w-[92px] rounded border px-2 py-1.5 text-left text-[11px] ${confluenceToneClass(row.tone)} ${selected ? "ring-2 ring-teal-400 ring-offset-1" : "hover:border-teal-300"}`}
              title={row.factors.map((factor) => `${factor.label}: ${factor.detail}`).join(" | ")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{row.date.slice(5)}</span>
                <span>{Math.round(row.score * 100)}%</span>
              </div>
              <p className="mt-1 truncate font-semibold">
                {row.factors.slice(0, 2).map((factor) => factor.label).join(" + ")}
              </p>
            </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DashboardSidebar({
  collapsed,
  newsHref,
  onToggle,
}: {
  collapsed: boolean;
  newsHref: string;
  onToggle(): void;
}) {
  const linkBase = collapsed
    ? "flex h-10 w-full items-center justify-center rounded-md border text-sm font-semibold"
    : "flex h-10 w-full items-center gap-2 rounded-md border px-3 text-sm font-semibold";

  return (
    <section className="shrink-0 border-b border-slate-200 p-2" aria-label="Navigation sidebar">
      <div className={`flex ${collapsed ? "flex-col items-center gap-2" : "items-center justify-between gap-2 px-1"}`}>
        {collapsed ? (
          <Image
            src={BRAND_ICON_SRC}
            alt="Nexa Quant"
            width={34}
            height={34}
            className="h-[34px] w-[34px] rounded-lg object-cover shadow-sm ring-1 ring-slate-900/10"
          />
        ) : (
          <div className="min-w-0">
            <Image
              src={BRAND_LOGO_SRC}
              alt="Nexa Quant"
              width={150}
              height={36}
              className="h-auto w-[150px] object-contain object-left"
            />
            <div className="truncate text-[11px] font-medium text-slate-500">Research console</div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      <nav aria-label="Primary navigation" className="mt-3 space-y-1">
        <Link
          href="/"
          aria-current="page"
          aria-label="Open structure screener"
          title="Structure Screener"
          className={`${linkBase} border-teal-200 bg-teal-50 text-teal-800`}
        >
          <LineChart size={16} />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 truncate">Structure Screener</span>
              <span className="rounded bg-white px-1.5 py-0.5 text-[10px] uppercase text-teal-700">Live</span>
            </>
          )}
        </Link>
        <Link
          href={newsHref}
          aria-label="Open news sentiment"
          title="News Sentiment"
          className={`${linkBase} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
        >
          <Newspaper size={16} />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 truncate">News Sentiment</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">All</span>
            </>
          )}
        </Link>
      </nav>
    </section>
  );
}

type ScannerGroupProps = {
  title: string;
  tone: "green" | "red" | "blue" | "amber";
  rows: SymbolSummary[];
  selectedSymbol: string;
  onSelect(symbol: string): void;
  trackedSymbols: Set<string>;
  busySymbols: Set<string>;
  onToggleWatchlist(symbol: SymbolSummary): void;
};

type WatchlistRow = {
  item: WatchlistItem;
  symbol: SymbolSummary | null;
};

function WatchlistSection({
  rows,
  selectedSymbol,
  busySymbols,
  onSelect,
  onRemove,
}: {
  rows: WatchlistRow[];
  selectedSymbol: string;
  busySymbols: Set<string>;
  onSelect(symbol: string): void;
  onRemove(symbol: string): void;
}) {
  return (
    <section className="border-b border-slate-200 px-3 py-2" aria-label="Watchlist">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Watchlist</h3>
        <span className="text-[11px] text-slate-400">{rows.length}</span>
      </div>
      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <p className="rounded-md bg-slate-50 px-2 py-2 text-xs text-slate-400">Add tickers from scanner rows.</p>
        ) : rows.map(({ item, symbol }) => (
          <div
            key={item.symbol}
            className={`grid grid-cols-[minmax(0,1fr)_24px] items-center gap-1 rounded-md text-xs ${selectedSymbol === item.symbol ? "bg-amber-50 ring-1 ring-amber-200" : "hover:bg-slate-50"}`}
          >
            <button
              type="button"
              onClick={() => onSelect(item.symbol)}
              className="min-w-0 px-2 py-1.5 text-left"
            >
              <span className="block font-semibold text-slate-800">{item.symbol.replace(".JK", "")}</span>
              <span className="block truncate text-[11px] text-slate-500">{symbol?.name ?? (item.note || "Tracked ticker")}</span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(item.symbol)}
              disabled={busySymbols.has(item.symbol)}
              className="grid h-6 w-6 place-items-center rounded text-slate-400 hover:bg-white hover:text-rose-600"
              aria-label={`Remove ${item.symbol} from watchlist`}
              title={`Remove ${item.symbol} from watchlist`}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function BestExamplesSection({
  examples,
  selectedSymbol,
  onSelect,
}: {
  examples: BestExample[];
  selectedSymbol: string;
  onSelect(example: BestExample): void;
}) {
  return (
    <section className="border-b border-slate-200 px-3 py-2" aria-label="Best Examples">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Best Examples</h3>
        <span className="text-[11px] text-slate-400">{examples.length}</span>
      </div>
      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {examples.length === 0 ? (
          <p className="rounded-md bg-slate-50 px-2 py-2 text-xs text-slate-400">Recalculate cache to surface strong structures.</p>
        ) : examples.map((example) => (
          <button
            key={`${example.symbol}-${example.timeframe}`}
            type="button"
            onClick={() => onSelect(example)}
            className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${selectedSymbol === example.symbol ? "bg-teal-50 ring-1 ring-teal-200" : "hover:bg-slate-50"}`}
            aria-label={`Select best example ${example.symbol}`}
          >
            <span className="min-w-0">
              <span className="block font-semibold text-slate-800">{example.symbol.replace(".JK", "")}</span>
              <span className="block truncate text-[11px] text-slate-500">
                {example.annotationTypes.slice(0, 3).join(" / ") || example.sector}
              </span>
            </span>
            <span className="text-right">
              <span className={`block rounded px-1.5 py-0.5 text-[10px] font-bold ${example.quality === "strong" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                {Math.round(example.score * 100)}%
              </span>
              <span className="mt-1 block text-[10px] font-semibold uppercase text-slate-400">{example.timeframe}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ScannerGroup({
  title,
  tone,
  rows,
  selectedSymbol,
  onSelect,
  trackedSymbols,
  busySymbols,
  onToggleWatchlist,
}: ScannerGroupProps) {
  const [showAll, setShowAll] = useState(false);
  const dot = tone === "green"
    ? "bg-emerald-500"
    : tone === "red"
      ? "bg-rose-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-blue-500";
  const visibleRows = showAll ? rows : rows.slice(0, SCANNER_GROUP_COMPACT_LIMIT);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</h3>
        <span className="text-[11px] text-slate-400">{rows.length}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <p className="rounded-md bg-slate-50 px-2 py-2 text-xs text-slate-400">No matching annotations.</p>
        ) : visibleRows.map((symbol) => (
          <div
            key={`${title}-${symbol.symbol}`}
            className={`grid grid-cols-[minmax(0,1fr)_24px] items-center gap-1 rounded-md text-xs ${selectedSymbol === symbol.symbol ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"}`}
          >
            <button
              type="button"
              onClick={() => onSelect(symbol.symbol)}
              className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-left"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
              <span className="w-14 shrink-0 font-semibold text-slate-800">{symbol.symbol.replace(".JK", "")}</span>
              <span className="truncate text-slate-500">{symbol.name}</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleWatchlist(symbol)}
              disabled={busySymbols.has(symbol.symbol)}
              className={`grid h-6 w-6 place-items-center rounded ${trackedSymbols.has(symbol.symbol) ? "text-amber-600 hover:bg-amber-50" : "text-slate-400 hover:bg-white hover:text-blue-600"}`}
              aria-label={trackedSymbols.has(symbol.symbol) ? `Remove ${symbol.symbol} from watchlist` : `Add ${symbol.symbol} to watchlist`}
              title={trackedSymbols.has(symbol.symbol) ? `Remove ${symbol.symbol} from watchlist` : `Add ${symbol.symbol} to watchlist`}
            >
              {trackedSymbols.has(symbol.symbol) ? <Star size={13} fill="currentColor" /> : <Plus size={13} />}
            </button>
          </div>
        ))}
      </div>
      {rows.length > SCANNER_GROUP_COMPACT_LIMIT ? (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="mt-2 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          {showAll ? "Show compact list" : `Show all ${rows.length} annotations`}
        </button>
      ) : null}
    </section>
  );
}

function MarkerToggle({
  label,
  active,
  onClick,
}: {
  label: "Wyckoff" | "Elliott" | "PVA" | "Projection" | "News" | "Anomaly";
  active: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${active ? "Hide" : "Show"} ${label} markers`}
      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold ${active ? "border-slate-300 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
    >
      {active ? <Eye size={13} /> : <EyeOff size={13} />}
      {label}
    </button>
  );
}

function IndicatorToggle({
  label,
  active,
  onClick,
}: {
  label: "MA5" | "MA10" | "RSI" | "AO";
  active: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${active ? "Hide" : "Show"} ${label} indicator`}
      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold ${active ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
    >
      <LineChart size={13} />
      {label}
    </button>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm font-bold ${tone === "green" ? "text-emerald-600" : tone === "red" ? "text-rose-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function PredictionLineSelector({
  projections,
  selectedProjectionId,
  visible,
  onSelect,
}: {
  projections: ProjectionScenario[];
  selectedProjectionId: string | null;
  visible: boolean | undefined;
  onSelect(id: string): void;
}) {
  const drawable = projections
    .filter((projection) => projection.status === "active" && projection.points.length >= 2)
    .slice(0, 3);

  if (!visible || drawable.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Prediction line selector"
      className="absolute right-3 top-3 z-10 flex max-w-[260px] flex-col gap-1 rounded-md border border-slate-200 bg-white/95 p-2 text-[11px] shadow-sm"
    >
      {drawable.map((projection) => {
        const selected = projection.id === selectedProjectionId;
        return (
          <button
            key={projection.id}
            type="button"
            onClick={() => onSelect(projection.id)}
            aria-pressed={selected}
            aria-label={`Explain ${projection.title}`}
            className={`grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1 text-left ${selected ? "bg-amber-50 text-amber-800" : "text-slate-600 hover:bg-slate-50"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-amber-500" : projection.family === "elliott" ? "bg-indigo-500" : "bg-emerald-500"}`} />
            <span className="truncate font-semibold">{projection.title}</span>
            <span className="text-slate-400">{projection.family}</span>
          </button>
        );
      })}
    </div>
  );
}

function ResearchMetricsRibbon({
  snapshot,
  enabled,
  cursor,
  maxCursor,
  cacheSize,
  bundle,
  onToggle,
  onCursorChange,
}: {
  snapshot: TimeMachineSnapshot;
  enabled: boolean;
  cursor: number;
  maxCursor: number;
  cacheSize: number;
  bundle: ResearchBundle;
  onToggle(): void;
  onCursorChange(value: number): void;
}) {
  const primaryAnalog = bundle.analogs[0];
  const narrative = buildTimeMachineNarrative(snapshot);

  return (
    <section
      aria-label="Research metrics ribbon"
      className="grid min-h-12 shrink-0 grid-cols-2 border-t border-slate-200 bg-white text-xs md:grid-cols-5"
    >
      <RibbonMetric title="Time Machine">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={enabled}
            aria-label={enabled ? "Disable time machine" : "Enable time machine"}
            className={`h-7 shrink-0 rounded-md border px-2 text-[11px] font-bold ${enabled ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {enabled ? "Live" : "Off"}
          </button>
          <span aria-label="Time machine as of" className="truncate font-semibold text-slate-700">
            {snapshot.asOfDate ?? "-"}
          </span>
        </div>
        <input
          aria-label="Time machine scrubber"
          type="range"
          min={0}
          max={maxCursor}
          value={Math.min(cursor, maxCursor)}
          onChange={(event) => onCursorChange(Number(event.target.value))}
          className="mt-1 w-full"
        />
        <p aria-label="Time machine calculation mode" className="sr-only">
          {snapshot.calculationMode}
        </p>
        <p aria-label="Time machine narrative" className="mt-1 line-clamp-2 text-[11px] text-slate-500">
          {narrative[0]}
        </p>
      </RibbonMetric>

      <RibbonMetric title="Conflict">
        <p className={`font-bold ${bundle.conflict.status === "conflicted" ? "text-amber-700" : bundle.conflict.status === "aligned" ? "text-emerald-700" : "text-slate-700"}`}>
          {bundle.conflict.status}
        </p>
        <p className="truncate text-slate-500">
          {bundle.conflict.primaryBias} / {bundle.conflict.companionBias}
        </p>
      </RibbonMetric>

      <RibbonMetric title="Trust">
        <p aria-label="Data guard status" className={`font-bold ${bundle.guard.status === "blocked" ? "text-rose-700" : bundle.guard.status === "caution" ? "text-amber-700" : "text-emerald-700"}`}>
          {bundle.guard.status} / {(bundle.guard.score * 100).toFixed(0)}%
        </p>
        <p aria-label="Confidence breakdown" className="truncate text-slate-500">
          confidence {(bundle.confidence.overall * 100).toFixed(0)}%
        </p>
      </RibbonMetric>

      <RibbonMetric title="Cache">
        <p aria-label="Research cache state" className="font-bold text-slate-800">
          cached {cacheSize}
        </p>
        <p className="truncate text-emerald-700">fresh</p>
      </RibbonMetric>

      <RibbonMetric title="Analog">
        {primaryAnalog ? (
          <>
            <p className="font-bold text-slate-800">
              {primaryAnalog.startDate.slice(5)} - {primaryAnalog.endDate.slice(5)}
            </p>
            <p className="truncate text-slate-500">
              {(primaryAnalog.similarity * 100).toFixed(1)}% similar
            </p>
          </>
        ) : (
          <p className="text-slate-500">pending</p>
        )}
      </RibbonMetric>
    </section>
  );
}

function RibbonMetric({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-slate-100 px-4 py-2 md:border-b-0 md:border-r">
      <h3 className="mb-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="min-w-0 text-slate-600">{children}</div>
    </div>
  );
}

function ScreenerGrid({
  symbols,
  total,
  page,
  pageSize,
  selectedSymbol,
  onPageChange,
  onSelect,
}: {
  symbols: SymbolSummary[];
  total: number;
  page: number;
  pageSize: number;
  selectedSymbol: string;
  onPageChange(page: number): void;
  onSelect(symbol: string): void;
}) {
  const pageCount = Math.max(1, Math.ceil(symbols.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = symbols.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  return (
    <div aria-label="Screener strip" className="h-[140px] shrink-0 border-t border-slate-200 bg-white">
      <div className="flex h-8 items-center justify-between border-b border-slate-200 px-4">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Symbol Queue</h3>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{symbols.length} shown / {total} symbols</span>
          <button
            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="grid h-7 w-7 place-items-center rounded border border-slate-200 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <span>Page {currentPage + 1} of {pageCount}</span>
          <button
            onClick={() => onPageChange(Math.min(pageCount - 1, currentPage + 1))}
            disabled={currentPage >= pageCount - 1}
            className="grid h-7 w-7 place-items-center rounded border border-slate-200 disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div className="h-[calc(100%-32px)] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-3 py-1.5"></th>
              <th className="px-3 py-1.5">Ticker</th>
              <th className="px-3 py-1.5">Sector</th>
              <th className="px-3 py-1.5">Close</th>
              <th className="px-3 py-1.5">Wyckoff</th>
              <th className="px-3 py-1.5">Elliott</th>
              <th className="px-3 py-1.5">PVA</th>
              <th className="px-3 py-1.5">Quality</th>
              <th className="px-3 py-1.5">Last Update</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((symbol) => (
              <tr
                key={symbol.symbol}
                onClick={() => onSelect(symbol.symbol)}
                className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${symbol.symbol === selectedSymbol ? "bg-blue-50/70" : ""}`}
              >
                <td className="px-3 py-1.5"><input type="checkbox" readOnly checked={symbol.symbol === selectedSymbol} /></td>
                <td className="px-3 py-1.5 font-semibold">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(symbol.symbol);
                    }}
                    className="rounded text-left font-semibold text-slate-800 outline-none hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-300"
                    aria-label={`Select ${symbol.symbol}`}
                  >
                    {symbol.symbol}
                  </button>
                </td>
                <td className="px-3 py-1.5 text-slate-500">{symbol.sector}</td>
                <td className="px-3 py-1.5">{symbol.lastClose?.toLocaleString("id-ID") ?? "-"}</td>
                <td className="px-3 py-1.5">{tagList(symbol.latestAnnotations.filter(isWyckoffLabel))}</td>
                <td className="px-3 py-1.5">{tagList(symbol.latestAnnotations.filter((label) => ELLIOTT_LABELS.has(label)))}</td>
                <td className="px-3 py-1.5">{tagList(symbol.latestAnnotations.filter((label) => PVA_LABELS.has(label)))}</td>
                <td className="px-3 py-1.5"><QualityBadge status={symbol.dataQuality.status} /></td>
                <td className="px-3 py-1.5 text-slate-500">{symbol.lastSyncedAt ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Inspector({
  wyckoff,
  elliott,
  pva,
  quality,
  backtest,
  projections,
  explanations,
  bundle,
  newsSummary,
  newsEvents,
  newsTicker,
  timeframe,
  selectedNewsEvent,
  anomalies,
  selectedAnomaly,
  selectedConfluenceRow,
  topicImpact,
  selectedProjectionId,
  onProjectionSelect,
  onAnomalySelect,
}: {
  wyckoff: ChartPayload["annotations"];
  elliott: ChartPayload["annotations"];
  pva: ChartPayload["annotations"];
  quality: ChartPayload["dataQuality"] | undefined;
  backtest: BacktestOutcome[];
  projections: ProjectionScenario[];
  explanations: ProjectionExplanation[];
  bundle: ResearchBundle;
  newsSummary: NewsTickerSummary | null;
  newsEvents: NewsChartEvent[];
  newsTicker: string;
  timeframe: Timeframe;
  selectedNewsEvent: NewsChartEvent | null;
  anomalies: ChartAnomaly[];
  selectedAnomaly: ChartAnomaly | null;
  selectedConfluenceRow: ConfluenceHeatmapRow | null;
  topicImpact: TopicImpactSummary[];
  selectedProjectionId: string | null;
  onProjectionSelect(id: string): void;
  onAnomalySelect(id: string): void;
}) {
  const [tab, setTab] = useState<"explain" | "wyckoff" | "elliott" | "pva" | "data">("explain");
  const rows = tab === "wyckoff" ? wyckoff : tab === "elliott" ? elliott : tab === "pva" ? pva : [];
  const selectedProjection = projections.find((projection) => projection.id === selectedProjectionId)
    ?? projections[0]
    ?? null;
  const selectedExplanation = explanations.find((explanation) => explanation.projectionId === selectedProjection?.id)
    ?? explanations[0]
    ?? null;

  return (
    <aside
      aria-label="Prediction inspector"
      className="hidden min-h-0 w-full shrink-0 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm xl:block xl:w-auto"
    >
      <div className="border-b border-slate-200 px-5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Evidence Inspector</p>
            <h3 className="mt-1 truncate text-sm font-bold text-slate-900">
              {selectedProjection?.title ?? "No prediction"}
            </h3>
          </div>
          <span className={`shrink-0 rounded px-2 py-1 text-[11px] font-bold ${selectedProjection ? projectionStatusClass(selectedProjection.status) : "bg-slate-100 text-slate-500"}`}>
            {selectedProjection?.status ?? "pending"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="uppercase tracking-wide text-slate-400">Source</p>
            <p className="truncate font-semibold text-slate-700">{selectedExplanation?.sourceEvents[0]?.type ?? selectedProjection?.family ?? "-"}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-slate-400">Confidence</p>
            <p className="font-semibold text-slate-700">{selectedExplanation?.confidenceLabel ?? "-"}</p>
          </div>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Prediction inspector tabs"
        className="grid grid-cols-5 border-b border-slate-200 text-xs font-bold"
      >
        {([
          ["explain", "Explain"],
          ["wyckoff", "Wyckoff"],
          ["elliott", "Elliott"],
          ["pva", "PVA"],
          ["data", "Data"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`py-3 ${tab === key ? "border-b-2 border-teal-600 text-teal-700" : "text-slate-500 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "data" ? (
        <div className="space-y-4 p-5 text-sm">
          <InspectorSection title="Data Quality">
            <p className="font-semibold text-slate-900">{quality?.status ?? "not loaded"}</p>
            <p className="mt-1 text-xs text-slate-500">{quality?.barCount ?? 0} bars - last {quality?.lastBarDate ?? "-"}</p>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              {(quality?.reasons.length ? quality.reasons : ["cached bars are usable for annotation"]).map((reason) => (
                <li key={reason} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />{reason}</li>
              ))}
            </ul>
          </InspectorSection>
        </div>
      ) : tab === "explain" ? (
        <div className="space-y-4 p-5">
          <PredictionOverviewPanel
            projection={selectedProjection}
            explanation={selectedExplanation}
            conflict={bundle.conflict}
          />
          <ConfidenceBreakdownPanel confidence={bundle.confidence} />
          <SelectedConfluencePanel row={selectedConfluenceRow} ticker={newsTicker} timeframe={timeframe} />
          <AnalogLabPanel analogs={bundle.analogs} />
          <ScenarioSandboxPanel
            scenarios={bundle.scenarios}
            selectedProjectionId={selectedProjection?.id ?? null}
            onScenarioSelect={onProjectionSelect}
          />
          <SelectedNewsEventPanel event={selectedNewsEvent} timeframe={timeframe} />
          <AnomalyLensPanel
            anomalies={anomalies}
            selectedAnomaly={selectedAnomaly}
            onSelect={onAnomalySelect}
          />
          <TopicImpactPanel topics={topicImpact} ticker={newsTicker} timeframe={timeframe} />
          <SourceEventsPanel explanation={selectedExplanation} />
          <EvidenceStackPanel
            wyckoff={wyckoff}
            elliott={elliott}
            pva={pva}
            quality={quality}
            newsSummary={newsSummary}
            newsEvents={newsEvents}
          />
          <ProjectionExplanationPanel explanation={selectedExplanation} />
          <ProjectionStatusPanel
            projections={projections}
            selectedProjectionId={selectedProjection?.id ?? null}
            onProjectionSelect={onProjectionSelect}
          />
        </div>
      ) : (
        <div className="space-y-4 p-5">
          <InspectorSection title={tab === "wyckoff" ? "Wyckoff Analysis" : tab === "elliott" ? "Elliott Structure" : "Price Volume Analysis"}>
            <div className="space-y-3">
              {rows.length === 0 ? (
                <p className="text-xs text-slate-500">No cached annotation for this tab.</p>
              ) : rows.map((annotation) => (
                <div key={annotation.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">{annotation.type}</span>
                    <span className="rounded bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">{annotation.status}</span>
                  </div>
                  {annotation.label !== annotation.type ? (
                    <p className="mt-1 text-xs font-semibold text-slate-600">{annotation.label}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    {annotation.startDate} - invalidation {annotation.invalidationPrice?.toLocaleString("id-ID") ?? "-"}
                  </p>
                  <ul className="mt-3 space-y-2 text-xs text-slate-600">
                    {annotation.evidence.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${annotationDotClass(annotation.family)}`} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </InspectorSection>
          <BacktestPanel outcomes={backtest} />
        </div>
      )}
    </aside>
  );
}

function PredictionOverviewPanel({
  projection,
  explanation,
  conflict,
}: {
  projection: ProjectionScenario | null;
  explanation: ProjectionExplanation | null;
  conflict: TimeframeConflictResult;
}) {
  return (
    <InspectorSection title="Prediction Overview">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <OverviewFact label="Structure Bias" value={projection ? `${projection.family} / ${projection.direction}` : "-"} />
          <OverviewFact label="Status" value={projection?.status ?? "pending"} />
          <OverviewFact label="Rule Confidence" value={projection ? `${Math.round(projection.confidence * 100)}%` : "-"} />
          <OverviewFact label="Conflict" value={conflict.status} />
          <OverviewFact label="Target Range" value={explanation?.targetZone ?? "-"} />
          <OverviewFact label="Invalidation" value={explanation?.invalidation.label ?? "-"} />
        </div>
        <div className="mt-3 border-t border-slate-200 pt-3">
          <OverviewFact
            label="Time Window"
            value={projection ? `${projection.startDate} to ${projection.points.at(-1)?.date ?? "pending"}` : "-"}
          />
        </div>
      </div>
    </InspectorSection>
  );
}

function OverviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function ConfidenceBreakdownPanel({ confidence }: { confidence: ConfidenceBreakdown }) {
  const components = Object.values(confidence.components);

  return (
    <InspectorSection title="Confidence Breakdown">
      <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
        {components.map((component) => (
          <div key={component.label}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-semibold text-slate-700">{component.label}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${confidenceToneClass(component.score)}`}>
                {Math.round(component.score * 100)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.round(component.score * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </InspectorSection>
  );
}

function SelectedConfluencePanel({ row, ticker, timeframe }: { row: ConfluenceHeatmapRow | null; ticker: string; timeframe: Timeframe }) {
  const newsQuery = row ? getConfluenceNewsQuery(row) : null;

  return (
    <InspectorSection title="Selected Confluence Date">
      <div aria-label="Selected confluence date" className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs">
        {!row ? (
          <p className="text-slate-500">No evidence overlap selected.</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate font-bold text-slate-900">{row.date}</span>
                <span className="mt-0.5 block truncate text-slate-600">{row.factors.length} evidence factors</span>
              </span>
              <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-teal-700">
                {Math.round(row.score * 100)}%
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {row.factors.map((factor, index) => (
                <div key={`${factor.label}-${factor.detail}-${index}`} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 rounded border border-teal-100 bg-white px-2 py-1.5">
                  <span className="font-bold text-teal-800">{factor.label}</span>
                  <span className="truncate text-slate-600">{factor.detail}</span>
                  <span className="text-[10px] font-bold text-slate-500">{Math.round(factor.weight * 100)}%</span>
                </div>
              ))}
            </div>
            {newsQuery ? (
              <a
                href={newsPageHref({ ticker, query: newsQuery, queryMode: "semantic", days: CHART_NEWS_EVIDENCE_DAYS, timeframe })}
                className="mt-2 inline-flex rounded border border-teal-200 bg-white px-2 py-1 text-[11px] font-bold text-teal-700 hover:bg-teal-50"
              >
                Open confluence news evidence
              </a>
            ) : null}
          </>
        )}
      </div>
    </InspectorSection>
  );
}

function getConfluenceNewsQuery(row: ConfluenceHeatmapRow) {
  const newsFactor = row.factors.find((factor) => factor.label === "News");
  if (!newsFactor) {
    return null;
  }

  const [eventLabel] = newsFactor.detail.split(":");
  return eventLabel.trim() || newsFactor.detail.trim();
}

function newsPageHref({
  days,
  query,
  queryMode,
  ticker,
  timeframe,
}: {
  days?: number;
  query?: string;
  queryMode?: "semantic";
  ticker?: string;
  timeframe: Timeframe;
}) {
  const params = new URLSearchParams();
  const normalizedTicker = ticker?.trim().toUpperCase();
  const normalizedQuery = query?.trim();
  if (normalizedTicker) {
    params.set("ticker", normalizedTicker);
  }
  if (normalizedQuery) {
    params.set("query", normalizedQuery);
  }
  if (normalizedQuery && queryMode === "semantic") {
    params.set("queryMode", queryMode);
  }
  if (days) {
    params.set("days", String(days));
  }
  if (timeframe === "1w") {
    params.set("timeframe", timeframe);
  }

  const queryString = params.toString();
  return queryString ? `/news?${queryString}` : "/news";
}

function AnalogLabPanel({ analogs }: { analogs: HistoricalAnalogMatch[] }) {
  return (
    <InspectorSection title="Analog Lab">
      <div aria-label="Analog lab" className="space-y-2">
        {analogs.length === 0 ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            pending
          </p>
        ) : analogs.slice(0, 3).map((analog) => (
          <div key={`${analog.startDate}-${analog.endDate}`} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-800">{analog.startDate} - {analog.endDate}</span>
              <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                {(analog.similarity * 100).toFixed(1)}% similar
              </span>
            </div>
            <p className="mt-1 font-semibold text-slate-600">
              Forward {analog.forwardReturnPct === null ? "pending" : formatSignedPercent(analog.forwardReturnPct)}
            </p>
            <p className="mt-1 line-clamp-2 text-slate-500">{analog.evidence[0]}</p>
          </div>
        ))}
      </div>
    </InspectorSection>
  );
}

function ScenarioSandboxPanel({
  scenarios,
  selectedProjectionId,
  onScenarioSelect,
}: {
  scenarios: ScenarioTreeNode[];
  selectedProjectionId: string | null;
  onScenarioSelect(id: string): void;
}) {
  return (
    <InspectorSection title="Scenario Sandbox">
      <div aria-label="Scenario sandbox" className="space-y-2">
        {scenarios.slice(0, 3).map((scenario) => {
          const projectionId = scenarioProjectionId(scenario);
          const selected = projectionId !== null && projectionId === selectedProjectionId;

          return (
          <button
            key={scenario.id}
            type="button"
            disabled={projectionId === null}
            onClick={() => {
              if (projectionId) {
                onScenarioSelect(projectionId);
              }
            }}
            aria-pressed={selected}
            aria-label={`Explore scenario ${scenario.title}`}
            className={`w-full rounded-md border px-3 py-2 text-left text-xs ${selected ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200" : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50"} ${projectionId === null ? "cursor-default opacity-80" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-bold text-slate-800">{scenario.title}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${scenarioStatusClass(scenario.status)}`}>
                {scenario.status}
              </span>
            </div>
            <p className="mt-1 text-slate-500">
              {scenario.direction} / {scenario.targetZone ? `${formatProjectionPrice(scenario.targetZone.min)} - ${formatProjectionPrice(scenario.targetZone.max)}` : "no target zone"}
            </p>
            {scenario.children[0] ? (
              <p className="mt-1 font-semibold text-amber-700">{scenario.children[0].title}</p>
            ) : null}
            <p className="mt-1 line-clamp-2 text-slate-500">{scenario.evidence[0]}</p>
          </button>
          );
        })}
      </div>
    </InspectorSection>
  );
}

function scenarioProjectionId(scenario: ScenarioTreeNode) {
  return scenario.id.startsWith("scenario-projection-")
    ? scenario.id.slice("scenario-".length)
    : null;
}

function SelectedNewsEventPanel({ event, timeframe }: { event: NewsChartEvent | null; timeframe: Timeframe }) {
  return (
    <InspectorSection title="Selected News Event">
      <div aria-label="Selected news event" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
        {!event ? (
          <p className="text-slate-500">No chart-linked news event selected.</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate font-bold text-slate-900">{event.title}</span>
                <span className="mt-0.5 block truncate text-slate-600">{event.chartDate} / {event.sourceName}</span>
              </span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${newsSentimentClass(event.sentimentLabel)}`}>
                {event.sentimentLabel}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <OverviewFact label="Event" value={event.eventLabel} />
              <OverviewFact label="3D" value={formatSignedPercent(event.return3dPct)} />
              <OverviewFact label="Volume" value={`${event.volumeRatio ?? "n/a"}x`} />
            </div>
            <p className="mt-2 line-clamp-2 text-slate-600">
              {event.evidence}; volume {event.volumeRatio ?? "n/a"}x.
            </p>
            <a
              href={newsPageHref({ ticker: event.ticker, query: event.eventLabel, queryMode: "semantic", days: CHART_NEWS_EVIDENCE_DAYS, timeframe })}
              className="mt-2 inline-flex rounded border border-emerald-200 bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50"
            >
              Open news evidence
            </a>
          </>
        )}
      </div>
    </InspectorSection>
  );
}

function AnomalyLensPanel({
  anomalies,
  selectedAnomaly,
  onSelect,
}: {
  anomalies: ChartAnomaly[];
  selectedAnomaly: ChartAnomaly | null;
  onSelect(id: string): void;
}) {
  return (
    <InspectorSection title="Anomaly Lens">
      <div aria-label="Selected anomaly" className="space-y-2">
        {!selectedAnomaly ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            No anomaly detected on the visible chart window.
          </p>
        ) : (
          <>
            <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-bold text-slate-900">{selectedAnomaly.labels.join(" / ")}</span>
                  <span className="mt-0.5 block truncate text-slate-600">{selectedAnomaly.date}</span>
                </span>
                <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                  {Math.round(selectedAnomaly.score * 100)}%
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-slate-600">
                {selectedAnomaly.evidence.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-1">
              {anomalies.slice(0, 4).map((anomaly) => (
                <button
                  key={anomaly.id}
                  type="button"
                  onClick={() => onSelect(anomaly.id)}
                  aria-pressed={selectedAnomaly.id === anomaly.id}
                  aria-label={`Inspect anomaly ${anomaly.date} ${anomaly.labels.join(" ")}`}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2 text-left text-xs ${selectedAnomaly.id === anomaly.id ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{anomaly.labels.join(" / ")}</span>
                    <span className="block truncate text-slate-500">{anomaly.date}</span>
                  </span>
                  <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                    {Math.round(anomaly.score * 100)}%
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </InspectorSection>
  );
}

function TopicImpactPanel({ topics, ticker, timeframe }: { topics: TopicImpactSummary[]; ticker: string; timeframe: Timeframe }) {
  return (
    <InspectorSection title="Topic Impact">
      <div aria-label="Topic impact" className="space-y-2">
        {topics.length === 0 ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            No chart-linked news topic yet.
          </p>
        ) : topics.slice(0, 4).map((topic) => (
          <div key={topic.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
            <span className="min-w-0">
              <span className="block truncate font-bold text-slate-800">{topic.label}</span>
              <span className="block truncate text-slate-500">{topic.total} events / volume {topic.averageVolumeRatio ?? "n/a"}x</span>
              <a
                href={newsPageHref({ ticker, query: topic.label, queryMode: "semantic", days: CHART_NEWS_EVIDENCE_DAYS, timeframe })}
                aria-label={`Open topic news evidence ${topic.label}`}
                className="mt-1 inline-flex rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
              >
                Open evidence
              </a>
            </span>
            <span className={topic.averageReturn3dPct !== null && topic.averageReturn3dPct >= 0 ? "font-bold text-emerald-600" : "font-bold text-rose-600"}>
              {formatSignedPercent(topic.averageReturn3dPct)}
            </span>
          </div>
        ))}
      </div>
    </InspectorSection>
  );
}

function SourceEventsPanel({ explanation }: { explanation: ProjectionExplanation | null }) {
  const events = explanation?.sourceEvents ?? [];

  return (
    <InspectorSection title="Source Events">
      <div className="space-y-2">
        {events.length === 0 ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">No source event is attached to this projection.</p>
        ) : events.slice(0, 4).map((event) => (
          <div key={event.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-bold text-slate-800">{event.type}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${annotationStatusClass(event.status)}`}>
                {event.status}
              </span>
            </div>
            <p className="mt-1 text-slate-500">{event.date} - {event.label}</p>
          </div>
        ))}
      </div>
    </InspectorSection>
  );
}

function EvidenceStackPanel({
  wyckoff,
  elliott,
  pva,
  quality,
  newsSummary,
  newsEvents,
}: {
  wyckoff: ChartPayload["annotations"];
  elliott: ChartPayload["annotations"];
  pva: ChartPayload["annotations"];
  quality: ChartPayload["dataQuality"] | undefined;
  newsSummary: NewsTickerSummary | null;
  newsEvents: NewsChartEvent[];
}) {
  const rows = [
    { label: "Wyckoff", value: wyckoff.length.toString(), detail: wyckoff.at(-1)?.type ?? "no annotation", tone: "green" as const },
    { label: "Elliott Wave", value: elliott.length.toString(), detail: elliott.at(-1)?.type ?? "no annotation", tone: "blue" as const },
    { label: "PVA / Volume", value: pva.length.toString(), detail: pva.at(-1)?.type ?? "no annotation", tone: "amber" as const },
    { label: "News / Events", value: `${newsEvents.length}`, detail: `${newsSummary?.totalArticles ?? 0} articles, ${newsEvents.length} material`, tone: "slate" as const },
    { label: "Data Guard", value: formatQualityStatus(quality?.status ?? "blocked"), detail: `${quality?.barCount ?? 0} cached bars`, tone: quality?.status === "ok" ? "green" as const : "amber" as const },
  ];

  return (
    <InspectorSection title="Evidence Stack">
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <span className="min-w-0">
              <span className="block font-bold text-slate-800">{row.label}</span>
              <span className="block truncate text-slate-500">{row.detail}</span>
            </span>
            <span className={`rounded px-2 py-1 text-[11px] font-bold ${evidenceStackToneClass(row.tone)}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </InspectorSection>
  );
}

function BacktestPanel({ outcomes }: { outcomes: BacktestOutcome[] }) {
  return (
    <InspectorSection title="Backtest Outcomes">
      <div className="space-y-2">
        {outcomes.length === 0 ? (
          <p className="text-xs text-slate-500">No completed outcome window for this symbol.</p>
        ) : outcomes.slice(0, 5).map((outcome) => (
          <div key={`${outcome.annotationId}-${outcome.horizonBars}`} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">{outcome.eventType} {outcome.horizonBars} bars</span>
              <span className={outcome.returnPct !== null && outcome.returnPct >= 0 ? "text-emerald-600" : "text-rose-600"}>
                {outcome.returnPct === null ? "pending" : `${outcome.returnPct.toFixed(2)}%`}
              </span>
            </div>
            <p className="mt-1 text-slate-500">{outcome.eventDate} - {outcome.status}</p>
          </div>
        ))}
      </div>
    </InspectorSection>
  );
}

function ProjectionStatusPanel({
  projections,
  selectedProjectionId,
  onProjectionSelect,
}: {
  projections: ProjectionScenario[];
  selectedProjectionId: string | null;
  onProjectionSelect(id: string): void;
}) {
  const visibleProjections = projections.slice(0, 3);

  return (
    <InspectorSection title="Prediction Set">
      <div className="space-y-2">
        {visibleProjections.length === 0 ? (
          <p className="text-xs text-slate-500">No rule-valid projection for this chart window.</p>
        ) : visibleProjections.map((projection) => (
          <button
            key={projection.id}
            type="button"
            onClick={() => onProjectionSelect(projection.id)}
            aria-pressed={projection.id === selectedProjectionId}
            className={`w-full rounded-md border px-3 py-2 text-left text-xs ${projection.id === selectedProjectionId ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-bold text-slate-800">{projection.title}</span>
              <span
                aria-label="Projection status"
                className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold ${projectionStatusClass(projection.status)}`}
              >
                {projection.status}
              </span>
            </div>
            <p className="mt-1 text-slate-500">
              {formatProjectionPrice(projection.targetZone.min)} - {formatProjectionPrice(projection.targetZone.max)}
            </p>
          </button>
        ))}
      </div>
    </InspectorSection>
  );
}

function ProjectionExplanationPanel({ explanation }: { explanation: ProjectionExplanation | null }) {
  return (
    <InspectorSection title="Prediction Explanation">
      <div aria-label="Selected prediction explanation" className="rounded-md border border-slate-200 bg-white p-3 text-xs">
        {!explanation ? (
          <p className="text-slate-500">No prediction explanation available for this chart window.</p>
        ) : (
          <>
            <div>
              <div>
                <p className="text-[13px] font-bold leading-5 text-slate-900">{explanation.title}</p>
                <p className="mt-1 text-slate-500">{explanation.ruleBasis}</p>
              </div>
              <span className="mt-2 inline-flex rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                {explanation.confidenceLabel}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <p className="uppercase tracking-wide text-slate-400">Target Path</p>
                <p className="font-semibold text-slate-800">{explanation.targetPath}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-400">Invalidation</p>
                <p className="font-semibold text-slate-800">{explanation.invalidation.label}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="uppercase tracking-wide text-slate-400">Source Events</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {explanation.sourceEvents.length === 0 ? (
                  <span className="text-slate-500">No visible source event</span>
                ) : explanation.sourceEvents.map((source) => (
                  <span key={source.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-700">
                    {source.type} {source.date.slice(5)}
                  </span>
                ))}
              </div>
            </div>
            <ul className="mt-3 space-y-2 text-slate-600">
              {explanation.evidence.slice(0, 4).map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  {item}
                </li>
              ))}
              {explanation.conflicts.slice(0, 3).map((item) => (
                <li key={item} className="flex gap-2 text-amber-700">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {item}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </InspectorSection>
  );
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</h4>
      {children}
    </section>
  );
}

function annotationDotClass(family: ChartPayload["annotations"][number]["family"]) {
  if (family === "wyckoff") {
    return "bg-teal-500";
  }

  if (family === "pva") {
    return "bg-amber-500";
  }

  return "bg-blue-500";
}

function QualityBadge({ status }: { status: SymbolSummary["dataQuality"]["status"] }) {
  const tone = status === "ok"
    ? "border-teal-200 bg-teal-50 text-teal-700"
    : status === "insufficient_data"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {status === "ok" ? "Good" : status === "missing_volume" ? "Caution" : status.replace("_", " ")}
    </span>
  );
}

function tagList(labels: string[]) {
  if (labels.length === 0) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {labels.slice(0, 3).map((label, index) => (
        <span key={`${label}-${index}`} className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
          {label}
        </span>
      ))}
    </span>
  );
}

function isWyckoffLabel(label: string) {
  return !ELLIOTT_LABELS.has(label) && !PVA_LABELS.has(label);
}

function getEffectiveProjectionId(selectedProjectionId: string | null, projections: ProjectionScenario[]) {
  if (selectedProjectionId && projections.some((projection) => projection.id === selectedProjectionId)) {
    return selectedProjectionId;
  }

  return projections.find((projection) => projection.status === "active" && projection.points.length >= 2)?.id
    ?? projections[0]?.id
    ?? null;
}

function compact(value: number) {
  return new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatProjectionPrice(price: number) {
  return Math.round(price).toLocaleString("id-ID");
}

function projectionStatusClass(status: ProjectionScenario["status"]) {
  if (status === "active") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "invalidated") {
    return "bg-rose-50 text-rose-700";
  }

  if (status === "conflicted") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-slate-100 text-slate-600";
}

function annotationStatusClass(status: ChartPayload["annotations"][number]["status"]) {
  if (status === "confirmed") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "invalidated") {
    return "bg-rose-50 text-rose-700";
  }

  if (status === "candidate") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-slate-100 text-slate-600";
}

function confidenceToneClass(score: number) {
  if (score >= 0.7) {
    return "bg-emerald-50 text-emerald-700";
  }

  if (score >= 0.45) {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-rose-50 text-rose-700";
}

function evidenceStackToneClass(tone: "green" | "blue" | "amber" | "slate") {
  if (tone === "green") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (tone === "blue") {
    return "bg-blue-50 text-blue-700";
  }

  if (tone === "amber") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-slate-100 text-slate-600";
}

function formatQualityStatus(status: string | undefined) {
  if (!status) {
    return "Unknown";
  }

  if (status === "ok") {
    return "Good";
  }

  return status.replace("_", " ");
}

function formatSignedPercent(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatSignedDecimal(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return value.toFixed(2);
}

function scoreNewsEventPriority(event: NewsChartEvent) {
  return event.materialityScore * 0.6 + event.confidenceScore * 0.25 + Math.max(0, event.relevanceScore ?? 0) * 0.15;
}

function newsSentimentClass(sentiment: NewsChartEvent["sentimentLabel"]) {
  if (sentiment === "positive") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (sentiment === "negative") {
    return "bg-rose-100 text-rose-700";
  }

  if (sentiment === "mixed") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-slate-100 text-slate-600";
}

function confluenceToneClass(tone: ConfluenceHeatmapRow["tone"]) {
  if (tone === "strong") {
    return "border-teal-200 bg-teal-50 text-teal-800";
  }

  if (tone === "watch") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function scenarioStatusClass(status: ScenarioTreeNode["status"]) {
  if (status === "active") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "invalidated") {
    return "bg-rose-50 text-rose-700";
  }
  if (status === "conflicted") {
    return "bg-amber-50 text-amber-700";
  }
  return "bg-slate-100 text-slate-600";
}

function getNewsTone(summary: NewsTickerSummary | null) {
  if (!summary || summary.totalArticles === 0 || summary.weightedSentimentScore === null) {
    return {
      label: "none",
      className: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    };
  }

  if (summary.weightedSentimentScore > 0.15) {
    return {
      label: "positive",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    };
  }

  if (summary.weightedSentimentScore < -0.15) {
    return {
      label: "negative",
      className: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
    };
  }

  return {
    label: "mixed",
    className: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  };
}

function normalizeRouteSymbol(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return DEFAULT_SYMBOL;
  }

  return normalized.endsWith(".JK") ? normalized : `${normalized}.JK`;
}

function normalizeRouteTimeframe(value: string): Timeframe {
  const normalized = value.trim().toLowerCase();
  if (normalized === "1w" || normalized === "weekly") {
    return "1w";
  }

  return "1d";
}

function normalizeRouteAsOf(value: string) {
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function findTimeMachineCursorForDate(bars: ChartPayload["bars"], asOfDate: string) {
  let cursor = 0;
  for (let index = 0; index < bars.length; index += 1) {
    if (bars[index].date > asOfDate) {
      break;
    }
    cursor = index;
  }
  return cursor;
}

function getRangeOptions(timeframe: Timeframe): RangeOption[] {
  return timeframe === "1w" ? WEEKLY_RANGE_OPTIONS : DAILY_RANGE_OPTIONS;
}

function getRangeGroupSize(timeframe: Timeframe, currentRange: RangeLabel): number {
  const options = getRangeOptions(timeframe);
  return options.find((option) => option.label === currentRange)?.groupSize ?? options[0].groupSize;
}

function resolveRangeForTimeframe(timeframe: Timeframe, currentRange: RangeLabel): RangeLabel {
  const options = getRangeOptions(timeframe);
  return options.some((option) => option.label === currentRange) ? currentRange : options[0].label;
}

function oppositeTimeframe(timeframe: Timeframe): Timeframe {
  return timeframe === "1d" ? "1w" : "1d";
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debounced;
}
