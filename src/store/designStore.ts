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

export interface TerminalLog {
    id: string;
    timestamp: number;
    type: 'info' | 'success' | 'warning' | 'processing';
    message: string;
}

interface ConversationStep {
    message: string;
    topic: string;
}

const CONVERSATION_SCRIPT: ConversationStep[] = [
    { message: "Let's start by identifying the process fluid. What type of fluid will be handled?\n\nA) Hydrocarbon (oil, fuel)\nB) Aqueous solution (water-based)\nC) Corrosive chemical\nD) Slurry or suspension", topic: 'process fluid' },
    { message: "What flow rate range are you targeting for this system?\n\nA) Low (< 50 m³/h)\nB) Medium (50–200 m³/h)\nC) High (200–500 m³/h)\nD) Very high (> 500 m³/h)", topic: 'flow rate' },
    { message: "What pressure rise does the pump need to provide?\n\nA) Low (< 5 bar)\nB) Moderate (5–15 bar)\nC) High (15–40 bar)\nD) Very high (> 40 bar)", topic: 'pressure rise' },
    { message: "For suction conditions, what's the expected inlet configuration?\n\nA) Flooded suction (tank above pump)\nB) Suction lift required\nC) Booster pump arrangement\nD) Self-priming needed", topic: 'suction' },
    { message: "For the heat exchanger type, which design best fits your application?\n\nA) Shell-and-tube (high pressure/temperature)\nB) Plate heat exchanger (compact, easy cleaning)\nC) Air-cooled exchanger\nD) Spiral heat exchanger", topic: 'heat exchanger' },
    { message: "What flow arrangement do you prefer for the heat exchanger?\n\nA) Counter-current (maximum efficiency)\nB) Co-current (parallel flow)\nC) Cross-flow\nD) Multi-pass", topic: 'flow arrangement' },
    { message: "What's the distance between the pump and heat exchanger in your layout?\n\nA) Close-coupled (< 5 m)\nB) Moderate distance (5–20 m)\nC) Long run (20–50 m)\nD) Remote location (> 50 m)", topic: 'distance' },
    { message: "For pipe sizing, I've calculated optimal diameters based on velocity limits. The main process line would be DN 150 (6\") with a design velocity of 2.5 m/s.\n\nA) Accept standard sizing\nB) Upsize for lower pressure drop\nC) Downsize to reduce cost\nD) Specify custom diameter", topic: 'sizing' },
    { message: "What flange class should we specify for the piping connections?\n\nA) Class 150 (PN 20, standard)\nB) Class 300 (PN 50, elevated pressure)\nC) Class 600 (PN 100, high pressure)\nD) Class 900+ (very high pressure)", topic: 'flange' },
    { message: "For material/metallurgy selection, what's your preference based on the fluid and conditions?\n\nA) Carbon steel (CS, standard)\nB) Stainless steel 304/316\nC) Duplex stainless steel\nD) Special alloy (Hastelloy, Inconel)", topic: 'material' },
    { message: "Please confirm the operating conditions I've compiled:\n\n• Fluid: Aqueous solution\n• Flow rate: 100 m³/h\n• Pump discharge: 10 bar\n• Temperature range: 25°C → 80°C\n• Pipe size: DN 150\n• Material: Carbon steel\n\nA) Accept assumptions and proceed\nB) Modify fluid properties\nC) Adjust pressure/temperature\nD) Change material selection", topic: 'operating' },
    { message: "All parameters confirmed! The conceptual design is complete. Ready to convert to detailed P&ID with full equipment specifications, nozzle assignments, and piping network?\n\nA) Yes, proceed to detailed design\nB) Review equipment selection first\nC) Modify piping configuration\nD) Export conceptual summary", topic: 'confirm' },
    { message: "Translating Conceptual Design to Detailed Design...\n\nI have mapped the equipment:\n• 'Feed Pump' → Centrifugal Pump (P-4713)\n• 'Pre-Heater' → Plate Heat Exchanger (H-1009)\n\nGenerated piping network with 5 process segments and 2 utility lines. All nozzle assignments complete.\n\nSwitching to Detailed View.", topic: 'translate' }
];

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
    terminalLogs: TerminalLog[];
    conversationStep: number;

    // Actions
    loadData: () => Promise<void>;
    setActiveView: (view: 'conceptual' | 'detailed') => void;
    selectNode: (node: any | null) => void;
    addChatMessage: (sender: 'user' | 'ai', text: string, source?: 'human' | 'ai_default') => void;
    setAssumptionMode: (enabled: boolean) => void;
    addTerminalLog: (type: TerminalLog['type'], message: string) => void;
    advanceConversation: () => void;
}

function advanceTask(
    tasks: DesignTask[],
    taskId: string,
    newStatus: TaskStatus,
    tokenBudget: TokenBudget,
    addLog?: (type: TerminalLog['type'], message: string) => void
): { tasks: DesignTask[]; tokenBudget: TokenBudget } {
    const task = tasks.find(t => t.id === taskId);
    const updatedTasks = tasks.map(t => {
        if (t.id === taskId) {
            const tokensUsed = newStatus === 'done' ? mockTokens(t.tokenEstimate) : t.tokensUsed;
            return { ...t, status: newStatus, tokensUsed };
        }
        return t;
    });
    const newUsed = updatedTasks.reduce((sum, t) => sum + t.tokensUsed, 0);

    // Emit terminal logs for task status changes
    if (task && addLog) {
        if (newStatus === 'running') {
            addLog('processing', `Task '${task.label}' started`);
        } else if (newStatus === 'done') {
            const updatedTask = updatedTasks.find(t => t.id === taskId);
            addLog('success', `Task '${task.label}' completed — ${updatedTask?.tokensUsed || 0} tokens used`);
        }
    }

    return { tasks: updatedTasks, tokenBudget: { ...tokenBudget, used: newUsed } };
}

export const useDesignStore = create<DesignState>((set, get) => ({
    conceptualGraph: { nodes: [], links: [] },
    detailedGraph: { nodes: [], links: [] },
    activeView: 'conceptual',
    selectedNode: null,
    chatMessages: [
        { id: '1', sender: 'ai', text: 'Welcome to CoDesign! I am your AI Design Assistant. We are currently in Conceptual Design mode. I can guide you through design refinement — from conceptual PFD to detailed P&ID.\n\nSend any message to begin the design conversation.', timestamp: Date.now() }
    ],
    assumptionMode: false,
    loading: false,
    tasks: createDefaultTasks(),
    tokenBudget: {
        total: parseInt(import.meta.env.VITE_TOKEN_BUDGET || '20000', 10),
        used: 0
    },
    terminalLogs: [],
    conversationStep: 0,

    addTerminalLog: (type, message) => {
        const log: TerminalLog = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            type,
            message
        };
        set(state => ({ terminalLogs: [...state.terminalLogs, log] }));
    },

    loadData: async () => {
        const { addTerminalLog } = get();
        set({ loading: true });
        addTerminalLog('info', 'Loading conceptual design data...');

        try {
            addTerminalLog('processing', 'Fetching design files...');
            const concRes = await fetch('/sample/conceptual_design.json');
            const concJson = await concRes.json();
            addTerminalLog('info', 'Parsing conceptual PFD model...');
            const conceptualGraph = parseConceptualJson(concJson);

            addTerminalLog('processing', 'Fetching DEXPI model...');
            const detRes = await fetch('/sample/dexpi_model_output.json');
            const detJson = await detRes.json();
            addTerminalLog('info', 'Parsing DEXPI detailed design...');
            const detailedGraph = parseDexpiJson(detJson);

            // After data loads, advance review-pfd to running
            const state = get();
            const { tasks, tokenBudget } = advanceTask(state.tasks, 'review-pfd', 'running', state.tokenBudget, addTerminalLog);

            addTerminalLog('success', 'Data loaded successfully. Ready for design refinement.');
            set({ conceptualGraph, detailedGraph, loading: false, tasks, tokenBudget });
        } catch (error) {
            console.error("Failed to load design data", error);
            addTerminalLog('warning', 'Failed to load design data. Check console for details.');
            set({ loading: false });
        }
    },

    setActiveView: (view) => {
        const state = get();
        const { addTerminalLog } = get();
        const updates: Partial<DesignState> = { activeView: view };

        if (view === 'detailed') {
            addTerminalLog('processing', 'Converting conceptual design to detailed P&ID...');

            setTimeout(() => {
                addTerminalLog('info', 'Mapping equipment: Feed Pump → Centrifugal Pump P-4713');
            }, 300);
            setTimeout(() => {
                addTerminalLog('info', 'Mapping equipment: Pre-Heater → Plate Heat Exchanger H-1009');
            }, 600);
            setTimeout(() => {
                addTerminalLog('info', 'Generating piping network (5 process + 2 utility segments)...');
            }, 900);
            setTimeout(() => {
                addTerminalLog('success', 'Detailed design generated successfully.');
            }, 1200);

            // detailed-design → done, update-graph → running → done (after 2s)
            const detailedTask = state.tasks.find(t => t.id === 'detailed-design');
            if (detailedTask && detailedTask.status !== 'done') {
                let { tasks, tokenBudget } = advanceTask(state.tasks, 'detailed-design', 'done', state.tokenBudget, addTerminalLog);
                const graphResult = advanceTask(tasks, 'update-graph', 'running', tokenBudget, addTerminalLog);
                updates.tasks = graphResult.tasks;
                updates.tokenBudget = graphResult.tokenBudget;

                // After 2s, finish update-graph
                setTimeout(() => {
                    const current = get();
                    const { tasks: finalTasks, tokenBudget: finalBudget } = advanceTask(current.tasks, 'update-graph', 'done', current.tokenBudget, addTerminalLog);
                    set({ tasks: finalTasks, tokenBudget: finalBudget });
                }, 2000);
            }
        }

        set(updates);
    },

    selectNode: (node) => set({ selectedNode: node }),

    advanceConversation: () => {
        const state = get();
        const { addTerminalLog, conversationStep } = state;

        if (conversationStep >= CONVERSATION_SCRIPT.length) {
            return; // Conversation complete
        }

        const step = CONVERSATION_SCRIPT[conversationStep];
        addTerminalLog('processing', `Analyzing ${step.topic}...`);

        setTimeout(() => {
            addTerminalLog('info', 'Generating design question...');
        }, 300);

        setTimeout(() => {
            const { setActiveView } = get();

            // Add the AI message
            const newMessages = [...get().chatMessages, {
                id: Date.now().toString(),
                sender: 'ai' as const,
                text: step.message,
                timestamp: Date.now()
            }];

            const updates: Partial<DesignState> = {
                chatMessages: newMessages,
                conversationStep: conversationStep + 1
            };

            // Check for task progression based on keywords in the AI message
            const lower = step.message.toLowerCase();
            const currentTasks = get().tasks;
            const currentBudget = get().tokenBudget;

            const equipmentKeywords = ['centrifugal', 'plate heat', 'pump', 'exchanger', 'vessel', 'reactor'];
            const conversionKeywords = ['translating', 'switching to detailed', 'mapped'];

            if (equipmentKeywords.some(k => lower.includes(k))) {
                const equipTask = currentTasks.find(t => t.id === 'select-equipment');
                if (equipTask && equipTask.status === 'running') {
                    let { tasks, tokenBudget } = advanceTask(currentTasks, 'select-equipment', 'done', currentBudget, addTerminalLog);
                    const connResult = advanceTask(tasks, 'connection-logic', 'running', tokenBudget, addTerminalLog);
                    updates.tasks = connResult.tasks;
                    updates.tokenBudget = connResult.tokenBudget;
                }
            }

            if (conversionKeywords.some(k => lower.includes(k))) {
                const connTask = currentTasks.find(t => t.id === 'connection-logic');
                const tasksToUse = (updates.tasks as DesignTask[]) || currentTasks;
                const budgetToUse = (updates.tokenBudget as TokenBudget) || currentBudget;

                if (connTask && (connTask.status === 'running' || connTask.status === 'pending')) {
                    let { tasks, tokenBudget } = advanceTask(tasksToUse, 'connection-logic', 'done', budgetToUse, addTerminalLog);
                    const detResult = advanceTask(tasks, 'detailed-design', 'running', tokenBudget, addTerminalLog);
                    updates.tasks = detResult.tasks;
                    updates.tokenBudget = detResult.tokenBudget;
                }

                // Auto-switch to detailed view after translation message
                setTimeout(() => {
                    setActiveView('detailed');
                }, 1500);
            }

            set(updates);
        }, 800);
    },

    addChatMessage: (sender, text, source) => {
        const state = get();
        const { addTerminalLog, advanceConversation } = get();

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
            addTerminalLog('info', `User message received: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

            const reviewTask = state.tasks.find(t => t.id === 'review-pfd');
            if (reviewTask && reviewTask.status === 'running') {
                let { tasks, tokenBudget } = advanceTask(state.tasks, 'review-pfd', 'done', state.tokenBudget, addTerminalLog);
                const equipResult = advanceTask(tasks, 'select-equipment', 'running', tokenBudget, addTerminalLog);
                updates.tasks = equipResult.tasks;
                updates.tokenBudget = equipResult.tokenBudget;
            }

            set(updates);

            // Trigger AI response after 1s delay
            setTimeout(() => {
                advanceConversation();
            }, 1000);
        } else {
            set(updates);
        }
    },

    setAssumptionMode: (enabled) => set({ assumptionMode: enabled })
}));
