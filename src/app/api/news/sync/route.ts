import { runNewsSync, type NewsSyncProgressEvent } from "@/lib/news/newsIngestion";
import { getNewsStore } from "@/lib/news/newsStore";

export const dynamic = "force-dynamic";

let activeNewsSync: Promise<unknown> | null = null;

export async function GET() {
  const store = getNewsStore();

  return Response.json({
    active: Boolean(activeNewsSync),
    run: store.getLatestRun(),
    sources: store.getLatestSourceStatuses(),
    history: store.getRecentIngestionHistory(),
  });
}

export async function POST(request: Request) {
  const parsed = await parseSyncOptions(request);

  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const store = getNewsStore();
  if (request.headers.get("accept")?.includes("text/event-stream")) {
    return createSyncStreamResponse(store, parsed.options);
  }

  if (!activeNewsSync) {
    activeNewsSync = runNewsSync(store, parsed.options).finally(() => {
      activeNewsSync = null;
    });
  }

  return Response.json({
    active: true,
    run: store.getLatestRun(),
    sources: store.getLatestSourceStatuses(),
    history: store.getRecentIngestionHistory(),
  }, { status: 202 });
}

function createSyncStreamResponse(
  store: ReturnType<typeof getNewsStore>,
  options: { days?: number; limit?: number; keywords?: string[]; sources?: string[] },
) {
  if (activeNewsSync) {
    return Response.json({ error: "News sync is already running" }, { status: 409 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: NewsSyncProgressEvent | { type: "run-error"; timestamp: string; message: string; error: string }) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      activeNewsSync = runNewsSync(store, {
        ...options,
        onProgress: send,
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        send({
          type: "run-error",
          timestamp: new Date().toISOString(),
          message,
          error: message,
        });
      }).finally(() => {
        activeNewsSync = null;
        if (!closed) {
          closed = true;
          controller.close();
        }
      });
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream; charset=utf-8",
    },
  });
}

async function parseSyncOptions(request: Request): Promise<
  | { options: { days?: number; limit?: number; keywords?: string[]; sources?: string[] } }
  | { error: string }
> {
  const bodyResult = await readJsonBody(request);
  if ("error" in bodyResult) {
    return bodyResult;
  }

  const body = bodyResult.body;
  if (body === null) {
    return { options: {} };
  }

  if (!isRecord(body)) {
    return { error: "JSON body must be an object" };
  }

  const days = parseOptionalInteger(body.days, 1, 365);
  if (days === null) {
    return { error: "days must be a positive integer" };
  }

  const limit = parseOptionalInteger(body.limit, 1, 100);
  if (limit === null) {
    return { error: "limit must be a positive integer" };
  }

  const keywords = parseStringArray(body.keywords);
  if (keywords === null) {
    return { error: "keywords must be an array of non-empty strings" };
  }

  const sources = parseStringArray(body.sources);
  if (sources === null) {
    return { error: "sources must be an array of non-empty strings" };
  }

  return { options: { days, limit, keywords, sources } };
}

async function readJsonBody(request: Request): Promise<{ body: unknown | null } | { error: string }> {
  try {
    const text = await request.text();
    return { body: text.trim() ? JSON.parse(text) : null };
  } catch {
    return { error: "request body must be valid JSON" };
  }
}

function parseOptionalInteger(value: unknown, min: number, max: number): number | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function parseStringArray(value: unknown): string[] | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const items = value.map((item) => typeof item === "string" ? item.trim() : "");
  return items.every(Boolean) ? [...new Set(items)] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
