import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalFileUniverseProvider, parseUniverseCsv } from "@/lib/market/universeProvider";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "idx-universe-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("universeProvider", () => {
  it("normalizes local IDX CSV rows into Yahoo .JK symbols", () => {
    const symbols = parseUniverseCsv([
      "Code,Name,Sector,Source",
      "BBCA,Bank Central Asia Tbk,Financials,stockanalysis:company",
      " TLKM.JK ,Telkom Indonesia Tbk,Infrastructure,manual",
    ].join("\n"), "local-csv");

    expect(symbols.map((symbol) => symbol.symbol)).toEqual(["BBCA.JK", "TLKM.JK"]);
    expect(symbols[0]).toMatchObject({
      name: "Bank Central Asia Tbk",
      sector: "Financials",
      exchange: "IDX",
      isActive: true,
      source: "stockanalysis:company",
    });
    expect(symbols[1].source).toBe("manual");
  });

  it("loads a complete personal IDX universe from a local CSV before network fallback", async () => {
    const csvPath = path.join(dir, "universe.csv");
    writeFileSync(csvPath, "Ticker,Company,Sector\nASII,Astra International Tbk,Industrials\n", "utf8");

    const provider = new LocalFileUniverseProvider([csvPath]);

    await expect(provider.loadSymbols()).resolves.toMatchObject([
      { symbol: "ASII.JK", name: "Astra International Tbk", sector: "Industrials" },
    ]);
  });
});
