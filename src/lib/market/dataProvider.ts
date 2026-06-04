import YahooFinance from "yahoo-finance2";

import type { Bar } from "@/lib/market/types";

export type MarketDataProvider = {
  fetchDailyBars(symbol: string, years?: number): Promise<Bar[]>;
};

type HistoricalRow = {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adjclose?: number | null;
  volume: number | null;
};

type CompleteHistoricalRow = HistoricalRow & {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export class YahooMarketDataProvider implements MarketDataProvider {
  private readonly client = new YahooFinance();

  async fetchDailyBars(symbol: string, years = 3): Promise<Bar[]> {
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - years);

    const result = await this.client.chart(symbol, {
      period1,
      period2: new Date(),
      interval: "1d",
    }) as { quotes: HistoricalRow[] };

    return result.quotes
      .filter((row): row is CompleteHistoricalRow =>
        row.open !== null
        && row.high !== null
        && row.low !== null
        && row.close !== null
        && row.volume !== null,
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((row) => ({
        symbol,
        timeframe: "1d",
        date: row.date.toISOString().slice(0, 10),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        adjClose: row.adjclose ?? row.close,
        volume: row.volume,
        source: "yahoo",
      }));
  }
}

export function aggregateWeeklyBars(dailyBars: Bar[]): Bar[] {
  const groups = new Map<string, Bar[]>();

  for (const bar of dailyBars) {
    const key = weekKey(bar.date);
    groups.set(key, [...(groups.get(key) ?? []), bar]);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    return {
      symbol: first.symbol,
      timeframe: "1w",
      date: last.date,
      open: first.open,
      high: Math.max(...group.map((bar) => bar.high)),
      low: Math.min(...group.map((bar) => bar.low)),
      close: last.close,
      adjClose: last.adjClose,
      volume: group.reduce((sum, bar) => sum + bar.volume, 0),
      source: first.source,
    };
  });
}

function weekKey(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}
