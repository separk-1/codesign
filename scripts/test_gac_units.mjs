import assert from 'node:assert/strict';
import fs from 'node:fs';
import { quantity, formatNumber, DEFAULT_UNIT_SYSTEM, displayNumber, fieldDisplay, fieldCanonical, fieldLabel, GPM_M3H, FT_M, FT3_M3, LB_KG } from '../shared/gacUnits.js';
import { buildWorkbookGraph, answerWorkbookQuestion } from '../shared/gacContext.js';
import { reviewGacInputs, workbookInputs } from '../shared/gacReview.js';
import { calculateWorkbook } from '../shared/gacWorkbookEngine.js';
const model = JSON.parse(fs.readFileSync('src/data/gacWorkbook.json'));
const near = (a,b) => assert.ok(Math.abs(a-b) <= 1e-11 * Math.max(1,Math.abs(a),Math.abs(b)), a + ' != ' + b);
assert.equal(quantity(3.2004, 'length', 'us'), '10.5 ft');
assert.equal(quantity(0.0254, 'pipe', 'si'), '25.4 mm');
assert.equal(fieldDisplay('diameterFt', '10.5', 'si'), '3.2004');
assert.equal(fieldDisplay('densityLbFt3', '30', 'si'), '480.5539');
assert.equal(fieldDisplay('flow', '100', 'us'), '440.2868');
assert.equal(DEFAULT_UNIT_SYSTEM, 'us');
assert.equal(fieldDisplay('flow', '100'), '440.2868');
for (const [value, expected] of [[1.23444, '1.2344'], [1.23445, '1.2345'], [-1.23445, '-1.2345'], [0.00004, '0'], [0.00005, '0.0001'], [-0.00004, '0'], [12, '12'], [1e-7, '0'], [1e9, '1000000000']]) assert.equal(formatNumber(value), expected);
for (const field of ['species', 'referenceId', 'series', 'parallel', 'redundantVessels']) assert.equal(fieldDisplay(field, '2.00001'), '2.00001');
for (const key of ['flow','averageFlow','diameterFt','heightFt','bedDepthFt','densityLbFt3','influentNgL']) {
  for (const value of ['0','0.000004','3.2004','10.5','12345.6789','-1','1e6']) {
    for (const system of ['si','us']) for (const flowUnit of ['m3/h','gpm']) {
      const displayFactor = 1 / Number(fieldCanonical(key, '1', system, flowUnit));
      assert.equal(fieldDisplay(key, value, system, flowUnit), formatNumber(Number(value) * displayFactor));
      // An edited value converts at full precision; display strings are never round-trip storage.
      near(Number(fieldCanonical(key, String(Number(value) * displayFactor), system, flowUnit)), Number(value));
    }
  }
  for (const value of ['', '?', '-', '.', '1e', 'unknown']) for (const system of ['si','us']) {
    assert.equal(fieldDisplay(key, value, system), value);
    assert.equal(fieldCanonical(key, value, system), value);
  }
}
const form={species:'PFOA',flow:'100',averageFlow:'100',flowUnit:'m3/h',totalEbctMinutes:'20',series:'2',parallel:'1',densityLbFt3:'30',diameterFt:'10.5',heightFt:'11',bedDepthFt:'6.8',geometryMode:'manual',redundantVessels:'',carbonLifeMode:'bv',carbonLifeValue:'10000',bvDefinition:'total_series',carbonLifeSource:'Test fixture'};
const baseline=calculateWorkbook(workbookInputs(form),model);
for(const system of ['si','us']) {
  const edited={...form};
  for(const key of ['flow','averageFlow','diameterFt','heightFt','bedDepthFt','densityLbFt3']) edited[key]=fieldCanonical(key,String(Number(form[key]) / Number(fieldCanonical(key,'1',system))),system);
  const result=calculateWorkbook(workbookInputs(edited),model);
  for(const key of ['parallel','operatingVessels','diameterFt','heightFt','bedDepthFt','mediaPerVesselM3','installedCarbonKg','carbonLifeMonths']) near(result[key],baseline[key]);
}
const context={form,proposal:{workbook:baseline,inputs:{totalEbctMinutes:20,series:2},vesselCount:baseline.operatingVessels},accepted:null,graph:{nodes:[],links:[]}};
const original=JSON.stringify(context);
for(let i=0;i<20;i++) {
  const system=i%2?'si':'us';
  const graph=buildWorkbookGraph(form,context.proposal,model,context.graph,system);
  const node=id=>graph.nodes.find(n=>n.id===id);
  assert.equal(node('diameterFt').name,fieldLabel('diameterFt','',system));
  assert.match(node('area').value,system==='si'?/m²$/:/ft²$/);
  assert.match(node('capacity').value,system==='si'?/m³\/h$/:/US gpm$/);
  assert.match(node('pipe').value,system==='si'?/mm$/:/in$/);
  const answer=answerWorkbookQuestion('What is my current diameter?',{...context,unitSystem:system},model);
  assert.match(answer.message,system==='si'?/3.2004 m/:/10.5 ft/);
}
assert.equal(JSON.stringify(context),original,'Presentation must never mutate calculation, inputs or graph');
const review=reviewGacInputs({...form,heightFt:'5'},model,null,'si');
assert.match(review.issues.find(i=>i.field==='heightFt').message,/3.2614 m/);
assert.doesNotMatch(review.issues.find(i=>i.field==='heightFt').message,/ ft/);
const suggestion=reviewGacInputs({...form,densityLbFt3:'?'},model,null,'si').suggestions[0];
assert.match(suggestion.label,/kg\/m³/);
assert.equal(suggestion.patch.densityLbFt3,String(model.assumptions.GAC_density.value));
assert.equal(quantity(FT3_M3,'volume','us'),'1 ft³');
assert.equal(quantity(LB_KG,'mass','us'),'1 lb');
near(displayNumber(FT_M ** 2,'area','us'),1);
console.log('Unit conversion tests passed: SI/US inputs, round trips, unknowns, equivalent workbook cases, graph, review and read-only toggling.');
