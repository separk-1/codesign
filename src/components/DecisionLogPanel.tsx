import { useDesignStore, DecisionLogEntry } from '../store/designStore';

function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortText(value: string, max = 92): string {
    return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function confidenceStyle(confidence: DecisionLogEntry['confidence']) {
    if (confidence === 'high') return { color: '#86efac', borderColor: '#22c55e', background: 'rgba(34,197,94,0.12)' };
    if (confidence === 'medium') return { color: '#bfdbfe', borderColor: '#3b82f6', background: 'rgba(59,130,246,0.12)' };
    return { color: '#fde047', borderColor: '#eab308', background: 'rgba(234,179,8,0.12)' };
}

export const DecisionLogPanel = () => {
    const decisionLog = useDesignStore(state => state.decisionLog);
    const exportDecisionLogCsv = useDesignStore(state => state.exportDecisionLogCsv);
    const clearDecisionLog = useDesignStore(state => state.clearDecisionLog);
    const exportUpdatedDexpiJson = useDesignStore(state => state.exportUpdatedDexpiJson);
    const candidate = useDesignStore(state => state.candidate);
    const generateDecisionLogWithAgent = useDesignStore(state => state.generateDecisionLogWithAgent);
    const agentGenerating = useDesignStore(state => state.agentGenerating);

    const handleExport = () => {
        const csv = exportDecisionLogCsv();
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `codesign_decision_log_${stamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDexpiExport = () => {
        const json = exportUpdatedDexpiJson();
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `codesign_updated_dexpi_${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: '0 0 230px', minHeight: 0, overflow: 'hidden', borderTop: '1px solid #334155' }}>
            <div className="panel-title" style={{ height: 34, background: '#0f172a' }}>
                <span>DECISION LOG</span>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button
                        onClick={() => generateDecisionLogWithAgent()}
                        disabled={agentGenerating}
                        style={{
                            border: '1px solid #38bdf8',
                            borderRadius: 4,
                            background: agentGenerating ? '#334155' : '#0e7490',
                            color: '#fff',
                            fontSize: '0.68rem',
                            padding: '3px 7px',
                            cursor: agentGenerating ? 'wait' : 'pointer'
                        }}
                    >
                        {agentGenerating ? 'RUNNING...' : 'AGENT RUN'}
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={decisionLog.length === 0}
                        style={{
                            border: '1px solid #475569',
                            borderRadius: 4,
                            background: decisionLog.length ? '#1d4ed8' : '#334155',
                            color: '#fff',
                            fontSize: '0.68rem',
                            padding: '3px 7px',
                            cursor: decisionLog.length ? 'pointer' : 'not-allowed'
                        }}
                    >
                        EXPORT CSV
                    </button>
                    <button
                        onClick={handleDexpiExport}
                        disabled={!['Ready for Review', 'Assumptions Only'].includes(candidate.status)}
                        style={{
                            border: '1px solid #475569',
                            borderRadius: 4,
                            background: ['Ready for Review', 'Assumptions Only'].includes(candidate.status) ? '#166534' : '#334155',
                            color: '#fff',
                            fontSize: '0.68rem',
                            padding: '3px 7px',
                            cursor: ['Ready for Review', 'Assumptions Only'].includes(candidate.status) ? 'pointer' : 'not-allowed'
                        }}
                    >
                        DEXPI JSON
                    </button>
                    <button
                        onClick={clearDecisionLog}
                        disabled={decisionLog.length === 0}
                        style={{
                            border: '1px solid #475569',
                            borderRadius: 4,
                            background: '#334155',
                            color: '#cbd5e1',
                            fontSize: '0.68rem',
                            padding: '3px 7px',
                            cursor: decisionLog.length ? 'pointer' : 'not-allowed'
                        }}
                    >
                        CLEAR
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
                {decisionLog.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '0.82rem', lineHeight: 1.45 }}>
                        No decisions recorded yet. Use AGENT RUN to simulate AI-default stakeholder responses, or answer the assistant manually to record human decisions.
                    </div>
                ) : (
                    decisionLog.slice().reverse().map(entry => {
                        const badge = confidenceStyle(entry.confidence);
                        return (
                            <div key={entry.id} style={{
                                border: '1px solid #334155',
                                borderRadius: 6,
                                padding: 9,
                                marginBottom: 8,
                                background: '#0f172a'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                                    <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.82rem' }}>{entry.topic}</div>
                                    <div style={{ color: '#64748b', fontSize: '0.68rem' }}>{formatTime(entry.timestamp)}</div>
                                </div>
                                <div style={{ color: '#94a3b8', fontSize: '0.68rem', lineHeight: 1.35, marginBottom: 5 }}>
                                    <span style={{ color: '#38bdf8', fontWeight: 700 }}>Q</span> {shortText(entry.designQuestion, 84)}
                                </div>
                                <div style={{ color: '#cbd5e1', fontSize: '0.78rem', lineHeight: 1.35, marginBottom: 6 }}>
                                    <span style={{ color: '#22c55e', fontWeight: 700 }}>Decision</span> {shortText(entry.decision, 74)}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                                    <span style={{ fontSize: '0.64rem', padding: '2px 6px', borderRadius: 999, border: '1px solid #475569', color: '#cbd5e1' }}>
                                        {entry.responseSource === 'ai_default' ? 'TEST AGENT' : 'HUMAN USER'}
                                    </span>
                                    <span style={{ fontSize: '0.64rem', padding: '2px 6px', borderRadius: 999, border: `1px solid ${badge.borderColor}`, color: badge.color, background: badge.background }}>
                                        {entry.confidence.toUpperCase()}
                                    </span>
                                    <span style={{ fontSize: '0.64rem', padding: '2px 6px', borderRadius: 999, border: '1px solid #475569', color: '#94a3b8' }}>
                                        {entry.affectedComponent}
                                    </span>
                                </div>
                                <details style={{ color: '#94a3b8', fontSize: '0.68rem', lineHeight: 1.35 }}>
                                    <summary style={{ cursor: 'pointer', color: '#64748b' }}>details</summary>
                                    <div style={{ marginTop: 5 }}>
                                        <div><strong style={{ color: '#94a3b8' }}>Response:</strong> {entry.humanOrAiResponse}</div>
                                        <div style={{ marginTop: 4 }}><strong style={{ color: '#94a3b8' }}>Purpose:</strong> {entry.communicationPurpose}</div>
                                        <div style={{ marginTop: 4 }}><strong style={{ color: '#94a3b8' }}>Outcome:</strong> {entry.outcome}</div>
                                    </div>
                                </details>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
