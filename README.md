# CoDesign

**CoDesign** is a research prototype for studying **human-AI collaborative design refinement** — from conceptual process design to detailed engineering design.

The tool provides an interactive environment where an AI assistant progressively guides a human designer through design concretization: equipment selection, connection logic, nozzle specification, and P&ID-level decisions. The human remains the final decision-maker at every stage.

---

## Setup

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173` (or next available port).

### Build for production

```bash
npm run build
npm run preview
```

---

## Project Structure

```
src/
  components/
    DisplayPanel.tsx    # Schematic DAG view of the design
    InfoPanel.tsx       # Component details & view mode selector
    ChatPanel.tsx       # AI chat interface
    GraphPanel.tsx      # Knowledge graph with custom rendering
  store/
    designStore.ts      # Zustand store (graphs, selection, chat)
  utils/
    graphParsers.ts     # Parsers for conceptual JSON & DEXPI JSON
  App.tsx               # Main layout
  App.css               # Global styles
  main.tsx              # Entry point
```

---

## Sample Data

Design data is loaded from `public/sample/` and served at `/sample/*`:

| File | Purpose |
|------|---------|
| `/sample/conceptual_design.json` | Conceptual PFD: 4 nodes (Source, Pump, HeatExchanger, Sink) with functional links |
| `/sample/dexpi_model_output.json` | Detailed P&ID: tagged equipment (P-4713, H-1009), nozzles, boundary items, 5 piping segments in DEXPI-inspired format |

### Conceptual view

Minimal process flow — functional blocks connected by labeled streams (e.g., "L-001: Liquid Feed (DN 150)").

### Detailed view

Full knowledge graph with equipment, nozzles, pipe segments, and source/sink boundaries. Each node carries rich attribute data (design pressure, temperature, materials, costs) visible in the Component Info panel.

---

## Technology Stack

- React 18 + TypeScript + Vite
- Zustand (state management)
- react-force-graph-2d (graph visualization)
