"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

import { buildProjectionScenarios, type ProjectionScenario } from "@/lib/analysis/projectionEngine";
import { normalizeChartBars } from "@/lib/market/chartBars";
import type { Bar, ChartAnnotation } from "@/lib/market/types";

type StructureChartProps = {
  bars: Bar[];
  annotations: ChartAnnotation[];
  markerVisibility?: MarkerVisibility;
  fitProjection?: boolean;
  selectedProjectionId?: string | null;
};

type GuideLine = {
  key: string;
  title: string;
  price: number;
  color: string;
  lineStyle: LineStyle;
  lineWidth: 1 | 2;
  axisLabelVisible: boolean;
};

export type WaveLine = {
  key: string;
  title: string;
  color: string;
  lineStyle: LineStyle;
  lineWidth: 1 | 2;
  data: Array<{
    time: string;
    value: number;
  }>;
};

export type MarkerVisibility = {
  wyckoff: boolean;
  elliott: boolean;
  pva?: boolean;
  projection?: boolean;
};

type MarkerSpec = {
  position: "aboveBar" | "belowBar" | "inBar";
  shape: "circle" | "square" | "arrowUp" | "arrowDown";
  color: string;
};

const FIB_GUIDES = [
  { key: "retracement382", title: "Fib 38.2", color: "#475569", lineStyle: LineStyle.Dashed },
  { key: "retracement618", title: "Fib 61.8", color: "#64748b", lineStyle: LineStyle.Dotted },
  { key: "projection1618", title: "Fib 161.8", color: "#2563eb", lineStyle: LineStyle.LargeDashed },
] as const;

export const DEFAULT_MARKER_VISIBILITY: MarkerVisibility = {
  wyckoff: true,
  elliott: true,
  pva: true,
  projection: true,
};

const WYCKOFF_ACCUMULATION_LOW_EVENTS = new Set(["PS", "SC", "ST", "Spring", "Test", "LPS"]);
const WYCKOFF_ACCUMULATION_HIGH_EVENTS = new Set(["AR", "SOS"]);
const WYCKOFF_DISTRIBUTION_HIGH_EVENTS = new Set(["PSY", "BC", "UT", "UTAD", "LPSY"]);
const WYCKOFF_DISTRIBUTION_LOW_EVENTS = new Set(["AR", "SOW"]);

export function StructureChart({
  bars,
  annotations,
  markerVisibility = DEFAULT_MARKER_VISIBILITY,
  fitProjection = false,
  selectedProjectionId = null,
}: StructureChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const plotBars = useMemo(() => normalizeChartBars(bars), [bars]);

  const markers = useMemo(
    () => buildStructureMarkers(annotations, plotBars, markerVisibility),
    [annotations, markerVisibility, plotBars],
  );
  const waveLines = useMemo(
    () => buildElliottWaveLines(annotations, plotBars, markerVisibility),
    [annotations, markerVisibility, plotBars],
  );
  const projectionLines = useMemo(
    () => buildProjectionLines(annotations, plotBars, markerVisibility, selectedProjectionId),
    [annotations, markerVisibility, plotBars, selectedProjectionId],
  );

  const guideLines = useMemo<GuideLine[]>(() => {
    const visibleAnnotations = getVisibleAnnotations(annotations, plotBars)
      .filter((annotation) => isAnnotationLayerVisible(annotation, markerVisibility));
    const priceWindow = getPriceWindow(plotBars);
    const lines: GuideLine[] = [];
    const seenPrices = new Set<string>();

    const addLine = (line: GuideLine) => {
      if (!Number.isFinite(line.price)) {
        return;
      }

      if (priceWindow && !isPriceInsideWindow(line.price, priceWindow)) {
        return;
      }

      const priceKey = `${line.title}-${line.price.toFixed(4)}`;
      if (seenPrices.has(priceKey)) {
        return;
      }

      seenPrices.add(priceKey);
      lines.push(line);
    };

    const tradingRange = [...visibleAnnotations].reverse().find((annotation) =>
      annotation.family === "wyckoff" && annotation.type === "Trading Range",
    );

    if (tradingRange) {
      addLine({
        key: `range-low-${tradingRange.id}`,
        title: "Range Low",
        price: tradingRange.priceMin,
        color: "#0f766e",
        lineStyle: LineStyle.Solid,
        lineWidth: 1,
        axisLabelVisible: false,
      });
      addLine({
        key: `range-high-${tradingRange.id}`,
        title: "Range High",
        price: tradingRange.priceMax,
        color: "#0f766e",
        lineStyle: LineStyle.Solid,
        lineWidth: 1,
        axisLabelVisible: false,
      });
    }

    visibleAnnotations
      .filter((annotation) => annotation.invalidationPrice !== null)
      .slice(-4)
      .forEach((annotation) => {
        addLine({
          key: `invalidation-${annotation.id}`,
          title: `Invalidation ${annotation.type}`,
          price: annotation.invalidationPrice ?? 0,
          color: annotation.family === "wyckoff" ? "#0f766e" : "#1d4ed8",
          lineStyle: LineStyle.SparseDotted,
          lineWidth: 1,
          axisLabelVisible: true,
        });
      });

    const fibGuide = [...visibleAnnotations].reverse().find((annotation) =>
      annotation.type === "Fib Guide" || annotation.phase === "fib",
    );

    if (fibGuide?.meta) {
      FIB_GUIDES.forEach((guide) => {
        const value = fibGuide.meta?.[guide.key];
        if (typeof value !== "number") {
          return;
        }

        addLine({
          key: `${fibGuide.id}-${guide.key}`,
          title: guide.title,
          price: value,
          color: guide.color,
          lineStyle: guide.lineStyle,
          lineWidth: 1,
          axisLabelVisible: true,
        });
      });
    }

    return lines;
  }, [annotations, markerVisibility, plotBars]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#526173",
        fontFamily: "Arial, Helvetica, sans-serif",
      },
      grid: {
        vertLines: { color: "#edf1f5" },
        horzLines: { color: "#edf1f5" },
      },
      rightPriceScale: {
        borderColor: "#d7dee8",
      },
      timeScale: {
        borderColor: "#d7dee8",
        timeVisible: false,
      },
      crosshair: {
        vertLine: { color: "#8ba5c5" },
        horzLine: { color: "#8ba5c5" },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#0f9f8f",
      downColor: "#e05d5d",
      borderVisible: false,
      wickUpColor: "#0f766e",
      wickDownColor: "#b84a4a",
    }) as ISeriesApi<"Candlestick">;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
      color: "#8ba5c5",
    }) as ISeriesApi<"Histogram">;

    chart.priceScale("").applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    candleSeries.setData(plotBars.map((bar) => ({
      time: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    })));

    volumeSeries.setData(plotBars.map((bar) => ({
      time: bar.date,
      value: bar.volume,
      color: bar.close >= bar.open ? "rgba(15, 159, 143, 0.42)" : "rgba(224, 93, 93, 0.38)",
    })));

    [...waveLines, ...projectionLines].forEach((line) => {
      const lineSeries = chart.addSeries(LineSeries, {
        color: line.color,
        lineWidth: line.lineWidth,
        lineStyle: line.lineStyle,
        priceLineVisible: false,
        lastValueVisible: false,
      }) as ISeriesApi<"Line">;

      lineSeries.setData(line.data);
    });

    createSeriesMarkers(candleSeries, markers);
    guideLines.forEach((guide) => {
      candleSeries.createPriceLine({
        id: guide.key,
        price: guide.price,
        color: guide.color,
        lineWidth: guide.lineWidth,
        lineStyle: guide.lineStyle,
        axisLabelVisible: guide.axisLabelVisible,
        axisLabelColor: guide.color,
        axisLabelTextColor: "#ffffff",
        title: guide.title,
      });
    });
    if (fitProjection || projectionLines.length === 0 || plotBars.length === 0) {
      chart.timeScale().fitContent();
    } else {
      chart.timeScale().setVisibleRange({
        from: plotBars[0].date as Time,
        to: plotBars.at(-1)!.date as Time,
      });
    }
    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [fitProjection, guideLines, markers, plotBars, projectionLines, waveLines]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-white">
      {guideLines.length > 0 ? (
        <div
          aria-label="Chart guides"
          className="pointer-events-none absolute left-3 top-3 z-10 max-w-[232px] rounded-md border border-slate-200 bg-white/90 px-3 py-2 text-[11px] text-slate-600 shadow-sm"
        >
          <p className="font-bold uppercase tracking-wide text-slate-500">Chart Guides</p>
          <div className="mt-1 space-y-1">
            {guideLines.slice(0, 5).map((guide) => (
              <div key={guide.key} className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: guide.color }} />
                <span className="truncate">{guide.title}</span>
                <span className="font-semibold text-slate-800">{formatPrice(guide.price)}</span>
              </div>
            ))}
            {guideLines.length > 5 ? (
              <p className="text-slate-400">+{guideLines.length - 5} more guides</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {waveLines.length > 0 ? (
        <div aria-label="Elliott wave overlay" className="sr-only">
          Elliott wave overlay active
        </div>
      ) : null}
      {projectionLines.length > 0 ? (
        <div aria-label="Projection overlay" className="sr-only">
          Rule-based projection overlay active
        </div>
      ) : null}
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}

export function buildStructureMarkers(
  annotations: ChartAnnotation[],
  bars: Bar[],
  visibility: MarkerVisibility = DEFAULT_MARKER_VISIBILITY,
): SeriesMarker<Time>[] {
  const visibleMarkers: SeriesMarker<Time>[] = [];

  for (const annotation of annotations) {
    if (!isAnnotationMarkerVisible(annotation, visibility)) {
      continue;
    }

    const wavePoints = annotation.family === "elliott" ? getElliottWavePoints(annotation) : [];
    if (wavePoints.length > 0) {
      wavePoints.forEach((point) => {
        const markerTime = findMarkerTime(point.date, bars);
        if (!markerTime) {
          return;
        }

        visibleMarkers.push({
          id: `${annotation.id}-${point.label}`,
          time: markerTime,
          position: "atPriceMiddle",
          price: point.price,
          shape: "circle",
          color: getElliottColor(annotation),
          text: point.label,
          size: 1,
        });
      });
      continue;
    }

    const spec = getMarkerSpec(annotation);
    if (!spec) {
      continue;
    }

    const markerTime = findMarkerTime(annotation.endDate, bars);
    if (!markerTime) {
      continue;
    }

    visibleMarkers.push({
      id: annotation.id,
      time: markerTime,
      position: spec.position,
      shape: spec.shape,
      color: spec.color,
      text: getMarkerText(annotation),
      size: 1,
    });
  }

  return visibleMarkers;
}

export function buildElliottWaveLines(
  annotations: ChartAnnotation[],
  bars: Bar[],
  visibility: MarkerVisibility = DEFAULT_MARKER_VISIBILITY,
): WaveLine[] {
  if (!visibility.elliott) {
    return [];
  }

  return annotations.flatMap((annotation) => {
    if (annotation.family !== "elliott") {
      return [];
    }

    const points = getElliottWavePoints(annotation)
      .map((point) => ({
        time: findMarkerTime(point.date, bars),
        value: point.price,
      }))
      .filter((point): point is { time: string; value: number } => Boolean(point.time));

    if (points.length < 2) {
      return [];
    }

    return [{
      key: annotation.id,
      title: getElliottLineTitle(annotation),
      color: getElliottColor(annotation),
      lineStyle: annotation.type === "Correction" ? LineStyle.Dashed : getImpulseLineStyle(annotation),
      lineWidth: getElliottRank(annotation) === "primary" ? 2 : 1,
      data: points,
    }];
  });
}

export function buildProjectionLines(
  annotations: ChartAnnotation[],
  bars: Bar[],
  visibility: MarkerVisibility = DEFAULT_MARKER_VISIBILITY,
  selectedProjectionId: string | null = null,
): WaveLine[] {
  if (visibility.projection === false || bars.length === 0) {
    return [];
  }

  return buildProjectionScenarios(annotations, bars)
    .filter((scenario) => scenario.status === "active" && scenario.points.length >= 2)
    .map((scenario) => projectionScenarioToLine(scenario, selectedProjectionId));
}

function isAnnotationMarkerVisible(annotation: ChartAnnotation, visibility: MarkerVisibility) {
  if (annotation.family === "wyckoff") {
    return visibility.wyckoff;
  }

  if (annotation.family === "elliott") {
    return visibility.elliott;
  }

  if (annotation.family === "pva") {
    return visibility.pva !== false;
  }

  return false;
}

function isAnnotationLayerVisible(annotation: ChartAnnotation, visibility: MarkerVisibility) {
  if (annotation.family === "wyckoff") {
    return visibility.wyckoff;
  }

  if (annotation.family === "elliott") {
    return visibility.elliott;
  }

  if (annotation.family === "pva") {
    return visibility.pva !== false;
  }

  if (annotation.type === "Fib Guide" || annotation.phase === "fib") {
    return visibility.elliott;
  }

  return true;
}

function getMarkerSpec(annotation: ChartAnnotation): MarkerSpec | null {
  if (annotation.family === "elliott") {
    return annotation.type === "Correction"
      ? { position: "belowBar", shape: "circle", color: "#7c3aed" }
      : { position: "aboveBar", shape: "circle", color: "#2563eb" };
  }

  if (annotation.family !== "wyckoff") {
    if (annotation.family === "pva") {
      return getPvaMarkerSpec(annotation);
    }

    return null;
  }

  if (annotation.type === "Trading Range" || annotation.type === "Insufficient Data") {
    return null;
  }

  if (isDistributionMarker(annotation)) {
    return WYCKOFF_DISTRIBUTION_LOW_EVENTS.has(annotation.type)
      ? { position: "belowBar", shape: "square", color: "#dc2626" }
      : { position: "aboveBar", shape: "square", color: "#dc2626" };
  }

  if (WYCKOFF_ACCUMULATION_HIGH_EVENTS.has(annotation.type)) {
    return { position: "aboveBar", shape: "square", color: "#0f766e" };
  }

  if (WYCKOFF_ACCUMULATION_LOW_EVENTS.has(annotation.type)) {
    return { position: "belowBar", shape: "square", color: "#0f9f8f" };
  }

  return null;
}

function getPvaMarkerSpec(annotation: ChartAnnotation): MarkerSpec {
  const bias = getPvaMeta(annotation)?.bias;
  if (bias === "bullish") {
    return { position: "belowBar", shape: "circle", color: "#f59e0b" };
  }

  if (bias === "bearish") {
    return { position: "aboveBar", shape: "circle", color: "#ea580c" };
  }

  return { position: "inBar", shape: "square", color: "#64748b" };
}

type ElliottWaveMeta = {
  pattern?: unknown;
  rank?: unknown;
  direction?: unknown;
  points?: unknown;
};

type ElliottWavePoint = {
  label: string;
  date: string;
  price: number;
};

type PvaMeta = {
  abbreviation?: unknown;
  bias?: unknown;
};

function getElliottWavePoints(annotation: ChartAnnotation): ElliottWavePoint[] {
  const wave = getElliottWaveMeta(annotation);
  if (!Array.isArray(wave?.points)) {
    return [];
  }

  return wave.points.filter(isElliottWavePoint);
}

function getElliottWaveMeta(annotation: ChartAnnotation): ElliottWaveMeta | null {
  const value = annotation.meta?.elliottWave;
  return value && typeof value === "object" ? value as ElliottWaveMeta : null;
}

function getPvaMeta(annotation: ChartAnnotation): PvaMeta | null {
  const value = annotation.meta?.pva;
  return value && typeof value === "object" ? value as PvaMeta : null;
}

function getMarkerText(annotation: ChartAnnotation) {
  if (annotation.family === "pva") {
    const abbreviation = getPvaMeta(annotation)?.abbreviation;
    return typeof abbreviation === "string" ? abbreviation : annotation.type;
  }

  return annotation.type;
}

function isElliottWavePoint(value: unknown): value is ElliottWavePoint {
  if (!value || typeof value !== "object") {
    return false;
  }

  const point = value as Record<string, unknown>;
  return typeof point.label === "string"
    && typeof point.date === "string"
    && typeof point.price === "number"
    && Number.isFinite(point.price);
}

function getElliottColor(annotation: ChartAnnotation) {
  return annotation.type === "Correction" ? "#7c3aed" : "#2563eb";
}

function getElliottLineTitle(annotation: ChartAnnotation) {
  if (annotation.type === "Correction") {
    return "A-B-C correction";
  }

  const rank = getElliottRank(annotation);
  return rank === "primary" ? "Primary impulse" : "Alternate impulse";
}

function getElliottRank(annotation: ChartAnnotation) {
  const rank = getElliottWaveMeta(annotation)?.rank;
  return typeof rank === "string" ? rank : "primary";
}

function getImpulseLineStyle(annotation: ChartAnnotation) {
  return getElliottRank(annotation) === "primary" ? LineStyle.Solid : LineStyle.Dotted;
}

function isDistributionMarker(annotation: ChartAnnotation) {
  if (WYCKOFF_DISTRIBUTION_HIGH_EVENTS.has(annotation.type) || annotation.type === "SOW") {
    return true;
  }

  if (annotation.type !== "AR" && annotation.type !== "ST") {
    return false;
  }

  const context = `${annotation.label} ${annotation.evidence.join(" ")}`.toLowerCase();
  return context.includes("reaction")
    || context.includes("resistance")
    || context.includes("supply")
    || context.includes("climactic high");
}

function findMarkerTime(date: string, bars: Bar[]): string | null {
  if (bars.length === 0) {
    return null;
  }

  if (date < bars[0].date || date > bars.at(-1)!.date) {
    return null;
  }

  return bars.find((bar) => bar.date >= date)?.date ?? null;
}

function getPriceWindow(bars: Bar[]) {
  if (bars.length === 0) {
    return null;
  }

  const min = Math.min(...bars.map((bar) => bar.low));
  const max = Math.max(...bars.map((bar) => bar.high));
  const margin = Math.max((max - min) * 0.15, max * 0.005);
  return { min: min - margin, max: max + margin };
}

function isPriceInsideWindow(price: number, window: { min: number; max: number }) {
  return price >= window.min && price <= window.max;
}

function getVisibleAnnotations(annotations: ChartAnnotation[], bars: Bar[]) {
  if (bars.length === 0) {
    return annotations;
  }

  const firstDate = bars[0].date;
  const lastDate = bars.at(-1)?.date ?? firstDate;
  return annotations.filter((annotation) => annotation.startDate <= lastDate && annotation.endDate >= firstDate);
}

function formatPrice(price: number) {
  return Math.round(price).toLocaleString("id-ID");
}

function projectionScenarioToLine(scenario: ProjectionScenario, selectedProjectionId: string | null): WaveLine {
  const selected = scenario.id === selectedProjectionId;
  return {
    key: scenario.id,
    title: scenario.title,
    color: selected ? "#f59e0b" : getProjectionColor(scenario),
    lineStyle: LineStyle.LargeDashed,
    lineWidth: selected || scenario.family !== "confluence" ? 2 : 1,
    data: scenario.points.map((point) => ({
      time: point.date,
      value: point.price,
    })),
  };
}

function getProjectionColor(scenario: ProjectionScenario) {
  if (scenario.family === "elliott") {
    return "#6366f1";
  }

  if (scenario.family === "confluence") {
    return "#0f172a";
  }

  return scenario.direction === "up" ? "#10b981" : "#ef4444";
}
