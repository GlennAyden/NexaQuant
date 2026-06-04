import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import YahooFinance from "yahoo-finance2";

const INPUT = path.join(process.cwd(), "data", "universe.csv");
const OUTPUT = INPUT;
const UNCLASSIFIED = "Unclassified";
const CONCURRENCY = 8;

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const yahooSectorMap = new Map([
  ["Basic Materials", "Basic Materials"],
  ["Communication Services", "Infrastructure"],
  ["Consumer Cyclical", "Consumer Cyclicals"],
  ["Consumer Defensive", "Consumer Non-Cyclicals"],
  ["Energy", "Energy"],
  ["Financial Services", "Financials"],
  ["Healthcare", "Healthcare"],
  ["Industrials", "Industrials"],
  ["Real Estate", "Properties & Real Estate"],
  ["Technology", "Technology"],
  ["Utilities", "Infrastructure"],
]);

const rows = parseCsvRows(readFileSync(INPUT, "utf8"));
const header = rows.shift();
if (!header) {
  throw new Error("data/universe.csv is empty");
}

const codeIndex = findColumn(header, "Code");
const nameIndex = findColumn(header, "Name");
const sectorIndex = findColumn(header, "Sector");
const sourceIndex = findColumn(header, "Source");

if ([codeIndex, nameIndex, sectorIndex, sourceIndex].some((index) => index < 0)) {
  throw new Error("data/universe.csv must keep Code,Name,Sector,Source columns");
}

const enriched = await mapLimit(rows, CONCURRENCY, async (row, index) => {
  const code = row[codeIndex]?.trim().toUpperCase();
  if (!code) {
    return row;
  }
  const originalSector = row[sectorIndex]?.trim() || UNCLASSIFIED;
  const originalSource = row[sourceIndex]?.trim() || "unclassified";

  const stockAnalysisSector = await getStockAnalysisSector(code);
  if (stockAnalysisSector) {
    row[sectorIndex] = stockAnalysisSector;
    row[sourceIndex] = "stockanalysis:company";
    return row;
  }

  const yahooSector = await getYahooSector(code);
  if (yahooSector) {
    row[sectorIndex] = yahooSector;
    row[sourceIndex] = "yahoo:assetProfile";
    return row;
  }

  row[sectorIndex] = originalSector;
  row[sourceIndex] = originalSource;
  console.warn(`No sector found for ${code} (${index + 1}/${rows.length})`);
  return row;
});

const tempOutput = `${OUTPUT}.tmp`;
writeFileSync(tempOutput, stringifyCsvRows([header, ...enriched]), "utf8");
renameSync(tempOutput, OUTPUT);

const classified = enriched.filter((row) => row[sectorIndex] !== UNCLASSIFIED).length;
const bySource = enriched.reduce((counts, row) => {
  const source = row[sourceIndex] || "unknown";
  counts[source] = (counts[source] ?? 0) + 1;
  return counts;
}, {});

console.log(JSON.stringify({
  rows: enriched.length,
  classified,
  unclassified: enriched.length - classified,
  bySource,
}, null, 2));

async function getStockAnalysisSector(code) {
  const url = `https://stockanalysis.com/quote/idx/${encodeURIComponent(code)}/company/`;
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "idx-structure-screener-personal/0.1",
      },
    });

    if (!response.ok) {
      return "";
    }

    const html = await response.text();
    const match = html.match(/>Sector<\/td><td[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    return decodeHtml(match?.[1] ?? "").trim();
  } catch {
    return "";
  }
}

async function getYahooSector(code) {
  try {
    const summary = await yahooFinance.quoteSummary(`${code}.JK`, {
      modules: ["assetProfile"],
    });
    const sector = summary.assetProfile?.sector?.trim();
    return sector ? yahooSectorMap.get(sector) ?? sector : "";
  } catch {
    return "";
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function findColumn(header, name) {
  return header.findIndex((column) => column.trim().toLowerCase() === name.toLowerCase());
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"" && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows;
}

function stringifyCsvRows(csvRows) {
  return `${csvRows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;
}

function escapeCsvCell(value) {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", "\"");
}
