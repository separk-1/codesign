import { useRef, useEffect, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useDesignStore } from '../store/designStore';

export const DisplayPanel = () => {
    const { conceptualGraph, detailedGraph, activeView, selectNode, selectedNode } = useDesignStore();
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="panel-title" style={{ padding: '5px 10px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
                <span>DESIGN SCHEMATIC (DAG VIEW)</span>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>
                    green = confirmed · yellow = review needed
                </span>
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
