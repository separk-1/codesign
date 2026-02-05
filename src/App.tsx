import { useEffect } from 'react';
import { TaskPanel } from './components/TaskPanel';
import { DisplayPanel } from './components/DisplayPanel';
import { InfoPanel } from './components/InfoPanel';
import { ChatPanel } from './components/ChatPanel';
import { GraphPanel } from './components/GraphPanel';
import { useDesignStore } from './store/designStore';
import './App.css';

function App() {
  const loadData = useDesignStore(state => state.loadData);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="app-container relative w-screen h-screen" style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0f172a', color: '#fff' }}>
      {/* Left Sidebar: Task Progress (Fixed width) */}
      <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid #334155' }}>
        <TaskPanel />
      </div>

      {/* Center Column: Visuals & Info (Flexible) */}
      <div style={{ flex: 3, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid #334155' }}>
        {/* Top: Schematic Display (65%) */}
        <div style={{ flex: 6.5, minHeight: 0, position: 'relative', borderBottom: '1px solid #334155' }}>
          <DisplayPanel />
        </div>
        {/* Bottom: Component Info (35%) */}
        <div style={{ flex: 3.5, minHeight: 0, position: 'relative' }}>
          <InfoPanel />
        </div>
      </div>

      {/* Right Column: AI & Knowledge Graph (Flexible) */}
      <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Top: AI Chat (40%) */}
        <div style={{ flex: 4, minHeight: 0, position: 'relative', borderBottom: '1px solid #334155' }}>
          <ChatPanel />
        </div>
        {/* Bottom: Knowledge Graph (60%) */}
        <div style={{ flex: 6, minHeight: 0, position: 'relative' }}>
          <GraphPanel />
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
