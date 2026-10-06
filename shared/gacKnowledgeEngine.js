export function inspectDesign(form = {}, graph = {}) {
  const required = ['species', 'flow', 'totalEbctMinutes', 'series', 'parallel', 'ebctSource'];
  if (form.carbonLifeMode === 'freundlich') required.push('influentNgL', 'targetNgL');
  return { missing: required.filter(key => !String(form[key] ?? '').trim()),
    stale: (graph.nodes || []).some(n => n.attributes?.calculationState === 'stale'),
    vessels: (graph.nodes || []).filter(n => n.type === 'Equipment').map(n => n.id),
    unresolved: ['vessel geometry', 'sampling layout', 'valve layout', 'PFAS removal performance'] };
}
export function searchKnowledge(corpus, { query = '', species = '', influentNgL = '', tocMgL = '' } = {}) {
  const speciesNames = [...new Set(corpus.records.map(r => r.species))];
  const requested = speciesNames.find(s => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(query));
  const target = requested || species;
  if (!target) return [];
  return corpus.records.filter(r => r.species.toLowerCase() === target.toLowerCase()).map(r => {
    let score = 10;
    if (r.influentNgL > 0 && Number(influentNgL) > 0) score -= Math.abs(Math.log(r.influentNgL / Number(influentNgL)));
    if (r.tocMgL !== null && String(tocMgL).trim() && Number.isFinite(Number(tocMgL))) score -= Math.abs(r.tocMgL - Number(tocMgL));
    if (r.site.includes('lead')) score -= 2;
    if (r.waterType === 'landfill leachate') score -= 2;
    if (r.influentNgL === null) score -= 5;
    if (query.toLowerCase().includes(String(r.site).toLowerCase())) score += 2;
    return { ...r, score };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
}
export function knowledgeGraph(corpus, evidence, form = {}, graph = {}) {
  const selected = corpus.records.find(r => r.id === form.referenceId);
  if (selected && !evidence.some(r => r.id === selected.id)) evidence = [...evidence, selected];
  const nodes = [{ id: 'source-workbook', name: corpus.source.file, type: 'Workbook', attributes: corpus.source }];
  const links = []; const ids = new Set(['source-workbook']);
  function node(n) { if (!ids.has(n.id)) { nodes.push(n); ids.add(n.id); } }
  for (const record of evidence) {
    node({ id: `species-${record.species}`, name: record.species, type: 'Species', attributes: {} });
    node({ id: record.id, name: `${record.site}: ${record.totalEbctMinutes} min`, type: 'Observation', attributes: record });
    links.push({ source: 'source-workbook', target: record.id, label: 'contains_observation' },
      { source: record.id, target: `species-${record.species}`, label: 'measures' });
  }
  node({ id: 'design-ebct', name: `Design EBCT: ${form.totalEbctMinutes || '?'} min`, type: 'DesignRequirement', attributes: { totalEbctMinutes: form.totalEbctMinutes, source: form.ebctSource, referenceId: form.referenceId || null } });
  for (const record of evidence) links.push({ source: record.id, target: 'design-ebct', label: record.id === form.referenceId ? 'selected_basis' : 'candidate_reference' });
  for (const vessel of (graph.nodes || []).filter(n => n.type === 'Equipment')) {
    node({ ...vessel, id: `design-${vessel.id}`, type: 'DesignVessel' });
    links.push({ source: 'design-ebct', target: `design-${vessel.id}`, label: 'informs_sizing' });
  }
  return { nodes, links };
}
export function consultKnowledge(corpus, { query = '', form = {}, graph = {} } = {}) {
  const state = inspectDesign(form, graph);
  const evidence = searchKnowledge(corpus, { query, ...form });
  const eligible = evidence.filter(r => r.influentNgL !== null && r.totalEbctMinutes > 0 && r.series > 0);
  const record = eligible.find(r => r.species.toLowerCase() === String(form.species || '').toLowerCase());
  const questions = [];
  if (state.missing.length) questions.push({ field: state.missing[0], text: `What is the design value for ${state.missing[0]}?`, reason: 'Required by GAC sizing.' });
  if (!String(form.waterType || '').trim()) questions.push({ field: 'waterType', text: 'Is the source drinking water, wastewater or landfill leachate?', reason: 'The reference sites have different water matrices.' });
  if (!String(form.tocMgL || '').trim()) questions.push({ field: 'tocMgL', text: 'What is the influent TOC in mg/L?', reason: 'TOC is a reference-matching condition in the workbook.' });
  if (!String(form.media || '').trim()) questions.push({ field: 'media', text: 'Which GAC medium is intended?', reason: 'The workbook reports different media and breakthrough observations.' });
  if (!form.carbonLifeMode || form.carbonLifeMode === 'none') questions.push({ field: 'carbonLifeMode', text: 'Is a measured carbon life, breakthrough BV or PFAS-specific Freundlich test available?', reason: 'Excel carbon-life formulas require a life or isotherm input; influent concentration alone is insufficient.' });
  else {
    if (!String(form.carbonLifeValue || '').trim()) questions.push({ field: 'carbonLifeValue', text: 'What carbon-life or isotherm value should the Excel formula use?', reason: 'Required for the selected carbon-life calculation branch.' });
    if (form.carbonLifeMode === 'freundlich' && !String(form.freundlichExponent || '').trim()) questions.push({ field: 'freundlichExponent', text: 'What is the PFAS-specific Freundlich exponent 1/n?', reason: 'The workbook isotherm branch requires both Kf and 1/n.' });
    if (!String(form.carbonLifeSource || '').trim()) questions.push({ field: 'carbonLifeSource', text: 'What test or reference supports this carbon-life input?', reason: 'A source is required before calculating carbon life.' });
  }
  if (state.stale) questions.unshift({ field: 'recalculate', text: 'Recalculate sizing for the changed inputs?', reason: 'Applied graph values are stale.' });
  if (state.vessels.length) questions.push({ field: 'sampling', text: 'Where should influent, intermediate and effluent samples be taken?', reason: 'Sampling positions remain unresolved in the current vessel graph.' });
  const mismatches = record ? [`Reference influent: ${record.influentNgL} ng/L; project: ${form.influentNgL || 'unknown'} ng/L.`,
    `Reference TOC: ${record.tocRaw ?? 'not reported'} mg/L; project: ${form.tocMgL || 'unknown'} mg/L.`,
    `Reference medium: ${record.media}; project: ${form.media || 'unknown'}.`,
    `Reference water matrix: ${record.waterType}; project: ${form.waterType || 'unknown'}.`,
    'Observed EBCT is a candidate study condition, not a validated design recommendation.',
    'Reference BV uses total series media volume; 1%/10% breakthrough is not an absolute effluent target.'] : [];
  const suggestion = record ? { referenceId: record.id, label: `${record.site} / ${record.species}`,
    patch: { totalEbctMinutes: String(record.totalEbctMinutes), series: String(record.series),
      ebctSource: `${corpus.source.file} | ${record.contextCitation}; ${record.citation}; ${record.notesCitation} | sha256:${corpus.source.sha256}`, referenceId: record.id },
    mismatches, citation: record.citation } : null;
  const species = evidence[0]?.species || form.species || 'PFAS';
  const message = evidence.length ? `Found ${evidence.length} ${species} reference observations. ${record ? `Candidate study basis: ${record.totalEbctMinutes} min total EBCT, ${record.series} series vessel(s), site ${record.site} [${record.contextCitation}].` : eligible.length ? `The search species differs from the current design species (${form.species}). Confirm the species before selecting a basis.` : 'No numeric EBCT basis is available in these records.'}\n${questions[0]?.text || 'Review the source conditions before selecting a basis.'}`
    : `No matching PFAS reference observation was found. ${questions[0]?.text || 'Which PFAS species should be searched?'}`;
  return { mode: 'local_retrieval', message, evidence, suggestion, questions, state,
    guidance: corpus.guidance, source: corpus.source,
    toolCalls: [{ name: 'inspect_design_state', result: state }, { name: 'search_gac_knowledge', arguments: { query, species: form.species }, resultIds: evidence.map(r => r.id) }],
    knowledgeGraph: knowledgeGraph(corpus, evidence, form, graph) };
}
