import { createHash, randomUUID } from "node:crypto";

import newsSources from "@/lib/news/newsSources.json";
import type { NewsStore } from "@/lib/news/newsStore";
import { NEWS_FETCH_POLICY } from "@/lib/news/sourcePolicy";
import type { NewsEnrichmentRun, NewsIngestionRun, NewsSourceStatus } from "@/lib/news/types";

const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 40;
const USER_AGENT = "NexaQuantNewsBot/0.1 (+local research)";
const REQUEST_TIMEOUT_MS = NEWS_FETCH_POLICY.requestTimeoutMs;
const MAX_PAGES_PER_SOURCE = NEWS_FETCH_POLICY.maxPagesPerSource;
const MAX_FETCH_ATTEMPTS = NEWS_FETCH_POLICY.maxFetchAttempts;
const FETCH_RETRY_BACKOFF_MS = NEWS_FETCH_POLICY.retryBackoffMs;

type NewsSourceParser = "rss" | "emitennews-category" | "bisnis-category" | "investor-category" | "idx-disclosure";
type NewsSourcePagination = "html-next-link" | "path-page" | "rss-paged-query";

export type NewsSource = {
  id: string;
  name: string;
  category: string;
  url: string;
  archiveUrl?: string;
  parser: NewsSourceParser;
  pagination?: NewsSourcePagination;
  requiresKeywordMatch?: boolean;
  userAgent?: string;
};

type ParsedNewsItem = {
  title: string;
  link: string;
  publishedAt: string;
  excerpt: string;
};

type ArticleContentEnrichment = {
  excerpt: string;
  content: string;
  author: string | null;
  imageUrl: string | null;
  extractionStatus: "summary-only" | "extracted" | "failed";
  contentQualityScore: number;
};

export const DEFAULT_NEWS_KEYWORDS = [
  "IHSG",
  "BEI",
  "IDX",
  "rupiah",
  "Bank Indonesia",
  "BI rate",
  "net buy asing",
  "emiten",
  "saham",
  "bursa",
  "pasar modal",
  "asing",
  "obligasi",
  "yield",
  "IPO",
];

export const DEFAULT_NEWS_SOURCES = newsSources as NewsSource[];

export type NewsSyncOptions = {
  days?: number;
  limit?: number;
  keywords?: string[];
  sources?: string[];
  onProgress?: NewsSyncProgressHandler;
};

export type NewsSyncProgressSummary = {
  runId: string;
  status: NewsIngestionRun["status"];
  totalSources: number;
  completedSources: number;
  successCount: number;
  failedCount: number;
  totalCandidates: number;
  matchedCount: number;
  insertedCount: number;
  duplicateCount: number;
  filteredCount: number;
};

export type NewsSyncProgressEvent = {
  type: "run-started" | "source-started" | "page-started" | "page-completed" | "page-failed" | "source-updated" | "source-completed" | "run-completed";
  timestamp: string;
  runId: string;
  totalSources: number;
  sourceId?: string;
  sourceName?: string;
  sourceIndex?: number;
  pageNumber?: number;
  pageUrl?: string;
  pageItemCount?: number;
  newItemCount?: number;
  collectedItemCount?: number;
  oldestPublishedAt?: string | null;
  nextPageUrl?: string | null;
  stopReason?: string;
  error?: string;
  message: string;
  sourceStatus?: NewsSourceStatus;
  run?: NewsIngestionRun;
  summary: NewsSyncProgressSummary;
};

type NewsSyncProgressHandler = (event: NewsSyncProgressEvent) => void | Promise<void>;

export type NewsEnrichmentOptions = {
  limit?: number;
  onProgress?: NewsEnrichmentProgressHandler;
};

export type NewsEnrichmentProgressSummary = {
  runId: string;
  status: NewsEnrichmentRun["status"];
  totalArticles: number;
  processedCount: number;
  enrichedCount: number;
  skippedCount: number;
  failedCount: number;
  remainingCount: number;
};

export type NewsEnrichmentProgressEvent = {
  type: "enrichment-started" | "article-started" | "article-enriched" | "article-skipped" | "article-failed" | "enrichment-completed";
  timestamp: string;
  runId: string;
  articleId?: string;
  title?: string;
  index?: number;
  url?: string;
  extractionStatus?: ArticleContentEnrichment["extractionStatus"];
  contentQualityScore?: number;
  message: string;
  run?: NewsEnrichmentRun;
  summary: NewsEnrichmentProgressSummary;
};

type NewsEnrichmentProgressHandler = (event: NewsEnrichmentProgressEvent) => void | Promise<void>;

type SourcePageProgress = {
  type: "page-started" | "page-completed" | "page-failed";
  pageNumber: number;
  pageUrl: string;
  pageItemCount?: number;
  newItemCount?: number;
  collectedItemCount: number;
  oldestPublishedAt?: string | null;
  nextPageUrl?: string | null;
  stopReason?: string;
  error?: string;
};

export async function runNewsSync(store: NewsStore, options: NewsSyncOptions = {}): Promise<NewsIngestionRun> {
  const startedAt = new Date().toISOString();
  const run: NewsIngestionRun = {
    id: randomUUID(),
    startedAt,
    finishedAt: null,
    status: "running",
    totalSources: 0,
    successCount: 0,
    failedCount: 0,
    totalCandidates: 0,
    matchedCount: 0,
    insertedCount: 0,
    duplicateCount: 0,
    filteredCount: 0,
    error: {},
  };
  const days = positiveNumber(options.days, DEFAULT_DAYS);
  const perSourceLimit = positiveNumber(options.limit, DEFAULT_LIMIT);
  const keywords = normalizeKeywords(options.keywords ?? DEFAULT_NEWS_KEYWORDS);
  const requestedSources = new Set(options.sources ?? []);
  const sources = requestedSources.size === 0
    ? [...DEFAULT_NEWS_SOURCES]
    : DEFAULT_NEWS_SOURCES.filter((source) => requestedSources.has(source.id));
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const errors: Record<string, string> = {};

  run.totalSources = sources.length;
  store.createIngestionRun(run);
  await emitProgress(options.onProgress, run, {
    type: "run-started",
    message: `Mulai sync ${sources.length} sumber berita.`,
  });

  for (const [index, source] of sources.entries()) {
    const status = await ingestSource(store, source, {
      run,
      sourceIndex: index + 1,
      cutoff,
      perSourceLimit,
      keywords,
      onProgress: options.onProgress,
    });
    run.totalCandidates += status.itemsSeen;
    run.matchedCount += status.matchedCount;
    run.insertedCount += status.insertedCount;
    run.duplicateCount += status.duplicateCount;
    run.filteredCount += status.filteredCount;

    if (status.status === "success") {
      run.successCount += 1;
    } else {
      run.failedCount += 1;
      errors[source.id] = String(status.error ?? "unknown source error");
    }

    run.error = errors;
    store.updateIngestionRun(run);
    await emitProgress(options.onProgress, run, {
      type: "source-completed",
      sourceId: source.id,
      sourceName: source.name,
      sourceIndex: index + 1,
      sourceStatus: { ...status },
      message: `${source.name} selesai: ${status.matchedCount} cocok, ${status.insertedCount} baru, ${status.filteredCount} terfilter.`,
    });
  }

  run.status = run.successCount === 0 && run.failedCount > 0 ? "failed" : "completed";
  run.finishedAt = new Date().toISOString();
  run.error = errors;
  store.updateIngestionRun(run);
  await emitProgress(options.onProgress, run, {
    type: "run-completed",
    run: { ...run },
    message: `Sync selesai: ${run.insertedCount} artikel baru dari ${run.matchedCount} artikel cocok.`,
  });
  return run;
}

export async function runNewsEnrichmentBackfill(store: NewsStore, options: NewsEnrichmentOptions = {}): Promise<NewsEnrichmentRun> {
  const startedAt = new Date().toISOString();
  const limit = positiveNumber(options.limit, 25);
  const articles = store.getArticlesForEnrichment(limit);
  const run: NewsEnrichmentRun = {
    id: randomUUID(),
    startedAt,
    finishedAt: null,
    status: "running",
    totalArticles: articles.length,
    enrichedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    error: {},
  };
  const errors: Record<string, string> = {};

  store.createEnrichmentRun(run);
  await emitEnrichmentProgress(options.onProgress, run, {
    type: "enrichment-started",
    message: `Mulai enrich ${articles.length} artikel berkualitas rendah.`,
  });

  for (const [index, article] of articles.entries()) {
    await emitEnrichmentProgress(options.onProgress, run, {
      type: "article-started",
      articleId: article.id,
      title: article.title,
      index: index + 1,
      url: article.url,
      message: `Membuka artikel ${index + 1}/${articles.length}: ${article.title}`,
    });

    try {
      const source = DEFAULT_NEWS_SOURCES.find((item) => item.id === article.sourceId);
      const enrichment = await enrichArticleContent(source ?? {}, {
        title: article.title,
        link: article.url,
        publishedAt: article.publishedAt ?? article.ingestedAt,
        excerpt: article.excerpt,
      }, { forceFetch: true });

      if (enrichment.extractionStatus === "failed") {
        store.updateArticleEnrichment(article.id, enrichment);
        run.failedCount += 1;
        errors[article.id] = "content extraction failed";
        store.updateEnrichmentRun({ ...run, error: errors });
        await emitEnrichmentProgress(options.onProgress, run, {
          type: "article-failed",
          articleId: article.id,
          title: article.title,
          index: index + 1,
          url: article.url,
          extractionStatus: enrichment.extractionStatus,
          contentQualityScore: enrichment.contentQualityScore,
          message: `Gagal enrich: ${article.title}`,
        });
        continue;
      }

      const updated = store.updateArticleEnrichment(article.id, enrichment);
      if (!updated) {
        run.skippedCount += 1;
        store.updateEnrichmentRun({ ...run, error: errors });
        await emitEnrichmentProgress(options.onProgress, run, {
          type: "article-skipped",
          articleId: article.id,
          title: article.title,
          index: index + 1,
          url: article.url,
          extractionStatus: enrichment.extractionStatus,
          contentQualityScore: enrichment.contentQualityScore,
          message: `Artikel dilewati karena tidak ditemukan: ${article.title}`,
        });
        continue;
      }

      run.enrichedCount += 1;
      store.updateEnrichmentRun({ ...run, error: errors });
      await emitEnrichmentProgress(options.onProgress, run, {
        type: "article-enriched",
        articleId: article.id,
        title: article.title,
        index: index + 1,
        url: article.url,
        extractionStatus: enrichment.extractionStatus,
        contentQualityScore: enrichment.contentQualityScore,
        message: `Enriched: ${article.title}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      run.failedCount += 1;
      errors[article.id] = message;
      store.updateEnrichmentRun({ ...run, error: errors });
      await emitEnrichmentProgress(options.onProgress, run, {
        type: "article-failed",
        articleId: article.id,
        title: article.title,
        index: index + 1,
        url: article.url,
        message,
      });
    }
  }

  run.status = run.failedCount > 0 && run.enrichedCount === 0 ? "failed" : "completed";
  run.finishedAt = new Date().toISOString();
  run.error = errors;
  store.updateEnrichmentRun(run);
  await emitEnrichmentProgress(options.onProgress, run, {
    type: "enrichment-completed",
    run: { ...run },
    message: `Enrich selesai: ${run.enrichedCount} berhasil, ${run.failedCount} gagal, ${run.skippedCount} dilewati.`,
  });
  return run;
}

export function parseRssItems(xml: string): ParsedNewsItem[] {
  return matchBlocks(xml, "item").map((block) => {
    const title = cleanText(extractTag(block, "title"));
    const link = cleanText(extractTag(block, "link")) || cleanText(extractTag(block, "guid"));
    const publishedAt = cleanText(extractTag(block, "pubDate")) || cleanText(extractTag(block, "dc:date"));
    const excerpt = cleanText(extractTag(block, "description") || extractTag(block, "content:encoded"));
    return { title, link, publishedAt, excerpt };
  }).filter((item) => item.title && item.link);
}

export function parseEmitenNewsCategoryItems(html: string, referenceDate = new Date()): ParsedNewsItem[] {
  const pattern = /<a\b(?=[^>]*\bclass=["'][^"']*\bnews-card-2\b[^"']*\bsearch-result-item\b)(?=[^>]*\bhref=["'](https:\/\/emitennews\.com\/news\/[^"']+)["'])[^>]*>([\s\S]*?)<\/a>/gi;
  const items: ParsedNewsItem[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(pattern)) {
    const link = cleanText(match[1] ?? "");
    if (!link || seen.has(link)) {
      continue;
    }

    const body = match[2] ?? "";
    const title = cleanText(extractRegexGroup(body, /<p\b[^>]*class=["'][^"']*\bfs-16\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i));
    const excerpt = cleanEmitenNewsExcerpt(extractRegexGroup(body, /<!--\s*<p>([\s\S]*?)<\/p>\s*-->/i));
    const publishedAt = parseIndonesianPublishedAt(
      extractRegexGroup(body, /<span\b[^>]*class=["'][^"']*\bsmall\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),
      referenceDate,
    );

    if (title) {
      seen.add(link);
      items.push({ title, link, publishedAt, excerpt });
    }
  }

  return items;
}

export function parseBisnisCategoryItems(html: string, referenceDate = new Date()): ParsedNewsItem[] {
  const items: ParsedNewsItem[] = [];
  const seen = new Set<string>();
  const titleLinks = html.matchAll(/<a\b(?=[^>]*\bhref=["'](https:\/\/market\.bisnis\.com\/read\/[^"']+)["'])(?=[^>]*\bclass=["'][^"']*\bartLink\b[^"']*["'])[^>]*>\s*<h4\b[^>]*class=["'][^"']*\bartTitle\b[^"']*["'][^>]*>([\s\S]*?)<\/h4>\s*<\/a>/gi);

  for (const match of titleLinks) {
    const link = cleanText(match[1] ?? "");
    const title = cleanText(match[2] ?? "");
    const before = html.slice(Math.max(0, match.index - 900), match.index);
    const after = html.slice(match.index, match.index + 900);
    const publishedAt = parseIndonesianPublishedAt(extractNearestBisnisDate(before, after), referenceDate);

    if (link && title && !seen.has(link)) {
      seen.add(link);
      items.push({ title, link, publishedAt, excerpt: "" });
    }
  }

  return items;
}

export function parseInvestorCategoryItems(html: string, referenceDate = new Date()): ParsedNewsItem[] {
  const titlePattern = /<a\b[^>]*href=["'](\/(?:stock|corporate-action)\/[^"']+)["'][^>]*>\s*<(h3|h4)\b[^>]*>([\s\S]*?)<\/\2>\s*<\/a>/gi;
  const items: ParsedNewsItem[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(titlePattern)) {
    const link = toAbsoluteUrl(match[1] ?? "", "https://investor.id");
    const title = cleanText(match[3] ?? "");
    const before = html.slice(Math.max(0, match.index - 1_500), match.index);
    const after = html.slice(match.index, match.index + 1_500);
    const publishedAt = parseIndonesianPublishedAt(extractInvestorDate(before), referenceDate);
    const excerpt = cleanText(
      extractRegexGroup(after, /<(?:span|p)\b[^>]*class=["'][^"']*\btext-truncate-2-lines\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|p)>/i),
    );

    if (link && title && !seen.has(link)) {
      seen.add(link);
      items.push({ title, link, publishedAt, excerpt });
    }
  }

  const indexRowPattern = /<div\b[^>]*class=["'][^"']*\brow\b[^"']*\bmb-4\b[^"']*\bposition-relative\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\brow\b[^"']*\bmb-4\b[^"']*\bposition-relative\b|<nav\b|<\/main>|$)/gi;
  for (const rowMatch of html.matchAll(indexRowPattern)) {
    const row = rowMatch[1] ?? "";
    const rawLink = extractRegexGroup(row, /<a\b[^>]*href=["'](\/(?:stock|corporate-action)\/\d+[^"']*)["'][^>]*>/i);
    const link = toAbsoluteUrl(rawLink, "https://investor.id");
    const title = cleanText(
      extractRegexGroup(row, /<img\b[^>]*\balt=["']([^"']+)["'][^>]*>/i)
      || extractRegexGroup(row, /<(h3|h4)\b[^>]*>([\s\S]*?)<\/\1>/i, 2),
    );
    const publishedAt = parseIndonesianPublishedAt(extractInvestorDate(row), referenceDate);
    const excerpt = cleanText(
      extractRegexGroup(row, /<span\b[^>]*class=["'][^"']*\btext-muted\b[^"']*\btext-truncate-2-lines\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),
    );

    if (link && title && !seen.has(link)) {
      seen.add(link);
      items.push({ title, link, publishedAt, excerpt });
    }
  }

  return items;
}

export function parseIdxDisclosureItems(sourceText: string, referenceDate = new Date()): ParsedNewsItem[] {
  const trimmed = sourceText.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = safeJsonParse(trimmed);
    return parsed ? parseIdxDisclosureJson(parsed, referenceDate) : [];
  }

  return parseIdxDisclosureHtml(trimmed, referenceDate);
}

function parseIdxDisclosureJson(value: unknown, referenceDate: Date): ParsedNewsItem[] {
  return collectRecords(value)
    .map((record) => normalizeIdxDisclosureRecord(record, referenceDate))
    .filter((item): item is ParsedNewsItem => Boolean(item));
}

function parseIdxDisclosureHtml(html: string, referenceDate: Date): ParsedNewsItem[] {
  const items: ParsedNewsItem[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b(?=[^>]*\bhref=["']([^"']*(?:StaticData|NewsAndAnnouncement|Pengumuman|Announcement|media|Media)[^"']*)["'])[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = cleanText(match[1] ?? "");
    const title = cleanText(match[2] ?? "");
    if (!rawHref || !title) {
      continue;
    }

    const before = html.slice(Math.max(0, match.index - 1_200), match.index);
    const after = html.slice(match.index, match.index + 1_200);
    const publishedAt = parseIdxDisclosureDate(extractIdxDateCandidate(`${before} ${after}`), referenceDate);
    const link = toAbsoluteUrl(rawHref, "https://www.idx.co.id");
    const canonical = normalizeUrl(link);
    if (seen.has(canonical)) {
      continue;
    }
    seen.add(canonical);
    items.push({
      title,
      link,
      publishedAt,
      excerpt: title,
    });
  }

  return items;
}

function normalizeIdxDisclosureRecord(record: Record<string, unknown>, referenceDate: Date): ParsedNewsItem | null {
  const rawTitle = firstString(record, [
    "title",
    "Title",
    "pengumuman",
    "Pengumuman",
    "announcement",
    "Announcement",
    "AnnouncementTitle",
    "subject",
    "Subject",
    "perihal",
    "Perihal",
    "keterangan",
    "Keterangan",
    "namaPengumuman",
    "NamaPengumuman",
    "Description",
    "description",
  ]);
  const code = firstString(record, [
    "kodeEmiten",
    "KodeEmiten",
    "Kode_Emiten",
    "kode",
    "Kode",
    "code",
    "Code",
    "stockCode",
    "StockCode",
    "emiten",
    "Emiten",
  ]);
  const link = firstString(record, [
    "link",
    "Link",
    "url",
    "Url",
    "URL",
    "attachment",
    "Attachment",
    "attachments",
    "Attachments",
    "FilePath",
    "filePath",
    "File_Path",
    "Path",
    "DownloadUrl",
    "downloadUrl",
  ]);
  const rawDate = firstString(record, [
    "tanggal",
    "Tanggal",
    "date",
    "Date",
    "publishDate",
    "PublishDate",
    "createdDate",
    "CreatedDate",
    "TglPengumuman",
    "Date_Time",
  ]);

  const title = formatIdxDisclosureTitle(rawTitle, code);
  if (!title) {
    return null;
  }

  const officialUrl = link
    ? toAbsoluteUrl(link, "https://www.idx.co.id")
    : "https://www.idx.co.id/id/perusahaan-tercatat/keterbukaan-informasi";

  return {
    title,
    link: officialUrl,
    publishedAt: parseIdxDisclosureDate(rawDate, referenceDate),
    excerpt: title,
  };
}

function collectRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap(collectRecords);
  }
  if (!isPlainRecord(value)) {
    return [];
  }

  const recordValues = Object.values(value);
  const nestedArrays = recordValues
    .filter(Array.isArray)
    .flatMap(collectRecords);
  const hasScalarField = Object.values(value).some((item) => typeof item === "string" || typeof item === "number");

  return hasScalarField ? [value, ...nestedArrays] : nestedArrays;
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const extracted = stringifyDisclosureValue(value);
    if (extracted) {
      return extracted;
    }
  }
  return "";
}

function stringifyDisclosureValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return cleanText(String(value));
  }
  if (Array.isArray(value)) {
    return value.map(stringifyDisclosureValue).find(Boolean) ?? "";
  }
  if (isPlainRecord(value)) {
    return firstString(value, ["url", "Url", "URL", "link", "Link", "path", "Path", "file", "File", "name", "Name"]);
  }
  return "";
}

function formatIdxDisclosureTitle(rawTitle: string, code: string) {
  const title = cleanText(rawTitle);
  const normalizedCode = normalizeDisclosureCode(code);
  if (!title) {
    return "";
  }
  if (!normalizedCode || title.toUpperCase().includes(`[${normalizedCode}]`) || title.toUpperCase().includes(` ${normalizedCode} `)) {
    return title;
  }
  return `${title} [${normalizedCode}]`;
}

function normalizeDisclosureCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseIdxDisclosureDate(value: string, referenceDate: Date) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return "";
  }
  const direct = new Date(cleaned);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }
  return parseIndonesianPublishedAt(cleaned, referenceDate);
}

function extractIdxDateCandidate(value: string) {
  return extractRegexGroup(value, /\b(\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*(?:\||,)?\s*\d{1,2}:\d{2}\s*WIB)\b/i)
    || extractRegexGroup(value, /\b(\d{1,2}\/\d{1,2}\/\d{4},\s*\d{1,2}:\d{2}\s*WIB)\b/i)
    || extractRegexGroup(value, /\b(\d{4}-\d{2}-\d{2}T[^\s<"]+)\b/i)
    || "";
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeUrl(value: string) {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["fbclid", "gclid", "mibextid"].includes(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function extractKeywordMatches(text: string, keywords = DEFAULT_NEWS_KEYWORDS) {
  const haystack = text.toLocaleLowerCase("id-ID");
  return normalizeKeywords(keywords).filter((keyword) => haystack.includes(keyword.toLocaleLowerCase("id-ID")));
}

export async function enrichArticleContent(
  source: Pick<NewsSource, "userAgent">,
  item: ParsedNewsItem,
  options: { forceFetch?: boolean } = {},
): Promise<ArticleContentEnrichment> {
  if (item.excerpt.trim().length > 0 && !options.forceFetch) {
    return {
      excerpt: item.excerpt,
      content: item.excerpt,
      author: null,
      imageUrl: null,
      extractionStatus: "summary-only",
      contentQualityScore: scoreContentQuality(item.excerpt),
    };
  }

  try {
    const html = await fetchText(item.link, source.userAgent);
    const extracted = extractArticleContentFromHtml(html, item.link);
    const excerpt = item.excerpt || extracted.description;
    const content = extracted.content || excerpt;
    return {
      excerpt,
      content,
      author: extracted.author,
      imageUrl: extracted.imageUrl,
      extractionStatus: extracted.content ? "extracted" : excerpt ? "summary-only" : "failed",
      contentQualityScore: scoreContentQuality(content || excerpt),
    };
  } catch {
    return {
      excerpt: item.excerpt,
      content: item.excerpt,
      author: null,
      imageUrl: null,
      extractionStatus: "failed",
      contentQualityScore: scoreContentQuality(item.excerpt),
    };
  }
}

export function extractArticleContentFromHtml(html: string, pageUrl: string) {
  const description = cleanText(
    extractMetaContent(html, "description")
    || extractMetaProperty(html, "og:description")
    || extractMetaProperty(html, "twitter:description"),
  );
  const author = cleanText(
    extractMetaContent(html, "author")
    || extractMetaProperty(html, "article:author"),
  ) || null;
  const rawImageUrl = cleanText(extractMetaProperty(html, "og:image") || extractMetaProperty(html, "twitter:image"));
  const articleHtml = extractRegexGroup(html, /<article\b[^>]*>([\s\S]*?)<\/article>/i)
    || extractRegexGroup(html, /<main\b[^>]*>([\s\S]*?)<\/main>/i)
    || html;
  const content = [...articleHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanText(match[1] ?? ""))
    .filter((paragraph) => paragraph.length >= 40)
    .slice(0, 12)
    .join("\n\n");

  return {
    description,
    author,
    imageUrl: rawImageUrl ? toAbsoluteUrl(rawImageUrl, pageUrl) : null,
    content,
  };
}

export function scoreContentQuality(value: string) {
  const text = cleanText(value);
  if (!text) {
    return 0;
  }
  const lengthScore = Math.min(1, text.length / 1200);
  const sentenceCount = (text.match(/[.!?](\s|$)/g) ?? []).length;
  const sentenceScore = Math.min(1, sentenceCount / 8);
  return Number((lengthScore * 0.65 + sentenceScore * 0.35).toFixed(3));
}

async function ingestSource(
  store: NewsStore,
  source: NewsSource,
  options: {
    run: NewsIngestionRun;
    sourceIndex: number;
    cutoff: Date;
    perSourceLimit: number;
    keywords: string[];
    onProgress?: NewsSyncProgressHandler;
  },
): Promise<NewsSourceStatus> {
  const startedAt = new Date().toISOString();
  const status: NewsSourceStatus = {
    runId: options.run.id,
    sourceId: source.id,
    sourceName: source.name,
    status: "running",
    startedAt,
    finishedAt: null,
    itemsSeen: 0,
    matchedCount: 0,
    insertedCount: 0,
    duplicateCount: 0,
    filteredCount: 0,
    error: null,
  };
  store.upsertSourceStatus(status);
  await emitProgress(options.onProgress, options.run, {
    type: "source-started",
    sourceId: source.id,
    sourceName: source.name,
    sourceIndex: options.sourceIndex,
    sourceStatus: { ...status },
    message: `Mulai scraping ${source.name}.`,
  }, status);

  try {
    const items = await collectSourceItems(source, options.cutoff, async (page) => {
      status.itemsSeen = page.collectedItemCount;
      store.upsertSourceStatus(status);
      await emitProgress(options.onProgress, options.run, {
        type: page.type,
        sourceId: source.id,
        sourceName: source.name,
        sourceIndex: options.sourceIndex,
        pageNumber: page.pageNumber,
        pageUrl: page.pageUrl,
        pageItemCount: page.pageItemCount,
        newItemCount: page.newItemCount,
        collectedItemCount: page.collectedItemCount,
        oldestPublishedAt: page.oldestPublishedAt,
        nextPageUrl: page.nextPageUrl,
        stopReason: page.stopReason,
        error: page.error,
        sourceStatus: { ...status },
        message: formatPageProgressMessage(source.name, page),
      }, status);
    });
    if (items.length === 0) {
      throw new Error(`No parseable news items found at ${source.archiveUrl ?? source.url}`);
    }
    const ingestedAt = new Date().toISOString();
    status.itemsSeen = items.length;

    for (const item of items) {
      const publishedAt = toIsoDate(item.publishedAt);
      const withinWindow = !publishedAt || new Date(publishedAt) >= options.cutoff;
      const matches = extractKeywordMatches(`${item.title} ${item.excerpt}`, options.keywords);

      if (!withinWindow || (source.requiresKeywordMatch !== false && matches.length === 0)) {
        status.filteredCount += 1;
        continue;
      }

      const canonicalUrl = normalizeUrl(item.link);
      const enrichment = await enrichArticleContent(source, item);
      const inserted = store.insertArticleIfNew({
        sourceId: source.id,
        sourceName: source.name,
        sourceCategory: source.category,
        url: item.link,
        canonicalUrl,
        title: item.title,
        publishedAt,
        ingestedAt,
        excerpt: enrichment.excerpt,
        content: enrichment.content,
        author: enrichment.author,
        imageUrl: enrichment.imageUrl,
        extractionStatus: enrichment.extractionStatus,
        contentQualityScore: enrichment.contentQualityScore,
        contentHash: hashText(`${source.id}|${canonicalUrl}|${item.title}|${publishedAt ?? ""}`),
        matchedKeywords: matches,
      });
      status.matchedCount += 1;
      if (inserted) {
        status.insertedCount += 1;
      } else {
        status.duplicateCount += 1;
      }

      if (status.itemsSeen === status.filteredCount + status.matchedCount || (status.filteredCount + status.matchedCount) % 25 === 0) {
        store.upsertSourceStatus(status);
        await emitProgress(options.onProgress, options.run, {
          type: "source-updated",
          sourceId: source.id,
          sourceName: source.name,
          sourceIndex: options.sourceIndex,
          sourceStatus: { ...status },
          message: `${source.name}: ${status.matchedCount} cocok, ${status.insertedCount} baru, ${status.filteredCount} terfilter.`,
        }, status);
      }
    }

    status.status = "success";
  } catch (error) {
    status.status = "failed";
    status.error = error instanceof Error ? error.message : String(error);
  }

  status.finishedAt = new Date().toISOString();
  store.upsertSourceStatus(status);
  return status;
}

async function collectSourceItems(
  source: NewsSource,
  cutoff: Date,
  onPageProgress?: (event: SourcePageProgress) => void | Promise<void>,
) {
  const items: ParsedNewsItem[] = [];
  const seenItems = new Set<string>();
  const seenPages = new Set<string>();
  let pageUrl: string | null = source.archiveUrl ?? source.url;
  let pageNumber = 1;

  while (pageUrl && pageNumber <= MAX_PAGES_PER_SOURCE && !seenPages.has(pageUrl)) {
    seenPages.add(pageUrl);
    await onPageProgress?.({
      type: "page-started",
      pageNumber,
      pageUrl,
      collectedItemCount: items.length,
    });
    let sourceText = "";
    try {
      sourceText = await fetchText(pageUrl, source.userAgent);
    } catch (error) {
      await onPageProgress?.({
        type: "page-failed",
        pageNumber,
        pageUrl,
        collectedItemCount: items.length,
        error: error instanceof Error ? error.message : String(error),
        stopReason: items.length > 0 ? "Halaman lanjutan gagal diambil." : undefined,
      });
      if (items.length > 0) {
        break;
      }
      throw error;
    }
    const pageItems = parseSourceItems(source, sourceText);
    if (pageItems.length === 0) {
      await onPageProgress?.({
        type: "page-completed",
        pageNumber,
        pageUrl,
        pageItemCount: 0,
        newItemCount: 0,
        collectedItemCount: items.length,
        oldestPublishedAt: null,
        nextPageUrl: null,
        stopReason: "Tidak ada artikel yang bisa dibaca di halaman ini.",
      });
      break;
    }

    let oldestKnownPublishedAt: Date | null = null;
    let newItemCount = 0;

    for (const item of pageItems) {
      const canonicalUrl = normalizeUrl(item.link);
      const publishedAt = toIsoDate(item.publishedAt);
      if (publishedAt) {
        const publishedDate = new Date(publishedAt);
        if (!oldestKnownPublishedAt || publishedDate < oldestKnownPublishedAt) {
          oldestKnownPublishedAt = publishedDate;
        }
      }

      if (!seenItems.has(canonicalUrl)) {
        seenItems.add(canonicalUrl);
        items.push(item);
        newItemCount += 1;
      }
    }

    let nextPageUrl: string | null = null;
    let stopReason: string | undefined;
    if (oldestKnownPublishedAt && oldestKnownPublishedAt < cutoff) {
      stopReason = "Artikel paling lama sudah melewati rentang waktu.";
    } else if (newItemCount === 0) {
      stopReason = "Tidak ada artikel baru di halaman ini.";
    } else {
      nextPageUrl = getNextPageUrl(source, sourceText, pageUrl, pageNumber);
      if (!nextPageUrl) {
        stopReason = "Tidak ada halaman berikutnya.";
      }
    }

    await onPageProgress?.({
      type: "page-completed",
      pageNumber,
      pageUrl,
      pageItemCount: pageItems.length,
      newItemCount,
      collectedItemCount: items.length,
      oldestPublishedAt: oldestKnownPublishedAt?.toISOString() ?? null,
      nextPageUrl,
      stopReason,
    });

    if (stopReason) {
      break;
    }

    pageUrl = nextPageUrl;
    pageNumber += 1;
  }

  return items;
}

async function emitProgress(
  onProgress: NewsSyncProgressHandler | undefined,
  run: NewsIngestionRun,
  event: Omit<NewsSyncProgressEvent, "timestamp" | "runId" | "totalSources" | "summary">,
  currentStatus?: NewsSourceStatus,
) {
  if (!onProgress) {
    return;
  }

  await onProgress({
    ...event,
    timestamp: new Date().toISOString(),
    runId: run.id,
    totalSources: run.totalSources,
    summary: buildProgressSummary(run, currentStatus),
  });
}

function buildProgressSummary(run: NewsIngestionRun, currentStatus?: NewsSourceStatus): NewsSyncProgressSummary {
  const completedSources = run.successCount + run.failedCount;
  const activeItemsSeen = currentStatus?.status === "running" ? currentStatus.itemsSeen : 0;
  const activeMatched = currentStatus?.status === "running" ? currentStatus.matchedCount : 0;
  const activeInserted = currentStatus?.status === "running" ? currentStatus.insertedCount : 0;
  const activeDuplicate = currentStatus?.status === "running" ? currentStatus.duplicateCount : 0;
  const activeFiltered = currentStatus?.status === "running" ? currentStatus.filteredCount : 0;

  return {
    runId: run.id,
    status: run.status,
    totalSources: run.totalSources,
    completedSources,
    successCount: run.successCount,
    failedCount: run.failedCount,
    totalCandidates: run.totalCandidates + activeItemsSeen,
    matchedCount: run.matchedCount + activeMatched,
    insertedCount: run.insertedCount + activeInserted,
    duplicateCount: run.duplicateCount + activeDuplicate,
    filteredCount: run.filteredCount + activeFiltered,
  };
}

async function emitEnrichmentProgress(
  onProgress: NewsEnrichmentProgressHandler | undefined,
  run: NewsEnrichmentRun,
  event: Omit<NewsEnrichmentProgressEvent, "timestamp" | "runId" | "summary">,
) {
  if (!onProgress) {
    return;
  }

  await onProgress({
    ...event,
    timestamp: new Date().toISOString(),
    runId: run.id,
    summary: buildEnrichmentProgressSummary(run),
  });
}

function buildEnrichmentProgressSummary(run: NewsEnrichmentRun): NewsEnrichmentProgressSummary {
  const processedCount = run.enrichedCount + run.skippedCount + run.failedCount;
  return {
    runId: run.id,
    status: run.status,
    totalArticles: run.totalArticles,
    processedCount,
    enrichedCount: run.enrichedCount,
    skippedCount: run.skippedCount,
    failedCount: run.failedCount,
    remainingCount: Math.max(0, run.totalArticles - processedCount),
  };
}

function formatPageProgressMessage(sourceName: string, page: SourcePageProgress) {
  if (page.type === "page-started") {
    return `${sourceName}: membuka halaman ${page.pageNumber}.`;
  }

  if (page.type === "page-failed") {
    return `${sourceName}: halaman ${page.pageNumber} gagal dibuka.`;
  }

  const found = page.pageItemCount ?? 0;
  const next = page.stopReason ? ` ${page.stopReason}` : "";
  return `${sourceName}: halaman ${page.pageNumber} selesai, ${found} artikel ditemukan.${next}`;
}

async function fetchText(url: string, userAgent = USER_AGENT) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "user-agent": userAgent },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(message);
      if (attempt === MAX_FETCH_ATTEMPTS) {
        throw new Error(`${lastError.message} after ${attempt} attempts`);
      }
      await waitForFetchRetry(attempt);
      continue;
    }

    if (response.ok) {
      return response.text();
    }

    const message = `HTTP ${response.status} from ${url}`;
    if (!isRetryableFetchStatus(response.status)) {
      throw new Error(message);
    }

    lastError = new Error(message);
    if (attempt === MAX_FETCH_ATTEMPTS) {
      throw new Error(`${message} after ${attempt} attempts`);
    }
    await waitForFetchRetry(attempt);
  }

  throw lastError ?? new Error(`Unable to fetch ${url}`);
}

function isRetryableFetchStatus(status: number) {
  return status === 429 || status >= 500;
}

function waitForFetchRetry(attempt: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, FETCH_RETRY_BACKOFF_MS * attempt);
  });
}

function parseSourceItems(source: NewsSource, sourceText: string) {
  switch (source.parser) {
    case "idx-disclosure":
      return parseIdxDisclosureItems(sourceText);
    case "emitennews-category":
      return parseEmitenNewsCategoryItems(sourceText);
    case "bisnis-category":
      return parseBisnisCategoryItems(sourceText);
    case "investor-category":
      return parseInvestorCategoryItems(sourceText);
    default:
      return parseRssItems(sourceText);
  }
}

function getNextPageUrl(source: NewsSource, html: string, currentUrl: string, currentPage: number) {
  switch (source.pagination) {
    case "html-next-link":
      return extractHtmlNextUrl(html, currentUrl);
    case "path-page":
      return buildPathPageUrl(source.archiveUrl ?? source.url, currentPage + 1);
    case "rss-paged-query":
      return buildPagedFeedUrl(source.url, currentPage + 1);
    default:
      return null;
  }
}

function extractHtmlNextUrl(html: string, currentUrl: string) {
  const nextPatterns = [
    /<a\b(?=[^>]*\brel=["']next["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i,
    /<a\b(?=[^>]*\bhref=["']([^"']+)["'])(?=[^>]*\brel=["']next["'])[^>]*>/i,
  ];
  for (const pattern of nextPatterns) {
    const nextUrl = cleanText(extractRegexGroup(html, pattern));
    if (nextUrl && nextUrl !== "#") {
      return toAbsoluteUrl(nextUrl, currentUrl);
    }
  }
  return null;
}

function buildPathPageUrl(firstPageUrl: string, nextPage: number) {
  const baseUrl = firstPageUrl.replace(/\/\d+\/?$/, "").replace(/\/$/, "");
  return nextPage <= 1 ? baseUrl : `${baseUrl}/${nextPage}`;
}

function buildPagedFeedUrl(firstPageUrl: string, nextPage: number) {
  try {
    const url = new URL(firstPageUrl);
    url.searchParams.set("paged", String(nextPage));
    return url.toString();
  } catch {
    return null;
  }
}

function matchBlocks(xml: string, tag: string) {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function extractTag(block: string, tag: string) {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return pattern.exec(block)?.[1] ?? "";
}

function cleanText(value: string) {
  return decodeEntities(stripCdata(value)).replace(/<[^>]+>/g, " ").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function cleanEmitenNewsExcerpt(value: string) {
  return cleanText(value).replace(/^EmitenNews\.com\s*-\s*/i, "");
}

function stripCdata(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function toIsoDate(value: string) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseIndonesianPublishedAt(value: string, referenceDate: Date) {
  const text = cleanText(value).toLocaleLowerCase("id-ID");
  if (!text) {
    return "";
  }

  const absolute = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})\s*wib$/.exec(text);
  if (absolute) {
    const [, rawDay, rawMonth, rawYear, rawHour, rawMinute] = absolute;
    const utcTime = Date.UTC(
      Number(rawYear),
      Number(rawMonth) - 1,
      Number(rawDay),
      Number(rawHour) - 7,
      Number(rawMinute),
    );
    return new Date(utcTime).toISOString();
  }

  const monthName = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})\s*(?:\||,)?\s*(\d{1,2}):(\d{2})\s*wib$/.exec(text);
  if (monthName) {
    const [, rawDay, rawMonth, rawYear, rawHour, rawMinute] = monthName;
    const month = getIndonesianMonth(rawMonth);
    if (month !== null) {
      const utcTime = Date.UTC(
        Number(rawYear),
        month,
        Number(rawDay),
        Number(rawHour) - 7,
        Number(rawMinute),
      );
      return new Date(utcTime).toISOString();
    }
  }

  if (text === "baru saja") {
    return referenceDate.toISOString();
  }

  const relative = /^(\d+)\s+(detik|menit|jam|hari|minggu)\s+yang\s+lalu$/.exec(text);
  if (relative) {
    const amount = Number(relative[1]);
    const unitMs: Record<string, number> = {
      detik: 1_000,
      menit: 60_000,
      jam: 3_600_000,
      hari: 86_400_000,
      minggu: 604_800_000,
    };
    return new Date(referenceDate.getTime() - amount * unitMs[relative[2]]).toISOString();
  }

  return text;
}

function extractRegexGroup(value: string, pattern: RegExp, group = 1) {
  const match = pattern.exec(value);
  return match?.[group] ?? "";
}

function extractMetaContent(html: string, name: string) {
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\bname=["']${escapeRegExp(name)}["'])(?=[^>]*\\bcontent=["']([^"']*)["'])[^>]*>`, "i");
  return extractRegexGroup(html, pattern);
}

function extractMetaProperty(html: string, property: string) {
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\bproperty=["']${escapeRegExp(property)}["'])(?=[^>]*\\bcontent=["']([^"']*)["'])[^>]*>`, "i");
  return extractRegexGroup(html, pattern);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractNearestBisnisDate(before: string, after: string) {
  const beforeDates = [...before.matchAll(/<div\b[^>]*class=["'][^"']*\bartDate\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)];
  const latestBeforeDate = beforeDates.at(-1)?.[1];
  if (latestBeforeDate) {
    return latestBeforeDate;
  }
  return extractRegexGroup(after, /<div\b[^>]*class=["'][^"']*\bartDate\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
}

function extractInvestorDate(value: string) {
  const smallDates = [...value.matchAll(/<span\b[^>]*class=["'][^"']*\btext-muted\b[^"']*\bsmall\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)];
  const latestSmallDate = smallDates.at(-1)?.[1];
  if (latestSmallDate) {
    return latestSmallDate;
  }
  const pipeDate = /\|\s*([^<|]+?(?:yang lalu|wib))\s*$/i.exec(value);
  return pipeDate?.[1] ?? "";
}

function toAbsoluteUrl(value: string, base: string) {
  try {
    return new URL(value, base).toString();
  } catch {
    return value.trim();
  }
}

function getIndonesianMonth(value: string) {
  const months: Record<string, number> = {
    jan: 0,
    januari: 0,
    feb: 1,
    februari: 1,
    mar: 2,
    maret: 2,
    apr: 3,
    april: 3,
    mei: 4,
    jun: 5,
    juni: 5,
    jul: 6,
    juli: 6,
    agu: 7,
    ags: 7,
    agustus: 7,
    sep: 8,
    september: 8,
    okt: 9,
    oktober: 9,
    nov: 10,
    november: 10,
    des: 11,
    desember: 11,
  };
  return months[value] ?? null;
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeKeywords(keywords: string[]) {
  return [...new Set(keywords.map((keyword) => String(keyword).trim()).filter(Boolean))];
}

function positiveNumber(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value && value > 0 ? value : fallback;
}
