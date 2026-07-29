import networkx as nx
import json
import os
from typing import Optional, Dict, Any, List

GRAPH_FILE_PATH = "knowledge_graph.json"
_G = None

def get_graph():
    """Singleton accessor for the knowledge graph."""
    global _G
    if _G is None:
        _G = load_graph()
    return _G

def load_graph() -> nx.DiGraph:
    """Loads the graph from the JSON file, or creates a default one if the file doesn't exist."""
    if os.path.exists(GRAPH_FILE_PATH):
        try:
            with open(GRAPH_FILE_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return nx.node_link_graph(data)
        except (json.JSONDecodeError, nx.NetworkXError) as e:
            print(f"Error loading graph from {GRAPH_FILE_PATH}: {e}. Creating a new default graph.", flush=True)
            return create_default_knowledge_graph()
    else:
        print(f"Graph file not found at {GRAPH_FILE_PATH}. Creating a new default graph.", flush=True)
        return create_default_knowledge_graph()

def save_graph(graph: nx.DiGraph):
    """Saves the graph to the JSON file."""
    try:
        data = nx.node_link_data(graph)
        with open(GRAPH_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving graph to {GRAPH_FILE_PATH}: {e}", flush=True)

def add_node(graph: nx.DiGraph, node_id: str, attributes: Dict[str, Any]) -> bool:
    """Adds a new node to the graph and saves the graph."""
    if graph.has_node(node_id):
        return False  # Node already exists
    graph.add_node(node_id, **attributes)
    save_graph(graph)
    return True

def update_node(graph: nx.DiGraph, node_id: str, attributes: Dict[str, Any]) -> bool:
    """Updates an existing node's attributes and saves the graph."""
    if not graph.has_node(node_id):
        return False # Node does not exist
    for key, value in attributes.items():
        graph.nodes[node_id][key] = value
    save_graph(graph)
    return True

def delete_node(graph: nx.DiGraph, node_id: str) -> bool:
    """Deletes a node from the graph and saves the graph."""
    if not graph.has_node(node_id):
        return False # Node does not exist
    graph.remove_node(node_id)
    save_graph(graph)
    return True

def add_edge(graph: nx.DiGraph, source: str, target: str, attributes: Dict[str, Any]) -> bool:
    """Adds a new edge to the graph and saves the graph."""
    if not graph.has_node(source) or not graph.has_node(target):
        return False # Source or target node does not exist
    if graph.has_edge(source, target):
        return False # Edge already exists
    graph.add_edge(source, target, **attributes)
    save_graph(graph)
    return True

def delete_edge(graph: nx.DiGraph, source: str, target: str) -> bool:
    """Deletes an edge from the graph and saves the graph."""
    if not graph.has_edge(source, target):
        return False # Edge does not exist
    graph.remove_edge(source, target)
    save_graph(graph)
    return True

def create_default_knowledge_graph() -> nx.DiGraph:
    """
    Creates and populates the default knowledge graph with P&ID concepts 
    and equipment data if the JSON file is missing.
    """
    # 기본 P&ID 데이터 구조
    default_json_data = {
      "directed": True,
      "multigraph": False,
      "graph": {},
      "nodes": [
        { "id": "Pump→HEX flow", "type": "scenario", "description": "Pump to HEX flow scenario." },
        { "id": "Nozzle connection", "type": "task", "description": "Nozzle connection task." },
        { "id": "N-2 to N-1 Connection", "type": "connection_option", "description": "Standard connection.", "ratio": 0.85 },
        { "id": "N-2 to N-3 Connection", "type": "connection_option", "description": "Alternate connection.", "ratio": 0.15 },
        { "id": "Line spec 80-75HB13-MNb-47132", "type": "specification", "description": "Standard line spec." },
        { "id": "P-4713", "type": "equipment", "subtype": "pump", "description": "Standard Pump." },
        { "id": "H-1009", "type": "equipment", "subtype": "heat_exchanger", "description": "Standard HEX." }
      ],
      "links": [
        { "source": "Pump→HEX flow", "target": "Nozzle connection", "type": "design_step" },
        { "source": "Nozzle connection", "target": "N-2 to N-1 Connection", "type": "has_option" },
        { "source": "N-2 to N-1 Connection", "target": "Line spec 80-75HB13-MNb-47132", "type": "results_in" },
        { "source": "P-4713", "target": "H-1009", "type": "feeds" }
      ]
    }
    
    # JSON 데이터로 그래프 생성
    G = nx.node_link_graph(default_json_data)

    # 새로운 기본 그래프를 JSON 파일에 저장
    save_graph(G)
    return G