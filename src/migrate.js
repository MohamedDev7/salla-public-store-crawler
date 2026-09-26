import {db} from './db.js';
await db.query(`
create table if not exists stores(
 id bigserial primary key,mahally_url text not null unique,store_name text default '',store_url text default '',category text default '',phone_whatsapp text default '',email text default '',instagram text default '',x text default '',tiktok text default '',snapchat text default '',status text not null default 'discovered',last_error text default '',contact_source text default '',discovered_at timestamptz not null default now(),last_crawled_at timestamptz,updated_at timestamptz not null default now()
);
alter table stores add column if not exists contact_source text default '';
create index if not exists stores_status_idx on stores(status);
create unique index if not exists stores_store_url_unique on stores(lower(store_url)) where store_url<>'';
create table if not exists crawl_runs(
 id bigserial primary key,status text not null default 'running',max_stores integer,discovered_count integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists discovery_frontier(
 id bigserial primary key,url text not null unique,depth integer not null default 0,status text not null default 'pending',claimed_run_id bigint references crawl_runs(id) on delete set null,attempts integer not null default 0,last_error text default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists discovery_frontier_status_idx on discovery_frontier(status,depth,id);
`);
await db.end();
