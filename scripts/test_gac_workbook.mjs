import fs from 'node:fs';
import assert from 'node:assert/strict';
import { calculateWorkbook } from '../shared/gacWorkbookEngine.js';
const model = JSON.parse(fs.readFileSync('src/data/gacWorkbook.json', 'utf8'));
const baseline = calculateWorkbook(model.baseline, model);
const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const cached = citation => model.formulas[citation].cached;
// Compare against Excel's independently cached original TCE case, not a PFAS claim.
const mapping = {
  'Contactor Constraints!C27': model.baseline.totalEbctMinutes / model.baseline.series,
  'Contactor Constraints!C31': baseline.flowCapacityPerVesselGpm,
  'Contactor Constraints!C32': baseline.parallel,
  'Contactor Constraints!C33': baseline.operatingVessels,
  'Contactor Constraints!C34': baseline.redundantVessels,
  'Contactor Constraints!C35': baseline.finalVessels,
  'Contactor Constraints!C38': baseline.requiredMediaM3 / 0.028316846592,
  'Contactor Constraints!C43': baseline.surfaceAreaFt2,
  'Contactor Constraints!C44': baseline.loadingGpmFt2,
  'Contactor Constraints!C45': baseline.shellVolumePerVesselM3 / 0.028316846592,
  'Contactor Constraints!C46': baseline.shellVolumePerVesselM3 / 0.028316846592 * 7.48,
  'Contactor Constraints!C80': baseline.mediaPerVesselM3 / 0.028316846592,
  'Contactor Constraints!C81': baseline.carbonPerVesselKg / 0.45359237,
  'Contactor Constraints!C82': baseline.installedCarbonKg / 0.45359237,
  'Contactor Constraints!C83': baseline.mediaPerVesselM3 / 0.028316846592 * (1 + baseline.assumptions.bedExpansion),
  'Backwash and Regeneration!C13': baseline.backwashFlowGpm,
  'Backwash and Regeneration!C14': baseline.backwashVolumeGallons,
  'Backwash and Regeneration!C36': baseline.carbonLifeMonths,
  'Backwash and Regeneration!C43': baseline.annualCarbonKg / 0.45359237,
  'Pumps Pipe Structure!C24': baseline.influentPipeInches,
  'Pumps Pipe Structure!C27': baseline.processPipeInches,
  'Pumps Pipe Structure!C30': baseline.backwashPipeInches
};
for (const [citation, value] of Object.entries(mapping)) close(value, cached(citation));
const auto = calculateWorkbook({ ...model.baseline, geometryMode: 'auto', parallel: 2 }, model);
close(auto.diameterFt, model.formulas['AutoSize!E58'].cached);
close(auto.bedDepthFt, model.formulas['AutoSize!E61'].cached);
close(auto.heightFt, model.formulas['AutoSize!E62'].cached);
const totalSeries = calculateWorkbook({ ...model.baseline, series: 2, bvDefinition: 'total_series' }, model);
const perVessel = calculateWorkbook({ ...model.baseline, series: 2, bvDefinition: 'per_vessel' }, model);
close(totalSeries.carbonLifeMonths, perVessel.carbonLifeMonths * 2);
const halfAverage = calculateWorkbook({ ...model.baseline, averageFlowGpm: model.baseline.averageFlowGpm / 2 }, model);
close(halfAverage.carbonLifeMonths, baseline.carbonLifeMonths * 2);
const mass = calculateWorkbook({ ...model.baseline, densityLbFt3: 25 }, model);
close(mass.installedCarbonKg, baseline.installedCarbonKg * 25 / 30);
const pf = { ...model.baseline, flowGpm: 100 / (0.003785411784 * 60), averageFlowGpm: 100 / (0.003785411784 * 60), totalEbctMinutes: 20, series: 2, parallel: 1, geometryMode: 'auto', carbonLifeMode: 'none' };
const pfResult = calculateWorkbook(pf, model);
assert.equal(pfResult.carbonLifeMonths, null);
assert.ok(pfResult.actualTotalEbctMinutes >= 20);
assert.ok(pfResult.formulaTrace.every(f => typeof f.formula === 'string'));
const iso = calculateWorkbook({ ...pf, carbonLifeMode: 'freundlich', carbonLifeValue: 10, freundlichExponent: 0.5, influentMgL: 100 / 1e6, targetMgL: 4 / 1e6 }, model);
assert.ok(iso.carbonLifeMonths > 0);
assert.throws(() => calculateWorkbook({ ...pf, carbonLifeMode: 'bv', carbonLifeValue: 'no' }, model));
assert.throws(() => calculateWorkbook({ ...pf, averageFlowGpm: pf.flowGpm * 2 }, model));
assert.throws(() => calculateWorkbook({ ...pf, geometryMode: 'manual', diameterFt: 2, heightFt: 1, bedDepthFt: 3.4 }, model));
console.log(`Workbook formulas passed: ${Object.keys(mapping).length} cached Excel outputs, 3 AutoSize dimensions, BV definition, average-flow, density, isotherm and invalid-input checks.`);
