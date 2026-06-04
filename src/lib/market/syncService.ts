import { randomUUID } from "node:crypto";

import { buildZigZagSwings } from "@/lib/analysis/swingEngine";
import { detectElliott } from "@/lib/analysis/elliottEngine";
import { detectPriceVolume } from "@/lib/analysis/priceVolumeEngine";
import { detectWyckoff } from "@/lib/analysis/wyckoffEngine";
import { aggregateWeeklyBars, type MarketDataProvider, YahooMarketDataProvider } from "@/lib/market/dataProvider";
import type { MarketStore } from "@/lib/market/marketStore";
import { createDefaultUniverseProvider, type UniverseProvider } from "@/lib/market/universeProvider";
import type { AnalysisMode, Bar, ChartAnnotation, SymbolRecord, SyncRun, SyncSymbolStatus, Timeframe } from "@/lib/market/types";

export type MarketSyncOptions = {
  store: MarketStore;
  symbols?: SymbolRecord[];
  provider?: MarketDataProvider;
  universeProvider?: UniverseProvider;
  years?: number;
  concurrency?: number;
  skipFreshDays?: number;
  now?: Date;
};

export type RecalculateBatchResult = {
  total: number;
  successCount: number;
  failedCount: number;
  errors: Record<string, string>;
  symbols: Array<{
    symbol: string;
    annotationCount: number;
  }>;
};

export type RecalculateOptions = {
  analysisMode?: AnalysisMode;
};

export function buildAnnotationsForBars(
  symbol: string,
  timeframe: Timeframe,
  bars: Bar[],
  options: RecalculateOptions = {},
): ChartAnnotation[] {
  const analysisMode = options.analysisMode ?? "strict";

  if (bars.length === 0) {
    return [emptyDataAnnotation(symbol, timeframe, analysisMode)];
  }

  const wyckoff = detectWyckoff(bars, { mode: analysisMode });
  const swings = buildZigZagSwings(bars, zigZagOptions(timeframe, analysisMode));
  const elliott = detectElliott(symbol, timeframe, swings, { mode: analysisMode });
  const pva = detectPriceVolume(bars, { mode: analysisMode });
  return [...wyckoff, ...elliott, ...pva];
}

export function recalculateSymbol(
  store: MarketStore,
  symbol: string,
  timeframe: Timeframe = "1d",
  options: RecalculateOptions = {},
): ChartAnnotation[] {
  const bars = store.getBars(symbol, timeframe);
  const annotations = buildAnnotationsForBars(symbol, timeframe, bars, options);

  store.replaceAnnotations(symbol, timeframe, annotations);
  return annotations;
}

export function recalculateSymbols(
  store: MarketStore,
  symbols: string[],
  timeframe: Timeframe = "1d",
  options: RecalculateOptions = {},
): RecalculateBatchResult {
  const result: RecalculateBatchResult = {
    total: symbols.length,
    successCount: 0,
    failedCount: 0,
    errors: {},
    symbols: [],
  };

  for (const symbol of symbols) {
    try {
      const annotations = recalculateSymbol(store, symbol, timeframe, options);
      result.successCount += 1;
      result.symbols.push({ symbol, annotationCount: annotations.length });
    } catch (error) {
      result.failedCount += 1;
      result.errors[symbol] = error instanceof Error ? error.message : String(error);
    }
  }

  return result;
}

export async function runMarketSync(options: MarketSyncOptions): Promise<SyncRun> {
  const provider = options.provider ?? new YahooMarketDataProvider();
  const universeProvider = options.universeProvider ?? createDefaultUniverseProvider();
  const symbols = options.symbols ?? await universeProvider.loadSymbols();
  const startedAt = new Date().toISOString();
  const errors: Record<string, string> = {};
  const run: SyncRun = {
    id: randomUUID(),
    startedAt,
    finishedAt: null,
    status: "running",
    totalSymbols: symbols.length,
    successCount: 0,
    skippedCount: 0,
    failedCount: 0,
    error: null,
  };

  options.store.createSyncRun(run);
  options.store.upsertSymbols(symbols);

  await mapLimit(symbols, Math.max(1, options.concurrency ?? 1), async (symbol) => {
    await syncOneSymbol(symbol, options, provider, run, errors);
    options.store.updateSyncRun({ ...run, error: errors });
  });

  const completed: SyncRun = {
    ...run,
    status: run.successCount === 0 && run.failedCount > 0 && (run.skippedCount ?? 0) === 0 ? "failed" : "completed",
    finishedAt: new Date().toISOString(),
    error: errors,
  };
  options.store.updateSyncRun(completed);
  return completed;
}

export function calculateAndStoreBars(store: MarketStore, dailyBars: Bar[]): void {
  if (dailyBars.length === 0) {
    return;
  }

  store.upsertBars(dailyBars);
  store.upsertBars(aggregateWeeklyBars(dailyBars));
  recalculateSymbol(store, dailyBars[0].symbol, "1d", { analysisMode: "strict" });
  recalculateSymbol(store, dailyBars[0].symbol, "1w", { analysisMode: "strict" });
}

async function syncOneSymbol(
  symbol: SymbolRecord,
  options: MarketSyncOptions,
  provider: MarketDataProvider,
  run: SyncRun,
  errors: Record<string, string>,
) {
  const startedAt = new Date().toISOString();
  const existingBars = options.store.getBars(symbol.symbol, "1d");

  if (isFresh(existingBars, options.skipFreshDays, options.now)) {
    run.skippedCount = (run.skippedCount ?? 0) + 1;
    options.store.upsertSyncSymbolStatus(buildStatus({
      runId: run.id,
      symbol: symbol.symbol,
      status: "skipped",
      attempts: 0,
      startedAt,
      bars: existingBars,
      error: null,
    }));
    return;
  }

  options.store.upsertSyncSymbolStatus(buildStatus({
    runId: run.id,
    symbol: symbol.symbol,
    status: "running",
    attempts: 0,
    startedAt,
    bars: existingBars,
    error: null,
    finishedAt: null,
  }));

  try {
    const result = await retryWithAttempts(async () => {
      const bars = await provider.fetchDailyBars(symbol.symbol, options.years ?? 3);
      if (bars.length === 0) {
        throw new Error(`No daily bars returned for ${symbol.symbol}`);
      }

      return bars;
    }, 2);
    const dailyBars = result.value;
    const weeklyBars = aggregateWeeklyBars(dailyBars);
    options.store.upsertBars(dailyBars);
    options.store.upsertBars(weeklyBars);
    recalculateSymbol(options.store, symbol.symbol, "1d", { analysisMode: "strict" });
    recalculateSymbol(options.store, symbol.symbol, "1w", { analysisMode: "strict" });
    run.successCount += 1;
    options.store.upsertSyncSymbolStatus(buildStatus({
      runId: run.id,
      symbol: symbol.symbol,
      status: "success",
      attempts: result.attempts,
      startedAt,
      bars: dailyBars,
      error: null,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    run.failedCount += 1;
    errors[symbol.symbol] = message;
    options.store.upsertSyncSymbolStatus(buildStatus({
      runId: run.id,
      symbol: symbol.symbol,
      status: "failed",
      attempts: 2,
      startedAt,
      bars: existingBars,
      error: message,
    }));
  }
}

function buildStatus(input: {
  runId: string;
  symbol: string;
  status: SyncSymbolStatus["status"];
  attempts: number;
  startedAt: string;
  bars: Bar[];
  error: unknown;
  finishedAt?: string | null;
}): SyncSymbolStatus {
  return {
    runId: input.runId,
    symbol: input.symbol,
    status: input.status,
    attempts: input.attempts,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt === undefined ? new Date().toISOString() : input.finishedAt,
    error: input.error,
    barsCount: input.bars.length,
    lastBarDate: input.bars.at(-1)?.date ?? null,
  };
}

function isFresh(bars: Bar[], skipFreshDays: number | undefined, now: Date | undefined): boolean {
  if (!skipFreshDays || bars.length === 0) {
    return false;
  }

  const lastDate = bars.at(-1)?.date;
  if (!lastDate) {
    return false;
  }

  const last = new Date(`${lastDate}T00:00:00.000Z`);
  const reference = now ?? new Date();
  const ageMs = reference.getTime() - last.getTime();
  const ageDays = ageMs / 86_400_000;
  return ageDays >= 0 && ageDays <= skipFreshDays;
}

function zigZagOptions(timeframe: Timeframe, analysisMode: AnalysisMode) {
  if (analysisMode === "loose") {
    return { reversalPercent: timeframe === "1w" ? 6 : 4, pivotStrength: 1 };
  }

  return { reversalPercent: timeframe === "1w" ? 7 : 5, pivotStrength: 2 };
}

function emptyDataAnnotation(symbol: string, timeframe: Timeframe, analysisMode: AnalysisMode): ChartAnnotation {
  return {
    id: `${symbol}-${timeframe}-structure-insufficient-bars`,
    symbol,
    timeframe,
    family: "structure",
    type: "Insufficient Data",
    label: "Insufficient cached bars",
    startDate: "",
    endDate: "",
    priceMin: 0,
    priceMax: 0,
    invalidationPrice: null,
    status: "insufficient_data",
    evidence: ["no cached OHLCV bars are available for recalculation"],
    confidence: 0,
    qualityScore: 0,
    quality: "weak",
    phase: null,
    conflicts: ["run sync before recalculating this symbol"],
    meta: { analysisMode },
  };
}

async function retryWithAttempts<T>(operation: () => Promise<T>, attempts: number): Promise<{ value: T; attempts: number }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return { value: await operation(), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(250 * attempt);
      }
    }
  }

  throw lastError;
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  });

  await Promise.all(workers);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
