import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_NEWS_SOURCES,
  enrichArticleContent,
  extractArticleContentFromHtml,
  parseBisnisCategoryItems,
  parseEmitenNewsCategoryItems,
  parseIdxDisclosureItems,
  parseInvestorCategoryItems,
  runNewsEnrichmentBackfill,
  runNewsSync,
} from "@/lib/news/newsIngestion";
import newsSources from "@/lib/news/newsSources.json";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("app news ingestion sources", () => {
  it("loads the app source registry from the shared catalog", () => {
    expect(DEFAULT_NEWS_SOURCES).toEqual(newsSources);
  });

  it("registers each requested EmitenNews category as a first-class source", () => {
    const sources = new Map(DEFAULT_NEWS_SOURCES.map((source) => [source.id, source]));

    expect(sources.get("emitennews-emiten")).toMatchObject({
      category: "market",
      parser: "emitennews-category",
      pagination: "html-next-link",
      requiresKeywordMatch: false,
    });
    expect(sources.get("emitennews-makro")).toMatchObject({
      category: "economy",
      parser: "emitennews-category",
      requiresKeywordMatch: false,
    });
    expect(sources.get("emitennews-nasional")).toMatchObject({
      category: "economy",
      parser: "emitennews-category",
      requiresKeywordMatch: false,
    });
    expect(sources.get("bisnis-bursa-saham")).toMatchObject({
      category: "market",
      parser: "bisnis-category",
      pagination: "html-next-link",
      requiresKeywordMatch: false,
    });
    expect(sources.get("investor-corporate-action")).toMatchObject({
      archiveUrl: "https://investor.id/corporate-action/indeks",
      category: "market",
      pagination: "path-page",
      parser: "investor-category",
      requiresKeywordMatch: false,
    });
    expect(sources.get("investor-stock")).toMatchObject({
      archiveUrl: "https://investor.id/stock/indeks",
      category: "market",
      pagination: "path-page",
      parser: "investor-category",
      requiresKeywordMatch: false,
    });
    expect(sources.get("emitentrust-stock-market")).toMatchObject({
      category: "market",
      pagination: "rss-paged-query",
      parser: "rss",
      requiresKeywordMatch: false,
    });
    expect(sources.get("idx-official-disclosure")).toMatchObject({
      category: "disclosure",
      parser: "idx-disclosure",
      requiresKeywordMatch: false,
      userAgent: expect.stringContaining("Mozilla/5.0"),
    });
  });

  it("parses IDX official disclosure JSON into article-shaped items", () => {
    const payload = {
      Results: [
        {
          KodeEmiten: "BBCA",
          Pengumuman: "Penyampaian Bukti Iklan Ringkasan Risalah RUPS",
          Tanggal: "15 Jun 2026 | 16:29 WIB",
          Link: "/StaticData/NewsAndAnnouncement/ANNOUNCEMENTSTOCK/BBCA_RUPS.pdf",
        },
      ],
    };

    expect(parseIdxDisclosureItems(JSON.stringify(payload), new Date("2026-06-16T10:00:00.000Z"))).toEqual([
      {
        title: "Penyampaian Bukti Iklan Ringkasan Risalah RUPS [BBCA]",
        link: "https://www.idx.co.id/StaticData/NewsAndAnnouncement/ANNOUNCEMENTSTOCK/BBCA_RUPS.pdf",
        publishedAt: "2026-06-15T09:29:00.000Z",
        excerpt: "Penyampaian Bukti Iklan Ringkasan Risalah RUPS [BBCA]",
      },
    ]);
  });

  it("parses IDX official disclosure HTML links as fallback", () => {
    const html = `
      <div class="announcement">
        <span>15 Jun 2026 | 16:29 WIB</span>
        <a href="/StaticData/NewsAndAnnouncement/ANNOUNCEMENTSTOCK/ACES_Dividen.pdf">
          Keterbukaan Informasi terkait Aksi Korporasi - Dividen Tunai [ACES]
        </a>
      </div>
    `;

    expect(parseIdxDisclosureItems(html, new Date("2026-06-16T10:00:00.000Z"))).toEqual([
      {
        title: "Keterbukaan Informasi terkait Aksi Korporasi - Dividen Tunai [ACES]",
        link: "https://www.idx.co.id/StaticData/NewsAndAnnouncement/ANNOUNCEMENTSTOCK/ACES_Dividen.pdf",
        publishedAt: "2026-06-15T09:29:00.000Z",
        excerpt: "Keterbukaan Informasi terkait Aksi Korporasi - Dividen Tunai [ACES]",
      },
    ]);
  });

  it("retries transient source errors before recording articles", async () => {
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
    const inserted: unknown[] = [];
    const store = {
      createIngestionRun: vi.fn(),
      updateIngestionRun: vi.fn(),
      upsertSourceStatus: vi.fn(),
      insertArticleIfNew: vi.fn((article: unknown) => {
        inserted.push(article);
        return true;
      }),
    };

    const run = await runNewsSync(store as never, {
      days: 7,
      sources: ["cnbc-market"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(run).toMatchObject({
      status: "completed",
      failedCount: 0,
      totalCandidates: 1,
      insertedCount: 1,
    });
    expect(inserted[0]).toMatchObject({
      sourceId: "cnbc-market",
      title: "IHSG Menguat Setelah Saham Bank Naik",
    });
  });

  it("fails loudly after exhausting transient source retries", async () => {
    const fetchMock = vi.fn(async () => new Response("temporarily unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const statuses: unknown[] = [];
    const store = {
      createIngestionRun: vi.fn(),
      updateIngestionRun: vi.fn(),
      upsertSourceStatus: vi.fn((status: unknown) => {
        statuses.push(status);
      }),
      insertArticleIfNew: vi.fn(),
    };

    const run = await runNewsSync(store as never, {
      days: 7,
      sources: ["cnbc-market"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(run).toMatchObject({
      status: "failed",
      failedCount: 1,
      insertedCount: 0,
      error: {
        "cnbc-market": expect.stringContaining("after 3 attempts"),
      },
    });
    expect(statuses).toContainEqual(expect.objectContaining({
      sourceId: "cnbc-market",
      status: "failed",
      error: expect.stringContaining("HTTP 503"),
    }));
  });

  it("records a loud failure when IDX official disclosure blocks server-side scraping", async () => {
    const fetchMock = vi.fn(async () => new Response("Forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const statuses: unknown[] = [];
    const store = {
      createIngestionRun: vi.fn(),
      updateIngestionRun: vi.fn(),
      upsertSourceStatus: vi.fn((status: unknown) => {
        statuses.push(status);
      }),
      insertArticleIfNew: vi.fn(),
    };

    const run = await runNewsSync(store as never, {
      days: 7,
      sources: ["idx-official-disclosure"],
    });

    expect(run).toMatchObject({
      status: "failed",
      failedCount: 1,
      insertedCount: 0,
      error: {
        "idx-official-disclosure": expect.stringContaining("HTTP 403"),
      },
    });
    expect(statuses).toContainEqual(expect.objectContaining({
      sourceId: "idx-official-disclosure",
      status: "failed",
      error: expect.stringContaining("HTTP 403"),
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps EmitenNews category parsing compatible with article ingestion", () => {
    const html = `
      <a href="https://emitennews.com/news/bahlil-sebut-rp224t-anggaran-esdm-2027" class="news-card-2 search-result-item">
        <div class="news-card-2-content title-category">
          <p class="fs-16">Bahlil Sebut Rp22,4T Anggaran ESDM 2027 untuk Rakyat</p>
          <!-- <p>EmitenNews.com -&nbsp;Kementerian ESDM mengalokasikan anggaran untuk program prioritas.</p> -->
          <div class="label">
            <span class="small">3 jam yang lalu</span>
          </div>
        </div>
      </a>
    `;

    expect(parseEmitenNewsCategoryItems(html, new Date("2026-06-16T11:00:00.000Z"))).toEqual([
      {
        title: "Bahlil Sebut Rp22,4T Anggaran ESDM 2027 untuk Rakyat",
        link: "https://emitennews.com/news/bahlil-sebut-rp224t-anggaran-esdm-2027",
        publishedAt: "2026-06-16T08:00:00.000Z",
        excerpt: "Kementerian ESDM mengalokasikan anggaran untuk program prioritas.",
      },
    ]);
  });

  it("crawls category pages until the oldest article passes the requested window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T12:00:00.000Z"));
    const firstPage = `
      <a href="https://emitennews.com/news/ihsg-menguat" class="news-card-2 search-result-item">
        <div class="news-card-2-content title-category">
          <p class="fs-16">IHSG Menguat Saat Saham Bank Naik</p>
          <!-- <p>EmitenNews.com -&nbsp;Pasar modal bergerak positif.</p> -->
          <div class="label"><span class="small">5 hari yang lalu</span></div>
        </div>
      </a>
      <div class="pagination">
        <a href="https://emitennews.com/category/emiten/9" rel="next">&gt;</a>
      </div>
    `;
    const secondPage = `
      <a href="https://emitennews.com/news/berita-lama" class="news-card-2 search-result-item">
        <div class="news-card-2-content title-category">
          <p class="fs-16">Berita Lama Emiten</p>
          <!-- <p>EmitenNews.com -&nbsp;Artikel ini sudah di luar jendela sync.</p> -->
          <div class="label"><span class="small">31 hari yang lalu</span></div>
        </div>
      </a>
      <div class="pagination">
        <a href="https://emitennews.com/category/emiten/18" rel="next">&gt;</a>
      </div>
    `;
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value === "https://emitennews.com/category/emiten") {
        return new Response(firstPage, { status: 200 });
      }
      if (value === "https://emitennews.com/category/emiten/9") {
        return new Response(secondPage, { status: 200 });
      }
      throw new Error(`Unexpected fetch ${value}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const inserted: unknown[] = [];
    const progressEvents: unknown[] = [];
    const store = {
      createIngestionRun: vi.fn(),
      updateIngestionRun: vi.fn(),
      upsertSourceStatus: vi.fn(),
      insertArticleIfNew: vi.fn((article: unknown) => {
        inserted.push(article);
        return true;
      }),
    };

    const run = await runNewsSync(store as never, {
      days: 30,
      sources: ["emitennews-emiten"],
      onProgress: (event) => {
        progressEvents.push(event);
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalledWith("https://emitennews.com/category/emiten/18", expect.anything());
    expect(run).toMatchObject({
      totalCandidates: 2,
      matchedCount: 1,
      filteredCount: 1,
      insertedCount: 1,
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      sourceId: "emitennews-emiten",
      title: "IHSG Menguat Saat Saham Bank Naik",
    });
    expect(progressEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "page-started",
        sourceName: "EmitenNews Emiten",
        pageNumber: 1,
        pageUrl: "https://emitennews.com/category/emiten",
      }),
      expect.objectContaining({
        type: "page-completed",
        sourceName: "EmitenNews Emiten",
        pageNumber: 2,
        pageItemCount: 1,
        summary: expect.objectContaining({ totalCandidates: 2 }),
      }),
      expect.objectContaining({
        type: "run-completed",
        summary: expect.objectContaining({
          completedSources: 1,
          insertedCount: 1,
        }),
      }),
    ]));
  });

  it("parses Bisnis Bursa Saham cards into article fields", () => {
    const html = `
      <div class="artItem">
        <a href="https://market.bisnis.com/read/20260615/7/1980990/saham-grup-bakrie-brms-dewa-bumi" class="artLink artLinkImg"></a>
        <div class="artContent">
          <div class="artDate">15 Jun 2026 | 16:29 WIB</div>
          <a href="https://market.bisnis.com/read/20260615/7/1980990/saham-grup-bakrie-brms-dewa-bumi" class="artLink">
            <h4 class="artTitle">Saham Grup Bakrie BRMS, DEWA &amp; BUMI Kerek Laju Indeks Bisnis-27</h4>
          </a>
        </div>
      </div>
      <div class="pagingWrap"></div>
    `;

    expect(parseBisnisCategoryItems(html, new Date("2026-06-16T10:00:00.000Z"))).toEqual([
      {
        title: "Saham Grup Bakrie BRMS, DEWA & BUMI Kerek Laju Indeks Bisnis-27",
        link: "https://market.bisnis.com/read/20260615/7/1980990/saham-grup-bakrie-brms-dewa-bumi",
        publishedAt: "2026-06-15T09:29:00.000Z",
        excerpt: "",
      },
    ]);
  });

  it("extracts article content and metadata when a source card has no excerpt", async () => {
    const html = `
      <html>
        <head>
          <meta name="description" content="Ringkasan artikel dari meta description.">
          <meta name="author" content="Bisnis Reporter">
          <meta property="og:image" content="/image.jpg">
        </head>
        <body>
          <article>
            <p>Saham grup energi menguat setelah aksi korporasi terbaru diumumkan kepada publik.</p>
            <p>Pelaku pasar mencermati dampak transaksi tersebut terhadap likuiditas dan prospek emiten.</p>
          </article>
        </body>
      </html>
    `;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { status: 200 })));

    expect(extractArticleContentFromHtml(html, "https://market.bisnis.com/read/abc")).toMatchObject({
      author: "Bisnis Reporter",
      imageUrl: "https://market.bisnis.com/image.jpg",
    });
    await expect(enrichArticleContent({}, {
      title: "Saham Grup Energi Menguat",
      link: "https://market.bisnis.com/read/abc",
      publishedAt: "2026-06-15T09:29:00.000Z",
      excerpt: "",
    })).resolves.toMatchObject({
      author: "Bisnis Reporter",
      extractionStatus: "extracted",
      contentQualityScore: expect.any(Number),
    });
  });

  it("backfills low-quality article content with progress events", async () => {
    const html = `
      <html>
        <head><meta name="description" content="Ringkasan backfill."></head>
        <body>
          <article>
            <p>Artikel backfill memuat detail aksi korporasi emiten dan respons pelaku pasar.</p>
            <p>Informasi tambahan ini membantu engine sentiment membaca konteks secara lebih lengkap.</p>
          </article>
        </body>
      </html>
    `;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { status: 200 })));
    const updated: unknown[] = [];
    const events: unknown[] = [];
    const store = {
      getArticlesForEnrichment: vi.fn(() => [{
        id: "a1",
        sourceId: "bisnis-bursa-saham",
        sourceName: "Bisnis Bursa Saham",
        sourceCategory: "market",
        url: "https://market.bisnis.com/read/a",
        canonicalUrl: "https://market.bisnis.com/read/a",
        title: "Artikel Backfill",
        publishedAt: "2026-06-15T09:30:00.000Z",
        ingestedAt: "2026-06-15T09:31:00.000Z",
        excerpt: "",
        content: "",
        author: null,
        imageUrl: null,
        extractionStatus: "failed",
        contentQualityScore: 0,
        contentHash: "hash",
        matchedKeywords: ["saham"],
        language: "id",
        status: "active",
        matches: [],
        sentiment: null,
      }]),
      updateArticleEnrichment: vi.fn((_articleId: string, enrichment: unknown) => {
        updated.push(enrichment);
        return true;
      }),
      createEnrichmentRun: vi.fn(),
      updateEnrichmentRun: vi.fn(),
    };

    const run = await runNewsEnrichmentBackfill(store as never, {
      limit: 10,
      onProgress: (event) => {
        events.push(event);
      },
    });

    expect(store.getArticlesForEnrichment).toHaveBeenCalledWith(10);
    expect(updated[0]).toMatchObject({
      extractionStatus: "extracted",
      contentQualityScore: expect.any(Number),
    });
    expect(run).toMatchObject({ totalArticles: 1, enrichedCount: 1, failedCount: 0 });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "enrichment-started" }),
      expect.objectContaining({ type: "article-enriched", summary: expect.objectContaining({ enrichedCount: 1 }) }),
      expect.objectContaining({ type: "enrichment-completed" }),
    ]));
  });

  it("parses Investor category cards with relative links and excerpts", () => {
    const html = `
      <div class="rounded-4 overflow-hidden mb-5">
        <a href="/stock" class="px-3">Stock</a> | 43 menit yang lalu
        <a href="/stock/442943/ada-yang-belanja-saham-goto">
          <h3 class="mt-3 text-white">Ada yang Belanja Saham GOTO</h3>
        </a>
        <p class="text-truncate-2-lines m-0 text-muted">PT GoTo Gojek Tokopedia Tbk (GOTO) melaporkan perubahan kepemilikan saham.</p>
      </div>
      <div class="row mb-4">
        <span class="text-muted small">15 Jun 2026 | 16:29 WIB</span>
        <a href="/corporate-action/442934/dmas-tebar-dividen-9937-dari-laba">
          <h4 class="my-3 text-truncate-2-lines">DMAS Tebar Dividen 99,37% dari Laba</h4>
        </a>
        <span class="text-muted text-truncate-2-lines">PT Puradelta Lestari Tbk (DMAS) akan membagikan dividen tunai.</span>
      </div>
    `;

    expect(parseInvestorCategoryItems(html, new Date("2026-06-16T14:00:00.000Z"))).toEqual([
      {
        title: "Ada yang Belanja Saham GOTO",
        link: "https://investor.id/stock/442943/ada-yang-belanja-saham-goto",
        publishedAt: "2026-06-16T13:17:00.000Z",
        excerpt: "PT GoTo Gojek Tokopedia Tbk (GOTO) melaporkan perubahan kepemilikan saham.",
      },
      {
        title: "DMAS Tebar Dividen 99,37% dari Laba",
        link: "https://investor.id/corporate-action/442934/dmas-tebar-dividen-9937-dari-laba",
        publishedAt: "2026-06-15T09:29:00.000Z",
        excerpt: "PT Puradelta Lestari Tbk (DMAS) akan membagikan dividen tunai.",
      },
    ]);
  });

  it("parses Investor index rows used by paginated archive pages", () => {
    const html = `
      <div class="row mb-4 position-relative">
        <div class="col-4">
          <a href="/stock/442781/saham-jagoan-jp-morgan-potensi-cuan-73" class="stretched-link">
            <img alt="Saham Jagoan JP Morgan, Potensi Cuan 73%">
          </a>
        </div>
        <div class="col-8 pt-l">
          <a href="/stock"><span class="id-cat">Stock</span></a>
          <span class="text-muted small">15 Jun 2026 | 13:19 WIB</span>
          <span class="text-muted text-truncate-2-lines">JP Morgan masih menjagokan saham Antam.</span>
        </div>
      </div>
    `;

    expect(parseInvestorCategoryItems(html, new Date("2026-06-16T10:00:00.000Z"))).toEqual([
      {
        title: "Saham Jagoan JP Morgan, Potensi Cuan 73%",
        link: "https://investor.id/stock/442781/saham-jagoan-jp-morgan-potensi-cuan-73",
        publishedAt: "2026-06-15T06:19:00.000Z",
        excerpt: "JP Morgan masih menjagokan saham Antam.",
      },
    ]);
  });
});
