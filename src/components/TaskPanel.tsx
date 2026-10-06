import { useDesignStore } from '../store/designStore';
export const TaskPanel = () => {
  const { tasks, restartSession, inputDesigns, selectedInputDesignId, selectInputDesign } = useDesignStore();
  return <div className="compact-tasks"><div className="panel-title">Workflow <button onClick={restartSession}>Restart</button></div>
    <select aria-label="Input design" value={selectedInputDesignId} onChange={e => selectInputDesign(e.target.value)}>{inputDesigns.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
    <ol>{tasks.map(t => <li key={t.id} aria-current={t.status === 'running' ? 'step' : undefined} title={t.description}>{t.label}{t.status === 'done' ? ' ✓' : t.status === 'running' ? ' ←' : ''}</li>)}</ol>
  </div>;
};
