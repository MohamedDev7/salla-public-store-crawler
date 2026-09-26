import {cfg} from './config.js';

const SEARCH_URL='https://api.tavily.com/search';
const normalize=s=>(s||'').replace(/\s+/g,' ').trim();

export class TavilyError extends Error {
  constructor(message,{status=0,kind='tavily_error'}={}){super(message);this.name='TavilyError';this.status=status;this.kind=kind;}
}

export function buildStoreQuery({storeName='',products=[]}={}){
  const name=normalize(storeName);
  const product=products.map(normalize).find(x=>x.length>=4)||'';
  return [name,product,'متجر'].filter(Boolean).map(x=>`"${x.replaceAll('"','')}"`).join(' ');
}

export async function searchStoreIdentity(identity,{signal}={}){
  if(!cfg.tavilyApiKey) throw new TavilyError('TAVILY_API_KEY is required',{kind:'config'});
  const query=buildStoreQuery(identity);
  if(!query) return {query:'',results:[]};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),cfg.requestTimeoutMs);
  const onAbort=()=>controller.abort();
  signal?.addEventListener?.('abort',onAbort,{once:true});
  try{
    const res=await fetch(SEARCH_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${cfg.tavilyApiKey}`},body:JSON.stringify({query,topic:'general',search_depth:'basic',max_results:cfg.tavilyMaxResults,include_answer:false,include_raw_content:false,include_images:false}),signal:controller.signal});
    const text=await res.text();
    if(!res.ok){let msg=text.slice(0,500);try{msg=JSON.parse(text)?.detail||JSON.parse(text)?.message||msg}catch{};throw new TavilyError(`Tavily HTTP ${res.status}: ${msg}`,{status:res.status,kind:res.status===429?'rate_limit':res.status===401||res.status===403?'auth':'http'});}
    let body;try{body=JSON.parse(text)}catch{throw new TavilyError('Tavily returned invalid JSON',{kind:'invalid_json'});}
    const results=(body.results||[]).map(r=>({url:r.url||'',title:normalize(r.title),content:normalize(r.content),score:Number(r.score)||0})).filter(r=>r.url);
    return {query,results};
  }catch(e){if(e?.name==='AbortError')throw new TavilyError(`Tavily timeout after ${cfg.requestTimeoutMs}ms`,{kind:'timeout'});throw e;}finally{clearTimeout(timer);signal?.removeEventListener?.('abort',onAbort);}
}
