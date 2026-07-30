import 'dotenv/config';
import express from 'express';
import { generateDecisionLog } from './decisionAgent.js';

const app = express();
const port = Number(process.env.API_PORT || 8787);

app.use(express.json({ limit: '1mb' }));

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
