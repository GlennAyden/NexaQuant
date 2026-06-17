import { NEWS_SENTIMENT_MODEL } from "@/lib/news/sentimentEngine";
import { getNewsStore } from "@/lib/news/newsStore";
import type { NewsMarketScope, NewsSentimentLabel } from "@/lib/news/types";

export const dynamic = "force-dynamic";

const VALID_SENTIMENTS: NewsSentimentLabel[] = ["positive", "negative", "neutral", "mixed", "unknown"];

export async function GET() {
  const store = getNewsStore();
  return Response.json(store.getFeedbackSummary());
}

export async function POST(request: Request) {
  const parsed = await parseFeedbackBody(request);

  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const store = getNewsStore();
  const article = store.getArticleById(parsed.feedback.articleId);
  if (!article) {
    return Response.json({ error: "article not found" }, { status: 404 });
  }

  const createdAt = new Date().toISOString();
  const feedback = store.insertFeedback({ ...parsed.feedback, createdAt });
  store.insertSentimentRun({
    articleId: article.id,
    modelName: `${NEWS_SENTIMENT_MODEL}+human-feedback`,
    sentimentLabel: feedback.sentimentLabel,
    sentimentScore: scoreFromSentiment(feedback.sentimentLabel),
    relevanceScore: feedback.relevanceScore,
    marketScope: inferMarketScope(article.sentiment?.marketScope),
    reasoning: feedback.note
      ? `Human feedback: ${feedback.note}`
      : "Human feedback correction from News evidence inspector.",
    createdAt,
  });

  return Response.json({
    feedback,
    summary: store.getFeedbackSummary(),
    article: store.getArticleById(article.id),
  }, { status: 201 });
}

async function parseFeedbackBody(request: Request): Promise<
  | { feedback: { articleId: string; sentimentLabel: NewsSentimentLabel; relevanceScore: number; note?: string } }
  | { error: string }
> {
  const bodyResult = await readJsonBody(request);
  if ("error" in bodyResult) {
    return bodyResult;
  }

  if (!isRecord(bodyResult.body)) {
    return { error: "JSON body must be an object" };
  }

  const articleId = typeof bodyResult.body.articleId === "string" ? bodyResult.body.articleId.trim() : "";
  if (!articleId) {
    return { error: "articleId is required" };
  }

  const sentimentLabel = typeof bodyResult.body.sentimentLabel === "string"
    ? bodyResult.body.sentimentLabel.trim() as NewsSentimentLabel
    : "unknown";
  if (!VALID_SENTIMENTS.includes(sentimentLabel)) {
    return { error: "sentimentLabel must be positive, negative, neutral, mixed, or unknown" };
  }

  const relevanceScore = parseScore(bodyResult.body.relevanceScore);
  if (relevanceScore === null) {
    return { error: "relevanceScore must be a number from 0 to 1" };
  }

  const note = typeof bodyResult.body.note === "string" ? bodyResult.body.note.trim().slice(0, 400) : undefined;

  return {
    feedback: {
      articleId,
      sentimentLabel,
      relevanceScore,
      note,
    },
  };
}

async function readJsonBody(request: Request): Promise<{ body: unknown } | { error: string }> {
  try {
    const text = await request.text();
    return { body: text.trim() ? JSON.parse(text) : {} };
  } catch {
    return { error: "request body must be valid JSON" };
  }
}

function parseScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

function scoreFromSentiment(label: NewsSentimentLabel) {
  if (label === "positive") {
    return 1;
  }
  if (label === "negative") {
    return -1;
  }
  if (label === "mixed") {
    return 0.1;
  }
  return 0;
}

function inferMarketScope(value: string | undefined): NewsMarketScope {
  return value === "ihsg" || value === "sector" || value === "ticker" || value === "macro" || value === "global"
    ? value
    : "global";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
