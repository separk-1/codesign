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

## Calculation modes

- Online deployment: **Plan B workbook formula engine**, a bounded JavaScript port of the supported upright-pressure workbook branches. It does not execute Microsoft Excel or VBA. No original workbook is uploaded; only the existing formula snapshot is used.
- Local Windows API: **Excel tool-calling agent** by default. The AI calls the fixed `calculate_gac_excel` tool. If AI is unavailable, the direct native Excel tool is explicitly labeled. An Excel failure never silently switches to Plan B. The local listener is loopback-only.
- `/api/health` reports `gacCalculation`. Result exports preserve the actual engine, mode, tool call, version and source hash. Plan B sets `recalculated: false` and `evaluated: true`; source formula snapshots are not represented as native cell results.
- Both modes require explicit acceptance before changing the candidate graph. Neither validates PFAS removal, final hydraulics, costs or VBA optimization. Future remote Excel service design is deferred.

```sh
node scripts/test_gac_backup.mjs
# Windows with Excel and the local source workbook:
node scripts/test_gac_backup.mjs --native
npm run build
node scripts/test_gac_backup_ui.mjs
node scripts/test_gac_backup_ui.mjs --native
# Point GAC_TEST_URL at a verified deployment for live Plan B UI verification.
```

### Verification of the Plan B release

The fixed formula port matched native Microsoft Excel for 9 representative scenarios (244 numeric comparisons, maximum scaled error 2.14e-16): demonstration inputs, 30-minute EBCT, measured months, total-series BV, per-vessel BV, halved average flow, Freundlich, AutoSize, and density/spare changes. The original workbook hash stayed unchanged. The independent cached-baseline suite also covers 22 outputs and 3 AutoSize dimensions. These checks cover the supported branches, not all workbook functions, all input combinations or treatment performance.

Live browser checks passed for both engines, including calculate/export, reject, accept, SI/US toggle, input invalidation and changed-EBCT recalculation. The local run recorded a genuine `llm_excel_tool` call; online records `direct_formula_tool`. Existing non-UI regression scripts and the Vercel API entry checks passed. Production build passed. Strict TypeScript retains four pre-existing unused-declaration warnings in DisplayPanel/designStore; type checking with only noUnusedLocals disabled passes.
