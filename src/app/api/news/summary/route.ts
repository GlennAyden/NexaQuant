import { getNewsStore } from "@/lib/news/newsStore";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = clampNumber(url.searchParams.get("days"), 1, 365, 7);
  const dateFrom = new Date(Date.now() - days * 86_400_000).toISOString();
  const store = getNewsStore();

  return Response.json(store.getSummary({
    dateFrom,
    ticker: optionalString(url.searchParams.get("ticker")),
    keyword: optionalString(url.searchParams.get("keyword")),
    sourceId: optionalString(url.searchParams.get("sourceId")),
  }));
}

function optionalString(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function clampNumber(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
