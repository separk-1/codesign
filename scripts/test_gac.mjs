import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Compile the pure calculator in memory; no generated source files or network calls.
const source = fs.readFileSync(new URL('../src/utils/gacDesign.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
const { calculateGac, buildGacGraph, invalidateGacGraph, gacConcept, runGacAgent } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const basis = { flow: 100, flowUnit: 'm3/h', totalEbctMinutes: 20, series: 2, parallel: 1,
  species: 'PFOA', influentNgL: 100, targetNgL: 4, ebctSource: 'Synthetic demonstration; not validated for PFAS removal' };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const result = calculateGac(basis);
close(result.totalMediaM3, 100 / 3); close(result.mediaPerVesselM3, 50 / 3);
close(result.ebctPerVesselMinutes, 10);
const parallel = calculateGac({ ...basis, parallel: 2 });
close(parallel.totalMediaM3, result.totalMediaM3); close(parallel.mediaPerVesselM3, result.mediaPerVesselM3 / 2);
close(parallel.flowPerTrainM3H, 50); assert.equal(parallel.vesselCount, 4);
// research_water_main example: 9,600 US gal / 800 gpm = 12 min.
const us = calculateGac({ ...basis, flow: 800, flowUnit: 'gpm', totalEbctMinutes: 12 });
close(us.totalMediaM3, 9600 * 0.003785411784);
close(calculateGac({ ...basis, flow: us.flowM3H, totalEbctMinutes: 12 }).totalMediaM3, us.totalMediaM3);
for (const invalid of [{ flow: 0 }, { flow: -1 }, { flow: NaN }, { flow: Infinity }, { series: 1.5 },
  { parallel: 0 }, { totalEbctMinutes: 0 }, { ebctSource: '' }, { species: '' }, { targetNgL: 100 }, { flowUnit: 'MGD' }]) {
  assert.throws(() => calculateGac({ ...basis, ...invalid }));
}
assert.equal(runGacAgent({}).kind, 'needs_input');
const agent = runGacAgent(Object.fromEntries(Object.entries(basis).map(([k, v]) => [k, String(v)])));
assert.equal(agent.kind, 'proposal'); assert.equal(agent.toolCall.name, 'calculate_gac_media_volume');
const concept = gacConcept(); assert.equal(concept.nodes.length, 3);
const graph = buildGacGraph(parallel);
assert.equal(concept.nodes.length, 3); // building proposal does not mutate concept
assert.equal(graph.nodes.filter(n => n.type === 'Equipment').length, 4);
const ids = new Set(graph.nodes.map(n => n.id));
assert.equal(ids.size, graph.nodes.length);
assert.ok(graph.links.every(l => ids.has(l.source) && ids.has(l.target)));
assert.ok(graph.links.some(l => l.source === 'gac-t1-v1' && l.target === 'gac-t1-v2' && l.type === 'process_flow'));
const stale = invalidateGacGraph(graph);
assert.equal(stale.nodes.find(n => n.id === 'gac-t1-v1').attributes.calculationState, 'stale');
assert.equal(graph.nodes.find(n => n.id === 'gac-t1-v1').attributes.calculationState, 'current');
close(buildGacGraph(calculateGac({ ...basis, flow: 200 })).nodes.find(n => n.id === 'gac-t1-v1').attributes.mediaVolumeM3, 100 / 3);
console.log('GAC checks passed: units, series/parallel sizing, input validation, agent tool call, graph mapping and invalidation.');
