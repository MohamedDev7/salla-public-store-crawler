import {db} from './db.js';
await db.query(`
create table if not exists stores(
 id bigserial primary key,mahally_url text not null unique,store_name text default '',store_url text default '',category text default '',phone_whatsapp text default '',email text default '',instagram text default '',x text default '',tiktok text default '',snapchat text default '',status text not null default 'discovered',last_error text default '',contact_source text default '',discovered_at timestamptz not null default now(),last_crawled_at timestamptz,updated_at timestamptz not null default now()
);
alter table stores add column if not exists contact_source text default '';
alter table stores add column if not exists mahally_store_id text;
update stores set mahally_store_id=(regexp_match(mahally_url,'/stores/([0-9]+)(?:/|$)'))[1] where mahally_store_id is null and mahally_url ~ '/stores/[0-9]+';
-- Merge legacy /ar/stores/:id and /stores/:id duplicates. Keep the richest/highest-quality row.
with ranked as (
 select id,mahally_store_id,row_number() over(partition by mahally_store_id order by
  case status when 'reachable' then 5 when 'closed_or_maintenance' then 4 when 'store_unreachable' then 3 when 'mahally_only' then 2 else 1 end desc,
  ((phone_whatsapp<>'')::int+(email<>'')::int+(instagram<>'')::int+(x<>'')::int+(tiktok<>'')::int+(snapchat<>'')::int) desc,
  updated_at desc,id asc) rn
 from stores where mahally_store_id is not null
)
delete from stores s using ranked r where s.id=r.id and r.rn>1;
update stores set mahally_url='https://mahally.com/stores/'||mahally_store_id||'/' where mahally_store_id is not null;
create unique index if not exists stores_mahally_store_id_unique on stores(mahally_store_id) where mahally_store_id is not null;
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
