import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { calculateWorkbook } from '../shared/gacWorkbookEngine.js';
import { normalizeExcelInputs, ExcelToolError } from './gacExcelBridge.js';
import { runGacCalculationAgent } from './gacToolAgent.js';

const model = JSON.parse(await fs.readFile(new URL('../src/data/gacWorkbook.json', import.meta.url), 'utf8'));
export function calculationCapability({ platform = process.platform, env = process.env } = {}) {
  // Deployment is Plan B; a local Windows instance always keeps the native tool default.
  const backup = env.VERCEL === '1' || platform !== 'win32';
  return backup
    ? { mode: 'online_plan_b', engine: 'javascript_formula_port', label: 'Online Plan B: workbook formulas', nativeExcel: false, description: 'JavaScript port of supported workbook formulas. Microsoft Excel is not running.' }
    : { mode: 'local_excel_agent', engine: 'microsoft_excel', label: 'Local Excel tool-calling agent', nativeExcel: true, description: 'Microsoft Excel recalculates a disposable local workbook copy. AI calls the bounded tool; if AI is unavailable, the direct Excel tool is labeled explicitly.' };
}
export function calculationOriginAllowed(req, capability) {
  const origin = req.headers.origin;
  if (capability.nativeExcel) {
    // Reject remote Host headers as well as browser origins, including DNS rebinding.
    if (!['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) return false;
    return !origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
  }
  if (!origin) return true; // CLI/API clients may call the bounded public formula calculator.
  try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && url.host === req.get('host'); }
  catch { return false; }
}
export async function calculateFormulaWorkbook(rawInputs) {
  const inputs = normalizeExcelInputs(rawInputs);
  const startedAt = new Date().toISOString();
  let result;
  try { result = calculateWorkbook(inputs, model); }
  catch (error) { throw new ExcelToolError(error.message, 'workbook_validation', 422); }
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new ExcelToolError('Non-finite formula result: ' + key, 'invalid_tool_result');
  }
  const runId = crypto.randomUUID(), completedAt = new Date().toISOString();
  return { ...result, version: 'epa-wbs-gac-online-plan-b/1',
    // Snapshot cached values are the original baseline, never this run's cell results.
    formulaTrace: result.formulaTrace.map(({ cached, ...entry }) => ({ ...entry, baselineCached: cached, evidenceKind: 'source_formula_snapshot' })),
    assumptions: { ...result.assumptions, scope: result.assumptions.scope + ' Online Plan B formula port, not native Microsoft Excel. No macros, external links, full-workbook or cost optimization, or PFAS removal prediction.' },
    execution: { engine: 'javascript_formula_port', mode: 'online_plan_b', agentMode: 'direct_formula_tool', evaluated: true, recalculated: false, nativeExcel: false, macrosExecuted: false, externalLinksUpdated: false, sourcePreserved: true, runId, completedAt,
      validation: { cachedBaselineOutputs: 22, cachedAutoSizeDimensions: 3, scope: 'Supported upright pressure-vessel branches only; not full workbook equivalence.' } },
    toolCalls: [{ id: 'formula-' + runId, name: 'calculate_gac_formula_backup', arguments: {}, resolvedInputs: inputs, invokedBy: 'user_calculate_command', startedAt, completedAt, status: 'succeeded', engine: 'javascript_formula_port', runId }] };
}
export async function runGacCalculation(inputs, { capability = calculationCapability(), nativeAgent = runGacCalculationAgent } = {}) {
  // Never silently switch away from native Excel after a local failure.
  return capability.nativeExcel ? nativeAgent(inputs) : calculateFormulaWorkbook(inputs);
}
