import {
  averageTrueRange,
  candleSpread,
  closeLocationValue,
  volumeSma,
} from "@/lib/analysis/indicators";
import type { AnalysisMode, AnnotationQuality, Bar, ChartAnnotation } from "@/lib/market/types";

export type WyckoffOptions = {
  mode?: AnalysisMode;
};

type CandidateBar = {
  bar: Bar;
  index: number;
};

type RangeContext = {
  support: number;
  resistance: number;
  confidence: number;
  evidence: string[];
  conflicts: string[];
  startIndex: number;
  endIndex: number;
};

export function detectWyckoff(bars: Bar[], options: WyckoffOptions = {}): ChartAnnotation[] {
  const mode = options.mode ?? "strict";
  if (bars.length < 8) {
    return insufficient("unknown", bars);
  }

  const range = detectTradingRange(bars, mode);
  if (mode === "strict" && !range) {
    return noValidRange(bars);
  }

  const eventBars = range && mode === "strict"
    ? bars.slice(range.startIndex, range.endIndex + 1)
    : bars;
  const bias = detectWyckoffBias(bars, range, eventBars);
  const events = bias === "accumulation"
    ? detectAccumulation(eventBars, range, mode)
    : detectDistribution(eventBars, range, mode);

  return range ? [rangeAnnotation(bars, range), ...events] : events;
}

function detectAccumulation(bars: Bar[], range: RangeContext | null, mode: AnalysisMode): ChartAnnotation[] {
  const sc = firstClimacticBar(bars, "down");
  if (!sc) {
    return mode === "strict" ? [] : insufficient(bars[0].symbol, bars);
  }

  const ps = preliminarySupportBefore(bars, sc.index);
  const ar = maxAfter(bars, sc.index + 1, Math.min(sc.index + 4, bars.length - 1));
  const st = nearSupportAfter(bars, sc.index + 1, sc.bar.low, sc.bar.volume);
  const spring = bars
    .map((bar, index) => ({ bar, index }))
    .find(({ bar, index }) => index > sc.index + 2 && bar.low < sc.bar.low && closeLocationValue(bar) > 0.35);
  const test = spring
    ? springTestAfter(bars, spring, sc.bar.low)
    : undefined;
  const sos = spring
    ? bars.map((bar, index) => ({ bar, index })).find(({ bar, index }) => index > spring.index && bar.close > ar.bar.high)
    : undefined;
  const lps = sos
    ? bars.map((bar, index) => ({ bar, index })).find(({ bar, index }) => index > sos.index && bar.close >= ar.bar.high * 0.98)
    : undefined;
  const phaseE = sos
    ? bars.map((bar, index) => ({ bar, index })).find(({ bar, index }) => index > sos.index && bar.close > ar.bar.high)
    : undefined;

  return [
    ps
      ? annotation(ps, "PS", "Preliminary Support", "A", "candidate", ps.bar.low, ar.bar.high, range, [
        "decline began to meet support before the climactic low",
        "volume expanded compared with the prior bar",
      ], bars, mode)
      : null,
    annotation(sc, "SC", "Climactic Low", "A", eventStatus(sc, "SC", bars, mode), sc.bar.low, ar.bar.high, range, [
      "prior decline into wide spread and high volume",
      "close recovered from the low, showing effort/result tension",
    ], bars, mode),
    annotation(ar, "AR", "Automatic Rally", "A", eventStatus(ar, "AR", bars, mode), sc.bar.low, ar.bar.high, range, [
      "rally defines the upper edge of the trading range",
    ], bars, mode),
    st
      ? annotation(st, "ST", "Secondary Test", "B", eventStatus(st, "ST", bars, mode), sc.bar.low, ar.bar.high, range, [
        "retest near support with lower volume than the climactic bar",
      ], bars, mode)
      : null,
    spring
      ? annotation(spring, "Spring", "Spring", "C", eventStatus(spring, "Spring", bars, mode), spring.bar.low, ar.bar.high, range, [
        "temporary support breach followed by recovery into the range",
      ], bars, mode)
      : null,
    test
      ? annotation(test, "Test", "Spring Test", "C", eventStatus(test, "Test", bars, mode), test.bar.low, ar.bar.high, range, [
        "support was tested after the Spring on lower volume",
      ], bars, mode)
      : null,
    sos
      ? annotation(sos, "SOS", "Sign of Strength", "D", eventStatus(sos, "SOS", bars, mode), sc.bar.low, sos.bar.high, range, [
        "close exceeded the range high after the Spring/Test area",
      ], bars, mode)
      : null,
    lps
      ? annotation(lps, "LPS", "Last Point of Support", "D", eventStatus(lps, "LPS", bars, mode), lps.bar.low, sos?.bar.high ?? ar.bar.high, range, [
        "pullback held near the prior resistance/support area after strength",
      ], bars, mode)
      : null,
    phaseE
      ? annotation(phaseE, "Phase E", "Phase E Markup", "E", eventStatus(phaseE, "Phase E", bars, mode), sc.bar.low, phaseE.bar.high, range, [
        "price held above the range high after signs of strength",
      ], bars, mode)
      : null,
  ].filter((item): item is ChartAnnotation => item !== null);
}

function detectDistribution(bars: Bar[], range: RangeContext | null, mode: AnalysisMode): ChartAnnotation[] {
  const bc = firstClimacticBar(bars, "up");
  if (!bc) {
    return mode === "strict" ? [] : insufficient(bars[0].symbol, bars);
  }

  const psy = preliminarySupplyBefore(bars, bc.index);
  const ar = minAfter(bars, bc.index + 1, Math.min(bc.index + 4, bars.length - 1));
  const st = nearResistanceAfter(bars, bc.index + 1, bc.bar.high, bc.bar.volume);
  const ut = upthrustBeforeDistribution(bars, bc);
  const utad = bars
    .map((bar, index) => ({ bar, index }))
    .find(({ bar, index }) => index > bc.index + 2 && bar.high > bc.bar.high && closeLocationValue(bar) < 0.65);
  const sow = utad
    ? bars.map((bar, index) => ({ bar, index })).find(({ bar, index }) => index > utad.index && bar.close < ar.bar.low)
    : undefined;
  const lpsy = sow && utad
    ? bars.map((bar, index) => ({ bar, index })).find(({ bar, index }) => index > utad.index && index < sow.index && bar.high <= bc.bar.high)
    : undefined;
  const phaseE = sow
    ? bars.map((bar, index) => ({ bar, index })).find(({ bar, index }) => index >= sow.index && bar.close < ar.bar.low)
    : undefined;

  return [
    psy
      ? annotation(psy, "PSY", "Preliminary Supply", "A", "candidate", ar.bar.low, psy.bar.high, range, [
        "advance began to meet supply before the climactic high",
        "volume expanded compared with the prior bar",
      ], bars, mode)
      : null,
    annotation(bc, "BC", "Climactic High", "A", eventStatus(bc, "BC", bars, mode), ar.bar.low, bc.bar.high, range, [
      "prior advance into wide spread and high volume",
      "supply appeared near the top of the range",
    ], bars, mode),
    annotation(ar, "AR", "Automatic Reaction", "A", eventStatus(ar, "AR", bars, mode), ar.bar.low, bc.bar.high, range, [
      "reaction defines the lower edge of the trading range",
    ], bars, mode),
    st
      ? annotation(st, "ST", "Secondary Test", "B", eventStatus(st, "ST", bars, mode), ar.bar.low, bc.bar.high, range, [
        "retest near resistance with lower volume than the climactic bar",
      ], bars, mode)
      : null,
    ut
      ? annotation(ut, "UT", "Upthrust", "B", eventStatus(ut, "UT", bars, mode), ar.bar.low, ut.bar.high, range, [
        "resistance was tested on lower volume before the later upthrust area",
      ], bars, mode)
      : null,
    utad
      ? annotation(utad, "UTAD", "Upthrust After Distribution", "C", eventStatus(utad, "UTAD", bars, mode), ar.bar.low, utad.bar.high, range, [
        "temporary resistance breach failed back into the range",
      ], bars, mode)
      : null,
    sow
      ? annotation(sow, "SOW", "Sign of Weakness", "D", eventStatus(sow, "SOW", bars, mode), sow.bar.low, bc.bar.high, range, [
        "close broke below the range low after the upthrust area",
      ], bars, mode)
      : null,
    lpsy
      ? annotation(lpsy, "LPSY", "Last Point of Supply", "D", eventStatus(lpsy, "LPSY", bars, mode), sow?.bar.low ?? ar.bar.low, lpsy.bar.high, range, [
        "weak rebound after downside range break",
      ], bars, mode)
      : null,
    phaseE
      ? annotation(phaseE, "Phase E", "Phase E Markdown", "E", eventStatus(phaseE, "Phase E", bars, mode), phaseE.bar.low, bc.bar.high, range, [
        "price stayed below the range low after signs of weakness",
      ], bars, mode)
      : null,
  ].filter((item): item is ChartAnnotation => item !== null);
}

function detectTradingRange(bars: Bar[], mode: AnalysisMode): RangeContext | null {
  const startIndex = Math.max(0, bars.length - 180);
  const window = bars.slice(Math.max(0, bars.length - 180));
  const support = Math.min(...window.map((bar) => bar.low));
  const resistance = Math.max(...window.map((bar) => bar.high));
  const rangeHeight = resistance - support;
  const midpoint = (support + resistance) / 2;
  const widthPct = midpoint === 0 ? 0 : (resistance - support) / midpoint;
  const supportTouches = window.filter((bar) => bar.low <= support * 1.08).length;
  const resistanceTouches = window.filter((bar) => bar.high >= resistance * 0.92).length;
  const directionalProgress = Math.abs(window.at(-1)!.close - window[0].close) / Math.max(1, rangeHeight);
  const maxWidthPct = mode === "strict" ? 0.55 : 0.65;
  const minSupportTouches = window.length < 20 ? 1 : mode === "strict" ? 3 : 2;
  const bounded = widthPct <= maxWidthPct && supportTouches >= minSupportTouches && resistanceTouches >= 2;
  const containedProgress = directionalProgress <= (mode === "strict" ? 0.6 : 0.7);
  const evidence = [
    `range width ${Math.round(widthPct * 100)}% over ${window.length} bars`,
    `${supportTouches} support tests and ${resistanceTouches} resistance tests`,
    `directional progress is ${Math.round(directionalProgress * 100)}% of range height`,
  ];
  const conflicts = [
    supportTouches < minSupportTouches ? "range has fewer than required support tests" : null,
    resistanceTouches < 2 ? "range has fewer than two resistance tests" : null,
    widthPct > maxWidthPct ? "range width is wide for a compact trading range" : null,
    directionalProgress > (mode === "strict" ? 0.6 : 0.7) ? "directional progress is too strong for a bounded range" : null,
  ].filter((item): item is string => item !== null);

  if (!bounded || !containedProgress) {
    return null;
  }

  return {
    support,
    resistance,
    confidence: clamp(
      0.46
      + Math.min(4, supportTouches) * 0.05
      + Math.min(4, resistanceTouches) * 0.05
      + (directionalProgress < 0.5 ? 0.08 : 0)
      - conflicts.length * 0.04,
    ),
    evidence,
    conflicts,
    startIndex,
    endIndex: bars.length - 1,
  };
}

function rangeAnnotation(bars: Bar[], range: RangeContext): ChartAnnotation {
  const first = bars[range.startIndex] ?? bars[0];
  const last = bars.at(-1)!;
  return {
    id: `${last.symbol}-${last.timeframe}-wyckoff-range-${first.date}-${last.date}`,
    symbol: last.symbol,
    timeframe: last.timeframe,
    family: "wyckoff",
    type: "Trading Range",
    label: "Phase B Trading Range",
    startDate: first.date,
    endDate: last.date,
    priceMin: range.support,
    priceMax: range.resistance,
    invalidationPrice: null,
    status: "candidate",
    evidence: range.evidence,
    confidence: range.confidence,
    phase: "B",
    conflicts: range.conflicts,
    qualityScore: range.confidence,
    quality: qualityFromScore(range.confidence),
    meta: { analysisMode: "strict-range-gated" },
  };
}

function firstClimacticBar(bars: Bar[], direction: "up" | "down"): CandidateBar | null {
  const avgVolume = volumeSma(bars, Math.min(10, bars.length));
  const atr = averageTrueRange(bars, Math.min(10, bars.length));

  for (let index = 1; index < bars.length; index += 1) {
    const bar = bars[index];
    const previous = bars[index - 1];
    const directional = direction === "down" ? bar.close < previous.close : bar.close > previous.close;
    const highEffort = bar.volume >= avgVolume * 1.35 || candleSpread(bar) >= atr * 1.25;

    if (directional && highEffort) {
      return { bar, index };
    }
  }

  return null;
}

function maxAfter(bars: Bar[], start: number, end: number): CandidateBar {
  return bars
    .map((bar, index) => ({ bar, index }))
    .slice(start, end + 1)
    .reduce((best, candidate) => (candidate.bar.high > best.bar.high ? candidate : best));
}

function minAfter(bars: Bar[], start: number, end: number): CandidateBar {
  return bars
    .map((bar, index) => ({ bar, index }))
    .slice(start, end + 1)
    .reduce((best, candidate) => (candidate.bar.low < best.bar.low ? candidate : best));
}

function nearSupportAfter(bars: Bar[], start: number, support: number, climaxVolume: number): CandidateBar | null {
  return bars
    .map((bar, index) => ({ bar, index }))
    .find(({ bar, index }) => index >= start && bar.low <= support * 1.12 && bar.volume < climaxVolume) ?? null;
}

function nearResistanceAfter(bars: Bar[], start: number, resistance: number, climaxVolume: number): CandidateBar | null {
  return bars
    .map((bar, index) => ({ bar, index }))
    .find(({ bar, index }) => index >= start && bar.high >= resistance * 0.94 && bar.volume < climaxVolume) ?? null;
}

function preliminarySupportBefore(bars: Bar[], climaxIndex: number): CandidateBar | null {
  return bars
    .map((bar, index) => ({ bar, index }))
    .slice(1, climaxIndex)
    .find(({ bar, index }) => bar.close < bars[index - 1].close && bar.volume > bars[index - 1].volume) ?? null;
}

function preliminarySupplyBefore(bars: Bar[], climaxIndex: number): CandidateBar | null {
  return bars
    .map((bar, index) => ({ bar, index }))
    .slice(1, climaxIndex)
    .find(({ bar, index }) => bar.close > bars[index - 1].close && bar.volume > bars[index - 1].volume) ?? null;
}

function springTestAfter(bars: Bar[], spring: CandidateBar, support: number): CandidateBar | null {
  return bars
    .map((bar, index) => ({ bar, index }))
    .find(({ bar, index }) =>
      index > spring.index
      && bar.low <= support * 1.12
      && bar.volume < spring.bar.volume
      && closeLocationValue(bar) > 0.35,
    ) ?? null;
}

function upthrustBeforeDistribution(bars: Bar[], buyingClimax: CandidateBar): CandidateBar | null {
  return bars
    .map((bar, index) => ({ bar, index }))
    .find(({ bar, index }) =>
      index > buyingClimax.index + 1
      && bar.high >= buyingClimax.bar.high * 0.97
      && bar.high <= buyingClimax.bar.high
      && bar.volume < buyingClimax.bar.volume
      && closeLocationValue(bar) < 0.75,
    ) ?? null;
}

function annotation(
  candidate: CandidateBar,
  type: string,
  label: string,
  phase: string,
  status: ChartAnnotation["status"],
  priceMin: number,
  priceMax: number,
  range: RangeContext | null,
  evidence: string[],
  bars: Bar[],
  mode: AnalysisMode,
): ChartAnnotation {
  const { bar } = candidate;
  const upwardInvalidation = new Set(["PS", "SC", "Spring", "Test", "SOS", "LPS"]);
  const invalidationPrice = upwardInvalidation.has(type) ? priceMin : priceMax;
  const qualityScore = scoreWyckoffEvent(evidence, range, candidate, bars, mode, status);
  const quality = qualityFromScore(qualityScore);
  return {
    id: `${bar.symbol}-${bar.timeframe}-wyckoff-${type}-${bar.date}`,
    symbol: bar.symbol,
    timeframe: bar.timeframe,
    family: "wyckoff",
    type,
    label,
    startDate: bar.date,
    endDate: bar.date,
    priceMin,
    priceMax,
    invalidationPrice,
    status,
    evidence,
    confidence: qualityScore,
    qualityScore,
    quality,
    phase,
    conflicts: range?.conflicts ?? [],
    meta: { analysisMode: mode },
  };
}

function insufficient(symbol: string, bars: Bar[]): ChartAnnotation[] {
  const last = bars.at(-1);
  return [{
    id: `${symbol || "unknown"}-${last?.timeframe ?? "1d"}-wyckoff-insufficient`,
    symbol: symbol || last?.symbol || "unknown",
    timeframe: last?.timeframe ?? "1d",
    family: "wyckoff",
    type: "Insufficient Data",
    label: "Insufficient Data",
    startDate: last?.date ?? "",
    endDate: last?.date ?? "",
    priceMin: last?.low ?? 0,
    priceMax: last?.high ?? 0,
    invalidationPrice: null,
    status: "insufficient_data",
    evidence: ["not enough structure to classify a Wyckoff range"],
    confidence: 0,
    qualityScore: 0,
    quality: "weak",
    phase: null,
    conflicts: ["fewer than eight bars are available"],
  }];
}

function noValidRange(bars: Bar[]): ChartAnnotation[] {
  const last = bars.at(-1);
  return [{
    id: `${last?.symbol ?? "unknown"}-${last?.timeframe ?? "1d"}-wyckoff-no-valid-range-${last?.date ?? "unknown"}`,
    symbol: last?.symbol ?? "unknown",
    timeframe: last?.timeframe ?? "1d",
    family: "wyckoff",
    type: "No Valid Range",
    label: "No Valid Wyckoff Range",
    startDate: last?.date ?? "",
    endDate: last?.date ?? "",
    priceMin: last?.low ?? 0,
    priceMax: last?.high ?? 0,
    invalidationPrice: null,
    status: "insufficient_data",
    evidence: ["strict mode requires a bounded trading range before event labels are emitted"],
    confidence: 0,
    qualityScore: 0,
    quality: "weak",
    phase: null,
    conflicts: ["no range met width, touch, and directional-progress requirements"],
    meta: { analysisMode: "strict" },
  }];
}

function detectWyckoffBias(
  allBars: Bar[],
  range: RangeContext | null,
  eventBars: Bar[],
): "accumulation" | "distribution" {
  const rangeStart = range?.startIndex ?? 0;
  const lookbackStart = Math.max(0, rangeStart - 30);
  const beforeRange = allBars.slice(lookbackStart, rangeStart);
  const context = beforeRange.length >= 2 ? beforeRange : eventBars.slice(0, Math.min(8, eventBars.length));
  const first = context[0]?.close ?? eventBars[0]?.close ?? 0;
  const last = context.at(-1)?.close ?? eventBars.at(-1)?.close ?? first;
  return last <= first ? "accumulation" : "distribution";
}

function eventStatus(
  candidate: CandidateBar,
  type: string,
  bars: Bar[],
  mode: AnalysisMode,
): ChartAnnotation["status"] {
  if (mode === "loose") {
    return "candidate";
  }

  const confirmingEvents = new Set(["SOS", "LPS", "SOW", "LPSY", "Phase E"]);
  if (!confirmingEvents.has(type)) {
    return "candidate";
  }

  const laterBars = bars.slice(candidate.index + 1, candidate.index + 8);
  const upEvent = ["SOS", "LPS"].includes(type) || (type === "Phase E" && bars.at(-1)!.close >= candidate.bar.close);
  const confirmed = upEvent
    ? laterBars.some((bar) => bar.close > candidate.bar.close)
    : laterBars.some((bar) => bar.close < candidate.bar.close);

  return confirmed ? "confirmed" : "candidate";
}

function scoreWyckoffEvent(
  evidence: string[],
  range: RangeContext | null,
  candidate: CandidateBar,
  bars: Bar[],
  mode: AnalysisMode,
  status: ChartAnnotation["status"],
) {
  const followThrough = status === "confirmed" ? 0.1 : 0;
  const recency = bars.length <= 1 ? 0 : candidate.index / (bars.length - 1);
  const raw = 0.32
    + evidence.length * 0.08
    + (range?.confidence ?? 0.35) * 0.34
    + (mode === "strict" ? 0.08 : 0)
    + followThrough
    + recency * 0.05
    - (range?.conflicts.length ?? 0) * 0.05;
  return clamp(raw);
}

function qualityFromScore(score: number): AnnotationQuality {
  if (score >= 0.72) {
    return "strong";
  }

  if (score >= 0.5) {
    return "plausible";
  }

  return "weak";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
