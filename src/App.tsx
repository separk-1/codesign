import { useEffect } from 'react';
import { TaskPanel } from './components/TaskPanel';
import { DisplayPanel } from './components/DisplayPanel';
import { DecisionLogPanel } from './components/DecisionLogPanel';
import { ChatPanel } from './components/ChatPanel';
import { GacPanel } from './components/GacPanel';
import { GacApiStatus } from './components/GacApiStatus';
import { useDesignStore } from './store/designStore';
import './App.css';
import { GacResearchPanel, GacProgress, GacDecisionTrail } from './components/GacResearchPanel';
function App() {
  const loadData = useDesignStore(state => state.loadData);
  const isGac = useDesignStore(state => state.selectedInputDesignId === 'gac-workspace');
  useEffect(() => { loadData(); }, [loadData]);
  return <div className={`app-container ${isGac ? 'gac-workspace' : ''}`}>
    <header className="app-heading">CoDesign</header>
    <div className="workspace-layout">
      <aside className="workspace-sidebar">{isGac ? <GacProgress /> : <TaskPanel />}</aside>
      <main className="workspace-main">
        <section className="graph-section">{isGac ? <GacResearchPanel /> : <DisplayPanel />}</section>
        <section className="log-section">{isGac ? <GacDecisionTrail /> : <DecisionLogPanel />}</section>
      </main>
      <aside className="workspace-tools">
        <section className="assistant-section"><div className="panel-title">Assistant <GacApiStatus /></div><div className="chat-section"><ChatPanel /></div>{isGac && <GacPanel />}</section>
      </aside>
    </div>
  </div>;
}
export default App;
