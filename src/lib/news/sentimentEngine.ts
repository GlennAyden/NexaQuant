import type { NewsArticle, NewsArticleMatch, NewsMarketScope, NewsSentimentLabel } from "@/lib/news/types";

export const NEWS_SENTIMENT_MODEL = "nexaquant-lexicon-v1";

const POSITIVE_TERMS = [
  ["menguat", "market strength tone"],
  ["naik", "upward movement tone"],
  ["rebound", "recovery tone"],
  ["melesat", "strong advance tone"],
  ["reli", "continued strength tone"],
  ["positif", "positive market tone"],
  ["stabil", "stability tone"],
  ["top gainer", "leadership tone"],
  ["surplus", "supportive balance tone"],
  ["laba", "earnings support tone"],
  ["inflow", "fund flow support"],
  ["net buy", "foreign accumulation flow"],
  ["akumulasi", "accumulation context"],
] as const;

const NEGATIVE_TERMS = [
  ["melemah", "market pressure tone"],
  ["turun", "downward movement tone"],
  ["terkoreksi", "correction tone"],
  ["koreksi", "correction tone"],
  ["anjlok", "sharp pressure tone"],
  ["tertekan", "pressure tone"],
  ["merosot", "decline tone"],
  ["rugi", "earnings pressure tone"],
  ["defisit", "balance pressure tone"],
  ["outflow", "fund flow pressure"],
  ["net sell", "foreign outflow"],
  ["inflasi tinggi", "macro pressure tone"],
  ["perang", "geopolitical risk tone"],
] as const;

const INDEX_TERMS = ["IHSG", "IDX", "BEI", "bursa", "pasar modal"];
const MACRO_TERMS = ["rupiah", "Bank Indonesia", "BI rate", "yield", "obligasi", "inflasi", "suku bunga"];
const FALLBACK_TICKER_EXCLUSIONS = new Set(["IHSG", "IDX", "BEI", "IPO", "JUNI", "SBN", "AS"]);

export type NewsAnalysisResult = {
  sentimentLabel: NewsSentimentLabel;
  sentimentScore: number;
  relevanceScore: number;
  marketScope: NewsMarketScope;
  reasoning: string;
  matches: Omit<NewsArticleMatch, "articleId">[];
};

export function analyzeNewsArticle(
  article: Pick<NewsArticle, "title" | "excerpt" | "matchedKeywords" | "sourceCategory"> & { content?: string },
  symbolCodes: string[] = [],
): NewsAnalysisResult {
  const text = `${article.title} ${article.excerpt} ${article.content ?? ""}`;
  const positive = findTermEvidence(text, POSITIVE_TERMS);
  const negative = findTermEvidence(text, NEGATIVE_TERMS);
  const keywordMatches = article.matchedKeywords.map((keyword) => ({
    matchType: "keyword" as const,
    matchValue: keyword,
    confidence: keyword === "IHSG" ? 0.95 : 0.82,
  }));
  const indexMatches = findTermMatches(text, INDEX_TERMS).map((term) => ({
    matchType: "index" as const,
    matchValue: term === "IDX" || term === "BEI" || term === "bursa" || term === "pasar modal" ? "IHSG" : term,
    confidence: term === "IHSG" ? 0.95 : 0.78,
  }));
  const macroMatches = findTermMatches(text, MACRO_TERMS).map((term) => ({
    matchType: "macro" as const,
    matchValue: term,
    confidence: 0.72,
  }));
  const tickerMatches = extractTickerMatches(text, symbolCodes).map((ticker) => ({
    matchType: "ticker" as const,
    matchValue: ticker,
    confidence: symbolCodes.length > 0 ? 0.9 : 0.62,
  }));
  const matches = dedupeMatches([...keywordMatches, ...indexMatches, ...macroMatches, ...tickerMatches]);
  const sentimentLabel = classifySentiment(positive.length, negative.length);
  const sentimentScore = scoreSentiment(positive.length, negative.length, sentimentLabel);
  const marketScope = inferMarketScope(indexMatches.length, macroMatches.length, tickerMatches.length);
  const relevanceScore = scoreRelevance({
    sourceCategory: article.sourceCategory,
    keywordCount: keywordMatches.length,
    indexCount: indexMatches.length,
    macroCount: macroMatches.length,
    tickerCount: tickerMatches.length,
  });

  return {
    sentimentLabel,
    sentimentScore,
    relevanceScore,
    marketScope,
    reasoning: buildReasoning({
      sentimentLabel,
      positive,
      negative,
      relevanceScore,
      indexMatches: indexMatches.map((match) => match.matchValue),
      macroMatches: macroMatches.map((match) => match.matchValue),
      tickerMatches: tickerMatches.map((match) => match.matchValue),
    }),
    matches,
  };
}

export function extractTickerMatches(text: string, symbolCodes: string[] = []) {
  const upperText = text.toUpperCase();
  const known = symbolCodes
    .map((symbol) => symbol.toUpperCase().replace(/\.JK$/, ""))
    .filter(Boolean);

  if (known.length > 0) {
    return [...new Set(known.filter((symbol) => new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "i").test(text)))];
  }

  const fallback = upperText.match(/\b[A-Z]{4}\b/g) ?? [];
  return [...new Set(fallback.filter((token) => !FALLBACK_TICKER_EXCLUSIONS.has(token)))];
}

function findTermEvidence(text: string, terms: readonly (readonly [string, string])[]) {
  const lower = text.toLocaleLowerCase("id-ID");
  return terms.filter(([term]) => lower.includes(term.toLocaleLowerCase("id-ID"))).map(([, evidence]) => evidence);
}

function findTermMatches(text: string, terms: string[]) {
  const lower = text.toLocaleLowerCase("id-ID");
  return terms.filter((term) => lower.includes(term.toLocaleLowerCase("id-ID")));
}

function classifySentiment(positiveCount: number, negativeCount: number): NewsSentimentLabel {
  if (positiveCount > 0 && negativeCount > 0) {
    return "mixed";
  }
  if (positiveCount > 0) {
    return "positive";
  }
  if (negativeCount > 0) {
    return "negative";
  }
  return "neutral";
}

function scoreSentiment(positiveCount: number, negativeCount: number, label: NewsSentimentLabel) {
  if (label === "neutral") {
    return 0;
  }
  const total = Math.max(positiveCount + negativeCount, 1);
  return roundScore((positiveCount - negativeCount) / total);
}

function inferMarketScope(indexCount: number, macroCount: number, tickerCount: number): NewsMarketScope {
  if (tickerCount > 0) {
    return "ticker";
  }
  if (indexCount > 0) {
    return "ihsg";
  }
  if (macroCount > 0) {
    return "macro";
  }
  return "global";
}

function scoreRelevance(input: {
  sourceCategory: string;
  keywordCount: number;
  indexCount: number;
  macroCount: number;
  tickerCount: number;
}) {
  const sourceBonus = ["market", "finance", "economy"].includes(input.sourceCategory) ? 0.15 : 0.05;
  const score = 0.2
    + sourceBonus
    + Math.min(0.2, input.keywordCount * 0.04)
    + (input.indexCount > 0 ? 0.25 : 0)
    + (input.tickerCount > 0 ? 0.2 : 0)
    + (input.macroCount > 0 ? 0.15 : 0);
  return roundScore(Math.min(1, Math.max(0.1, score)));
}

function buildReasoning(input: {
  sentimentLabel: NewsSentimentLabel;
  positive: string[];
  negative: string[];
  relevanceScore: number;
  indexMatches: string[];
  macroMatches: string[];
  tickerMatches: string[];
}) {
  const toneEvidence = [...input.positive, ...input.negative].slice(0, 3);
  const relevanceEvidence = [
    input.tickerMatches.length ? `ticker context ${input.tickerMatches.slice(0, 3).join(", ")}` : "",
    input.indexMatches.length ? "IHSG or market index context" : "",
    input.macroMatches.length ? `macro context ${input.macroMatches.slice(0, 2).join(", ")}` : "",
  ].filter(Boolean);
  const tone = toneEvidence.length > 0 ? toneEvidence.join(", ") : "no directional phrase found";
  const relevance = relevanceEvidence.length > 0 ? relevanceEvidence.join("; ") : "broad market mention only";
  return `${capitalize(input.sentimentLabel)} evidence: ${tone}. Relevance ${input.relevanceScore.toFixed(2)} because ${relevance}.`;
}

function dedupeMatches(matches: Omit<NewsArticleMatch, "articleId">[]) {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.matchType}:${match.matchValue.toUpperCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function roundScore(value: number) {
  return Number(value.toFixed(3));
}
