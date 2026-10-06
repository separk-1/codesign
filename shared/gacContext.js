export const workbookFields = {
  species: { label: 'PFAS species', citation: 'INPUT!E4 (contaminant selection)', definition: 'The PFAS compound selected for the design. It identifies compound-specific PFAS Reference records; the name alone does not predict removal performance.', aliases: ['pfas species', 'species'] },
  flow: { label: 'Design flow', citation: 'INPUT!G29', definition: 'The maximum design treatment flow. Flow and EBCT determine required media volume. Flow divided by vessel capacity determines parallel train count.', aliases: ['design flow', 'flow'] },
  averageFlow: { label: 'Average flow', citation: 'INPUT!G30', definition: 'The average operating flow. It must not exceed design flow. The carbon-life formula uses it to convert treated water volume into operating time.', aliases: ['average flow'] },
  totalEbctMinutes: { label: 'Total EBCT (min)', citation: 'INPUT!G46', definition: 'Nominal contact time in minutes, defined as total media volume in a series train divided by flow. Per-vessel design EBCT equals total EBCT divided by series count. This workbook does not derive PFAS EBCT from target concentration.', aliases: ['ebct'] },
  series: { label: 'Vessels in series', citation: 'INPUT!G49', definition: 'The number of vessels water passes through sequentially in one train. Per-vessel EBCT = total EBCT / series count; operating vessels = parallel trains × series count.', aliases: ['series'] },
  diameterFt: { label: 'Diameter (ft)', citation: 'INPUT!G60', definition: 'Upright pressure-vessel diameter in feet. It determines cross-sectional area, media volume, vessel flow capacity and pipe sizing.', aliases: ['diameter'] },
  heightFt: { label: 'Straight height (ft)', citation: 'INPUT!G59', definition: 'The straight cylindrical height in feet. The workbook checks space for expanded media and freeboard. This is different from media bed depth.', aliases: ['height'] },
  bedDepthFt: { label: 'Bed depth (ft)', citation: 'INPUT!G57', definition: 'The media bed depth in feet. Media volume = vessel cross-sectional area × bed depth. Minimum, maximum and expansion constraints are checked.', aliases: ['bed depth'] },
  redundantVessels: { label: 'Redundant vessels', citation: 'INPUT!G93', definition: 'The number of spare vessels. Leave blank to use workbook redundancy rules. Spare media is included in installed carbon mass.', aliases: ['redundant'] },
  densityLbFt3: { label: 'Bulk density (lb/ft³)', citation: 'Critical Design Assumptions!C70', definition: 'GAC bulk density in lb/ft³. Carbon mass = media volume × bulk density. This assumption does not specify PFAS adsorption performance.', aliases: ['density', 'mass'] },
  carbonLifeMode: { label: 'Carbon life input type', citation: 'INPUT!G36', definition: 'The carbon-life input method: measured months, bed volumes to breakthrough, or a Freundlich isotherm with tested Kf and 1/n. Not specified calculates sizing without carbon life.', aliases: ['carbon life', 'lifetime'] },
  carbonLifeValue: { label: 'Carbon life / Kf', citation: 'INPUT!G37', definition: 'Depending on the method, enter measured months, breakthrough BV, or Freundlich Kf. These values have different meanings and units. Censored or missing records cannot be used as numeric life values.', aliases: ['kf', 'bed volume', 'bv'] },
  freundlichExponent: { label: 'Freundlich 1/n', citation: 'INPUT!G38', definition: 'The Freundlich exponent 1/n. Together with Kf, influent and breakthrough concentrations, it estimates carbon life. Constants must match the selected PFAS, carbon and water conditions.', aliases: ['freundlich', '1/n'] },
  influentNgL: { label: 'Influent concentration', citation: 'INPUT!G39', definition: 'Influent concentration C0 for the Freundlich life formula. Excel uses mg/L; 1 mg/L = 1,000,000 ng/L. Concentration is not used by the measured-months or BV branches.', aliases: ['influent', 'c0', 'c_0'] },
  targetNgL: { label: 'Breakthrough concentration', citation: 'INPUT!G40', definition: 'Breakthrough concentration Cb for the Freundlich life formula. It must be below influent concentration. Entering a target does not validate achieved effluent concentration.', aliases: ['target', 'c_b'] }
};

const relations = [
  ['flow', 'required', 'Contactor Constraints!C38'], ['totalEbctMinutes', 'required', 'Contactor Constraints!C38'],
  ['totalEbctMinutes', 'perEbct', 'Contactor Constraints!C27'], ['series', 'perEbct', 'Contactor Constraints!C27'],
  ['diameterFt', 'area', 'Contactor Constraints!C43'], ['area', 'media', 'Contactor Constraints!C80'], ['bedDepthFt', 'media', 'Contactor Constraints!C80'],
  ['media', 'capacity', 'Contactor Constraints!C31'], ['perEbct', 'capacity', 'Contactor Constraints!C31'],
  ['flow', 'trains', 'Contactor Constraints!C32'], ['capacity', 'trains', 'Contactor Constraints!C32'],
  ['trains', 'count', 'Contactor Constraints!C33'], ['series', 'count', 'Contactor Constraints!C33'],
  ['media', 'mass', 'Contactor Constraints!C81'], ['densityLbFt3', 'mass', 'Contactor Constraints!C81'],
  ['flow', 'pipe', 'Pumps Pipe Structure!C24'], ['capacity', 'pipe', 'Pumps Pipe Structure!C27'],
  ['carbonLifeValue', 'life', 'Backwash and Regeneration!C36'], ['averageFlow', 'life', 'Backwash and Regeneration!C36'], ['media', 'life', 'Backwash and Regeneration!C36'], ['trains', 'life', 'Backwash and Regeneration!C36'],
  ['heightFt', 'fit', 'Contactor Constraints!C50'], ['bedDepthFt', 'fit', 'Contactor Constraints!C50']
];
function calculationRelations(form) {
  const edges = relations.filter(r => r[1] !== 'life');
  if (form.carbonLifeMode === 'months') edges.push(['carbonLifeValue', 'life', 'Backwash and Regeneration!C36']);
  else {
    edges.push(...relations.filter(r => r[1] === 'life'));
    if (form.carbonLifeMode === 'bv' && form.bvDefinition === 'total_series') edges.push(['series', 'life', 'Backwash and Regeneration!C36']);
    if (form.carbonLifeMode === 'freundlich') edges.push(['densityLbFt3', 'life', 'Backwash and Regeneration!C36']);
  }
  return edges;
}
export function buildWorkbookGraph(form, result, model, designGraph) {
  const w = result?.workbook;
  const inputKeys = ['flow', 'totalEbctMinutes', 'series', 'diameterFt', 'bedDepthFt', 'heightFt', 'densityLbFt3', 'averageFlow', 'carbonLifeValue'];
  const nodes = inputKeys.map((key, i) => ({ id: key, name: workbookFields[key].label, type: 'ExcelInput', column: 0, row: i,
    value: form[key] ? `${form[key]}${['flow', 'averageFlow'].includes(key) ? ' ' + form.flowUnit : ''}` : 'Not specified', citation: workbookFields[key].citation, attributes: { ...workbookFields[key], value: form[key] || null } }));
  const calculations = [
    ['required', 'Required media', w?.requiredMediaM3, 'm³', 'Contactor Constraints!C38', 1],
    ['perEbct', 'EBCT per vessel', result ? result.inputs.totalEbctMinutes / result.inputs.series : null, 'min', 'Contactor Constraints!C27', 1],
    ['area', 'Vessel area', w?.surfaceAreaFt2, 'ft²', 'Contactor Constraints!C43', 1],
    ['media', 'Media per vessel', w?.mediaPerVesselM3, 'm³', 'Contactor Constraints!C80', 2],
    ['fit', 'Expansion / height check', w ? 'Checked' : null, '', 'Contactor Constraints!C50', 2],
    ['capacity', 'Vessel flow capacity', w?.flowCapacityPerVesselGpm, 'gpm', 'Contactor Constraints!C31', 2],
    ['trains', 'Parallel trains', w?.parallel, '', 'Contactor Constraints!C32', 3],
    ['mass', 'GAC mass / vessel', w?.carbonPerVesselKg, 'kg', 'Contactor Constraints!C81', 3],
    ['pipe', 'Process pipe size', w?.processPipeInches, 'in', 'Pumps Pipe Structure!C27', 3],
    ['count', 'Operating vessels', w?.operatingVessels, '', 'Contactor Constraints!C33', 4],
    ['life', 'Carbon life', w?.carbonLifeMonths, 'months', 'Backwash and Regeneration!C36', 4]
  ];
  const slots = {};
  for (const [id, name, value, unit, citation, column] of calculations) {
    const row = slots[column] || 0; slots[column] = row + 1;
    nodes.push({ id, name, type: 'ExcelCalculation', column, row,
      value: value == null ? 'Not calculated' : `${typeof value === 'number' ? Number(value.toFixed(3)) : value} ${unit}`.trim(), citation,
      attributes: { citation, formula: model.formulas[citation]?.formula, value: value ?? null, unit, state: designGraph?.nodes.some(n => n.attributes?.calculationState === 'stale') ? 'stale result' : result ? 'proposal or applied result' : 'pending', mode: form.carbonLifeMode } });
  }
  const links = calculationRelations(form).map(([source, target, citation]) => ({ source, target, citation, label: 'input_to_formula' }));
  if (form.carbonLifeMode === 'freundlich') for (const key of ['freundlichExponent', 'influentNgL', 'targetNgL']) {
    nodes.push({ id: key, name: workbookFields[key].label, type: 'ExcelInput', column: 0, row: nodes.filter(n => n.column === 0).length,
      value: form[key] || 'Not specified', citation: workbookFields[key].citation, attributes: { ...workbookFields[key], value: form[key] } });
    links.push({ source: key, target: 'life', citation: 'Backwash and Regeneration!C36', label: 'input_to_formula' });
  }
  const vessels = (designGraph?.nodes || []).filter(n => n.type === 'Equipment');
  if (result && !vessels.length) vessels.push({ id: 'proposed-vessels', name: `${result.vesselCount} proposed vessels`, attributes: {} });
  if (vessels.length > 3) {
    const items = vessels.splice(0);
    vessels.push({ id: 'design-vessel-group', name: `${items.length} GAC vessels`, attributes: { vesselIds: items.map(v => v.id), vessels: items.map(v => ({ id: v.id, ...v.attributes })) } });
  }
  vessels.forEach((v, row) => { nodes.push({ id: v.id, name: v.name, type: 'DesignVessel', column: 5, row,
    value: result && !designGraph.nodes.some(n => n.id === v.id) ? 'Proposal' : 'Applied', attributes: v.attributes });
    for (const source of ['count', 'media', 'mass', 'pipe', 'life']) links.push({ source, target: v.id, label: 'maps_to_vessel', citation: 'design mapping' }); });
  return { nodes, links };
}
export function nextWorkbookStep({ form, proposal, accepted, graph }) {
  const required = ['species', 'flow', 'averageFlow', 'totalEbctMinutes', 'series', 'diameterFt', 'heightFt', 'bedDepthFt', 'densityLbFt3'];
  if (form.carbonLifeMode !== 'none') required.push('carbonLifeValue', 'carbonLifeSource');
  if (form.carbonLifeMode === 'freundlich') required.push('freundlichExponent', 'influentNgL', 'targetNgL');
  const missing = required.filter(k => (!String(form[k] ?? '').trim() || String(form[k]).trim() === '?'));
  if (missing.length) return { fields: missing, action: 'complete_inputs', message: `First enter ${missing.map(k => workbookFields[k]?.label || k).join(', ')}. These inputs are required by the selected workbook calculation method.` };
  const invalid = required.filter(k => !['species', 'carbonLifeSource'].includes(k) && (!Number.isFinite(Number(form[k])) || Number(form[k]) <= 0));
  if (invalid.length) return { fields: invalid, action: 'correct_inputs', message: `${invalid.map(k => workbookFields[k]?.label || k).join(', ')} must be positive numeric values. Correct these inputs first.` };
  if (form.carbonLifeMode === 'freundlich' && Number(form.targetNgL) >= Number(form.influentNgL)) return { fields: ['influentNgL', 'targetNgL'], action: 'correct_inputs', message: 'Freundlich breakthrough concentration must be below influent concentration. Check both inputs.' };
  if (Number(form.averageFlow) > Number(form.flow)) return { fields: ['averageFlow'], action: 'correct_inputs', message: 'Average flow exceeds design flow. Check the average operating flow first.' };
  if ((graph?.nodes || []).some(n => n.attributes?.calculationState === 'stale')) return { fields: [], action: 'recalculate', message: 'Inputs have changed and applied results are stale. Recalculate with Calculate GAC sizing, then review the changes.' };
  if (proposal) return { fields: [], action: 'review', message: 'A calculation proposal is ready. Review vessel dimensions, count and media in Architecture, then choose Accept and apply or Reject.' };
  if (accepted) return { fields: form.carbonLifeMode === 'none' ? ['carbonLifeMode', 'carbonLifeValue'] : [], action: 'refine', message: form.carbonLifeMode === 'none' ? 'Sizing has been applied. To assess carbon replacement, provide measured life, breakthrough BV or PFAS-specific Freundlich constants and their source. Sampling locations and hydraulics still require review.' : 'Sizing and carbon-life inputs have been applied. Next review sampling locations, hydraulics and PFAS treatment performance. This workbook does not predict effluent concentration.' };
  return { fields: [], action: 'calculate', message: 'Required sizing inputs are complete. Confirm the example EBCT and dimension assumptions, then select Calculate GAC sizing. Carbon-life calculation additionally requires a life method, test inputs and their source.' };
}
export function answerWorkbookQuestion(query, context, model) {
  const q = query.toLowerCase();
  const next = nextWorkbookStep(context);
  if (/다음|뭐.*해|무엇.*해|이제|필요.*값|빠진|어떤.*입력|무슨.*값|넣어야|next|missing|what.*need/.test(q)) return { mode: 'local_context', message: next.message, fields: next.fields, action: next.action };
  const matched = Object.entries(workbookFields).filter(([key, f]) => q.includes(key.toLowerCase()) || f.aliases.some(a => q.includes(a.toLowerCase())));
  // Keep "average flow" distinct from the generic flow alias.
  const fields = matched.some(([key]) => key === 'averageFlow') && !/설계|design/.test(q) ? matched.filter(([key]) => key !== 'flow') : matched;
  if (fields.length) {
    const showSource = /source|citation|sheet|cell|excel|출처|근거|셀/.test(q);
    const showDependencies = /connect|depend|affect|change|relationship|연결|영향|관계/.test(q);
    const showFormula = /formula|equation|수식/.test(q);
    const showCurrent = /current|my input|our input|현재|입력값/.test(q);
    const parts = fields.map(([key, f]) => {
      const labels = { required: 'required media volume', perEbct: 'EBCT per vessel', area: 'vessel area', media: 'media per vessel', capacity: 'vessel flow capacity', trains: 'parallel trains', count: 'operating vessel count', mass: 'carbon mass', pipe: 'pipe size', life: 'carbon life', fit: 'expanded-bed height check' };
      const downstream = calculationRelations(context.form).filter(r => r[0] === key).map(r => `${labels[r[1]]}${showSource ? ` [${r[2]}]` : ''}`);
      const definition = key === 'totalEbctMinutes' ? 'EBCT means Empty Bed Contact Time: the media bed volume divided by the flow rate. Total EBCT includes all vessels in a series train.' : f.definition;
      return `${definition}${showCurrent ? '\nCurrent input: ' + (context.form[key] || 'Not specified') : ''}${showSource ? '\nSource: ' + f.citation : ''}${showDependencies && downstream.length ? '\nIt affects ' + downstream.join(', ') + '.' : ''}`;
    });
    if (showFormula) {
      const citations = [...new Set(fields.flatMap(([key]) => calculationRelations(context.form).filter(r => r[0] === key).map(r => r[2])))];
      parts.push(...citations.slice(0, 4).map(c => `${c}\n${model.formulas[c]?.formula || ''}`));
    }
    return { mode: 'local_context', message: parts.join('\n\n'), fields: fields.map(([key]) => key), action: 'explain' };
  }
  if (/엑셀|excel|연결|관계|graph|계산/.test(q)) return { mode: 'local_context', fields: [], action: 'explain', message: 'Design flow and EBCT determine required media volume. Diameter and bed depth determine media per vessel. Vessel capacity and flow determine train count. Media volume and density determine carbon mass. Average flow and life/BV/isotherm inputs determine carbon life. Ask about a specific field for its definition and source formula.' };
  return { mode: 'local_context', fields: [], action: 'clarify', message: 'Specify the workbook input or output you want explained. Examples: What is EBCT? What changes when flow changes? What should I do next? To retrieve study records, ask Find PFOA reference cases.' };
}
