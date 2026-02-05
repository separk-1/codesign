import { useState, useRef, useEffect } from 'react';
import { useDesignStore, ChatMessage } from '../store/designStore';
import { Intent, MotifCandidate, NozzleMapping, SpecInfo } from '../services/collaborationService';

// ── Sub-components for Rich Interaction ──────────────────────────────

const IntentReview = ({ intent, onConfirm }: { intent: Intent, onConfirm: () => void }) => (
    <div style={{ marginTop: 8, background: 'rgba(15, 23, 42, 0.5)', padding: 10, borderRadius: 6, border: '1px solid #475569' }}>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 4 }}>INTENT DETECTED</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: '0.9rem' }}>
            <span style={{ color: '#cbd5e1' }}>Action:</span>
            <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{intent.action.toUpperCase()}</span>
            <span style={{ color: '#cbd5e1' }}>Source:</span>
            <span style={{ color: '#3b82f6' }}>{intent.sourceType}</span>
            <span style={{ color: '#cbd5e1' }}>Target:</span>
            <span style={{ color: '#ec4899' }}>{intent.targetType}</span>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button
                onClick={onConfirm}
                style={{ flex: 1, padding: '6px', background: '#22c55e', border: 'none', borderRadius: 4, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}
            >
                Confirm Intent
            </button>
            <button style={{ flex: 1, padding: '6px', background: 'transparent', border: '1px solid #64748b', borderRadius: 4, color: '#cbd5e1', cursor: 'pointer', fontSize: '0.8rem' }}>
                Edit
            </button>
        </div>
    </div>
);

const MotifSelection = ({ candidates, onSelect }: { candidates: MotifCandidate[], onSelect: (m: MotifCandidate) => void }) => (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {candidates.map(c => (
            <div key={c.id} style={{ background: 'rgba(30, 41, 59, 0.8)', border: '1px solid #475569', borderRadius: 6, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>{c.name}</span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{(c.confidence * 100).toFixed(0)}% Match</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 8 }}>{c.description}</div>
                <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginBottom: 8 }}>
                    Components: {c.components.join(' → ')}
                </div>
                <button
                    onClick={() => onSelect(c)}
                    style={{ width: '100%', padding: '6px', background: '#3b82f6', border: 'none', borderRadius: 4, color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                    Select Strategy
                </button>
            </div>
        ))}
    </div>
);

const NozzleMappingReview = ({ mapping, onConfirm }: { mapping: NozzleMapping, onConfirm: () => void }) => (
    <div style={{ marginTop: 8, background: 'rgba(15, 23, 42, 0.5)', padding: 10, borderRadius: 6, border: '1px solid #475569' }}>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>PROPOSED NOZZLE MAPPING</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: 10 }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#3b82f6', fontWeight: 600 }}>Source</div>
                <div style={{ fontSize: '0.8rem' }}>{mapping.sourceNozzle}</div>
            </div>
            <div style={{ color: '#64748b' }}>➔</div>
            <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#ec4899', fontWeight: 600 }}>Target</div>
                <div style={{ fontSize: '0.8rem' }}>{mapping.targetNozzle}</div>
            </div>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 10, fontStyle: 'italic' }}>
            "{mapping.description}"
        </div>
        <button
            onClick={onConfirm}
            style={{ width: '100%', padding: '6px', background: '#22c55e', border: 'none', borderRadius: 4, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}
        >
            Confirm Mapping
        </button>
    </div>
);

const SpecSelection = ({ spec, onConfirm }: { spec: SpecInfo, onConfirm: () => void }) => (
    <div style={{ marginTop: 8, background: 'rgba(15, 23, 42, 0.5)', padding: 10, borderRadius: 6, border: '1px solid #475569' }}>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 6 }}>SPECIFICATION RECOMMENDED</div>
        <div style={{ fontSize: '0.85rem', color: '#e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            <div><span style={{ color: '#64748b' }}>Line:</span> {spec.lineType}</div>
            <div><span style={{ color: '#64748b' }}>Size:</span> {spec.size}</div>
            <div><span style={{ color: '#64748b' }}>Mat:</span> {spec.material}</div>
            <div><span style={{ color: '#64748b' }}>Ins:</span> {spec.insulation}</div>
        </div>
        <button
            onClick={onConfirm}
            style={{ width: '100%', padding: '6px', background: '#22c55e', border: 'none', borderRadius: 4, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}
        >
            Apply to Design
        </button>
    </div>
);


// ── Main Component ──────────────────────────────────────────────────

export const ChatPanel = () => {
    const {
        chatMessages,
        processUserMessage,
        confirmIntent,
        selectMotif,
        confirmNozzleMapping,
        confirmSpec,
        assumptionMode, setAssumptionMode,
        workflowStep
    } = useDesignStore();

    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatMessages, workflowStep]);

    const handleSend = () => {
        if (!input.trim()) return;

        // Use the new workflow processor
        processUserMessage(input.trim());
        setInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSend();
    };

    // Helper to render message content based on type
    const renderMessageContent = (msg: ChatMessage) => {
        // Base text
        const textContent = <div>{msg.text}</div>;

        // Rich Content Layers
        if (msg.type === 'intent_review' && msg.data) {
            return (
                <>
                    {textContent}
                    <IntentReview intent={msg.data} onConfirm={() => confirmIntent(msg.data)} />
                </>
            );
        }
        if (msg.type === 'motif_selection' && msg.data) {
            return (
                <>
                    {textContent}
                    <MotifSelection candidates={msg.data} onSelect={(m) => selectMotif(m)} />
                </>
            );
        }
        if (msg.type === 'nozzle_mapping' && msg.data) {
            return (
                <>
                    {textContent}
                    <NozzleMappingReview mapping={msg.data} onConfirm={() => confirmNozzleMapping(msg.data)} />
                </>
            );
        }
        if (msg.type === 'spec_selection' && msg.data) {
            return (
                <>
                    {textContent}
                    <SpecSelection spec={msg.data} onConfirm={() => confirmSpec(msg.data)} />
                </>
            );
        }

        return textContent;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e293b', borderLeft: '1px solid #334155' }}>
            <div className="panel-title" style={{ padding: '10px', background: '#0f172a', borderBottom: '1px solid #334155', fontWeight: 'bold', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                <span>AI DESIGN ASSISTANT</span>
                <label style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: '0.7rem', fontWeight: 400, color: '#94a3b8', cursor: 'pointer'
                }}>
                     <input
                        type="checkbox"
                        checked={assumptionMode}
                        onChange={(e) => setAssumptionMode(e.target.checked)}
                        style={{ accentColor: '#3b82f6' }}
                    />
                    <span>Auto-Mode</span>
                </label>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {chatMessages.map((msg: ChatMessage) => (
                    <div key={msg.id} style={{
                        alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '90%',
                        padding: '12px',
                        borderRadius: '8px',
                        background: msg.sender === 'user'
                            ? '#3b82f6'
                            : '#334155',
                        color: '#fff',
                        fontSize: '0.95rem',
                        lineHeight: '1.5',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', opacity: 0.7, marginBottom: '6px' }}>
                            <span>{msg.sender === 'user' ? 'You' : 'AI Assistant'}</span>
                        </div>
                        {renderMessageContent(msg)}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '10px', borderTop: '1px solid #334155', background: '#0f172a' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={workflowStep !== 'IDLE' ? "Interacting with workflow..." : "Type 'Connect pump to heat exchanger'..."}
                        disabled={workflowStep !== 'IDLE' && workflowStep !== 'INTENT_REVIEW' && workflowStep !== 'MOTIF_SELECTION' && workflowStep !== 'NOZZLE_MAPPING' && workflowStep !== 'SPEC_SELECTION'}
                        // Actually, we usually want input disabled if we are waiting for user to CLICK a button,
                        // but sometimes user might want to abort with text. For this demo, let's keep it simple.
                        style={{
                            flex: 1,
                            padding: '10px',
                            borderRadius: '4px',
                            border: '1px solid #475569',
                            background: '#1e293b',
                            color: '#fff',
                            outline: 'none',
                            fontSize: '0.9rem'
                        }}
                    />
                    <button
                        onClick={handleSend}
                        style={{
                            padding: '10px 18px',
                            borderRadius: '4px',
                            border: 'none',
                            background: '#3b82f6',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '0.85rem'
                        }}
                    >
                        SEND
                    </button>
                </div>
            </div>
        </div>
    );
};
