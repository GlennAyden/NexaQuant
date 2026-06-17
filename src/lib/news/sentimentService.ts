import { analyzeNewsArticle, NEWS_SENTIMENT_MODEL } from "@/lib/news/sentimentEngine";
import type { NewsStore } from "@/lib/news/newsStore";

export type NewsSentimentBatchResult = {
  modelName: string;
  total: number;
  classifiedCount: number;
  skippedCount: number;
  remainingCount: number;
  articles: Array<{
    id: string;
    title: string;
    sentimentLabel: string;
    sentimentScore: number;
    relevanceScore: number;
    marketScope: string;
    matchCount: number;
  }>;
};

export type NewsSentimentProgressSummary = {
  total: number;
  classifiedCount: number;
  skippedCount: number;
  remainingCount: number;
};

export type NewsSentimentProgressEvent = {
  type: "classification-started" | "article-started" | "article-classified" | "classification-completed";
  timestamp: string;
  articleId?: string;
  title?: string;
  index?: number;
  message: string;
  summary: NewsSentimentProgressSummary;
};

type NewsSentimentOptions = {
  limit?: number;
  symbolCodes?: string[];
  onProgress?: (event: NewsSentimentProgressEvent) => void | Promise<void>;
};

export async function classifyPendingNewsArticles(
  store: NewsStore,
  options: NewsSentimentOptions = {},
): Promise<NewsSentimentBatchResult> {
  const limit = Math.max(1, Math.min(5000, options.limit ?? 1000));
  const pendingCount = store.countArticlesForClassification();
  const targetTotal = Math.min(pendingCount, limit);
  const result: NewsSentimentBatchResult = {
    modelName: NEWS_SENTIMENT_MODEL,
    total: targetTotal,
    classifiedCount: 0,
    skippedCount: 0,
    remainingCount: pendingCount,
    articles: [],
  };
  const emit = createProgressEmitter(options.onProgress, result);

  await emit("classification-started", "Menyiapkan klasifikasi berita.");

  while (result.classifiedCount + result.skippedCount < targetTotal) {
    const remainingTarget = targetTotal - result.classifiedCount - result.skippedCount;
    const articles = store.getArticleForClassification(Math.min(200, remainingTarget));
    if (articles.length === 0) {
      break;
    }

    for (const article of articles) {
      const index = result.classifiedCount + result.skippedCount + 1;
      await emit("article-started", `Menganalisis: ${article.title}`, article, index);
      const analysis = analyzeNewsArticle(article, options.symbolCodes ?? []);
      store.replaceArticleMatches(article.id, analysis.matches);
      store.insertSentimentRun({
        articleId: article.id,
        modelName: NEWS_SENTIMENT_MODEL,
        sentimentLabel: analysis.sentimentLabel,
        sentimentScore: analysis.sentimentScore,
        relevanceScore: analysis.relevanceScore,
        marketScope: analysis.marketScope,
        reasoning: analysis.reasoning,
        createdAt: new Date().toISOString(),
      });
      result.classifiedCount += 1;
      result.remainingCount = Math.max(0, pendingCount - result.classifiedCount);
      result.articles.push({
        id: article.id,
        title: article.title,
        sentimentLabel: analysis.sentimentLabel,
        sentimentScore: analysis.sentimentScore,
        relevanceScore: analysis.relevanceScore,
        marketScope: analysis.marketScope,
        matchCount: analysis.matches.length,
      });
      await emit("article-classified", `Selesai: ${article.title}`, article, index);
    }
  }

  result.remainingCount = store.countArticlesForClassification();
  await emit("classification-completed", `Classify selesai: ${result.classifiedCount} berita dianalisis.`);

  return result;
}

function createProgressEmitter(
  onProgress: NewsSentimentOptions["onProgress"],
  result: NewsSentimentBatchResult,
) {
  return async (
    type: NewsSentimentProgressEvent["type"],
    message: string,
    article?: { id: string; title: string },
    index?: number,
  ) => {
    await onProgress?.({
      type,
      timestamp: new Date().toISOString(),
      articleId: article?.id,
      title: article?.title,
      index,
      message,
      summary: {
        total: result.total,
        classifiedCount: result.classifiedCount,
        skippedCount: result.skippedCount,
        remainingCount: result.remainingCount,
      },
    });
  };
}
