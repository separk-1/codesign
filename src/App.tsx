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
    <div className="app-container relative w-screen h-screen" style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0f172a', color: '#fff' }}>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left Sidebar: Task Progress (220px fixed) */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <TaskPanel />
        </div>

        {/* Center Column: Visuals & Info (60% of remaining -> flex: 6) */}
        <div style={{ flex: 6, display: 'flex', flexDirection: 'column', borderRight: '1px solid #334155', minWidth: 0 }}>
          {/* Top: Schematic Display (65% -> flex: 65) */}
          <div style={{ flex: 65, position: 'relative', borderBottom: '1px solid #334155', minHeight: 0 }}>
            <DisplayPanel />
          </div>
          {/* Bottom: Component Info (35% -> flex: 35) */}
          <div style={{ flex: 35, position: 'relative', minHeight: 0 }}>
            <InfoPanel />
          </div>
        </div>

        {/* Right Column: AI & Knowledge Graph (40% of remaining -> flex: 4) */}
        <div style={{ flex: 4, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Top: AI Chat (40% -> flex: 40) */}
          <div style={{ flex: 40, position: 'relative', borderBottom: '1px solid #334155', minHeight: 0 }}>
            <ChatPanel />
          </div>
          {/* Bottom: Knowledge Graph (60% -> flex: 60) */}
          <div style={{ flex: 60, position: 'relative', minHeight: 0 }}>
            <GraphPanel />
          </div>
        </div>

      </div>

      {/* Footer */}
      <footer className="app-footer" style={{
          padding: '4px 10px', background: '#020617', fontSize: '0.7rem', color: '#64748b', textAlign: 'center', zIndex: 100, flexShrink: 0
      }}>
        CoDesign · Human-AI Collaborative Design Refinement
      </footer>
    </div>
  );
}

export default App;
