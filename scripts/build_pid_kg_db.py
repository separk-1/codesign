#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_pid_db.py

Create a SQLite database from pyDEXPI JSON models in ../data/json.

- Parses pyDEXPI JSON files (as produced by pyDEXPI) from a directory.
- Extracts:
  * PIDs (one per JSON file)
  * Equipment (taggedPlantItems)
  * Nozzles (per equipment)
  * Lines (pipingNetworkSystems)
  * Connections (segment.connections between nozzles, with line attributes)

Usage:
    python build_pid_db.py \
        --json-dir ../data/json \
        --db-path pid.db
"""

import argparse
import json
import os
import sqlite3
from typing import Dict, Any, List, Optional


def init_db(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    # Enable foreign keys
    cur.execute("PRAGMA foreign_keys = ON;")

    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS pids (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            source_file TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS equipment (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            pid_id        INTEGER NOT NULL,
            external_id   TEXT,
            tag_name      TEXT,
            class         TEXT,
            tag_prefix    TEXT,
            tag_sequence  TEXT,
            tag_suffix    TEXT,
            description   TEXT,
            FOREIGN KEY (pid_id) REFERENCES pids (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS nozzles (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            equipment_id         INTEGER NOT NULL,
            external_id          TEXT,
            subtag               TEXT,
            nominal_diameter     TEXT,
            nominal_pressure     TEXT,
            FOREIGN KEY (equipment_id) REFERENCES equipment (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS lines (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            pid_id               INTEGER NOT NULL,
            external_id          TEXT,
            line_number          TEXT,
            fluid_code           TEXT,
            nominal_diameter     TEXT,
            piping_class_code    TEXT,
            FOREIGN KEY (pid_id) REFERENCES pids (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS connections (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            pid_id          INTEGER NOT NULL,
            external_id     TEXT,
            from_nozzle_id  INTEGER NOT NULL,
            to_nozzle_id    INTEGER NOT NULL,
            line_id         INTEGER,
            FOREIGN KEY (pid_id)         REFERENCES pids (id) ON DELETE CASCADE,
            FOREIGN KEY (from_nozzle_id) REFERENCES nozzles (id) ON DELETE CASCADE,
            FOREIGN KEY (to_nozzle_id)   REFERENCES nozzles (id) ON DELETE CASCADE,
            FOREIGN KEY (line_id)        REFERENCES lines (id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_equipment_pid ON equipment (pid_id);
        CREATE INDEX IF NOT EXISTS idx_nozzles_equip ON nozzles (equipment_id);
        CREATE INDEX IF NOT EXISTS idx_lines_pid ON lines (pid_id);
        CREATE INDEX IF NOT EXISTS idx_connections_pid ON connections (pid_id);
        """
    )
    conn.commit()


def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def ensure_pid(conn: sqlite3.Connection, source_file: str) -> Optional[int]:
    """
    Insert a row into pids if not exists.
    Returns the pid_id, or None if the file was already imported.
    """
    cur = conn.cursor()
    cur.execute("SELECT id FROM pids WHERE source_file = ?", (source_file,))
    row = cur.fetchone()
    if row:
        # Already imported
        return None

    name = os.path.splitext(os.path.basename(source_file))[0]
    cur.execute(
        "INSERT INTO pids (name, source_file) VALUES (?, ?)",
        (name, source_file),
    )
    conn.commit()
    return cur.lastrowid


def insert_equipment_and_nozzles(
    conn: sqlite3.Connection,
    pid_id: int,
    tagged_plant_items: List[Dict[str, Any]],
) -> Dict[str, int]:
    """
    Insert equipment and their nozzles.

    Returns:
        nozzle_id_map: mapping from JSON nozzle external_id -> nozzles.id in DB
    """
    cur = conn.cursor()
    nozzle_id_map: Dict[str, int] = {}

    for item in tagged_plant_items:
        e_ext_id = item.get("id")
        data = item.get("data", {}) or {}
        comp = item.get("composition", {}) or {}

        tag_name = data.get("tagName")
        tag_prefix = data.get("tagNamePrefix")
        tag_seq = data.get("tagNameSequenceNumber")
        tag_suffix = data.get("tagNameSuffix")
        desc = data.get("equipmentDescription")
        uri = item.get("uri") or ""
        # e.g. "https://.../CentrifugalPump" -> take last part as class
        e_class = uri.rstrip("/").split("/")[-1] if uri else None

        cur.execute(
            """
            INSERT INTO equipment (
                pid_id, external_id, tag_name, class,
                tag_prefix, tag_sequence, tag_suffix, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pid_id,
                e_ext_id,
                tag_name,
                e_class,
                tag_prefix,
                tag_seq,
                tag_suffix,
                desc,
            ),
        )
        equip_id = cur.lastrowid

        # Nozzles
        nozzles = (comp.get("nozzles") or []) if isinstance(comp.get("nozzles"), list) else []
        for noz in nozzles:
            n_ext_id = noz.get("id")
            n_data = noz.get("data", {}) or {}
            n_comp = noz.get("composition", {}) or {}

            subtag = n_data.get("subTagName")

            # Try to get ND from first node if present
            nominal_diameter = None
            nominal_pressure = None
            nodes = n_comp.get("nodes") or []
            if isinstance(nodes, list) and nodes:
                nd_data = nodes[0].get("data", {}) or {}
                nominal_diameter = nd_data.get("nominalDiameterNumericalValueRepresentation")
            # nominal pressure from nozzle data
            nominal_pressure = n_data.get("nominalPressureNumericalValueRepresentation")

            cur.execute(
                """
                INSERT INTO nozzles (
                    equipment_id, external_id, subtag,
                    nominal_diameter, nominal_pressure
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    equip_id,
                    n_ext_id,
                    subtag,
                    str(nominal_diameter) if nominal_diameter is not None else None,
                    str(nominal_pressure) if nominal_pressure is not None else None,
                ),
            )
            nozzle_id = cur.lastrowid
            if n_ext_id:
                nozzle_id_map[n_ext_id] = nozzle_id

    conn.commit()
    return nozzle_id_map


def insert_lines_and_connections(
    conn: sqlite3.Connection,
    pid_id: int,
    piping_network_systems: List[Dict[str, Any]],
    nozzle_id_map: Dict[str, int],
) -> None:
    cur = conn.cursor()

    for pns in piping_network_systems:
        pns_id = pns.get("id")
        data = pns.get("data", {}) or {}
        comp = pns.get("composition", {}) or {}

        line_number = data.get("lineNumber")
        fluid_code = data.get("fluidCode")
        nominal_diameter = data.get("nominalDiameterNumericalValueRepresentation")
        piping_class_code = data.get("pipingClassCode")

        cur.execute(
            """
            INSERT INTO lines (
                pid_id, external_id, line_number,
                fluid_code, nominal_diameter, piping_class_code
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                pid_id,
                pns_id,
                line_number,
                fluid_code,
                str(nominal_diameter) if nominal_diameter is not None else None,
                piping_class_code,
            ),
        )
        line_db_id = cur.lastrowid

        segments = comp.get("segments") or []
        if not isinstance(segments, list):
            continue

        for seg in segments:
            seg_comp = seg.get("composition", {}) or {}
            connections = seg_comp.get("connections") or []
            if not isinstance(connections, list):
                continue

            for conn_obj in connections:
                c_ext_id = conn_obj.get("id")
                ref = conn_obj.get("reference", {}) or {}

                src_noz_ext = ref.get("sourceItem")
                tgt_noz_ext = ref.get("targetItem")

                src_nozzle_id = nozzle_id_map.get(src_noz_ext)
                tgt_nozzle_id = nozzle_id_map.get(tgt_noz_ext)

                # Skip connections where we cannot resolve either side
                if src_nozzle_id is None or tgt_nozzle_id is None:
                    # You may want to log this in a real project
                    continue

                cur.execute(
                    """
                    INSERT INTO connections (
                        pid_id, external_id,
                        from_nozzle_id, to_nozzle_id, line_id
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        pid_id,
                        c_ext_id,
                        src_nozzle_id,
                        tgt_nozzle_id,
                        line_db_id,
                    ),
                )

    conn.commit()


def process_json_file(conn: sqlite3.Connection, json_path: str) -> None:
    print(f"[INFO] Processing {json_path}")
    pid_id = ensure_pid(conn, json_path)
    if pid_id is None:
        print(f"[INFO]   Skipping (already imported)")
        return

    data = load_json(json_path)

    try:
        cm = data["composition"]["conceptualModel"]["composition"]
    except KeyError as exc:
        print(f"[WARN]   conceptualModel not found in {json_path}: {exc}")
        return

    tagged_plant_items = cm.get("taggedPlantItems") or []
    piping_network_systems = cm.get("pipingNetworkSystems") or []

    nozzle_id_map = insert_equipment_and_nozzles(conn, pid_id, tagged_plant_items)
    insert_lines_and_connections(conn, pid_id, piping_network_systems, nozzle_id_map)


def build_db(json_dir: str, db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        init_db(conn)

        # Walk directory and process all .json files
        for root, _dirs, files in os.walk(json_dir):
            for fname in files:
                if not fname.lower().endswith(".json"):
                    continue
                fpath = os.path.join(root, fname)
                process_json_file(conn, os.path.abspath(fpath))
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a SQLite DB from pyDEXPI JSON models."
    )
    parser.add_argument(
        "--json-dir",
        type=str,
        default=os.path.join(os.path.dirname(__file__), "..", "data", "json"),
        help="Directory containing pyDEXPI JSON files (default: ../data/json relative to this script).",
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default="pid.db",
        help="Output SQLite database path (default: pid.db in current directory).",
    )

    args = parser.parse_args()
    json_dir = os.path.abspath(args.json_dir)
    db_path = os.path.abspath(args.db_path)

    if not os.path.isdir(json_dir):
        raise SystemExit(f"JSON directory not found: {json_dir}")

    print(f"[INFO] JSON directory : {json_dir}")
    print(f"[INFO] DB path        : {db_path}")
    build_db(json_dir, db_path)
    print("[INFO] Done.")


if __name__ == "__main__":
    main()
