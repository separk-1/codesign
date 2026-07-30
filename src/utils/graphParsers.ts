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
     if (!n?.id) return;
     if (!nodeIds.has(n.id)) {
         nodes.push(n);
         nodeIds.add(n.id);
     }
  }

  const ensureNode = (id: string, label = 'Referenced Item') => {
    if (!id || nodeIds.has(id)) return;
    addNode({
      id,
      name: label,
      type: 'Reference',
      attributes: { id, generatedPlaceholder: true }
    });
  };

  // Traverse nested structure safely
  const conceptualModel = data?.composition?.conceptualModel;
  if (!conceptualModel) return { nodes: [], links: [] };

  // 1. Boundary Items (Source / Sink)
  const boundaryItems = conceptualModel.composition?.boundaryItems || [];
  boundaryItems.forEach((item: any) => {
      const bndNode = {
          id: item.id,
          name: item.data?.tagName || 'Boundary',
          type: item.componentType || 'Source',
          attributes: item.data
      };
      addNode(bndNode);

      // Boundary nozzles — add as Nozzle nodes linked to parent
      const nozzles = item.composition?.nozzles || [];
      nozzles.forEach((nozzle: any) => {
          const nozzleNode = {
              id: nozzle.id,
              name: nozzle.data?.subTagName
                  ? `${bndNode.name}:${nozzle.data.subTagName}`
                  : 'Nozzle',
              type: 'Nozzle',
              parentId: item.id,
              attributes: nozzle.data
          };
          addNode(nozzleNode);

          links.push({
              source: item.id,
              target: nozzle.id,
              label: 'has_nozzle'
          });
      });
  });

  // 2. Tagged Plant Items (Equipment)
  const items = conceptualModel.composition?.taggedPlantItems || [];

  items.forEach((item: any) => {
      // Determine equipment type from componentType field or default to Equipment
      const eqType = item.componentType || 'Equipment';

      const eqNode = {
          id: item.id,
          name: item.data?.tagName || 'Unknown Equipment',
          type: eqType,
          attributes: item.data,
          raw: item // store raw data for info panel
      };
      addNode(eqNode);

      // Nozzles
      const nozzles = item.composition?.nozzles || [];
      nozzles.forEach((nozzle: any) => {
          const nozzleNode = {
              id: nozzle.id,
              name: nozzle.data?.subTagName
                  ? `${eqNode.name}:${nozzle.data.subTagName}`
                  : 'Nozzle',
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

  // 3. Piping (Connections)
  const systems = conceptualModel.composition?.pipingNetworkSystems || [];
  systems.forEach((system: any) => {
      const segments = system.composition?.segments || [];
      segments.forEach((segment: any) => {
          const segmentConnections = segment.composition?.connections || [];
          const references = segmentConnections.length
              ? segmentConnections.map((connection: any) => ({
                  sourceItem: connection.reference?.sourceItem || segment.reference?.sourceItem,
                  targetItem: connection.reference?.targetItem || segment.reference?.targetItem,
                  id: connection.id || segment.id,
                  data: connection.data || segment.data || system.data || {}
              }))
              : [{
                  sourceItem: segment.reference?.sourceItem,
                  targetItem: segment.reference?.targetItem,
                  id: segment.id,
                  data: segment.data || system.data || {}
              }];

          references.forEach((reference: any, index: number) => {
              const sourceId = reference.sourceItem;
              const targetId = reference.targetItem;
              if (!sourceId || !targetId) return;

              ensureNode(sourceId, 'Referenced Source');
              ensureNode(targetId, 'Referenced Target');

              const pipeId = reference.id || `${segment.id || system.id}-pipe-${index}`;
              const pipeNode = {
                  id: pipeId,
                  name: reference.data?.lineNumber || segment.data?.lineNumber || system.data?.lineNumber || 'Pipe Segment',
                  type: 'Pipe',
                  attributes: { ...(system.data || {}), ...(segment.data || {}), ...(reference.data || {}) }
              };
              addNode(pipeNode);

              links.push({
                  source: sourceId,
                  target: pipeId,
                  label: reference.data?.service || segment.data?.service || system.data?.lineNumber || 'connects_to'
              });

              links.push({
                  source: pipeId,
                  target: targetId,
                  label: reference.data?.service || segment.data?.service || system.data?.lineNumber || 'connects_to'
              });
          });
      });
  });

  return { nodes, links };
};
