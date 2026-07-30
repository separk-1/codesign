import { useDesignStore, DesignTask } from '../store/designStore';

const statusColor = (status: DesignTask['status']) => {
    if (status === 'done') return '#22c55e';
    if (status === 'running') return '#3b82f6';
    return '#475569';
};

const TaskItem = ({ task, isLast }: { task: DesignTask; isLast: boolean }) => {
    const isRunning = task.status === 'running';
    const isPending = task.status === 'pending';
    const isDone = task.status === 'done';
    const color = statusColor(task.status);

    return (
        <div style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: isLast ? 0 : 16 }}>
            {/* Timeline column */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 18, flexShrink: 0 }}>
                {/* Status dot */}
                <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    border: isPending ? `2px solid ${color}` : 'none',
                    background: isPending ? 'transparent' : color,
                    animation: isRunning ? 'pulse 2s ease-in-out infinite' : 'none',
                    flexShrink: 0,
                    marginTop: 2,
                }} />
                {/* Connector line */}
                {!isLast && (
                    <div style={{
                        flex: 1,
                        width: 2,
                        background: isDone ? '#22c55e' : '#334155',
                        marginTop: 4,
                        minHeight: 16,
                    }} />
                )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    color: isPending ? '#64748b' : '#e2e8f0',
                    lineHeight: 1.3,
                }}>
                    {task.label}
                </div>
                {isRunning && (
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>
                        {task.description}
                    </div>
                )}
            </div>
        </div>
    );
};

export const TaskPanel = () => {
    const tasks = useDesignStore(state => state.tasks);
    const restartSession = useDesignStore(state => state.restartSession);
    const inputDesigns = useDesignStore(state => state.inputDesigns);
    const selectedInputDesignId = useDesignStore(state => state.selectedInputDesignId);
    const selectInputDesign = useDesignStore(state => state.selectInputDesign);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: '#1e293b',
            borderRight: '1px solid #334155',
        }}>
            <div className="panel-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>TASK PROGRESS</span>
                <button
                    onClick={restartSession}
                    style={{
                        border: '1px solid #475569',
                        borderRadius: 4,
                        background: '#0f172a',
                        color: '#cbd5e1',
                        fontSize: '0.68rem',
                        padding: '3px 7px',
                        cursor: 'pointer'
                    }}
                >
                    RESTART
                </button>
            </div>

            <div style={{ padding: '12px', borderBottom: '1px solid #334155' }}>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>INPUT P&ID</div>
                <select
                    value={selectedInputDesignId}
                    onChange={(event) => selectInputDesign(event.target.value)}
                    style={{
                        width: '100%',
                        background: '#0f172a',
                        border: '1px solid #475569',
                        borderRadius: 4,
                        color: '#e2e8f0',
                        padding: '7px 8px',
                        fontSize: '0.78rem'
                    }}
                >
                    {inputDesigns.map(design => (
                        <option key={design.id} value={design.id}>{design.label}</option>
                    ))}
                </select>
                <div style={{ color: '#64748b', fontSize: '0.68rem', lineHeight: 1.35, marginTop: 6 }}>
                    {inputDesigns.find(design => design.id === selectedInputDesignId)?.description}
                </div>
            </div>

            {/* Task list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>
                {tasks.map((task, i) => (
                    <TaskItem key={task.id} task={task} isLast={i === tasks.length - 1} />
                ))}
            </div>
        </div>
    );
};
