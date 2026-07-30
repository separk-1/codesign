import { useRef, useEffect, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useDesignStore } from '../store/designStore';

export const DisplayPanel = () => {
    const { conceptualGraph, detailedGraph, activeView, selectNode, selectedNode, decisionLog, candidate } = useDesignStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    // Deep copy data to avoid layout conflicts with GraphPanel
    const graphData = useMemo(() => {
        const sourceData = activeView === 'conceptual' ? conceptualGraph : detailedGraph;
        return {
            nodes: sourceData.nodes.map(n => ({ ...n })), // Shallow copy node objects to reset x/y/vx/vy if needed, or just break ref
            links: sourceData.links.map(l => ({ ...l }))
        };
    }, [conceptualGraph, detailedGraph, activeView]);

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

    const decisionColor = (status?: string) => {
        if (status === 'high') return '#22c55e';
        if (status === 'medium') return '#3b82f6';
        if (status === 'review') return '#eab308';
        return null;
    };

    const statusColor = candidate.status === 'Ready for Review' ? '#22c55e'
        : candidate.status === 'Blocked' ? '#ef4444'
        : candidate.status === 'Decision Log Only' ? '#94a3b8'
        : '#eab308';

    const candidateCards = [
        { label: 'Fluid / Material', value: candidate.fluid, detail: candidate.material, topic: 'process fluid' },
        { label: 'Line / Flow', value: candidate.lineSize, detail: candidate.flowInstrument, topic: 'flow rate' },
        { label: 'Pump / Pressure', value: candidate.pumpDuty, detail: candidate.pressureProtection, topic: 'pressure duty' },
        { label: 'Treatment / HX', value: candidate.treatment, detail: candidate.heatExchanger, topic: 'treatment configuration' },
        { label: 'Candidate Status', value: candidate.status, detail: `${candidate.reviewItems.length} review item${candidate.reviewItems.length === 1 ? '' : 's'}`, topic: 'review gate' }
    ];

    const paintNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const isSelected = node.id === selectedNode?.id;
        const statusColor = decisionColor(node.decisionStatus);
        const size = node.decisionStatus ? 13 : 10;

        if (node.decisionStatus) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 8, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.reviewRequired ? 'rgba(234,179,8,0.18)' : 'rgba(34,197,94,0.14)';
            ctx.fill();
        }

        // Box shape for schematic feel
        ctx.beginPath();
        if (node.type === 'Equipment' || node.type === 'Pump' || node.type === 'HeatExchanger') {
            ctx.rect(node.x - size, node.y - size, size * 2, size * 2);
            ctx.fillStyle = isSelected ? '#ef4444' : (statusColor || '#3b82f6');
        } else if (node.type === 'Pipe') {
             ctx.rect(node.x - size/2, node.y - size/2, size, size);
             ctx.fillStyle = isSelected ? '#ef4444' : (statusColor || '#22c55e');
        } else {
             ctx.arc(node.x, node.y, size/1.5, 0, 2 * Math.PI, false);
             ctx.fillStyle = isSelected ? '#ef4444' : (statusColor || '#94a3b8');
        }
        ctx.fill();
        ctx.strokeStyle = node.reviewRequired ? '#facc15' : '#fff';
        ctx.lineWidth = node.decisionStatus ? 2 : 1;
        ctx.stroke();

        if (node.reviewRequired) {
            ctx.font = `${Math.max(10 / globalScale, 4)}px Sans-Serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#facc15';
            ctx.fillText('!', node.x + size + 8, node.y - size - 4);
        }

        // Label
        const label = node.name;
        if (globalScale > 0.8 || node.decisionStatus) {
            ctx.font = '5px Sans-Serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#fff';
            ctx.fillText(label, node.x, node.y + size + 2);
        }
    };


    const reviewEntries = decisionLog.filter(entry => entry.confidence === 'review').slice(0, 5);
    const equipmentCount = detailedGraph.nodes.filter((node: any) => ['Equipment', 'Pump', 'HeatExchanger'].includes(node.type)).length;
    const lineCount = detailedGraph.links.length;

    if (activeView === 'detailed') {
        const includeHx = candidate.heatExchanger !== 'No heat exchanger';
        const flowSteps = [
            { tag: 'FEED', label: candidate.fluid, detail: `Material: ${candidate.material}` },
            { tag: candidate.lineSize, label: 'Main Process Line', detail: candidate.flowInstrument },
            { tag: 'P-101', label: candidate.pumpDuty, detail: candidate.pressureProtection },
            ...(includeHx ? [{ tag: 'E-101', label: candidate.heatExchanger, detail: candidate.bypass }] : []),
            { tag: 'TREAT', label: candidate.treatment, detail: `Status: ${candidate.status}` }
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
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>GENERATED OBJECTS</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{equipmentCount || detailedGraph.nodes.length}</div>
                        </div>
                        <div style={{ border: '1px solid #334155', borderRadius: 6, padding: 10, background: '#0f172a' }}>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>REVIEW ITEMS</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: statusColor }}>{candidate.reviewItems.length}</div>
                        </div>
                    </div>

                    <div style={{ padding: '4px 0' }}>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>CANDIDATE FLOW</div>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${flowSteps.length}, minmax(130px, 1fr))`, gap: 10 }}>
                            {flowSteps.map((step, index) => (
                                <button
                                    key={step.tag}
                                    onClick={() => selectNode(detailedGraph.nodes[index] || null)}
                                    style={{
                                        border: '1px solid #334155',
                                        borderRadius: 6,
                                        background: '#0f172a',
                                        color: '#e2e8f0',
                                        textAlign: 'left',
                                        padding: 11,
                                        minHeight: 104,
                                        cursor: 'pointer',
                                        position: 'relative'
                                    }}
                                >
                                    <div style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 700 }}>{step.tag}</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: 5 }}>{step.label}</div>
                                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.35, marginTop: 7 }}>{step.detail}</div>
                                    {index < flowSteps.length - 1 && (
                                        <div style={{ position: 'absolute', right: -9, top: '44%', color: '#64748b', fontWeight: 700 }}>→</div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ minHeight: 0 }}>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>HUMAN REVIEW QUEUE</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
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
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="panel-title" style={{ padding: '5px 10px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
                <span>DESIGN SCHEMATIC (DAG VIEW)</span>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>
                    green = confirmed · yellow = review needed
                </span>
            </div>
            <div style={{ flex: '0 0 auto', padding: '10px', borderBottom: '1px solid #334155', background: '#162033' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>LIVE P&ID CANDIDATE</div>
                    <div style={{ fontSize: '0.68rem', color: statusColor, fontWeight: 700 }}>{candidate.status}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
                    {candidateCards.map(card => {
                        const active = candidate.updatedTopics.includes(card.topic);
                        return (
                            <div key={card.label} style={{
                                border: `1px solid ${active ? '#38bdf8' : '#334155'}`,
                                borderRadius: 6,
                                background: active ? 'rgba(14,116,144,0.22)' : '#0f172a',
                                padding: 8,
                                minHeight: 68
                            }}>
                                <div style={{ color: '#94a3b8', fontSize: '0.62rem', fontWeight: 700 }}>{card.label}</div>
                                <div style={{ color: active ? '#e0f2fe' : '#e2e8f0', fontSize: '0.78rem', fontWeight: 700, marginTop: 5, lineHeight: 1.2 }}>{card.value}</div>
                                <div style={{ color: '#64748b', fontSize: '0.64rem', marginTop: 4, lineHeight: 1.25 }}>{card.detail}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', background: '#1e293b' }}>
                <ForceGraph2D
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={graphData}
                    dagMode="lr"
                    dagLevelDistance={50}
                    backgroundColor="#1e293b"
                    nodeCanvasObject={paintNode}
                    linkColor={(link: any) => decisionColor(link.decisionStatus) || '#64748b'}
                    linkWidth={(link: any) => link.decisionStatus ? 2.5 : 1}
                    linkDirectionalParticles={2}
                    linkDirectionalParticleWidth={(link: any) => link.decisionStatus ? 3 : 2}
                    onNodeClick={selectNode}
                />
            </div>
        </div>
    );
};
