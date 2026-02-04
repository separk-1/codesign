import { useState, useEffect } from 'react';

export const useGraphData = () => {
  const [data, setData] = useState<{
    entityCsv: string;
    relationshipCsv: string;
    procedureCsv: string;
    lerEntityCsv: string;
    lerRelationshipCsv: string;
    parentCsv: string;
    loading: boolean
  }>({
    entityCsv: '',
    relationshipCsv: '',
    procedureCsv: '',
    lerEntityCsv: '',
    lerRelationshipCsv: '',
    parentCsv: '',
    loading: true,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [entityRes, relRes, procRes, lerEntRes, lerRelRes, parentRes] = await Promise.all([
          fetch('/data/entity.csv'),
          fetch('/data/relationship.csv'),
          fetch('/data/procedure.csv'),
          fetch('/data/ler_entity.csv'),
          fetch('/data/ler_relationship.csv'),
          fetch('/data/parent.csv')
        ]);

        if (!entityRes.ok || !relRes.ok) {
           console.error('Failed to fetch main CSVs');
        }

        const entityCsv = await entityRes.text();
        const relationshipCsv = await relRes.text();
        // procedure.csv might not exist yet or fail, handle gracefully if needed, but assuming it exists
        const procedureCsv = procRes.ok ? await procRes.text() : '';
        const lerEntityCsv = lerEntRes.ok ? await lerEntRes.text() : '';
        const lerRelationshipCsv = lerRelRes.ok ? await lerRelRes.text() : '';
        const parentCsv = parentRes.ok ? await parentRes.text() : '';

        setData({
          entityCsv,
          relationshipCsv,
          procedureCsv,
          lerEntityCsv,
          lerRelationshipCsv,
          parentCsv,
          loading: false
        });
      } catch (error) {
        console.error('Error loading graph data:', error);
        setData(prev => ({ ...prev, loading: false }));
      }
    };

    fetchData();
  }, []);

  return data;
};
