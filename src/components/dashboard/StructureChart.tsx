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
  type MouseEventParams,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

import {
  awesomeOscillator,
  movingAverage,
  relativeStrengthIndex,
  type IndicatorPoint,
} from "@/lib/analysis/indicators";
import { buildProjectionScenarios, type ProjectionScenario } from "@/lib/analysis/projectionEngine";
import { normalizeChartBars } from "@/lib/market/chartBars";
import { buildVolumeProfile } from "@/lib/market/volumeProfile";
import type { Bar, ChartAnnotation } from "@/lib/market/types";
import type { ChartAnomaly } from "@/lib/market/anomalyLens";
import type { NewsChartEvent } from "@/lib/news/newsEvents";
import type { HistoricalAnalogMatch } from "@/lib/research/historicalAnalog";

type StructureChartProps = {
  bars: Bar[];
  annotations: ChartAnnotation[];
  newsEvents?: NewsChartEvent[];
  anomalies?: ChartAnomaly[];
  markerVisibility?: MarkerVisibility;
  indicatorVisibility?: IndicatorVisibility;
  fitProjection?: boolean;
  guidesVisible?: boolean;
  volumeProfileVisible?: boolean;
  analogGhostVisible?: boolean;
  analogs?: HistoricalAnalogMatch[];
  selectedProjectionId?: string | null;
  onMarkerSelect?: (markerId: string) => void;
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
  news?: boolean;
  anomaly?: boolean;
};

export type IndicatorVisibility = {
  ma5: boolean;
  ma10: boolean;
  rsi: boolean;
  ao: boolean;
};

export type HistogramLine = {
  key: string;
  title: string;
  data: Array<{
    time: string;
    value: number;
    color: string;
  }>;
};

export type TechnicalIndicatorSeries = {
  movingAverages: WaveLine[];
  rsi: WaveLine | null;
  awesomeOscillator: HistogramLine | null;
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
  news: false,
  anomaly: false,
};

export const DEFAULT_INDICATOR_VISIBILITY: IndicatorVisibility = {
  ma5: true,
  ma10: true,
  rsi: true,
  ao: true,
};

const WYCKOFF_ACCUMULATION_LOW_EVENTS = new Set(["PS", "SC", "ST", "Spring", "Test", "LPS"]);
const WYCKOFF_ACCUMULATION_HIGH_EVENTS = new Set(["AR", "SOS"]);
const WYCKOFF_DISTRIBUTION_HIGH_EVENTS = new Set(["PSY", "BC", "UT", "UTAD", "LPSY"]);
const WYCKOFF_DISTRIBUTION_LOW_EVENTS = new Set(["AR", "SOW"]);

export function StructureChart({
  bars,
  annotations,
  newsEvents = [],
  anomalies = [],
  markerVisibility = DEFAULT_MARKER_VISIBILITY,
  indicatorVisibility = DEFAULT_INDICATOR_VISIBILITY,
  fitProjection = false,
  guidesVisible = false,
  volumeProfileVisible = false,
  analogGhostVisible = false,
  analogs = [],
  selectedProjectionId = null,
  onMarkerSelect,
}: StructureChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const plotBars = useMemo(() => normalizeChartBars(bars), [bars]);
  const indicatorSeries = useMemo(
    () => buildTechnicalIndicatorSeries(plotBars, indicatorVisibility),
    [indicatorVisibility, plotBars],
  );

  const markers = useMemo(
    () => [
      ...buildStructureMarkers(annotations, plotBars, markerVisibility),
      ...buildNewsEventMarkers(newsEvents, plotBars, markerVisibility.news),
      ...buildAnomalyMarkers(anomalies, plotBars, markerVisibility.anomaly),
    ],
    [anomalies, annotations, markerVisibility, newsEvents, plotBars],
  );
  const waveLines = useMemo(
    () => buildElliottWaveLines(annotations, plotBars, markerVisibility),
    [annotations, markerVisibility, plotBars],
  );
  const projectionLines = useMemo(
    () => buildProjectionLines(annotations, plotBars, markerVisibility, selectedProjectionId),
    [annotations, markerVisibility, plotBars, selectedProjectionId],
  );
  const analogGhostLines = useMemo(
    () => buildAnalogGhostLines(analogs, plotBars, analogGhostVisible),
    [analogGhostVisible, analogs, plotBars],
  );
  const volumeProfile = useMemo(() => buildVolumeProfile(plotBars, { bucketCount: 14 }), [plotBars]);
  const indicatorBadges = useMemo(
    () => [
      ...indicatorSeries.movingAverages.map((line) => ({ key: line.key, label: line.title, color: line.color })),
      ...(indicatorSeries.rsi ? [{ key: indicatorSeries.rsi.key, label: indicatorSeries.rsi.title, color: indicatorSeries.rsi.color }] : []),
      ...(indicatorSeries.awesomeOscillator ? [{ key: indicatorSeries.awesomeOscillator.key, label: indicatorSeries.awesomeOscillator.title, color: "#0f9f8f" }] : []),
    ],
    [indicatorSeries],
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

    indicatorSeries.movingAverages.forEach((line) => {
      const lineSeries = chart.addSeries(LineSeries, {
        color: line.color,
        lineWidth: line.lineWidth,
        lineStyle: line.lineStyle,
        priceLineVisible: false,
        lastValueVisible: false,
      }) as ISeriesApi<"Line">;

      lineSeries.setData(line.data);
    });

    const rsiPaneIndex = indicatorSeries.rsi ? 1 : null;
    if (indicatorSeries.rsi && rsiPaneIndex !== null) {
      const rsiSeries = chart.addSeries(LineSeries, {
        color: indicatorSeries.rsi.color,
        lineWidth: indicatorSeries.rsi.lineWidth,
        lineStyle: indicatorSeries.rsi.lineStyle,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        priceLineVisible: false,
        lastValueVisible: true,
        autoscaleInfoProvider: () => ({
          priceRange: {
            minValue: 0,
            maxValue: 100,
          },
        }),
      }, rsiPaneIndex) as ISeriesApi<"Line">;

      rsiSeries.setData(indicatorSeries.rsi.data);
      [
        { price: 70, title: "RSI 70", color: "#dc2626", lineStyle: LineStyle.Dashed },
        { price: 50, title: "RSI 50", color: "#94a3b8", lineStyle: LineStyle.Dotted },
        { price: 30, title: "RSI 30", color: "#059669", lineStyle: LineStyle.Dashed },
      ].forEach((line) => {
        rsiSeries.createPriceLine({
          price: line.price,
          color: line.color,
          lineWidth: 1,
          lineStyle: line.lineStyle,
          axisLabelVisible: true,
          axisLabelColor: line.color,
          axisLabelTextColor: "#ffffff",
          title: line.title,
        });
      });
    }

    const aoPaneIndex = indicatorSeries.awesomeOscillator ? (indicatorSeries.rsi ? 2 : 1) : null;
    if (indicatorSeries.awesomeOscillator && aoPaneIndex !== null) {
      const aoSeries = chart.addSeries(HistogramSeries, {
        color: "#0f9f8f",
        base: 0,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
        priceLineVisible: false,
        lastValueVisible: true,
      }, aoPaneIndex) as ISeriesApi<"Histogram">;

      aoSeries.setData(indicatorSeries.awesomeOscillator.data);
      aoSeries.createPriceLine({
        price: 0,
        color: "#64748b",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        axisLabelColor: "#64748b",
        axisLabelTextColor: "#ffffff",
        title: "AO 0",
      });
    }

    if (indicatorSeries.rsi || indicatorSeries.awesomeOscillator) {
      const panes = chart.panes();
      panes[0]?.setStretchFactor(5);
      if (rsiPaneIndex !== null) {
        panes[rsiPaneIndex]?.setStretchFactor(1.25);
      }
      if (aoPaneIndex !== null) {
        panes[aoPaneIndex]?.setStretchFactor(1.25);
      }
    }

    [...waveLines, ...projectionLines, ...analogGhostLines].forEach((line) => {
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
    const handleChartClick = (param: MouseEventParams<Time>) => {
      const markerId = resolveSelectableMarkerId(param.hoveredInfo?.objectId ?? param.hoveredObjectId);
      if (markerId) {
        onMarkerSelect?.(markerId);
      }
    };
    chart.subscribeClick(handleChartClick);
    if (guidesVisible) {
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
    }
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
      chart.unsubscribeClick(handleChartClick);
      chart.remove();
      chartRef.current = null;
    };
  }, [analogGhostLines, fitProjection, guideLines, guidesVisible, indicatorSeries, markers, onMarkerSelect, plotBars, projectionLines, waveLines]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-white">
      {guidesVisible && guideLines.length > 0 ? (
        <div
          aria-label="Chart guide panel"
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
      {analogGhostLines.length > 0 ? (
        <div aria-label="Analog ghost overlay" className="sr-only">
          Analog ghost overlay active
        </div>
      ) : null}
      {indicatorSeries.movingAverages.length > 0 ? (
        <div aria-label="MA overlay" className="sr-only">
          Moving average overlay active
        </div>
      ) : null}
      {indicatorSeries.rsi ? (
        <div aria-label="RSI indicator pane" className="sr-only">
          RSI indicator pane active
        </div>
      ) : null}
      {indicatorSeries.awesomeOscillator ? (
        <div aria-label="Awesome Oscillator pane" className="sr-only">
          Awesome Oscillator pane active
        </div>
      ) : null}
      {markerVisibility.news && newsEvents.length > 0 ? (
        <div aria-label="News event overlay" className="sr-only">
          News event overlay active
        </div>
      ) : null}
      {markerVisibility.anomaly && anomalies.length > 0 ? (
        <div aria-label="Anomaly lens overlay" className="sr-only">
          Anomaly lens overlay active
        </div>
      ) : null}
      {volumeProfileVisible && volumeProfile.buckets.length > 0 ? (
        <div
          aria-label="Volume profile overlay"
          className="pointer-events-none absolute right-3 top-3 z-10 w-[174px] rounded-md border border-slate-200 bg-white/90 p-2 text-[11px] text-slate-600 shadow-sm"
        >
          <div className="mb-2 grid grid-cols-3 gap-1 text-center">
            <VolumeProfileFact label="POC" value={volumeProfile.pocPrice} />
            <VolumeProfileFact label="VAH" value={volumeProfile.valueAreaHigh} />
            <VolumeProfileFact label="VAL" value={volumeProfile.valueAreaLow} />
          </div>
          <div className="space-y-1">
            {volumeProfile.buckets.slice().reverse().map((bucket) => (
              <div key={`${bucket.low}-${bucket.high}`} className="grid grid-cols-[38px_minmax(0,1fr)] items-center gap-2">
                <span className={bucket.isPoc ? "font-bold text-slate-900" : "text-slate-500"}>
                  {formatPrice(bucket.midPrice)}
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className={`block h-full rounded-full ${bucket.isPoc ? "bg-teal-700" : bucket.inValueArea ? "bg-teal-400" : "bg-slate-300"}`}
                    style={{ width: `${Math.max(3, Math.round(bucket.share * 100))}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {indicatorBadges.length > 0 ? (
        <div
          aria-label="Indicator legend"
          className="pointer-events-none absolute bottom-3 right-3 z-10 flex max-w-[260px] flex-wrap justify-end gap-1 rounded-md border border-slate-200 bg-white/90 px-2 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm"
        >
          {indicatorBadges.map((badge) => (
            <span key={badge.key} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: badge.color }} />
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}

function VolumeProfileFact({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="rounded border border-slate-200 bg-white px-1 py-0.5">
      <span className="block font-bold text-slate-500">{label}</span>
      <span className="block font-semibold text-slate-900">{value === null ? "-" : formatPrice(value)}</span>
    </span>
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

export function buildNewsEventMarkers(
  events: NewsChartEvent[],
  bars: Bar[],
  visible = true,
): SeriesMarker<Time>[] {
  if (!visible) {
    return [];
  }

  return events.flatMap((event) => {
    const markerTime = findMarkerTime(event.chartDate || event.eventDate, bars);
    if (!markerTime) {
      return [];
    }

    return [{
      id: event.id,
      time: markerTime,
      position: "aboveBar" as const,
      shape: "circle" as const,
      color: getNewsEventColor(event.sentimentLabel),
      text: event.eventLabel,
      size: event.materialityScore >= 0.82 ? 1.4 : 1,
    }];
  });
}

export function buildAnomalyMarkers(
  anomalies: ChartAnomaly[],
  bars: Bar[],
  visible = true,
): SeriesMarker<Time>[] {
  if (!visible) {
    return [];
  }

  return anomalies.flatMap((anomaly) => {
    const markerTime = findMarkerTime(anomaly.date, bars);
    if (!markerTime) {
      return [];
    }

    return [{
      id: anomaly.id,
      time: markerTime,
      position: "aboveBar" as const,
      shape: "arrowDown" as const,
      color: "#9333ea",
      text: anomaly.labels.join("/"),
      size: anomaly.score >= 0.7 ? 1.4 : 1,
    }];
  });
}

export function resolveSelectableMarkerId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return value.startsWith("news-") || value.startsWith("anomaly-") ? value : null;
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

export function buildAnalogGhostLines(
  analogs: HistoricalAnalogMatch[],
  bars: Bar[],
  visible = false,
): WaveLine[] {
  if (!visible || analogs.length === 0 || bars.length < 2) {
    return [];
  }

  const analog = analogs[0];
  const analogBars = bars.filter((bar) => bar.date >= analog.startDate && bar.date <= analog.endDate);
  const windowLength = Math.min(analogBars.length, bars.length);
  if (windowLength < 2) {
    return [];
  }

  const sourceBars = analogBars.slice(0, windowLength);
  const targetBars = bars.slice(-windowLength);
  const sourceStart = sourceBars[0]?.close;
  const targetStart = targetBars[0]?.close;
  if (!Number.isFinite(sourceStart) || !Number.isFinite(targetStart) || sourceStart === 0) {
    return [];
  }

  return [{
    key: `analog-ghost-${analog.startDate}-${analog.endDate}`,
    title: `Analog ghost ${(analog.similarity * 100).toFixed(1)}%`,
    color: "#8b5cf6",
    lineStyle: LineStyle.Dotted,
    lineWidth: 2,
    data: sourceBars.map((bar, index) => ({
      time: targetBars[index].date,
      value: Number((targetStart * (bar.close / sourceStart)).toFixed(2)),
    })),
  }];
}

export function buildTechnicalIndicatorSeries(
  bars: Bar[],
  visibility: IndicatorVisibility = DEFAULT_INDICATOR_VISIBILITY,
): TechnicalIndicatorSeries {
  const active = { ...DEFAULT_INDICATOR_VISIBILITY, ...visibility };
  const movingAverages: WaveLine[] = [];

  if (active.ma5) {
    const data = movingAverage(bars, 5);
    if (data.length > 0) {
      movingAverages.push(indicatorLine("ma-5", "MA 5", "#0f766e", data));
    }
  }

  if (active.ma10) {
    const data = movingAverage(bars, 10);
    if (data.length > 0) {
      movingAverages.push(indicatorLine("ma-10", "MA 10", "#f59e0b", data));
    }
  }

  const rsiData = active.rsi ? relativeStrengthIndex(bars, 14) : [];
  const aoData = active.ao ? awesomeOscillator(bars, 5, 34) : [];

  return {
    movingAverages,
    rsi: rsiData.length > 0 ? indicatorLine("rsi-14", "RSI 14", "#7c3aed", rsiData, 2) : null,
    awesomeOscillator: aoData.length > 0
      ? {
        key: "ao-5-34",
        title: "Awesome Oscillator",
        data: buildAwesomeOscillatorBars(aoData),
      }
      : null,
  };
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

function getNewsEventColor(sentiment: NewsChartEvent["sentimentLabel"]) {
  if (sentiment === "positive") {
    return "#059669";
  }
  if (sentiment === "negative") {
    return "#dc2626";
  }
  if (sentiment === "mixed") {
    return "#d97706";
  }
  return "#475569";
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

function indicatorLine(
  key: string,
  title: string,
  color: string,
  data: IndicatorPoint[],
  lineWidth: 1 | 2 = 1,
): WaveLine {
  return {
    key,
    title,
    color,
    lineStyle: LineStyle.Solid,
    lineWidth,
    data,
  };
}

function buildAwesomeOscillatorBars(points: IndicatorPoint[]): HistogramLine["data"] {
  return points.map((point, index) => {
    const previous = points[index - 1]?.value ?? point.value;
    const rising = point.value >= previous;

    return {
      time: point.time,
      value: point.value,
      color: point.value >= 0
        ? rising ? "rgba(15, 159, 143, 0.72)" : "rgba(15, 118, 110, 0.38)"
        : rising ? "rgba(248, 113, 113, 0.45)" : "rgba(224, 93, 93, 0.72)",
    };
  });
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
