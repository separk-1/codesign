# SI/US toggle and native Excel verification

Verified on DESKTOP-DCETPAI on 2026-11-05, checkout based on ce0f9fd. This report records the pre-commit verification run.

## Outcome

- One header SI/US switch changes GAC input and result displays, graph labels, tooltips, review text and newly generated calculation responses. Canonical input values, applied graphs and proposal history are not changed by toggling.
- The running local API was restarted to load the new endpoint. The existing frontend stays at http://127.0.0.1:5173; API at http://127.0.0.1:8787.
- Actual browser integration returned engine=microsoft_excel and agentMode=llm_excel_tool. This was an actual model function call and native workbook recalculation, not the fixture or direct-call fallback.
- Workbook source SHA-256: 73d9d4d9d2a7f5af6c839401cf192199359d90da91ddd6b60da51c89d9c7f95c. Source bytes remained unchanged; macros and external-link updates were disabled. No Excel automation processes remained after testing.

## Verified results

At 100 m3/h, 20 min total EBCT and 2 series vessels: required media 33.3311922671634 m3, installed operating media 33.3466549602622 m3, 16.6733274801311 m3 per vessel, and 10.5 ft diameter. The required-vs-theoretical difference follows the original workbook's rounded 7.481 gal/ft3 conversion.

Nine native Excel scenarios passed: baseline, changed EBCT, measured-month carbon life, total-series bed volumes, half average flow, per-vessel bed volumes, Freundlich, AutoSize and invalid geometry rejection. Halving average flow doubled calculated life from 4.631158225 to 9.262316450 months without changing media sizing.

Unit browser regressions passed: keyboard switching, 12 round trips without canonical drift, unchanged proposals/applied graphs, equivalent SI/US input, draft values, chat inputs, display switching during a pending calculation, stale-result cancellation, no local fallback after Excel error, desktop/mobile layout and no browser errors. Workflow browser regression passed: missing inputs, calculate, accept, invalidate, recalculate, reject and export.

## Checks

- Passed: test_gac_units, test_gac_excel_agent (mocked dispatcher and native scenarios), test_gac_workbook (22 cached outputs), test_gac_context, test_gac_review, test_gac_knowledge and test_gac.
- Passed: test_gac_units_ui, test_gac_ui and live test_gac_excel_ui.
- Passed: npm run build and git diff --check.
- npx tsc --noEmit still reports four pre-existing unused declarations: reviewEntries/equipmentCount/lineCount in DisplayPanel.tsx and loadStoredDecisionLog in designStore.ts. These are present in ce0f9fd and were left unchanged.

## Scope

Native execution requires this Windows desktop, installed Excel and the original workbook. Vercel cannot execute desktop Excel. The tool supports the documented upright pressure-vessel formula scope, not VBA cost optimization, horizontal/gravity design, full capital/O&M costs or PFAS effluent prediction. A failed LLM request is distinctly labeled direct_excel_tool while still using native Excel; an unavailable Excel engine returns an error.

Local-only screenshots (not committed): unit-toggle-native-si.png and unit-toggle-native-us.png.
