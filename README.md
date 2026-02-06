# CoDesign

**CoDesign** is a research prototype for studying **human-AI collaborative design refinement** in the process engineering domain. It provides an interactive environment where an AI assistant progressively guides a human designer through design concretization — from a conceptual Process Flow Diagram (PFD) to a detailed Piping & Instrumentation Diagram (P&ID). The human remains the final decision-maker at every stage.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Setup](#setup)
- [How to Use](#how-to-use)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Panel Layout](#panel-layout)
- [Sample Data](#sample-data)
- [Design Workflow](#design-workflow)
- [Technology Stack](#technology-stack)

---

## Features

- **Dual-View System** — Switch between a Conceptual PFD view (4-node process flow) and a Detailed P&ID view (full equipment, nozzles, piping, boundaries)
- **Scripted Design Conversation** — AI walks through a 13-step design refinement process, asking about fluid type, flow rates, equipment selection, piping configuration, and more
- **AI Design Assistant** — Chat interface that guides you through PFD→P&ID conversion with contextual questions at each step
- **Assumption Mode** — Auto-fills chat responses based on keyword matching rules with confidence indicators (HIGH CONF / REVIEW), allowing faster walkthroughs of the design decision flow
- **Terminal Panel** — Real-time activity log showing AI processing steps, task progress, and system events with color-coded status indicators
- **Task Progress Tracking** — Left sidebar with a 5-step timeline visualization (Review PFD, Select Equipment, Connection Logic, Detailed Design, Update Graph) that auto-advances based on conversation progress
- **Token Budget Monitoring** — Tracks simulated token usage across tasks with a progress bar and per-task token counts
- **Component Inspector** — Click any node in either graph to view its full attributes (design pressure, temperature, materials, costs, nozzle specs) in the Info panel
- **Responsive Layout** — Proportional flexbox layout that adapts to any viewport size with internal scrolling per panel

---

## Architecture

```
+------------------------------------------------------------------+
|  TASK PANEL  |  DISPLAY PANEL (DAG)        |  CHAT PANEL          |
|  (flex: 1.5) |  (flex: 6.5 of center)      |  (flex: 4 of right)  |
|              |                              |                      |
|  Timeline    |  ForceGraph2D canvas         |  AI messages          |
|  Token usage |  Schematic view              |  User input           |
|              |-----------------------------|  Assumption mode      |
|              |  INFO PANEL                  |----------------------|
|              |  (flex: 3.5 of center)       |  TERMINAL PANEL       |
|              |                              |  (flex: 6 of right)   |
|              |  Node attributes             |                      |
|              |  View mode selector          |  Activity logs        |
|              |                              |  Status indicators    |
+------------------------------------------------------------------+
|                         FOOTER (absolute)                        |
+------------------------------------------------------------------+
```

**Column Ratios:**
| Column | Flex | Approximate Width |
|--------|------|-------------------|
| Left (TaskPanel) | 1.5 | ~13% |
| Center (Display + Info) | 6 | ~52% |
| Right (Chat + Terminal) | 4 | ~35% |

---

## Setup

### Prerequisites

- Node.js 16+
- npm

### Install & Run

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173` (or next available port).

### Build for Production

```bash
npm run build
npm run preview
```

The build step runs TypeScript type-checking (`tsc`) before Vite bundling.

---

## How to Use

### Quick Start

1. **Launch the app** — Run `npm run dev` and open `http://localhost:5173`
2. **Initial view** — You'll see the conceptual PFD in the center, AI chat on the right, terminal below, and task progress on the left
3. **AI welcome** — The AI Design Assistant greets you and explains the current mode

### Step-by-Step Walkthrough

#### Step 1: App Loads
- The conceptual PFD is displayed showing a 4-node process flow (Feed Tank → Feed Pump → Pre-Heater → Reactor Feed)
- The AI sends a welcome message explaining it will guide you through design refinement
- The Terminal shows loading logs as data is fetched
- Task "Review PFD" starts running automatically

#### Step 2: Start the Conversation
- Send any message to begin (e.g., "Hello" or "Let's start")
- The AI begins asking structured design questions

#### Step 3: Answer Design Questions
Each question is multiple-choice (A/B/C/D). You can:
- **Type your answer** manually (e.g., "B" or the full text)
- **Enable Assumption Mode** — toggle the checkbox in the chat header to auto-fill suggested answers

#### Step 4: Walk Through the Design Flow
The AI asks about these topics in order:
1. **Process Fluid** — What type of fluid (hydrocarbon, aqueous, etc.)?
2. **Flow Rate** — Target flow rate range
3. **Pressure Rise** — Required pump pressure differential
4. **Suction Conditions** — Inlet configuration for the pump
5. **Heat Exchanger Type** — Shell-and-tube vs plate vs air-cooled
6. **Flow Arrangement** — Counter-current, co-current, cross-flow
7. **Distance** — Pump-to-exchanger distance for pipe sizing
8. **Pipe Sizing** — Accept or modify calculated pipe diameters
9. **Flange Class** — Pressure rating for connections
10. **Material Selection** — Carbon steel, stainless, special alloys
11. **Operating Conditions** — Confirm compiled parameters

#### Step 5: Confirm and Convert
- After all parameters are confirmed, the AI asks if you're ready to convert
- The AI shows a summary of all confirmed parameters

#### Step 6: Convert to Detailed Design
- Answer "Yes, proceed" (or let Assumption Mode auto-fill)
- The AI translates the conceptual design to detailed P&ID
- Equipment is mapped: Feed Pump → P-4713, Pre-Heater → H-1009
- The view automatically switches to Detailed mode

#### Step 7: Explore the Detailed Design
- Click any node in the detailed P&ID to see its full specifications
- The Info Panel shows equipment tags, nozzle assignments, materials, and design conditions
- All 5 tasks should show as "done" with token usage displayed

### Assumption Mode

**What it does:**
- When enabled (checkbox in chat header), the input field auto-fills with suggested answers
- Answers are based on keyword matching from the AI's question

**Confidence Badges:**
- **HIGH CONF** (green) — Standard/typical engineering choices
- **REVIEW** (yellow) — Answers that may need human review

**Usage:**
- Keep it enabled for quick demos and walkthroughs
- Disable it when you want to make custom choices
- You can always edit the auto-filled answer before sending

### Terminal Panel

The Terminal shows real-time activity logs:

- **Blue dots (●)** — Info messages (data parsing, status updates)
- **Purple blinking dots** — Processing in progress
- **Green dots** — Success (task completed, data loaded)
- **Yellow dots** — Warnings

The footer shows current status (Ready/Processing) and total log count.

### Tips

- **Click nodes** in either view to see detailed attributes in the Info Panel
- **Switch views manually** using the buttons in the Info Panel
- **Watch task progress** in the left sidebar as you advance through the conversation
- **Check the terminal** to understand what the AI is doing behind the scenes
- **Token usage** accumulates per task and is shown in the progress bar

---

## Environment Variables

Environment variables use Vite's `VITE_` prefix convention and are set at build time. No `.env` file is required — defaults are provided in code.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_TOKEN_BUDGET` | `20000` | Total simulated token budget for the design session. Displayed in the TaskPanel progress bar. |
| `VITE_OPENAI_MODEL` | `gpt-4o-mini` | Model name displayed as a badge in the TaskPanel footer. |

To override, create a `.env` file in the project root:

```env
VITE_TOKEN_BUDGET=50000
VITE_OPENAI_MODEL=gpt-4o
```

---

## Project Structure

```
codesign/
├── public/
│   └── sample/
│       ├── conceptual_design.json      # Conceptual PFD graph data
│       └── dexpi_model_output.json     # Detailed P&ID in DEXPI-inspired format
├── src/
│   ├── components/
│   │   ├── TaskPanel.tsx               # Left sidebar — task progress timeline & token budget
│   │   ├── DisplayPanel.tsx            # Top-center — schematic DAG view (ForceGraph2D)
│   │   ├── InfoPanel.tsx               # Bottom-center — node attributes & view mode selector
│   │   ├── ChatPanel.tsx               # Top-right — AI chat with assumption mode
│   │   └── TerminalPanel.tsx           # Bottom-right — activity logs with status indicators
│   ├── store/
│   │   └── designStore.ts              # Zustand store — state, actions, conversation script, terminal logs
│   ├── utils/
│   │   └── graphParsers.ts             # JSON parsers for conceptual & DEXPI data formats
│   ├── App.tsx                         # Root layout — 3-column proportional flexbox
│   ├── App.css                         # Global styles — CSS variables, panel classes, animations
│   ├── index.css                       # Entry styles — reset, Tailwind directives, root constraints
│   ├── main.tsx                        # React entry point
│   └── vite-env.d.ts                   # TypeScript type declarations for Vite env variables
├── index.html                          # HTML entry point
├── vite.config.ts                      # Vite configuration with React plugin
├── package.json                        # Dependencies and scripts
└── README.md
```

---

## Panel Layout

### TaskPanel (Left Sidebar)

- **Timeline visualization** of 5 sequential design tasks with status dots (pending = hollow, running = pulsing blue, done = green)
- **Connector lines** between tasks showing progress flow
- **Token usage** progress bar at the bottom with used/total count
- **Model badge** showing the configured AI model name
- Scrollable task list with fixed header and footer

### DisplayPanel (Top Center)

- **ForceGraph2D** canvas rendering the design schematic as a left-to-right DAG
- **Node shapes**: rectangles for Equipment, smaller rectangles for Pipes, circles for others
- **Color coding**: blue (Equipment), green (Pipe), gray (other); red highlight on selection
- **Responsive sizing** via ResizeObserver
- Click any node to select it and view details in the InfoPanel

### InfoPanel (Bottom Center)

- **View mode selector** buttons to switch between Conceptual and Detailed views
- **Node detail inspector** showing Name, Type, ID, and full Attributes (JSON formatted)
- Placeholder message when no node is selected
- Scrollable content area

### ChatPanel (Top Right)

- **Message history** with color-coded bubbles (blue = human, gray = AI, dashed border = AI-default)
- **Source badges** on messages indicating HUMAN or AI DEFAULT origin
- **Assumption Mode toggle** in the header — when enabled, auto-fills the input field with rule-based answers
- **Confidence indicator** (HIGH CONF / REVIEW) shown above the input when auto-filled
- **Auto-scroll** to the latest message on new entries
- Scrollable message area with fixed input bar

### TerminalPanel (Bottom Right)

- **Activity log** showing real-time system events and AI processing steps
- **Color-coded status indicators**: info (blue), processing (purple), success (green), warning (yellow)
- **Timestamp prefix** for each log entry (HH:MM:SS format)
- **Blinking spinner** for in-progress operations
- **Status footer** showing Ready/Processing state and log count
- **Auto-scroll** to latest log entries

---

## Sample Data

Design data is loaded from `public/sample/` at runtime via `fetch()`.

### Conceptual Design (`conceptual_design.json`)

A minimal 4-node process flow representing a liquid heating loop:

| Node | Type | Key Attributes |
|------|------|----------------|
| Feed Tank | Source | Aqueous solution, 100 m³/h, 25°C |
| Feed Pump | Pump | Centrifugal, tag P-4713, 10 bar rise, carbon steel, ~$45k |
| Pre-Heater | HeatExchanger | Plate type, tag H-1009, 25°C→80°C, steam-heated, ~$120k |
| Reactor Feed | Sink | Target 80°C, 8 bar |

**Links** represent labeled process streams:
- `L-001: Liquid Feed (DN 150)` — Feed Tank → Feed Pump
- `L-002: Pressurized Feed (DN 150)` — Feed Pump → Pre-Heater
- `L-003: Heated Feed (DN 150)` — Pre-Heater → Reactor Feed

### Detailed Design (`dexpi_model_output.json`)

A DEXPI-inspired hierarchical model containing:

- **Boundary Items**: Feed Tank (Source) and Reactor Feed (Sink), each with nozzles
- **Tagged Plant Items**:
  - Centrifugal Pump P-4713 with suction nozzle (S1) and discharge nozzle (D1)
  - Plate Heat Exchanger H-1009 with 4 nozzles: cold inlet (N1), cold outlet (N2), hot inlet (N3), hot outlet (N4)
- **Piping Network Systems**:
  - Process line: 5 pipe segments (L-001 through L-005) connecting Feed Tank → Pump → HeatExchanger → Reactor Feed
  - Utility line: 2 pipe segments (U-001, U-002) connecting Steam Header → HeatExchanger → Condensate Return

Each entity carries rich attributes including design pressure, temperature ranges, materials, nominal diameters, fluid codes, insulation specs, and design velocities.

The `graphParsers.ts` utility converts this nested DEXPI structure into a flat node-link graph for visualization.

---

## Design Workflow

The application uses a scripted 13-step conversation that naturally progresses through the design workflow:

```
Conversation Flow:
1. Process Fluid    → User answers (or auto-fill)
2. Flow Rate        → User answers
3. Pressure Rise    → User answers
4. Suction          → User answers
5. Heat Exchanger   → User answers → Task: Select Equipment completes
6. Flow Arrangement → User answers
7. Distance         → User answers
8. Pipe Sizing      → User answers
9. Flange Class     → User answers
10. Material        → User answers
11. Operating Cond. → User answers
12. Confirm         → User confirms
13. Translation     → Auto-converts to detailed P&ID
```

**Task Progression:**
```
1. Review PFD          → Starts on data load (running)
2. Select Equipment    → Starts when user sends first message
3. Connection Logic    → Starts when AI mentions equipment types
4. Detailed Design     → Starts when AI translates to detailed
5. Update Graph        → Starts when view switches to Detailed, auto-completes after 2s
```

Each completed task records simulated token usage (70-100% of its estimate) and updates the progress bar.

---

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| [React](https://react.dev/) | 18.2 | UI framework |
| [TypeScript](https://www.typescriptlang.org/) | 5.x | Type safety |
| [Vite](https://vitejs.dev/) | 4.x | Build tool & dev server |
| [Zustand](https://zustand-demo.pmnd.rs/) | 4.5 | Lightweight state management |
| [react-force-graph-2d](https://github.com/vasturiano/react-force-graph) | 1.25 | Canvas-based force-directed graph visualization |
| Tailwind CSS | — | Utility CSS (directives imported, inline styles primarily used) |

### Design Decisions

- **Inline styles over CSS modules** — All component styling uses inline `style` objects for colocation and rapid prototyping. Global CSS (`App.css`) only defines variables, panel-title/panel-content classes, and animations.
- **Proportional flexbox layout** — Panel sizes use flex ratios (e.g., `flex: 6.5`) rather than fixed pixel values, making the layout responsive without media queries.
- **Deep-copied graph data** — DisplayPanel creates shallow copies of graph data to avoid layout position conflicts with other components using ForceGraph2D's force simulation independently.
- **Scripted conversation** — The AI uses a predefined 13-step conversation script that matches keyword-based auto-fill rules, creating a deterministic design flow for user studies.
- **Terminal logging** — All significant state changes emit logs to the terminal, providing transparency into AI processing and task progression.
