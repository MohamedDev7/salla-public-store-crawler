# Salla Public Store Crawler V2.4

Production crawler for discovering public Salla/Mahally store pages and enriching only from the resolved public merchant storefront.

## Important V2.2 fixes
- Mahally pages are discovery/identity sources only; contacts/socials are never harvested from Mahally's global page payload.
- Resolves an external merchant storefront first, then extracts public business contacts from that host only.
- `reachable` means the resolved storefront itself returned readable HTML.
- `closed_or_maintenance` requires strong storefront-page evidence, not a loose regex over Mahally HTML.
- `maxStores` reservation is transactional and strict for newly discovered stores.
- `POST /admin/reset` clears stores, crawl runs and BullMQ jobs.
- Optional `ADMIN_API_KEY` protects start/reset/export. `/health` and `/stats` remain public.

## Coolify
Deploy the same repository twice:
- API: `ROLE=api`
- Worker: `ROLE=worker`

Both use the same `DATABASE_URL` and `REDIS_URL`. Set the same `ADMIN_API_KEY` on API (worker may also receive it harmlessly).

Run migrations during deploy/once after update:
`npm run migrate`

Start limited crawl:
`curl -X POST -H "Authorization: Bearer $KEY" "https://host/crawl/start?maxStores=100"`

Unlimited crawl:
`curl -X POST -H "Authorization: Bearer $KEY" "https://host/crawl/start"`

Reset all crawler data and queued jobs:
`curl -X POST -H "Authorization: Bearer $KEY" "https://host/admin/reset"`

Export:
`curl -H "Authorization: Bearer $KEY" "https://host/export.csv" -o stores.csv`

If `ADMIN_API_KEY` is left empty, these endpoints remain unprotected for backward compatibility; production should set it.


## V2.2.1 diagnostics
Worker logs now show discovery/enrichment stages, HTTP status, timeouts, resolver results, retry reasons and permanent failures. Configure `REQUEST_TIMEOUT_MS=10000` (minimum 3000). HTTP 403, robots denial, ordinary non-retryable 4xx, and DNS-not-found are treated as permanent; 429, 5xx, timeouts and transient network errors retry with backoff.

## v2.3 resolver hardening
- External links from Mahally are candidates, never assumed merchant URLs.
- Salla/Mahally platform, help/support, social, and infrastructure destinations are rejected before merchant resolution.
- Every candidate is fetched and verified for merchant identity/commerce evidence before `store_url` is persisted.
- If no candidate can be verified, the store remains in the dataset with `status=mahally_only`, `store_url` blank, and a resolver reason in `last_error`.
- A duplicate verified `store_url` no longer fails enrichment; the later record safely falls back to `mahally_only`.


## V2.4 — Tavily entity resolution
- Mahally remains the discovery and identity source.
- The worker extracts the store name plus up to 3 distinctive product titles from the Mahally store page.
- Exactly one Tavily Basic Search is attempted per enrichment job; no automatic second query is issued.
- Tavily results are only candidates. Platform/social/search/infrastructure destinations are rejected.
- Candidate pages are fetched locally and must show commerce evidence plus either store-name identity or a distinctive Mahally product match.
- When a deep product page verifies the merchant, the crawler normalizes `store_url` to the domain root and fetches that homepage for public contact extraction.
- If no result verifies, the row is retained as `mahally_only`; no guessed domain is stored.

Worker environment:
```env
TAVILY_API_KEY=tvly-...
TAVILY_MAX_RESULTS=5
```

`search_depth=basic` is intentionally fixed in code to keep Tavily usage to 1 credit per search.
