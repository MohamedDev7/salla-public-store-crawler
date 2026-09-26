export function mahallyStoreId(url=''){
  try{const u=new URL(url);const m=u.pathname.match(/\/stores\/(\d+)(?:\/|$)/i);return m?.[1]||'';}catch{return String(url).match(/\/stores\/(\d+)(?:\/|$)/i)?.[1]||'';}
}
export function canonicalMahallyUrl(url=''){
  const id=mahallyStoreId(url);return id?`https://mahally.com/stores/${id}/`:url;
}
