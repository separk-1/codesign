# Native Excel tool calls

CoDesign's GAC Calculate proposal action calls POST /api/gac/calculate. When an OpenAI key is configured, the model emits a real calculate_gac_excel function call. The dispatcher binds the current validated inputs and invokes Microsoft Excel. The model cannot supply paths, cell addresses, formulas, commands or arbitrary input overrides.

Without a key, or when the model request fails, the explicit Calculate command calls the same native Excel tool directly. The result reports execution.agentMode as direct_excel_tool, not as an LLM call. There is no JavaScript calculation fallback. If native Excel is unavailable, the API returns an error and no new proposal is applied.

## Local requirements

- Windows desktop with Microsoft Excel installed.
- Start the API with npm run api and the frontend with npm run dev, or npm run dev:full.
- The original workbook must be present at docs/granular-activated-carbon-gac-.xlsm.xlsm. It is a local runtime prerequisite and is not included in this source-code commit.
- The deployed Vercel server cannot run Windows Excel. Use the local desktop API for native calculations.

The bridge opens a unique temporary copy in its own Excel automation instance, disables macros, events and external-link updates, writes only fixed input cells, calls CalculateFullRebuild, reads native result cells, closes without saving and removes the copy. It verifies the original file's SHA-256 before returning results. Source bytes are never modified.

Calls are serialized with a busy response, bounded by a server timeout, and the UI cancels or ignores results after input changes. A source hash, native cell values/formulas, input-write trace, Excel version, run ID and agent/tool provenance accompany each successful result.

Supported scope remains upright pressure vessels without bypass. Manual dimensions and native AutoSize formulas are supported. AutoSize's VBA cost optimization is not run. Carbon-life methods are measured months, breakthrough bed volumes and Freundlich. Missing carbon-life data remain null; saved TCE life inputs are cleared rather than reused. No PFAS effluent prediction or full cost result is claimed.

The assistant's conversational endpoint uses real inspect_gac_workbook and review_gac_inputs function-call rounds. The inspection tool reads the extracted formula snapshot and is labeled formula_snapshot, not Excel execution. Questions do not change inputs or apply graphs. Calculate produces a proposal; only explicit acceptance applies it.

## Units

The header SI/US switch changes GAC inputs, results, graphs and review text without changing canonical stored values or applied sizing. SI is the default.

- SI: m3/h, m, m3, kg, kg/m3 and mm.
- US: gpm, ft, ft3, lb, lb/ft3 and inches.
- Concentrations (ng/L), minutes, months, bed volumes and the Freundlich basis stay fixed.

Exports include displayUnitSystem and storageUnits. Workbook evidence retains its original units and formula text. Required media volume uses the workbook's rounded 7.481 conversion. The exact Q x EBCT quantity is retained separately as theoreticalMediaM3.

## Verification

- node scripts/test_gac_excel_agent.mjs: dispatcher, validation, mode provenance and assistant tool round-trip tests with explicit mocks.
- node scripts/test_gac_excel_agent.mjs --native: real Excel runs for manual sizing, changed EBCT, average-flow effects, life methods, AutoSize, rejection of invalid geometry and original-workbook hash preservation.
- node scripts/test_gac_units.mjs: numerical unit conversions and source-basis checks.
- node scripts/test_gac_units_ui.mjs: UI unit behavior with explicitly identified API fixtures.
- node scripts/test_gac_ui.mjs: UI workflow regression using explicit calculation fixtures.
- npm run build

The existing JavaScript workbook engine is retained for regression/fixture comparisons and deterministic input review. It is not the production proposal calculation engine.
