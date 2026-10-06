import { nodeTooltipHtml } from '../utils/nodeTooltip';
import { useRef, useEffect, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useDesignStore } from '../store/designStore';

// Fit the data without enlarging small examples to fill the entire panel.
function fitSchematic(graph: any, width: number, height: number) {
    const bounds = graph?.getGraphBbox?.();
    if (!bounds || width <= 0 || height <= 0) return;
    const scale = Math.min(1.25,
        Math.max(1, width - 120) / Math.max(80, bounds.x[1] - bounds.x[0] + 40),
        Math.max(1, height - 120) / Math.max(80, bounds.y[1] - bounds.y[0] + 40));
    graph.centerAt((bounds.x[0] + bounds.x[1]) / 2, (bounds.y[0] + bounds.y[1]) / 2, 0);
    graph.zoom(scale, 0);
}

export const DisplayPanel = () => {
    const { conceptualGraph, detailedGraph, activeView, selectNode, selectedNode, decisionLog, candidate } = useDesignStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const conceptualForceGraphRef = useRef<any>(null);
    const labelBounds = useRef(new WeakMap<CanvasRenderingContext2D, { x: number; y: number; width: number; height: number }[]>());
    const updatedGraphRef = useRef<HTMLDivElement>(null);
    const updatedForceGraphRef = useRef<any>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [updatedGraphDimensions, setUpdatedGraphDimensions] = useState({ width: 520, height: 278 });

    // Deep copy data to avoid layout conflicts with GraphPanel
    const graphData = useMemo(() => {
        const sourceData = activeView === 'conceptual' ? conceptualGraph : detailedGraph;
        return {
            nodes: sourceData.nodes.map(n => ({ ...n })), // Shallow copy node objects to reset x/y/vx/vy if needed, or just break ref
            links: sourceData.links.map(l => ({ ...l }))
        };
    }, [conceptualGraph, detailedGraph, activeView]);

    useEffect(() => {
        if (activeView !== 'conceptual') return;
        const timer = window.setTimeout(() => fitSchematic(conceptualForceGraphRef.current, dimensions.width, dimensions.height), 400);
        return () => window.clearTimeout(timer);
    }, [activeView, graphData, dimensions.width, dimensions.height]);

    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        if (activeView !== 'detailed' || !updatedGraphRef.current) return;
        const updateDimensions = () => {
            if (!updatedGraphRef.current) return;
            const rect = updatedGraphRef.current.getBoundingClientRect();
            setUpdatedGraphDimensions({
                width: Math.max(320, Math.floor(rect.width)),
                height: Math.max(220, Math.floor(rect.height))
            });
        };
        updateDimensions();
        const resizeObserver = new ResizeObserver(updateDimensions);
        resizeObserver.observe(updatedGraphRef.current);
        return () => resizeObserver.disconnect();
    }, [activeView, detailedGraph.nodes.length, detailedGraph.links.length]);

    useEffect(() => {
        if (activeView !== 'detailed' || !updatedForceGraphRef.current || !graphData.nodes.length) return;
        const timer = window.setTimeout(() => {
            fitSchematic(updatedForceGraphRef.current, updatedGraphDimensions.width, updatedGraphDimensions.height);
        }, 650);
        return () => window.clearTimeout(timer);
    }, [activeView, graphData.nodes.length, graphData.links.length, updatedGraphDimensions.width, updatedGraphDimensions.height]);

    const decisionColor = (status?: string) => {
        if (status === 'high') return '#444';
        if (status === 'medium') return '#666';
        if (status === 'review') return '#888';
        return null;
    };

    const statusColor = candidate.status === 'Ready for Review' ? '#22c55e'
        : candidate.status === 'Blocked' ? '#ef4444'
        : candidate.status === 'Decision Log Only' ? '#94a3b8'
        : '#eab308';

    const paintNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const isSelected = node.id === selectedNode?.id;
        const statusColor = decisionColor(node.decisionStatus);
        const size = node.decisionStatus ? 13 : 10;

        // Box shape for schematic feel
        ctx.beginPath();
        if (node.type === 'Equipment' || node.type === 'Pump' || node.type === 'HeatExchanger') {
            ctx.rect(node.x - size, node.y - size, size * 2, size * 2);
            ctx.fillStyle = isSelected ? '#222' : (statusColor || '#888');
        } else if (node.type === 'Pipe') {
             ctx.rect(node.x - size/2, node.y - size/2, size, size);
             ctx.fillStyle = isSelected ? '#222' : (statusColor || '#888');
        } else {
             ctx.arc(node.x, node.y, size/1.5, 0, 2 * Math.PI, false);
             ctx.fillStyle = isSelected ? '#222' : (statusColor || '#888');
        }
        ctx.fill();
        ctx.strokeStyle = '#444';
        ctx.lineWidth = node.decisionStatus ? 2 : 1;
        ctx.stroke();

        if (node.reviewRequired) {
            ctx.font = `${Math.max(10 / globalScale, 4)}px Sans-Serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#222';
            ctx.fillText('!', node.x + size + 8, node.y - size - 4);
        }

        // Screen-sized wrapped labels with per-frame collision avoidance.
        const fontSize = 11 / globalScale;
        ctx.font = `${fontSize}px Arial`;
        const maxWidth = 100 / globalScale;
        const lines: string[] = [];
        for (const word of String(node.name || node.id).split(/\s+/)) {
            const last = lines.length - 1;
            if (last >= 0 && ctx.measureText(`${lines[last]} ${word}`).width <= maxWidth) lines[last] += ` ${word}`;
            else lines.push(word);
        }
        const visible = lines.slice(0, 3);
        if (lines.length > 3) visible[2] += '…';
        const width = Math.max(...visible.map(line => ctx.measureText(line).width)) + 6 / globalScale;
        const height = visible.length * fontSize * 1.3;
        const placed = labelBounds.current.get(ctx) || [];
        const intersects = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
            a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        for (let row = 0; row < 4; row++) {
            const box = { x: node.x - width / 2, y: node.y + size + 6 / globalScale + row * (height + 4 / globalScale), width, height };
            if (placed.some(other => intersects(box, other))) continue;
            if (graphData.nodes.some((other: any) => other.id !== node.id && Number.isFinite(other.x) && intersects(box, { x: other.x - 14, y: other.y - 14, width: 28, height: 28 }))) continue;
            placed.push(box); labelBounds.current.set(ctx, placed);
            ctx.fillStyle = '#fff'; ctx.fillRect(box.x, box.y, box.width, box.height);
            ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            visible.forEach((line, index) => ctx.fillText(line, node.x, box.y + index * fontSize * 1.3));
            break;
        }
    };


    const reviewEntries = decisionLog.filter(entry => entry.confidence === 'review').slice(0, 5);
    const equipmentCount = detailedGraph.nodes.filter((node: any) => ['Equipment', 'Pump', 'HeatExchanger'].includes(node.type)).length;
    const lineCount = detailedGraph.links.length;

    if (activeView === 'detailed') {
        const branchNodes = detailedGraph.nodes.filter((node: any) => node.generatedByDecision || node.attributes?.generatedByDecision);
        const baseProcessNodes = detailedGraph.nodes
            .filter((node: any) => !node.generatedByDecision && !node.attributes?.generatedByDecision && !['Nozzle', 'Reference'].includes(node.type))
            .slice(0, 5);
        const graphSteps = [
            ...baseProcessNodes.map((node: any) => ({
                id: node.id,
                tag: node.attributes?.tagName || node.attributes?.tag || node.name || node.id,
                label: node.name || node.type || 'Input P&ID object',
                detail: node.type || 'Input P&ID object',
                type: node.type,
                generated: false
            })),
            ...branchNodes.map((node: any) => ({
                id: node.id,
                tag: node.type || 'Decision',
                label: node.name || node.attributes?.decision || 'Decision branch',
                detail: node.attributes?.decisionTopic || node.attributes?.communicationPurpose || 'Generated from exchange',
                type: node.type,
                generated: true
            }))
        ];
        const flowSteps = graphSteps.length ? graphSteps : [
            { id: 'candidate-feed', tag: 'FEED', label: candidate.fluid, detail: `Material: ${candidate.material}`, type: 'Source', generated: true },
            { id: 'candidate-line', tag: candidate.lineSize, label: 'Main Process Line', detail: candidate.flowInstrument, type: 'LineSizing', generated: true },
            { id: 'candidate-pump', tag: 'P-101', label: candidate.pumpDuty, detail: candidate.pressureProtection, type: 'PumpDuty', generated: true },
            { id: 'candidate-treatment', tag: 'TREAT', label: candidate.treatment, detail: `Status: ${candidate.status}`, type: 'TreatmentTrain', generated: true }
        ];

        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#162033', color: '#e2e8f0', overflow: 'hidden' }}>
                <div className="panel-title" style={{ padding: '8px 10px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
                    <span>REVIEWABLE P&ID CANDIDATE</span>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>
                        generated after decision exchange · not final design approval
                    </span>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'grid', gap: 14, gridTemplateRows: 'auto auto 1fr' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                        <div style={{ border: '1px solid #334155', borderRadius: 6, padding: 10, background: '#0f172a' }}>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>DECISION EXCHANGES</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{decisionLog.length}</div>
                        </div>
                        <div style={{ border: '1px solid #334155', borderRadius: 6, padding: 10, background: '#0f172a' }}>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>GENERATED BRANCHES</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{branchNodes.length}</div>
                        </div>
                        <div style={{ border: '1px solid #334155', borderRadius: 6, padding: 10, background: '#0f172a' }}>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>REVIEW ITEMS</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: statusColor }}>{candidate.reviewItems.length}</div>
                        </div>
                    </div>

                    <div style={{ padding: '4px 0' }}>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>INPUT GRAPH + DECISION BRANCHES</div>
                        <div className="candidate-flow" style={{ display: 'grid', gridTemplateColumns: `repeat(${flowSteps.length}, minmax(130px, 1fr))`, gap: 10 }}>
                            {flowSteps.map((step, index) => (
                                <button
                                    key={step.id || step.tag}
                                    onClick={() => selectNode(detailedGraph.nodes.find((node: any) => node.id === step.id) || detailedGraph.nodes[index] || null)}
                                    style={{
                                        border: `1px solid ${step.generated ? '#38bdf8' : '#334155'}`,
                                        borderRadius: 6,
                                        background: step.generated ? 'rgba(14,116,144,0.22)' : '#0f172a',
                                        color: '#e2e8f0',
                                        textAlign: 'left',
                                        padding: 11,
                                        minHeight: 104,
                                        cursor: 'pointer',
                                        position: 'relative'
                                    }}
                                >
                                    <div style={{ fontSize: '0.68rem', color: step.generated ? '#38bdf8' : '#94a3b8', fontWeight: 700 }}>{step.tag}</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: 5 }}>{step.label}</div>
                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.35, marginTop: 7 }}>{step.detail}</div>
                                    {index < flowSteps.length - 1 && (
                                        <div style={{ position: 'absolute', right: -9, top: '44%', color: '#64748b', fontWeight: 700 }}>→</div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="candidate-detail" style={{ minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(240px, 0.75fr)', gap: 12 }}>
                        <div style={{ minHeight: 260, border: '1px solid #334155', borderRadius: 6, overflow: 'hidden', background: '#1e293b' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, padding: '8px 10px', borderBottom: '1px solid #334155', background: '#0f172a' }}>UPDATED P&ID GRAPH</div>
                            <div ref={updatedGraphRef} style={{ height: 252, minHeight: 0, overflow: 'hidden' }}>
                                <ForceGraph2D
                                    ref={updatedForceGraphRef}
                                    width={updatedGraphDimensions.width}
                                    height={updatedGraphDimensions.height}
                                    graphData={graphData}
                                    dagMode="lr"
                                    dagLevelDistance={34}
                                    cooldownTicks={80}
                                    warmupTicks={30}
                                    onEngineStop={() => fitSchematic(updatedForceGraphRef.current, updatedGraphDimensions.width, updatedGraphDimensions.height)}
                                    backgroundColor="#ffffff"
                                    nodeCanvasObject={paintNode}
                                    nodeLabel={nodeTooltipHtml}
                                    onRenderFramePre={(ctx) => labelBounds.current.set(ctx, [])}
                                    linkColor={(link: any) => decisionColor(link.decisionStatus) || '#64748b'}
                                    linkWidth={(link: any) => link.decisionStatus || link.generatedByDecision ? 2.5 : 1}
                                    linkDirectionalParticles={0}
                                    linkDirectionalParticleWidth={(link: any) => link.decisionStatus ? 3 : 2}
                                    onNodeClick={selectNode}
                                />
                            </div>
                        </div>

                        <div style={{ minHeight: 0 }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>HUMAN REVIEW QUEUE</div>
                            <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                                {(candidate.reviewItems.length ? candidate.reviewItems : ['No review items recorded yet.']).map((item, index) => (
                                    <div key={`${item}-${index}`} style={{ border: '1px solid #475569', borderRadius: 6, background: '#111827', padding: 10 }}>
                                        <div style={{ color: candidate.reviewItems.length ? '#fde047' : '#94a3b8', fontSize: '0.72rem', fontWeight: 700, marginBottom: 6 }}>
                                            {candidate.reviewItems.length ? `REVIEW ${index + 1}` : 'REVIEW QUEUE'}
                                        </div>
                                        <div style={{ color: '#cbd5e1', fontSize: '0.72rem', lineHeight: 1.35 }}>{item}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="panel-title" style={{ padding: '5px 10px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
                <span>Process graph</span>
            </div>
            <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', background: '#1e293b' }}>
                <ForceGraph2D
                    ref={conceptualForceGraphRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={graphData}
                    dagMode="lr"
                    dagLevelDistance={50}
                    cooldownTicks={80}
                    warmupTicks={30}
                    onEngineStop={() => fitSchematic(conceptualForceGraphRef.current, dimensions.width, dimensions.height)}
                    backgroundColor="#ffffff"
                    nodeCanvasObject={paintNode}
                    nodeLabel={nodeTooltipHtml}
                    onRenderFramePre={(ctx) => labelBounds.current.set(ctx, [])}
                    linkColor={(link: any) => decisionColor(link.decisionStatus) || '#64748b'}
                    linkWidth={(link: any) => link.decisionStatus ? 2.5 : 1}
                    linkDirectionalParticles={0}
                    linkDirectionalParticleWidth={(link: any) => link.decisionStatus ? 3 : 2}
                    onNodeClick={selectNode}
                />
            </div>
        </div>
    );
};
