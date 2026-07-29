import { create } from 'zustand';
import { parseConceptualJson, parseDexpiJson } from '../utils/graphParsers';

interface GraphData {
    nodes: any[];
    links: any[];
}

export interface DecisionLogEntry {
    id: string;
    timestamp: number;
    topic: string;
    designQuestion: string;
    stakeholderFocus: string[];
    humanOrAiResponse: string;
    responseSource: 'human' | 'ai_default';
    decision: string;
    confidence: 'high' | 'medium' | 'review';
    affectedComponent: string;
    communicationPurpose: string;
    outcome: string;
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
    affectedComponent: string;
    stakeholderFocus: string[];
    communicationPurpose: string;
    expectsUserDecision?: boolean;
}

const CONVERSATION_SCRIPT: ConversationStep[] = [
    { message: "Let's start by aligning the design intent. What process fluid will this PFD handle?\n\nA) Hydrocarbon (oil, fuel)\nB) Aqueous solution (water-based)\nC) Corrosive chemical\nD) Slurry or suspension", topic: 'process fluid', affectedComponent: 'system boundary', stakeholderFocus: ['designer', 'engineer', 'operator'], communicationPurpose: 'Align process intent before P&ID details are proposed.' },
    { message: "What flow rate range should the engineer use when turning this PFD into a P&ID?\n\nA) Low (< 50 m3/h)\nB) Medium (50-200 m3/h)\nC) High (200-500 m3/h)\nD) Very high (> 500 m3/h)", topic: 'flow rate', affectedComponent: 'process line sizing', stakeholderFocus: ['designer', 'engineer'], communicationPurpose: 'Translate a conceptual requirement into sizing assumptions.' },
    { message: "What pressure rise does the pump need to provide?\n\nA) Low (< 5 bar)\nB) Moderate (5-15 bar)\nC) High (15-40 bar)\nD) Very high (> 40 bar)", topic: 'pressure rise', affectedComponent: 'pump specification', stakeholderFocus: ['engineer', 'operator'], communicationPurpose: 'Make the pump duty explicit for review.' },
    { message: "For suction conditions, what inlet configuration should be assumed?\n\nA) Flooded suction (tank above pump)\nB) Suction lift required\nC) Booster pump arrangement\nD) Self-priming needed", topic: 'suction', affectedComponent: 'pump inlet and upstream tank', stakeholderFocus: ['engineer', 'operator'], communicationPurpose: 'Surface operating constraints that are often tacit.' },
    { message: "For the heat exchanger type, which design best fits the application?\n\nA) Shell-and-tube (high pressure/temperature)\nB) Plate heat exchanger (compact, easy cleaning)\nC) Air-cooled exchanger\nD) Spiral heat exchanger", topic: 'heat exchanger', affectedComponent: 'heat exchanger selection', stakeholderFocus: ['designer', 'engineer'], communicationPurpose: 'Record why a conceptual unit becomes a specific equipment type.' },
    { message: "What flow arrangement should be represented for the heat exchanger?\n\nA) Counter-current (maximum efficiency)\nB) Co-current (parallel flow)\nC) Cross-flow\nD) Multi-pass", topic: 'flow arrangement', affectedComponent: 'heat exchanger connections', stakeholderFocus: ['engineer'], communicationPurpose: 'Convert process intent into connection logic.' },
    { message: "What is the approximate distance between the pump and heat exchanger in the layout?\n\nA) Close-coupled (< 5 m)\nB) Moderate distance (5-20 m)\nC) Long run (20-50 m)\nD) Remote location (> 50 m)", topic: 'distance', affectedComponent: 'piping route', stakeholderFocus: ['designer', 'engineer'], communicationPurpose: 'Expose layout assumptions that affect line routing.' },
    { message: "For pipe sizing, the candidate main process line is DN 150 with a design velocity of 2.5 m/s. How should this be handled?\n\nA) Accept standard sizing\nB) Upsize for lower pressure drop\nC) Downsize to reduce cost\nD) Specify custom diameter", topic: 'sizing', affectedComponent: 'pipe diameter', stakeholderFocus: ['engineer', 'operator'], communicationPurpose: 'Separate AI-generated assumptions from human-approved decisions.' },
    { message: "What flange class should be specified for the piping connections?\n\nA) Class 150 (PN 20, standard)\nB) Class 300 (PN 50, elevated pressure)\nC) Class 600 (PN 100, high pressure)\nD) Class 900+ (very high pressure)", topic: 'flange', affectedComponent: 'piping connections', stakeholderFocus: ['engineer'], communicationPurpose: 'Capture a reviewable mechanical interface decision.' },
    { message: "For material selection, what should be assumed based on fluid and operating conditions?\n\nA) Carbon steel (CS, standard)\nB) Stainless steel 304/316\nC) Duplex stainless steel\nD) Special alloy (Hastelloy, Inconel)", topic: 'material', affectedComponent: 'material specification', stakeholderFocus: ['engineer', 'operator'], communicationPurpose: 'Preserve the reason for a material choice and flag uncertain chemistry.' },
    { message: "Please review the compiled operating assumptions:\n\n- Fluid: Aqueous solution\n- Flow rate: 100 m3/h\n- Pump discharge: 10 bar\n- Temperature range: 25 C to 80 C\n- Pipe size: DN 150\n- Material: Carbon steel\n\nA) Accept assumptions and proceed\nB) Modify fluid properties\nC) Adjust pressure/temperature\nD) Change material selection", topic: 'operating', affectedComponent: 'operating envelope', stakeholderFocus: ['designer', 'engineer', 'operator'], communicationPurpose: 'Create a shared checkpoint before detailed P&ID generation.' },
    { message: "The conceptual design decisions are recorded. Should the tool now generate a candidate detailed P&ID for review?\n\nA) Yes, proceed to detailed design\nB) Review equipment selection first\nC) Modify piping configuration\nD) Export conceptual summary", topic: 'confirm', affectedComponent: 'candidate P&ID package', stakeholderFocus: ['designer', 'engineer', 'operator'], communicationPurpose: 'Confirm that generation is a reviewable candidate, not a final automatic answer.' },
    { message: "Generating a candidate detailed P&ID for human review...\n\nMapped equipment:\n- Feed Pump -> Centrifugal Pump (P-4713)\n- Pre-Heater -> Plate Heat Exchanger (H-1009)\n\nGenerated piping network with 5 process segments and 2 utility lines. Nozzle assignments are complete but remain review items.\n\nSwitching to Detailed View.", topic: 'translate', affectedComponent: 'detailed P&ID candidate', stakeholderFocus: ['engineer', 'operator'], communicationPurpose: 'Document the AI translation step and keep review responsibility visible.', expectsUserDecision: false }
];


const DECISION_LOG_STORAGE_KEY = 'codesign.decisionLog.v1';

function loadStoredDecisionLog(): DecisionLogEntry[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(DECISION_LOG_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function persistDecisionLog(log: DecisionLogEntry[]) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DECISION_LOG_STORAGE_KEY, JSON.stringify(log));
}

function csvEscape(value: unknown): string {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
}

function inferDecision(step: ConversationStep, response: string): string {
    const normalized = response.trim();
    if (!normalized) return 'No response recorded';
    const optionMatch = normalized.match(/^[A-D]/i);
    if (optionMatch) {
        const optionLine = step.message.split('\n').find(line => line.trim().toLowerCase().startsWith(`${optionMatch[0].toLowerCase()})`));
        if (optionLine) return optionLine.trim();
    }
    return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function inferConfidence(response: string, source: 'human' | 'ai_default'): DecisionLogEntry['confidence'] {
    const lower = response.toLowerCase();
    if (source === 'ai_default') return 'review';
    if (['not sure', 'maybe', 'unclear', 'review', 'unknown', '모르', '애매'].some(term => lower.includes(term))) return 'review';
    return lower.length > 8 ? 'high' : 'medium';
}

function createDecisionLogEntry(step: ConversationStep, response: string, source: 'human' | 'ai_default'): DecisionLogEntry {
    const confidence = inferConfidence(response, source);
    return {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
        timestamp: Date.now(),
        topic: step.topic,
        designQuestion: step.message.split(/\n/)[0],
        stakeholderFocus: step.stakeholderFocus,
        humanOrAiResponse: response,
        responseSource: source,
        decision: inferDecision(step, response),
        confidence,
        affectedComponent: step.affectedComponent,
        communicationPurpose: step.communicationPurpose,
        outcome: confidence === 'review' ? 'Captured as review-needed assumption' : 'Captured as stakeholder-confirmed design decision'
    };
}


function nodeIdsForTopic(topic: string): string[] {
    const mapping: Record<string, string[]> = {
        'process fluid': ['Source-1'],
        'flow rate': ['Source-1', 'Pump-1'],
        'pressure rise': ['Pump-1'],
        suction: ['Source-1', 'Pump-1'],
        'heat exchanger': ['HEX-1'],
        'flow arrangement': ['HEX-1'],
        distance: ['Pump-1', 'HEX-1'],
        sizing: ['Pump-1', 'HEX-1'],
        flange: ['Pump-1', 'HEX-1'],
        material: ['Pump-1', 'HEX-1'],
        operating: ['Source-1', 'Pump-1', 'HEX-1', 'Sink-1'],
        confirm: ['Source-1', 'Pump-1', 'HEX-1', 'Sink-1'],
        translate: ['Source-1', 'Pump-1', 'HEX-1', 'Sink-1'],
    };
    return mapping[topic] || [];
}

function applyDecisionToGraph(graph: GraphData, entry: DecisionLogEntry): GraphData {
    const affectedIds = new Set(nodeIdsForTopic(entry.topic));
    if (affectedIds.size === 0) return graph;

    return {
        nodes: graph.nodes.map(node => {
            if (!affectedIds.has(node.id)) return node;
            const attributes = {
                ...(node.attributes || {}),
                latestDecisionTopic: entry.topic,
                latestDecision: entry.decision,
                latestDecisionConfidence: entry.confidence,
                latestDecisionSource: entry.responseSource,
                reviewRequired: entry.confidence === 'review' ? 'Yes' : 'No',
                communicationPurpose: entry.communicationPurpose,
            };
            return {
                ...node,
                attributes,
                decisionStatus: entry.confidence,
                lastDecision: entry.decision,
                reviewRequired: entry.confidence === 'review',
                updatedAt: entry.timestamp,
            };
        }),
        links: graph.links.map(link => {
            const source = typeof link.source === 'object' ? link.source.id : link.source;
            const target = typeof link.target === 'object' ? link.target.id : link.target;
            const touchesAffectedNode = affectedIds.has(source) || affectedIds.has(target);
            if (!touchesAffectedNode) return link;
            return {
                ...link,
                decisionStatus: entry.confidence,
                lastDecisionTopic: entry.topic,
            };
        })
    };
}

function mockTokens(estimate: number): number {
    return Math.floor(estimate * (0.7 + Math.random() * 0.3));
}

function createDefaultTasks(): DesignTask[] {
    return [
        { id: 'review-pfd', label: 'Review PFD Intent', description: 'Reviewing conceptual process intent and boundaries', status: 'pending', tokenEstimate: 3000, tokensUsed: 0 },
        { id: 'select-equipment', label: 'Elicit Design Knowledge', description: 'Collecting stakeholder assumptions and requirements', status: 'pending', tokenEstimate: 5000, tokensUsed: 0 },
        { id: 'connection-logic', label: 'Record Decisions', description: 'Logging decisions, rationale, confidence, and review needs', status: 'pending', tokenEstimate: 4000, tokensUsed: 0 },
        { id: 'detailed-design', label: 'Generate Candidate P&ID', description: 'Generating a reviewable detailed P&ID candidate', status: 'pending', tokenEstimate: 5000, tokensUsed: 0 },
        { id: 'update-graph', label: 'Update Decision Graph', description: 'Linking decisions to components and graph artifacts', status: 'pending', tokenEstimate: 3000, tokensUsed: 0 },
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
    aiResponding: boolean;
    conversationComplete: boolean;
    tasks: DesignTask[];
    tokenBudget: TokenBudget;
    terminalLogs: TerminalLog[];
    conversationStep: number;
    decisionLog: DecisionLogEntry[];

    // Actions
    loadData: () => Promise<void>;
    setActiveView: (view: 'conceptual' | 'detailed') => void;
    selectNode: (node: any | null) => void;
    addChatMessage: (sender: 'user' | 'ai', text: string, source?: 'human' | 'ai_default') => void;
    setAssumptionMode: (enabled: boolean) => void;
    addTerminalLog: (type: TerminalLog['type'], message: string) => void;
    advanceConversation: () => void;
    exportDecisionLogCsv: () => string;
    clearDecisionLog: () => void;
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
        { id: '1', sender: 'ai', text: 'Welcome to CoDesign. I help teams refine a conceptual PFD into a reviewable P&ID candidate by asking design questions, separating human decisions from AI assumptions, and logging the decision trail.\n\nSend any message to begin the design conversation.', timestamp: Date.now() }
    ],
    assumptionMode: false,
    loading: false,
    aiResponding: false,
    conversationComplete: false,
    tasks: createDefaultTasks(),
    tokenBudget: {
        total: parseInt(import.meta.env.VITE_TOKEN_BUDGET || '20000', 10),
        used: 0
    },
    terminalLogs: [],
    conversationStep: 0,
    decisionLog: loadStoredDecisionLog(),

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
            set({ aiResponding: false, conversationComplete: true });
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
            const stepLabel = step.expectsUserDecision === false
                ? `Final translation step (${conversationStep + 1}/${CONVERSATION_SCRIPT.length})`
                : `Design question ${conversationStep + 1}/${CONVERSATION_SCRIPT.length - 1}`;
            const newMessages = [...get().chatMessages, {
                id: Date.now().toString(),
                sender: 'ai' as const,
                text: `${stepLabel}\n\n${step.message}`,
                timestamp: Date.now()
            }];

            const updates: Partial<DesignState> = {
                chatMessages: newMessages,
                conversationStep: conversationStep + 1,
                aiResponding: false,
                conversationComplete: conversationStep + 1 >= CONVERSATION_SCRIPT.length
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
        const responseSource = source || (sender === 'user' ? 'human' : undefined);

        const newMessages = [...state.chatMessages, {
            id: Date.now().toString(),
            sender,
            text,
            timestamp: Date.now(),
            source: responseSource
        }];

        const updates: Partial<DesignState> = { chatMessages: newMessages };

        if (sender === 'user') {
            addTerminalLog('info', `User message received: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

            if (state.conversationComplete || state.conversationStep >= CONVERSATION_SCRIPT.length) {
                const summary = state.decisionLog.length
                    ? state.decisionLog.map((entry, index) => `${index + 1}. ${entry.topic}: ${entry.decision}`).join('\n')
                    : 'No design decisions were recorded.';
                set({
                    chatMessages: [...newMessages, {
                        id: Date.now().toString() + '-summary',
                        sender: 'ai' as const,
                        text: `Design refinement is complete. There are ${CONVERSATION_SCRIPT.length - 1} decision questions plus one final translation step.\n\nDecision summary:\n${summary}\n\nUse EXPORT CSV in the Decision Log panel to save the decision trail.`,
                        timestamp: Date.now()
                    }],
                    aiResponding: false,
                    conversationComplete: true
                });
                return;
            }

            const answeredStep = state.conversationStep > 0 ? CONVERSATION_SCRIPT[state.conversationStep - 1] : null;
            if (answeredStep && answeredStep.expectsUserDecision !== false) {
                const decisionEntry = createDecisionLogEntry(answeredStep, text, responseSource || 'human');
                const decisionLog = [...state.decisionLog, decisionEntry];
                persistDecisionLog(decisionLog);
                updates.decisionLog = decisionLog;
                updates.conceptualGraph = applyDecisionToGraph(state.conceptualGraph, decisionEntry);
                updates.selectedNode = updates.conceptualGraph.nodes.find(node => nodeIdsForTopic(decisionEntry.topic).includes(node.id)) || state.selectedNode;
                addTerminalLog(
                    decisionEntry.confidence === 'review' ? 'warning' : 'success',
                    `Decision logged: ${decisionEntry.topic} -> ${decisionEntry.decision}`
                );
            }

            const reviewTask = state.tasks.find(t => t.id === 'review-pfd');
            if (reviewTask && reviewTask.status === 'running') {
                let { tasks, tokenBudget } = advanceTask(state.tasks, 'review-pfd', 'done', state.tokenBudget, addTerminalLog);
                const equipResult = advanceTask(tasks, 'select-equipment', 'running', tokenBudget, addTerminalLog);
                updates.tasks = equipResult.tasks;
                updates.tokenBudget = equipResult.tokenBudget;
            }

            updates.aiResponding = true;
            set(updates);

            setTimeout(() => {
                advanceConversation();
            }, 1000);
        } else {
            set(updates);
        }
    },

    exportDecisionLogCsv: () => {
        const header = ['timestamp', 'topic', 'design_question', 'stakeholder_focus', 'human_or_ai_response', 'response_source', 'decision', 'confidence', 'affected_component', 'communication_purpose', 'outcome'];
        const rows = get().decisionLog.map(entry => [
            new Date(entry.timestamp).toISOString(),
            entry.topic,
            entry.designQuestion,
            entry.stakeholderFocus.join('; '),
            entry.humanOrAiResponse,
            entry.responseSource,
            entry.decision,
            entry.confidence,
            entry.affectedComponent,
            entry.communicationPurpose,
            entry.outcome
        ]);
        return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\\n');
    },

    clearDecisionLog: () => {
        persistDecisionLog([]);
        set({ decisionLog: [] });
    },

    setAssumptionMode: (enabled) => set({ assumptionMode: enabled })
}));
