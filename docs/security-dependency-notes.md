# Security And Dependency Notes

This app is intended as a local personal research tool. The server-side data layer keeps Yahoo fetching, SQLite writes, sync jobs, and annotation generation outside client components.

## Current Hygiene Rules

- Run `npm run audit:prod` before sharing or deploying the app outside local personal use.
- Do not run `npm audit fix --force` automatically. It may downgrade major packages and should be reviewed manually.
- Keep market data providers replaceable. Yahoo Finance is acceptable for personal MVP usage, but commercial/public use should switch to licensed IDX/vendor data.
- Route Handlers are public local HTTP endpoints. Mutating routes should keep using `POST`, `PATCH`, or `DELETE`, validate input shape, and return only UI-safe fields.
- Do not add brokerage credentials, order execution, or portfolio secrets to this app.

## Known Follow-Up

If `npm audit --omit=dev` reports a framework transitive dependency, prefer upgrading the owning framework package when a compatible patch is available instead of force-applying a downgrade.

## Audit Snapshot

Checked on 2026-05-31 with `npm audit --omit=dev`:

- 2 moderate findings remain through Next.js' transitive `postcss <8.5.10`.
- `npm audit fix --force` proposes installing `next@9.3.3`, which is a major downgrade from Next.js 16 and is not safe for this App Router codebase.
- Leave this open until a compatible Next.js patch is available, then upgrade Next.js and rerun the audit.
