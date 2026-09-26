# Salla Public Store Crawler V2

Crawler/enrichment pipeline for public business information. It preserves stores even when contact fields are missing and leaves those fields blank.

## Architecture
- API: starts crawls, exposes stats, records and CSV export.
- Worker: BullMQ discovery + enrichment workers.
- PostgreSQL: durable source of truth/checkpoint state.
- Redis/BullMQ: durable queues, retries and exponential backoff.
- robots.txt + per-origin delay are honored.

## Quick start
```bash
docker compose up -d --build
curl -X POST http://localhost:3000/crawl/start
curl http://localhost:3000/stats
curl -o stores.csv http://localhost:3000/export.csv
```

## Coolify
Deploy this repo twice from the same Dockerfile:
1. API service: `ROLE=api`, expose port 3000.
2. Worker service: `ROLE=worker`, no public port.
Attach PostgreSQL and Redis and set `DATABASE_URL` / `REDIS_URL` to their internal URLs.

Start crawl with `POST /crawl/start`. Check `GET /stats`. Download current data from `GET /export.csv` at any time.

## Important
This project only extracts business information visible on public pages. It does not bypass authentication, CAPTCHAs, access controls, or robots.txt. Discovery coverage depends on what public sources expose; no crawler can guarantee every Salla merchant is publicly discoverable.
