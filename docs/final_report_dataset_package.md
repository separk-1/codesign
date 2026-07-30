# Final Report Dataset Package

This repository should contain the artifacts needed to explain and reproduce the prototype: original P&ID inputs, transformed knowledge graph data, transformation code, design decision logs, and generated detailed candidate P&IDs.

## 1. Original P&ID Information

The source P&ID examples are stored in `data/raw/` and normalized XML inputs are stored in `data/pids/`. The data is based on the public DEXPI training test cases: https://gitlab.com/dexpi/TrainingTestCases/-/tree/master

## 2. Transformation Code

- `scripts/convert_dexpi_to_kg.py` converts DEXPI/Proteus XML files into pyDEXPI JSON and NetworkX GEXF graph files.
- `scripts/build_pid_kg_db.py` converts the pyDEXPI JSON files into a SQLite-style relational knowledge graph table structure.
- `scripts/requirements-transform.txt` lists the Python dependencies for the conversion pipeline.

Example commands:

```bash
pip install -r scripts/requirements-transform.txt
python scripts/convert_dexpi_to_kg.py --input-dir data/pids --json-dir data/json --gexf-dir data/gexf
python scripts/build_pid_kg_db.py --json-dir data/json --db-path data/pid_kg.db
```

## 3. Transformed Knowledge Graph Data and Schema

- `data/json/` contains pyDEXPI JSON outputs.
- `data/gexf/` contains graph files derived from the same P&ID inputs.
- `data/schemas/knowledge_graph_schema.json` documents the node/link structure used by the prototype.

## 4. Design Decision Dataset

The web app records each design exchange as a decision log entry. Exported logs should be saved in `data/design_decisions/`. These entries are the research dataset for studying how AI-mediated questions help people translate conceptual process intent into more detailed P&ID design decisions.

## 5. Detailed Candidate P&ID Dataset

The web app can export reviewable candidate P&ID JSON files after the review gate allows candidate generation. These should be saved in `data/candidates/`. Candidate files include the selected design assumptions, generated object annotations, review items, and a copy of the decision trail.
