// Ports the cited upright-pressure branches of the EPA workbook, including its
// rounded unit constants and VLOOKUP approximate-match behavior.
const FT3_M3 = 0.028316846592;
const LB_KG = 0.45359237;
export function workbookLookup(rows, value) {
  const row = rows.filter(r => r[0] <= value).at(-1);
  if (!row) throw new Error('Value is below the workbook lookup range.');
  return row;
}
const up = (n, digits = 0) => Math.ceil((n - 1e-12) * 10 ** digits) / 10 ** digits;
const down = (n, digits = 0) => Math.floor((n + 1e-12) * 10 ** digits) / 10 ** digits;
function positive(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be positive.`);
  return n;
}
export function calculateWorkbook(inputs, model) {
  const q = positive(inputs.flowGpm, 'Design flow');
  const qa = positive(inputs.averageFlowGpm, 'Average flow');
  if (qa > q) throw new Error('Average flow cannot exceed design flow.');
  const ebct = positive(inputs.totalEbctMinutes, 'Total EBCT');
  const series = positive(inputs.series, 'Series vessels');
  if (!Number.isInteger(series)) throw new Error('Series vessels must be an integer.');
  const density = positive(inputs.densityLbFt3, 'GAC bulk density');
  const assumption = name => model.assumptions[name].value;
  const expansion = assumption('bed_expansion'), freeboard = assumption('free_board');
  const wall = assumption('Vessel_thickness');
  const maxBed = down(Math.min(assumption('max_bed_depth'), (assumption('max_height') - freeboard) / (1 + expansion)), 1);
  const minimumVolumeFt3 = q * ebct / 7.481; // Contactor Constraints!C38
  let diameter, bed, height;
  const traceIds = new Set(['Contactor Constraints!C27', 'Contactor Constraints!C31', 'Contactor Constraints!C32', 'Contactor Constraints!C33', 'Contactor Constraints!C34', 'Contactor Constraints!C35', 'Contactor Constraints!C38', 'Contactor Constraints!C43', 'Contactor Constraints!C44', 'Contactor Constraints!C45', 'Contactor Constraints!C46', 'Contactor Constraints!C50', 'Contactor Constraints!C80', 'Contactor Constraints!C81', 'Contactor Constraints!C82', 'Contactor Constraints!C83', 'Pumps Pipe Structure!C24', 'Pumps Pipe Structure!C27', 'Pumps Pipe Structure!C30', 'Backwash and Regeneration!C13', 'Backwash and Regeneration!C14']);
  if (inputs.geometryMode === 'auto') {
    const requested = positive(inputs.parallel, 'Requested parallel trains');
    if (!Number.isInteger(requested)) throw new Error('Parallel trains must be an integer.');
    const minD = model.tables.vessel_size_table_cl.rows[0][0];
    const maxD = assumption('max_diam_override') > 0 ? assumption('max_diam_override') : model.tables.vessel_size_table_cl.rows.at(-1)[0];
    const minSa = q / assumption('load_max') / requested;
    const maxSa = q / assumption('load_min') / requested;
    const lowerD = up(2 * Math.max(2 * (Math.sqrt(minimumVolumeFt3 / series / Math.PI / maxBed / requested) + wall), 2 * (Math.sqrt(minSa / Math.PI) + wall), minD)) / 2;
    const upperD = Math.max(0.5, down(2 * Math.min(maxD, 2 * (Math.sqrt(maxSa / Math.PI) + wall))) / 2);
    if (lowerD > upperD) throw new Error('No upright vessel fits these workbook constraints. Change the train count or use another geometry.');
    const targetBed = q * 1440 / 1e6 <= 0.1 ? assumption('target_bed_depth_under') : assumption('target_bed_depth_over');
    const targetD = 2 * (Math.sqrt(minimumVolumeFt3 / series / targetBed / requested / Math.PI) + wall);
    diameter = targetD < lowerD ? lowerD : targetD > upperD ? upperD : up(2 * targetD) / 2;
    const area = Math.PI * (diameter - 2 * wall) ** 2 / 4;
    bed = Math.min(maxBed, Math.max(assumption('min_bed_depth'), up(minimumVolumeFt3 / series / (area * requested), 1)));
    const size = workbookLookup(model.tables.vessel_size_table_cl.rows, diameter);
    const maxHeight = Math.min(size[2], assumption('max_height'));
    height = Math.max(size[1], up(2 * (bed * (1 + expansion) + freeboard)) / 2);
    if (height > maxHeight) throw new Error('Expanded bed does not fit the workbook vessel height limit. Increase parallel trains.');
    ['AutoSize!C18', 'AutoSize!C23', 'AutoSize!C24', 'AutoSize!C58', 'AutoSize!E58', 'AutoSize!C61', 'AutoSize!E61', 'AutoSize!C62', 'AutoSize!E62', 'AutoSize!C91', 'AutoSize!C95', 'AutoSize!C100', 'AutoSize!C103'].forEach(id => traceIds.add(id));
  } else {
    diameter = positive(inputs.diameterFt, 'Vessel diameter (ft)');
    bed = positive(inputs.bedDepthFt, 'Bed depth (ft)');
    height = positive(inputs.heightFt, 'Vessel straight height (ft)');
  }
  const tableSize = workbookLookup(model.tables.vessel_size_table_cl.rows, diameter);
  const maxDiameter = assumption('max_diam_override') > 0 ? assumption('max_diam_override') : model.tables.vessel_size_table_cl.rows.at(-1)[0];
  if (diameter > maxDiameter || bed < assumption('min_bed_depth') || bed > maxBed || bed > 2 * diameter) throw new Error('Vessel dimensions violate workbook diameter / bed-depth constraints.');
  if (height < Math.max(tableSize[1], bed * (1 + expansion) + freeboard) || height > Math.min(tableSize[2], assumption('max_height'))) throw new Error('Vessel height violates workbook freeboard / expansion constraints.');
  const areaFt2 = Math.PI * (diameter - 2 * wall) ** 2 / 4;
  const mediaFt3 = areaFt2 * bed;
  const flowPerVesselGpm = mediaFt3 * 7.48 / (ebct / series);
  const parallel = up(q / flowPerVesselGpm);
  const operatingVessels = parallel * series;
  if (parallel > 20 || operatingVessels > 400) throw new Error('Too many vessels for the graph. Increase vessel dimensions.');
  const automaticRedundant = q * 1440 / 1e6 >= 1 ? up(parallel / assumption('redund_freq')) : operatingVessels === 1 ? assumption('NRD_small_1') : assumption('NRD_small');
  const redundant = inputs.redundantVessels === '' || inputs.redundantVessels == null ? automaticRedundant : Number(inputs.redundantVessels);
  if (!Number.isSafeInteger(redundant) || redundant < 0 || redundant > 20) throw new Error('Redundant vessel count must be an integer from 0 to 20.');
  const loadRate = q / parallel / areaFt2;
  if (loadRate < assumption('load_min') || loadRate > assumption('load_max')) throw new Error('Surface loading rate violates workbook constraints.');
  const gacEachLb = mediaFt3 * density;
  const finalVessels = operatingVessels + redundant;
  let lifeMonths = null;
  const lifeMode = inputs.carbonLifeMode || 'none';
  if (lifeMode !== 'none') {
    const value = positive(inputs.carbonLifeValue, 'Carbon life / capacity input');
    if (lifeMode === 'months') lifeMonths = value;
    else if (lifeMode === 'bv') {
      if (!['per_vessel', 'total_series'].includes(inputs.bvDefinition)) throw new Error('Choose the bed-volume definition.');
      lifeMonths = value * mediaFt3 * parallel * (inputs.bvDefinition === 'total_series' ? series : 1) * 7.48 / qa / 60 / 24 / 30;
    } else if (lifeMode === 'freundlich') {
      const c0 = positive(inputs.influentMgL, 'Influent concentration (mg/L)');
      const cb = positive(inputs.targetMgL, 'Breakthrough concentration (mg/L)');
      if (cb >= c0) throw new Error('Breakthrough concentration must be below influent.');
      const exponent = positive(inputs.freundlichExponent, 'Freundlich 1/n');
      // Backwash and Regeneration!C31, C32, C36 branch 2.
      lifeMonths = (gacEachLb * parallel * 453.59 * (value / 1000) * (c0 * 1000) ** exponent / (qa * 3.785 * (c0 - cb))) / (30 * 24 * 60);
      traceIds.add('Backwash and Regeneration!C31'); traceIds.add('Backwash and Regeneration!C32');
    } else throw new Error('Unsupported workbook carbon-life branch.');
    if (!Number.isFinite(lifeMonths) || lifeMonths <= 0) throw new Error('Workbook carbon life is invalid.');
    traceIds.add('Backwash and Regeneration!C36'); traceIds.add('Backwash and Regeneration!C38'); traceIds.add('Backwash and Regeneration!C43');
  }
  const backwashGpm = Math.round(assumption('h2oflush_backwash_rate') * areaFt2);
  const pipeRows = model.tables.pipe_size_table_cl.rows;
  return { version: model.version, source: model.source, inputs: { ...inputs }, geometry: 'upright',
    diameterFt: diameter, heightFt: height, bedDepthFt: bed,
    diameterM: diameter * 0.3048, heightM: height * 0.3048, bedDepthM: bed * 0.3048,
    surfaceAreaFt2: areaFt2, loadingGpmFt2: loadRate,
    requiredMediaM3: minimumVolumeFt3 * FT3_M3, mediaPerVesselM3: mediaFt3 * FT3_M3,
    operatingMediaM3: mediaFt3 * operatingVessels * FT3_M3,
    parallel, series, operatingVessels, redundantVessels: redundant, finalVessels,
    carbonPerVesselKg: gacEachLb * LB_KG, installedCarbonKg: gacEachLb * finalVessels * LB_KG,
    flowCapacityPerVesselGpm: flowPerVesselGpm,
    actualTotalEbctMinutes: mediaFt3 * parallel * series * 7.48 / q,
    shellVolumePerVesselM3: Math.PI * diameter ** 2 / 4 * height * FT3_M3,
    influentPipeInches: workbookLookup(pipeRows, q)[1], processPipeInches: workbookLookup(pipeRows, flowPerVesselGpm)[1],
    backwashPipeInches: workbookLookup(pipeRows, backwashGpm)[1],
    backwashFlowGpm: backwashGpm, backwashVolumeGallons: backwashGpm * assumption('backwash_time'),
    carbonLifeMonths: lifeMonths, annualCarbonKg: lifeMonths ? gacEachLb * parallel / (lifeMonths / 12) * LB_KG : null,
    assumptions: { densityLbFt3: density, bedExpansion: expansion, freeboardFt: freeboard,
      loadMinimumGpmFt2: assumption('load_min'), loadMaximumGpmFt2: assumption('load_max'),
      constants: 'Workbook uses 7.481 for required ft³ and 7.48 for actual gallons; life uses 30-day months.',
      scope: 'Upright pressure vessels; no bypass. AutoSize dimensions for chosen train count; no VBA cost optimization. Carbon life branches: months, BV, Freundlich.' },
    formulaTrace: [...traceIds].map(citation => ({ citation, ...model.formulas[citation] })),
    lookupTrace: [model.tables.vessel_size_table_cl.citation, model.tables.pipe_size_table_cl.citation] };
}
