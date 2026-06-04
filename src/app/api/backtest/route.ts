import { evaluateAnnotationOutcomes } from "@/lib/backtest/eventBacktest";
import { getMarketStore } from "@/lib/market/marketStore";
import type { Timeframe } from "@/lib/market/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") ?? "BBCA.JK";
  const timeframe = (url.searchParams.get("timeframe") ?? "1d") as Timeframe;
  const horizons = parseHorizons(url.searchParams.get("horizons"));
  const store = getMarketStore();
  const bars = store.getBars(symbol, timeframe);
  const annotations = store.getAnnotations(symbol, timeframe);

  return Response.json({
    symbol,
    timeframe,
    outcomes: evaluateAnnotationOutcomes(bars, annotations, horizons),
  });
}

function parseHorizons(value: string | null): number[] | undefined {
  if (!value) {
    return undefined;
  }

  const horizons = value.split(",")
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0 && item <= 260);

  return horizons.length > 0 ? horizons : undefined;
}
