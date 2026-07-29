# rag_chain.py

import networkx as nx
from typing import Optional
import time

def retrieve(graph: nx.Graph, query: str) -> Optional[nx.Graph]:
    query_lower = query.lower()
    relevant_nodes = set()

    for node_id, data in graph.nodes(data=True):
        # 1) id 매칭 (eq_1, line_10 이런 것)
        if str(node_id).lower() in query_lower:
            relevant_nodes.add(node_id)
            continue

        # 2) tag_name / equipment_tag / line_number / pid_name 매칭
        for key in ["tag_name", "equipment_tag", "line_number", "pid_name"]:
            val = (data.get(key) or "").lower()
            if val and val in query_lower:
                relevant_nodes.add(node_id)
                break

        # 3) label(Equipment / Nozzle / Line) 키워드 매칭 (옵션)
        label = (data.get("label") or "").lower()
        if label and label in query_lower:
            relevant_nodes.add(node_id)
            continue

        # 4) description (있다면)
        desc = (data.get("description") or "").lower()
        if desc and any(w in desc for w in query_lower.split()):
            relevant_nodes.add(node_id)
            continue

    if not relevant_nodes:
        return None

    # undirected/ directed 둘 다 동작하도록 neighbors() 사용
    subgraph_nodes = set(relevant_nodes)
    for node_id in relevant_nodes:
        try:
            neighbors = graph.neighbors(node_id)
        except AttributeError:
            # 혹시 DiGraph일 경우 대비
            neighbors = list(graph.successors(node_id)) + list(graph.predecessors(node_id))
        for n in neighbors:
            subgraph_nodes.add(n)

    return graph.subgraph(subgraph_nodes)

def format_subgraph_for_prompt(subgraph, max_nodes=12, max_edges=24, max_chars=4000):
    if not subgraph:
        return "No relevant information found in the knowledge graph."

    nodes = list(subgraph.nodes(data=True))[:max_nodes]
    keep = {nid for nid, _ in nodes}
    edges = [
        (s, t, d) for s, t, d in subgraph.edges(data=True)
        if s in keep and t in keep
    ][:max_edges]

    parts = ["Here is the relevant information from the P&ID knowledge graph:"]

    for nid, data in nodes:
        label = data.get("label") or data.get("type") or "Node"
        tag_name = data.get("tag_name")
        pid_name = data.get("pid_name")
        line_number = data.get("line_number")
        equipment_tag = data.get("equipment_tag")

        header = f"\n- [{label}] {nid}"
        if tag_name:
            header += f" (tag: {tag_name})"
        if line_number and label == "Line":
            header += f" (line: {line_number})"
        parts.append(header)

        # 타입별로 조금 더 풀어주기
        if label == "Equipment":
            cls = data.get("class_name")
            if cls:
                parts.append(f"  - Class: {cls}")
            if pid_name:
                parts.append(f"  - P&ID: {pid_name}")

        elif label == "Nozzle":
            subtag = data.get("subtag")
            nd = data.get("nominal_diameter")
            if equipment_tag:
                parts.append(f"  - Equipment: {equipment_tag}")
            if subtag:
                parts.append(f"  - Nozzle: {subtag}")
            if nd:
                parts.append(f"  - Nominal diameter: {nd}")

        elif label == "Line":
            fluid = data.get("fluid_code")
            nd = data.get("nominal_diameter")
            pclass = data.get("piping_class_code")
            if line_number:
                parts.append(f"  - Line number: {line_number}")
            if fluid:
                parts.append(f"  - Fluid code: {fluid}")
            if nd:
                parts.append(f"  - Nominal diameter: {nd}")
            if pclass:
                parts.append(f"  - Piping class: {pclass}")

        # description 있으면 그냥 덧붙이기
        desc = data.get("description")
        if desc:
            parts.append(f"  - Description: {desc}")

    parts.append("\nRelationships:")
    for s, t, d in edges:
        rel_type = d.get("type", "related_to")
        parts.append(f"- {s} --[{rel_type}]--> {t}")

    txt = "\n".join(parts)
    return txt[:max_chars]
