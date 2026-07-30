#!/usr/bin/env python3
"""
Convert DEXPI/Proteus XML P&ID files into pyDEXPI JSON and NetworkX GEXF graphs.

Source data convention:
  data/pids/*.xml        Original DEXPI/Proteus XML P&IDs
  data/json/*.json       pyDEXPI JSON model output
  data/gexf/*.gexf       NetworkX knowledge graph output

This script is adapted from the earlier CoDesign_020426 preprocessing pipeline and
kept here so the final report package is reproducible from the codesign folder.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import networkx as nx
from pydexpi.loaders import JsonSerializer, ProteusSerializer
from pydexpi.loaders.ml_graph_loader import MLGraphLoader
from tqdm import tqdm


def load_dexpi_model(input_dir: Path, filename: str):
    loader = ProteusSerializer()
    try:
        return loader.load(str(input_dir), filename)
    except Exception as exc:
        print(f"[WARN] Failed to load {filename}: {exc}")
        return None


def convert_to_graph(dexpi_model, filename: str):
    if dexpi_model is None:
        return None
    graph_loader = MLGraphLoader(plant_model=dexpi_model)
    try:
        return graph_loader.dexpi_to_graph(dexpi_model)
    except Exception as exc:
        print(f"[WARN] Failed to convert {filename} to graph: {exc}")
        return None


def clean_graph_attributes(graph: nx.Graph) -> nx.Graph:
    for _, attrs in graph.nodes(data=True):
        for key in [key for key, value in attrs.items() if value is None]:
            del attrs[key]
    for _, _, attrs in graph.edges(data=True):
        for key in [key for key, value in attrs.items() if value is None]:
            del attrs[key]
    return graph


def serialize_outputs(dexpi_model, graph, base_name: str, json_dir: Path, gexf_dir: Path) -> tuple[bool, bool]:
    json_ok = False
    gexf_ok = False

    if dexpi_model is not None:
        try:
            JsonSerializer().save(dexpi_model, str(json_dir), base_name)
            json_ok = True
        except Exception as exc:
            print(f"[WARN] Failed to save JSON for {base_name}: {exc}")

    if graph is not None:
        try:
            nx.write_gexf(clean_graph_attributes(graph), gexf_dir / f"{base_name}.gexf")
            gexf_ok = True
        except Exception as exc:
            print(f"[WARN] Failed to save GEXF for {base_name}: {exc}")

    return json_ok, gexf_ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert DEXPI/Proteus XML P&IDs to JSON and GEXF knowledge graphs.")
    parser.add_argument("--input-dir", default="data/pids", help="Directory containing source XML P&IDs.")
    parser.add_argument("--json-dir", default="data/json", help="Directory for pyDEXPI JSON outputs.")
    parser.add_argument("--gexf-dir", default="data/gexf", help="Directory for NetworkX GEXF outputs.")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    json_dir = Path(args.json_dir)
    gexf_dir = Path(args.gexf_dir)
    json_dir.mkdir(parents=True, exist_ok=True)
    gexf_dir.mkdir(parents=True, exist_ok=True)

    xml_files = sorted(input_dir.glob("*.xml"))
    if not xml_files:
        raise SystemExit(f"No XML files found in {input_dir}")

    results = {"loaded": 0, "json": 0, "gexf": 0}
    for xml_path in tqdm(xml_files, desc="Converting P&IDs"):
        dexpi_model = load_dexpi_model(input_dir, xml_path.name)
        if dexpi_model is None:
            continue
        results["loaded"] += 1
        graph = convert_to_graph(dexpi_model, xml_path.name)
        json_ok, gexf_ok = serialize_outputs(dexpi_model, graph, xml_path.stem, json_dir, gexf_dir)
        results["json"] += int(json_ok)
        results["gexf"] += int(gexf_ok)

    print("Conversion complete")
    print(f"Source XML files: {len(xml_files)}")
    print(f"Loaded models: {results['loaded']}")
    print(f"JSON outputs: {results['json']}")
    print(f"GEXF outputs: {results['gexf']}")


if __name__ == "__main__":
    main()
