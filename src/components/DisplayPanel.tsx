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

    const paintNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const isSelected = node.id === selectedNode?.id;
        const size = 10;

        // Box shape for schematic feel
        ctx.beginPath();
        if (node.type === 'Equipment') {
            ctx.rect(node.x - size, node.y - size, size * 2, size * 2);
            ctx.fillStyle = isSelected ? '#ef4444' : '#3b82f6';
        } else if (node.type === 'Pipe') {
             ctx.rect(node.x - size/2, node.y - size/2, size, size);
             ctx.fillStyle = isSelected ? '#ef4444' : '#22c55e';
        } else {
             ctx.arc(node.x, node.y, size/1.5, 0, 2 * Math.PI, false);
             ctx.fillStyle = isSelected ? '#ef4444' : '#94a3b8';
        }
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.stroke();

        // Label
        const label = node.name;
        if (globalScale > 0.8) {
            ctx.font = '4px Sans-Serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#fff';
            ctx.fillText(label, node.x, node.y + size + 2);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="panel-title" style={{ padding: '5px 10px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
                DESIGN SCHEMATIC (DAG VIEW)
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
                    linkDirectionalParticles={2}
                    linkDirectionalParticleWidth={2}
                    onNodeClick={selectNode}
                />
            </div>
        </div>
    );
};
