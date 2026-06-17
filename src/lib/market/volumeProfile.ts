import type { Bar } from "@/lib/market/types";

export type VolumeProfileBucket = {
  low: number;
  high: number;
  midPrice: number;
  volume: number;
  share: number;
  isPoc: boolean;
  inValueArea: boolean;
};

export type VolumeProfile = {
  buckets: VolumeProfileBucket[];
  totalVolume: number;
  pocPrice: number | null;
  valueAreaLow: number | null;
  valueAreaHigh: number | null;
};

export type VolumeProfileOptions = {
  bucketCount?: number;
  valueAreaPct?: number;
};

export function buildVolumeProfile(bars: Bar[], options: VolumeProfileOptions = {}): VolumeProfile {
  const validBars = bars.filter((bar) =>
    Number.isFinite(bar.close)
    && Number.isFinite(bar.volume)
    && bar.volume > 0
  );
  if (validBars.length === 0) {
    return emptyProfile();
  }

  const bucketCount = Math.max(3, Math.min(40, options.bucketCount ?? 16));
  const valueAreaPct = Math.max(0.1, Math.min(1, options.valueAreaPct ?? 0.7));
  const minClose = Math.min(...validBars.map((bar) => bar.close));
  const maxClose = Math.max(...validBars.map((bar) => bar.close));
  const priceSpan = maxClose - minClose;
  const bucketStep = priceSpan === 0 ? Math.max(1, maxClose) * 0.001 : priceSpan / Math.max(1, bucketCount - 1);
  const volumes = Array.from({ length: bucketCount }, () => 0);

  for (const bar of validBars) {
    const rawIndex = priceSpan === 0 ? 0 : Math.round((bar.close - minClose) / bucketStep);
    const index = Math.max(0, Math.min(bucketCount - 1, rawIndex));
    volumes[index] += bar.volume;
  }

  const totalVolume = volumes.reduce((sum, volume) => sum + volume, 0);
  if (totalVolume === 0) {
    return emptyProfile();
  }

  const pocIndex = volumes.reduce((bestIndex, volume, index) => (
    volume > volumes[bestIndex] ? index : bestIndex
  ), 0);
  const valueAreaIndexes = buildSymmetricValueArea(volumes, pocIndex, totalVolume * valueAreaPct);
  const buckets = volumes.map((volume, index) => {
    const midPrice = roundPrice(minClose + bucketStep * index);
    const halfStep = bucketStep / 2;
    const low = roundPrice(midPrice - halfStep);
    const high = roundPrice(midPrice + halfStep);
    return {
      low,
      high,
      midPrice,
      volume,
      share: roundScore(volume / totalVolume),
      isPoc: index === pocIndex,
      inValueArea: valueAreaIndexes.has(index),
    };
  });
  const valueAreaBuckets = buckets.filter((bucket) => bucket.inValueArea);

  return {
    buckets,
    totalVolume,
    pocPrice: buckets[pocIndex].midPrice,
    valueAreaLow: valueAreaBuckets[0]?.midPrice ?? null,
    valueAreaHigh: valueAreaBuckets.at(-1)?.midPrice ?? null,
  };
}

function buildSymmetricValueArea(volumes: number[], pocIndex: number, targetVolume: number) {
  const indexes = new Set([pocIndex]);
  let includedVolume = volumes[pocIndex];
  let distance = 1;

  while (includedVolume < targetVolume && indexes.size < volumes.length) {
    const lower = pocIndex - distance;
    const upper = pocIndex + distance;
    if (lower >= 0) {
      indexes.add(lower);
      includedVolume += volumes[lower];
    }
    if (upper < volumes.length) {
      indexes.add(upper);
      includedVolume += volumes[upper];
    }
    distance += 1;
  }

  return indexes;
}

function emptyProfile(): VolumeProfile {
  return {
    buckets: [],
    totalVolume: 0,
    pocPrice: null,
    valueAreaLow: null,
    valueAreaHigh: null,
  };
}

function roundScore(value: number) {
  return Number(value.toFixed(3));
}

function roundPrice(value: number) {
  return Number(value.toFixed(3));
}
