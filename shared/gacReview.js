import { calculateWorkbook } from './gacWorkbookEngine.js';
import { searchKnowledge } from './gacKnowledgeEngine.js';

export const unknownValue = value => !String(value ?? '').trim() || String(value).trim() === '?';
export function workbookInputs(form) {
  const conversion = form.flowUnit === 'gpm' ? 1 : 1 / (0.003785411784 * 60);
  return { ...form, flowGpm: Number(form.flow) * conversion, averageFlowGpm: Number(form.averageFlow) * conversion,
    totalEbctMinutes: Number(form.totalEbctMinutes), series: Number(form.series), parallel: Number(form.parallel || 1),
    redundantVessels: unknownValue(form.redundantVessels) ? '' : form.redundantVessels,
    influentMgL: Number(form.influentNgL) / 1e6, targetMgL: Number(form.targetNgL) / 1e6 };
}
export function reviewGacInputs(form, model, corpus) {
  const issues = [], suggestions = [], questions = [];
  const add = (field, message, source = 'Input consistency') => issues.push({ field, message, source, severity: 'blocking' });
  const required = ['species', 'flow', 'averageFlow', 'totalEbctMinutes', 'series', 'densityLbFt3'];
  if (form.geometryMode !== 'auto') required.push('diameterFt', 'heightFt', 'bedDepthFt');
  if (form.carbonLifeMode && form.carbonLifeMode !== 'none') required.push('carbonLifeValue', 'carbonLifeSource');
  if (form.carbonLifeMode === 'freundlich') required.push('freundlichExponent', 'influentNgL', 'targetNgL');
  const missing = required.filter(k => unknownValue(form[k]));
  const labels = { species: 'PFAS species', flow: 'Design flow', averageFlow: 'Average flow', totalEbctMinutes: 'Total EBCT', series: 'Vessels in series', densityLbFt3: 'GAC bulk density', diameterFt: 'Vessel diameter', heightFt: 'Vessel height', bedDepthFt: 'Bed depth', carbonLifeValue: 'Carbon-life value', carbonLifeSource: 'Carbon-life evidence', freundlichExponent: 'Freundlich exponent', influentNgL: 'Influent concentration', targetNgL: 'Breakthrough concentration' };
  for (const field of missing) questions.push({ field, text: `${labels[field]} is unknown. ${field === 'flow' ? 'What maximum treatment flow must the facility handle?' : field === 'averageFlow' ? 'What is the average operating flow? It cannot be inferred from maximum flow.' : field === 'series' ? 'Which operating arrangement is required? Confirm series count before sizing.' : field === 'carbonLifeSource' ? 'Which pilot test, operating record or study supports the carbon-life input?' : `Provide its value or ask for a candidate for ${labels[field]}.`}` });
  for (const field of required.filter(k => !missing.includes(k) && !['species', 'carbonLifeSource'].includes(k))) {
    if (!Number.isFinite(Number(form[field])) || Number(form[field]) <= 0) add(field, `${labels[field]} must be a positive number; zero or a negative value cannot represent this physical quantity.`);
  }
  if (!unknownValue(form.series) && Number.isFinite(Number(form.series)) && !Number.isInteger(Number(form.series))) add('series', 'Vessel count must be a whole number because vessels are discrete pieces of equipment.');
  if (!unknownValue(form.redundantVessels) && (!Number.isSafeInteger(Number(form.redundantVessels)) || Number(form.redundantVessels) < 0 || Number(form.redundantVessels) > 20)) add('redundantVessels', 'Spare vessel count must be a whole number from 0 to 20 within the supported calculation range.');
  if (Number(form.averageFlow) > Number(form.flow)) add('averageFlow', `Average flow (${form.averageFlow}) exceeds design flow (${form.flow}). The design must accommodate the operating flow; confirm which value is incorrect.`);
  if (form.carbonLifeMode === 'freundlich' && !unknownValue(form.targetNgL) && !unknownValue(form.influentNgL) && Number(form.targetNgL) >= Number(form.influentNgL)) add('targetNgL', 'Breakthrough concentration must be below influent concentration; otherwise this removal-capacity calculation has no valid positive concentration difference.');
  const expansion = model.assumptions.bed_expansion.value, freeboard = model.assumptions.free_board.value;
  if (form.geometryMode !== 'auto' && Number(form.heightFt) > 0 && Number(form.bedDepthFt) > 0 && Number(form.heightFt) < Number(form.bedDepthFt) * (1 + expansion) + freeboard) add('heightFt', `The expanded GAC bed needs at least ${(Number(form.bedDepthFt) * (1 + expansion) + freeboard).toFixed(2)} ft of straight height (${expansion * 100}% expansion plus ${freeboard} ft freeboard). The entered height is too small.`, 'Workbook expanded-bed and freeboard constraints');
  if (missing.includes('densityLbFt3')) suggestions.push({ id: 'density', label: `Use workbook density assumption: ${model.assumptions.GAC_density.value} lb/ft³`, patch: { densityLbFt3: String(model.assumptions.GAC_density.value) }, reason: 'A documented workbook assumption, not a measurement of your selected carbon. Confirm against the supplier specification.', source: model.assumptions.GAC_density.citation, sourceHash: model.source.sha256, kind: 'assumption' });
  const geometryMissing = ['diameterFt', 'heightFt', 'bedDepthFt'].some(k => unknownValue(form[k]));
  if (geometryMissing && !['flow', 'averageFlow', 'totalEbctMinutes', 'series', 'densityLbFt3'].some(k => unknownValue(form[k])) && !issues.length) {
    try {
      const sizing = calculateWorkbook({ ...workbookInputs(form), geometryMode: 'auto', carbonLifeMode: 'none' }, model);
      suggestions.push({ id: 'geometry', label: `Use calculated dimensions: ${sizing.diameterFt} ft diameter, ${sizing.heightFt} ft height, ${sizing.bedDepthFt} ft bed`, patch: { diameterFt: String(sizing.diameterFt), heightFt: String(sizing.heightFt), bedDepthFt: String(sizing.bedDepthFt), geometryMode: 'manual' }, reason: 'The workbook AutoSize formulas satisfy the supported geometry, expansion and loading constraints for the requested train count. PFAS removal performance is not determined by this sizing.', source: sizing.formulaTrace.filter(f => f.citation.startsWith('AutoSize!')).map(f => f.citation).join(', '), sourceHash: model.source.sha256, kind: 'calculated' });
    } catch (error) { questions.push({ field: 'geometry', text: `Automatic sizing could not supply dimensions: ${error.message}` }); }
  }
  if ((missing.includes('totalEbctMinutes') || missing.includes('series')) && corpus && !unknownValue(form.species)) {
    const conditions = ['waterType', 'tocMgL', 'media', 'influentNgL'].filter(k => unknownValue(form[k]));
    const contextQuestions = { waterType: 'What is the source water type?', tocMgL: 'What is influent TOC (mg/L)?', media: 'Which GAC medium is intended?', influentNgL: 'What is the influent PFAS concentration (ng/L)?' };
    questions.unshift(...conditions.map(field => ({ field, text: contextQuestions[field] })));
    for (const record of searchKnowledge(corpus, form).filter(r => r.totalEbctMinutes > 0 && Number.isInteger(r.series) && r.series > 0).slice(0, 2)) {
      const patch = {};
      if (missing.includes('totalEbctMinutes')) patch.totalEbctMinutes = String(record.totalEbctMinutes);
      if (missing.includes('series')) patch.series = String(record.series);
      patch.ebctSource = `Study scenario: ${record.site}; ${record.contextCitation}; ${record.citation}; sha256:${corpus.source.sha256}`;
      patch.referenceId = record.id;
      suggestions.push({ id: record.id, label: `Study scenario: Site ${record.site}, ${record.totalEbctMinutes} min EBCT, ${record.series} in series`, patch, reason: `Study influent: ${record.influentNgL ?? 'not reported'} ng/L; TOC: ${record.tocMgL ?? 'not reported'} mg/L; water: ${record.waterType}; carbon: ${record.media}. Project conditions may differ. This is a comparison scenario, not a validated treatment recommendation.`, source: record.contextCitation, sourceHash: corpus.source.sha256, kind: 'study_scenario' });
    }
  }
  if (!missing.length && !issues.length) {
    try { calculateWorkbook(workbookInputs(form), model); }
    catch (error) { add('calculation', `${error.message} These workbook constraints must be satisfied before a sizing proposal can be created.`, 'Supported Excel pressure-vessel constraints'); }
  }
  const warnings = ['Sizing checks do not establish PFAS removal performance.'];
  if (/Demonstration assumption/i.test(form.ebctSource || '')) warnings.push('EBCT is still an example assumption; confirm project evidence before using it as a design basis.');
  return { issues, missing, questions, suggestions, warnings, canCalculate: !missing.length && !issues.length };
}
