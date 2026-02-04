import { useEffect } from 'react';
import { StatusPanel } from './components/StatusPanel';
import { ControlPanel } from './components/ControlPanel';
import { AdvisorPanel } from './components/AdvisorPanel';
import { ProcedurePanel } from './components/ProcedurePanel';
import { useSimulationStore } from './store/simulationStore';
import './App.css';

function App() {
  const loadProcedureRules = useSimulationStore(state => state.loadProcedureRules);

  useEffect(() => {
    // Initial load of rules
    loadProcedureRules().then(() => {
       // Trigger the initial step's logic after rules are loaded
       const state = useSimulationStore.getState();
       if (state.activeStepId) {
           state.triggerStepAction(state.activeStepId);
       }
    });
  }, []);

  return (
    <div className="app-container relative w-screen h-screen">
      {/* Left Column: Simulator (65%) */}
      <div className="col-sim">
        {/* Top: Status Display (65%) */}
        <div className="status-panel panel-container">
          <StatusPanel />
        </div>
        {/* Bottom: Control Panel (35%) */}
        <div className="control-panel panel-container">
          <ControlPanel />
        </div>
      </div>

      {/* Right Column: Support (35%) */}
      <div className="col-support">
        {/* Top: AI Advisor (40%) */}
        <div className="advisor-panel panel-container">
          <AdvisorPanel />
        </div>
        {/* Bottom: Procedures (60%) */}
        <div className="procedure-panel panel-container">
          <ProcedurePanel />
        </div>
      </div>

      {/* Footer */}
      <footer className="app-footer">
        BuildLink — Research prototype submitted to the Nemetschek Innovation Award · CMU CEE · Contact: seongeup@andrew.cmu.edu, joonsunh@andrew.cmu.edu
      </footer>
    </div>
  );
}

export default App;