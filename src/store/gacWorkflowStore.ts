import { create } from 'zustand';
import { GacCalculation, GacGraph, gacConcept } from '../utils/gacDesign';

interface Workflow {
  consultation: any;
  corpus: any;
  graphTab: 'architecture' | 'graph';
  highlightedFields: string[];
  proposal: GacCalculation | null;
  accepted: GacCalculation | null;
  graph: GacGraph;
  beforeGraph: GacGraph;
  form: Record<string, string>;
  history: { timestamp: string; action: string; [key: string]: any }[];
}
export const useGacWorkflowStore = create<Workflow>(() => ({ consultation: null, corpus: null, graphTab: 'architecture', highlightedFields: [], proposal: null, accepted: null,
  graph: gacConcept(), beforeGraph: gacConcept(), form: {}, history: [] }));
export function gacCommand(command: string) {
  window.dispatchEvent(new CustomEvent('gac-review-command', { detail: command }));
}
