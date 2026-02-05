import { create } from 'zustand';
import { parseConceptualJson, parseDexpiJson } from '../utils/graphParsers';

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

    // Actions
    loadData: () => Promise<void>;
    setActiveView: (view: 'conceptual' | 'detailed') => void;
    selectNode: (node: any | null) => void;
    addChatMessage: (sender: 'user' | 'ai', text: string, source?: 'human' | 'ai_default') => void;
    setAssumptionMode: (enabled: boolean) => void;
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
            // detailed-design → done, update-graph → running → done (after 2s)
            const detailedTask = state.tasks.find(t => t.id === 'detailed-design');
            if (detailedTask && detailedTask.status !== 'done') {
                let { tasks, tokenBudget } = advanceTask(state.tasks, 'detailed-design', 'done', state.tokenBudget);
                const graphResult = advanceTask(tasks, 'update-graph', 'running', tokenBudget);
                updates.tasks = graphResult.tasks;
                updates.tokenBudget = graphResult.tokenBudget;

                // After 2s, finish update-graph
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

    addChatMessage: (sender, text, source) => {
        const state = get();
        const newMessages = [...state.chatMessages, {
            id: Date.now().toString(),
            sender,
            text,
            timestamp: Date.now(),
            source: source || (sender === 'user' ? 'human' : undefined)
        }];

        const updates: Partial<DesignState> = { chatMessages: newMessages };

        // Auto-progression: first user message → review-pfd done, select-equipment running
        if (sender === 'user') {
            const reviewTask = state.tasks.find(t => t.id === 'review-pfd');
            if (reviewTask && reviewTask.status === 'running') {
                let { tasks, tokenBudget } = advanceTask(state.tasks, 'review-pfd', 'done', state.tokenBudget);
                const equipResult = advanceTask(tasks, 'select-equipment', 'running', tokenBudget);
                updates.tasks = equipResult.tasks;
                updates.tokenBudget = equipResult.tokenBudget;
            }
        }

        // Auto-progression: AI response with equipment keywords
        if (sender === 'ai') {
            const lower = text.toLowerCase();
            const equipmentKeywords = ['centrifugal', 'plate heat', 'pump', 'exchanger', 'vessel', 'reactor'];
            const conversionKeywords = ['translating', 'switching to detailed', 'convert', 'mapped'];

            if (equipmentKeywords.some(k => lower.includes(k))) {
                const equipTask = state.tasks.find(t => t.id === 'select-equipment');
                const currentTasks = (updates.tasks as DesignTask[]) || state.tasks;
                const currentBudget = (updates.tokenBudget as TokenBudget) || state.tokenBudget;
                if (equipTask && equipTask.status === 'running') {
                    let { tasks, tokenBudget } = advanceTask(currentTasks, 'select-equipment', 'done', currentBudget);
                    const connResult = advanceTask(tasks, 'connection-logic', 'running', tokenBudget);
                    updates.tasks = connResult.tasks;
                    updates.tokenBudget = connResult.tokenBudget;
                }
            }

            if (conversionKeywords.some(k => lower.includes(k))) {
                const connTask = state.tasks.find(t => t.id === 'connection-logic');
                const currentTasks = (updates.tasks as DesignTask[]) || state.tasks;
                const currentBudget = (updates.tokenBudget as TokenBudget) || state.tokenBudget;
                if (connTask && (connTask.status === 'running' || connTask.status === 'pending')) {
                    // If connection-logic was running, finish it and start detailed-design
                    let { tasks, tokenBudget } = advanceTask(currentTasks, 'connection-logic', 'done', currentBudget);
                    const detResult = advanceTask(tasks, 'detailed-design', 'running', tokenBudget);
                    updates.tasks = detResult.tasks;
                    updates.tokenBudget = detResult.tokenBudget;
                }
            }
        }

        set(updates);
    },

    setAssumptionMode: (enabled) => set({ assumptionMode: enabled })
}));
