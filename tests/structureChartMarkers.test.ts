import { describe, expect, it } from "vitest";

import { buildElliottWaveLines, buildProjectionLines, buildStructureMarkers } from "@/components/dashboard/StructureChart";
import type { Bar, ChartAnnotation } from "@/lib/market/types";

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
