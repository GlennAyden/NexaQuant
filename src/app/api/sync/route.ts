import { getMarketStore } from "@/lib/market/marketStore";
import { runMarketSync } from "@/lib/market/syncService";
import { createDefaultUniverseProvider } from "@/lib/market/universeProvider";
import type { SymbolRecord } from "@/lib/market/types";

export const dynamic = "force-dynamic";

let activeSync: Promise<unknown> | null = null;

type SyncMode = "all" | "watchlist" | "selected" | "failed";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = clampNumber(url.searchParams.get("limit"), 1, 1000, 25);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 100_000, 0);
  const store = getMarketStore();
  const run = store.getLatestSyncRun();
  const allStatuses = run ? store.getSyncSymbolStatuses(run.id) : [];

  return Response.json({
    active: Boolean(activeSync),
    run,
    statuses: allStatuses.slice(offset, offset + limit),
    totalStatuses: allStatuses.length,
    limit,
    offset,
  });
}

export async function POST(request: Request) {
  const store = getMarketStore();
  const parsed = await parseSyncOptions(request);

  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  if (!activeSync) {
    activeSync = runMarketSync({ store, ...parsed.options }).finally(() => {
      activeSync = null;
    });
  }

  return Response.json({
    active: true,
    run: store.getLatestSyncRun(),
    statuses: [],
  }, { status: 202 });
}

async function parseSyncOptions(request: Request): Promise<
  | { options: { symbols?: SymbolRecord[]; concurrency?: number; skipFreshDays?: number } }
  | { error: string }
> {
  const bodyResult = await readJsonBody(request);

  if ("error" in bodyResult) {
    return bodyResult;
  }

  const body = bodyResult.body;

  if (body === null) {
    return { options: {} };
  }

  if (!isRecord(body)) {
    return { error: "JSON body must be an object" };
  }

  const mode = parseMode(body.mode);
  if (!mode) {
    return { error: "mode must be one of all, watchlist, selected, failed" };
  }

  const symbolNames = parseSymbols(body.symbols);
  if (symbolNames === null) {
    return { error: "symbols must be an array of non-empty strings" };
  }

  const concurrency = parseOptionalInteger(body.concurrency, 1, 8);
  if (concurrency === null) {
    return { error: "concurrency must be a positive integer" };
  }

  const skipFreshDays = parseOptionalInteger(body.skipFreshDays, 0, 365);
  if (skipFreshDays === null) {
    return { error: "skipFreshDays must be a non-negative integer" };
  }

  if (mode === "all" && symbolNames.length === 0) {
    return { options: { concurrency, skipFreshDays } };
  }

  const symbols = await resolveSyncSymbols(mode, symbolNames);
  if (mode === "selected" && symbols.length === 0) {
    return { error: "symbols is required when mode is selected" };
  }
  if ((mode === "watchlist" || mode === "failed") && symbols.length === 0) {
    return { error: `no symbols available for ${mode} sync` };
  }

  return { options: { symbols, concurrency, skipFreshDays } };
}

async function resolveSyncSymbols(mode: SyncMode, symbolNames: string[]): Promise<SymbolRecord[]> {
  const store = getMarketStore();
  const stored = store.getSymbols();
  const universe = await createDefaultUniverseProvider().loadSymbols();
  const lookup = new Map<string, SymbolRecord>();

  for (const symbol of [...universe, ...stored]) {
    lookup.set(symbol.symbol, {
      symbol: symbol.symbol,
      name: symbol.name,
      sector: symbol.sector,
      exchange: symbol.exchange,
      isActive: symbol.isActive,
      source: symbol.source,
      lastSeenAt: symbol.lastSeenAt,
    });
  }

  if (mode === "watchlist") {
    return resolveKnownSymbols(store.getWatchlist().map((item) => item.symbol), lookup);
  }

  if (mode === "failed") {
    const latestRun = store.getLatestSyncRun();
    const failedSymbols = latestRun
      ? store.getSyncSymbolStatuses(latestRun.id)
        .filter((status) => status.status === "failed")
        .map((status) => status.symbol)
      : [];
    return resolveKnownSymbols(failedSymbols, lookup);
  }

  return resolveKnownSymbols(symbolNames, lookup);
}

function resolveKnownSymbols(symbols: string[], lookup: Map<string, SymbolRecord>): SymbolRecord[] {
  const uniqueSymbols = [...new Set(symbols)];
  return uniqueSymbols.flatMap((symbol) => {
    const record = lookup.get(symbol);
    return record ? [record] : [];
  });
}

async function readJsonBody(request: Request): Promise<{ body: unknown | null } | { error: string }> {
  try {
    const text = await request.text();
    return { body: text.trim() ? JSON.parse(text) : null };
  } catch {
    return { error: "request body must be valid JSON" };
  }
}

function parseMode(value: unknown): SyncMode | null {
  if (value === undefined) {
    return "all";
  }

  return value === "all" || value === "watchlist" || value === "selected" || value === "failed" ? value : null;
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

function parseOptionalInteger(value: unknown, min: number, max: number): number | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function clampNumber(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
