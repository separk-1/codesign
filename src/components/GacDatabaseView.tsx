import { useGacWorkflowStore } from '../store/gacWorkflowStore';
import { useDesignStore } from '../store/designStore';
export function GacDatabaseView() {
  const consultation = useGacWorkflowStore(s => s.consultation);
  const selectNode = useDesignStore(s => s.selectNode);
  const graph = consultation?.knowledgeGraph;
  if (!graph) return <p>Loading workbook knowledge…</p>;
  const rows = graph.nodes.filter((n: any) => n.type === 'Observation');
  const source = graph.nodes.find((n: any) => n.type === 'Workbook');
  const basis = graph.nodes.find((n: any) => n.type === 'DesignRequirement');
  return <div className="database-content">
    <div className="knowledge-chain"><button title={JSON.stringify(source.attributes, null, 2)} onClick={() => selectNode(source)}>Excel workbook</button><span>→ contains observations →</span><strong>{consultation.evidence[0]?.species || 'PFAS'}</strong></div>
    <table className="change-table"><thead><tr><th>Observation / source</th><th>Total EBCT</th><th>Series</th><th>Influent</th><th>Basis link</th></tr></thead><tbody>{rows.map((n: any) => <tr key={n.id}><td><button title={JSON.stringify(n.attributes, null, 2)} onClick={() => selectNode(n)}>{n.attributes.site}</button><div>{n.attributes.citation}</div></td><td>{n.attributes.totalEbctMinutes} min</td><td>{n.attributes.series}</td><td>{n.attributes.influentRaw} ng/L</td><td>{graph.links.find((l: any) => l.source === n.id && l.target === 'design-ebct')?.label}</td></tr>)}</tbody></table>
    <div className="knowledge-chain"><span>Observation → design basis → vessel sizing</span><button title={JSON.stringify(basis.attributes, null, 2)} onClick={() => selectNode(basis)}>{basis.name}</button>{graph.nodes.filter((n: any) => n.type === 'DesignVessel').map((n: any) => <button key={n.id} title={JSON.stringify(n.attributes, null, 2)} onClick={() => selectNode(n)}>{n.name}</button>)}</div>
    <details><summary>Graph relationships</summary>{graph.links.map((l: any, i: number) => <p key={i}>{l.source} → {l.label} → {l.target}</p>)}</details>
    <details><summary>Workbook guidance</summary>{consultation.guidance.map((g: any, i: number) => <pre key={i}>{JSON.stringify(g, null, 2)}</pre>)}</details>
  </div>;
}
