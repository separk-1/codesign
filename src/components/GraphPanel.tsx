import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useDesignStore } from '../store/designStore';

// ── Color constants ──────────────────────────────────────────────
const COLORS: Record<string, string> = {
    Equipment: '#3b82f6',      // Blue
    Nozzle: '#eab308',         // Yellow
    Pipe: '#22c55e',           // Green
    Source: '#a855f7',         // Purple
    Sink: '#f97316',           // Orange
    Pump: '#06b6d4',           // Cyan
    HeatExchanger: '#ec4899',  // Pink
};
const DEFAULT_COLOR = '#94a3b8';

const LEGEND_ITEMS: { type: string; label: string; shape: string }[] = [
    { type: 'Equipment', label: 'Equipment', shape: 'rect' },
    { type: 'Pump', label: 'Pump', shape: 'rect' },
    { type: 'HeatExchanger', label: 'Heat Exchanger', shape: 'rect' },
    { type: 'Pipe', label: 'Pipe', shape: 'diamond' },
    { type: 'Nozzle', label: 'Nozzle', shape: 'circle' },
    { type: 'Source', label: 'Source', shape: 'triangleRight' },
    { type: 'Sink', label: 'Sink', shape: 'triangleLeft' },
];

// ── Legend shape renderer (SVG-like mini canvas) ─────────────────
const LegendItem = ({ color, label, shape }: { color: string; label: string; shape: string }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const w = 20, h = 16;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;

        const cx = w / 2, cy = h / 2;
        switch (shape) {
            case 'rect':
                ctx.beginPath();
                ctx.roundRect(cx - 7, cy - 5, 14, 10, 2);
                ctx.fill();
                break;
            case 'diamond': {
                const s = 6;
                ctx.beginPath();
                ctx.moveTo(cx, cy - s);
                ctx.lineTo(cx + s, cy);
                ctx.lineTo(cx, cy + s);
                ctx.lineTo(cx - s, cy);
                ctx.closePath();
                ctx.fill();
                break;
            }
            case 'circle':
                ctx.beginPath();
                ctx.arc(cx, cy, 5, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'triangleRight': {
                const s = 6;
                ctx.beginPath();
                ctx.moveTo(cx - s, cy - s);
                ctx.lineTo(cx + s, cy);
                ctx.lineTo(cx - s, cy + s);
                ctx.closePath();
                ctx.fill();
                break;
            }
            case 'triangleLeft': {
                const s = 6;
                ctx.beginPath();
                ctx.moveTo(cx + s, cy - s);
                ctx.lineTo(cx - s, cy);
                ctx.lineTo(cx + s, cy + s);
                ctx.closePath();
                ctx.fill();
                break;
            }
        }
    }, [color, shape]);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
            <canvas ref={canvasRef} width={20} height={16} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>{label}</span>
        </div>
    );
};

// ═════════════════════════════════════════════════════════════════
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
    const hasInitialFit = useRef(false);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [showHints, setShowHints] = useState(true);
    const [hintsOpacity, setHintsOpacity] = useState(1);

    const graphData = activeView === 'conceptual' ? conceptualGraph : detailedGraph;

    // ── Resize observer ──────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // ── Zoom-to-fit on graph data change ─────────────────────────
    useEffect(() => {
        hasInitialFit.current = false;
        // Multiple attempts to ensure reliability
        const t1 = setTimeout(() => fgRef.current?.zoomToFit(400, 60), 200);
        const t2 = setTimeout(() => fgRef.current?.zoomToFit(400, 60), 600);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [graphData]);

    // ── Selection sync across view switches ──────────────────────
    useEffect(() => {
        if (!selectedNode || !fgRef.current) return;
        const exists = graphData.nodes.some((n: any) => n.id === selectedNode.id);
        if (exists) {
            setTimeout(() => {
                fgRef.current?.centerAt(selectedNode.x, selectedNode.y, 600);
            }, 400);
        }
    }, [activeView]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── onEngineStop: zoom-to-fit once on initial settle ─────────
    const onEngineStop = useCallback(() => {
        if (!hasInitialFit.current) {
            hasInitialFit.current = true;
            fgRef.current?.zoomToFit(400, 60);
        }
    }, []);

    // ── Interaction hints auto-dismiss ───────────────────────────
    useEffect(() => {
        const fadeTimer = setTimeout(() => {
            setHintsOpacity(0);
        }, 5000);
        const hideTimer = setTimeout(() => {
            setShowHints(false);
        }, 6000);
        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(hideTimer);
        };
    }, []);

    // ── Active node types for legend ─────────────────────────────
    const activeTypes = useMemo(() => {
        const types = new Set(graphData.nodes.map((n: any) => n.type as string));
        return types;
    }, [graphData]);

    // ── Custom node painter ──────────────────────────────────────
    const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const isSelected = selectedNode?.id === node.id;
        const color = COLORS[node.type] || DEFAULT_COLOR;
        const size = 6;
        const x = node.x as number;
        const y = node.y as number;

        // Selection glow
        if (isSelected) {
            ctx.beginPath();
            ctx.arc(x, y, size + 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
            ctx.fill();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2 / globalScale;
            ctx.stroke();
        }

        ctx.fillStyle = color;
        ctx.strokeStyle = isSelected ? '#ef4444' : color;
        ctx.lineWidth = 1.2 / globalScale;

        switch (node.type) {
            case 'Equipment':
            case 'Pump':
            case 'HeatExchanger': {
                const w = size * 2.6, h = size * 1.8;
                ctx.beginPath();
                ctx.roundRect(x - w / 2, y - h / 2, w, h, 2);
                ctx.fill();
                if (isSelected) ctx.stroke();
                break;
            }
            case 'Pipe': {
                ctx.beginPath();
                ctx.moveTo(x, y - size);
                ctx.lineTo(x + size, y);
                ctx.lineTo(x, y + size);
                ctx.lineTo(x - size, y);
                ctx.closePath();
                ctx.fill();
                if (isSelected) ctx.stroke();
                break;
            }
            case 'Nozzle': {
                ctx.beginPath();
                ctx.arc(x, y, size * 0.55, 0, Math.PI * 2);
                ctx.fill();
                if (isSelected) ctx.stroke();
                break;
            }
            case 'Source': {
                ctx.beginPath();
                ctx.moveTo(x - size, y - size);
                ctx.lineTo(x + size, y);
                ctx.lineTo(x - size, y + size);
                ctx.closePath();
                ctx.fill();
                if (isSelected) ctx.stroke();
                break;
            }
            case 'Sink': {
                ctx.beginPath();
                ctx.moveTo(x + size, y - size);
                ctx.lineTo(x - size, y);
                ctx.lineTo(x + size, y + size);
                ctx.closePath();
                ctx.fill();
                if (isSelected) ctx.stroke();
                break;
            }
            default: {
                ctx.beginPath();
                ctx.arc(x, y, size * 0.8, 0, Math.PI * 2);
                ctx.fill();
                if (isSelected) ctx.stroke();
                break;
            }
        }

        // ── Label ────────────────────────────────────────────────
        if (globalScale > 0.5 || isSelected) {
            const label = node.name || node.id;
            const fontSize = Math.max(12 / globalScale, 2.5);
            ctx.font = `600 ${fontSize}px sans-serif`;
            const textWidth = ctx.measureText(label).width;
            const labelY = y + size + fontSize * 0.35 + 3;

            // Background pill
            const padX = fontSize * 0.35;
            const padY = fontSize * 0.2;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
            ctx.beginPath();
            ctx.roundRect(
                x - textWidth / 2 - padX,
                labelY - fontSize * 0.8 - padY,
                textWidth + padX * 2,
                fontSize + padY * 2,
                2
            );
            ctx.fill();

            ctx.fillStyle = '#e2e8f0';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x, labelY);
        }
    }, [selectedNode]);

    // ── Custom link painter ──────────────────────────────────────
    const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const source = link.source;
        const target = link.target;
        if (!source || !target || typeof source.x !== 'number' || typeof target.x !== 'number') return;

        const isConnectedToSelected = selectedNode &&
            (source.id === selectedNode.id || target.id === selectedNode.id);

        // Line — thicker and more visible
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = isConnectedToSelected
            ? 'rgba(239, 68, 68, 0.7)'
            : 'rgba(148, 163, 184, 0.55)';
        ctx.lineWidth = isConnectedToSelected
            ? 2.5 / globalScale
            : 1.5 / globalScale;
        ctx.stroke();

        // Edge label
        if (link.label && globalScale > 0.8) {
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            const fontSize = Math.max(10 / globalScale, 2);
            ctx.font = `${fontSize}px sans-serif`;
            const textWidth = ctx.measureText(link.label).width;

            const padX = fontSize * 0.35;
            const padY = fontSize * 0.2;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.beginPath();
            ctx.roundRect(
                midX - textWidth / 2 - padX,
                midY - fontSize * 0.5 - padY,
                textWidth + padX * 2,
                fontSize + padY * 2,
                2
            );
            ctx.fill();

            ctx.fillStyle = '#cbd5e1';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(link.label, midX, midY);
        }
    }, [selectedNode]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="panel-title" style={{ padding: '5px 10px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
                KNOWLEDGE GRAPH ({activeView.toUpperCase()})
                <span style={{ fontSize: '0.8em', marginLeft: 10, color: '#94a3b8' }}>
                    {graphData.nodes.length} Nodes
                </span>
            </div>
            <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', background: '#0f172a', position: 'relative' }}>
                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={graphData}
                    nodeCanvasObject={paintNode}
                    linkCanvasObject={paintLink}
                    onNodeClick={(node) => {
                        selectNode(node);
                        fgRef.current?.centerAt(node.x, node.y, 1000);
                        fgRef.current?.zoom(4, 2000);
                    }}
                    linkDirectionalParticles={2}
                    linkDirectionalParticleWidth={3}
                    onEngineStop={onEngineStop}
                    minZoom={0.5}
                    maxZoom={12}
                    backgroundColor="#0f172a"
                />

                {/* ── Legend overlay ─────────────────────────────── */}
                <div style={{
                    position: 'absolute',
                    bottom: 10,
                    left: 10,
                    background: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid rgba(51, 65, 85, 0.5)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    pointerEvents: 'none',
                }}>
                    {LEGEND_ITEMS
                        .filter(item => activeTypes.has(item.type))
                        .map(item => (
                            <LegendItem
                                key={item.type}
                                color={COLORS[item.type] || DEFAULT_COLOR}
                                label={item.label}
                                shape={item.shape}
                            />
                        ))
                    }
                </div>

                {/* ── Interaction hints overlay ──────────────────── */}
                {showHints && (
                    <div style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid rgba(51, 65, 85, 0.5)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        pointerEvents: 'none',
                        opacity: hintsOpacity,
                        transition: 'opacity 1s ease-out',
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        lineHeight: 1.7,
                    }}>
                        <div>Scroll to zoom</div>
                        <div>Drag to pan</div>
                        <div>Click node to select</div>
                        <div>Drag node to reposition</div>
                    </div>
                )}
            </div>
        </div>
    );
};
