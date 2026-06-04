import type { ChartAnnotation, Timeframe } from "@/lib/market/types";

export type TimeframeBias = "up" | "down" | "unknown";

export type TimeframeConflictResult = {
  status: "aligned" | "conflicted" | "insufficient";
  primaryBias: TimeframeBias;
  companionBias: TimeframeBias;
  evidence: string[];
  conflicts: string[];
};

const UP_EVENTS = new Set(["PS", "SC", "Spring", "Test", "SOS", "LPS", "Phase E Markup"]);
const DOWN_EVENTS = new Set(["PSY", "BC", "UT", "UTAD", "SOW", "LPSY", "Phase E Markdown"]);

export function compareTimeframeStructures(
  primaryAnnotations: ChartAnnotation[],
  primaryTimeframe: Timeframe,
  companionAnnotations: ChartAnnotation[],
  companionTimeframe: Timeframe,
): TimeframeConflictResult {
  const primary = determineBias(primaryAnnotations);
  const companion = determineBias(companionAnnotations);
  const evidence = [
    `${primaryTimeframe} bias: ${biasLabel(primary.bias)} (${primary.reasons.join("; ") || "no directional evidence"})`,
    `${companionTimeframe} bias: ${biasLabel(companion.bias)} (${companion.reasons.join("; ") || "no directional evidence"})`,
  ];

  if (primary.bias === "unknown" || companion.bias === "unknown") {
    return {
      status: "insufficient",
      primaryBias: primary.bias,
      companionBias: companion.bias,
      evidence,
      conflicts: [],
    };
  }

  if (primary.bias === companion.bias) {
    return {
      status: "aligned",
      primaryBias: primary.bias,
      companionBias: companion.bias,
      evidence,
      conflicts: [],
    };
  }

  return {
    status: "conflicted",
    primaryBias: primary.bias,
    companionBias: companion.bias,
    evidence,
    conflicts: [
      `${primaryTimeframe} bias is ${biasLabel(primary.bias)} while ${companionTimeframe} bias is ${biasLabel(companion.bias)}`,
    ],
  };
}

function determineBias(annotations: ChartAnnotation[]): { bias: TimeframeBias; reasons: string[] } {
  const elliottDirection = annotations
    .map((annotation) => elliottDirectionFrom(annotation.meta))
    .find((direction): direction is "up" | "down" => direction === "up" || direction === "down");

  if (elliottDirection) {
    return { bias: elliottDirection, reasons: [`Elliott meta direction is ${elliottDirection}`] };
  }

  const scores = annotations.reduce(
    (result, annotation) => {
      const polarity = eventPolarity(annotation);
      if (polarity === "up") {
        result.up += 1;
        result.reasons.push(`${annotation.timeframe} ${annotation.type} supports accumulation/up structure`);
      }
      if (polarity === "down") {
        result.down += 1;
        result.reasons.push(`${annotation.timeframe} ${annotation.type} supports distribution/down structure`);
      }
      return result;
    },
    { up: 0, down: 0, reasons: [] as string[] },
  );

  if (scores.up === scores.down) {
    return { bias: "unknown", reasons: scores.reasons };
  }

  return { bias: scores.up > scores.down ? "up" : "down", reasons: scores.reasons };
}

function eventPolarity(annotation: ChartAnnotation): Exclude<TimeframeBias, "unknown"> | null {
  const candidates = [annotation.type, annotation.label].filter(Boolean);
  if (candidates.some((value) => UP_EVENTS.has(value))) {
    return "up";
  }
  if (candidates.some((value) => DOWN_EVENTS.has(value))) {
    return "down";
  }
  return null;
}

function elliottDirectionFrom(meta: ChartAnnotation["meta"]): TimeframeBias {
  const elliottWave = meta?.elliottWave;
  if (!elliottWave || typeof elliottWave !== "object" || !("direction" in elliottWave)) {
    return "unknown";
  }

  const direction = elliottWave.direction;
  return direction === "up" || direction === "down" ? direction : "unknown";
}

function biasLabel(bias: TimeframeBias): string {
  if (bias === "up") {
    return "up/accumulation";
  }
  if (bias === "down") {
    return "down/distribution";
  }
  return "unknown";
}
