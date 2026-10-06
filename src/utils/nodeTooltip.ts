export function nodeTooltip(node: any): string {
  const attributes = node.attributes || {};
  const lines = [String(node.name || node.id || 'Item')];
  const fields: [string, string, string?][] = [
    ['description', '', ''], ['temperature', 'Temperature'], ['pressure', 'Pressure'],
    ['designFlowRate', 'Design flow'], ['mediaVolumeM3', 'GAC volume', 'm³'],
    ['diameter', 'Diameter', 'm'], ['value', 'Value'], ['definition', '', ''],
    ['citation', 'Source'],
  ];
  for (const [key, label, unit] of fields) {
    const value = attributes[key];
    if (value == null || value === '' || typeof value === 'object') continue;
    if (/^(TBD|Not selected|Not specified|Unresolved)$/i.test(String(value))) continue;
    const text = typeof value === 'number' ? String(Number(value.toFixed(3))) : String(value);
    const concise = text.length > 100 ? `${text.slice(0, 97)}…` : text;
    lines.push(`${label ? `${label}: ` : ''}${concise}${unit ? ` ${unit}` : ''}`);
    if (lines.length === 4) break;
  }
  return lines.join('\n');
}

export function nodeTooltipHtml(node: any): string {
  const tip = document.createElement('div');
  tip.textContent = nodeTooltip(node);
  Object.assign(tip.style, { maxWidth: '260px', whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.4',
    background: '#fff', color: '#222', padding: '8px', border: '1px solid #aaa' });
  return tip.outerHTML;
}
