export const GAC_VERSION = 'gac-volume/1.0.0';
export interface GacBasis {
  flow: number; flowUnit: 'm3/h' | 'gpm'; totalEbctMinutes: number;
  series: number; parallel: number; species: string;
  influentNgL?: number; targetNgL?: number; ebctSource: string;
}
export interface GacCalculation {
  workbook?: any;
  requiredMediaM3?: number;
  evidence?: any;
  version: string; inputs: GacBasis; flowM3H: number; totalMediaM3: number;
  mediaPerVesselM3: number; ebctPerVesselMinutes: number; flowPerTrainM3H: number;
  vesselCount: number; assumptions: string[];
}
export interface GacGraph { nodes: any[]; links: any[] }
export function calculateGac(basis: GacBasis): GacCalculation {
  for (const key of ['flow', 'totalEbctMinutes'] as const) {
    if (!Number.isFinite(basis[key]) || basis[key] <= 0) throw new Error(`${key} must be a positive number.`);
  }
  for (const key of ['series', 'parallel'] as const) {
    if (!Number.isSafeInteger(basis[key]) || basis[key] < 1 || basis[key] > 20) throw new Error(`${key} must be an integer from 1 to 20.`);
  }
  if (!['m3/h', 'gpm'].includes(basis.flowUnit)) throw new Error('Unsupported flow unit.');
  if (!basis.species.trim() || !basis.ebctSource.trim()) throw new Error('PFAS species and EBCT source are required.');
  for (const key of ['influentNgL', 'targetNgL'] as const) if (basis[key] !== undefined && (!Number.isFinite(basis[key]) || basis[key]! <= 0)) throw new Error(`${key} must be a positive number.`);
  if (basis.targetNgL !== undefined && basis.influentNgL !== undefined && basis.targetNgL >= basis.influentNgL) throw new Error('Target concentration must be lower than influent concentration.');
  const flowM3H = basis.flow * (basis.flowUnit === 'gpm' ? 0.003785411784 * 60 : 1);
  const totalMediaM3 = flowM3H * basis.totalEbctMinutes / 60;
  if (!Number.isFinite(totalMediaM3)) throw new Error('Calculation exceeds numeric range.');
  return { version: GAC_VERSION, inputs: { ...basis }, flowM3H, totalMediaM3,
    mediaPerVesselM3: totalMediaM3 / (basis.series * basis.parallel),
    ebctPerVesselMinutes: basis.totalEbctMinutes / basis.series,
    flowPerTrainM3H: flowM3H / basis.parallel, vesselCount: basis.series * basis.parallel,
    assumptions: ['Equal flow across parallel trains; equal media volume in series vessels.',
      'EBCT is total per train at design flow. Volume denotes media bed, not vessel shell.',
      'EBCT is supplied by the user with a source; PFAS removal performance remains unverified.',
      'Diameter, height, media mass, pressure loss, pipe size, valves and change-out require further design.'] };
}
export function gacConcept(): GacGraph {
  return { nodes: [{ id: 'gac-feed', name: 'PFAS influent', type: 'Source', fx: -240, fy: 0, attributes: {} },
    { id: 'gac-concept', name: 'GAC treatment — sizing unresolved', type: 'TreatmentTrain', fx: 0, fy: 0, attributes: {} },
    { id: 'gac-effluent', name: 'Treated water', type: 'Sink', fx: 240, fy: 0, attributes: { performance: 'unverified' } }],
    links: [{ source: 'gac-feed', target: 'gac-concept', label: 'process_flow' },
      { source: 'gac-concept', target: 'gac-effluent', label: 'process_flow' }] };
}
export function buildGacGraph(result: GacCalculation): GacGraph {
  const graph = gacConcept();
  graph.nodes = graph.nodes.filter(n => n.id !== 'gac-concept'); graph.links = [];
  graph.nodes[0].attributes = { species: result.inputs.species, influentNgL: result.inputs.influentNgL, flowM3H: result.flowM3H };
  graph.nodes[1].attributes = { targetNgL: result.inputs.targetNgL, performance: 'unverified' };
  for (let train = 1; train <= result.inputs.parallel; train++) {
    let previous = 'gac-feed';
    for (let position = 1; position <= result.inputs.series; position++) {
      const id = `gac-t${train}-v${position}`;
      graph.nodes.push({ id, name: `GAC T${train} / V${position}`, type: 'Equipment',
        fx: result.inputs.series === 1 ? 0 : -140 + 280 * (position - 1) / (result.inputs.series - 1),
        fy: (train - (result.inputs.parallel + 1) / 2) * 100,
        attributes: { role: position === 1 ? 'lead' : 'downstream', mediaVolumeM3: result.mediaPerVesselM3,
          ebctMinutes: result.ebctPerVesselMinutes, flowM3H: result.flowPerTrainM3H,
          calculationVersion: result.version, calculationState: 'current', performance: 'unverified',
          diameter: result.workbook?.diameterM ?? null, height: result.workbook?.heightM ?? null,
          bedDepthM: result.workbook?.bedDepthM ?? null, carbonMassKg: result.workbook?.carbonPerVesselKg ?? null,
          pipeDiameter: result.workbook ? result.workbook.processPipeInches * 0.0254 : null,
          carbonLifeMonths: result.workbook?.carbonLifeMonths ?? null, reviewRequired: true } });
      graph.links.push({ source: previous, target: id, label: 'process_flow', type: 'process_flow' }); previous = id;
    }
    graph.links.push({ source: previous, target: 'gac-effluent', label: 'process_flow', type: 'process_flow' });
  }
  graph.nodes.push({ id: 'gac-calculation', name: 'GAC calculation basis', type: 'Calculation', fx: 0,
    fy: -100 * (result.inputs.parallel + 1) / 2, attributes: { ...result, calculationState: 'current' } });
  graph.nodes.filter(n => n.id.startsWith('gac-t')).forEach(n => graph.links.push({ source: 'gac-calculation', target: n.id, label: 'sizes_media_bed', type: 'design_evidence' }));
  if (result.workbook) {
    graph.nodes.push({ id: 'gac-workbook', name: result.workbook.source.file, type: 'Workbook', attributes: result.workbook.source });
    graph.links.push({ source: 'gac-workbook', target: 'gac-calculation', label: 'provides_formulas', type: 'design_evidence' });
    for (let i = 1; i <= result.workbook.redundantVessels; i++) graph.nodes.push({ id: `gac-spare-${i}`, name: `GAC spare ${i}`, type: 'SpareEquipment', attributes: { role: 'redundant', diameterM: result.workbook.diameterM, heightM: result.workbook.heightM, mediaVolumeM3: result.workbook.mediaPerVesselM3, carbonMassKg: result.workbook.carbonPerVesselKg, calculationState: 'current' } });
  }
  if (result.evidence?.record) {
    graph.nodes.push({ id: result.evidence.record.id, name: result.evidence.record.citation, type: 'Reference', attributes: result.evidence });
    graph.links.push({ source: result.evidence.record.id, target: 'gac-calculation', label: 'selected_basis', type: 'design_evidence' });
  }
  return graph;
}
export function invalidateGacGraph(graph: GacGraph): GacGraph {
  return { ...graph, nodes: graph.nodes.map(n => ({ ...n, attributes: { ...n.attributes, calculationState: 'stale', reviewRequired: true } })) };
}

// A bounded agent: inspect missing inputs, then call the deterministic sizing tool.
// It never invents a source, selects an EBCT, or applies graph changes automatically.
export function runGacAgent(values: Record<string, string>, graph: GacGraph = gacConcept()) {
  const designState = { vesselIds: graph.nodes.filter(n => n.type === 'Equipment').map(n => n.id),
    sizingStale: graph.nodes.some(n => n.attributes?.calculationState === 'stale'),
    unresolved: ['vessel geometry', 'pipe sizing', 'valve layout', 'sampling layout', 'PFAS performance'] };
  const required = ['species', 'flow', 'totalEbctMinutes', 'series', 'parallel', 'ebctSource'];
  if (values.carbonLifeMode === 'freundlich') required.push('influentNgL', 'targetNgL');
  const missing = required.filter(key => !values[key]?.trim());
  if (missing.length) return { kind: 'needs_input' as const, missing, designState,
    message: `Please provide: ${missing.join(', ')}. EBCT must come from a cited design or pilot basis.` };
  const basis: GacBasis = { species: values.species, ebctSource: values.ebctSource,
    flowUnit: values.flowUnit as GacBasis['flowUnit'], flow: Number(values.flow),
    totalEbctMinutes: Number(values.totalEbctMinutes), series: Number(values.series), parallel: Number(values.parallel),
    influentNgL: values.influentNgL?.trim() ? Number(values.influentNgL) : undefined, targetNgL: values.targetNgL?.trim() ? Number(values.targetNgL) : undefined };
  return { kind: 'proposal' as const, designState, toolCall: { name: 'calculate_gac_media_volume', arguments: basis }, result: calculateGac(basis) };
}
