# Vercel deployment

The Vite frontend builds to `dist`. `api/index.js` exports the Express app as a Vercel Function. `vercel.json` sends `/api/*` requests to that function and includes the workbook snapshots and DEXPI JSON files used at runtime.

## Project settings

- Root directory: repository root (leave blank).
- Framework: Vite.
- Build command: `npm run build`.
- Output directory: `dist`.
- Install command: default, or `npm ci`.
- Node version: 24.x, matching `package.json`.

Set `OPENAI_API_KEY` and `OPENAI_MODEL=gpt-5-mini` in the Vercel project's Environment Variables for the environments you deploy. Local `.env` files are excluded from uploads. Never use a `VITE_` variable for the API key.

## Verification

```sh
npm ci --dry-run --ignore-scripts
npm run build
node scripts/test_vercel_api.mjs
```

After deployment, check `/api/health`, `/api/designs`, a selected P&ID example, and a short assistant question. `hasOpenAIKey` only indicates that the server has a key; a successful assistant answer is required to verify OpenAI access.

Build failures and function runtime failures have different logs. Open the failing deployment's Build Logs for installation/build errors; use Runtime Logs for API invocation failures.
