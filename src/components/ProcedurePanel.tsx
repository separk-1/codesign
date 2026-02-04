import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ForceGraph2D, { type NodeObject, type LinkObject } from 'react-force-graph-2d';
import { useSimulationStore } from '../store/simulationStore';
import { useGraphData } from '../hooks/useGraphData';

// Extend NodeObject to include our custom properties
interface CustomNode extends NodeObject {
  id: string;
  name: string;
  type: string;
  value?: string;
  val?: number; // for particle size logic if needed
}

// Extend LinkObject for our custom properties
interface CustomLink extends LinkObject {
  source: string | CustomNode;
  target: string | CustomNode;
  label: string;
  class_num?: string; // Key for grouping related edges
}

// Simple CSV Parser
const parseCSV = (csv: string) => {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const row: any = {};
    headers.forEach((h, i) => row[h.trim()] = values[i]?.trim());
    return row;
  });
};

const parseProcedureCSV = (csv: string) => {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',');
    // Assuming headers include 'step' (or 'step_id') and 'description'
    const map = new Map<string, string>();
    lines.slice(1).forEach(line => {
        const values = line.split(',');
        const row: any = {};
        headers.forEach((h, i) => row[h.trim()] = values[i]?.trim());

        // Handle 'step' from prompt or fallback to 'step_id'
        const stepKey = row.step || row.step_id;

        if (stepKey && row.description) {
            // Map the raw ID from CSV (e.g. "pc_st_01_01" OR "1_1")
            map.set(stepKey, row.description.replace(/"/g, ''));
        }
    });
    return map;
};

// Helper to normalize graph node ID to match CSV format if needed
// Graph uses 'pc_st_01_01'. CSV might use '1_1' or 'pc_st_01_01'.
const getProcedureDescription = (nodeId: string, map: Map<string, string>) => {
    // 1. Try exact match
    if (map.has(nodeId)) return map.get(nodeId);

    // 2. Try normalizing 'pc_st_XX_YY' -> 'X_Y'
    const match = nodeId.match(/pc_st_(\d+)_(\d+)/);
    if (match) {
        const shortId = `${parseInt(match[1], 10)}_${parseInt(match[2], 10)}`;
        if (map.has(shortId)) return map.get(shortId);
    }

    return null;
};


// Color mapping based on node type
const getNodeColor = (type: string) => {
  if (type.startsWith('LER_')) return '#f87171'; // Red (Incident)
  switch (type) {
    case 'PC_ST': return '#3b82f6'; // Blue (Step)
    case 'PC_LO': return '#eab308'; // Yellow (Logic)
    case 'CT': return '#22c55e';    // Green (Controller)
    case 'IC': return '#06b6d4';    // Cyan (Indicator)
    default: return '#94a3b8';      // Slate (Feature/Other)
  }
};

export const ProcedurePanel = () => {
  const fgRef = useRef<any>(undefined);
  // const [graphData, setGraphData] = useState<{ nodes: CustomNode[], links: CustomLink[] }>({ nodes: [], links: [] });
  const [autoFocus, setAutoFocus] = useState(true);
  const [incidentView, setIncidentView] = useState(false);
  const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });

  // Tooltip & Highlight State
  const [hoverTooltip, setHoverTooltip] = useState<{ content: string; x: number; y: number } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<'TRUE' | 'FALSE' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const { activeStepId, setActiveStepId, stepHistory, goToPreviousStep } = useSimulationStore();
  const { entityCsv, relationshipCsv, procedureCsv, lerEntityCsv, lerRelationshipCsv, parentCsv, loading } = useGraphData();

  // Resize Observer to handle panel resizing
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        setContainerDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const procedureMap = useMemo(() => {
      if (!procedureCsv) return new Map<string, string>();
      return parseProcedureCSV(procedureCsv);
  }, [procedureCsv]);

  const graphData = useMemo(() => {
    if (loading || !entityCsv || !relationshipCsv) return { nodes: [], links: [] };

    let entities = parseCSV(entityCsv);
    let relationships = parseCSV(relationshipCsv);

    if (incidentView) {
         if (lerEntityCsv && lerRelationshipCsv) {
            const lerEntities = parseCSV(lerEntityCsv);
            const lerRelationships = parseCSV(lerRelationshipCsv);
            entities = [...entities, ...lerEntities];
            relationships = [...relationships, ...lerRelationships];
         }

         if (parentCsv) {
             const parentLinks = parseCSV(parentCsv).map((r: any) => ({
                 // Map parent.csv columns to standard link properties
                 src_id: r.parent_id,
                 dst_id: r.child_id,
                 edge_name: r.edge_name,
                 edge_type: r.edge_type,
                 class_num: undefined // parent links might not be part of highlight chains
             }));
             relationships = [...relationships, ...parentLinks];
         }
    }

    const nodes: CustomNode[] = entities.map((e: any) => ({
      id: e.entity_id,
      name: e.entity_name,
      type: e.entity_type,
      value: e.entity_value,
      val: 1
    }));

    const links: CustomLink[] = relationships.map((r: any) => ({
      source: r.src_id,
      target: r.dst_id,
      label: r.edge_name,
      class_num: r.class_num // Capture grouping key
    })).filter((l: any) => {
      // Filter dangling links
      return nodes.find(n => n.id === l.source) && nodes.find(n => n.id === l.target);
    });

    return { nodes, links };
  }, [entityCsv, relationshipCsv, lerEntityCsv, lerRelationshipCsv, parentCsv, loading, incidentView]);

  // Determine Highlighting Set (Memoized)
  const highlightSet = useMemo(() => {
      const set = new Set<string>();

      // Determine Source Node for Highlighting
      // Priority: Hovered Step Node > Active Step Node
      let sourceId: string | null = activeStepId;
      if (hoveredNodeId && hoveredNodeId.startsWith('pc_st_')) {
          sourceId = hoveredNodeId;
      }

      if (!sourceId) return set;
      set.add(sourceId);

      // Helper to safely get node ID
      const getId = (node: string | CustomNode) => typeof node === 'object' ? node.id : node;

      // Analyze Links from Source
      const sourceLinks = graphData.links.filter(l => getId(l.source) === sourceId);

      // 1. Check for 2-Hop Conditional Chain (Step -> Check -> Indicator -> Is -> Condition -> TRUE/FALSE)
      const checkLink = sourceLinks.find(l => l.label === 'check_if');
      if (checkLink) {
          const indicatorId = getId(checkLink.target);
          const indicatorLinks = graphData.links.filter(l => getId(l.source) === indicatorId);

          // Find 'is' edge from Indicator that MATCHES the class of the checkLink (to handle shared indicators)
          const isLink = indicatorLinks.find(l =>
              (l.label === 'is' || l.label === 'is_below' || l.label === 'is_over') &&
              (!checkLink.class_num || l.class_num === checkLink.class_num)
          );

          if (isLink) {
              const conditionId = getId(isLink.target);
              // Check if Condition Node has TRUE/FALSE edges
              const conditionLinks = graphData.links.filter(l => getId(l.source) === conditionId);
              const hasDecision = conditionLinks.some(l => l.label === 'TRUE' || l.label === 'FALSE');

              if (hasDecision) {
                  // Add Entire Chain to Highlight Set
                  set.add(indicatorId);
                  set.add(conditionId);
                  conditionLinks.forEach(l => set.add(getId(l.target)));
                  return set;
              }
          }
      }


      // 2. Fallback: Standard Verify Chain
      const verifyLink = sourceLinks.find(l => l.label === 'verify');
      // If verify exists, use it. Else try first non-next edge.
      const targetLink = verifyLink || sourceLinks.find(l => l.label !== 'next' && (l as any).type !== 'next');

      if (targetLink && targetLink.class_num) {
          const targetClass = targetLink.class_num;

          // Add all edges/nodes belonging to this class (Chain Highlight)
          // Excluding 'next' edges
          graphData.links.forEach(l => {
              if (l.class_num === targetClass && l.label !== 'next' && (l as any).type !== 'next') {
                  const sId = getId(l.source);
                  const tId = getId(l.target);

                  set.add(sId);
                  set.add(tId);
              }
          });
      }

      // 3. Incident Traversal (Only if incidentView is ON)
      if (incidentView) {
           // Find Parent Components for active Controls/Indicators
           // Direction: Component (Parent) -> Control (Child)
           // We look for links where target is in activeIds (is a Control) and source is a Component.
           const parentComponents = new Set<string>();
           const incidentQueue: string[] = [];

           graphData.links.forEach(l => {
               const sId = getId(l.source);
               const tId = getId(l.target);

               // Check if target is a Control/Indicator we are currently highlighting
               if (set.has(tId)) {
                   // Check if source is a component (mc_*, sy_*)
                   if (sId.startsWith('mc_') || sId.startsWith('sy_')) {
                        parentComponents.add(sId);
                        set.add(sId); // Add Component to highlight
                        incidentQueue.push(sId);
                   }
               }
           });

           // BFS to find connected LER nodes
           const visitedIncident = new Set<string>(incidentQueue);

           while (incidentQueue.length > 0) {
               const currId = incidentQueue.shift()!;

               // Find neighbors of currId that are LER nodes
               graphData.links.forEach(l => {
                   const sId = getId(l.source);
                   const tId = getId(l.target);

                   let nextId = null;
                   if (sId === currId) nextId = tId;
                   else if (tId === currId) nextId = sId;

                   if (nextId) {
                       if (nextId.startsWith('ler_')) {
                           if (!visitedIncident.has(nextId)) {
                               visitedIncident.add(nextId);
                               set.add(nextId);
                               incidentQueue.push(nextId);
                           }
                       }
                   }
               });
           }
      }

      return set;
  }, [activeStepId, hoveredNodeId, graphData, incidentView]);


  // Analyze Current Step Options (Memoized)
  const stepOptions = useMemo(() => {
      if (!activeStepId || graphData.links.length === 0) return { type: 'NONE' };

      // Helper to safely get target ID
      const getId = (node: string | CustomNode) => typeof node === 'object' ? node.id : node;
      const getTarget = (l?: CustomLink) => l ? getId(l.target) : undefined;

      // Find all outgoing links from activeStepId
      const links = graphData.links.filter(l => getId(l.source) === activeStepId);

      const verifyLink = links.find(l => l.label === 'verify');
      const trueLink = links.find(l => l.label === 'true_then' || l.label === 'TRUE');
      const falseLink = links.find(l => l.label === 'false_then' || l.label === 'FALSE');
      const nextLink = links.find(l => l.label === 'next' || l.label.startsWith('follow_next'));
      const genericLink = links.find(l => !['verify', 'true_then', 'false_then', 'if', 'check_if'].includes(l.label));

      // 1. Direct Decision (Check-If) - 1 Hop
      if (trueLink || falseLink) {
          return {
              type: 'DECISION',
              trueNode: getTarget(trueLink),
              falseNode: getTarget(falseLink)
          };
      }

      // 2. Indirect Decision (Step -> check_if -> Indicator -> is -> Condition -> TRUE/FALSE) - 2 Hops
      const checkLink = links.find(l => l.label === 'check_if');
      if (checkLink) {
          const indicatorId = getTarget(checkLink);
          const indicatorLinks = graphData.links.filter(l => getId(l.source) === indicatorId);

          // Must match class_num to ensure we follow the correct scenario logic for this step
          const isLink = indicatorLinks.find(l =>
              (l.label === 'is' || l.label === 'is_below' || l.label === 'is_over') &&
              (!checkLink.class_num || l.class_num === checkLink.class_num)
          );

          if (isLink) {
              const conditionId = getTarget(isLink);
              const conditionLinks = graphData.links.filter(l => getId(l.source) === conditionId);

              const cTrueLink = conditionLinks.find(l => l.label === 'TRUE');
              const cFalseLink = conditionLinks.find(l => l.label === 'FALSE');

              if (cTrueLink || cFalseLink) {
                  return {
                      type: 'DECISION',
                      trueNode: getTarget(cTrueLink),
                      falseNode: getTarget(cFalseLink)
                  };
              }
          }
      }

      // 3. Verify
      if (verifyLink) {
           return {
               type: 'VERIFY',
               nextNode: getTarget(nextLink), // Proceed to next step after verification
               verifyLink
           };
      }

      // 4. Standard Next
      if (nextLink || genericLink) {
          const link = nextLink || genericLink;
          return {
              type: 'STEP',
              nextNode: getTarget(link)
          };
      }

      return { type: 'END' };

  }, [activeStepId, graphData]);

  // Find Step Name
  const activeStepName = useMemo(() => {
      if (!activeStepId || graphData.nodes.length === 0) return null;
      const node = graphData.nodes.find(n => n.id === activeStepId);
      return node ? node.name : activeStepId;
  }, [activeStepId, graphData]);

  // Auto Focus Logic (Zoom to Highlighted Chain)
  useEffect(() => {
    if (!autoFocus || !activeStepId || !fgRef.current || highlightSet.size === 0) return;

    // Only auto-focus on active step logic, not on temporary hover
    if (hoveredNodeId) return;

    // Filter nodes that are in the highlight set
    const relevantNodes = graphData.nodes.filter(n => highlightSet.has(n.id));

    if (relevantNodes.length === 0) return;

    // Small delay to allow graph to settle
    const timer = setTimeout(() => {
        // If single node (or just step+neighbors), focus on step
        const stepNode = graphData.nodes.find(n => n.id === activeStepId);

        if (stepNode && stepNode.x !== undefined && stepNode.y !== undefined) {
             fgRef.current.centerAt(stepNode.x, stepNode.y, 1000);
             fgRef.current.zoom(3, 2000);
        } else {
             // Fallback
             fgRef.current.zoomToFit(1000, 100, (node: CustomNode) => highlightSet.has(node.id));
        }
    }, 200);

    return () => clearTimeout(timer);
  }, [activeStepId, autoFocus, highlightSet, graphData, hoveredNodeId]);


  const paintNode = useCallback((node: CustomNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isActive = node.id === activeStepId;
    const isHighlighted = highlightSet.has(node.id); // Active OR Neighbor/Chain
    const label = node.name;
    const fontSize = 12 / globalScale;

    // Opacity Logic
    const opacity = isHighlighted ? 1 : 0.2;
    ctx.globalAlpha = opacity;

    // 1. Draw Node
    if (isActive) {
      // Glow
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, 12, 0, 2 * Math.PI, false);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(node.x!, node.y!, 8, 0, 2 * Math.PI, false);
      ctx.fillStyle = '#fff';
      ctx.fill();
    } else {
        // Standard or Highlighted Neighbor
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, 5, 0, 2 * Math.PI, false);
        ctx.fillStyle = getNodeColor(node.type);
        ctx.fill();
    }

    // 2. Draw Label
    // Show label if Active OR Highlighted (Zoomed in) OR High Zoom
    if (isHighlighted || globalScale > 1.2) {
      ctx.font = `${fontSize}px Sans-Serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isActive ? '#fff' : `rgba(255, 255, 255, ${opacity})`;
      ctx.fillText(label, node.x!, node.y! + 8 + fontSize);
    }

    // Reset Opacity
    ctx.globalAlpha = 1;

  }, [activeStepId, highlightSet]);

  const paintLink = useCallback((link: CustomLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const start = link.source as CustomNode;
      const end = link.target as CustomNode;
      if (typeof start !== 'object' || typeof end !== 'object') return;

      const sourceId = start.id;
      const targetId = end.id;

      const isRelevant = highlightSet.has(sourceId) && highlightSet.has(targetId);

      let strokeStyle = '#475569';
      let lineWidth = 1 / globalScale;
      let opacity = 0.3; // Default visible (was 0.1)

      const isIncidentLink = incidentView && (
          start.type.startsWith('LER_') || end.type.startsWith('LER_')
      );

      if (isIncidentLink) {
          if (isRelevant) {
              // Highlighted Incident Link
              opacity = 1;
              strokeStyle = '#f87171';
              lineWidth = 2 / globalScale;
          } else {
              // Unconnected Incident Link (Dimmed but Red)
              opacity = 0.2;
              strokeStyle = '#f87171';
              lineWidth = 1 / globalScale;
          }
      } else if (isRelevant) {
          // Explicitly exclude 'next' edges from being highlighted even if endpoints are in highlightSet
          if (link.label === 'next') {
              // Reset to default dim style
              opacity = 0.3;
              strokeStyle = '#475569';
              lineWidth = 1 / globalScale;
          } else {
              opacity = 1;
              strokeStyle = '#eab308'; // Unify all active highlights to Yellow
              lineWidth = 2 / globalScale;

              // Dim non-selected paths if a path is highlighted via hover
              if (highlightedPath) {
                  if (link.label === 'TRUE' && highlightedPath !== 'TRUE') opacity = 0.1;
                  if (link.label === 'FALSE' && highlightedPath !== 'FALSE') opacity = 0.1;
              }

              // Bold selected path
              if (highlightedPath && link.label === highlightedPath) {
                  lineWidth = 4 / globalScale;
                  strokeStyle = '#fff';
              }
          }
      }

      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.moveTo(start.x!, start.y!);
      ctx.lineTo(end.x!, end.y!);
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;

      // Dashed line for TRUE/FALSE edges (Checking label)
      if (link.label === 'TRUE' || link.label === 'FALSE') {
          ctx.setLineDash([2, 2]);
      } else {
          ctx.setLineDash([]);
      }

      ctx.stroke();
      ctx.setLineDash([]); // Reset

      // Label
      if (link.label) {
          const midX = (start.x! + end.x!) / 2;
          const midY = (start.y! + end.y!) / 2;
          // Scale labels with zoom: fixed size in graph units (e.g., 4)
          // As globalScale increases (zoom in), the screen size (4 * globalScale) increases.
          const fontSize = 4;

          if (globalScale > 0.2) {
              ctx.font = `${fontSize}px Sans-Serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = (isRelevant || isIncidentLink) ? '#fff' : 'rgba(100, 116, 139, 0.5)';
              ctx.fillText(link.label, midX, midY);
          }
      }
      ctx.globalAlpha = 1;

  }, [highlightSet, highlightedPath, incidentView]);

  // Handle Node Hover for Tooltip & Highlight
  const handleNodeHover = useCallback((node: CustomNode | null) => {
      // 1. Set Highlight State
      setHoveredNodeId(node ? node.id : null);

      // 2. Tooltip Logic
      if (node && node.type === 'PC_ST') {
          const desc = getProcedureDescription(node.id, procedureMap);
          if (desc && fgRef.current) {
              // Get screen coordinates relative to the graph canvas
              // Note: we need to handle if x/y are undefined (rare but possible during init)
              if (node.x !== undefined && node.y !== undefined) {
                   const coords = fgRef.current.graph2ScreenCoords(node.x, node.y);
                   setHoverTooltip({
                       content: desc,
                       x: coords.x,
                       y: coords.y
                   });
                   return;
              }
          }
      }
      setHoverTooltip(null);
  }, [procedureMap]);

  return (
    <>
      <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span>PROCEDURES / KG</span>
            {activeStepName && (
                 <span style={{
                     fontSize: '0.7rem',
                     background: 'rgba(255, 255, 255, 0.1)',
                     padding: '2px 6px',
                     borderRadius: '4px',
                     border: '1px solid rgba(255, 255, 255, 0.2)',
                     color: '#eab308',
                     whiteSpace: 'nowrap',
                     maxWidth: '200px',
                     overflow: 'hidden',
                     textOverflow: 'ellipsis'
                 }} title={activeStepName}>
                     {activeStepName}
                 </span>
            )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
            <div
                onClick={() => setIncidentView(!incidentView)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                    opacity: 1, padding: '0 8px'
                }}
            >
                <span style={{ fontSize: '0.6rem', color: incidentView ? '#f87171' : '#94a3b8', fontWeight: 'bold' }}>INCIDENT VIEW</span>
                <div style={{
                    width: '24px', height: '12px', borderRadius: '6px',
                    backgroundColor: incidentView ? 'rgba(248, 113, 113, 0.3)' : '#334155',
                    position: 'relative', transition: 'background-color 0.2s',
                    border: '1px solid', borderColor: incidentView ? '#f87171' : '#475569'
                }}>
                    <div style={{
                        position: 'absolute', top: '1px', left: incidentView ? '13px' : '1px',
                        width: '8px', height: '8px', borderRadius: '50%',
                        backgroundColor: incidentView ? '#f87171' : '#94a3b8', transition: 'left 0.2s'
                    }}></div>
                </div>
            </div>
            <button
                className="dcs-btn"
                onClick={() => setAutoFocus(!autoFocus)}
                style={{ padding: '2px 8px', fontSize: '0.6rem', background: autoFocus ? 'var(--color-info)' : 'transparent' }}
            >
                AUTO-FOCUS: {autoFocus ? 'ON' : 'OFF'}
            </button>
            <span style={{ fontSize: '0.6rem' }}>{graphData.nodes.length} Nodes</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="panel-content"
        style={{ padding: 0, overflow: 'hidden', position: 'relative', background: '#0f172a' }}
      >
        <ForceGraph2D
          ref={fgRef}
          width={containerDimensions.width}
          height={containerDimensions.height}
          graphData={graphData}
          nodeCanvasObject={paintNode}
          linkCanvasObject={paintLink}
          linkCanvasObjectMode={() => 'replace'}
          nodeLabel={(node: CustomNode) => {
              // Only show default label for non-step nodes or values
              if (node.type !== 'PC_ST') {
                  if (node.value && node.value.toLowerCase() !== 'na') {
                      return node.value;
                  }
                  return node.name;
              }
              return ''; // Suppress default label for steps
          }}
          onNodeHover={handleNodeHover}
          // Physics Configuration
          d3VelocityDecay={0.2}
          cooldownTicks={100}
          onEngineStop={() => {
              // Initial focus
              if (autoFocus && activeStepId && highlightSet.size > 0 && fgRef.current) {
                 const stepNode = graphData.nodes.find(n => n.id === activeStepId);
                 if (stepNode && stepNode.x !== undefined) {
                     fgRef.current.centerAt(stepNode.x, stepNode.y, 1000);
                     fgRef.current.zoom(3, 2000);
                 }
              }
          }}
          // Customize Links
          linkColor={() => '#475569'}
          linkWidth={1}
          linkDirectionalParticles={1}
          linkDirectionalParticleWidth={2}
          onNodeDragEnd={node => {
            setAutoFocus(false);
            if (node.x && node.y) {
                node.fx = node.x;
                node.fy = node.y;
            }
          }}
        />

        {/* Custom Tooltip Overlay */}
        {hoverTooltip && (
            <div style={{
                position: 'absolute',
                top: hoverTooltip.y + 15, // Offset below cursor/node
                left: hoverTooltip.x + 15,
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid #3b82f6',
                padding: '8px 12px',
                borderRadius: '6px',
                color: '#e2e8f0',
                fontSize: '0.8rem',
                maxWidth: '250px',
                zIndex: 50,
                pointerEvents: 'none',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
                whiteSpace: 'normal',
                lineHeight: '1.4'
            }}>
                {hoverTooltip.content}
            </div>
        )}

        {/* Legend Overlay */}
        <div style={{ position: 'absolute', bottom: 60, left: 10, background: 'rgba(0,0,0,0.5)', padding: 5, borderRadius: 4, pointerEvents: 'none', zIndex: 10 }}>
            <LegendItem color="#3b82f6" label="Step" />
            <LegendItem color="#eab308" label="Logic" />
            <LegendItem color="#22c55e" label="Controller" />
            <LegendItem color="#06b6d4" label="Indicator" />
            <LegendItem color="#f87171" label="Incident" />
            <LegendItem color="#94a3b8" label="Feature" />
        </div>

        {/* Procedure Control Footer */}
        <div style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            left: 0,
            background: 'rgba(15, 23, 42, 0.9)',
            borderTop: '1px solid #334155',
            padding: '10px',
            display: 'flex',
            justifyContent: 'space-between', // Changed to space-between for Back button
            gap: '10px',
            zIndex: 20
        }}>
           {/* Back Button */}
           <div>
               {stepHistory.length > 0 && (
                   <button className="dcs-btn" onClick={goToPreviousStep} style={{ borderColor: '#64748b', color: '#94a3b8' }}>
                       PREVIOUS STEP
                   </button>
               )}
           </div>

           <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '0.8rem', marginRight: 10 }}>
                        {stepOptions.type === 'VERIFY' && "Wait for Verify..."}
                        {stepOptions.type === 'DECISION' && "Wait for Decision..."}
                        {stepOptions.type === 'STEP' && "Proceed..."}
                        {stepOptions.type === 'END' && "Procedure End"}
                </div>

                {stepOptions.type === 'VERIFY' && (
                    <button className="dcs-btn" style={{ borderColor: '#eab308', color: '#eab308' }} onClick={() => stepOptions.nextNode && setActiveStepId(stepOptions.nextNode)}>
                        CONFIRM CHECK
                    </button>
                )}

                {stepOptions.type === 'DECISION' && (
                    <>
                        <button
                            className="dcs-btn"
                            style={{ borderColor: '#22c55e', color: '#22c55e' }}
                            onClick={() => stepOptions.trueNode && setActiveStepId(stepOptions.trueNode)}
                            onMouseEnter={() => setHighlightedPath('TRUE')}
                            onMouseLeave={() => setHighlightedPath(null)}
                        >
                            TRUE
                        </button>
                        <button
                            className="dcs-btn"
                            style={{ borderColor: '#ef4444', color: '#ef4444' }}
                            onClick={() => stepOptions.falseNode && setActiveStepId(stepOptions.falseNode)}
                            onMouseEnter={() => setHighlightedPath('FALSE')}
                            onMouseLeave={() => setHighlightedPath(null)}
                        >
                            FALSE
                        </button>
                    </>
                )}

                {stepOptions.type === 'STEP' && (
                        <button className="dcs-btn" onClick={() => stepOptions.nextNode && setActiveStepId(stepOptions.nextNode)}>
                            NEXT STEP
                        </button>
                )}

                {stepOptions.type === 'END' && (
                     <button
                        className="dcs-btn"
                        style={{ borderColor: '#22c55e', color: '#22c55e' }}
                        onClick={() => useSimulationStore.setState({ simulationEnded: true })}
                     >
                        COMPLETE SCENARIO
                    </button>
                )}

                    {stepOptions.type === 'NONE' && (
                        <button className="dcs-btn" onClick={() => setActiveStepId('pc_st_01_01')}>
                            START PROCEDURE
                        </button>
                    )}
            </div>
        </div>
      </div>
    </>
  );
};

const LegendItem = ({ color, label }: { color: string, label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: '#cbd5e1' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }}></div>
        {label}
    </div>
);