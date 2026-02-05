import { create } from 'zustand';
import { parseConceptualJson, parseDexpiJson } from '../utils/graphParsers';
import { Intent, MotifCandidate, NozzleMapping, SpecInfo, mockAI } from '../services/collaborationService';

interface GraphData {
    nodes: any[];
    links: any[];
}

export interface ChatMessage {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    timestamp: number;
    source?: 'human' | 'ai_default';
    type?: 'text' | 'intent_review' | 'motif_selection' | 'nozzle_mapping' | 'spec_selection';
    data?: any;
}

export type TaskStatus = 'pending' | 'running' | 'done';

export interface DesignTask {
    id: string;
    label: string;
    description: string;
    status: TaskStatus;
    tokenEstimate: number;
    tokensUsed: number;
}

export interface TokenBudget {
    total: number;
    used: number;
}

export type WorkflowStep = 'IDLE' | 'INTENT_REVIEW' | 'MOTIF_SELECTION' | 'NOZZLE_MAPPING' | 'SPEC_SELECTION';

function mockTokens(estimate: number): number {
    return Math.floor(estimate * (0.7 + Math.random() * 0.3));
}

function createDefaultTasks(): DesignTask[] {
    return [
        { id: 'review-pfd', label: 'Review PFD', description: 'Reviewing conceptual process flow diagram', status: 'pending', tokenEstimate: 3000, tokensUsed: 0 },
        { id: 'select-equipment', label: 'Select Equipment', description: 'Selecting and configuring equipment types', status: 'pending', tokenEstimate: 5000, tokensUsed: 0 },
        { id: 'connection-logic', label: 'Connection Logic', description: 'Defining piping connections and nozzle assignments', status: 'pending', tokenEstimate: 4000, tokensUsed: 0 },
        { id: 'detailed-design', label: 'Detailed Design', description: 'Generating detailed P&ID specification', status: 'pending', tokenEstimate: 5000, tokensUsed: 0 },
        { id: 'update-graph', label: 'Update Graph', description: 'Updating knowledge graph with final design', status: 'pending', tokenEstimate: 3000, tokensUsed: 0 },
    ];
}

interface DesignState {
    conceptualGraph: GraphData;
    detailedGraph: GraphData;
    activeView: 'conceptual' | 'detailed';
    selectedNode: any | null;
    chatMessages: ChatMessage[];
    assumptionMode: boolean;
    loading: boolean;
    tasks: DesignTask[];
    tokenBudget: TokenBudget;

    // Workflow State
    workflowStep: WorkflowStep;
    pendingIntent: Intent | null;
    motifCandidates: MotifCandidate[];
    selectedMotif: MotifCandidate | null;
    pendingNozzleMap: NozzleMapping | null;

    // Actions
    loadData: () => Promise<void>;
    setActiveView: (view: 'conceptual' | 'detailed') => void;
    selectNode: (node: any | null) => void;
    addChatMessage: (sender: 'user' | 'ai', text: string, source?: 'human' | 'ai_default', type?: ChatMessage['type'], data?: any) => void;
    setAssumptionMode: (enabled: boolean) => void;

    // Workflow Actions
    processUserMessage: (text: string) => Promise<void>;
    confirmIntent: (intent: Intent) => Promise<void>;
    selectMotif: (motif: MotifCandidate) => Promise<void>;
    confirmNozzleMapping: (mapping: NozzleMapping) => Promise<void>;
    confirmSpec: (spec: SpecInfo) => Promise<void>;
    updateGraph: (newNodes: any[], newLinks: any[]) => void;
}

function advanceTask(tasks: DesignTask[], taskId: string, newStatus: TaskStatus, tokenBudget: TokenBudget): { tasks: DesignTask[]; tokenBudget: TokenBudget } {
    const updatedTasks = tasks.map(t => {
        if (t.id === taskId) {
            const tokensUsed = newStatus === 'done' ? mockTokens(t.tokenEstimate) : t.tokensUsed;
            return { ...t, status: newStatus, tokensUsed };
        }
        return t;
    });
    const newUsed = updatedTasks.reduce((sum, t) => sum + t.tokensUsed, 0);
    return { tasks: updatedTasks, tokenBudget: { ...tokenBudget, used: newUsed } };
}

export const useDesignStore = create<DesignState>((set, get) => ({
    conceptualGraph: { nodes: [], links: [] },
    detailedGraph: { nodes: [], links: [] },
    activeView: 'conceptual',
    selectedNode: null,
    chatMessages: [
        { id: '1', sender: 'ai', text: 'Welcome to CoDesign! I am your AI Design Assistant. We are currently in Conceptual Design mode. I can guide you through design refinement — from conceptual PFD to detailed P&ID.', timestamp: Date.now() }
    ],
    assumptionMode: false,
    loading: false,
    tasks: createDefaultTasks(),
    tokenBudget: {
        total: parseInt(import.meta.env.VITE_TOKEN_BUDGET || '20000', 10),
        used: 0
    },

    workflowStep: 'IDLE',
    pendingIntent: null,
    motifCandidates: [],
    selectedMotif: null,
    pendingNozzleMap: null,

    loadData: async () => {
        set({ loading: true });
        try {
            const concRes = await fetch('/sample/conceptual_design.json');
            const concJson = await concRes.json();
            const conceptualGraph = parseConceptualJson(concJson);

            const detRes = await fetch('/sample/dexpi_model_output.json');
            const detJson = await detRes.json();
            const detailedGraph = parseDexpiJson(detJson);

            // After data loads, advance review-pfd to running
            const state = get();
            const { tasks, tokenBudget } = advanceTask(state.tasks, 'review-pfd', 'running', state.tokenBudget);

            set({ conceptualGraph, detailedGraph, loading: false, tasks, tokenBudget });
        } catch (error) {
            console.error("Failed to load design data", error);
            set({ loading: false });
        }
    },

    setActiveView: (view) => {
        const state = get();
        const updates: Partial<DesignState> = { activeView: view };

        if (view === 'detailed') {
            const detailedTask = state.tasks.find(t => t.id === 'detailed-design');
            if (detailedTask && detailedTask.status !== 'done') {
                let { tasks, tokenBudget } = advanceTask(state.tasks, 'detailed-design', 'done', state.tokenBudget);
                const graphResult = advanceTask(tasks, 'update-graph', 'running', tokenBudget);
                updates.tasks = graphResult.tasks;
                updates.tokenBudget = graphResult.tokenBudget;

                setTimeout(() => {
                    const current = get();
                    const { tasks: finalTasks, tokenBudget: finalBudget } = advanceTask(current.tasks, 'update-graph', 'done', current.tokenBudget);
                    set({ tasks: finalTasks, tokenBudget: finalBudget });
                }, 2000);
            }
        }
        set(updates);
    },

    selectNode: (node) => set({ selectedNode: node }),

    addChatMessage: (sender, text, source, type = 'text', data = null) => {
        const state = get();
        const newMessages = [...state.chatMessages, {
            id: Date.now().toString() + Math.random().toString().slice(2, 6),
            sender,
            text,
            timestamp: Date.now(),
            source: source || (sender === 'user' ? 'human' : undefined),
            type,
            data
        }];
        set({ chatMessages: newMessages });
    },

    setAssumptionMode: (enabled) => set({ assumptionMode: enabled }),

    updateGraph: (newNodes, newLinks) => {
        const state = get();
        // Simple append for now. In a real app, we'd check for duplicates.
        const currentGraph = state.activeView === 'conceptual' ? state.conceptualGraph : state.detailedGraph;

        const updatedGraph = {
            nodes: [...currentGraph.nodes, ...newNodes],
            links: [...currentGraph.links, ...newLinks]
        };

        if (state.activeView === 'conceptual') {
            set({ conceptualGraph: updatedGraph });
        } else {
            set({ detailedGraph: updatedGraph });
        }
    },

    // ── Workflow Actions ───────────────────────────────────────────────────

    processUserMessage: async (text: string) => {
        const { addChatMessage } = get();

        addChatMessage('user', text, 'human');

        // If already in a workflow, maybe we should abort or handle context switching?
        // For now, let's treat any text input as a new intent start if we are IDLE.
        // If not IDLE, it might be a modification request, but we'll stick to the happy path for now.

        // 1. Parse Intent
        const intent = await mockAI.parseIntent(text);

        set({
            workflowStep: 'INTENT_REVIEW',
            pendingIntent: intent
        });

        addChatMessage('ai', `I've analyzed your request. Please review the structured intent below.`, undefined, 'intent_review', intent);
    },

    confirmIntent: async (intent: Intent) => {
        const { addChatMessage } = get();
        set({ workflowStep: 'MOTIF_SELECTION' });

        addChatMessage('ai', 'Intent confirmed. Searching Knowledge Graph for connection patterns...', undefined, 'text');

        const candidates = await mockAI.getMotifCandidates(intent);
        set({ motifCandidates: candidates });

        addChatMessage('ai', `I found ${candidates.length} connection motifs from similar projects. Please select one.`, undefined, 'motif_selection', candidates);
    },

    selectMotif: async (motif: MotifCandidate) => {
        const { addChatMessage } = get();
        set({ selectedMotif: motif, workflowStep: 'NOZZLE_MAPPING' });

        addChatMessage('ai', `Selected "${motif.name}". Now mapping nozzle configurations based on equipment specs.`, undefined, 'text');

        const nozzleOptions = await mockAI.getNozzleMappings(motif.id);
        // Just pick the first one as default for the review step, or list them?
        // The prompt says "System proposes nozzle mapping... user reviews".
        // We'll propose the first one.
        const proposal = nozzleOptions[0];
        set({ pendingNozzleMap: proposal });

        addChatMessage('ai', `I propose the following nozzle mapping for this connection.`, undefined, 'nozzle_mapping', proposal);
    },

    confirmNozzleMapping: async (mapping: NozzleMapping) => {
        const { addChatMessage } = get();
        set({ workflowStep: 'SPEC_SELECTION' });

        addChatMessage('ai', 'Nozzles mapped. Retrieving compatible piping specifications...', undefined, 'text');

        const specs = await mockAI.getSpecs(mapping);
        // Present the first valid spec
        const proposal = specs[0];

        addChatMessage('ai', `Based on the process fluid and pressure class, I recommend this piping specification.`, undefined, 'spec_selection', proposal);
    },

    confirmSpec: async (spec: SpecInfo) => {
        const { addChatMessage, updateGraph, selectedMotif, pendingIntent } = get();

        // ── Finalize: Update Graph ───────────────────────────────────────
        addChatMessage('ai', 'Specification accepted. Generating detailed design elements...', undefined, 'text');

        // Create dummy graph elements based on the selection
        // In a real app, this would be much more complex.
        const sourceId = pendingIntent?.sourceType.replace(/\s/g, '') || 'Source';
        const targetId = pendingIntent?.targetType.replace(/\s/g, '') || 'Target';

        // Ensure source/target exist or create them if they were generic?
        // For this demo, let's create new nodes to represent the added connection
        // We assume the nodes might already exist, but here we add "Lines" and "Valves" between them.

        const newNodes = [];
        const newLinks = [];

        // 1. Add Source/Target if not in graph (simplified)
        // actually, usually we are connecting existing nodes.
        // But let's add visual nodes for the components in the motif.

        let previousNodeId = sourceId; // Assuming this ID matches something or we just link from it

        // Add components from motif
        if (selectedMotif) {
            selectedMotif.components.forEach((comp, idx) => {
                const compId = `comp_${Date.now()}_${idx}`;
                newNodes.push({
                    id: compId,
                    name: comp,
                    type: comp.includes('Valve') ? 'Valve' : 'Equipment', // Simplified type
                    x: Math.random() * 100, // Random pos for now, force graph will fix
                    y: Math.random() * 100
                });

                newLinks.push({
                    source: previousNodeId,
                    target: compId,
                    label: spec.size
                });
                previousNodeId = compId;
            });
        }

        // Final link to target
        newLinks.push({
            source: previousNodeId,
            target: targetId,
            label: spec.size
        });

        // Actually, we should probably add the Source/Target nodes too if they are just strings from the intent
        // so the graph doesn't crash on missing IDs.
        // We'll check if they exist in a real app, here we just add them to be safe if they are just names.
        // But usually we'd select nodes on the graph first.
        // For this text-to-design demo, we'll add them as new nodes.

        newNodes.push(
            { id: sourceId, name: pendingIntent?.sourceType, type: 'Equipment', x: 0, y: 0 },
            { id: targetId, name: pendingIntent?.targetType, type: 'Equipment', x: 200, y: 0 }
        );

        updateGraph(newNodes, newLinks);

        addChatMessage('ai', 'Design updated successfully. The connection has been added to the graph.', undefined, 'text');

        set({
            workflowStep: 'IDLE',
            pendingIntent: null,
            motifCandidates: [],
            selectedMotif: null,
            pendingNozzleMap: null
        });
    }

}));
