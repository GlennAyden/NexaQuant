import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { assessDataQuality } from "@/lib/analysis/indicators";
import type {
  Bar,
  BestExample,
  ChartAnnotation,
  ChartPayload,
  SymbolRecord,
  SymbolSummary,
  SyncRun,
  SyncSymbolStatus,
  Timeframe,
  WatchlistItem,
} from "@/lib/market/types";

export type MarketStore = ReturnType<typeof createMarketStore>;

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "market.db");
const ANNOTATION_DELIMITER = String.fromCharCode(31);

type SymbolFilters = { query?: string; family?: string; status?: string };

export function createMarketStore(dbPath = DEFAULT_DB_PATH) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  return {
    upsertSymbols(symbols: SymbolRecord[]) {
      const insert = db.prepare(`
        INSERT INTO symbols (symbol, name, sector, exchange, is_active, source, last_seen_at)
        VALUES (@symbol, @name, @sector, @exchange, @isActive, @source, @lastSeenAt)
        ON CONFLICT(symbol) DO UPDATE SET
          name = excluded.name,
          sector = excluded.sector,
          exchange = excluded.exchange,
          is_active = excluded.is_active,
          source = excluded.source,
          last_seen_at = excluded.last_seen_at
      `);

      const transaction = db.transaction((rows: SymbolRecord[]) => {
        for (const symbol of rows) {
          insert.run({ ...symbol, isActive: symbol.isActive ? 1 : 0 });
        }
      });

      transaction(symbols);
    },

    upsertBars(bars: Bar[]) {
      const insert = db.prepare(`
        INSERT INTO bars (symbol, timeframe, date, open, high, low, close, adj_close, volume, source)
        VALUES (@symbol, @timeframe, @date, @open, @high, @low, @close, @adjClose, @volume, @source)
        ON CONFLICT(symbol, timeframe, date) DO UPDATE SET
          open = excluded.open,
          high = excluded.high,
          low = excluded.low,
          close = excluded.close,
          adj_close = excluded.adj_close,
          volume = excluded.volume,
          source = excluded.source
      `);

      const transaction = db.transaction((rows: Bar[]) => {
        for (const bar of rows) {
          insert.run(bar);
        }
      });

      transaction(bars);
    },

    replaceAnnotations(symbol: string, timeframe: Timeframe, annotations: ChartAnnotation[]) {
      const remove = db.prepare("DELETE FROM annotations WHERE symbol = ? AND timeframe = ?");
      const insert = db.prepare(`
        INSERT INTO annotations (
          id, symbol, timeframe, family, type, label, start_date, end_date,
          price_min, price_max, invalidation_price, status, evidence_json,
          confidence, quality_score, quality, phase, conflicts_json, meta_json
        )
        VALUES (
          @id, @symbol, @timeframe, @family, @type, @label, @startDate, @endDate,
          @priceMin, @priceMax, @invalidationPrice, @status, @evidenceJson,
          @confidence, @qualityScore, @quality, @phase, @conflictsJson, @metaJson
        )
      `);

      const transaction = db.transaction(() => {
        remove.run(symbol, timeframe);
        for (const annotation of annotations) {
          insert.run({
            ...annotation,
            confidence: annotation.confidence ?? null,
            qualityScore: annotation.qualityScore ?? annotation.confidence ?? null,
            quality: annotation.quality ?? null,
            phase: annotation.phase ?? null,
            evidenceJson: JSON.stringify(annotation.evidence),
            conflictsJson: JSON.stringify(annotation.conflicts ?? []),
            metaJson: annotation.meta ? JSON.stringify(annotation.meta) : null,
          });
        }
      });

      transaction();
    },

    getSymbols(filters: SymbolFilters = {}): SymbolSummary[] {
      const rows = db.prepare(`
        WITH filtered_annotations AS (
          SELECT symbol, type, start_date
          FROM annotations
          WHERE timeframe = '1d'
            AND (@family IS NULL OR family = @family)
            AND (@status IS NULL OR status = @status)
        ),
        annotation_types AS (
          SELECT symbol, GROUP_CONCAT(type, char(31)) AS annotation_types
          FROM (
            SELECT symbol, type
            FROM filtered_annotations
            ORDER BY symbol ASC, start_date ASC, type ASC
          )
          GROUP BY symbol
        ),
        bar_quality AS (
          SELECT
            symbol,
            COUNT(*) AS bar_count,
            SUM(CASE WHEN volume <= 0 THEN 1 ELSE 0 END) AS missing_volume_count,
            MAX(date) AS last_synced_at
          FROM bars
          WHERE timeframe = '1d'
          GROUP BY symbol
        ),
        latest_bars AS (
          SELECT b.symbol, b.close
          FROM bars b
          JOIN bar_quality bq
            ON b.symbol = bq.symbol
           AND b.timeframe = '1d'
           AND b.date = bq.last_synced_at
        )
        SELECT
          s.symbol,
          s.name,
          s.sector,
          s.exchange,
          s.is_active,
          s.source,
          s.last_seen_at,
          annotation_types.annotation_types,
          latest_bars.close AS last_close,
          bar_quality.last_synced_at,
          COALESCE(bar_quality.bar_count, 0) AS bar_count,
          COALESCE(bar_quality.missing_volume_count, 0) AS missing_volume_count,
          CASE WHEN watchlist.symbol IS NULL THEN 0 ELSE 1 END AS is_watchlisted,
          watchlist.note AS watchlist_note
        FROM symbols s
        LEFT JOIN annotation_types ON annotation_types.symbol = s.symbol
        LEFT JOIN bar_quality ON bar_quality.symbol = s.symbol
        LEFT JOIN latest_bars ON latest_bars.symbol = s.symbol
        LEFT JOIN watchlist ON watchlist.symbol = s.symbol
        WHERE (@query = '%%' OR s.symbol LIKE @query OR s.name LIKE @query)
          AND (@hasAnnotationFilter = 0 OR annotation_types.symbol IS NOT NULL)
        ORDER BY s.symbol ASC
      `).all(toSymbolFilterParams(filters)) as StoredSymbolSummaryRow[];

      return rows.map(toSymbolSummary);
    },

    listSymbolCodes(filters: SymbolFilters = {}): string[] {
      const rows = db.prepare(`
        SELECT s.symbol
        FROM symbols s
        WHERE (@query = '%%' OR s.symbol LIKE @query OR s.name LIKE @query)
          AND (
            @hasAnnotationFilter = 0
            OR EXISTS (
              SELECT 1
              FROM annotations a
              WHERE a.symbol = s.symbol
                AND a.timeframe = '1d'
                AND (@family IS NULL OR a.family = @family)
                AND (@status IS NULL OR a.status = @status)
            )
          )
        ORDER BY s.symbol ASC
      `).all(toSymbolFilterParams(filters)) as { symbol: string }[];

      return rows.map((row) => row.symbol);
    },

    getBars(symbol: string, timeframe: Timeframe): Bar[] {
      const rows = db.prepare(`
        SELECT * FROM bars WHERE symbol = ? AND timeframe = ? ORDER BY date ASC
      `).all(symbol, timeframe) as StoredBar[];
      return rows.map(toBar);
    },

    getAnnotations(symbol: string, timeframe: Timeframe): ChartAnnotation[] {
      const rows = db.prepare(`
        SELECT * FROM annotations WHERE symbol = ? AND timeframe = ? ORDER BY start_date ASC, type ASC
      `).all(symbol, timeframe) as StoredAnnotation[];
      return rows.map(toAnnotation);
    },

    getChart(symbol: string, timeframe: Timeframe): ChartPayload {
      const bars = this.getBars(symbol, timeframe);
      return {
        symbol,
        timeframe,
        bars,
        annotations: this.getAnnotations(symbol, timeframe),
        dataQuality: assessDataQuality(bars),
      };
    },

    getBestExamples(limit = 12, timeframe: Timeframe = "1d"): BestExample[] {
      const rows = db.prepare(`
        WITH ranked AS (
          SELECT
            a.symbol,
            s.name,
            s.sector,
            a.timeframe,
            a.family,
            a.type,
            a.end_date,
            COALESCE(a.quality_score, a.confidence, 0) AS score,
            COALESCE(a.quality, 'weak') AS quality,
            CASE a.status WHEN 'confirmed' THEN 0.08 ELSE 0 END AS status_bonus
          FROM annotations a
          JOIN symbols s ON s.symbol = a.symbol
          WHERE a.timeframe = @timeframe
            AND a.status IN ('candidate', 'confirmed')
            AND COALESCE(a.quality, 'weak') IN ('plausible', 'strong')
            AND a.type NOT IN ('Trading Range', 'Fib Guide', 'No Valid Range', 'Insufficient Data')
        ),
        grouped AS (
          SELECT
            symbol,
            name,
            sector,
            timeframe,
            MAX(score + status_bonus) AS score,
            MAX(CASE quality WHEN 'strong' THEN 2 WHEN 'plausible' THEN 1 ELSE 0 END) AS quality_rank,
            GROUP_CONCAT(DISTINCT family) AS families,
            GROUP_CONCAT(DISTINCT type) AS annotation_types,
            MAX(end_date) AS last_annotation_date
          FROM ranked
          GROUP BY symbol, name, sector, timeframe
        )
        SELECT *
        FROM grouped
        ORDER BY score DESC, quality_rank DESC, last_annotation_date DESC, symbol ASC
        LIMIT @limit
      `).all({ timeframe, limit: Math.max(1, Math.min(50, limit)) }) as StoredBestExample[];

      return rows.map(toBestExample);
    },

    createSyncRun(run: SyncRun) {
      db.prepare(`
        INSERT INTO sync_runs (
          id, started_at, finished_at, status, total_symbols, success_count, skipped_count, failed_count, error_json
        )
        VALUES (
          @id, @startedAt, @finishedAt, @status, @totalSymbols, @successCount, @skippedCount, @failedCount, @errorJson
        )
      `).run({ ...run, skippedCount: run.skippedCount ?? 0, errorJson: JSON.stringify(run.error ?? null) });
    },

    updateSyncRun(run: SyncRun) {
      db.prepare(`
        UPDATE sync_runs SET
          finished_at = @finishedAt,
          status = @status,
          total_symbols = @totalSymbols,
          success_count = @successCount,
          skipped_count = @skippedCount,
          failed_count = @failedCount,
          error_json = @errorJson
        WHERE id = @id
      `).run({ ...run, skippedCount: run.skippedCount ?? 0, errorJson: JSON.stringify(run.error ?? null) });
    },

    upsertSyncSymbolStatus(status: SyncSymbolStatus) {
      db.prepare(`
        INSERT INTO sync_symbol_status (
          run_id, symbol, status, attempts, started_at, finished_at, error_json, bars_count, last_bar_date
        )
        VALUES (
          @runId, @symbol, @status, @attempts, @startedAt, @finishedAt, @errorJson, @barsCount, @lastBarDate
        )
        ON CONFLICT(run_id, symbol) DO UPDATE SET
          status = excluded.status,
          attempts = excluded.attempts,
          started_at = excluded.started_at,
          finished_at = excluded.finished_at,
          error_json = excluded.error_json,
          bars_count = excluded.bars_count,
          last_bar_date = excluded.last_bar_date
      `).run({ ...status, errorJson: JSON.stringify(status.error ?? null) });
    },

    getSyncSymbolStatuses(runId: string): SyncSymbolStatus[] {
      const rows = db.prepare(`
        SELECT * FROM sync_symbol_status WHERE run_id = ? ORDER BY symbol ASC
      `).all(runId) as StoredSyncSymbolStatus[];
      return rows.map(toSyncSymbolStatus);
    },

    getLatestSyncRun(): SyncRun | null {
      const row = db.prepare(`
        SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 1
      `).get() as StoredSyncRun | undefined;
      return row ? toSyncRun(row) : null;
    },

    upsertWatchlistItem(item: WatchlistItem) {
      db.prepare(`
        INSERT INTO watchlist (symbol, note, tags_json, created_at, updated_at)
        VALUES (@symbol, @note, @tagsJson, @createdAt, @updatedAt)
        ON CONFLICT(symbol) DO UPDATE SET
          note = excluded.note,
          tags_json = excluded.tags_json,
          updated_at = excluded.updated_at
      `).run({ ...item, tagsJson: JSON.stringify(item.tags) });
    },

    removeWatchlistItem(symbol: string) {
      db.prepare("DELETE FROM watchlist WHERE symbol = ?").run(symbol);
    },

    getWatchlist(): WatchlistItem[] {
      const rows = db.prepare(`
        SELECT * FROM watchlist ORDER BY updated_at DESC, symbol ASC
      `).all() as StoredWatchlistItem[];
      return rows.map(toWatchlistItem);
    },

    getWatchlistItem(symbol: string): WatchlistItem | null {
      const row = db.prepare(`
        SELECT * FROM watchlist WHERE symbol = ?
      `).get(symbol) as StoredWatchlistItem | undefined;
      return row ? toWatchlistItem(row) : null;
    },

    close() {
      db.close();
    },
  };
}

let singleton: MarketStore | null = null;

export function getMarketStore(): MarketStore {
  singleton ??= createMarketStore();
  return singleton;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS symbols (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sector TEXT NOT NULL,
      exchange TEXT NOT NULL,
      is_active INTEGER NOT NULL,
      source TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bars (
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      adj_close REAL NOT NULL,
      volume REAL NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (symbol, timeframe, date)
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      family TEXT NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      price_min REAL NOT NULL,
      price_max REAL NOT NULL,
      invalidation_price REAL,
      status TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      confidence REAL,
      quality_score REAL,
      quality TEXT,
      phase TEXT,
      conflicts_json TEXT NOT NULL DEFAULT '[]',
      meta_json TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      total_symbols INTEGER NOT NULL,
      success_count INTEGER NOT NULL,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL,
      error_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_symbol_status (
      run_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      error_json TEXT NOT NULL,
      bars_count INTEGER NOT NULL,
      last_bar_date TEXT,
      PRIMARY KEY (run_id, symbol)
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      symbol TEXT PRIMARY KEY,
      note TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bars_timeframe_symbol_date
      ON bars (timeframe, symbol, date);

    CREATE INDEX IF NOT EXISTS idx_annotations_timeframe_symbol_filters
      ON annotations (timeframe, symbol, family, status, start_date, type);
  `);

  ensureColumn(db, "annotations", "confidence", "REAL");
  ensureColumn(db, "annotations", "quality_score", "REAL");
  ensureColumn(db, "annotations", "quality", "TEXT");
  ensureColumn(db, "annotations", "phase", "TEXT");
  ensureColumn(db, "annotations", "conflicts_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "annotations", "meta_json", "TEXT");
  ensureColumn(db, "sync_runs", "skipped_count", "INTEGER NOT NULL DEFAULT 0");
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

type StoredSymbol = {
  symbol: string;
  name: string;
  sector: string;
  exchange: "IDX";
  is_active: number;
  source: string;
  last_seen_at: string;
};

type StoredBar = {
  symbol: string;
  timeframe: Timeframe;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close: number;
  volume: number;
  source: string;
};

type StoredAnnotation = {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  family: ChartAnnotation["family"];
  type: string;
  label: string;
  start_date: string;
  end_date: string;
  price_min: number;
  price_max: number;
  invalidation_price: number | null;
  status: ChartAnnotation["status"];
  evidence_json: string;
  confidence: number | null;
  quality_score: number | null;
  quality: ChartAnnotation["quality"] | null;
  phase: string | null;
  conflicts_json: string;
  meta_json: string | null;
};

type StoredBestExample = {
  symbol: string;
  name: string;
  sector: string;
  timeframe: Timeframe;
  score: number;
  quality_rank: number;
  annotation_types: string | null;
  families: string | null;
  last_annotation_date: string | null;
};

type StoredSyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: SyncRun["status"];
  total_symbols: number;
  success_count: number;
  skipped_count: number;
  failed_count: number;
  error_json: string;
};

type StoredSyncSymbolStatus = {
  run_id: string;
  symbol: string;
  status: SyncSymbolStatus["status"];
  attempts: number;
  started_at: string;
  finished_at: string | null;
  error_json: string;
  bars_count: number;
  last_bar_date: string | null;
};

type StoredWatchlistItem = {
  symbol: string;
  note: string;
  tags_json: string;
  created_at: string;
  updated_at: string;
};

type StoredSymbolSummaryRow = StoredSymbol & {
  annotation_types: string | null;
  last_close: number | null;
  last_synced_at: string | null;
  bar_count: number;
  missing_volume_count: number;
  is_watchlisted: number;
  watchlist_note: string | null;
};

function toSymbolFilterParams(filters: SymbolFilters) {
  const hasAnnotationFilter = Boolean(filters.family || filters.status);
  return {
    query: `%${filters.query ?? ""}%`,
    family: filters.family ?? null,
    status: filters.status ?? null,
    hasAnnotationFilter: hasAnnotationFilter ? 1 : 0,
  };
}

function toSymbolSummary(row: StoredSymbolSummaryRow): SymbolSummary {
  const barCount = row.bar_count;
  const hasMissingVolume = row.missing_volume_count > 0;
  const reasons: string[] = [];
  const status: SymbolSummary["dataQuality"]["status"] = barCount < 180
    ? "insufficient_data"
    : hasMissingVolume
      ? "missing_volume"
      : "ok";

  if (barCount < 180) {
    reasons.push("fewer than 180 daily bars");
  }

  if (hasMissingVolume) {
    reasons.push("one or more bars are missing volume");
  }

  return {
    symbol: row.symbol,
    name: row.name,
    sector: row.sector,
    exchange: row.exchange,
    isActive: Boolean(row.is_active),
    source: row.source,
    lastSeenAt: row.last_seen_at,
    latestAnnotations: row.annotation_types?.split(ANNOTATION_DELIMITER) ?? [],
    lastClose: row.last_close,
    lastSyncedAt: row.last_synced_at,
    dataQuality: {
      status,
      reasons,
      barCount,
      lastBarDate: row.last_synced_at,
    },
    isWatchlisted: Boolean(row.is_watchlisted),
    watchlistNote: row.watchlist_note,
  };
}

function toBar(row: StoredBar): Bar {
  return {
    symbol: row.symbol,
    timeframe: row.timeframe,
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    adjClose: row.adj_close,
    volume: row.volume,
    source: row.source,
  };
}

function toAnnotation(row: StoredAnnotation): ChartAnnotation {
  return {
    id: row.id,
    symbol: row.symbol,
    timeframe: row.timeframe,
    family: row.family,
    type: row.type,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    priceMin: row.price_min,
    priceMax: row.price_max,
    invalidationPrice: row.invalidation_price,
    status: row.status,
    evidence: JSON.parse(row.evidence_json) as string[],
    confidence: row.confidence ?? undefined,
    qualityScore: row.quality_score ?? undefined,
    quality: row.quality ?? undefined,
    phase: row.phase,
    conflicts: JSON.parse(row.conflicts_json || "[]") as string[],
    meta: row.meta_json ? JSON.parse(row.meta_json) as Record<string, unknown> : undefined,
  };
}

function toBestExample(row: StoredBestExample): BestExample {
  const quality: BestExample["quality"] = row.quality_rank >= 2 ? "strong" : "plausible";
  const score = Math.max(0, Math.min(1, Number(row.score.toFixed(2))));
  return {
    symbol: row.symbol,
    name: row.name,
    sector: row.sector,
    timeframe: row.timeframe,
    score,
    quality,
    annotationTypes: row.annotation_types?.split(",").filter(Boolean) ?? [],
    families: row.families?.split(",").filter((family): family is BestExample["families"][number] =>
      family === "wyckoff" || family === "elliott" || family === "structure" || family === "pva",
    ) ?? [],
    lastAnnotationDate: row.last_annotation_date,
  };
}

function toSyncRun(row: StoredSyncRun): SyncRun {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    totalSymbols: row.total_symbols,
    successCount: row.success_count,
    skippedCount: row.skipped_count,
    failedCount: row.failed_count,
    error: JSON.parse(row.error_json),
  };
}

function toSyncSymbolStatus(row: StoredSyncSymbolStatus): SyncSymbolStatus {
  return {
    runId: row.run_id,
    symbol: row.symbol,
    status: row.status,
    attempts: row.attempts,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    error: JSON.parse(row.error_json),
    barsCount: row.bars_count,
    lastBarDate: row.last_bar_date,
  };
}

function toWatchlistItem(row: StoredWatchlistItem): WatchlistItem {
  return {
    symbol: row.symbol,
    note: row.note,
    tags: JSON.parse(row.tags_json) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
