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

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: '#1e293b',
            borderRight: '1px solid #334155',
        }}>
            <div className="panel-title">TASK PROGRESS</div>

            {/* Task list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>
                {tasks.map((task, i) => (
                    <TaskItem key={task.id} task={task} isLast={i === tasks.length - 1} />
                ))}
            </div>
        </div>
    );
};
