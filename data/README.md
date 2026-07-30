# CoDesign Data Package

This folder is organized as the data package for the CUAHSI final report.

## Source P&ID Information

- `raw/`: source folders copied from the DEXPI public example P&ID training cases.
- `pids/`: normalized DEXPI/Proteus XML files used as conversion inputs.
- `sample/`: small default PFAS treatment example used by the web app.

Original source: https://gitlab.com/dexpi/TrainingTestCases/-/tree/master

## Transformed Knowledge Graph Data

- `json/`: pyDEXPI JSON model exports.
- `gexf/`: NetworkX graph exports for knowledge graph analysis and visualization.
- `schemas/knowledge_graph_schema.json`: lightweight schema for the graph/data fields used by this prototype.

## Design Decision Dataset

- `design_decisions/`: exported CSV/JSON decision logs from human or AI-agent runs.
- Each row should represent one design question/answer exchange, with responder type stored separately from response content.

## Detailed Candidate P&ID Dataset

- `candidates/`: generated reviewable candidate P&ID JSON files exported from the web app.
- `schemas/candidate_pid_schema.json`: lightweight schema for exported candidate files.
