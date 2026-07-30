import { useState, useRef, useEffect } from 'react';
import { useDesignStore, ChatMessage } from '../store/designStore';

interface AutoFillRule {
    keywords: string[];
    answer: string;
    confidence: 'high' | 'medium';
}

const AUTO_FILL_RULES: AutoFillRule[] = [
    { keywords: ['fluid', 'processed'], answer: 'B', confidence: 'medium' },
    { keywords: ['flow rate'], answer: 'B', confidence: 'medium' },
    { keywords: ['pump duty'], answer: 'B', confidence: 'medium' },
    { keywords: ['treatment configuration'], answer: 'B', confidence: 'medium' },
    { keywords: ['reviewable p&id candidate'], answer: 'B', confidence: 'medium' },
];

function getDefaultAnswer(aiText: string): { answer: string; confidence: 'high' | 'medium' } | null {
    const lower = aiText.toLowerCase();
    for (const rule of AUTO_FILL_RULES) {
        if (rule.keywords.some(k => lower.includes(k))) {
            return { answer: rule.answer, confidence: rule.confidence };
        }
    }
    return null;
}

export const ChatPanel = () => {
    const {
        chatMessages, addChatMessage,
        assumptionMode, setAssumptionMode,
        aiResponding
    } = useDesignStore();
    const [input, setInput] = useState('');
    const [currentConfidence, setCurrentConfidence] = useState<'high' | 'medium' | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        // Determine source: if assumption mode is on and the input matches a default, mark as ai_default
        const last = chatMessages[chatMessages.length - 1];
        const defaultResult = last?.sender === 'ai' ? getDefaultAnswer(last.text) : null;
        const source = (assumptionMode && defaultResult && userMsg === defaultResult.answer) ? 'ai_default' : 'human';

        addChatMessage('user', userMsg, source);
        setInput('');
        setCurrentConfidence(null);
        // AI response is now handled by the store's advanceConversation action
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSend();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', background: '#1e293b', borderLeft: '1px solid #334155' }}>
            <div className="panel-title" style={{ padding: '10px', background: '#0f172a', borderBottom: '1px solid #334155', fontWeight: 'bold', color: '#e2e8f0' }}>
                <span>AI DESIGN ASSISTANT</span>
                <label style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: '0.7rem', fontWeight: 400, color: '#94a3b8', cursor: 'pointer', textTransform: 'none', letterSpacing: 0
                }}>
                    <input
                        type="checkbox"
                        checked={assumptionMode}
                        onChange={(e) => setAssumptionMode(e.target.checked)}
                        style={{ accentColor: '#3b82f6', cursor: 'pointer' }}
                    />
                    Assumption Mode
                </label>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {chatMessages.map((msg: ChatMessage) => {
                    const displayName = msg.sender === 'ai' ? 'AI Assistant' : (msg.source === 'ai_default' ? 'Test Agent' : 'You');
                    return (
                    <div key={msg.id} style={{
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
                            {msg.source && (
                                <span style={{
                                    fontSize: '0.6rem',
                                    padding: '1px 5px',
                                    borderRadius: 3,
                                    background: msg.source === 'ai_default' ? 'rgba(100,116,139,0.4)' : 'rgba(59,130,246,0.3)',
                                    marginLeft: 8
                                }}>
                                    {msg.source === 'ai_default' ? 'AI DEFAULT' : 'HUMAN'}
                                </span>
                            )}
                        </div>
                        {msg.text}
                    </div>
                    );
                })}
                <div ref={messagesEndRef} />
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
                            background: currentConfidence === 'high' ? 'rgba(34,197,94,0.2)' : 'rgba(234,179,8,0.2)',
                            color: currentConfidence === 'high' ? '#22c55e' : '#eab308',
                            border: `1px solid ${currentConfidence === 'high' ? '#22c55e' : '#eab308'}`,
                        }}>
                            {currentConfidence === 'high' ? 'HIGH CONF' : 'REVIEW'}
                        </span>
                        <span style={{ fontStyle: 'italic' }}>
                            Auto-filled — edit or press Enter to accept
                        </span>
                    </div>
                )}
                <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                        type="text"
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
                        placeholder={aiResponding ? 'Waiting for AI question...' : 'Type a message...'}
                        disabled={aiResponding}
                        style={{
                            flex: 1,
                            padding: '10px',
                            borderRadius: '4px',
                            border: '1px solid #475569',
                            background: '#1e293b',
                            color: '#fff',
                            outline: 'none',
                            fontSize: '0.9rem',
                            opacity: aiResponding ? 0.6 : 1
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
