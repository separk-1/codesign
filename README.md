# CoDesign

CoDesign is a research prototype for AI-assisted P&ID knowledge graph exploration and design-decision traceability. The project converts DEXPI-based P&ID examples into structured data, lets users ask graph-grounded questions through GraphRAG, and records human or AI-agent design decisions as reviewable logs and candidate graph updates.

The goal is not to automatically produce final approved engineering P&IDs. The goal is to make P&ID knowledge, assumptions, review gates, and human/AI decision traces explicit and reusable.

## What The App Can Do

- Select a DEXPI-derived P&ID example from the dataset.
- Visualize the selected P&ID as a node-link graph.
- Ask GraphRAG questions such as `what is connected to P-4713?`.
- Run a five-question design decision workflow.
- Separate human-confirmed responses from AI-default assumptions.
- Update the candidate graph as decisions are recorded.
- Export decision logs as CSV.
- Export decision-generated candidate graph data as JSON.

## Main Workflow

### PFAS / GAC sizing workflow

The default input is now **PFAS / GAC design workspace**. Open **GAC / PFAS design** on the right:
The research view shows the next design decision, before/proposed or before/applied process diagrams, a change table, calculation evidence and a concise decision trail. **Design basis** is collapsed initially. Process connections and calculation evidence are shown separately; clicking a vessel opens its attributes. Other P&ID inputs retain the legacy graph view.

1. Start with prefilled demonstration inputs (PFOA, 100 → 4 ng/L, 100 m³/h, 20 min total EBCT, 2 series vessels, 1 parallel train), or edit PFAS species, concentrations, design flow, total EBCT, configuration and EBCT source. **Load example inputs** restores the example and flags any applied sizing for review.
2. Run the bounded GAC agent. It asks for missing inputs and calls the deterministic `calculate_gac_media_volume` tool when inputs are complete.
3. Review total/per-vessel media volumes and assumptions, then accept or reject the proposal. Only acceptance changes the candidate graph.
4. Change an input to flag previously applied sizing as stale. Recalculate and review a new proposal.
5. Export the case JSON to save inputs, tool version, proposals, accepted results, graph, before/after changes and decision history. Session data are not automatically saved across reloads.

Chat also accepts one `field=value` per message (for example `flow=100`, `species=PFOA`, `totalEbctMinutes=20`, `ebctSource=Pilot report section 3`), then `calculate` and `accept`. GraphRAG Mode queries the current graph and its calculation evidence. The legacy heat-exchanger design workflow remains available on other inputs.

The calculator uses `total media volume = design flow × total EBCT`, equal flow among parallel trains and equal media volume among series vessels. EBCT is a supplied design basis, not selected or validated by the tool. PFAS concentrations are recorded requirements; this version does not predict removal performance. Vessel geometry, media mass, pipe sizing, valve placement and media life remain unresolved. Graph process-flow edges represent a candidate conceptual arrangement, not approved physical routing. To keep the interactive graph bounded, series and parallel counts each support 1–20.

Verification:

```bash
node scripts/test_gac.mjs
npm run build
npm run preview -- --host 127.0.0.1
# In another terminal; uses installed Edge by default:
node scripts/test_gac_ui.mjs
```

The read-only Excel baseline comparison used its saved TCE case (0.03 MGD, 7.5 min). The calculated media volume was 0.591470591 m³ versus cached Excel `Contactor Constraints!C38` converted to SI at 0.591432600 m³, a 0.0064% difference from Excel's rounded 7.481 gal/ft³ conversion. This checks volume arithmetic, not PFAS treatment suitability or the entire workbook; macros were not executed.

1. Choose an input P&ID from the left panel.
2. Use GraphRAG Mode to ask questions about equipment, lines, tags, nozzles, and connectivity.
3. Start the design assistant conversation.
4. Answer five design questions:
   - fluid/material basis,
   - design flow rate,
   - pump duty and pressure protection,
   - treatment configuration,
   - human review gate.
5. Review how the graph changes as decisions are recorded.
6. Export the decision log or candidate graph dataset.

## Repository Structure

```text
codesign/
├── data/
│   ├── pids/                 # normalized DEXPI/Proteus XML P&ID inputs
│   ├── json/                 # pyDEXPI JSON model exports
│   ├── gexf/                 # graph exports for graph analysis
│   ├── schemas/              # schemas for graph, decision log, and candidate exports
│   ├── design_decisions/     # sample human and AI-agent decision logs
│   └── candidates/           # sample decision-generated candidate graph exports
├── public/sample/            # default PFAS treatment example used by the app
├── scripts/                  # conversion and database-building scripts
├── server/                   # Express API for dataset loading, GraphRAG, and agent generation
├── src/                      # React/Vite frontend
├── .env.example              # environment variable template
├── package.json
└── README.md
```

## Data Included In The Repository

The repository includes a working sample data package for development and review:

- `data/pids/`: 35 normalized XML P&ID inputs.
- `data/json/`: 35 pyDEXPI JSON exports.
- `data/gexf/`: 30 GEXF graph exports. Some are sparse or empty because the current graph export pipeline does not fully capture every DEXPI example structure.
- `data/schemas/`: lightweight schemas for the exported data formats.
- `data/design_decisions/`: sample human and AI-agent decision logs.
- `data/candidates/`: sample candidate graph exports.

The pyDEXPI JSON files are the primary derived data. GEXF files are secondary graph-analysis exports.

## API Endpoints

The local API server provides:

- `GET /api/designs`: list available input P&ID JSON files.
- `GET /api/designs/:id`: load one pyDEXPI JSON model.
- `POST /api/graphrag/query`: answer a graph-grounded question using retrieved graph evidence.
- `POST /api/gac/assistant`: explain Excel fields / dependencies and the next step using the current GAC design context.
- `POST /api/agent/generate-decision-log`: generate sample AI-agent decision-log entries for review.
- `GET /api/health`: check API status and whether an OpenAI key is configured.

## Setup

Install dependencies:

```bash
npm install
```

Create a local `.env` file from the template:

```bash
cp .env.example .env
```

Add your API key if you want LLM-backed GraphRAG and agent generation:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5-mini
API_PORT=8787
VITE_TOKEN_BUDGET=20000
VITE_OPENAI_MODEL=gpt-5-mini
```

Run the API and frontend together:

```bash
npm run dev:full
```

Or run them separately:

```bash
npm run api
npm run dev -- --host 127.0.0.1
```

The frontend usually opens at `http://127.0.0.1:5173`. The API runs at `http://127.0.0.1:8787`.

## Build

```bash
npm run build
```

## Transformation Scripts

The conversion scripts are in `scripts/`.

Convert DEXPI/Proteus XML files to pyDEXPI JSON and GEXF:

```bash
python scripts/convert_dexpi_to_kg.py --input-dir data/pids --json-dir data/json --gexf-dir data/gexf
```

Build a SQLite-style P&ID knowledge graph database from pyDEXPI JSON:

```bash
python scripts/build_pid_kg_db.py --json-dir data/json --db-path data/pid_kg.sqlite
```

## Research Scope

### PFAS workbook workflow

The GAC workspace uses Workflow, Architecture / Graph, Log and Assistant. Architecture shows physical treatment configurations and reviewed changes; Graph shows Excel input → formula → result → vessel relationships with source-cell / formula inspection and downstream highlighting. Design basis contains supported workbook pressure-design inputs and critical assumptions, with conditional concentration / isotherm fields only for Freundlich. Water matrix, TOC and evidence sources are contextual metadata handled in chat, not additional workbook INPUT fields. The Assistant explains definitions, dependencies and state-specific next steps. `source=...` records the EBCT basis or carbon-life source (when that method is enabled). A question never changes graph or inputs. Selecting a reference changes inputs; calculating creates a proposal; accepting changes the candidate graph. Source cells, workbook SHA-256, inputs, calculation and decisions are exported together.

With the API and `OPENAI_API_KEY`, natural-language explanations use an LLM grounded in supplied workbook formulas and design state. Without the API / key, deterministic definitions and next-step guidance run locally; the answer mode is retained in Log. Examples: `What is EBCT?`, `Which formulas depend on design flow?`, `What should I do next?`. Missing values are requested, never fabricated.

Refresh the read-only Excel observation snapshot with `python scripts/extract_gac_knowledge.py` (requires openpyxl). The extraction preserves censored / missing breakthrough observations. Retrieval ranking and contextual questions are deterministic local rules; they run without an LLM API. Reference EBCT is an observed study condition. The workbook's saved default contaminant case is TCE and is used only for formula regression checks.

`Calculate proposal` now runs the workbook's upright pressure-vessel calculation branches ported to JavaScript: AutoSize dimension formulas for the requested train count or manual dimensions, flow capacity and train count, redundancy, installed media volume and GAC mass, approximate-match pipe-size tables, backwash flow/volume, and carbon-life branches (measured months, breakthrough BV, Freundlich). Use `Excel calculation inputs` to specify average flow, density, sizing mode and carbon-life inputs with sources. BV can use single-vessel or total-series media; these definitions produce different carbon life. PFAS Reference BV uses total-series media. Missing or censored BV values cannot produce a life calculation.

Refresh formula provenance and tables with `python scripts/extract_gac_formulas.py`. Formula cells, source workbook hash, calculation inputs/results and decisions are retained in case exports. Supported scope is upright pressure systems without bypass. Gravity/horizontal designs, BDST, VBA cost optimization and the full capital/O&M cost model are not ported. The code does not execute Excel macros, synchronize a live workbook or calculate a PFAS effluent concentration. Geometry, pipe-size lookups and workbook default assumptions still need project review.

Checks: `node scripts/test_gac.mjs`, `node scripts/test_gac_knowledge.mjs`, `node scripts/test_gac_workbook.mjs` (22 cached Excel outputs and 3 AutoSize dimensions), and `node scripts/test_gac_ui.mjs` against the local preview.

CoDesign should be described as an AI-assisted decision support and data-generation prototype. It supports:

- P&ID knowledge graph structuring,
- evidence-grounded GraphRAG questions,
- design decision logging,
- human/AI response source tracking,
- reviewable candidate graph export.

It does not produce final approved engineering P&ID drawings and does not perform standards-certified DEXPI XML write-back.

## Source Data

The upstream source dataset is the public DEXPI repository **Public Example PIDs / TrainingTestCases**:

https://gitlab.com/dexpi/TrainingTestCases

Most normalized XML inputs in this project were prepared from the DEXPI 1.3 example PIDs:

https://gitlab.com/dexpi/TrainingTestCases/-/tree/master/dexpi%201.3/example%20pids?ref_type=heads

This project does not claim authorship of the original P&ID examples. CoDesign creates derived research artifacts from those public examples, including normalized XML inputs, pyDEXPI JSON exports, GEXF graph exports, SQLite tables, decision logs, and candidate graph datasets.

The interface, workbook explanations, follow-up questions and generated replies use English. The Assistant header distinguishes an online API with a missing key from a configured AI API. Configure OPENAI_API_KEY in the local .env file and restart the API to enable AI generation. Do not enter credentials in chat.
