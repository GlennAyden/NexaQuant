import { getMarketStore } from "@/lib/market/marketStore";
import { getNewsStore } from "@/lib/news/newsStore";
import { classifyPendingNewsArticles } from "@/lib/news/sentimentService";
import type { NewsSentimentProgressEvent } from "@/lib/news/sentimentService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await parseSentimentOptions(request);

  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const newsStore = getNewsStore();
  const marketStore = getMarketStore();
  const symbolCodes = marketStore.listSymbolCodes();
  const options = {
    limit: parsed.options.limit,
    symbolCodes,
  };

  if (request.headers.get("accept")?.includes("text/event-stream")) {
    return createSentimentProgressResponse(async (sendProgress) => {
      await classifyPendingNewsArticles(newsStore, {
        ...options,
        onProgress: sendProgress,
      });
    });
  }

  return Response.json(await classifyPendingNewsArticles(newsStore, options));
}

async function parseSentimentOptions(request: Request): Promise<{ options: { limit?: number } } | { error: string }> {
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

  const limit = parseOptionalInteger(body.limit, 1, 5000);
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

function createSentimentProgressResponse(
  runClassification: (sendProgress: (event: NewsSentimentProgressEvent) => Promise<void>) => Promise<void>,
) {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = async (event: NewsSentimentProgressEvent | { type: "classification-error"; message: string }) => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        await new Promise((resolve) => setTimeout(resolve, 0));
      };

      try {
        await runClassification(send);
      } catch (error) {
        await send({
          type: "classification-error",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
