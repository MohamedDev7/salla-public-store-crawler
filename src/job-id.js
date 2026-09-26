import crypto from 'node:crypto';
export function safeJobId(prefix,value){
 const hash=crypto.createHash('sha256').update(String(value)).digest('hex').slice(0,40);
 return `${prefix}-${hash}`;
}
