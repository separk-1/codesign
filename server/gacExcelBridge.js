import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = path.join(root, 'docs', 'granular-activated-carbon-gac-.xlsm.xlsm');
const scriptPath = path.join(root, 'server', 'gacExcelBridge.ps1');
const FT3_M3 = 0.028316846592, LB_KG = 0.45359237;
let running = false;
export class ExcelToolError extends Error {
  constructor(message, code = 'excel_execution_failed', status = 503) { super(message); this.code = code; this.status = status; }
}
export function normalizeExcelInputs(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ExcelToolError('Workbook inputs are required.', 'invalid_inputs', 400);
  const allowed = ['flowGpm','averageFlowGpm','totalEbctMinutes','series','parallel','geometryMode','diameterFt','heightFt','bedDepthFt','densityLbFt3','redundantVessels','carbonLifeMode','carbonLifeValue','bvDefinition','freundlichExponent','influentMgL','targetMgL','carbonLifeSource'];
  if (Object.keys(input).some(k => !allowed.includes(k))) throw new ExcelToolError('Unsupported workbook input. Cell addresses, formulas, paths and commands are not accepted.', 'invalid_inputs', 400);
  const out = {};
  const number = (key, max, integer = false) => {
    const raw = input[key], n = Number(raw);
    if (!['number', 'string'].includes(typeof raw) || raw === '' || raw == null || typeof raw === 'boolean' || !Number.isFinite(n) || n <= 0 || n > max || (integer && !Number.isInteger(n))) throw new ExcelToolError('Invalid ' + key + '.', 'invalid_inputs', 400);
    out[key] = n;
  };
  number('flowGpm', 1e7); number('averageFlowGpm', 1e7); number('totalEbctMinutes', 1440); number('series', 20, true); number('parallel', 20, true); number('densityLbFt3', 200);
  if (out.averageFlowGpm > out.flowGpm) throw new ExcelToolError('Average flow cannot exceed design flow.', 'invalid_inputs', 400);
  out.geometryMode = input.geometryMode;
  if (!['manual','auto'].includes(out.geometryMode)) throw new ExcelToolError('Choose manual or auto geometry.', 'invalid_inputs', 400);
  if (out.geometryMode === 'manual') { number('diameterFt', 1000); number('heightFt', 1000); number('bedDepthFt', 1000); }
  out.redundantVessels = input.redundantVessels === '' || input.redundantVessels == null ? null : Number(input.redundantVessels);
  if ((input.redundantVessels != null && !['number', 'string'].includes(typeof input.redundantVessels)) || (out.redundantVessels !== null && (!Number.isInteger(out.redundantVessels) || out.redundantVessels < 0 || out.redundantVessels > 20))) throw new ExcelToolError('Redundant vessels must be a whole number from 0 to 20.', 'invalid_inputs', 400);
  out.carbonLifeMode = input.carbonLifeMode || 'none';
  if (!['none','months','bv','freundlich'].includes(out.carbonLifeMode)) throw new ExcelToolError('Unsupported carbon-life method.', 'invalid_inputs', 400);
  if (out.carbonLifeMode !== 'none') {
    number('carbonLifeValue', 1e12);
    if (typeof input.carbonLifeSource !== 'string' || !input.carbonLifeSource.trim() || input.carbonLifeSource.length > 6000) throw new ExcelToolError('Provide the carbon-life source.', 'invalid_inputs', 400);
    out.carbonLifeSource = input.carbonLifeSource.trim();
    if (out.carbonLifeMode === 'bv') {
      if (!['per_vessel','total_series'].includes(input.bvDefinition)) throw new ExcelToolError('Choose the bed-volume definition.', 'invalid_inputs', 400);
      out.bvDefinition = input.bvDefinition;
    }
    if (out.carbonLifeMode === 'freundlich') {
      number('freundlichExponent', 10); number('influentMgL', 1e6); number('targetMgL', 1e6);
      if (out.targetMgL >= out.influentMgL) throw new ExcelToolError('Breakthrough concentration must be below influent concentration.', 'invalid_inputs', 400);
    }
  }
  return out;
}
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function runExcel(workbookPath, inputs) {
  return new Promise((resolve, reject) => {
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(powershell, ['-NoProfile','-NonInteractive','-STA','-File',scriptPath,'-WorkbookPath',workbookPath], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    let stdout = '', stderr = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new ExcelToolError('Excel did not finish within 90 seconds. No calculation was returned; check the local Excel process before retrying.', 'excel_timeout')); }, 90000);
    child.stdout.on('data', b => { stdout += b; if (stdout.length > 2e6) { child.kill(); finish(new ExcelToolError('Excel output exceeded the safety limit.')); } });
    child.stderr.on('data', b => { stderr += b; });
    child.on('error', () => finish(new ExcelToolError('The local Windows Excel bridge could not start.', 'excel_unavailable')));
    child.on('close', code => {
      if (settled) return;
      const line = stdout.split(/\r?\n/).find(l => l.startsWith('CODESIGN_RESULT:'));
      if (!line) return finish(new ExcelToolError('Excel returned no verified result. ' + stderr.slice(-1000)));
      try {
        const value = JSON.parse(line.slice('CODESIGN_RESULT:'.length));
        if (code !== 0 || !value.ok) return finish(new ExcelToolError(value.error || 'Excel recalculation failed.', value.code || 'excel_execution_failed', value.code === 'workbook_validation' ? 422 : 503));
        finish(null, value);
      } catch { finish(new ExcelToolError('Excel returned an invalid result.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(inputs));
  });
}
export async function calculateExcelWorkbook(rawInputs) {
  const inputs = normalizeExcelInputs(rawInputs);
  if (process.platform !== 'win32') throw new ExcelToolError('Native workbook calculation requires the local Windows API with Microsoft Excel installed. No JavaScript fallback was run.', 'excel_unavailable');
  if (running) throw new ExcelToolError('Excel is already calculating. Wait for the current calculation.', 'excel_busy', 409);
  running = true;
  let directory;
  try {
    const bytes = await fs.readFile(sourcePath);
    const hash = sha(bytes);
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codesign-gac-'));
    const workbookPath = path.join(directory, 'gac-working-copy.xlsm');
    await fs.writeFile(workbookPath, bytes, { flag: 'wx' });
    const native = await runExcel(workbookPath, inputs);
    if (sha(await fs.readFile(sourcePath)) !== hash) throw new ExcelToolError('The source workbook changed during calculation. Result discarded.', 'source_changed', 409);
    const v = citation => native.cells[citation].value;
    const c = ref => v('Contactor Constraints!' + ref);
    const diameterFt = v('INPUT!G60'), heightFt = v('INPUT!G59'), bedDepthFt = v('INPUT!G57');
    const parallel = c('C32'), series = c('C18'), mediaFt3 = c('C80');
    if (parallel > 20 || c('C33') > 400 || c('C34') > 20) throw new ExcelToolError('Calculated vessel count exceeds the supported graph limits.', 'workbook_validation', 422);
    const source = { file: path.basename(sourcePath), sha256: hash };
    return {
      version: 'epa-wbs-gac-native-excel/1', source, inputs, geometry: 'upright',
      diameterFt, heightFt, bedDepthFt, diameterM: diameterFt * 0.3048, heightM: heightFt * 0.3048, bedDepthM: bedDepthFt * 0.3048,
      surfaceAreaFt2: c('C43'), loadingGpmFt2: c('C44'), requiredMediaM3: c('C38') * FT3_M3,
      mediaPerVesselM3: mediaFt3 * FT3_M3, operatingMediaM3: mediaFt3 * c('C33') * FT3_M3,
      parallel, series, operatingVessels: c('C33'), redundantVessels: c('C34'), finalVessels: c('C35'),
      carbonPerVesselKg: c('C81') * LB_KG, installedCarbonKg: c('C82') * LB_KG,
      flowCapacityPerVesselGpm: c('C31'), actualTotalEbctMinutes: mediaFt3 * parallel * series * 7.48 / c('C8'),
      shellVolumePerVesselM3: c('C45') * FT3_M3, influentPipeInches: v('Pumps Pipe Structure!C24'),
      processPipeInches: v('Pumps Pipe Structure!C27'), backwashPipeInches: v('Pumps Pipe Structure!C30'),
      backwashFlowGpm: v('Backwash and Regeneration!C13'), backwashVolumeGallons: v('Backwash and Regeneration!C14'),
      carbonLifeMonths: inputs.carbonLifeMode === 'none' ? null : v('Backwash and Regeneration!C36'),
      annualCarbonKg: inputs.carbonLifeMode === 'none' ? null : v('Backwash and Regeneration!C43') * LB_KG,
      assumptions: { densityLbFt3: inputs.densityLbFt3, bedExpansion: v('Critical Design Assumptions!C11'), freeboardFt: v('Critical Design Assumptions!C20'), scope: 'Native Excel formula recalculation, upright pressure vessels, no bypass. Macros and external-link updates disabled. No VBA cost optimization or PFAS removal prediction.' },
      formulaTrace: Object.entries(native.cells).filter(([, cell]) => cell.formula?.startsWith('=')).map(([citation, cell]) => ({ citation, formula: cell.formula, value: cell.value })),
      lookupTrace: ['Lookup Tables: workbook-native VLOOKUP calculations'],
      execution: { engine: 'microsoft_excel', recalculated: true, macrosExecuted: false, externalLinksUpdated: false, sourcePreserved: true, excelVersion: native.excelVersion, runId: crypto.randomUUID(), completedAt: new Date().toISOString(), nativeCells: native.cells, inputWrites: native.inputWrites }
    };
  } finally {
    if (directory) await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    running = false;
  }
}
