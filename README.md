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
