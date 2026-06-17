import { runNewsEnrichmentBackfill, type NewsEnrichmentProgressEvent } from "@/lib/news/newsIngestion";
import { getNewsStore } from "@/lib/news/newsStore";

export const dynamic = "force-dynamic";

let activeNewsEnrichment: Promise<unknown> | null = null;

export async function GET() {
  const store = getNewsStore();

  return Response.json({
    active: Boolean(activeNewsEnrichment),
    run: store.getLatestEnrichmentRun(),
  });
}

export async function POST(request: Request) {
  const parsed = await parseEnrichmentOptions(request);

  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const store = getNewsStore();
  if (request.headers.get("accept")?.includes("text/event-stream")) {
    return createEnrichmentStreamResponse(store, parsed.options);
  }

  if (!activeNewsEnrichment) {
    activeNewsEnrichment = runNewsEnrichmentBackfill(store, parsed.options).finally(() => {
      activeNewsEnrichment = null;
    });
  }

  return Response.json({
    active: true,
    run: store.getLatestEnrichmentRun(),
  }, { status: 202 });
}

function createEnrichmentStreamResponse(
  store: ReturnType<typeof getNewsStore>,
  options: { limit?: number },
) {
  if (activeNewsEnrichment) {
    return Response.json({ error: "News enrichment is already running" }, { status: 409 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: NewsEnrichmentProgressEvent | { type: "enrichment-error"; timestamp: string; message: string; error: string }) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      activeNewsEnrichment = runNewsEnrichmentBackfill(store, {
        ...options,
        onProgress: send,
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        send({
          type: "enrichment-error",
          timestamp: new Date().toISOString(),
          message,
          error: message,
        });
      }).finally(() => {
        activeNewsEnrichment = null;
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

async function parseEnrichmentOptions(request: Request): Promise<
  | { options: { limit?: number } }
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

  const limit = parseOptionalInteger(body.limit, 1, 200);
  if (limit === null) {
    return { error: "limit must be a positive integer" };
  }

  return { options: { limit } };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
