import { nodeTooltip } from '../utils/nodeTooltip';
import { useGacWorkflowStore, gacCommand } from '../store/gacWorkflowStore';
import { useDesignStore } from '../store/designStore';
import { buildGacGraph, GacGraph } from '../utils/gacDesign';
import { GacFormulaGraph } from './GacFormulaGraph';

function ProcessDiagram({ graph }: { graph: GacGraph }) {
  const selectNode = useDesignStore(s => s.selectNode);
  const vessels = graph.nodes.filter(n => n.type === 'Equipment');
  const trains = Math.max(1, ...vessels.map(n => Number(n.id.match(/gac-t(\d+)/)?.[1] || 1)));
  const series = Math.max(1, ...vessels.map(n => Number(n.id.match(/-v(\d+)/)?.[1] || 1)));
  const width = Math.max(460, (series + 2) * 130);
  const height = Math.max(200, trains * 100 + 60);
  const rows = vessels.length ? Array.from({ length: trains }, (_, t) => vessels.filter(n => n.id.startsWith(`gac-t${t + 1}-`)))
    : [[graph.nodes.find(n => n.id === 'gac-concept')]];
  const stale = graph.nodes.some(n => n.attributes?.calculationState === 'stale');
  return <div className="process-diagram"><svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: series > 3 ? width : undefined, height: 'auto' }} aria-label="GAC process connections">
    {rows.map((row, index) => {
      const y = 55 + index * 100;
      const nodes = [graph.nodes.find(n => n.id === 'gac-feed'), ...row, graph.nodes.find(n => n.id === 'gac-effluent')].filter(Boolean);
      return <g key={index}>{nodes.map((node, position) => {
        const x = 15 + position * 130;
        const label = node.id === 'gac-feed' ? 'Influent' : node.id === 'gac-effluent' ? 'Treated water' : vessels.length ? `T${index + 1} / V${position}` : 'GAC';
        return <g key={`${index}-${node.id}`}>
          {position < nodes.length - 1 && <><line x1={x + 105} y1={y + 20} x2={x + 125} y2={y + 20} stroke="#555" /><path d={`M${x + 120},${y + 16} l5,4 l-5,4`} fill="none" stroke="#555" /></>}
          <g role="button" tabIndex={0} aria-label={node.name} onClick={() => selectNode(node)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(node); } }} style={{ cursor: 'pointer' }}>
            <title>{nodeTooltip(node)}</title>
            <rect x={x} y={y} width={105} height={40} fill="#fff" stroke="#555" strokeDasharray={stale ? '4 3' : undefined} />
            <text x={x + 52.5} y={y + 24} textAnchor="middle" fontSize={12}>{label}</text>
          </g>
          <text x={x + 52.5} y={y + 58} textAnchor="middle" fontSize={11}>{node.type === 'Equipment' ? `${node.attributes.mediaVolumeM3.toFixed(2)} m³ media` : node.id === 'gac-concept' ? 'Sizing unresolved' : ''}</text>
        </g>;
      })}</g>;
    })}
  </svg>{graph.nodes.some(n => n.type === 'SpareEquipment') && <div className="spare-vessels">{graph.nodes.filter(n => n.type === 'SpareEquipment').map(n => <span key={n.id} title={nodeTooltip(n)}>{n.name} (unconnected spare)</span>)}</div>}</div>;
}
function media(graph: GacGraph) {
  const vessels = graph.nodes.filter(n => n.type === 'Equipment');
  return vessels.length ? `${vessels.reduce((sum, n) => sum + n.attributes.mediaVolumeM3, 0).toFixed(3)} m³` : 'Unresolved';
}
export function GacResearchPanel() {
  const { proposal, accepted, graph, beforeGraph, form, graphTab } = useGacWorkflowStore();
  const stale = graph.nodes.some(n => n.attributes?.calculationState === 'stale');
  const before = proposal ? graph : accepted ? beforeGraph : graph;
  const after = proposal ? buildGacGraph(proposal) : graph;
  const result = proposal || accepted;
  return <div className="research-panel">
    <div className="panel-title"><div><button aria-pressed={graphTab === 'architecture'} onClick={() => useGacWorkflowStore.setState({ graphTab: 'architecture' })}>Architecture</button> <button aria-pressed={graphTab === 'graph'} onClick={() => useGacWorkflowStore.setState({ graphTab: 'graph' })}>Graph</button></div><span>{stale ? 'Recalculation needed' : proposal ? 'Proposal for review' : accepted ? 'Applied' : 'Concept'}</span></div>
    {graphTab === 'graph' ? <GacFormulaGraph /> : <div className="research-content">
      <div className={`design-comparison ${result ? "" : "concept-only"}`}>
        <section><h3>{proposal || accepted ? 'Before change' : 'Current concept'}</h3><ProcessDiagram graph={before} /></section>
        {result && <section><h3>{proposal ? 'Proposed change' : 'Applied change'}</h3><ProcessDiagram graph={after} /></section>}
      </div>
      {result && <table className="change-table"><thead><tr><th>Design item</th><th>Before</th><th>{proposal ? 'Proposed' : 'Current'}</th></tr></thead><tbody>
        <tr><td>Vessels</td><td>{before.nodes.filter(n => n.type === 'Equipment').length || 'Unresolved'}</td><td>{result?.vesselCount || 'Unresolved'}</td></tr>
        <tr><td>Required media volume</td><td>{before.nodes.find(n => n.id === 'gac-calculation') ? `${(before.nodes.find(n => n.id === 'gac-calculation')!.attributes.requiredMediaM3 ?? before.nodes.find(n => n.id === 'gac-calculation')!.attributes.totalMediaM3).toFixed(3)} m³` : 'Unresolved'}</td><td>{result ? `${(result.requiredMediaM3 ?? result.totalMediaM3).toFixed(3)} m³` : 'Unresolved'}</td></tr>
        <tr><td>Media per vessel</td><td>{before.nodes.find(n => n.type === 'Equipment') ? `${before.nodes.find(n => n.type === 'Equipment')!.attributes.mediaVolumeM3.toFixed(3)} m³` : 'Unresolved'}</td><td>{result ? `${result.mediaPerVesselM3.toFixed(3)} m³` : 'Unresolved'}</td></tr>
        {result?.workbook && <><tr><td>Installed operating media</td><td>{media(before)}</td><td>{result.workbook.operatingMediaM3.toFixed(3)} m³</td></tr>
          <tr><td>Diameter × straight height</td><td>—</td><td>{result.workbook.diameterM.toFixed(3)} × {result.workbook.heightM.toFixed(3)} m</td></tr>
          <tr><td>GAC mass incl. spare vessels</td><td>—</td><td>{result.workbook.installedCarbonKg.toFixed(1)} kg</td></tr>
          <tr><td>Redundant vessels</td><td>—</td><td>{result.workbook.redundantVessels}</td></tr>
          <tr><td>Process / inlet pipe size</td><td>—</td><td>{result.workbook.processPipeInches} / {result.workbook.influentPipeInches} in</td></tr>
          <tr><td>Carbon life / annual carbon</td><td>—</td><td>{result.workbook.carbonLifeMonths ? `${result.workbook.carbonLifeMonths.toFixed(2)} months / ${result.workbook.annualCarbonKg.toFixed(1)} kg/year` : 'Carbon-life input required'}</td></tr></>}
        <tr><td>Sampling / hydraulic verification</td><td>Unresolved</td><td>Further design required</td></tr>
      </tbody></table>}
      {result && <div className="calculation-evidence"><h3>Calculation basis</h3>
        <p>{result.flowM3H.toFixed(3)} m³/h × {result.inputs.totalEbctMinutes} min ÷ 60 = {(result.requiredMediaM3 ?? result.totalMediaM3).toFixed(3)} m³ required{result.inputs.flowUnit === 'gpm' ? ` (${result.inputs.flow} US gpm converted)` : ''}</p>
        <p>{result.inputs.series} series × {result.inputs.parallel} parallel; {result.ebctPerVesselMinutes.toFixed(2)} min per vessel</p>
        <details><summary>Source</summary><p>{result.inputs.ebctSource}</p></details>
        {result.workbook && <details><summary>Excel formulas</summary><p>{result.workbook.source.file}</p><p>{result.workbook.inputs.geometryMode === 'auto' ? 'AutoSize upright dimensions for requested trains' : 'Manual upright vessel dimensions'}; installed total EBCT: {result.workbook.actualTotalEbctMinutes.toFixed(3)} min</p>{result.workbook.formulaTrace.map((f: any) => <p key={f.citation}><strong>{f.citation}</strong><br /><code>{f.formula}</code></p>)}<p>{result.workbook.assumptions.constants}</p></details>}
        <details><summary>Calculation assumptions</summary><ul>{result.assumptions.map(a => <li key={a}>{a}</li>)}</ul><p>{result.version}</p></details>
      </div>}
      {!result && <p className="basis-summary">{form.species || 'PFAS'} · {form.flow || '—'} {form.flowUnit} · {form.totalEbctMinutes || '—'} min EBCT</p>}
      {proposal && <div className="research-actions"><button onClick={() => gacCommand('accept')}>Accept and apply</button><button onClick={() => gacCommand('reject')}>Reject</button></div>}
    </div>}
  </div>;
}
export function GacProgress() {
  const designs = useDesignStore(s => s.inputDesigns);
  const loadData = useDesignStore(s => s.loadData);
  const { proposal, accepted, graph } = useGacWorkflowStore();
  const stale = graph.nodes.some(n => n.attributes?.calculationState === 'stale');
  const stage = stale ? 2 : proposal ? 3 : accepted ? 5 : 1;
  return <div className="gac-progress"><div className="panel-title">Workflow</div><select aria-label="Input design" value="gac-workspace" onChange={e => loadData(e.target.value)}>{designs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select><ol>
    {['Inspect design', 'Confirm design basis', 'Calculate', 'Review change', 'Apply decision', 'Trace change'].map((label, index) => <li key={label} aria-current={index === stage ? 'step' : undefined}>{label}{index === stage ? ' ←' : index < stage ? ' ✓' : ''}</li>)}
  </ol></div>;
}
export function GacDecisionTrail() {
  const { history } = useGacWorkflowStore();
  return <div className="research-trail"><div className="panel-title">Log</div><div className="trail-entries">
    {history.length === 0 && <p>No decisions yet.</p>}
    {history.slice().reverse().map((event, index) => {
      const result = event.calculation || event.result;
      const description = event.action === 'User accepted GAC proposal' ? `${result.inputs.flow} ${result.inputs.flowUnit}, ${result.inputs.totalEbctMinutes} min → ${result.vesselCount} vessels × ${result.mediaPerVesselM3.toFixed(3)} m³ → user accepted → ${event.changedVesselIds.join(', ')}`
        : event.action === 'Calculate GAC proposal' ? `${result.inputs.flow} ${result.inputs.flowUnit}, ${result.inputs.totalEbctMinutes} min → ${result.totalMediaM3.toFixed(3)} m³ → proposed`
        : event.field ? `${event.field}: ${event.before} → ${event.after} → sizing requires review` : event.action;
      return <div className="trail-entry" key={`${event.timestamp}-${index}`}><p>{description}</p><details><summary>Evidence</summary><pre>{JSON.stringify(event, null, 2)}</pre></details></div>;
    })}
  </div></div>;
}
