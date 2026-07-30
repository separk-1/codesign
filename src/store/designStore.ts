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

export interface DesignCandidate {
    fluid: string;
    material: string;
    lineSize: string;
    flowInstrument: string;
    pumpDuty: string;
    pressureProtection: string;
    treatment: string;
    heatExchanger: string;
    bypass: string;
    status: 'Drafting' | 'Ready for Review' | 'Assumptions Only' | 'Blocked' | 'Decision Log Only';
    reviewItems: string[];
    updatedTopics: string[];
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
    { message: `What type of fluid is being processed?

A) Clean water
B) PFAS-contaminated water
C) Corrosive chemical
D) Slurry / solids-containing stream`, topic: 'process fluid', affectedComponent: 'material schedule and sampling points', stakeholderFocus: ['designer', 'engineer', 'operator'], communicationPurpose: 'Choose fluid assumptions that visibly affect material and sampling needs.' },
    { message: `What design flow rate should the P&ID use?

A) 25 m3/h
B) 100 m3/h
C) 300 m3/h
D) Unknown, requires confirmation`, topic: 'flow rate', affectedComponent: 'main line size, pump capacity, and flow instrument range', stakeholderFocus: ['designer', 'engineer'], communicationPurpose: 'Translate process capacity into visible line and pump sizing changes.' },
    { message: `What pump duty should be assumed?

A) Transfer pump, delta P approximately 3 bar
B) Booster pump, delta P approximately 10 bar
C) High-pressure feed pump, delta P approximately 25 bar
D) Unknown, requires vendor or process review`, topic: 'pressure duty', affectedComponent: 'pump duty and pressure protection', stakeholderFocus: ['engineer', 'operator'], communicationPurpose: 'Expose pressure assumptions that affect pump annotation and protection review.' },
    { message: `What downstream treatment configuration should be shown?

A) Direct treatment without heat exchanger
B) Plate heat exchanger before treatment
C) Shell-and-tube heat exchanger before treatment
D) Configuration uncertain, requires review`, topic: 'treatment configuration', affectedComponent: 'heat exchanger, bypass valves, and treatment train', stakeholderFocus: ['designer', 'engineer', 'operator'], communicationPurpose: 'Show how a treatment choice changes the candidate P&ID layout.' },
    { message: `Should the system generate a reviewable P&ID candidate now?

A) Yes, generate the candidate
B) Generate the candidate and flag all assumptions
C) Do not generate, more information is required
D) Export the decision log only`, topic: 'review gate', affectedComponent: 'candidate P&ID status', stakeholderFocus: ['designer', 'engineer', 'operator'], communicationPurpose: 'Make the human review gate explicit before showing a detailed candidate.' },
    { message: `Generating a reviewable P&ID candidate from the recorded decisions...

The candidate layout, equipment annotations, line sizing, material schedule, and review queue now reflect the selected answers.

Switching to Detailed Candidate View.`, topic: 'translate', affectedComponent: 'detailed P&ID candidate', stakeholderFocus: ['engineer', 'operator'], communicationPurpose: 'Document the translation step and keep review responsibility visible.', expectsUserDecision: false }
];


const DECISION_LOG_STORAGE_KEY = 'codesign.decisionLog.v1';

const INITIAL_CANDIDATE: DesignCandidate = {
    fluid: 'Not selected',
    material: 'TBD',
    lineSize: 'TBD',
    flowInstrument: 'TBD',
    pumpDuty: 'TBD',
    pressureProtection: 'TBD',
    treatment: 'TBD',
    heatExchanger: 'Not selected',
    bypass: 'TBD',
    status: 'Drafting',
    reviewItems: [],
    updatedTopics: []
};

const WELCOME_MESSAGE = 'Welcome to CoDesign. I help teams refine a conceptual PFD into a reviewable P&ID candidate by asking design questions, separating human decisions from AI assumptions, and logging the decision trail.\n\nSend any message to begin the design conversation.';

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

function needsOptionClarification(step: ConversationStep, response: string): boolean {
    if (step.expectsUserDecision === false) return false;
    if (!/\nA\)/.test(step.message)) return false;
    const normalized = response.trim();
    return /^[1-9][.)]?$/.test(normalized);
}

function optionClarificationMessage(response: string): string {
    return `I saw "${response.trim()}", but this question uses A-D options. Please answer with A, B, C, or D so the decision log can record the exchange without guessing.`;
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
        'process fluid': ['Source-1', 'Pump-1', 'HEX-1'],
        'flow rate': ['Source-1', 'Pump-1', 'HEX-1'],
        'pressure duty': ['Pump-1'],
        'treatment configuration': ['HEX-1', 'Sink-1'],
        'review gate': ['Source-1', 'Pump-1', 'HEX-1', 'Sink-1'],
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

function optionLetter(response: string): string {
    return response.trim().match(/^[A-D]/i)?.[0].toUpperCase() || '';
}

function inferCandidateOption(entry: DecisionLogEntry): string {
    const direct = optionLetter(entry.humanOrAiResponse) || optionLetter(entry.decision);
    if (direct) return direct;
    const text = `${entry.humanOrAiResponse} ${entry.decision}`.toLowerCase();

    if (entry.topic === 'process fluid') {
        if (text.includes('clean water')) return 'A';
        if (text.includes('pfas') || text.includes('water-based') || text.includes('groundwater')) return 'B';
        if (text.includes('corrosive')) return 'C';
        if (text.includes('slurry') || text.includes('solids')) return 'D';
    }

    if (entry.topic === 'flow rate') {
        if (text.includes('unknown') || text.includes('requires confirmation')) return 'D';
        if (text.includes('300') || text.includes('dn150')) return 'C';
        if (text.includes('100') || text.includes('dn100')) return 'B';
        if (text.includes('25') || text.includes('dn50')) return 'A';
    }

    if (entry.topic === 'pressure duty') {
        if (text.includes('unknown') || text.includes('vendor') || text.includes('process review')) return 'D';
        if (text.includes('25 bar') || text.includes('high-pressure')) return 'C';
        if (text.includes('10 bar') || text.includes('booster')) return 'B';
        if (text.includes('3 bar') || text.includes('transfer')) return 'A';
    }

    if (entry.topic === 'treatment configuration') {
        if (text.includes('uncertain') || text.includes('unknown') || text.includes('unresolved')) return 'D';
        if (text.includes('shell')) return 'C';
        if (text.includes('plate')) return 'B';
        if (text.includes('direct') || text.includes('no heat')) return 'A';
    }

    if (entry.topic === 'review gate') {
        if (text.includes('log only') || text.includes('export')) return 'D';
        if (text.includes('more information') || text.includes('blocked')) return 'C';
        if (text.includes('assumption')) return 'B';
        if (text.includes('ready') || text.includes('yes') || text.includes('generate')) return 'A';
    }

    return '';
}

function uniqueReviewItems(items: string[]): string[] {
    return Array.from(new Set(items.filter(Boolean)));
}

function applyDecisionToCandidate(candidate: DesignCandidate, entry: DecisionLogEntry): DesignCandidate {
    const option = inferCandidateOption(entry);
    const next: DesignCandidate = {
        ...candidate,
        reviewItems: [...candidate.reviewItems],
        updatedTopics: uniqueReviewItems([...candidate.updatedTopics, entry.topic])
    };

    if (entry.topic === 'process fluid') {
        if (option === 'A') Object.assign(next, { fluid: 'Clean water', material: 'Carbon steel or PVC', pressureProtection: next.pressureProtection });
        if (option === 'B') Object.assign(next, { fluid: 'PFAS-contaminated water', material: 'SS316 / HDPE', pressureProtection: next.pressureProtection });
        if (option === 'C') Object.assign(next, { fluid: 'Corrosive chemical', material: 'Duplex or lined alloy' });
        if (option === 'D') Object.assign(next, { fluid: 'Slurry / solids stream', material: 'Abrasion-resistant lined pipe' });
        if (['B', 'C', 'D'].includes(option)) next.reviewItems.push('Confirm fluid chemistry and material compatibility.');
    }

    if (entry.topic === 'flow rate') {
        const values: Record<string, [string, string]> = {
            A: ['DN50', 'FT-101: 0-50 m3/h; pump flow 25 m3/h'],
            B: ['DN100', 'FT-101: 0-150 m3/h; pump flow 100 m3/h'],
            C: ['DN150', 'FT-101: 0-400 m3/h; pump flow 300 m3/h'],
            D: ['TBD', 'Flow basis unknown; confirmation required']
        };
        const selected = values[option] || values.B;
        next.lineSize = selected[0];
        next.flowInstrument = selected[1];
        if (option === 'C') next.reviewItems.push('Check pressure drop and pump capacity for 300 m3/h operation.');
        if (option === 'D') next.reviewItems.push('Confirm design flow before sizing pipe, pump, and flowmeter.');
    }

    if (entry.topic === 'pressure duty') {
        const values: Record<string, [string, string]> = {
            A: ['Transfer pump; delta P approx. 3 bar', 'PI on discharge'],
            B: ['Booster pump; delta P approx. 10 bar', 'PT + high-pressure alarm'],
            C: ['High-pressure feed pump; delta P approx. 25 bar', 'PT + interlock / relief review'],
            D: ['Pump duty unknown', 'Vendor or process review required']
        };
        const selected = values[option] || values.B;
        next.pumpDuty = selected[0];
        next.pressureProtection = selected[1];
        if (['C', 'D'].includes(option)) next.reviewItems.push('Confirm pump curve, NPSH, pressure protection, and interlock/relief need.');
    }

    if (entry.topic === 'treatment configuration') {
        const values: Record<string, [string, string, string]> = {
            A: ['Direct treatment train', 'No heat exchanger', 'No HX bypass required'],
            B: ['Treatment with thermal conditioning', 'Plate heat exchanger', 'HX bypass + isolation valves'],
            C: ['Treatment with robust thermal conditioning', 'Shell-and-tube heat exchanger', 'HX bypass + maintenance isolation'],
            D: ['Treatment configuration unresolved', 'Hold for review', 'Bypass strategy TBD']
        };
        const selected = values[option] || values.A;
        next.treatment = selected[0];
        next.heatExchanger = selected[1];
        next.bypass = selected[2];
        if (['B', 'C', 'D'].includes(option)) next.reviewItems.push('Review treatment layout, HX need, and maintenance access.');
    }

    if (entry.topic === 'review gate') {
        if (option === 'A') next.status = 'Ready for Review';
        if (option === 'B') {
            next.status = 'Assumptions Only';
            next.reviewItems.push('All AI/human assumptions must be reviewed before use.');
        }
        if (option === 'C') {
            next.status = 'Blocked';
            next.reviewItems.push('Candidate blocked until missing information is supplied.');
        }
        if (option === 'D') next.status = 'Decision Log Only';
    }

    next.reviewItems = uniqueReviewItems(next.reviewItems);
    return next;
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
    agentGenerating: boolean;
    tasks: DesignTask[];
    tokenBudget: TokenBudget;
    terminalLogs: TerminalLog[];
    conversationStep: number;
    decisionLog: DecisionLogEntry[];
    candidate: DesignCandidate;

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
    generateDecisionLogWithAgent: (scenario?: string) => Promise<void>;
    restartSession: () => void;
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
        { id: '1', sender: 'ai', text: WELCOME_MESSAGE, timestamp: Date.now() }
    ],
    assumptionMode: false,
    loading: false,
    aiResponding: false,
    conversationComplete: false,
    agentGenerating: false,
    tasks: createDefaultTasks(),
    tokenBudget: {
        total: parseInt(import.meta.env.VITE_TOKEN_BUDGET || '20000', 10),
        used: 0
    },
    terminalLogs: [],
    conversationStep: 0,
    decisionLog: [],
    candidate: INITIAL_CANDIDATE,

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
        const detailedReady = ['Ready for Review', 'Assumptions Only'].includes(state.candidate.status);

        if (view === 'detailed' && !detailedReady) {
            addTerminalLog('warning', 'Detailed P&ID candidate is locked until the review gate allows generation.');
            return;
        }

        const updates: Partial<DesignState> = { activeView: view };

        if (view === 'detailed') {
            addTerminalLog('processing', 'Generating reviewable detailed P&ID candidate...');

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
            if (answeredStep && needsOptionClarification(answeredStep, text)) {
                addTerminalLog('warning', `Ambiguous option response received: "${text}"`);
                set({
                    chatMessages: [...newMessages, {
                        id: Date.now().toString() + '-clarify',
                        sender: 'ai' as const,
                        text: optionClarificationMessage(text),
                        timestamp: Date.now()
                    }],
                    aiResponding: false
                });
                return;
            }

            if (answeredStep && answeredStep.expectsUserDecision !== false) {
                const decisionEntry = createDecisionLogEntry(answeredStep, text, responseSource || 'human');
                const decisionLog = [...state.decisionLog, decisionEntry];
                persistDecisionLog(decisionLog);
                updates.decisionLog = decisionLog;
                updates.conceptualGraph = applyDecisionToGraph(state.conceptualGraph, decisionEntry);
                updates.candidate = applyDecisionToCandidate(state.candidate, decisionEntry);
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
        const header = [
            'timestamp',
            'exchange_id',
            'topic',
            'question_from',
            'question_text',
            'response_from',
            'response_type',
            'response_text',
            'decision_extracted',
            'confidence',
            'stakeholder_focus',
            'affected_component',
            'communication_purpose',
            'outcome'
        ];
        const rows = get().decisionLog.map((entry, index) => [
            new Date(entry.timestamp).toISOString(),
            `exchange-${index + 1}`,
            entry.topic,
            'AI Design Assistant',
            entry.designQuestion,
            entry.responseSource === 'ai_default' ? 'Test Agent' : 'Human User',
            entry.responseSource === 'ai_default' ? 'AI-generated assumption' : 'Human-confirmed response',
            entry.humanOrAiResponse,
            entry.decision,
            entry.confidence,
            entry.stakeholderFocus.join('; '),
            entry.affectedComponent,
            entry.communicationPurpose,
            entry.outcome
        ]);
        return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    },

    clearDecisionLog: () => {
        persistDecisionLog([]);
        set({ decisionLog: [], candidate: INITIAL_CANDIDATE, activeView: 'conceptual', conversationComplete: false, conversationStep: 0 });
    },

    generateDecisionLogWithAgent: async (scenario = 'PFAS treatment process: feed tank, pump, heat exchanger, and downstream treatment unit') => {
        const { addTerminalLog } = get();
        set({ agentGenerating: true });
        addTerminalLog('processing', 'AI agent generating decision-query-outcome log...');
        try {
            const response = await fetch('/api/agent/generate-decision-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scenario })
            });
            const data = await response.json();
            if (!response.ok || !data.ok) {
                throw new Error(data.error || 'Decision-log generation failed');
            }
            const entries = (data.entries || []) as DecisionLogEntry[];
            let graph = get().conceptualGraph;
            let candidate = get().candidate;
            for (const entry of entries) {
                graph = applyDecisionToGraph(graph, entry);
                candidate = applyDecisionToCandidate(candidate, entry);
            }

            const now = Date.now();
            const agentTranscript = entries.flatMap((entry, index) => ([
                {
                    id: `agent-question-${now}-${index}`,
                    sender: 'ai' as const,
                    text: `Agent test run ${index + 1}/${entries.length}\n\n${entry.designQuestion}`,
                    timestamp: now + index * 2000
                },
                {
                    id: `agent-answer-${now}-${index}`,
                    sender: 'user' as const,
                    text: entry.humanOrAiResponse,
                    timestamp: now + index * 2000 + 1000,
                    source: 'ai_default' as const
                }
            ]));

            persistDecisionLog(entries);
            set(state => ({
                chatMessages: [
                    ...state.chatMessages,
                    ...agentTranscript,
                    {
                        id: `agent-summary-${now}`,
                        sender: 'ai' as const,
                        text: `Agent test run complete. ${entries.length} AI-default responses were converted into decision-log entries for human review.`,
                        timestamp: now + entries.length * 2000 + 1000
                    }
                ],
                decisionLog: entries,
                conceptualGraph: graph,
                candidate,
                selectedNode: graph.nodes.find(node => node.reviewRequired) || graph.nodes[0] || null,
                conversationComplete: true,
                conversationStep: CONVERSATION_SCRIPT.length,
                agentGenerating: false
            }));
            addTerminalLog(
                data.mode === 'openai' ? 'success' : 'warning',
                `AI agent generated ${entries.length} decision-log entries (${data.mode}).`
            );
        } catch (error) {
            set({ agentGenerating: false });
            addTerminalLog('warning', error instanceof Error ? error.message : String(error));
        }
    },

    setAssumptionMode: (enabled) => set({ assumptionMode: enabled }),

    restartSession: () => {
        persistDecisionLog([]);
        set({
            activeView: 'conceptual',
            selectedNode: null,
            chatMessages: [
                { id: `welcome-${Date.now()}`, sender: 'ai', text: WELCOME_MESSAGE, timestamp: Date.now() }
            ],
            assumptionMode: false,
            loading: false,
            aiResponding: false,
            conversationComplete: false,
            agentGenerating: false,
            tasks: createDefaultTasks(),
            tokenBudget: {
                total: parseInt(import.meta.env.VITE_TOKEN_BUDGET || '20000', 10),
                used: 0
            },
            terminalLogs: [],
            conversationStep: 0,
            decisionLog: [],
            candidate: INITIAL_CANDIDATE
        });
        get().loadData();
    }
}));
