import { useRef, useEffect, useMemo, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useDesignStore } from '../store/designStore';

export const GraphPanel = () => {
    const {
        conceptualGraph,
        detailedGraph,
        activeView,
        selectNode,
        selectedNode
    } = useDesignStore();

    const fgRef = useRef<any>();
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    const graphData = activeView === 'conceptual' ? conceptualGraph : detailedGraph;

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

    // Helper for coloring
    const getNodeColor = (node: any) => {
        if (node.id === selectedNode?.id) return '#ef4444'; // Red for selected
        switch(node.type) {
            case 'Equipment': return '#3b82f6'; // Blue
            case 'Nozzle': return '#eab308';    // Yellow
            case 'Pipe': return '#22c55e';      // Green
            case 'Source': return '#a855f7';    // Purple
            case 'Sink': return '#f97316';      // Orange
            default: return '#94a3b8';
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="panel-title" style={{ padding: '5px 10px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
                KNOWLEDGE GRAPH ({activeView.toUpperCase()})
                <span style={{ fontSize: '0.7em', marginLeft: 10, color: '#94a3b8' }}>
                    {graphData.nodes.length} Nodes
                </span>
            </div>
            <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', background: '#0f172a' }}>
                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={graphData}
                    nodeColor={getNodeColor}
                    nodeLabel="name"
                    onNodeClick={(node) => {
                        selectNode(node);
                        // Optional: Center on node
                        fgRef.current?.centerAt(node.x, node.y, 1000);
                        fgRef.current?.zoom(4, 2000);
                    }}
                    linkDirectionalParticles={2}
                    linkDirectionalParticleWidth={2}
                    backgroundColor="#0f172a"
                />
            </div>
        </div>
    );
};
