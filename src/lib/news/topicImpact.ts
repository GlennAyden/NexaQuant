import type { NewsChartEvent } from "@/lib/news/newsEvents";

export type TopicImpactSummary = {
  label: string;
  total: number;
  averageReturn3dPct: number | null;
  averageVolumeRatio: number | null;
  sentimentMix: Record<string, number>;
};

export function summarizeTopicImpact(events: NewsChartEvent[]): TopicImpactSummary[] {
  const groups = new Map<string, NewsChartEvent[]>();

  for (const event of events) {
    const group = groups.get(event.eventLabel) ?? [];
    group.push(event);
    groups.set(event.eventLabel, group);
  }

  return [...groups.entries()]
    .map(([label, items]) => ({
      label,
      total: items.length,
      averageReturn3dPct: averageNullable(items.map((item) => item.return3dPct)),
      averageVolumeRatio: averageNullable(items.map((item) => item.volumeRatio)),
      sentimentMix: countBy(items.map((item) => item.sentimentLabel)),
    }))
    .sort((left, right) =>
      right.total - left.total
      || Math.abs(right.averageReturn3dPct ?? 0) - Math.abs(left.averageReturn3dPct ?? 0)
      || left.label.localeCompare(right.label),
    );
}

function averageNullable(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (valid.length === 0) {
    return null;
  }
  return roundScore(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function roundScore(value: number) {
  return Number(value.toFixed(3));
}
