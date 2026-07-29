import argparse
import json
import os
import sqlite3
from typing import Dict, Any

import networkx as nx
from networkx.readwrite import json_graph

# python db_to_json.py --db pid.db --all-out graph_all.json
# python db_to_json.py --db pid.db --all-out graph_all.json --per-pid-dir graphs_json

def build_graph_for_pid(conn: sqlite3.Connection, pid_id: int) -> nx.Graph:
    """
    주어진 pid_id에 대해 equipment / nozzles / lines / connections를 읽어서
    단일 Graph로 구성한다.
    """
    cur = conn.cursor()
    G = nx.Graph()

    # PID 메타 정보
    cur.execute("SELECT id, name, source_file FROM pids WHERE id = ?", (pid_id,))
    row = cur.fetchone()
    if not row:
        raise ValueError(f"PID id={pid_id} not found")
    _, pid_name, source_file = row
    G.graph["pid_id"] = pid_id
    G.graph["pid_name"] = pid_name
    G.graph["source_file"] = source_file

    # 1) Equipment 노드
    cur.execute(
        """
        SELECT id, tag_name, class, tag_prefix, tag_sequence, tag_suffix, description
        FROM equipment
        WHERE pid_id = ?
        """,
        (pid_id,),
    )
    for (eq_id, tag_name, cls, prefix, seq, suffix, desc) in cur.fetchall():
        node_id = f"eq_{eq_id}"
        G.add_node(
            node_id,
            id=node_id,
            db_id=eq_id,
            label="Equipment",
            tag_name=tag_name,
            class_name=cls,
            tag_prefix=prefix,
            tag_sequence=seq,
            tag_suffix=suffix,
            description=desc,
            pid_id=pid_id,
            pid_name=pid_name,
        )

    # 2) Nozzle 노드 및 Equipment-노즐 엣지
    cur.execute(
        """
        SELECT
            n.id,
            n.subtag,
            n.nominal_diameter,
            n.nominal_pressure,
            e.id      AS equipment_id,
            e.tag_name,
            e.class
        FROM nozzles n
        JOIN equipment e ON n.equipment_id = e.id
        WHERE e.pid_id = ?
        """,
        (pid_id,),
    )
    for (
        noz_id,
        subtag,
        nd,
        np,
        eq_id,
        eq_tag,
        eq_class,
    ) in cur.fetchall():
        noz_node_id = f"noz_{noz_id}"
        eq_node_id = f"eq_{eq_id}"

        G.add_node(
            noz_node_id,
            id=noz_node_id,
            db_id=noz_id,
            label="Nozzle",
            subtag=subtag,
            nominal_diameter=nd,
            nominal_pressure=np,
            equipment_id=eq_id,
            equipment_tag=eq_tag,
            equipment_class=eq_class,
            pid_id=pid_id,
            pid_name=pid_name,
        )

        if eq_node_id in G:
            G.add_edge(
                eq_node_id,
                noz_node_id,
                type="HAS_NOZZLE",
            )

    # 3) Line 노드
    cur.execute(
        """
        SELECT id, line_number, fluid_code,
               nominal_diameter, piping_class_code
        FROM lines
        WHERE pid_id = ?
        """,
        (pid_id,),
    )
    for (
        line_id,
        line_number,
        fluid_code,
        nd,
        class_code,
    ) in cur.fetchall():
        line_node_id = f"line_{line_id}"
        G.add_node(
            line_node_id,
            id=line_node_id,
            db_id=line_id,
            label="Line",
            line_number=line_number,
            fluid_code=fluid_code,
            nominal_diameter=nd,
            piping_class_code=class_code,
            pid_id=pid_id,
            pid_name=pid_name,
        )

    # 4) 노즐-노즐/라인 연결
    cur.execute(
        """
        SELECT
            c.id,
            c.from_nozzle_id,
            c.to_nozzle_id,
            l.id              AS line_id,
            l.line_number,
            l.fluid_code,
            l.nominal_diameter,
            l.piping_class_code
        FROM connections c
        JOIN lines l ON c.line_id = l.id
        WHERE c.pid_id = ?
        """,
        (pid_id,),
    )
    for (
        conn_id,
        from_noz_id,
        to_noz_id,
        line_id,
        line_number,
        fluid_code,
        nd,
        class_code,
    ) in cur.fetchall():
        from_node = f"noz_{from_noz_id}"
        to_node = f"noz_{to_noz_id}"
        line_node = f"line_{line_id}"

        # 노즐 간 엣지
        if from_node in G and to_node in G:
            G.add_edge(
                from_node,
                to_node,
                type="CONNECTED_BY_LINE",
                connection_id=conn_id,
                line_id=line_id,
                line_number=line_number,
                fluid_code=fluid_code,
                nominal_diameter=nd,
                piping_class_code=class_code,
            )

        # 라인 노드와 노즐을 연결하는 엣지 (선택적)
        if line_node in G and from_node in G:
            G.add_edge(
                line_node,
                from_node,
                type="LINE_TO_NOZZLE",
            )
        if line_node in G and to_node in G:
            G.add_edge(
                line_node,
                to_node,
                type="LINE_TO_NOZZLE",
            )

    return G


def export_all_pids_as_one_graph(conn: sqlite3.Connection) -> nx.Graph:
    """
    DB의 모든 P&ID를 하나의 큰 그래프로 합친다.
    pid_id/pid_name은 노드 속성으로 유지한다.
    """
    cur = conn.cursor()
    cur.execute("SELECT id FROM pids;")
    pid_ids = [row[0] for row in cur.fetchall()]

    G_all = nx.Graph()
    for pid_id in pid_ids:
        G_pid = build_graph_for_pid(conn, pid_id)
        G_all = nx.compose(G_all, G_pid)
    G_all.graph["name"] = "pid_all"
    return G_all


def save_graph_json(G: nx.Graph, path: str) -> None:
    data: Dict[str, Any] = json_graph.node_link_data(G)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export pid.db as knowledge-graph JSON (node-link format)."
    )
    parser.add_argument(
        "--db",
        type=str,
        default="pid.db",
        help="Path to SQLite database (default: pid.db)",
    )
    parser.add_argument(
        "--all-out",
        type=str,
        default="graph_all.json",
        help="Output path for combined graph JSON (default: graph_all.json)",
    )
    parser.add_argument(
        "--per-pid-dir",
        type=str,
        default=None,
        help="If set, export per-PID graph JSON into this directory.",
    )

    args = parser.parse_args()
    db_path = os.path.abspath(args.db)

    if not os.path.isfile(db_path):
        raise SystemExit(f"Database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    try:
        # 1) 전체 그래프 하나로 export
        print("[INFO] Building combined graph for all P&IDs...")
        G_all = export_all_pids_as_one_graph(conn)
        all_out_path = os.path.abspath(args.all_out)
        save_graph_json(G_all, all_out_path)
        print(f"[INFO] Saved combined graph JSON -> {all_out_path}")

        # 2) PID별 export (옵션)
        if args.per_pid_dir:
            out_dir = os.path.abspath(args.per_pid_dir)
            os.makedirs(out_dir, exist_ok=True)

            cur = conn.cursor()
            cur.execute("SELECT id, name FROM pids;")
            for pid_id, pid_name in cur.fetchall():
                print(f"[INFO] Exporting JSON graph for PID {pid_name} (id={pid_id})")
                G_pid = build_graph_for_pid(conn, pid_id)
                safe_name = "".join(
                    c if c.isalnum() or c in "-_." else "_" for c in pid_name
                )
                out_path = os.path.join(out_dir, f"{safe_name}.json")
                save_graph_json(G_pid, out_path)
                print(f"[INFO]   -> {out_path}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()