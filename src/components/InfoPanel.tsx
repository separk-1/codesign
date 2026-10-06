import { useDesignStore } from '../store/designStore';
import { useGacWorkflowStore } from '../store/gacWorkflowStore';

export const InfoPanel = () => {
    const consultation = useGacWorkflowStore(s => s.consultation);
    const { selectedNode, activeView, setActiveView, candidate } = useDesignStore();
    const isGac = useDesignStore(s => s.selectedInputDesignId === 'gac-workspace');
    const detailedReady = ['Ready for Review', 'Assumptions Only'].includes(candidate.status);

    return (
        <div style={{
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: '#1e293b',
            color: '#e2e8f0',
            borderRight: '1px solid #334155'
        }}>
            <div className="panel-title" style={{ padding: '10px', background: '#0f172a', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>
                Info
            </div>

            {!isGac && <div style={{ padding: '10px', borderBottom: '1px solid #334155', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>VIEW MODE:</span>
                <button
                    onClick={() => setActiveView('conceptual')}
                    style={{
                        background: activeView === 'conceptual' ? '#3b82f6' : '#334155',
                        border: 'none', borderRadius: '4px', color: '#fff', fontSize: '0.8rem', padding: '4px 10px', cursor: 'pointer'
                    }}
                >
                    CONCEPTUAL
                </button>
                {detailedReady ? (
                    <button
                        onClick={() => setActiveView('detailed')}
                        style={{
                            background: activeView === 'detailed' ? '#3b82f6' : '#334155',
                            border: 'none', borderRadius: '4px', color: '#fff', fontSize: '0.8rem', padding: '4px 10px', cursor: 'pointer'
                        }}
                    >
                        DETAILED CANDIDATE
                    </button>
                ) : (
                    <span style={{
                        border: '1px solid #475569',
                        borderRadius: '4px',
                        color: '#64748b',
                        fontSize: '0.72rem',
                        padding: '4px 8px'
                    }}>
                        DETAILED LOCKED
                    </span>
                )}
            </div>}

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: 0 }}>
                {selectedNode ? (
                    <div>
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>NAME</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 'bold' }}>{selectedNode.name}</div>
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>TYPE</div>
                            <div style={{ color: '#3b82f6', fontSize: '1rem' }}>{selectedNode.type}</div>
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>ID</div>
                            <div style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{selectedNode.id}</div>
                        </div>

                        {selectedNode.attributes && (
                            <div style={{ marginTop: '20px' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '8px', color: '#cbd5e1' }}>ATTRIBUTES</div>
                                <div style={{ background: '#0f172a', padding: '10px', borderRadius: '4px' }}>
                                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5 }}>
                                        {JSON.stringify(selectedNode.attributes, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', marginTop: '20px', fontSize: '0.9rem' }}>
                        {isGac ? <div style={{ textAlign: 'left' }}><strong>Unresolved design items</strong>{consultation?.state.unresolved.map((item: string) => <p key={item}>{item}</p>)}</div> : 'Select a component from the graph to view details.'}
                    </div>
                )}
            </div>
        </div>
    );
};
