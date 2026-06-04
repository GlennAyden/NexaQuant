import { YahooMarketDataProvider } from "@/lib/market/dataProvider";
import { normalizeChartBars } from "@/lib/market/chartBars";
import { getMarketStore } from "@/lib/market/marketStore";
import { buildAnnotationsForBars, calculateAndStoreBars } from "@/lib/market/syncService";
import type { AnalysisMode, Timeframe } from "@/lib/market/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") ?? "BBCA.JK";
  const timeframe = (url.searchParams.get("timeframe") ?? "1d") as Timeframe;
  const limitBars = parseLimit(url.searchParams.get("limitBars"));
  const analysisMode = parseAnalysisMode(url.searchParams.get("analysisMode"));
  const store = getMarketStore();
  let payload = store.getChart(symbol, timeframe);

  if (payload.bars.length === 0) {
    try {
      const dailyBars = await new YahooMarketDataProvider().fetchDailyBars(symbol, 3);
      if (dailyBars.length > 0) {
        calculateAndStoreBars(store, dailyBars);
        payload = store.getChart(symbol, timeframe);
      }
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
        payload,
      }, { status: 502 });
    }
  }

  if (analysisMode) {
    payload = {
      ...payload,
      annotations: buildAnnotationsForBars(symbol, timeframe, payload.bars, { analysisMode }),
    };
  }

  const chartBars = normalizeChartBars(payload.bars);

  return Response.json({
    ...payload,
    bars: limitBars ? chartBars.slice(-limitBars) : chartBars,
  });
}

function parseAnalysisMode(value: string | null): AnalysisMode | null {
  if (value === "strict" || value === "loose") {
    return value;
  }

  return null;
}

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return Math.min(parsed, 600);
}
