import { useState, useRef, useEffect } from 'react';
import { useDesignStore, ChatMessage } from '../store/designStore';

interface AutoFillRule {
    keywords: string[];
    answers: string[];
    confidence: 'review';
}

const AUTO_FILL_RULES: AutoFillRule[] = [
    {
        keywords: ['fluid/material basis', 'fluid is being processed', 'fluid/material'],
        answers: ['B) PFAS-contaminated water', 'A) Clean water', 'C) Corrosive chemical', 'D) Slurry / solids-containing stream'],
        confidence: 'review'
    },
    {
        keywords: ['flow rate', 'design flow'],
        answers: ['B) 100 m3/h', 'A) 25 m3/h', 'C) 300 m3/h', 'D) Unknown, requires confirmation'],
        confidence: 'review'
    },
    {
        keywords: ['pump duty', 'pressure-duty', 'pressure duty'],
        answers: ['B) Booster pump, delta P approximately 10 bar', 'A) Transfer pump, delta P approximately 3 bar', 'C) High-pressure feed pump, delta P approximately 25 bar', 'D) Unknown, requires vendor or process review'],
        confidence: 'review'
    },
    {
        keywords: ['treatment configuration', 'downstream treatment'],
        answers: ['B) Plate heat exchanger before treatment', 'A) Direct treatment without heat exchanger', 'C) Shell-and-tube heat exchanger before treatment', 'D) Configuration uncertain, requires review'],
        confidence: 'review'
    },
    {
        keywords: ['reviewable p&id candidate', 'generate a reviewable', 'review gate'],
        answers: ['B) Generate the candidate and flag all assumptions', 'A) Yes, generate the candidate', 'C) Do not generate, more information is required', 'D) Export the decision log only'],
        confidence: 'review'
    },
];

function chooseAssumptionAnswer(rule: AutoFillRule, aiText: string): string {
    const questionOnly = aiText.split(/\n\s*A\)/i)[0] || aiText;
    const lower = questionOnly.toLowerCase();
    if (lower.includes('unknown') || lower.includes('uncertain') || lower.includes('requires review')) {
        return rule.answers.find(answer => answer.startsWith('D)')) || rule.answers[0];
    }
    if (lower.includes('pfas')) return rule.answers.find(answer => answer.toLowerCase().includes('pfas')) || rule.answers[0];
    if (lower.includes('clean water')) return rule.answers.find(answer => answer.toLowerCase().includes('clean water')) || rule.answers[0];
    if (lower.includes('300')) return rule.answers.find(answer => answer.includes('300')) || rule.answers[0];
    if (lower.includes('25 bar') || lower.includes('high-pressure')) return rule.answers.find(answer => answer.includes('25 bar') || answer.toLowerCase().includes('high-pressure')) || rule.answers[0];
    if (lower.includes('shell')) return rule.answers.find(answer => answer.toLowerCase().includes('shell')) || rule.answers[0];
    if (lower.includes('direct treatment')) return rule.answers.find(answer => answer.toLowerCase().includes('direct')) || rule.answers[0];
    const seed = Array.from(questionOnly).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return rule.answers[seed % Math.min(rule.answers.length, 3)];
}

function isActiveDesignQuestion(aiText: string): boolean {
    return /^Design question\s+\d+\/\d+/i.test(aiText.trim());
}

function getDefaultAnswer(aiText: string): { answer: string; confidence: 'review' } | null {
    if (!isActiveDesignQuestion(aiText)) return null;
    const lower = aiText.toLowerCase();
    for (const rule of AUTO_FILL_RULES) {
        if (rule.keywords.some(k => lower.includes(k))) {
            return { answer: chooseAssumptionAnswer(rule, aiText), confidence: rule.confidence };
        }
    }
    return null;
}


function looksLikeGraphRagQuestion(text: string): boolean {
    const lower = text.toLowerCase().trim();
    if (!lower.includes('?') && !/^(what|which|where|how|show|list|find|is|are|does|do)\b/.test(lower)) return false;
    return [
        'equipment', 'equipments', 'connected', 'connect', 'connection', 'pipe', 'pipes',
        'p&id', 'pid', 'graph', 'node', 'link', 'edge', 'nozzle', 'tag', 'line',
        'pump', 'heat exchanger', 'tank', 'valve', 'instrument', 'note', 'notes', 'annotation', 'evidence', 'review item'
    ].some(keyword => lower.includes(keyword));
}

export const ChatPanel = () => {
    const isGac = useDesignStore(s => s.selectedInputDesignId === 'gac-workspace');
    const {
        chatMessages, addChatMessage,
        assumptionMode,
        askGraphRagQuestion,
        aiResponding
    } = useDesignStore();
    useEffect(() => { useDesignStore.setState({ assumptionMode: false }); }, []);
    const [input, setInput] = useState('');
    const [currentConfidence, setCurrentConfidence] = useState<'review' | null>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const followLatestRef = useRef(true);

    const scrollToBottom = () => {
        const messages = messagesRef.current;
        if (messages && followLatestRef.current) messages.scrollTop = messages.scrollHeight;
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatMessages]);

    // When assumption mode is on and the last message is from AI, auto-fill the input
    useEffect(() => {
        if (!assumptionMode) {
            setCurrentConfidence(null);
            return;
        }
        const last = chatMessages[chatMessages.length - 1];
        if (last?.sender === 'ai') {
            const result = getDefaultAnswer(last.text);
            if (result) {
                setInput(result.answer);
                setCurrentConfidence(result.confidence);
            } else {
                setCurrentConfidence(null);
            }
        }
    }, [chatMessages, assumptionMode]);

    const handleSend = () => {
        if (!input.trim() || aiResponding) return;

        const userMsg = input.trim();
        followLatestRef.current = true;
        // Determine source: if assumption mode is on and the input matches a default, mark as ai_default
        const last = chatMessages[chatMessages.length - 1];
        const defaultResult = last?.sender === 'ai' ? getDefaultAnswer(last.text) : null;
        const source = (assumptionMode && defaultResult && userMsg === defaultResult.answer) ? 'ai_default' : 'human';

        if (!isGac && looksLikeGraphRagQuestion(userMsg)) {
            askGraphRagQuestion(userMsg);
        } else {
            addChatMessage('user', userMsg, source);
        }
        setInput('');
        setCurrentConfidence(null);
        inputRef.current?.focus({ preventScroll: true });
        // Normal design-question responses are handled by the store's advanceConversation action.
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', background: '#1e293b', borderLeft: '1px solid #334155' }}>
            <div ref={messagesRef} className="chat-messages" onScroll={e => {
                const messages = e.currentTarget;
                followLatestRef.current = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 50;
            }} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {chatMessages.map((msg: ChatMessage) => {
                    const displayName = msg.sender === 'ai' ? 'AI Assistant' : (msg.source === 'ai_default' ? 'Test Agent' : 'You');
                    return (
                    <div key={msg.id} style={{
                        flexShrink: 0,
                        alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: msg.sender === 'user'
                            ? (msg.source === 'ai_default' ? '#475569' : '#3b82f6')
                            : '#334155',
                        color: '#fff',
                        fontSize: '0.95rem',
                        lineHeight: '1.5',
                        whiteSpace: 'pre-wrap',
                        border: msg.source === 'ai_default' ? '1px dashed #64748b' : 'none'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', opacity: 0.7, marginBottom: '3px' }}>
                            <span>{displayName}</span>

                        </div>
                        {msg.text}
                    </div>
                    );
                })}
            </div>

            <div style={{ flex: '0 0 auto', padding: '10px', borderTop: '1px solid #334155', background: '#0f172a' }}>
                {assumptionMode && input && currentConfidence && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: '0.7rem', color: '#64748b', marginBottom: 4,
                    }}>
                        <span style={{
                            padding: '1px 6px',
                            borderRadius: 3,
                            fontWeight: 700,
                            fontSize: '0.6rem',
                            letterSpacing: '0.03em',
                            background: 'rgba(234,179,8,0.2)',
                            color: '#eab308',
                            border: '1px solid #eab308',
                        }}>
                            AI ASSUMPTION · REVIEW
                        </span>
                        <span style={{ fontStyle: 'italic' }}>
                            AI default answer — edit or press Enter to accept
                        </span>
                    </div>
                )}
                <div style={{ display: 'flex', gap: '6px' }}>
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            // Clear confidence if user edits away from the auto-filled value
                            const last = chatMessages[chatMessages.length - 1];
                            const result = last?.sender === 'ai' ? getDefaultAnswer(last.text) : null;
                            if (result && e.target.value !== result.answer) {
                                setCurrentConfidence(null);
                            }
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={aiResponding ? 'Replying... You can type your next message.' : 'Type a message...'}
                        aria-busy={aiResponding}
                        rows={1}
                        style={{
                            flex: 1,
                            minHeight: 42,
                            maxHeight: 80,
                            resize: 'none',
                            padding: '10px',
                            borderRadius: '4px',
                            border: '1px solid #475569',
                            background: '#1e293b',
                            color: '#fff',
                            outline: 'none',
                            fontSize: '0.85rem',
                            lineHeight: 1.35,
                            opacity: 1
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={aiResponding}
                        style={{
                            padding: '10px 18px',
                            borderRadius: '4px',
                            border: 'none',
                            background: '#3b82f6',
                            color: '#fff',
                            cursor: aiResponding ? 'not-allowed' : 'pointer',
                            opacity: aiResponding ? 0.6 : 1,
                            fontWeight: 'bold',
                            fontSize: '0.85rem'
                        }}
                    >
                        {aiResponding ? '...' : 'SEND'}
                    </button>
                </div>
            </div>
        </div>
    );
};
