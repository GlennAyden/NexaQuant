# News Scraper Roadmap

## Assumptions

- NexaQuant will focus on IHSG/IDX first before expanding to other markets.
- News sentiment is supporting evidence, not a buy/sell recommendation engine.
- The first version should run locally and be auditable before it becomes a public feature.
- Article content must be handled carefully. Store source metadata, links, excerpts, summaries, and derived sentiment; avoid republishing full copyrighted articles in the UI.

## Success Criteria

- The app can collect recent IHSG/IDX-related news from a controlled source list.
- Each article has traceable evidence: source, URL, title, published time, matched keyword or ticker, and ingestion time.
- The page can show market sentiment without hiding uncertainty.
- Users can inspect why an article was classified as positive, negative, neutral, or mixed.
- The feature remains evidence-first and avoids direct trade instructions.

## Recommended Starting Point

Use `news-watch` as the first scraper proof of concept because it already supports Indonesian news sources, keyword/date search, latest monitoring, and structured exports. Use `sentimeter` as a design reference for IDX-specific concepts such as ticker extraction, sentiment score, relevance score, and SQLite persistence.

Do not copy the recommendation layer from sentiment-based trading bots. NexaQuant should expose sentiment evidence and market context, not automated buy calls.

Reference projects:

- https://github.com/okkymabruri/news-watch
- https://github.com/snowfluke/sentimeter
- https://github.com/theyudhiztira/indonesia-news-scraper
- https://github.com/arbyazra123/auto-news

## Phase 1 - Source Intake Proof Of Concept

Goal: prove that the app can fetch useful IHSG-related news reliably.

Implementation status: built as `npm run news:sync`, storing Phase 1 article evidence in `data/market.db`.

Scope:

- Add a local news ingestion script.
- Start with keyword search for:
  - `IHSG`
  - `BEI`
  - `IDX`
  - `rupiah`
  - `Bank Indonesia`
  - `BI rate`
  - `net buy asing`
  - `emiten`
- Prioritize sources that are relevant to Indonesian markets:
  - CNBC Indonesia
  - Kontan
  - Bisnis
  - Investor Daily
  - IDX Channel
  - Antara
  - Kompas Money
  - Tempo Bisnis
- Save raw ingestion output to local storage first, preferably SQLite to match the current app.
- Add deduplication by normalized URL and content hash.

Current default sources:

- CNBC Indonesia Market
- Antara Ekonomi
- IDX Channel
- Kontan Investasi
- Katadata Finansial

Deliverable:

- A repeatable command that fetches recent news for the last N days.
- A stored article table with source, URL, title, publish date, excerpt or text snapshot, keyword, and ingestion timestamp.

Verification:

- Run ingestion for 1 day and 7 days.
- Confirm duplicate articles are skipped.
- Confirm each record keeps a clickable source URL.

## Phase 2 - Data Model And API Layer

Goal: make news data available to a future page through stable local APIs.

Suggested tables:

- `news_articles`
  - `id`
  - `source`
  - `url`
  - `canonical_url`
  - `title`
  - `published_at`
  - `ingested_at`
  - `excerpt`
  - `content_hash`
  - `language`
  - `status`
- `news_article_matches`
  - `article_id`
  - `match_type`
  - `match_value`
  - `confidence`
- `news_sentiment_runs`
  - `article_id`
  - `model_name`
  - `sentiment_label`
  - `sentiment_score`
  - `relevance_score`
  - `reasoning`
  - `created_at`

Suggested endpoints:

- `GET /api/news/articles`
  - filters by source, keyword, ticker, date range, sentiment, and relevance.
- `POST /api/news/sync`
  - starts a local ingestion run.
- `GET /api/news/sync`
  - returns sync status and latest run summary.
- `POST /api/news/sentiment`
  - classifies unprocessed articles.
- `GET /api/news/summary`
  - returns aggregate sentiment for the page header.

Deliverable:

- API responses shaped for UI use, not raw scraper output.
- Clear validation for query params and mutation routes.

Verification:

- API returns empty states safely.
- Bad filters return clear errors.
- Re-running sync does not create duplicates.

## Phase 3 - Sentiment And Relevance Layer

Goal: classify articles into useful market evidence.

Sentiment labels:

- `positive`
- `negative`
- `neutral`
- `mixed`
- `unknown`

Required classification fields:

- `sentiment_label`
- `sentiment_score`
- `relevance_score`
- `market_scope`
  - `ihsg`
  - `sector`
  - `ticker`
  - `macro`
  - `global`
- `matched_entities`
- `reasoning`

Important behavior:

- Separate sentiment from relevance. A negative global article may have low relevance to IHSG.
- Classify uncertainty loudly. If the article only mentions a ticker in passing, mark relevance low.
- Keep a short reason that the user can inspect.
- Avoid wording like "buy", "sell", "entry", "target", or "stop loss" in generated sentiment output.

Deliverable:

- Batch sentiment classifier for newly ingested articles.
- Aggregated sentiment per date, source, keyword, sector, and matched ticker.

Verification:

- Hand-check at least 30 articles across positive, negative, neutral, and mixed labels.
- Confirm irrelevant articles do not dominate the IHSG summary.
- Confirm sentiment output includes reasoning, not only a score.

## Phase 4 - News Sentiment Page

Goal: add a page that lets users monitor sentiment evidence.

Proposed route:

- `/news`

Page sections:

- Header summary
  - total articles today
  - positive, negative, neutral, mixed counts
  - latest sync time
  - source coverage status
- Sentiment timeline
  - daily sentiment trend
  - article count by day
  - relevance-weighted sentiment
- Source health panel
  - source name
  - latest successful scrape
  - articles collected
  - failures or timeouts
- Article evidence table
  - title
  - source
  - published time
  - matched keyword or ticker
  - sentiment
  - relevance
  - reason
  - link to original source
- Filters
  - date range
  - source
  - sentiment
  - relevance threshold
  - keyword
  - ticker
- Article inspector
  - excerpt or summary
  - matched entities
  - classification reason
  - source link

Design principle:

- This page should feel like an analyst console: dense, scannable, and evidence-oriented. Avoid marketing-style hero sections.

Deliverable:

- A working `/news` page connected to local APIs.
- Empty states for no data and failed sync.
- Manual sync action with loading and error states.

Verification:

- Page renders with no articles.
- Page renders after a successful sync.
- Filters do not break table layout.
- Links open the original source.

## Phase 5 - Integration With Existing Market Dashboard

Goal: connect sentiment with the current IHSG/IDX analysis workflow.

Integration ideas:

- Add a compact sentiment badge near the selected symbol or market overview.
- Show recent article count and weighted sentiment for the selected ticker.
- Add sentiment markers only when relevance is high and the publish time aligns with the chart window.
- Let users jump from a chart annotation to the supporting news evidence.

Guardrails:

- Do not let sentiment override chart structure or PVA evidence.
- Do not generate trade calls from sentiment alone.
- Treat news as one research layer among price, volume, structure, and historical context.

Deliverable:

- Dashboard-level sentiment summary.
- Optional chart-linked news markers.

Verification:

- Existing dashboard still works when no news data exists.
- Sentiment integration is clearly labeled as evidence, not a recommendation.

## Phase 6 - Reliability, Compliance, And Open Source Readiness

Goal: make the scraper stable enough for an open-source project.

Reliability:

- Per-source timeout.
- Retry with backoff.
- Source-level health reporting.
- Rate limiting.
- Deduplication across sources.
- Structured sync logs.

Compliance:

- Respect source terms, robots.txt, and rate limits.
- Show source attribution and original links.
- Avoid republishing full article bodies.
- Document scraper limitations and intended research use.

Open-source readiness:

- Add setup docs.
- Add source configuration docs.
- Add examples for local-only usage.
- Add tests for parsers, dedupe, API filters, and sentiment aggregation.

Deliverable:

- Stable local scraper workflow.
- Clear docs for contributors.
- Fail-loud behavior when a source breaks.

Verification:

- Source failure does not crash the whole sync.
- Test suite covers dedupe and API filter behavior.
- README or docs explain the ethical and legal boundaries.

## Suggested Build Order

1. Create SQLite schema and ingestion store.
2. Build a local `news-watch` ingestion adapter.
3. Add dedupe and source health logging.
4. Add read APIs for articles and sync status.
5. Add sentiment classification storage.
6. Build `/news` page with table, filters, summary cards, and source health.
7. Add sentiment timeline.
8. Add dashboard integration only after the page is stable.

## MVP Boundary

Include:

- IHSG/IDX keywords.
- Manual sync.
- Article table.
- Source links.
- Sentiment label.
- Relevance score.
- Basic aggregate summary.

Exclude for MVP:

- Real-time streaming.
- Automated trade recommendations.
- Broker integration.
- Full article republication.
- Complex vector database or semantic search.
- Public deployment assumptions.

## Open Questions

- Should the first implementation use a Python scraper adapter or a TypeScript-native scraper?
- Will the sentiment classifier run locally, through an API, or through a configurable provider?
- Should article excerpts be stored, or should the app store only metadata plus generated summaries?
- Which source list is acceptable for the first public open-source release?
