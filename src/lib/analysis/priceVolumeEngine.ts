import {
  averageTrueRange,
  candleSpread,
  closeLocationValue,
  rollingHigh,
  rollingLow,
} from "@/lib/analysis/indicators";
import type { AnalysisMode, Bar, ChartAnnotation } from "@/lib/market/types";

type PvaBias = "bullish" | "bearish" | "neutral";

type PvaEventType =
  | "Demand Expansion"
  | "Supply Expansion"
  | "Absorption"
  | "Volume Climax"
  | "Supply Dry-Up"
  | "Weak Rally"
  | "Breakout Confirmed"
  | "Breakdown Confirmed"
  | "Failed Breakout"
  | "Failed Breakdown";

type PvaCandidate = {
  type: PvaEventType;
  label: string;
  abbreviation: string;
  bias: PvaBias;
  confidence: number;
  index: number;
  bar: Bar;
  atr: number;
  relativeVolume: number;
  spreadRatio: number;
  closeLocation: number;
  evidence: string[];
};

type PvaOptions = {
  mode?: AnalysisMode;
};

const MIN_INDEX = 30;
const MAX_ANNOTATIONS = 12;
const VOLUME_LOOKBACK = 20;
const ATR_LOOKBACK = 14;
const RANGE_LOOKBACK = 20;

export function detectPriceVolume(bars: Bar[], options: PvaOptions = {}): ChartAnnotation[] {
  if (bars.length <= MIN_INDEX) {
    return [];
  }

  const candidates: PvaCandidate[] = [];
  for (let index = MIN_INDEX; index < bars.length; index += 1) {
    candidates.push(...detectBarEvents(bars, index, options.mode ?? "strict"));
  }

  return dedupeByDate(candidates)
    .sort((a, b) => a.index - b.index)
    .slice(-MAX_ANNOTATIONS)
    .map((candidate) => toAnnotation(candidate, bars));
}

function detectBarEvents(bars: Bar[], index: number, mode: AnalysisMode): PvaCandidate[] {
  const bar = bars[index];
  const previous = bars[index - 1];
  const volumeBaseline = averageVolume(bars.slice(index - VOLUME_LOOKBACK, index));
  const atr = averageTrueRange(bars.slice(index - ATR_LOOKBACK, index), ATR_LOOKBACK);
  const rangeWindow = bars.slice(index - RANGE_LOOKBACK, index);
  const priorHigh = rollingHigh(rangeWindow);
  const priorLow = rollingLow(rangeWindow);

  if (!previous || volumeBaseline <= 0 || atr <= 0 || rangeWindow.length < RANGE_LOOKBACK) {
    return [];
  }

  const spread = candleSpread(bar);
  const relativeVolume = bar.volume / volumeBaseline;
  const spreadRatio = spread / atr;
  const closeLocation = closeLocationValue(bar);
  const closeChange = Math.abs(bar.close - previous.close);
  const priorFiveReturn = previous.close - bars[index - 5].close;
  const candidates: PvaCandidate[] = [];
  const relaxed = mode === "loose" ? 0.92 : 1;

  const ctx = {
    index,
    bar,
    atr,
    relativeVolume,
    spreadRatio,
    closeLocation,
  };

  if (bar.close > previous.close && closeLocation >= 0.70 && relativeVolume >= 1.6 * relaxed && spreadRatio >= 1.1 * relaxed) {
    candidates.push(candidate(ctx, "Demand Expansion", "Demand expansion", "DX", "bullish", 0.06, [
      `relative volume ${formatRatio(relativeVolume)}x expanded above the 20-bar baseline`,
      `close location ${formatPercent(closeLocation)} finished near the upper candle range`,
      `spread ${formatRatio(spreadRatio)}x ATR showed result with effort`,
    ]));
  }

  if (bar.close < previous.close && closeLocation <= 0.30 && relativeVolume >= 1.6 * relaxed && spreadRatio >= 1.1 * relaxed) {
    candidates.push(candidate(ctx, "Supply Expansion", "Supply expansion", "SX", "bearish", 0.06, [
      `relative volume ${formatRatio(relativeVolume)}x expanded above the 20-bar baseline`,
      `close location ${formatPercent(closeLocation)} finished near the lower candle range`,
      `spread ${formatRatio(spreadRatio)}x ATR showed downside result with effort`,
    ]));
  }

  if (relativeVolume >= 1.8 * relaxed && spreadRatio <= 0.75 / relaxed && closeChange <= atr * 0.6) {
    candidates.push(candidate(ctx, "Absorption", "Effort/result absorption", "ABS", "neutral", 0.08, [
      `relative volume ${formatRatio(relativeVolume)}x appeared with compressed spread`,
      `close changed only ${formatPrice(closeChange)} against ATR ${formatPrice(atr)}`,
      "large effort produced limited price result",
    ]));
  }

  if (relativeVolume >= 2.5 * relaxed && spreadRatio >= 1.4 * relaxed) {
    const bias = closeLocation >= 0.65 ? "bullish" : closeLocation <= 0.35 ? "bearish" : "neutral";
    candidates.push(candidate(ctx, "Volume Climax", "Volume climax", "CLX", bias, 0.1, [
      `relative volume ${formatRatio(relativeVolume)}x reached a climactic level`,
      `spread ${formatRatio(spreadRatio)}x ATR showed an unusually wide bar`,
      `close location ${formatPercent(closeLocation)} defined the event bias`,
    ]));
  }

  if (relativeVolume <= 0.55 / relaxed && spreadRatio <= 0.75 / relaxed && priorFiveReturn < 0) {
    candidates.push(candidate(ctx, "Supply Dry-Up", "Supply dry-up", "VDU", "bullish", 0.04, [
      `relative volume faded to ${formatRatio(relativeVolume)}x of the 20-bar baseline`,
      `spread compressed to ${formatRatio(spreadRatio)}x ATR`,
      "the prior five bars were already in a pullback",
    ]));
  }

  if (bar.close > previous.close && relativeVolume <= 0.75 / relaxed && closeLocation < 0.65) {
    candidates.push(candidate(ctx, "Weak Rally", "Weak rally", "WR", "bearish", 0.02, [
      `price lifted while relative volume stayed at ${formatRatio(relativeVolume)}x`,
      `close location ${formatPercent(closeLocation)} did not hold the upper range`,
      "rally effort was lighter than the recent baseline",
    ]));
  }

  if (bar.close > priorHigh && relativeVolume >= 1.4 * relaxed && closeLocation >= 0.65) {
    candidates.push(candidate(ctx, "Breakout Confirmed", "Breakout confirmed", "BO", "bullish", 0.12, [
      `close finished above the prior 20-bar high ${formatPrice(priorHigh)}`,
      `relative volume ${formatRatio(relativeVolume)}x confirmed participation`,
      `close location ${formatPercent(closeLocation)} held near the upper range`,
    ]));
  }

  if (bar.close < priorLow && relativeVolume >= 1.4 * relaxed && closeLocation <= 0.35) {
    candidates.push(candidate(ctx, "Breakdown Confirmed", "Breakdown confirmed", "BD", "bearish", 0.12, [
      `close finished below the prior 20-bar low ${formatPrice(priorLow)}`,
      `relative volume ${formatRatio(relativeVolume)}x confirmed participation`,
      `close location ${formatPercent(closeLocation)} held near the lower range`,
    ]));
  }

  if (bar.high > priorHigh && bar.close <= priorHigh && relativeVolume >= 1.3 * relaxed && closeLocation <= 0.45) {
    candidates.push(candidate(ctx, "Failed Breakout", "Failed breakout", "FBO", "bearish", 0.1, [
      `high pushed above the prior 20-bar high ${formatPrice(priorHigh)}`,
      "close returned below the breakout level",
      `relative volume ${formatRatio(relativeVolume)}x made the failure visible`,
    ]));
  }

  if (bar.low < priorLow && bar.close >= priorLow && relativeVolume >= 1.3 * relaxed && closeLocation >= 0.55) {
    candidates.push(candidate(ctx, "Failed Breakdown", "Failed breakdown", "FBD", "bullish", 0.1, [
      `low pushed below the prior 20-bar low ${formatPrice(priorLow)}`,
      "close recovered above the breakdown level",
      `relative volume ${formatRatio(relativeVolume)}x made the recovery visible`,
    ]));
  }

  return candidates;
}

function candidate(
  ctx: Pick<PvaCandidate, "index" | "bar" | "atr" | "relativeVolume" | "spreadRatio" | "closeLocation">,
  type: PvaEventType,
  label: string,
  abbreviation: string,
  bias: PvaBias,
  bonus: number,
  evidence: string[],
): PvaCandidate {
  return {
    ...ctx,
    type,
    label,
    abbreviation,
    bias,
    confidence: scoreConfidence(ctx.relativeVolume, ctx.spreadRatio, ctx.closeLocation, bonus),
    evidence,
  };
}

function toAnnotation(candidate: PvaCandidate, bars: Bar[]): ChartAnnotation {
  const status = pvaStatus(candidate, bars);
  const confidence = round2(candidate.confidence);
  return {
    id: `${candidate.bar.symbol}-${candidate.bar.timeframe}-pva-${slug(candidate.type)}-${candidate.bar.date}`,
    symbol: candidate.bar.symbol,
    timeframe: candidate.bar.timeframe,
    family: "pva",
    type: candidate.type,
    label: candidate.label,
    startDate: candidate.bar.date,
    endDate: candidate.bar.date,
    priceMin: candidate.bar.low,
    priceMax: candidate.bar.high,
    invalidationPrice: candidate.bias === "bullish"
      ? candidate.bar.low
      : candidate.bias === "bearish"
        ? candidate.bar.high
        : null,
    status,
    evidence: [
      ...candidate.evidence,
      `${candidate.abbreviation} bias is ${candidate.bias}`,
    ],
    confidence,
    qualityScore: confidence,
    quality: confidence >= 0.75 ? "strong" : "plausible",
    phase: "pva",
    conflicts: [],
    meta: {
      pva: {
        relativeVolume: round2(candidate.relativeVolume),
        spreadRatio: round2(candidate.spreadRatio),
        closeLocation: round2(candidate.closeLocation),
        bias: candidate.bias,
        abbreviation: candidate.abbreviation,
      },
    },
  };
}

function pvaStatus(candidate: PvaCandidate, bars: Bar[]): ChartAnnotation["status"] {
  if (candidate.index >= bars.length - 1) {
    return "candidate";
  }

  const followBars = bars.slice(candidate.index + 1, candidate.index + 4);
  if (candidate.bias === "bullish") {
    return followBars.some((bar) => bar.close > candidate.bar.close) ? "confirmed" : "candidate";
  }

  if (candidate.bias === "bearish") {
    return followBars.some((bar) => bar.close < candidate.bar.close) ? "confirmed" : "candidate";
  }

  return followBars.some((bar) => Math.abs(bar.close - candidate.bar.close) >= candidate.atr * 0.4)
    ? "confirmed"
    : "candidate";
}

function dedupeByDate(candidates: PvaCandidate[]): PvaCandidate[] {
  const byDate = new Map<string, PvaCandidate>();
  for (const candidate of candidates) {
    const existing = byDate.get(candidate.bar.date);
    if (!existing || eventStrength(candidate) > eventStrength(existing)) {
      byDate.set(candidate.bar.date, candidate);
    }
  }

  return Array.from(byDate.values());
}

function eventStrength(candidate: PvaCandidate) {
  return candidate.confidence + eventPriority(candidate.type) / 100;
}

function eventPriority(type: PvaEventType) {
  switch (type) {
    case "Breakout Confirmed":
    case "Breakdown Confirmed":
    case "Failed Breakout":
    case "Failed Breakdown":
      return 9;
    case "Absorption":
    case "Volume Climax":
      return 8;
    case "Demand Expansion":
    case "Supply Expansion":
      return 7;
    case "Supply Dry-Up":
      return 6;
    case "Weak Rally":
      return 5;
  }
}

function scoreConfidence(relativeVolume: number, spreadRatio: number, closeLocation: number, bonus: number) {
  const volumeScore = Math.min(0.16, Math.max(0, (relativeVolume - 1) * 0.08));
  const spreadScore = Math.min(0.08, Math.abs(spreadRatio - 1) * 0.04);
  const locationScore = Math.min(0.08, Math.abs(closeLocation - 0.5) * 0.18);
  return clamp(0.58 + volumeScore + spreadScore + locationScore + bonus, 0.58, 0.95);
}

function averageVolume(bars: Bar[]) {
  if (bars.length === 0) {
    return 0;
  }

  return bars.reduce((sum, bar) => sum + bar.volume, 0) / bars.length;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function formatRatio(value: number) {
  return round2(value).toFixed(2);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatPrice(value: number) {
  return Math.round(value).toLocaleString("id-ID");
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
