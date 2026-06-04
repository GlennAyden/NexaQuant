import { getMarketStore } from "@/lib/market/marketStore";
import type { Timeframe } from "@/lib/market/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const timeframe = parseTimeframe(url.searchParams.get("timeframe"));
  const limit = parseLimit(url.searchParams.get("limit"));
  const examples = getMarketStore().getBestExamples(limit, timeframe);

  return Response.json({ examples, timeframe, limit });
}

function parseTimeframe(value: string | null): Timeframe {
  return value === "1w" ? "1w" : "1d";
}

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 8;
  }

  return Math.min(parsed, 24);
}
