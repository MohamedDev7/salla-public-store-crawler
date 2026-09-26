import IORedis from 'ioredis'; import {Queue} from 'bullmq'; import {cfg} from './config.js';
export const connection=new IORedis(cfg.redisUrl,{maxRetriesPerRequest:null});
export const discoveryQueue=new Queue('discovery',{connection}); export const enrichQueue=new Queue('enrich',{connection});
