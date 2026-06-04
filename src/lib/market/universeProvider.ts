import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { SymbolRecord } from "@/lib/market/types";

export type UniverseProvider = {
  loadSymbols(): Promise<SymbolRecord[]>;
};

export const fallbackIdxSymbols: SymbolRecord[] = [
  ["AALI", "Astra Agro Lestari Tbk", "Consumer Non-Cyclicals"],
  ["ADRO", "Alamtri Resources Indonesia Tbk", "Energy"],
  ["AKRA", "AKR Corporindo Tbk", "Energy"],
  ["AMRT", "Sumber Alfaria Trijaya Tbk", "Consumer Non-Cyclicals"],
  ["ANTM", "Aneka Tambang Tbk", "Basic Materials"],
  ["ARTO", "Bank Jago Tbk", "Financials"],
  ["ASII", "Astra International Tbk", "Industrials"],
  ["BBCA", "Bank Central Asia Tbk", "Financials"],
  ["BBNI", "Bank Negara Indonesia Tbk", "Financials"],
  ["BBRI", "Bank Rakyat Indonesia Tbk", "Financials"],
  ["BMRI", "Bank Mandiri Tbk", "Financials"],
  ["BRPT", "Barito Pacific Tbk", "Basic Materials"],
  ["BUKA", "Bukalapak.com Tbk", "Technology"],
  ["CPIN", "Charoen Pokphand Indonesia Tbk", "Consumer Non-Cyclicals"],
  ["GOTO", "GoTo Gojek Tokopedia Tbk", "Technology"],
  ["ICBP", "Indofood CBP Sukses Makmur Tbk", "Consumer Non-Cyclicals"],
  ["INCO", "Vale Indonesia Tbk", "Basic Materials"],
  ["INDF", "Indofood Sukses Makmur Tbk", "Consumer Non-Cyclicals"],
  ["INKP", "Indah Kiat Pulp & Paper Tbk", "Basic Materials"],
  ["ITMG", "Indo Tambangraya Megah Tbk", "Energy"],
  ["KLBF", "Kalbe Farma Tbk", "Healthcare"],
  ["MDKA", "Merdeka Copper Gold Tbk", "Basic Materials"],
  ["MEDC", "Medco Energi Internasional Tbk", "Energy"],
  ["PGAS", "Perusahaan Gas Negara Tbk", "Energy"],
  ["PTBA", "Bukit Asam Tbk", "Energy"],
  ["SMGR", "Semen Indonesia Tbk", "Basic Materials"],
  ["TLKM", "Telkom Indonesia Tbk", "Infrastructure"],
  ["UNTR", "United Tractors Tbk", "Industrials"],
  ["UNVR", "Unilever Indonesia Tbk", "Consumer Non-Cyclicals"],
].map(([ticker, name, sector]) => toSymbolRecord(`${ticker}.JK`, name, sector, "fallback"));

export class LocalFileUniverseProvider implements UniverseProvider {
  constructor(private readonly files = defaultUniverseFiles()) {}

  async loadSymbols(): Promise<SymbolRecord[]> {
    for (const file of this.files) {
      if (!existsSync(file)) {
        continue;
      }

      const text = readFileSync(file, "utf8");
      const parsed = file.endsWith(".json")
        ? parseUniverseJson(text, `local:${path.basename(file)}`)
        : parseUniverseCsv(text, `local:${path.basename(file)}`);

      if (parsed.length > 0) {
        return parsed;
      }
    }

    return [];
  }
}

export class CompositeUniverseProvider implements UniverseProvider {
  constructor(private readonly providers: UniverseProvider[]) {}

  async loadSymbols(): Promise<SymbolRecord[]> {
    for (const provider of this.providers) {
      const symbols = await provider.loadSymbols();
      if (symbols.length > 0) {
        return symbols;
      }
    }

    return fallbackIdxSymbols;
  }
}

export class StockAnalysisUniverseProvider implements UniverseProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async loadSymbols(): Promise<SymbolRecord[]> {
    try {
      const response = await this.fetcher("https://stockanalysis.com/list/indonesia-stocks/", {
        headers: {
          "user-agent": "idx-structure-screener-personal/0.1",
        },
      });

      if (!response.ok) {
        return fallbackIdxSymbols;
      }

      const html = await response.text();
      const matches = [
        ...html.matchAll(/\/quote\/idx\/([A-Z0-9]+)\/[^>]*>\s*([^<]+)</g),
        ...html.matchAll(/data-symbol=["']([A-Z0-9]+)["'][^>]*>\s*([^<]+)</g),
      ];
      const symbols = new Map<string, SymbolRecord>();

      for (const match of matches) {
        const ticker = normalizeIdxSymbol(match[1]);
        const name = decodeHtml(match[2]).trim() || ticker;
        symbols.set(ticker, toSymbolRecord(ticker, name, "Unclassified", "stockanalysis"));
      }

      return symbols.size > 0 ? [...symbols.values()] : fallbackIdxSymbols;
    } catch {
      return fallbackIdxSymbols;
    }
  }
}

export function createDefaultUniverseProvider(): UniverseProvider {
  return new CompositeUniverseProvider([
    new LocalFileUniverseProvider(),
    new StockAnalysisUniverseProvider(),
  ]);
}

export function parseUniverseCsv(text: string, source: string): SymbolRecord[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const symbolIndex = findHeader(headers, ["symbol", "ticker", "code", "kode", "stock code"]);
  const nameIndex = findHeader(headers, ["name", "company", "company name", "nama", "issuer"]);
  const sectorIndex = findHeader(headers, ["sector", "sektor", "industry"]);
  const sourceIndex = findHeader(headers, ["source", "sumber"]);

  if (symbolIndex < 0) {
    return [];
  }

  return dedupeSymbols(rows.slice(1).map((row) =>
    toSymbolRecord(
      normalizeIdxSymbol(row[symbolIndex] ?? ""),
      row[nameIndex] ?? row[symbolIndex] ?? "",
      row[sectorIndex] ?? "Unclassified",
      row[sourceIndex] || source,
    ),
  ));
}

function parseUniverseJson(text: string, source: string): SymbolRecord[] {
  const payload = JSON.parse(text) as unknown;
  const rows = Array.isArray(payload) ? payload : [];

  return dedupeSymbols(rows.map((row) => {
    const item = row as Record<string, unknown>;
    return toSymbolRecord(
      normalizeIdxSymbol(String(item.symbol ?? item.ticker ?? item.code ?? "")),
      String(item.name ?? item.company ?? item.symbol ?? item.ticker ?? ""),
      String(item.sector ?? item.industry ?? "Unclassified"),
      source,
    );
  }));
}

function defaultUniverseFiles() {
  return [
    path.join(process.cwd(), "data", "universe.csv"),
    path.join(process.cwd(), "data", "universe.json"),
  ];
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
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
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function findHeader(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(header));
}

function dedupeSymbols(symbols: SymbolRecord[]): SymbolRecord[] {
  const records = new Map<string, SymbolRecord>();
  for (const symbol of symbols) {
    if (symbol.symbol && symbol.symbol !== ".JK") {
      records.set(symbol.symbol, symbol);
    }
  }
  return [...records.values()].sort((left, right) => left.symbol.localeCompare(right.symbol));
}

function normalizeIdxSymbol(value: string): string {
  const ticker = value.trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
  return ticker.endsWith(".JK") ? ticker : `${ticker}.JK`;
}

function toSymbolRecord(symbol: string, name: string, sector: string, source: string): SymbolRecord {
  return {
    symbol,
    name: name.trim() || symbol,
    sector: sector.trim() || "Unclassified",
    exchange: "IDX",
    isActive: true,
    source,
    lastSeenAt: new Date().toISOString(),
  };
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", "\"");
}
