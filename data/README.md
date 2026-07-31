# CoDesign Data Package

This folder is organized as the data package for the CUAHSI final report.

## Source P&ID Information

- `raw/`: source folders copied from the DEXPI public example P&ID training cases.
- `pids/`: normalized DEXPI/Proteus XML files used as conversion inputs.
- `sample/`: small default PFAS treatment example used by the web app.

Original upstream source: DEXPI **Public Example PIDs / TrainingTestCases**

- Repository: https://gitlab.com/dexpi/TrainingTestCases
- DEXPI 1.3 example PIDs: https://gitlab.com/dexpi/TrainingTestCases/-/tree/master/dexpi%201.3/example%20pids?ref_type=heads

The files in this project are derived or normalized research artifacts created from those public examples; the original P&ID example authorship remains with the upstream DEXPI repository.

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

## Included Sample Outputs

The repository includes one human-run and one AI-agent-run sample output set for report review:

- `design_decisions/sample_human_decision_log.csv`
- `design_decisions/sample_agent_decision_log.csv`
- `candidates/sample_human_candidate_pid.json`
- `candidates/sample_agent_candidate_pid.json`

The human sample demonstrates direct user choices. The agent sample demonstrates AI-default assumptions marked for human review.
