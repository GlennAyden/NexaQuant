import { getMarketStore, type MarketStore } from "@/lib/market/marketStore";
import { recalculateSymbol, recalculateSymbols } from "@/lib/market/syncService";
import type { AnalysisMode, Timeframe } from "@/lib/market/types";

export const dynamic = "force-dynamic";

type RecalculateMode = "all" | "watchlist" | "selected";
type RecalculateTimeframe = Timeframe | "all";
const ALL_TIMEFRAMES: Timeframe[] = ["1d", "1w"];

export async function POST(request: Request) {
  const store = getMarketStore();
  const parsed = await parseRecalculateRequest(request, store);

  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.kind === "single") {
    const results = parsed.timeframes.map((timeframe) => ({
      timeframe,
      annotations: recalculateSymbol(store, parsed.symbol, timeframe, { analysisMode: parsed.analysisMode }),
    }));
    return Response.json({
      symbol: parsed.symbol,
      analysisMode: parsed.analysisMode,
      timeframes: parsed.timeframes,
      annotations: results.flatMap((item) => item.annotations),
      results,
    });
  }

  const results = parsed.timeframes.map((timeframe) => ({
    timeframe,
    ...recalculateSymbols(store, parsed.symbols, timeframe, { analysisMode: parsed.analysisMode }),
  }));
  const errors = Object.fromEntries(
    results.flatMap((result) => Object.entries(result.errors).map(([symbol, message]) => [`${result.timeframe}:${symbol}`, message])),
  );
  return Response.json({
    analysisMode: parsed.analysisMode,
    timeframes: parsed.timeframes,
    total: results.reduce((sum, result) => sum + result.total, 0),
    successCount: results.reduce((sum, result) => sum + result.successCount, 0),
    failedCount: results.reduce((sum, result) => sum + result.failedCount, 0),
    errors,
    symbols: results.flatMap((result) =>
      result.symbols.map((item) => ({ ...item, timeframe: result.timeframe })),
    ),
    results,
  });
}

async function parseRecalculateRequest(request: Request, store: MarketStore): Promise<
  | { kind: "single"; symbol: string; timeframes: Timeframe[]; analysisMode: AnalysisMode }
  | { kind: "batch"; symbols: string[]; timeframes: Timeframe[]; analysisMode: AnalysisMode }
  | { error: string }
> {
  const bodyResult = await readJsonBody(request);

  if ("error" in bodyResult) {
    return bodyResult;
  }

  const body = bodyResult.body;
  if (body === null) {
    return { kind: "single", symbol: "BBCA.JK", timeframes: ["1d"], analysisMode: "strict" };
  }

  if (!isRecord(body)) {
    return { error: "JSON body must be an object" };
  }

  const timeframe = parseTimeframe(body.timeframe);
  if (!timeframe) {
    return { error: "timeframe must be 1d, 1w, or all" };
  }
  const timeframes = resolveTimeframes(timeframe);

  const analysisMode = parseAnalysisMode(body.analysisMode);
  if (!analysisMode) {
    return { error: "analysisMode must be strict or loose" };
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : undefined;
  if (body.symbol !== undefined && !symbol) {
    return { error: "symbol must be a non-empty string" };
  }

  const symbols = parseSymbols(body.symbols);
  if (symbols === null) {
    return { error: "symbols must be an array of non-empty strings" };
  }

  const mode = parseMode(body.mode);
  if (!mode) {
    return { error: "mode must be one of all, watchlist, selected" };
  }

  const hasBatchIntent = body.symbols !== undefined || body.mode !== undefined;
  if (!hasBatchIntent) {
    return { kind: "single", symbol: symbol ?? "BBCA.JK", timeframes, analysisMode };
  }

  const resolvedSymbols = resolveSymbols(mode, symbols, store);
  if (mode === "selected" && resolvedSymbols.length === 0) {
    return { error: "symbols is required when mode is selected" };
  }

  return { kind: "batch", symbols: resolvedSymbols, timeframes, analysisMode };
}

function resolveSymbols(mode: RecalculateMode, symbols: string[], store: MarketStore): string[] {
  if (mode === "all") {
    return symbols.length > 0 ? symbols : store.listSymbolCodes();
  }

  if (mode === "watchlist") {
    return store.getWatchlist().map((item) => item.symbol);
  }

  return symbols;
}

async function readJsonBody(request: Request): Promise<{ body: unknown | null } | { error: string }> {
  try {
    const text = await request.text();
    return { body: text.trim() ? JSON.parse(text) : null };
  } catch {
    return { error: "request body must be valid JSON" };
  }
}

function parseTimeframe(value: unknown): RecalculateTimeframe | null {
  if (value === undefined) {
    return "1d";
  }

  return value === "1d" || value === "1w" || value === "all" ? value : null;
}

function resolveTimeframes(timeframe: RecalculateTimeframe): Timeframe[] {
  return timeframe === "all" ? ALL_TIMEFRAMES : [timeframe];
}

function parseAnalysisMode(value: unknown): AnalysisMode | null {
  if (value === undefined) {
    return "strict";
  }

  return value === "strict" || value === "loose" ? value : null;
}

function parseMode(value: unknown): RecalculateMode | null {
  if (value === undefined) {
    return "all";
  }

  return value === "all" || value === "watchlist" || value === "selected" ? value : null;
}

function parseSymbols(value: unknown): string[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const symbols = value.map((item) => typeof item === "string" ? item.trim().toUpperCase() : "");
  return symbols.every(Boolean) ? [...new Set(symbols)] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
