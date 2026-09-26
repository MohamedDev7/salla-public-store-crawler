export const cfg={
 port:+(process.env.PORT||3000), databaseUrl:process.env.DATABASE_URL, redisUrl:process.env.REDIS_URL,
 adminApiKey:process.env.ADMIN_API_KEY||'',
 ua:process.env.USER_AGENT||'RawaPublicStoreResearchBot/2.2 (+public-business-research)',
 delay:+(process.env.REQUEST_DELAY_MS||2500), concurrency:Math.max(1,+(process.env.WORKER_CONCURRENCY||3)),
 maxDiscoveryPages:+(process.env.MAX_DISCOVERY_PAGES||10000), requestTimeoutMs:Math.max(3000,+(process.env.REQUEST_TIMEOUT_MS||10000)),
 seeds:(process.env.SEED_URLS||'https://mahally.com/ar/').split(',').map(x=>x.trim()).filter(Boolean),
 discoveryHosts:new Set((process.env.DISCOVERY_HOSTS||'mahally.com,www.mahally.com').split(',').map(x=>x.trim())),
};
if(!cfg.databaseUrl) throw new Error('DATABASE_URL is required'); if(!cfg.redisUrl) throw new Error('REDIS_URL is required');
