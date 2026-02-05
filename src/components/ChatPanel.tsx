import { useState, useRef, useEffect } from 'react';
import { useDesignStore, ChatMessage } from '../store/designStore';

export const ChatPanel = () => {
    const { chatMessages, addChatMessage, activeView, setActiveView } = useDesignStore();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatMessages]);

    const handleSend = () => {
        if (!input.trim()) return;

        const userMsg = input.trim();
        addChatMessage('user', userMsg);
        setInput('');

        // Mock AI Response
        setTimeout(() => {
            let aiResponse = "I'm not sure how to handle that request.";

            if (userMsg.toLowerCase().includes('convert') || userMsg.toLowerCase().includes('detail')) {
                aiResponse = "Translating Conceptual Design to Detailed Design... I have mapped the 'Feed Pump' to a Centrifugal Pump (P-4713) and the 'Pre-Heater' to a Plate Heat Exchanger (H-1009). Switching to Detailed View.";
                // Trigger view switch
                setTimeout(() => setActiveView('detailed'), 1500);
            } else if (userMsg.toLowerCase().includes('hello') || userMsg.toLowerCase().includes('hi')) {
                aiResponse = "Hello! I can help you automate your design process. Try asking me to 'convert to detailed design'.";
            } else if (userMsg.toLowerCase().includes('concept')) {
                aiResponse = "Switching back to Conceptual View.";
                setTimeout(() => setActiveView('conceptual'), 500);
            }

            addChatMessage('ai', aiResponse);
        }, 1000);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSend();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e293b', borderLeft: '1px solid #334155' }}>
            <div className="panel-title" style={{ padding: '10px', background: '#0f172a', borderBottom: '1px solid #334155', fontWeight: 'bold', color: '#e2e8f0' }}>
                AI DESIGN ASSISTANT
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {chatMessages.map((msg: ChatMessage) => (
                    <div key={msg.id} style={{
                        alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: msg.sender === 'user' ? '#3b82f6' : '#334155',
                        color: '#fff',
                        fontSize: '0.9rem',
                        lineHeight: '1.4'
                    }}>
                        <div style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '2px' }}>
                            {msg.sender === 'user' ? 'You' : 'AI Assistant'}
                        </div>
                        {msg.text}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '10px', borderTop: '1px solid #334155', background: '#0f172a' }}>
                <div style={{ display: 'flex', gap: '5px' }}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        style={{
                            flex: 1,
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #475569',
                            background: '#1e293b',
                            color: '#fff',
                            outline: 'none'
                        }}
                    />
                    <button
                        onClick={handleSend}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: 'none',
                            background: '#3b82f6',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        SEND
                    </button>
                </div>
            </div>
        </div>
    );
};
