import assert from 'node:assert/strict';
import app from '../api/index.js';

// Importing the Vercel handler must not open a port or call OpenAI.
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const list = await fetch(`${base}/api/designs`).then(r => r.json());
  assert.equal(list.ok, true);
  assert.equal(list.designs.length, 35);
  const design = await fetch(`${base}${list.designs[0].dexpiPath}`);
  assert.equal(design.status, 200);
  await design.json();
  const malformed = await fetch(`${base}/api/gac/assistant`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(malformed.status, 400);
  console.log('Vercel API entry passed: health, 35 designs, design JSON and input validation.');
} finally { await new Promise(resolve => server.close(resolve)); }
