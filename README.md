# Salla Public Store Crawler V2.7.1

Corrective release focused on resolver precision and contact hygiene.

## Changes
- Keeps Mahally `store_name` as the canonical merchant identity; merchant-page titles no longer overwrite it.
- Separates product relevance from merchant/site identity.
- After a Tavily result passes candidate/product checks, the crawler fetches the root homepage and requires independent site identity evidence from structured branding (`og:site_name`, application name, logo alt, JSON-LD Organization/Store/Brand) or the merchant domain itself.
- This blocks retailer/product-page false positives such as a CLARA product page on an unrelated retailer domain.
- Rejects asset-like false emails such as `code5sm@2x.png`, image/font/script extensions, reserved example domains, and common placeholders.
- When revalidation rejects an old mapping, stale `store_url`, category and contacts are cleared before setting `mahally_only`.
- Adds protected `POST /admin/revalidate-stores` to re-run all existing stores through the new V2.7.1 resolver without resetting stores or the persistent discovery frontier.

## Upgrade
No DB migration is required from V2.6.2.

1. Deploy V2.7.1 to API and Worker.
2. Do NOT call `/admin/reset`.
3. Revalidate existing rows once:
   `POST /admin/revalidate-stores` with the normal admin Bearer token.
4. Wait until enrich queue has `active=0`, `waiting=0`, `delayed=0`.
5. Export CSV and review before scaling discovery.

Revalidation performs fresh Tavily searches, so it consumes approximately one Basic search credit per existing store.
