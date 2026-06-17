import { readFileSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, vi } from "vitest";

import {
  DEFAULT_SOURCES,
  extractKeywordMatches,
  migrateNewsTables,
  normalizeUrl,
  parseBisnisCategoryItems,
  parseEmitenNewsCategoryItems,
  parseIdxDisclosureItems,
  parseInvestorCategoryItems,
  parseRssItems,
  runNewsSync,
} from "../scripts/syncNews.mjs";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("news ingestion helpers", () => {
  it("loads CLI sources from the shared news source catalog", () => {
    const catalog = JSON.parse(readFileSync(path.join(process.cwd(), "src", "lib", "news", "newsSources.json"), "utf8"));

    expect(DEFAULT_SOURCES).toEqual(catalog);
  });

  it("parses RSS items into auditable article fields", () => {
    const rss = `
      <rss>
        <channel>
          <item>
            <title><![CDATA[IHSG Menguat &amp; Rupiah Stabil]]></title>
            <link>https://example.com/news?id=1&amp;utm_source=test</link>
            <pubDate>Mon, 15 Jun 2026 08:00:00 +0700</pubDate>
            <description><![CDATA[Pasar modal Indonesia bergerak positif.]]></description>
          </item>
        </channel>
      </rss>
    `;

    expect(parseRssItems(rss)).toEqual([
      {
        title: "IHSG Menguat & Rupiah Stabil",
        link: "https://example.com/news?id=1&utm_source=test",
        publishedAt: "Mon, 15 Jun 2026 08:00:00 +0700",
        excerpt: "Pasar modal Indonesia bergerak positif.",
      },
    ]);
  });

  it("normalizes tracking parameters without losing the article identity", () => {
    expect(normalizeUrl("https://example.com/a?x=1&utm_source=test&fbclid=abc#top"))
      .toBe("https://example.com/a?x=1");
  });

  it("matches configured market terms", () => {
    const matches = extractKeywordMatches("IHSG naik setelah net buy asing membesar", ["IHSG", "net buy asing", "saham"]);

    expect(matches).toEqual(["IHSG", "net buy asing"]);
  });

  it("parses EmitenNews category cards into the same article shape as RSS", () => {
    const html = `
      <a href="https://emitennews.com/news/rupiah-pagi-ini-masih-melaju-di-jalur-hijau" class="news-card-2 search-result-item">
        <div class="news-card-2-content title-category">
          <p class="fs-16">Rupiah Pagi ini Masih Melaju di Jalur Hijau</p>
          <!-- <p>EmitenNews.com -&nbsp;Nilai tukar Rupiah terhadap dolar AS dibuka menguat.</p> -->
          <div class="label">
            <span class="small">2 jam yang lalu</span>
          </div>
        </div>
      </a>
      <a href="https://emitennews.com/news/buka-belum-tentukan-dirut-definitif" class="news-card-2 search-result-item">
        <div class="news-card-2-content title-category">
          <p class="fs-16">BUKA Belum Tentukan Dirut Definitif</p>
          <!-- <p>EmitenNews.com -&nbsp;PT Bukalapak.com Tbk (BUKA) menggelar RUPS.</p> -->
          <div class="label">
            <span class="small">16/06/2026, 16:33 WIB</span>
          </div>
        </div>
      </a>
    `;

    const items = parseEmitenNewsCategoryItems(html, new Date("2026-06-16T10:00:00.000Z"));

    expect(items).toEqual([
      {
        title: "Rupiah Pagi ini Masih Melaju di Jalur Hijau",
        link: "https://emitennews.com/news/rupiah-pagi-ini-masih-melaju-di-jalur-hijau",
        publishedAt: "2026-06-16T08:00:00.000Z",
        excerpt: "Nilai tukar Rupiah terhadap dolar AS dibuka menguat.",
      },
      {
        title: "BUKA Belum Tentukan Dirut Definitif",
        link: "https://emitennews.com/news/buka-belum-tentukan-dirut-definitif",
        publishedAt: "2026-06-16T09:33:00.000Z",
        excerpt: "PT Bukalapak.com Tbk (BUKA) menggelar RUPS.",
      },
    ]);
  });

  it("parses Bisnis category cards without losing absolute WIB timestamps", () => {
    const html = `
      <div class="artItem">
        <a href="https://market.bisnis.com/read/20260615/7/1980895/ihsg-dibuka-naik-285" class="artLink artLinkImg"></a>
        <div class="artContent">
          <div class="artDate">15 Jun 2026 | 09:23 WIB</div>
          <a href="https://market.bisnis.com/read/20260615/7/1980895/ihsg-dibuka-naik-285" class="artLink">
            <h4 class="artTitle">IHSG Dibuka Naik 2,85% ke 6.178, Saham AMMN, BUMI &amp; MDKA Melaju Hijau</h4>
          </a>
        </div>
      </div>
      <div class="pagingWrap"></div>
    `;

    expect(parseBisnisCategoryItems(html, new Date("2026-06-16T10:00:00.000Z"))).toEqual([
      {
        title: "IHSG Dibuka Naik 2,85% ke 6.178, Saham AMMN, BUMI & MDKA Melaju Hijau",
        link: "https://market.bisnis.com/read/20260615/7/1980895/ihsg-dibuka-naik-285",
        publishedAt: "2026-06-15T02:23:00.000Z",
        excerpt: "",
      },
    ]);
  });

  it("parses Investor category cards into absolute article URLs and excerpts", () => {
    const html = `
      <div class="row mb-4">
        <span class="text-muted small">4 jam yang lalu</span>
        <a href="/stock/442913/ihsg-mulai-bangkit">
          <h4 class="my-3 text-truncate-2-lines">IHSG Mulai Bangkit, Sentimen Positif Kembali Berembus ke Pasar</h4>
        </a>
        <span class="text-muted text-truncate-2-lines">Indeks harga saham gabungan (IHSG) mulai bangkit.</span>
      </div>
    `;

    expect(parseInvestorCategoryItems(html, new Date("2026-06-16T14:00:00.000Z"))).toEqual([
      {
        title: "IHSG Mulai Bangkit, Sentimen Positif Kembali Berembus ke Pasar",
        link: "https://investor.id/stock/442913/ihsg-mulai-bangkit",
        publishedAt: "2026-06-16T10:00:00.000Z",
        excerpt: "Indeks harga saham gabungan (IHSG) mulai bangkit.",
      },
    ]);
  });

  it("parses IDX official disclosure JSON into article-shaped items", () => {
    const payload = {
      data: [
        {
          kodeEmiten: "BBCA",
          pengumuman: "Laporan Informasi atau Fakta Material",
          tanggal: "15 Jun 2026 | 16:29 WIB",
          FilePath: "/StaticData/NewsAndAnnouncement/BBCA.pdf",
        },
      ],
    };

    expect(parseIdxDisclosureItems(JSON.stringify(payload), new Date("2026-06-16T10:00:00.000Z"))).toEqual([
      {
        title: "Laporan Informasi atau Fakta Material [BBCA]",
        link: "https://www.idx.co.id/StaticData/NewsAndAnnouncement/BBCA.pdf",
        publishedAt: "2026-06-15T09:29:00.000Z",
        excerpt: "Laporan Informasi atau Fakta Material [BBCA]",
      },
    ]);
  });

  it("parses IDX official disclosure HTML links as a fallback", () => {
    const html = `
      <div>15 Jun 2026 | 16:29 WIB</div>
      <a href="/StaticData/NewsAndAnnouncement/PYFA.pdf">Penjelasan atas Right Issue PYFA</a>
    `;

    expect(parseIdxDisclosureItems(html, new Date("2026-06-16T10:00:00.000Z"))).toEqual([
      {
        title: "Penjelasan atas Right Issue PYFA",
        link: "https://www.idx.co.id/StaticData/NewsAndAnnouncement/PYFA.pdf",
        publishedAt: "2026-06-15T09:29:00.000Z",
        excerpt: "Penjelasan atas Right Issue PYFA",
      },
    ]);
  });

  it("creates the phase 1 news tables in SQLite", () => {
    const db = new Database(":memory:");

    migrateNewsTables(db);

    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'news_%'
      ORDER BY name
    `).all().map((row) => row.name);

    expect(tables).toEqual([
      "news_articles",
      "news_ingestion_runs",
      "news_source_status",
    ]);

    db.close();
  });

  it("retries transient source errors before storing articles", async () => {
    const rss = `
      <rss><channel>
        <item>
          <title>IHSG Menguat Setelah Saham Bank Naik</title>
          <link>https://example.com/ihsg-bank</link>
          <pubDate>Mon, 15 Jun 2026 08:00:00 +0700</pubDate>
          <description>Pasar modal bergerak positif.</description>
        </item>
      </channel></rss>
    `;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("temporarily unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(rss, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const db = new Database(":memory:");
    migrateNewsTables(db);

    const result = await runNewsSync(db, {
      sources: ["cnbc-market"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: "completed",
      failedCount: 0,
      totalCandidates: 1,
      insertedCount: 1,
    });
    expect(db.prepare("SELECT source_id, title FROM news_articles").all()).toEqual([
      {
        source_id: "cnbc-market",
        title: "IHSG Menguat Setelah Saham Bank Naik",
      },
    ]);

    db.close();
  });

  it("fails loudly after exhausting transient source retries", async () => {
    const fetchMock = vi.fn(async () => new Response("temporarily unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const db = new Database(":memory:");
    migrateNewsTables(db);

    const result = await runNewsSync(db, {
      sources: ["cnbc-market"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      status: "failed",
      failedCount: 1,
      insertedCount: 0,
      errors: {
        "cnbc-market": expect.stringContaining("after 3 attempts"),
      },
    });
    expect(db.prepare("SELECT source_id, status, error_json FROM news_source_status").all()).toEqual([
      {
        source_id: "cnbc-market",
        status: "failed",
        error_json: expect.stringContaining("HTTP 503"),
      },
    ]);

    db.close();
  });

  it("records a loud failure when IDX official disclosure blocks server-side scraping", async () => {
    const fetchMock = vi.fn(async () => new Response("Forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const db = new Database(":memory:");
    migrateNewsTables(db);

    const result = await runNewsSync(db, {
      sources: ["idx-official-disclosure"],
    });

    expect(result).toMatchObject({
      status: "failed",
      failedCount: 1,
      insertedCount: 0,
      errors: {
        "idx-official-disclosure": expect.stringContaining("HTTP 403"),
      },
    });
    expect(db.prepare("SELECT source_id, status, error_json FROM news_source_status").all()).toEqual([
      {
        source_id: "idx-official-disclosure",
        status: "failed",
        error_json: expect.stringContaining("HTTP 403"),
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    db.close();
  });

  it("crawls paged RSS feeds until the requested date window is covered", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T12:00:00.000Z"));
    const firstFeed = `
      <rss><channel>
        <item>
          <title>WINR Kembali Dilepas 10 Juta Saham di FCA</title>
          <link>https://emitentrust.com/winr-kembali-dilepas-10-juta-saham-di-fca/</link>
          <pubDate>Tue, 16 Jun 2026 09:07:30 +0000</pubDate>
          <description>Transaksi saham terbaru.</description>
        </item>
      </channel></rss>
    `;
    const secondFeed = `
      <rss><channel>
        <item>
          <title>Artikel Lama Emitentrust</title>
          <link>https://emitentrust.com/artikel-lama/</link>
          <pubDate>Fri, 15 May 2026 09:07:30 +0000</pubDate>
          <description>Artikel ini di luar rentang 30 hari.</description>
        </item>
      </channel></rss>
    `;
    const fetchMock = vi.fn(async (url) => {
      const value = String(url);
      if (value === "https://emitentrust.com/category/stock-and-market/feed/") {
        return new Response(firstFeed, { status: 200 });
      }
      if (value === "https://emitentrust.com/category/stock-and-market/feed/?paged=2") {
        return new Response(secondFeed, { status: 200 });
      }
      throw new Error(`Unexpected fetch ${value}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const db = new Database(":memory:");
    migrateNewsTables(db);

    const result = await runNewsSync(db, {
      days: 30,
      sources: ["emitentrust-stock-market"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      totalCandidates: 2,
      matchedCount: 1,
      filteredCount: 1,
      insertedCount: 1,
    });
    expect(db.prepare("SELECT title FROM news_articles").all()).toEqual([
      { title: "WINR Kembali Dilepas 10 Juta Saham di FCA" },
    ]);

    db.close();
  });
});
