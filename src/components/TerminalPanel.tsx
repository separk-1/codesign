import { useEffect, useRef } from 'react';
import { useDesignStore, TerminalLog } from '../store/designStore';

function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function getTypeColor(type: TerminalLog['type']): string {
    switch (type) {
        case 'success': return '#22c55e';  // green
        case 'info': return '#3b82f6';     // blue
        case 'warning': return '#eab308';  // yellow
        case 'processing': return '#8b5cf6'; // purple
        default: return '#94a3b8';
    }
}

export const TerminalPanel = () => {
    const terminalLogs = useDesignStore(state => state.terminalLogs);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [terminalLogs]);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: '#0a0f1a',
            borderLeft: '1px solid #334155'
        }}>
            <div
                className="panel-title"
                style={{
                    padding: '10px',
                    background: '#0f172a',
                    borderBottom: '1px solid #334155',
                    fontWeight: 'bold',
                    color: '#e2e8f0'
                }}
            >
                TERMINAL
            </div>

            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px',
                fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
                fontSize: '0.75rem',
                lineHeight: '1.6'
            }}>
                {terminalLogs.length === 0 && (
                    <div style={{ color: '#475569', fontStyle: 'italic' }}>
                        Waiting for activity...
                    </div>
                )}

                {terminalLogs.map((log) => (
                    <div
                        key={log.id}
                        style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px',
                            marginBottom: '4px',
                            opacity: log.type === 'processing' ? 0.9 : 1
                        }}
                    >
                        <span style={{ color: '#475569', flexShrink: 0 }}>
                            [{formatTimestamp(log.timestamp)}]
                        </span>
                        <span style={{
                            color: getTypeColor(log.type),
                            flexShrink: 0,
                            fontSize: '0.6rem',
                            lineHeight: '1.6rem'
                        }}>
                            {log.type === 'processing' ? (
                                <span className="terminal-spinner">●</span>
                            ) : '●'}
                        </span>
                        <span style={{
                            color: log.type === 'success' ? '#86efac' :
                                   log.type === 'warning' ? '#fde047' :
                                   '#e2e8f0',
                            wordBreak: 'break-word'
                        }}>
                            {log.message}
                        </span>
                    </div>
                ))}

                <div ref={bottomRef} />
            </div>

            <div style={{
                padding: '8px 12px',
                borderTop: '1px solid #334155',
                background: '#0f172a',
                fontSize: '0.65rem',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <span style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: terminalLogs.some(l => l.type === 'processing') ? '#8b5cf6' : '#22c55e',
                    boxShadow: terminalLogs.some(l => l.type === 'processing')
                        ? '0 0 6px #8b5cf6'
                        : '0 0 6px #22c55e'
                }} />
                <span>
                    {terminalLogs.some(l => l.type === 'processing') ? 'Processing...' : 'Ready'}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                    {terminalLogs.length} log{terminalLogs.length !== 1 ? 's' : ''}
                </span>
            </div>
        </div>
    );
};
