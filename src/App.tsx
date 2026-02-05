import { useEffect } from 'react';
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
    <div className="app-container relative w-screen h-screen" style={{ display: 'flex', overflow: 'hidden', background: '#0f172a', color: '#fff' }}>
      {/* Left Column: Visuals & Info (60%) */}
      <div style={{ flex: '60%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #334155' }}>
        {/* Top: Schematic Display (65%) */}
        <div style={{ flex: '65%', position: 'relative', borderBottom: '1px solid #334155' }}>
          <DisplayPanel />
        </div>
        {/* Bottom: Component Info (35%) */}
        <div style={{ flex: '35%', position: 'relative' }}>
          <InfoPanel />
        </div>
      </div>

      {/* Right Column: AI & Knowledge Graph (40%) */}
      <div style={{ flex: '40%', display: 'flex', flexDirection: 'column' }}>
        {/* Top: AI Chat (40%) */}
        <div style={{ flex: '40%', position: 'relative', borderBottom: '1px solid #334155' }}>
          <ChatPanel />
        </div>
        {/* Bottom: Knowledge Graph (60%) */}
        <div style={{ flex: '60%', position: 'relative' }}>
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
