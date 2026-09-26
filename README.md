# Salla Public Store Crawler V2.2

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


## V2.5 verification hardening
- Search-result product overlap alone no longer proves merchant ownership.
- Known multi-seller marketplaces are rejected before candidate fetch.
- If the store name is not present in merchant identity surfaces, at least two distinctive Mahally products must match.
- Platform-owned email addresses (Salla/Mahally) are removed from merchant contacts.
- Phone/email values are normalized and deduplicated before storage.
- Social links keep only the first canonical public profile found on the merchant site.

## V2.6.2 persistent discovery resume
- Discovery URLs are persisted in PostgreSQL `discovery_frontier` instead of existing only as per-run BullMQ jobs.
- `/crawl/start?maxStores=N` means N **new** stores for that run; existing stores do not consume the limit.
- A later crawl resumes from pending frontier URLs instead of reseeding and walking the same completed pages again.
- Frontier states: `pending`, `processing`, `done`, `failed`. Interrupted `processing` items are recovered to `pending` when a new run starts.
- Newly discovered crawl pages are persisted before being scheduled, so redeploys do not lose the continuation path.
- `/stats` now includes `frontier` counts.
- `/admin/reset` clears the frontier as well as stores/runs/queues, so the next crawl starts from the configured seeds.

**Required once when upgrading to V2.6.2:** run `npm run migrate` to create `discovery_frontier`.


## V2.6.2 correctness patch
- Mahally store identity is the numeric `/stores/:id`, not the literal URL. `/ar/stores/123/` and `/stores/123` are one store.
- Migration safely merges legacy duplicate Mahally rows and keeps the richest/highest-quality record.
- New discoveries canonicalize Mahally URLs before reservation/enrichment, so duplicates do not consume `maxStores` or Tavily credits.
- Merchant identity verification uses meaningful normalized name tokens instead of loose substring matching. Product-only evidence still requires multiple distinctive matches.
- Placeholder/test email addresses are filtered generically, including reserved example domains and obvious local-parts.


## V2.6.2 hotfix
- Fix PostgreSQL UPSERT inference for the partial unique index on `mahally_store_id` by matching its predicate in `ON CONFLICT`.
- Add protected `POST /admin/retry-failed-enrich` to retry only failed enrichment jobs after deploying the fix.
- No reset is required and existing stores/frontier are preserved.
