import robotsParser from 'robots-parser'; import {cfg} from './config.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class Fetcher{constructor(){this.robots=new Map();this.last=new Map();}
async raw(url){const origin=new URL(url).origin, prev=this.last.get(origin)||0, wait=Math.max(0,cfg.delay-(Date.now()-prev));if(wait)await sleep(wait);this.last.set(origin,Date.now());const c=new AbortController(),t=setTimeout(()=>c.abort(),25000);try{return await fetch(url,{headers:{'user-agent':cfg.ua,accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'},redirect:'follow',signal:c.signal});}finally{clearTimeout(t)}}
async allowed(url){const u=new URL(url),k=u.origin;if(!this.robots.has(k)){try{const r=await this.raw(k+'/robots.txt');this.robots.set(k,robotsParser(k+'/robots.txt',await r.text()));}catch{this.robots.set(k,robotsParser(k+'/robots.txt',''));}}return this.robots.get(k).isAllowed(url,cfg.ua)!==false;}
async get(url){if(!(await this.allowed(url)))return{blocked:true,url};const r=await this.raw(url);if(!r.ok)return{status:r.status,url:r.url};return{status:r.status,url:r.url,text:await r.text(),ct:r.headers.get('content-type')||''};}}
export const fetcher=new Fetcher();
