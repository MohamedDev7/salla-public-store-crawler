import {Worker,UnrecoverableError} from 'bullmq';
import * as cheerio from 'cheerio';
import {connection,discoveryQueue,enrichQueue} from './queues.js';
import {cfg} from './config.js';
import {fetcher} from './fetcher.js';
import {absolute,extractMahally,classifySearchResult,verifyMerchantPage,verifyMerchantIdentity,extractStore,strongClosedEvidence} from './extract.js';
import {searchStoreIdentity,TavilyError} from './tavily.js';
import {upsertStore,getRun,reserveStore,addFrontier,finishFrontier,claimFrontier,releaseRunFrontier} from './db.js';
import {safeJobId} from './job-id.js';
import {canonicalMahallyUrl} from './mahally-id.js';

const storeHint=/\/stores\/\d+\/?$/i,bad=/\/(login|account|cart|checkout|privacy|terms)\b/i;
const permanent=k=>['robots','forbidden','http_error','dns'].includes(k);
function failPermanent(msg){throw new UnrecoverableError(msg)}
function originOf(url){try{return new URL(url).origin+'/'}catch{return''}}

async function scheduleFrontier(runId){
 const run=await getRun(runId);if(!run||run.status!=='running')return 0;
 const rows=await claimFrontier(runId,40);for(const row of rows)await discoveryQueue.add('discover',{url:row.url,depth:row.depth,runId,frontierId:row.id},{jobId:safeJobId(`discover-${runId}`,row.url),attempts:3,backoff:{type:'exponential',delay:3000},removeOnComplete:1000});
 if(rows.length)console.log(`[frontier:schedule] run=${runId} jobs=${rows.length}`);return rows.length;
}

const discoveryWorker=new Worker('discovery',async job=>{
 const {url,depth=0,runId,frontierId}=job.data;console.log(`[discovery:start] job=${job.id} frontier=${frontierId||0} run=${runId} depth=${depth} url=${url}`);
 const run=await getRun(runId);if(!run||run.status!=='running'){if(frontierId)await finishFrontier(frontierId,'pending','');console.log(`[discovery:stop] job=${job.id} reason=run_${run?.status||'missing'}`);return{stopped:true};}
 let res;try{res=await fetcher.get(url,'discovery_fetch')}catch(e){if(frontierId&&permanent(e.kind))await finishFrontier(frontierId,'failed',e.message);console.warn(`[discovery:error] job=${job.id} kind=${e.kind||'unknown'} message=${e.message}`);throw e}
 if(!res.text){console.warn(`[discovery:no_content] job=${job.id} kind=${res.kind||'unknown'} status=${res.status||0}`);if(permanent(res.kind)){if(frontierId)await finishFrontier(frontierId,'failed',`${res.kind}: ${url}`);failPermanent(`${res.kind}: ${url}`);}throw new Error(`${res.kind||'fetch_failed'} HTTP ${res.status||0}`)}
 const $=cheerio.load(res.text);const links=[];
 $('a[href]').each((_,el)=>{const u=absolute($(el).attr('href'),res.url);if(!u)return;let p;try{p=new URL(u)}catch{return}if(cfg.discoveryHosts.has(p.hostname)&&storeHint.test(p.pathname))links.push({store:canonicalMahallyUrl(u.replace(/\?.*$/,'')),hint:($(el).text()||'').trim()});if(depth<8&&cfg.discoveryHosts.has(p.hostname)&&!bad.test(p.pathname)&&(/page=\d+/i.test(p.search)||/\/(stores|categories|search|ar)\b/i.test(p.pathname)))links.push({page:u});});
 let stores=0,pages=0;for(const x of links){const current=await getRun(runId);if(!current||current.status!=='running')break;if(x.store){const reserved=await reserveStore(runId,{mahally_url:x.store,store_name:x.hint});if(!reserved.allowed)break;if(reserved.inserted){stores++;await enrichQueue.add('enrich',{mahally_url:x.store,hint:x.hint,runId},{jobId:safeJobId(`enrich-${runId}`,x.store),attempts:3,backoff:{type:'exponential',delay:3000},removeOnComplete:1000});}}else{const f=await addFrontier(x.page,depth+1);if(f.status==='pending')pages++;}}
 if(frontierId)await finishFrontier(frontierId,'done','');
 const current=await getRun(runId);if(current?.status==='running')await scheduleFrontier(runId);else await releaseRunFrontier(runId);
 console.log(`[discovery:done] job=${job.id} links=${links.length} newStores=${stores} frontierPages=${pages}`);return{links:links.length,newStores:stores,pages};
},{connection,concurrency:1});

const enrichWorker=new Worker('enrich',async job=>{
 const {mahally_url,hint}=job.data;const started=Date.now();console.log(`[enrich:start] job=${job.id} attempt=${job.attemptsMade+1} mahally=${mahally_url}`);
 try{
  let first;try{first=await fetcher.get(mahally_url,'mahally_fetch')}catch(e){console.warn(`[enrich:mahally_error] job=${job.id} kind=${e.kind||'unknown'} message=${e.message}`);throw e}
  if(!first.text){await upsertStore({mahally_url,store_name:hint,status:'mahally_unreachable',last_error:`${first.kind||'HTTP'} ${first.status||0}`});if(permanent(first.kind))failPermanent(`${first.kind}: ${mahally_url}`);throw new Error(`${first.kind||'mahally_fetch_failed'} ${first.status||0}`)}
  const meta=extractMahally(first.text,first.url);const identity={storeName:meta.store_name||hint||'',products:meta.products||[]};
  console.log(`[identity] job=${job.id} store=${identity.storeName} products=${identity.products.length}`);
  let search;try{search=await searchStoreIdentity(identity)}catch(e){if(e instanceof TavilyError){console.warn(`[tavily:error] job=${job.id} kind=${e.kind} status=${e.status||0} message=${e.message}`);if(['auth','config'].includes(e.kind))failPermanent(e.message);}throw e}
  console.log(`[tavily:results] job=${job.id} query=${JSON.stringify(search.query)} count=${search.results.length}`);
  let chosen=null,lastReason='no_verified_search_result';
  for(const result of search.results){const cls=classifySearchResult(result.url);if(!cls.accept){console.log(`[resolver:reject] job=${job.id} candidate=${result.url} reason=${cls.reason}`);lastReason=cls.reason;continue}
   console.log(`[resolver:verify] job=${job.id} candidate=${result.url} score=${result.score}`);let probe;try{probe=await fetcher.get(result.url,'candidate_fetch')}catch(e){lastReason=e.kind||'network';console.warn(`[resolver:reject] job=${job.id} candidate=${result.url} reason=${lastReason}`);continue}
   if(!probe.text){lastReason=probe.kind||'empty';console.warn(`[resolver:reject] job=${job.id} candidate=${result.url} reason=${lastReason}`);continue}
   const verified=verifyMerchantPage(probe.text,probe.url,identity.storeName,identity.products);if(!verified.ok){lastReason=verified.reason;console.log(`[resolver:reject] job=${job.id} candidate=${probe.url} reason=${verified.reason}`);continue}
   chosen={probe,verified,result};console.log(`[resolver:accept] job=${job.id} candidate=${probe.url} reason=${verified.reason}`);break;
  }
  if(!chosen){await upsertStore({mahally_url,store_name:identity.storeName,store_url:'',status:'mahally_only',last_error:`resolver:${lastReason}`,contact_source:''});console.log(`[enrich:done] job=${job.id} status=mahally_only reason=${lastReason} duration=${Date.now()-started}ms`);return{status:'mahally_only',reason:lastReason};}
  const storeRoot=originOf(chosen.probe.url);let merchant=chosen.probe;
  if(storeRoot){try{const home=await fetcher.get(storeRoot,'store_home_fetch');if(home.text)merchant=home;else{console.log(`[resolver:reject] job=${job.id} candidate=${storeRoot} reason=homepage_unavailable`);await upsertStore({mahally_url,store_name:identity.storeName,store_url:'',status:'mahally_only',last_error:'resolver:homepage_unavailable',contact_source:''});return{status:'mahally_only',reason:'homepage_unavailable'};}}catch(e){console.log(`[resolver:reject] job=${job.id} candidate=${storeRoot} reason=homepage_${e.kind||'network'}`);await upsertStore({mahally_url,store_name:identity.storeName,store_url:'',status:'mahally_only',last_error:`resolver:homepage_${e.kind||'network'}`,contact_source:''});return{status:'mahally_only',reason:`homepage_${e.kind||'network'}`};}}
  const homeIdentity=verifyMerchantIdentity(merchant.text,storeRoot||merchant.url,identity.storeName);
  if(!homeIdentity.ok){console.log(`[resolver:reject] job=${job.id} candidate=${storeRoot||merchant.url} reason=${homeIdentity.reason}`);await upsertStore({mahally_url,store_name:identity.storeName,store_url:'',status:'mahally_only',last_error:`resolver:${homeIdentity.reason}`,contact_source:''});return{status:'mahally_only',reason:homeIdentity.reason};}
  console.log(`[resolver:homepage_identity] job=${job.id} candidate=${storeRoot||merchant.url} reason=${homeIdentity.reason}`);
  const data=extractStore(merchant.text,storeRoot||merchant.url);const status=strongClosedEvidence(merchant.text)?'closed_or_maintenance':'reachable';
  try{await upsertStore({mahally_url,store_name:identity.storeName,store_url:storeRoot||merchant.url,category:data.category,phone_whatsapp:data.phone_whatsapp,email:data.email,instagram:data.instagram,x:data.x,tiktok:data.tiktok,snapchat:data.snapchat,status,contact_source:new URL(storeRoot||merchant.url).hostname,last_error:''});}
  catch(e){if(e?.code==='23505'){console.warn(`[resolver:reject] job=${job.id} candidate=${storeRoot||merchant.url} reason=store_url_already_owned`);await upsertStore({mahally_url,store_name:identity.storeName,store_url:'',status:'mahally_only',last_error:'resolver:store_url_already_owned',contact_source:''});return{status:'mahally_only',reason:'store_url_already_owned'};}throw e;}
  console.log(`[enrich:done] job=${job.id} status=${status} phone=${data.phone_whatsapp?1:0} email=${data.email?1:0} duration=${Date.now()-started}ms url=${storeRoot||merchant.url}`);return{status};
 }catch(e){if(e?.name==='UnrecoverableError')throw e;console.warn(`[enrich:retry] job=${job.id} attempt=${job.attemptsMade+1} kind=${e.kind||'unknown'} message=${e.message}`);throw e;}
},{connection,concurrency:cfg.concurrency});

for(const [name,w] of [['discovery',discoveryWorker],['enrich',enrichWorker]]){w.on('failed',(job,e)=>console.error(`[${name}:failed] job=${job?.id||'unknown'} attemptsMade=${job?.attemptsMade||0} message=${e.message}`));w.on('error',e=>console.error(`[${name}:worker_error] ${e.stack||e}`));}
console.log(`[worker] discovery concurrency=1; enrich concurrency=${cfg.concurrency}; requestTimeoutMs=${cfg.requestTimeoutMs}; delayMs=${cfg.delay}; tavily=${cfg.tavilyApiKey?'configured':'missing'}`);
