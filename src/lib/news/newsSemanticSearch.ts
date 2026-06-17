import type { NewsArticle, NewsArticleResult } from "@/lib/news/types";

type SemanticConcept = {
  label: string;
  terms: string[];
};

type SemanticScore = {
  article: NewsArticle;
  score: number;
  reasons: string[];
};

const SEMANTIC_CONCEPTS: SemanticConcept[] = [
  { label: "Corporate Action", terms: ["aksi korporasi", "right issue", "hmtd", "private placement", "buyback", "dividen", "stock split", "rups", "rupst"] },
  { label: "Earnings Quality", terms: ["laba", "rugi", "pendapatan", "margin", "kinerja", "profit", "loss", "ebitda"] },
  { label: "Liquidity Flow", terms: ["asing", "net buy", "net sell", "volume", "likuiditas", "transaksi", "broker"] },
  { label: "Macro Currency", terms: ["rupiah", "dolar", "dollar", "inflasi", "suku bunga", "bi rate", "bank indonesia", "fed"] },
  { label: "Commodity", terms: ["batubara", "emas", "nikel", "cpo", "minyak", "gas", "komoditas"] },
  { label: "Balance Sheet", terms: ["utang", "obligasi", "sukuk", "peringkat", "pinjaman", "restrukturisasi"] },
  { label: "IPO Pipeline", terms: ["ipo", "listing", "penawaran umum", "bookbuilding", "prospektus"] },
];

const STOPWORDS = new Set([
  "yang",
  "dan",
  "atau",
  "dari",
  "pada",
  "untuk",
  "dengan",
  "dalam",
  "jadi",
  "akan",
  "ini",
  "itu",
  "ke",
  "di",
]);

export function rankNewsArticlesSemantically(
  articles: NewsArticle[],
  query: string,
  limit: number,
  offset: number,
): NewsArticleResult {
  const ranked = articles
    .map((article) => scoreNewsArticleSemantically(article, query))
    .filter((item) => item.score >= 0.12)
    .sort((a, b) => b.score - a.score || compareArticleTime(b.article, a.article));

  return {
    articles: ranked.slice(offset, offset + limit).map((item) => ({
      ...item.article,
      searchMode: "semantic",
      semanticScore: roundScore(item.score),
      semanticReasons: item.reasons,
    })),
    total: ranked.length,
    limit,
    offset,
  };
}

export function scoreNewsArticleSemantically(article: NewsArticle, query: string): SemanticScore {
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenizeText(query);
  const expandedQuery = expandQuery(query, queryTokens);
  const articleText = buildArticleSearchText(article);
  const normalizedArticle = normalizeText(articleText);
  const articleTokens = tokenizeText(articleText);
  const exactHits = [...queryTokens].filter((token) => articleTokens.has(token));
  const expandedHits = [...expandedQuery.tokens].filter((token) => articleTokens.has(token));
  const conceptHits = SEMANTIC_CONCEPTS
    .filter((concept) => expandedQuery.concepts.has(concept.label) && concept.terms.some((term) => normalizedArticle.includes(normalizeText(term))))
    .map((concept) => concept.label);
  const tickerHits = getTickerHits(article, queryTokens);
  const phraseScore = normalizedQuery && normalizedArticle.includes(normalizedQuery) ? 1 : 0;
  const sourceScore = normalizedQuery && normalizeText(article.sourceName).includes(normalizedQuery) ? 1 : 0;

  const exactScore = queryTokens.size > 0 ? exactHits.length / queryTokens.size : 0;
  const expandedScore = expandedQuery.tokens.size > 0 ? expandedHits.length / expandedQuery.tokens.size : 0;
  const conceptScore = expandedQuery.concepts.size > 0 ? conceptHits.length / expandedQuery.concepts.size : 0;
  const tickerScore = tickerHits.length > 0 ? 1 : 0;
  const score = clampScore(
    exactScore * 0.32
    + expandedScore * 0.22
    + conceptScore * 0.28
    + phraseScore * 0.12
    + tickerScore * 0.05
    + sourceScore * 0.01,
  );

  return {
    article,
    score,
    reasons: buildReasons({ exactHits, conceptHits, tickerHits, phraseScore, sourceScore }),
  };
}

function expandQuery(query: string, queryTokens: Set<string>) {
  const normalizedQuery = normalizeText(query);
  const tokens = new Set(queryTokens);
  const concepts = new Set<string>();

  for (const concept of SEMANTIC_CONCEPTS) {
    const matched = concept.terms.some((term) => {
      const normalizedTerm = normalizeText(term);
      const termTokens = tokenizeText(term);
      return normalizedQuery.includes(normalizedTerm)
        || [...termTokens].some((token) => queryTokens.has(token));
    });
    if (!matched) {
      continue;
    }
    concepts.add(concept.label);
    for (const term of concept.terms) {
      for (const token of tokenizeText(term)) {
        tokens.add(token);
      }
    }
  }

  return { tokens, concepts };
}

function buildArticleSearchText(article: NewsArticle) {
  return [
    article.title,
    article.excerpt,
    article.content,
    article.sourceName,
    ...article.matchedKeywords,
    ...article.matches.map((match) => match.matchValue),
  ].join(" ");
}

function buildReasons(input: {
  exactHits: string[];
  conceptHits: string[];
  tickerHits: string[];
  phraseScore: number;
  sourceScore: number;
}) {
  const reasons: string[] = [];
  if (input.conceptHits.length > 0) {
    reasons.push(`concept ${input.conceptHits.slice(0, 2).join(", ")}`);
  }
  if (input.tickerHits.length > 0) {
    reasons.push(`ticker ${input.tickerHits.slice(0, 2).join(", ")}`);
  }
  if (input.exactHits.length > 0) {
    reasons.push(`terms ${input.exactHits.slice(0, 3).join(", ")}`);
  }
  if (input.phraseScore > 0) {
    reasons.push("exact phrase");
  }
  if (input.sourceScore > 0) {
    reasons.push("source match");
  }
  return reasons.length > 0 ? reasons.slice(0, 3) : ["semantic proximity"];
}

function getTickerHits(article: NewsArticle, queryTokens: Set<string>) {
  return article.matches
    .filter((match) => match.matchType === "ticker")
    .map((match) => match.matchValue.toLowerCase())
    .filter((ticker) => queryTokens.has(ticker));
}

function tokenizeText(value: string) {
  return new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token)));
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compareArticleTime(left: NewsArticle, right: NewsArticle) {
  return Date.parse(left.publishedAt ?? left.ingestedAt) - Date.parse(right.publishedAt ?? right.ingestedAt);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}
