export type Timeframe = "1d" | "1w";

export type AnnotationFamily = "wyckoff" | "elliott" | "structure" | "pva";

export type AnnotationStatus =
  | "candidate"
  | "confirmed"
  | "invalidated"
  | "insufficient_data";

export type AnalysisMode = "strict" | "loose";

export type AnnotationQuality = "weak" | "plausible" | "strong";

export type Bar = {
  symbol: string;
  timeframe: Timeframe;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  source: string;
};

export type SwingPoint = {
  kind: "high" | "low";
  index: number;
  date: string;
  price: number;
};

export type ChartAnnotation = {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  family: AnnotationFamily;
  type: string;
  label: string;
  startDate: string;
  endDate: string;
  priceMin: number;
  priceMax: number;
  invalidationPrice: number | null;
  status: AnnotationStatus;
  evidence: string[];
  confidence?: number;
  qualityScore?: number;
  quality?: AnnotationQuality;
  phase?: string | null;
  conflicts?: string[];
  meta?: Record<string, unknown>;
};

export type SymbolRecord = {
  symbol: string;
  name: string;
  sector: string;
  exchange: "IDX";
  isActive: boolean;
  source: string;
  lastSeenAt: string;
};

export type SymbolSummary = SymbolRecord & {
  latestAnnotations: string[];
  lastClose: number | null;
  lastSyncedAt: string | null;
  dataQuality: DataQuality;
  isWatchlisted: boolean;
  watchlistNote: string | null;
};

export type BestExample = {
  symbol: string;
  name: string;
  sector: string;
  timeframe: Timeframe;
  score: number;
  quality: AnnotationQuality;
  annotationTypes: string[];
  families: AnnotationFamily[];
  lastAnnotationDate: string | null;
};

export type DataQuality = {
  status: "ok" | "stale" | "insufficient_data" | "missing_volume";
  reasons: string[];
  barCount: number;
  lastBarDate: string | null;
};

export type SyncRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "idle" | "running" | "completed" | "failed";
  totalSymbols: number;
  successCount: number;
  skippedCount?: number;
  failedCount: number;
  error: unknown;
};

export type SyncSymbolStatus = {
  runId: string;
  symbol: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  attempts: number;
  startedAt: string;
  finishedAt: string | null;
  error: unknown;
  barsCount: number;
  lastBarDate: string | null;
};

export type WatchlistItem = {
  symbol: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type BacktestOutcome = {
  annotationId: string;
  symbol: string;
  timeframe: Timeframe;
  family: AnnotationFamily;
  eventType: string;
  eventDate: string;
  horizonBars: number;
  startClose: number;
  endClose: number | null;
  returnPct: number | null;
  status: "complete" | "pending";
};

export type ChartPayload = {
  symbol: string;
  timeframe: Timeframe;
  bars: Bar[];
  annotations: ChartAnnotation[];
  dataQuality: DataQuality;
};
