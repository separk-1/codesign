import { useEffect } from 'react';
import { TaskPanel } from './components/TaskPanel';
import { DisplayPanel } from './components/DisplayPanel';
import { InfoPanel } from './components/InfoPanel';
import { ChatPanel } from './components/ChatPanel';
import { TerminalPanel } from './components/TerminalPanel';
import { useDesignStore } from './store/designStore';
import './App.css';

function App() {
  const loadData = useDesignStore(state => state.loadData);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="app-container relative w-full h-full" style={{ display: 'flex', overflow: 'hidden', background: '#0f172a', color: '#fff' }}>
      {/* Left Sidebar: Task Progress (Dynamic ~13%) */}
      <div style={{ flex: 1.5, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TaskPanel />
      </div>

      {/* Center Column: Visuals & Info (Dynamic ~52%) */}
      <div style={{ flex: 6, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #334155' }}>
        {/* Top: Schematic Display (Dynamic ~65% of column) */}
        <div style={{ flex: 6.5, minHeight: 0, position: 'relative', borderBottom: '1px solid #334155' }}>
          <DisplayPanel />
        </div>
        {/* Bottom: Component Info (Dynamic ~35% of column) */}
        <div style={{ flex: 3.5, minHeight: 0, position: 'relative' }}>
          <InfoPanel />
        </div>
      </div>

      {/* Right Column: AI & Knowledge Graph (Dynamic ~35%) */}
      <div style={{ flex: 4, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Top: AI Chat (Dynamic ~40% of column) */}
        <div style={{ flex: 4, minHeight: 0, position: 'relative', borderBottom: '1px solid #334155' }}>
          <ChatPanel />
        </div>
        {/* Bottom: Terminal (Dynamic ~60% of column) */}
        <div style={{ flex: 6, minHeight: 0, position: 'relative' }}>
          <TerminalPanel />
        </div>
      </div>

      {/* Footer */}
      <footer className="app-footer" style={{
          position: 'absolute', bottom: 0, right: 0, left: 0,
          padding: '4px 10px', background: '#020617', fontSize: '0.7rem', color: '#64748b', textAlign: 'center', zIndex: 100
      }}>
        CoDesign · Human-AI Collaborative Design Refinement
      </footer>
    </div>
  );
}

export default App;
