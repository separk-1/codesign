import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useSimulationStore } from './store/simulationStore'

// Expose store for testing
(window as any).useSimulationStore = useSimulationStore;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
