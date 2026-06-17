import { describe, expect, it } from "vitest";

import { buildAnalogGhostLines, buildAnomalyMarkers, buildElliottWaveLines, buildNewsEventMarkers, buildProjectionLines, buildStructureMarkers, buildTechnicalIndicatorSeries, resolveSelectableMarkerId } from "@/components/dashboard/StructureChart";
import type { Bar, ChartAnnotation } from "@/lib/market/types";
import type { HistoricalAnalogMatch } from "@/lib/research/historicalAnalog";

const IMPORTANT_WYCKOFF_EVENTS = [
  "PS",
  "SC",
  "AR",
  "ST",
  "Spring",
  "Test",
  "SOS",
  "LPS",
  "PSY",
  "BC",
  "UT",
  "UTAD",
  "SOW",
  "LPSY",
];

function bar(index: number): Bar {
  const price = 100 + index;
  return {
    symbol: "MARK.JK",
    timeframe: "1d",
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: price,
    high: price + 2,
    low: price - 2,
    close: price + 1,
    adjClose: price + 1,
    volume: 1000 + index,
    source: "fixture",
  };
}

function annotation(
  type: string,
  date: string,
  family: ChartAnnotation["family"] = "wyckoff",
): ChartAnnotation {
  return {
    id: `${family}-${type}-${date}`,
    symbol: "MARK.JK",
    timeframe: "1d",
    family,
    type,
    label: type === "AR" ? "Automatic Rally" : type,
    startDate: date,
    endDate: date,
    priceMin: 90,
    priceMax: 120,
    invalidationPrice: null,
    status: "candidate",
    evidence: ["fixture event"],
  };
}

describe("StructureChart marker mapping", () => {
  it("keeps every important Wyckoff event as a chart marker when Wyckoff markers are enabled", () => {
    const bars = Array.from({ length: 20 }, (_, index) => bar(index));
    const annotations = IMPORTANT_WYCKOFF_EVENTS.map((type, index) =>
      annotation(type, bars[index + 1].date),
    );

    const markers = buildStructureMarkers(annotations, bars, { wyckoff: true, elliott: false });

    expect(markers.map((marker) => marker.text)).toEqual(IMPORTANT_WYCKOFF_EVENTS);
  });

  it("separates Wyckoff and Elliott marker visibility without dropping same-day events", () => {
    const bars = Array.from({ length: 8 }, (_, index) => bar(index));
    const annotations = [
      annotation("SC", bars[2].date),
      annotation("ST", bars[2].date),
      annotation("Impulse", bars[4].date, "elliott"),
      annotation("Correction", bars[5].date, "elliott"),
    ];

    const allMarkers = buildStructureMarkers(annotations, bars, { wyckoff: true, elliott: true });
    expect(allMarkers.map((marker) => marker.text)).toEqual(["SC", "ST", "Impulse", "Correction"]);

    const elliottOnly = buildStructureMarkers(annotations, bars, { wyckoff: false, elliott: true });
    expect(elliottOnly.map((marker) => marker.text)).toEqual(["Impulse", "Correction"]);

    const wyckoffOnly = buildStructureMarkers(annotations, bars, { wyckoff: true, elliott: false });
    expect(wyckoffOnly.map((marker) => marker.text)).toEqual(["SC", "ST"]);
  });

  it("shows and hides PVA markers independently from Wyckoff and Elliott", () => {
    const bars = Array.from({ length: 8 }, (_, index) => bar(index));
    const pva = annotation("Demand Expansion", bars[3].date, "pva");
    pva.meta = {
      pva: {
        abbreviation: "DX",
        bias: "bullish",
        relativeVolume: 1.8,
        spreadRatio: 1.2,
        closeLocation: 0.82,
      },
    };

    const visible = buildStructureMarkers([pva], bars, { wyckoff: false, elliott: false, pva: true });
    const hidden = buildStructureMarkers([pva], bars, { wyckoff: true, elliott: true, pva: false });

    expect(visible).toEqual([
      expect.objectContaining({
        text: "DX",
        position: "belowBar",
        shape: "circle",
      }),
    ]);
    expect(hidden).toEqual([]);
  });

  it("maps material news events to an independent chart marker layer", () => {
    const bars = Array.from({ length: 8 }, (_, index) => bar(index));
    const markers = buildNewsEventMarkers([
      {
        id: "news-a1-BBCA",
        articleId: "a1",
        ticker: "BBCA",
        eventDate: bars[3].date,
        chartDate: bars[3].date,
        title: "BBCA bagi dividen",
        sourceName: "EmitenNews Emiten",
        url: "https://example.com/bbca",
        eventType: "dividend",
        eventLabel: "Dividen",
        sentimentLabel: "positive",
        sentimentScore: 1,
        relevanceScore: 0.9,
        materialityScore: 0.86,
        confidenceScore: 0.88,
        return1dPct: 1.2,
        return3dPct: 2.5,
        return5dPct: 3.1,
        volumeRatio: 1.6,
        evidence: "Event date 2026-01-04; 3D return +2.50%; volume ratio 1.6.",
      },
    ], bars, true);

    expect(markers).toEqual([
      expect.objectContaining({
        id: "news-a1-BBCA",
        time: bars[3].date,
        position: "aboveBar",
        shape: "circle",
        text: "Dividen",
        color: "#059669",
      }),
    ]);
    expect(buildNewsEventMarkers(markersFixture(bars), bars, false)).toEqual([]);
  });

  it("builds technical indicator series so enabled chart panes have runtime data", () => {
    const bars = Array.from({ length: 40 }, (_, index) => bar(index));

    const series = buildTechnicalIndicatorSeries(bars, { ma5: true, ma10: true, rsi: true, ao: true });

    expect(series.movingAverages.map((line) => line.key)).toEqual(["ma-5", "ma-10"]);
    expect(series.rsi).toEqual(expect.objectContaining({ key: "rsi-14", title: "RSI 14" }));
    expect(series.awesomeOscillator).toEqual(expect.objectContaining({ key: "ao-5-34", title: "Awesome Oscillator" }));
    expect(series.awesomeOscillator?.data[0]).toEqual(expect.objectContaining({ color: expect.any(String) }));
  });

  it("maps anomaly lens events to a selectable marker layer", () => {
    const bars = Array.from({ length: 8 }, (_, index) => bar(index));
    const markers = buildAnomalyMarkers([
      {
        id: "anomaly-2026-01-04",
        date: bars[3].date,
        score: 0.76,
        labels: ["Volume", "Range"],
        evidence: ["volume 2.5x local average"],
      },
    ], bars, true);

    expect(markers).toEqual([
      expect.objectContaining({
        id: "anomaly-2026-01-04",
        time: bars[3].date,
        shape: "arrowDown",
        text: "Volume/Range",
      }),
    ]);
  });

  it("resolves only news and anomaly marker ids as selectable dashboard evidence", () => {
    expect(resolveSelectableMarkerId("news-a1-BBCA")).toBe("news-a1-BBCA");
    expect(resolveSelectableMarkerId("anomaly-2026-01-04")).toBe("anomaly-2026-01-04");
    expect(resolveSelectableMarkerId("wyckoff-SOS-2026-01-04")).toBeNull();
    expect(resolveSelectableMarkerId(undefined)).toBeNull();
  });

  it("projects the primary historical analog path onto the latest chart window as a ghost line", () => {
    const bars = Array.from({ length: 10 }, (_, index) => bar(index));
    const lines = buildAnalogGhostLines([
      {
        startDate: bars[1].date,
        endDate: bars[3].date,
        similarity: 0.84,
        forwardReturnPct: 3.2,
        evidence: ["fixture analog"],
      },
    ], bars, true);

    expect(lines).toEqual([
      expect.objectContaining({
        key: "analog-ghost-2026-01-02-2026-01-04",
        title: "Analog ghost 84.0%",
        data: [
          { time: bars[7].date, value: bars[7].close },
          { time: bars[8].date, value: expect.any(Number) },
          { time: bars[9].date, value: expect.any(Number) },
        ],
      }),
    ]);
    expect(lines[0].data[2].value).toBeGreaterThan(lines[0].data[0].value);
    expect(buildAnalogGhostLines(linesFixture(), bars, false)).toEqual([]);
  });

  it("builds technical indicator overlays only for enabled readable layers", () => {
    const bars = Array.from({ length: 40 }, (_, index) => bar(index));
    const indicators = buildTechnicalIndicatorSeries(bars, {
      ma5: true,
      ma10: false,
      rsi: true,
      ao: true,
    });

    expect(indicators.movingAverages).toHaveLength(1);
    expect(indicators.movingAverages[0]).toMatchObject({
      key: "ma-5",
      title: "MA 5",
    });
    expect(indicators.movingAverages[0].data.slice(0, 2)).toEqual([
      { time: bars[4].date, value: 103 },
      { time: bars[5].date, value: 104 },
    ]);
    expect(indicators.rsi).toMatchObject({
      key: "rsi-14",
      title: "RSI 14",
    });
    expect(indicators.rsi?.data[0]).toMatchObject({ time: bars[14].date, value: 100 });
    expect(indicators.awesomeOscillator).toMatchObject({
      key: "ao-5-34",
      title: "Awesome Oscillator",
    });
    expect(indicators.awesomeOscillator?.data[0]).toMatchObject({ time: bars[33].date, color: "rgba(15, 159, 143, 0.72)" });
  });

  it("builds Elliott wave line paths and per-pivot labels from structured wave metadata", () => {
    const bars = Array.from({ length: 8 }, (_, index) => bar(index));
    const impulse = annotation("Impulse", bars[5].date, "elliott");
    impulse.meta = {
      elliottWave: {
        pattern: "impulse",
        rank: "primary",
        direction: "up",
        points: ["0", "1", "2", "3", "4", "5"].map((label, index) => ({
          label,
          date: bars[index].date,
          price: 100 + index * 3,
        })),
      },
    };
    const correction = annotation("Correction", bars[7].date, "elliott");
    correction.meta = {
      elliottWave: {
        pattern: "correction",
        points: ["A", "B", "C"].map((label, index) => ({
          label,
          date: bars[index + 5].date,
          price: 120 - index * 4,
        })),
      },
    };

    const lines = buildElliottWaveLines([impulse, correction], bars, { wyckoff: true, elliott: true });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      key: impulse.id,
      title: "Primary impulse",
      color: "#2563eb",
      data: [
        { time: "2026-01-01", value: 100 },
        { time: "2026-01-02", value: 103 },
        { time: "2026-01-03", value: 106 },
        { time: "2026-01-04", value: 109 },
        { time: "2026-01-05", value: 112 },
        { time: "2026-01-06", value: 115 },
      ],
    });
    expect(lines[1]).toMatchObject({
      key: correction.id,
      title: "A-B-C correction",
      color: "#7c3aed",
      data: [
        { time: "2026-01-06", value: 120 },
        { time: "2026-01-07", value: 116 },
        { time: "2026-01-08", value: 112 },
      ],
    });

    const labels = buildStructureMarkers([impulse, correction], bars, { wyckoff: false, elliott: true });
    expect(labels.map((marker) => marker.text)).toEqual(["0", "1", "2", "3", "4", "5", "A", "B", "C"]);
  });

  it("hides Elliott wave lines when the Elliott layer is disabled", () => {
    const bars = Array.from({ length: 6 }, (_, index) => bar(index));
    const impulse = annotation("Impulse", bars[5].date, "elliott");
    impulse.meta = {
      elliottWave: {
        pattern: "impulse",
        points: ["0", "1", "2", "3", "4", "5"].map((label, index) => ({
          label,
          date: bars[index].date,
          price: 100 + index,
        })),
      },
    };

    const lines = buildElliottWaveLines([impulse], bars, { wyckoff: true, elliott: false });

    expect(lines).toEqual([]);
  });

  it("builds rule-based Wyckoff projection only after markup or markdown evidence", () => {
    const bars = Array.from({ length: 12 }, (_, index) => bar(index));
    const range = annotation("Trading Range", bars[5].date);
    range.startDate = bars[0].date;
    range.priceMin = 90;
    range.priceMax = 110;
    const sos = annotation("SOS", bars[7].date);
    sos.priceMin = 90;
    sos.priceMax = 114;
    sos.invalidationPrice = 90;
    const st = annotation("ST", bars[4].date);

    const projections = buildProjectionLines([range, st, sos], bars, { wyckoff: true, elliott: true, projection: true });

    expect(projections).toEqual([{
      key: "projection-wyckoff-markup-wyckoff-SOS-2026-01-08",
      title: "Wyckoff markup projection",
      color: "#10b981",
      lineStyle: expect.any(Number),
      lineWidth: 2,
      data: [
        { time: "2026-01-08", value: 114 },
        { time: "2026-01-28", value: 130 },
        { time: "2026-02-17", value: 140 },
      ],
    }]);

    expect(buildProjectionLines([range, st], bars, { wyckoff: true, elliott: true, projection: true })).toEqual([]);
  });

  it("highlights the selected projection line without hiding other active projections", () => {
    const bars = Array.from({ length: 12 }, (_, index) => bar(index));
    const range = annotation("Trading Range", bars[5].date);
    range.startDate = bars[0].date;
    range.priceMin = 90;
    range.priceMax = 110;
    const sos = annotation("SOS", bars[7].date);
    sos.priceMin = 90;
    sos.priceMax = 114;
    sos.invalidationPrice = 90;

    const projections = buildProjectionLines(
      [range, sos],
      bars,
      { wyckoff: true, elliott: true, projection: true },
      "projection-wyckoff-markup-wyckoff-SOS-2026-01-08",
    );

    expect(projections).toEqual([
      expect.objectContaining({
        key: "projection-wyckoff-markup-wyckoff-SOS-2026-01-08",
        color: "#f59e0b",
        lineWidth: 2,
      }),
    ]);
  });

  it("builds Elliott correction projection from a valid primary impulse and hides projections independently", () => {
    const bars = Array.from({ length: 8 }, (_, index) => bar(index));
    const impulse = annotation("Impulse", bars[5].date, "elliott");
    impulse.invalidationPrice = 100;
    impulse.meta = {
      elliottWave: {
        pattern: "impulse",
        rank: "primary",
        direction: "up",
        points: [
          { label: "0", date: bars[0].date, price: 100 },
          { label: "1", date: bars[1].date, price: 112 },
          { label: "2", date: bars[2].date, price: 106 },
          { label: "3", date: bars[3].date, price: 132 },
          { label: "4", date: bars[4].date, price: 124 },
          { label: "5", date: bars[5].date, price: 146 },
        ],
      },
    };
    const fib = annotation("Fib Guide", bars[5].date, "structure");
    fib.meta = {
      retracement382: 128.4,
      retracement618: 117.6,
    };

    const projections = buildProjectionLines([impulse, fib], bars, { wyckoff: true, elliott: true, projection: true });

    expect(projections).toMatchObject([{
      key: "projection-elliott-correction-elliott-Impulse-2026-01-06",
      title: "Elliott A-B-C projection",
      color: "#6366f1",
      data: [
        { time: "2026-01-06", value: 146 },
        { time: "2026-01-18", value: 128.4 },
        { time: "2026-01-30", value: 117.6 },
      ],
    }]);
    expect(buildProjectionLines([impulse, fib], bars, { wyckoff: true, elliott: true, projection: false })).toEqual([]);
  });
});

function markersFixture(bars: Bar[]) {
  return [{
    id: "news-a2-BBCA",
    articleId: "a2",
    ticker: "BBCA",
    eventDate: bars[4].date,
    chartDate: bars[4].date,
    title: "BBCA update",
    sourceName: "fixture",
    url: "https://example.com/bbca-update",
    eventType: "issuer_update",
    eventLabel: "Update Emiten",
    sentimentLabel: "neutral" as const,
    sentimentScore: 0,
    relevanceScore: 0.7,
    materialityScore: 0.7,
    confidenceScore: 0.7,
    return1dPct: null,
    return3dPct: null,
    return5dPct: null,
    volumeRatio: null,
    evidence: "fixture",
  }];
}

function linesFixture(): HistoricalAnalogMatch[] {
  return [{
    startDate: "2026-01-02",
    endDate: "2026-01-04",
    similarity: 0.84,
    forwardReturnPct: 3.2,
    evidence: ["fixture analog"],
  }];
}
