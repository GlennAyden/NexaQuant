import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Database from "better-sqlite3";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "market.db");
const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 40;
const USER_AGENT = "NexaQuantNewsBot/0.1 (+local research)";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PAGES_PER_SOURCE = 100;
const MAX_FETCH_ATTEMPTS = 3;
const FETCH_RETRY_BACKOFF_MS = 25;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const NEWS_SOURCES_PATH = path.join(SCRIPT_DIR, "..", "src", "lib", "news", "newsSources.json");

const DEFAULT_KEYWORDS = [
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

export const DEFAULT_SOURCES = readNewsSources();

function readNewsSources() {
  const parsed = JSON.parse(readFileSync(NEWS_SOURCES_PATH, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`News source catalog must be an array: ${NEWS_SOURCES_PATH}`);
  }
  for (const source of parsed) {
    if (!source || typeof source !== "object" || typeof source.id !== "string" || typeof source.url !== "string" || typeof source.parser !== "string") {
      throw new Error(`Invalid news source catalog entry in ${NEWS_SOURCES_PATH}`);
    }
  }
  return parsed;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const db = new Database(options.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrateNewsTables(db);

  const result = await runNewsSync(db, options);
  db.close();

  console.log(JSON.stringify(result, null, 2));
  if (result.failedCount > 0 && result.insertedCount === 0) {
    process.exitCode = 1;
  }
}

export async function runNewsSync(db, options = {}) {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const days = positiveNumber(options.days, DEFAULT_DAYS);
  const perSourceLimit = positiveNumber(options.limit, DEFAULT_LIMIT);
  const keywords = normalizeKeywords(options.keywords ?? DEFAULT_KEYWORDS);
  const requestedSources = new Set(options.sources ?? []);
  const sources = requestedSources.size === 0
    ? DEFAULT_SOURCES
    : DEFAULT_SOURCES.filter((source) => requestedSources.has(source.id));
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const totals = {
    runId,
    status: "running",
    startedAt,
    finishedAt: null,
    totalSources: sources.length,
    successCount: 0,
    failedCount: 0,
    totalCandidates: 0,
    matchedCount: 0,
    insertedCount: 0,
    duplicateCount: 0,
    filteredCount: 0,
    errors: {},
  };

  insertRun(db, totals);

  for (const source of sources) {
    const sourceResult = await ingestSource(db, source, { cutoff, keywords, perSourceLimit, runId });
    totals.totalCandidates += sourceResult.itemsSeen;
    totals.matchedCount += sourceResult.matchedCount;
    totals.insertedCount += sourceResult.insertedCount;
    totals.duplicateCount += sourceResult.duplicateCount;
    totals.filteredCount += sourceResult.filteredCount;

    if (sourceResult.status === "success") {
      totals.successCount += 1;
    } else {
      totals.failedCount += 1;
      totals.errors[source.id] = sourceResult.error;
    }

    updateRun(db, totals);
  }

  totals.status = totals.successCount === 0 && totals.failedCount > 0 ? "failed" : "completed";
  totals.finishedAt = new Date().toISOString();
  updateRun(db, totals);
  return totals;
}

async function ingestSource(db, source, options) {
  const startedAt = new Date().toISOString();
  const status = {
    runId: options.runId,
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
  upsertSourceStatus(db, status);

  try {
    const items = await collectSourceItems(source, options.cutoff);
    if (items.length === 0) {
      throw new Error(`No parseable news items found at ${source.archiveUrl ?? source.url}`);
    }
    status.itemsSeen = items.length;

    const insert = db.prepare(`
      INSERT OR IGNORE INTO news_articles (
        id, source_id, source_name, source_category, url, canonical_url, title,
        published_at, ingested_at, excerpt, content_hash, matched_keywords, status
      )
      VALUES (
        @id, @sourceId, @sourceName, @sourceCategory, @url, @canonicalUrl, @title,
        @publishedAt, @ingestedAt, @excerpt, @contentHash, @matchedKeywords, @status
      )
    `);

    const ingestedAt = new Date().toISOString();
    for (const item of items) {
      const publishedAt = toIsoDate(item.publishedAt);
      const withinWindow = !publishedAt || new Date(publishedAt) >= options.cutoff;
      const matches = extractKeywordMatches(`${item.title} ${item.excerpt}`, options.keywords);

      if (!withinWindow || (source.requiresKeywordMatch !== false && matches.length === 0)) {
        status.filteredCount += 1;
        continue;
      }

      const canonicalUrl = normalizeUrl(item.link);
      const contentHash = hashText(`${source.id}|${canonicalUrl}|${item.title}|${publishedAt ?? ""}`);
      const record = {
        id: randomUUID(),
        sourceId: source.id,
        sourceName: source.name,
        sourceCategory: source.category,
        url: item.link,
        canonicalUrl,
        title: item.title,
        publishedAt,
        ingestedAt,
        excerpt: item.excerpt,
        contentHash,
        matchedKeywords: JSON.stringify(matches),
        status: "active",
      };
      const result = insert.run(record);
      status.matchedCount += 1;
      if (result.changes === 1) {
        status.insertedCount += 1;
      } else {
        status.duplicateCount += 1;
      }
    }

    status.status = "success";
  } catch (error) {
    status.status = "failed";
    status.error = error instanceof Error ? error.message : String(error);
  }

  status.finishedAt = new Date().toISOString();
  upsertSourceStatus(db, status);
  return status;
}

export function parseRssItems(xml) {
  return matchBlocks(xml, "item").map((block) => {
    const title = cleanText(extractTag(block, "title"));
    const link = cleanText(extractTag(block, "link")) || cleanText(extractTag(block, "guid"));
    const publishedAt = cleanText(extractTag(block, "pubDate")) || cleanText(extractTag(block, "dc:date"));
    const excerpt = cleanText(extractTag(block, "description") || extractTag(block, "content:encoded"));
    return { title, link, publishedAt, excerpt };
  }).filter((item) => item.title && item.link);
}

export function parseEmitenNewsCategoryItems(html, referenceDate = new Date()) {
  const pattern = /<a\b(?=[^>]*\bclass=["'][^"']*\bnews-card-2\b[^"']*\bsearch-result-item\b)(?=[^>]*\bhref=["'](https:\/\/emitennews\.com\/news\/[^"']+)["'])[^>]*>([\s\S]*?)<\/a>/gi;
  const items = [];
  const seen = new Set();

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

export function parseBisnisCategoryItems(html, referenceDate = new Date()) {
  const items = [];
  const seen = new Set();
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

export function parseInvestorCategoryItems(html, referenceDate = new Date()) {
  const titlePattern = /<a\b[^>]*href=["'](\/(?:stock|corporate-action)\/[^"']+)["'][^>]*>\s*<(h3|h4)\b[^>]*>([\s\S]*?)<\/\2>\s*<\/a>/gi;
  const items = [];
  const seen = new Set();

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

export function parseIdxDisclosureItems(sourceText, referenceDate = new Date()) {
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

function parseIdxDisclosureJson(value, referenceDate) {
  return collectRecords(value)
    .map((record) => normalizeIdxDisclosureRecord(record, referenceDate))
    .filter(Boolean);
}

function parseIdxDisclosureHtml(html, referenceDate) {
  const items = [];
  const seen = new Set();
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

function normalizeIdxDisclosureRecord(record, referenceDate) {
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

function collectRecords(value) {
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
  const hasScalarField = recordValues.some((item) => typeof item === "string" || typeof item === "number");

  return hasScalarField ? [value, ...nestedArrays] : nestedArrays;
}

function firstString(record, keys) {
  for (const key of keys) {
    const value = record[key];
    const extracted = stringifyDisclosureValue(value);
    if (extracted) {
      return extracted;
    }
  }
  return "";
}

function stringifyDisclosureValue(value) {
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

function formatIdxDisclosureTitle(rawTitle, code) {
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

function normalizeDisclosureCode(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseIdxDisclosureDate(value, referenceDate) {
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

function extractIdxDateCandidate(value) {
  return extractRegexGroup(value, /\b(\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*(?:\||,)?\s*\d{1,2}:\d{2}\s*WIB)\b/i)
    || extractRegexGroup(value, /\b(\d{1,2}\/\d{1,2}\/\d{4},\s*\d{1,2}:\d{2}\s*WIB)\b/i)
    || extractRegexGroup(value, /\b(\d{4}-\d{2}-\d{2}T[^\s<"]+)\b/i)
    || "";
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isPlainRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeUrl(value) {
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

export function extractKeywordMatches(text, keywords = DEFAULT_KEYWORDS) {
  const haystack = text.toLocaleLowerCase("id-ID");
  return normalizeKeywords(keywords).filter((keyword) => haystack.includes(keyword.toLocaleLowerCase("id-ID")));
}

export function migrateNewsTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS news_articles (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_category TEXT NOT NULL,
      url TEXT NOT NULL,
      canonical_url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      published_at TEXT,
      ingested_at TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      content_hash TEXT NOT NULL UNIQUE,
      matched_keywords TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news_ingestion_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      total_sources INTEGER NOT NULL,
      success_count INTEGER NOT NULL,
      failed_count INTEGER NOT NULL,
      total_candidates INTEGER NOT NULL,
      matched_count INTEGER NOT NULL,
      inserted_count INTEGER NOT NULL,
      duplicate_count INTEGER NOT NULL,
      filtered_count INTEGER NOT NULL,
      error_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news_source_status (
      run_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      items_seen INTEGER NOT NULL,
      matched_count INTEGER NOT NULL,
      inserted_count INTEGER NOT NULL,
      duplicate_count INTEGER NOT NULL,
      filtered_count INTEGER NOT NULL,
      error_json TEXT NOT NULL,
      PRIMARY KEY (run_id, source_id)
    );

    CREATE INDEX IF NOT EXISTS idx_news_articles_published_source
      ON news_articles (published_at, source_id);

    CREATE INDEX IF NOT EXISTS idx_news_articles_ingested
      ON news_articles (ingested_at);
  `);
}

function insertRun(db, run) {
  db.prepare(`
    INSERT INTO news_ingestion_runs (
      id, started_at, finished_at, status, total_sources, success_count, failed_count,
      total_candidates, matched_count, inserted_count, duplicate_count, filtered_count, error_json
    )
    VALUES (
      @runId, @startedAt, @finishedAt, @status, @totalSources, @successCount, @failedCount,
      @totalCandidates, @matchedCount, @insertedCount, @duplicateCount, @filteredCount, @errorJson
    )
  `).run(toRunRow(run));
}

function updateRun(db, run) {
  db.prepare(`
    UPDATE news_ingestion_runs SET
      finished_at = @finishedAt,
      status = @status,
      success_count = @successCount,
      failed_count = @failedCount,
      total_candidates = @totalCandidates,
      matched_count = @matchedCount,
      inserted_count = @insertedCount,
      duplicate_count = @duplicateCount,
      filtered_count = @filteredCount,
      error_json = @errorJson
    WHERE id = @runId
  `).run(toRunRow(run));
}

function upsertSourceStatus(db, status) {
  db.prepare(`
    INSERT INTO news_source_status (
      run_id, source_id, source_name, status, started_at, finished_at,
      items_seen, matched_count, inserted_count, duplicate_count, filtered_count, error_json
    )
    VALUES (
      @runId, @sourceId, @sourceName, @status, @startedAt, @finishedAt,
      @itemsSeen, @matchedCount, @insertedCount, @duplicateCount, @filteredCount, @errorJson
    )
    ON CONFLICT(run_id, source_id) DO UPDATE SET
      status = excluded.status,
      finished_at = excluded.finished_at,
      items_seen = excluded.items_seen,
      matched_count = excluded.matched_count,
      inserted_count = excluded.inserted_count,
      duplicate_count = excluded.duplicate_count,
      filtered_count = excluded.filtered_count,
      error_json = excluded.error_json
  `).run({ ...status, errorJson: JSON.stringify(status.error) });
}

function toRunRow(run) {
  return { ...run, errorJson: JSON.stringify(run.errors ?? {}) };
}

async function collectSourceItems(source, cutoff) {
  const items = [];
  const seenItems = new Set();
  const seenPages = new Set();
  let pageUrl = source.archiveUrl ?? source.url;
  let pageNumber = 1;

  while (pageUrl && pageNumber <= MAX_PAGES_PER_SOURCE && !seenPages.has(pageUrl)) {
    seenPages.add(pageUrl);
    let sourceText = "";
    try {
      sourceText = await fetchText(pageUrl, source.userAgent);
    } catch (error) {
      if (items.length > 0) {
        break;
      }
      throw error;
    }
    const pageItems = parseSourceItems(source, sourceText);
    if (pageItems.length === 0) {
      break;
    }

    let oldestKnownPublishedAt = null;
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

    if (oldestKnownPublishedAt && oldestKnownPublishedAt < cutoff) {
      break;
    }

    if (newItemCount === 0) {
      break;
    }

    pageUrl = getNextPageUrl(source, sourceText, pageUrl, pageNumber);
    pageNumber += 1;
  }

  return items;
}

async function fetchText(url, userAgent = USER_AGENT) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    let response;
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

function isRetryableFetchStatus(status) {
  return status === 429 || status >= 500;
}

function waitForFetchRetry(attempt) {
  return new Promise((resolve) => {
    setTimeout(resolve, FETCH_RETRY_BACKOFF_MS * attempt);
  });
}

function parseSourceItems(source, sourceText) {
  switch (source.parser) {
    case "emitennews-category":
      return parseEmitenNewsCategoryItems(sourceText);
    case "bisnis-category":
      return parseBisnisCategoryItems(sourceText);
    case "investor-category":
      return parseInvestorCategoryItems(sourceText);
    case "idx-disclosure":
      return parseIdxDisclosureItems(sourceText);
    default:
      return parseRssItems(sourceText);
  }
}

function getNextPageUrl(source, html, currentUrl, currentPage) {
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

function extractHtmlNextUrl(html, currentUrl) {
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

function buildPathPageUrl(firstPageUrl, nextPage) {
  const baseUrl = firstPageUrl.replace(/\/\d+\/?$/, "").replace(/\/$/, "");
  return nextPage <= 1 ? baseUrl : `${baseUrl}/${nextPage}`;
}

function buildPagedFeedUrl(firstPageUrl, nextPage) {
  try {
    const url = new URL(firstPageUrl);
    url.searchParams.set("paged", String(nextPage));
    return url.toString();
  } catch {
    return null;
  }
}

function parseCliArgs(args) {
  const options = {
    dbPath: DEFAULT_DB_PATH,
    days: DEFAULT_DAYS,
    limit: DEFAULT_LIMIT,
    keywords: DEFAULT_KEYWORDS,
    sources: [],
  };

  for (const arg of args) {
    const [key, rawValue = ""] = arg.split("=");
    const value = rawValue.trim();
    if (key === "--db" && value) {
      options.dbPath = path.resolve(value);
    } else if (key === "--days" && value) {
      options.days = Number(value);
    } else if (key === "--limit" && value) {
      options.limit = Number(value);
    } else if (key === "--keywords" && value) {
      options.keywords = value.split(",");
    } else if (key === "--source" && value) {
      options.sources.push(value);
    }
  }

  return options;
}

function matchBlocks(xml, tag) {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const blocks = [];
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function extractTag(block, tag) {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  return pattern.exec(block)?.[1] ?? "";
}

function cleanText(value) {
  return decodeEntities(stripCdata(value)).replace(/<[^>]+>/g, " ").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function cleanEmitenNewsExcerpt(value) {
  return cleanText(value).replace(/^EmitenNews\.com\s*-\s*/i, "");
}

function stripCdata(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseIndonesianPublishedAt(value, referenceDate) {
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
    const unitMs = {
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

function extractRegexGroup(value, pattern, group = 1) {
  const match = pattern.exec(value);
  return match?.[group] ?? "";
}

function extractNearestBisnisDate(before, after) {
  const beforeDates = [...before.matchAll(/<div\b[^>]*class=["'][^"']*\bartDate\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)];
  const latestBeforeDate = beforeDates.at(-1)?.[1];
  if (latestBeforeDate) {
    return latestBeforeDate;
  }
  return extractRegexGroup(after, /<div\b[^>]*class=["'][^"']*\bartDate\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
}

function extractInvestorDate(value) {
  const smallDates = [...value.matchAll(/<span\b[^>]*class=["'][^"']*\btext-muted\b[^"']*\bsmall\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)];
  const latestSmallDate = smallDates.at(-1)?.[1];
  if (latestSmallDate) {
    return latestSmallDate;
  }
  const pipeDate = /\|\s*([^<|]+?(?:yang lalu|wib))\s*$/i.exec(value);
  return pipeDate?.[1] ?? "";
}

function toAbsoluteUrl(value, base) {
  try {
    return new URL(value, base).toString();
  } catch {
    return value.trim();
  }
}

function getIndonesianMonth(value) {
  const months = {
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

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeKeywords(keywords) {
  return [...new Set(keywords.map((keyword) => String(keyword).trim()).filter(Boolean))];
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
