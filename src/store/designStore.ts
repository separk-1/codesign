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

interface DesignState {
    conceptualGraph: GraphData;
    detailedGraph: GraphData;
    activeView: 'conceptual' | 'detailed';
    selectedNode: any | null;
    chatMessages: ChatMessage[];
    assumptionMode: boolean;
    loading: boolean;

    // Actions
    loadData: () => Promise<void>;
    setActiveView: (view: 'conceptual' | 'detailed') => void;
    selectNode: (node: any | null) => void;
    addChatMessage: (sender: 'user' | 'ai', text: string, source?: 'human' | 'ai_default') => void;
    setAssumptionMode: (enabled: boolean) => void;
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

    loadData: async () => {
        set({ loading: true });
        try {
            // Load Conceptual
            const concRes = await fetch('/sample/conceptual_design.json');
            const concJson = await concRes.json();
            const conceptualGraph = parseConceptualJson(concJson);

            // Load Detailed
            const detRes = await fetch('/sample/dexpi_model_output.json');
            const detJson = await detRes.json();
            const detailedGraph = parseDexpiJson(detJson);

            set({ conceptualGraph, detailedGraph, loading: false });
        } catch (error) {
            console.error("Failed to load design data", error);
            set({ loading: false });
        }
    },

    setActiveView: (view) => set({ activeView: view }),

    selectNode: (node) => set({ selectedNode: node }),

    addChatMessage: (sender, text, source) => set((state) => ({
        chatMessages: [...state.chatMessages, {
            id: Date.now().toString(),
            sender,
            text,
            timestamp: Date.now(),
            source: source || (sender === 'user' ? 'human' : undefined)
        }]
    })),

    setAssumptionMode: (enabled) => set({ assumptionMode: enabled })
}));
