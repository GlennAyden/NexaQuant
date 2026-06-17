# News Source Policy

NexaQuant treats news as research evidence, not as republished article content or trade instruction.

## Source Usage

- Store source metadata, source URL, title, publish time, short excerpt, derived entities, and derived sentiment.
- Keep attribution visible through source name and original URL.
- Avoid displaying full copyrighted article bodies in the app UI.
- Review source terms and robots.txt before any public deployment or scheduled hosted scraping.

## Operational Guardrails

The scraper source catalog is summarized by `src/lib/news/sourcePolicy.ts`.

The `/news` source health matrix renders every catalogued source, then overlays the latest sync status, counts, and error text when a source was included in the most recent run. Selecting a source opens the source inspector with run counters, quality diagnostics, source score, and compliance guardrails. The sync API also returns recent ingestion history so the page can show whether source health is improving or degrading across runs.

The source reliability score is derived from recent sync history. It combines success rate when the source was selected, coverage across recent runs, and whether selected runs produced matched articles. Sources that were not selected in recent runs are labeled as `No data`, not as failures.

Current shared fetch controls:

- Request timeout: 15 seconds.
- Fetch attempts: 3.
- Retry backoff: 25 ms.
- Page cap per source: 100 pages.
- Sync is sequential by source.

These controls are intentionally conservative for local research, but they are not a substitute for legal review or source-specific approval.

## Contributor Checklist

When adding a source:

1. Add the source to `src/lib/news/newsSources.json`.
2. Ensure `sourcePolicy.ts` can classify the source access mode.
3. Prefer RSS or official disclosure feeds before HTML page parsing.
4. Keep original links and source attribution in UI responses.
5. Add parser and policy tests before relying on the source in sync.
