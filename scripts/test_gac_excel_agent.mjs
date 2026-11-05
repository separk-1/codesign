import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { normalizeExcelInputs, calculateExcelWorkbook } from '../server/gacExcelBridge.js';
import { runGacCalculationAgent } from '../server/gacToolAgent.js';
import { answerGacAssistant } from '../server/gacAssistant.js';

const base = { flowGpm: 100 / (0.003785411784 * 60), averageFlowGpm: 100 / (0.003785411784 * 60), totalEbctMinutes: 20, series: 2, parallel: 1, geometryMode: 'manual', diameterFt: 10.5, heightFt: 11, bedDepthFt: 6.8, densityLbFt3: 30, redundantVessels: '', carbonLifeMode: 'none' };
const close = (a,b) => assert.ok(Math.abs(a-b) <= Math.max(1,Math.abs(b))*1e-10, a + ' != ' + b);
for (const invalid of [{ ...base, flowGpm: '=EXEC()' }, { ...base, command: 'anything' }, { ...base, workbookPath: 'other.xlsx' }, { ...base, averageFlowGpm: base.flowGpm + 1 }, { ...base, series: 2.2 }, { ...base, carbonLifeMode: 'bv', carbonLifeValue: 100 }]) assert.throws(() => normalizeExcelInputs(invalid));
let executions = 0;
const fakeExecute = async inputs => { executions++; return { inputs, execution: { engine: 'microsoft_excel', recalculated: true, runId: 'fixture', completedAt: new Date().toISOString() } }; };
const client = { chat: { completions: { create: async request => {
  assert.equal(request.tools[0].function.name, 'calculate_gac_excel');
  assert.equal(request.tool_choice.function.name, 'calculate_gac_excel');
  return { choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call_test', type: 'function', function: { name: 'calculate_gac_excel', arguments: '{}' } }] } }] };
} } } };
const called = await runGacCalculationAgent(base, { client, execute: fakeExecute });
assert.equal(called.execution.agentMode, 'llm_excel_tool'); assert.equal(called.toolCalls[0].id, 'call_test'); assert.equal(executions, 1);
const direct = await runGacCalculationAgent(base, { client: null, execute: fakeExecute });
assert.equal(direct.execution.agentMode, 'direct_excel_tool'); assert.equal(direct.toolCalls[0].invokedBy, 'user_calculate_command');
const unavailable = { chat: { completions: { create: async () => { throw Object.assign(new Error('offline'), { code: 'offline' }); } } } };
const fallback = await runGacCalculationAgent(base, { client: unavailable, execute: fakeExecute });
assert.equal(fallback.execution.agentMode, 'direct_excel_tool'); assert.equal(fallback.execution.apiError.code, 'offline');
const form = { flow: '100', averageFlow: '100', flowUnit: 'm3/h', totalEbctMinutes: '20', series: '2', parallel: '1', species: 'PFOA', ebctSource: 'Test basis', geometryMode: 'manual', diameterFt: '10.5', heightFt: '11', bedDepthFt: '6.8', densityLbFt3: '30', redundantVessels: '', carbonLifeMode: 'none' };
let turns = 0;
const questionClient = { chat: { completions: { create: async request => {
  turns++;
  if (turns === 1) return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_read', type: 'function', function: { name: 'review_gac_inputs', arguments: '{}' } }] } }] };
  assert.equal(request.messages.at(-1).role, 'tool');
  assert.equal(JSON.parse(request.messages.at(-1).content).displayUnitSystem, 'si');
  return { choices: [{ message: { role: 'assistant', content: 'Review your EBCT evidence before calculating.' } }] };
} } } };
const answer = await answerGacAssistant('Review my current inputs.', { form, graph: { nodes: [], links: [] }, unitSystem: 'si' }, { client: questionClient });
assert.equal(answer.mode, 'llm_workbook_tools'); assert.equal(answer.toolCalls[0].name, 'review_gac_inputs'); assert.equal(turns, 2);
console.log('PASS: input boundary, genuine tool-call dispatcher, explicit direct/native fallback, read-only assistant tool round-trip.');

if (process.argv.includes('--native')) {
  const source = new URL('../docs/granular-activated-carbon-gac-.xlsm.xlsm', import.meta.url);
  const hash = async () => crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex');
  const before = await hash();
  const standard = await calculateExcelWorkbook(base);
  assert.equal(standard.execution.engine, 'microsoft_excel'); assert.equal(standard.execution.macrosExecuted, false);
  close(standard.operatingMediaM3, 33.3466549602622); assert.equal(standard.operatingVessels, 2); assert.equal(standard.carbonLifeMonths, null);
  const changed = await calculateExcelWorkbook({ ...base, totalEbctMinutes: 30 });
  close(changed.requiredMediaM3 / standard.requiredMediaM3, 1.5); assert.equal(changed.operatingVessels, 4);
  assert.notEqual(changed.execution.runId, standard.execution.runId);
  const months = await calculateExcelWorkbook({ ...base, carbonLifeMode: 'months', carbonLifeValue: 12, carbonLifeSource: 'Test measured life' });
  close(months.carbonLifeMonths, 12);
  const bv = await calculateExcelWorkbook({ ...base, carbonLifeMode: 'bv', carbonLifeValue: 10000, bvDefinition: 'total_series', carbonLifeSource: 'Test breakthrough evidence' });
  const halfFlow = await calculateExcelWorkbook({ ...base, averageFlowGpm: base.averageFlowGpm/2, carbonLifeMode: 'bv', carbonLifeValue: 10000, bvDefinition: 'total_series', carbonLifeSource: 'Test breakthrough evidence' });
  close(halfFlow.carbonLifeMonths/bv.carbonLifeMonths, 2); close(halfFlow.operatingMediaM3, bv.operatingMediaM3);
  const perVessel = await calculateExcelWorkbook({ ...base, carbonLifeMode: 'bv', carbonLifeValue: 10000, bvDefinition: 'per_vessel', carbonLifeSource: 'Test single-bed evidence' });
  close(bv.carbonLifeMonths/perVessel.carbonLifeMonths, 2);
  const freundlich = await calculateExcelWorkbook({ ...base, carbonLifeMode: 'freundlich', carbonLifeValue: 50, freundlichExponent: 0.5, influentMgL: 0.1, targetMgL: 0.01, carbonLifeSource: 'Test isotherm evidence' });
  assert.ok(freundlich.carbonLifeMonths > 0);
  const auto = await calculateExcelWorkbook({ ...base, geometryMode: 'auto' });
  assert.ok(auto.formulaTrace.some(cell => cell.citation === 'AutoSize!E58'));
  assert.equal(auto.geometry, 'upright');
  await assert.rejects(() => calculateExcelWorkbook({ ...base, diameterFt: 1, heightFt: 2, bedDepthFt: 20 }), /Workbook input check/);
  assert.equal(await hash(), before); assert.equal(standard.source.sha256, before);
  console.log(JSON.stringify({ status: 'PASS', nativeRuns: 9, sourceSha256: before, sourcePreserved: true, excelVersion: standard.execution.excelVersion, baselineMediaM3: standard.operatingMediaM3, changedEbctMediaM3: changed.operatingMediaM3, bvLifeMonths: bv.carbonLifeMonths, halfAverageFlowLifeMonths: halfFlow.carbonLifeMonths, autoDimensionsFt: [auto.diameterFt, auto.heightFt, auto.bedDepthFt] }, null, 2));
}
