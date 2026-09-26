import * as cheerio from 'cheerio';
const norm=s=>(s||'').replace(/\\u003e/gi,'').replace(/\s+/g,' ').trim();
const uniq=a=>[...new Set(a.filter(Boolean))];
const PLATFORM_ROOTS=['mahally.com','salla.sa'];
const NON_MERCHANT_ROOTS=['mahally.com','salla.com','salla.sa','salla.dev','amazon.sa','amazon.com','amazon.ae','noon.com','aliexpress.com','ebay.com','etsy.com','instagram.com','twitter.com','x.com','tiktok.com','snapchat.com','facebook.com','youtube.com','linkedin.com','whatsapp.com','google.com','googleapis.com','gstatic.com','apple.com','cloudflare.com','cloudfront.net'];
const emailRx=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
const phoneRx=/(?:\+?966|00966|0)?5\d{8}/g;
const phone=s=>{const x=(s||'').replace(/[^\d+]/g,'');if(/^05\d{8}$/.test(x))return'+966'+x.slice(1);if(/^009665\d{8}$/.test(x))return'+'+x.slice(2);if(/^9665\d{8}$/.test(x))return'+'+x;if(/^\+9665\d{8}$/.test(x))return x;return null};
const host=u=>{try{return new URL(u).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}};
const cleanUrl=(h,base)=>{try{const u=new URL(h,base);if(!/^https?:$/.test(u.protocol))return'';u.hash='';return u.href}catch{return''}};
const rootMatches=(h,r)=>h===r||h.endsWith('.'+r);
const tokens=s=>uniq(norm(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(' ').filter(x=>x.length>=3));
const GENERIC_IDENTITY_TOKENS=new Set(['store','shop','متجر','السعودية','saudi','arabia','official','online','للتجارة','مؤسسة','شركة','company','trading','gmbh','llc']);
const identityTokens=s=>tokens(s).filter(x=>!GENERIC_IDENTITY_TOKENS.has(x));
const identityMatch=(expected,head)=>{const a=identityTokens(expected),b=new Set(tokens(head));if(!a.length)return false;const hits=a.filter(x=>b.has(x));return hits.length>=Math.min(2,a.length) || (a.length===1&&hits.length===1&&a[0].length>=5);};
const PLACEHOLDER_LOCAL=/^(?:test|testing|example|demo|sample|user|username|name|email|your(?:name|email)?|guest|admin|info123|abc|asdf|foo|bar|noreply|no-reply)$/i;
const RESERVED_EXAMPLE_DOMAINS=new Set(['example.com','example.org','example.net','beispiel.de','example.edu']);
const plausibleEmail=e=>{const [local,domain]=String(e||'').toLowerCase().split('@');if(!local||!domain)return false;if(PLACEHOLDER_LOCAL.test(local)||RESERVED_EXAMPLE_DOMAINS.has(domain))return false;if(/^(?:your|example|test|demo)[._-]/i.test(local))return false;return true;};
export function classifyCandidate(url,base,label=''){
 const h=host(url),b=host(base); if(!h||h===b)return{accept:false,reason:'same_host'};
 if(NON_MERCHANT_ROOTS.some(r=>rootMatches(h,r)))return{accept:false,reason:'known_non_merchant'};
 if(PLATFORM_ROOTS.some(r=>rootMatches(h,r)))return{accept:false,reason:'platform_domain'};
 if(/(?:cdn|static|assets|images?|fonts?|analytics|tracking|pixel|api)(?:\.|-)/i.test(h))return{accept:false,reason:'infrastructure_host'};
 if(/privacy|terms|policy|support|help|login|account|developer|docs/i.test(label))return{accept:false,reason:'non_store_label'};
 return{accept:true,reason:'external_merchant_candidate'};
}
export function extractMahally(html,url){const $=cheerio.load(html);const title=norm($('h1').first().text()||$('meta[property="og:title"]').attr('content')||$('title').text()).replace(/\s*[-|].*$/,'');const raw=[];$('a[href]').each((_,e)=>{const href=cleanUrl($(e).attr('href'),url);if(!href)return;const label=norm($(e).text()+' '+($(e).attr('aria-label')||'')+' '+($(e).attr('title')||''));const cls=classifyCandidate(href,url,label);let score=0;if(/زيارة|المتجر|store|shop|website|الموقع|تسوق/i.test(label))score+=10;if($('main').find(e).length)score+=2;if(/^https:\/\//i.test(href))score+=1;raw.push({url:href,label,score,...cls});});const accepted=raw.filter(x=>x.accept).sort((a,b)=>b.score-a.score);const products=uniq($('a[href*="/products/"]').map((_,e)=>norm($(e).attr('title')||$(e).attr('aria-label')||$(e).text())).get().filter(x=>x.length>=4&&x.length<=180)).slice(0,3);return{store_name:title,products,resolver_candidates:uniq(accepted.map(x=>x.url)).slice(0,15),resolver_audit:raw.slice(0,50)};}
export function verifyMerchantPage(html,url,expectedName='',expectedProducts=[]){
 const $=cheerio.load(html);const h=host(url);if(!h)return{ok:false,reason:'invalid_host'};
 if(NON_MERCHANT_ROOTS.some(r=>rootMatches(h,r))||PLATFORM_ROOTS.some(r=>rootMatches(h,r)))return{ok:false,reason:'platform_marketplace_or_nonmerchant_host'};
 const siteName=norm($('meta[property="og:site_name"]').attr('content'));
 const title=norm($('title').text()||$('h1').first().text());
 const body=norm($('body').text()).slice(0,40000);
 const head=(siteName+' '+title+' '+norm($('h1').first().text())).toLowerCase();
 if(/مركز المساعدة|help center|documentation|developer portal|تسجيل الدخول.*سلة/i.test(head+' '+body.slice(0,3000)))return{ok:false,reason:'support_or_platform_page'};
 const commerceSignals=[/add[-_ ]?to[-_ ]?cart/i.test(html),/سلة التسوق|أضف للسلة|اضافة للسلة|إتمام الطلب|checkout/i.test(body),$('meta[property="og:type"]').attr('content')==='product',$('a[href*="cart"],a[href*="checkout"],form[action*="cart"]').length>0].filter(Boolean).length;
 if(commerceSignals===0)return{ok:false,reason:'no_commerce_evidence'};
 const expected=norm(expectedName).toLowerCase();
 const identity=expected&&expected.length>2&&identityMatch(expected,head);
 const matchedProducts=uniq((expectedProducts||[]).map(norm).filter(x=>x.length>=4).filter(x=>body.toLowerCase().includes(x.toLowerCase())));
 // Product matches are supporting evidence, not sufficient proof by themselves. This avoids
 // treating marketplaces/listing sites as the merchant merely because they carry the same item.
 if(!identity && matchedProducts.length<2)return{ok:false,reason:matchedProducts.length?'product_only_insufficient':'identity_not_verified'};
 return{ok:true,reason:identity?'store_identity_match':'multiple_product_identity_match',commerceSignals,title,matchedProducts};
}

export function classifySearchResult(url){
 const h=host(url);if(!h)return{accept:false,reason:'invalid_host'};
 if(NON_MERCHANT_ROOTS.some(r=>rootMatches(h,r))||PLATFORM_ROOTS.some(r=>rootMatches(h,r)))return{accept:false,reason:'platform_or_nonmerchant_host'};
 if(/(?:cdn|static|assets|images?|fonts?|analytics|tracking|pixel|api)(?:\.|-)/i.test(h))return{accept:false,reason:'infrastructure_host'};
 return{accept:true,reason:'search_candidate'};
}
export function extractStore(html,url){
 const $=cheerio.load(html),text=norm($.root().text());
 const title=norm($('meta[property="og:site_name"]').attr('content')||$('h1').first().text()||$('title').text()).replace(/\s*[-|].*$/,'');
 const merchantHost=host(url);
 const platformEmailRoots=['salla.sa','salla.com','mahally.com','salla.dev'];
 const rawEmails=[...$('a[href^="mailto:"]').map((_,e)=>(($(e).attr('href')||'').slice(7).split('?')[0])).get(),...(text.match(emailRx)||[])];
 const emails=uniq(rawEmails.map(x=>norm(x).toLowerCase()).filter(x=>{if(!x||!x.includes('@'))return false;const d=x.split('@').pop();return plausibleEmail(x)&&!platformEmailRoots.some(r=>rootMatches(d,r));}));
 const rawPhones=[...$('a[href^="tel:"]').map((_,e)=>(($(e).attr('href')||'').slice(4))).get(),...$('a[href*="wa.me/"]').map((_,e)=>((($(e).attr('href')||'').match(/wa\.me\/(\d+)/)||[])[1])).get(),...$('a[href*="api.whatsapp.com"]').map((_,e)=>{try{return new URL($(e).attr('href')).searchParams.get('phone')}catch{return''}}).get(),...(text.match(phoneRx)||[])];
 const phones=uniq(rawPhones.map(phone).filter(Boolean));
 const social={instagram:'',x:'',tiktok:'',snapchat:''};
 $('a[href]').each((_,e)=>{const u=cleanUrl($(e).attr('href'),url);if(!u)return;const uh=host(u);if(!uh||uh===merchantHost)return;if(/instagram\.com/i.test(uh)&&!social.instagram)social.instagram=u;else if(/(?:twitter|x)\.com/i.test(uh)&&!social.x)social.x=u;else if(/tiktok\.com/i.test(uh)&&!social.tiktok)social.tiktok=u;else if(/snapchat\.com/i.test(uh)&&!social.snapchat)social.snapchat=u});
 const category=norm($('[class*="breadcrumb"] a').last().text()||$('meta[property="product:category"]').attr('content')||'');
 return{store_name:title,store_url:url,category,phone_whatsapp:phones.join(' | '),email:emails.join(' | '),...social};
}
export function strongClosedEvidence(html){const $=cheerio.load(html);const title=norm($('title').text());const h1=norm($('h1').first().text());const body=norm($('body').text());return /^(?:المتجر )?(?:مغلق|تحت الصيانة)|^(?:closed|maintenance)/i.test(h1)||/المتجر مغلق|المتجر تحت الصيانة|store is closed|store under maintenance/i.test(title)||(/سنعود قريب[اًًا]?/i.test(body)&&body.length<5000);}
export const absolute=(href,base)=>{try{return new URL(href,base).href.split('#')[0]}catch{return null}};
