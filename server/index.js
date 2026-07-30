import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDecisionLog } from './decisionAgent.js';

const app = express();
const port = Number(process.env.API_PORT || 8787);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const designJsonDir = path.join(projectRoot, 'data', 'json');

app.use(express.json({ limit: '1mb' }));


function designIdFromFile(file) {
  return file.replace(/\.json$/i, '');
}

function ensureSafeDesignId(id) {
  if (!/^[A-Za-z0-9_.-]+$/.test(id || '')) {
    throw new Error('Invalid design id');
  }
  return id;
}

app.get('/api/designs', async (_req, res) => {
  try {
    const files = (await fs.readdir(designJsonDir))
      .filter(file => file.toLowerCase().endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));
    const designs = files.map(file => {
      const id = designIdFromFile(file);
      const family = id.split(/[0-9]/)[0] || 'P&ID';
      return {
        id,
        label: id,
        description: `${family} DEXPI JSON from data/json`,
        dexpiPath: `/api/designs/${encodeURIComponent(id)}`
      };
    });
    res.json({ ok: true, designs });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/designs/:id', async (req, res) => {
  try {
    const id = ensureSafeDesignId(req.params.id);
    const filePath = path.join(designJsonDir, `${id}.json`);
    const raw = await fs.readFile(filePath, 'utf8');
    res.type('application/json').send(raw);
  } catch (error) {
    res.status(404).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY) });
});

app.post('/api/agent/generate-decision-log', async (req, res) => {
  try {
    const result = await generateDecisionLog({ scenario: req.body?.scenario });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.listen(port, () => {
  console.log(`[codesign-api] listening on http://127.0.0.1:${port}`);
});
