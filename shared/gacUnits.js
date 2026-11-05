// Display conversions only. Workbook inputs, results, graphs and exports retain
// their documented canonical units; changing the view never changes a design.
export const FT_M = 0.3048;
export const FT3_M3 = 0.028316846592;
export const LB_KG = 0.45359237;
export const GPM_M3H = 0.003785411784 * 60;
const units = {
  flow: { si: ['m³/h', 1], us: ['US gpm', 1 / GPM_M3H] },
  length: { si: ['m', 1], us: ['ft', 1 / FT_M] },
  area: { si: ['m²', 1], us: ['ft²', 1 / FT_M ** 2] },
  volume: { si: ['m³', 1], us: ['ft³', 1 / FT3_M3] },
  mass: { si: ['kg', 1], us: ['lb', 1 / LB_KG] },
  density: { si: ['kg/m³', 1], us: ['lb/ft³', FT3_M3 / LB_KG] },
  pipe: { si: ['mm', 1000], us: ['in', 1 / 0.0254] },
};
export const unitLabel = (quantity, system = 'si') => units[quantity][system][0];
export const displayNumber = (value, quantity, system = 'si') => Number(value) * units[quantity][system][1];
export function quantity(value, kind, system = 'si', digits = 3) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return 'Not specified';
  return displayNumber(value, kind, system).toFixed(digits) + ' ' + unitLabel(kind, system);
}
const fieldKinds = { flow: 'flow', averageFlow: 'flow', diameterFt: 'length', heightFt: 'length', bedDepthFt: 'length', densityLbFt3: 'density' };
const names = { flow: 'Design flow', averageFlow: 'Average flow', diameterFt: 'Diameter', heightFt: 'Straight height', bedDepthFt: 'Bed depth', densityLbFt3: 'Bulk density', influentNgL: 'Influent', targetNgL: 'Breakthrough' };
function fieldFactor(key, system, flowUnit) {
  const kind = fieldKinds[key];
  const baseToSi = key.endsWith('Ft') ? FT_M : key === 'densityLbFt3' ? LB_KG / FT3_M3 : kind === 'flow' && flowUnit === 'gpm' ? GPM_M3H : 1;
  return kind ? baseToSi * units[kind][system][1] : 1;
}
function convertText(value, factor) {
  const text = String(value ?? '');
  if (!text.trim() || !Number.isFinite(Number(text))) return text;
  // Display rounding is never written back just by toggling, focusing or blurring.
  return factor === 1 ? text : String(Number((Number(text) * factor).toPrecision(15)));
}
export const fieldDisplay = (key, value, system = 'si', flowUnit = 'm3/h') => convertText(value, fieldFactor(key, system, flowUnit));
export const fieldCanonical = (key, value, system = 'si', flowUnit = 'm3/h') => convertText(value, 1 / fieldFactor(key, system, flowUnit));
export function fieldLabel(key, fallback, system = 'si') {
  return fieldKinds[key] ? names[key] + ' (' + unitLabel(fieldKinds[key], system) + ')' : ['influentNgL', 'targetNgL'].includes(key) ? names[key] + ' (ng/L)' : fallback;
}
export function fieldValue(key, form, system = 'si') {
  const value = fieldDisplay(key, form[key], system, form.flowUnit);
  const unit = fieldKinds[key] ? unitLabel(fieldKinds[key], system) : ['influentNgL', 'targetNgL'].includes(key) ? 'ng/L' : '';
  return value ? value + (unit ? ' ' + unit : '') : 'Not specified';
}
export function fieldDefinition(key, definition, system = 'si') {
  if (key.endsWith('Ft')) return definition.replace(/in feet/g, 'in ' + (system === 'si' ? 'meters' : 'feet'));
  if (key === 'densityLbFt3') return definition.replace(/lb\/ft³/g, unitLabel('density', system));
  return definition;
}
