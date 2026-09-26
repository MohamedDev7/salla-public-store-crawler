const role = (process.env.ROLE || 'api').trim().toLowerCase();

if (role === 'api') {
  console.log('[launcher] ROLE=api -> starting API server');
  await import('./server.js');
} else if (role === 'worker') {
  console.log('[launcher] ROLE=worker -> starting discovery + enrich workers');
  await import('./worker.js');
} else {
  console.error(`[launcher] Invalid ROLE=${JSON.stringify(process.env.ROLE)}. Expected "api" or "worker".`);
  process.exit(1);
}
