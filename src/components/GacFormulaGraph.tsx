import { nodeTooltip } from '../utils/nodeTooltip';
import { useState } from 'react';
import { useGacWorkflowStore } from '../store/gacWorkflowStore';
import { buildWorkbookGraph } from '../../shared/gacContext.js';
import model from '../data/gacWorkbook.json';
export function GacFormulaGraph() {
  const { form, proposal, accepted, graph, highlightedFields } = useGacWorkflowStore();
  const [selected, setSelected] = useState<string | null>(null);
  const kg = buildWorkbookGraph(form, proposal || accepted, model, graph);
  const focus = selected ? [selected] : highlightedFields;
  const related = new Set(focus);
  // Highlight downstream dependencies transitively.
  for (let i = 0; i < 6; i++) kg.links.forEach((l: any) => { if (related.has(l.source)) related.add(l.target); });
  const byId = new Map<string, any>(kg.nodes.map((n: any) => [n.id, n]));
  const x = (n: any) => 16 + n.column * 195;
  const y = (n: any) => 50 + n.row * 76;
  const height = Math.max(370, 65 + Math.max(...kg.nodes.map((n: any) => n.row)) * 76 + 70);
  return <div className="formula-graph">
    <svg viewBox={`0 0 1170 ${height}`} aria-label="Excel input formula result knowledge graph" style={{ width: '100%', minWidth: 850, height: 'auto' }}>
      <defs><marker id="formula-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10" fill="#777" /></marker></defs>
      {['Excel inputs', 'Geometry / EBCT', 'Vessel capacity', 'Sizing / mass', 'Count / life', 'Design vessels'].map((label, i) => <text key={label} x={16 + i * 195} y={20} fontSize={12} fontWeight="bold">{label}</text>)}
      {kg.links.map((l: any, i: number) => {
        const a = byId.get(l.source), b = byId.get(l.target);
        const strong = related.has(l.source) && related.has(l.target);
        return <path key={i} d={`M${x(a) + 170},${y(a) + 25} C${x(a) + 185},${y(a) + 25} ${x(b) - 15},${y(b) + 25} ${x(b)},${y(b) + 25}`} fill="none" stroke={strong ? '#222' : '#bbb'} strokeWidth={strong ? 2 : 1} opacity={focus.length && !strong ? 0.25 : 1} markerEnd="url(#formula-arrow)"><title>{l.source} → {l.target}\n{l.citation}</title></path>;
      })}
      {kg.nodes.map((n: any) => <g key={n.id} role="button" tabIndex={0} aria-label={n.name} onClick={() => setSelected(selected === n.id ? null : n.id)} onKeyDown={e => { if (e.key === 'Enter') setSelected(selected === n.id ? null : n.id); }} style={{ cursor: 'pointer' }}>
        <title>{nodeTooltip(n)}</title>
        <rect x={x(n)} y={y(n)} width={170} height={53} fill={related.has(n.id) ? '#eee' : '#fff'} stroke={related.has(n.id) ? '#222' : '#999'} />
        <text x={x(n) + 8} y={y(n) + 19} fontSize={11}>{n.name}</text><text x={x(n) + 8} y={y(n) + 39} fontSize={10} fill="#555">{n.value}</text>
      </g>)}
    </svg>
    {selected && <div className="formula-selection"><strong>{byId.get(selected).name}</strong><pre>{JSON.stringify(byId.get(selected).attributes, null, 2)}</pre></div>}
  </div>;
}
