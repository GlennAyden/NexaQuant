import { getMarketStore } from "@/lib/market/marketStore";
import { createDefaultUniverseProvider } from "@/lib/market/universeProvider";

export const dynamic = "force-dynamic";

const UNIVERSE_SEED_TTL_MS = 30_000;

let lastUniverseSeededAt = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const store = getMarketStore();
  const query = url.searchParams.get("query") ?? undefined;
  const family = url.searchParams.get("family") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const limit = clampNumber(url.searchParams.get("limit"), 1, 1000, 100);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 10000, 0);
  await seedUniverseIfChanged(store);

  let symbols = store.getSymbols({ query, family, status });

  if (symbols.length === 0 && store.listSymbolCodes().length === 0) {
    await seedUniverseIfChanged(store, { force: true });
    symbols = store.getSymbols({ query, family, status });
  }

  return Response.json({
    symbols: symbols.slice(offset, offset + limit),
    total: symbols.length,
    limit,
    offset,
  });
}

async function seedUniverseIfChanged(
  store: ReturnType<typeof getMarketStore>,
  options: { force?: boolean } = {},
) {
  const now = Date.now();
  if (!options.force && now - lastUniverseSeededAt < UNIVERSE_SEED_TTL_MS) {
    return;
  }

  const universe = await createDefaultUniverseProvider().loadSymbols();
  if (universe.length > 0) {
    store.upsertSymbols(universe);
  }
  lastUniverseSeededAt = now;
}

function clampNumber(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
