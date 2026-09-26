import robotsParser from 'robots-parser';
import {cfg} from './config.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class FetchError extends Error{constructor(kind,url,message,meta={}){super(message);this.name='FetchError';this.kind=kind;this.url=url;Object.assign(this,meta);}}
class Fetcher{
 constructor(){this.robots=new Map();this.last=new Map();}
 async raw(url,phase='fetch'){
  const origin=new URL(url).origin,prev=this.last.get(origin)||0,wait=Math.max(0,cfg.delay-(Date.now()-prev));if(wait)await sleep(wait);this.last.set(origin,Date.now());
  const c=new AbortController(),started=Date.now(),t=setTimeout(()=>c.abort(),cfg.requestTimeoutMs);
  console.log(`[${phase}:start] url=${url}`);
  try{
   const r=await fetch(url,{headers:{'user-agent':cfg.ua,accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'},redirect:'follow',signal:c.signal});
   console.log(`[${phase}:response] status=${r.status} duration=${Date.now()-started}ms url=${r.url}`);return r;
  }catch(e){const duration=Date.now()-started;if(e?.name==='AbortError'){console.warn(`[${phase}:timeout] after=${duration}ms url=${url}`);throw new FetchError('timeout',url,`timeout after ${duration}ms`,{duration});}const code=e?.cause?.code||e?.code||'';console.warn(`[${phase}:network_error] code=${code||'unknown'} duration=${duration}ms url=${url} message=${e.message}`);throw new FetchError(code==='ENOTFOUND'?'dns':'network',url,e.message,{code,duration});}
  finally{clearTimeout(t)}
 }
 async allowed(url){const u=new URL(url),k=u.origin;if(!this.robots.has(k)){try{const r=await this.raw(k+'/robots.txt','robots');this.robots.set(k,robotsParser(k+'/robots.txt',await r.text()));}catch(e){console.warn(`[robots:fallback] origin=${k} reason=${e.kind||e.message}`);this.robots.set(k,robotsParser(k+'/robots.txt',''));}}const allowed=this.robots.get(k).isAllowed(url,cfg.ua)!==false;if(!allowed)console.warn(`[robots:blocked] url=${url}`);return allowed;}
 async get(url,phase='fetch'){if(!(await this.allowed(url)))return{blocked:true,kind:'robots',url};const r=await this.raw(url,phase);if(!r.ok){const kind=r.status===429?'rate_limited':r.status===403?'forbidden':r.status>=500?'server_error':'http_error';console.warn(`[${phase}:http_error] kind=${kind} status=${r.status} url=${r.url}`);return{status:r.status,kind,url:r.url,retryable:r.status===429||r.status>=500};}return{status:r.status,url:r.url,text:await r.text(),ct:r.headers.get('content-type')||'',kind:'ok'};}
}
export const fetcher=new Fetcher();
