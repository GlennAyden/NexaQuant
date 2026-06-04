import { getMarketStore } from "@/lib/market/marketStore";
import type { WatchlistItem } from "@/lib/market/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ items: getMarketStore().getWatchlist() });
}

export async function POST(request: Request) {
  const body = await request.json() as { symbol?: string; note?: string; tags?: string[] };
  const symbol = body.symbol?.trim().toUpperCase();

  if (!symbol) {
    return Response.json({ error: "symbol is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const existing = getMarketStore().getWatchlistItem(symbol);
  const item: WatchlistItem = {
    symbol,
    note: body.note?.trim() ?? existing?.note ?? "",
    tags: body.tags ?? existing?.tags ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  getMarketStore().upsertWatchlistItem(item);
  return Response.json({ item });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase();

  if (!symbol) {
    return Response.json({ error: "symbol is required" }, { status: 400 });
  }

  getMarketStore().removeWatchlistItem(symbol);
  return Response.json({ symbol, removed: true });
}
