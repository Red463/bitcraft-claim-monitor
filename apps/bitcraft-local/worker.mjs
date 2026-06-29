process.env.BITCRAFT_PROCESS_ROLE = process.env.BITCRAFT_PROCESS_ROLE || 'worker';
await import('./server.mjs');
