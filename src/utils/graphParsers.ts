export const parseConceptualJson = (data: any) => {
  return {
    nodes: data.nodes || [],
    links: data.links || []
  };
};

export const parseDexpiJson = (data: any) => {
  const nodes: any[] = [];
  const links: any[] = [];
  const nodeIds = new Set<string>();

  // Helper to add node if unique
  const addNode = (n: any) => {
     if (!nodeIds.has(n.id)) {
         nodes.push(n);
         nodeIds.add(n.id);
     }
  }

  // Traverse nested structure safely
  const conceptualModel = data?.composition?.conceptualModel;
  if (!conceptualModel) return { nodes: [], links: [] };

  // 1. Tagged Plant Items (Equipment)
  const items = conceptualModel.composition?.taggedPlantItems || [];

  items.forEach((item: any) => {
      // Equipment Node
      const eqNode = {
          id: item.id,
          name: item.data?.tagName || 'Unknown Equipment',
          type: 'Equipment',
          attributes: item.data,
          raw: item // store raw data for info panel
      };
      addNode(eqNode);

      // Nozzles
      const nozzles = item.composition?.nozzles || [];
      nozzles.forEach((nozzle: any) => {
          const nozzleNode = {
              id: nozzle.id,
              name: nozzle.data?.subTagName ? `${eqNode.name}:${nozzle.data.subTagName}` : 'Nozzle',
              type: 'Nozzle',
              parentId: item.id,
              attributes: nozzle.data
          };
          addNode(nozzleNode);

          // Link Equipment -> Nozzle
          links.push({
              source: item.id,
              target: nozzle.id,
              label: 'has_nozzle'
          });
      });
  });

  // 2. Piping (Connections)
  const systems = conceptualModel.composition?.pipingNetworkSystems || [];
  systems.forEach((system: any) => {
      const segments = system.composition?.segments || [];
      segments.forEach((segment: any) => {
          // Use reference to find source/target nozzles
          const sourceId = segment.reference?.sourceItem;
          const targetId = segment.reference?.targetItem;

          if (sourceId && targetId) {
              // Create a Pipe Segment Node to show the connection explicitly in KG?
              // Or just a link?
              // Requirement: "Detailed Design".
              // A direct link is cleaner for visualization unless the pipe itself has important data.
              // The segment has data (lineNumber, fluidCode, etc).
              // Let's make the Pipe a Node for the Knowledge Graph approach.

              const pipeId = segment.id;
              const pipeNode = {
                  id: pipeId,
                  name: segment.data?.lineNumber || 'Pipe Segment',
                  type: 'Pipe',
                  attributes: segment.data
              };
              addNode(pipeNode);

              links.push({
                  source: sourceId,
                  target: pipeId,
                  label: 'connects_to'
              });

              links.push({
                  source: pipeId,
                  target: targetId,
                  label: 'connects_to'
              });
          }
      });
  });

  return { nodes, links };
};
