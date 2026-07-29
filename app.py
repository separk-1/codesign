# === BOOT LOG ===
print("BOOT: app.py loaded", flush=True)

import os, math, json, traceback, time
from types import SimpleNamespace
from typing import Optional, Dict, Any
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
import networkx as nx
import rag_chain

# .env 로드
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
#print("key", os.getenv("OPENAI_API_KEY")[:8])

# EBCT 계산 모듈
from calculator import compute_ebct
import graph_manager as gm

# ---- Knowledge Graph ----
G = gm.get_graph()

# ---- OpenAI 설정 ----
from openai import OpenAI
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    print("[warn] OPENAI_API_KEY not set; RAG generation will likely fail.", flush=True)
_oa_client = OpenAI(api_key=OPENAI_API_KEY)

MODEL_MAIN = os.getenv("OPENAI_MODEL_MAIN", "gpt-5-mini")
MODEL_FALLBACK = os.getenv("OPENAI_MODEL_FALLBACK", "gpt-5-nano")

class _OpenAIShim:
    """Gemini .generate_content를 흉내내는 간단한 shim"""

    def __init__(self, client, model_main: str, model_fallback: str):
        self.client = client
        self.model_main = model_main
        self.model_fallback = model_fallback

    def _call(self, model: str, content: str):
        r = self.client.chat.completions.create(
            model=model,
            temperature=1,
            messages=[
                {"role": "user", "content": content}
            ],
        )
        txt = r.choices[0].message.content or ""
        return SimpleNamespace(text=txt)

    def generate_content(self, parts):
        content = "\n\n".join([p for p in parts if isinstance(p, str)])
        for i, model in enumerate([self.model_main, self.model_fallback]):
            try:
                return self._call(model, content)
            except Exception as e:
                print(f"[openai shim] attempt {i+1} with {model} failed: {e}", flush=True)
                time.sleep(0.7 * (2 ** i))
        return SimpleNamespace(text="")

_gen_model = _OpenAIShim(_oa_client, MODEL_MAIN, MODEL_FALLBACK)

# Flask app
app = Flask(__name__, static_folder="static")

# ----------------- 기본 라우트 -----------------
@app.get("/ping")
def ping():
    return "pong", 200

@app.get("/")
def index():
    return send_from_directory(".", "index.html")

# 계산 API
@app.post("/api/calculate")
def calculate():
    data = request.get_json(silent=True) or {}
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"ok": False, "error": "Missing 'query'"}), 400
    try:
        res = compute_ebct(query)
        if not isinstance(res, dict) or "minutes" not in res:
            raise ValueError("compute_ebct returned invalid result")
        return jsonify(res), 200
    except Exception as e:
        print("[/api/calculate] error:", e, flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500

# 지식 그래프 API
@app.get("/api/knowledge-graph")
def get_knowledge_graph():
    graph_data = nx.node_link_data(G, edges="links")
    return jsonify(graph_data)

# ----------------- 유틸 -----------------
def _num(x, d: int = 4):
    try:
        return round(float(x), d)
    except:
        return x

def compute_from_used(used: Dict[str, Any]):
    if not used:
        return None
    V = used.get("volume_gal")
    Q = used.get("flow_gpm")
    if V is not None and Q not in (None, 0):
        return V / Q
    GAL_PER_FT3 = 7.48052
    D = used.get("diam_ft")
    H = used.get("height_ft")
    Q = used.get("flow_gpm")
    if None not in (D, H, Q) and Q != 0:
        V_ft3 = math.pi * (D / 2.0) ** 2 * H
        V_gal = V_ft3 * GAL_PER_FT3
        return V_gal / Q
    return None

@app.post("/api/chat")
def chat():
    data = request.get_json(silent=True) or {}
    messages = data.get("messages") or []
    state = data.get("state") or {}

    if not messages:
        return jsonify({"error": "No messages"}), 400

    user_msg = messages[-1].get("content") or ""

    try:
        # 그래프 기반 RAG만 사용
        rag_result = rag_chain.execute_rag_chain(G, user_msg, _gen_model)

        return jsonify({
            "reply": rag_result.get("reply", "Sorry, I could not process that request."),
            "rationale": rag_result.get("rationale", ""),
            "state": state,  # 필요하면 그대로 유지
        }), 200

    except Exception as e:
        tb = traceback.format_exc()
        print(f"[/api/chat] error: {e}\n{tb}", flush=True)
        return jsonify({
            "reply": f"An internal error occurred during processing: {e}",
            "rationale": f"Full trace: {tb}",
            "state": state,
        }), 200


# ----------------- Graph Management APIs -----------------
@app.post("/api/graph/nodes")
def add_graph_node():
    data = request.get_json()
    if not data or "id" not in data or "attributes" not in data:
        return jsonify({"ok": False, "error": "Missing 'id' or 'attributes'"}), 400
    node_id = data["id"]; attributes = data["attributes"]
    success = gm.add_node(G, node_id, attributes)
    return (jsonify({"ok": True, "message": f"Node '{node_id}' added."}), 201) if success \
           else (jsonify({"ok": False, "error": f"Node '{node_id}' already exists."}), 409)

@app.put("/api/graph/nodes/<path:node_id>")
def update_graph_node(node_id):
    data = request.get_json()
    if not data or "attributes" not in data:
        return jsonify({"ok": False, "error": "Missing 'attributes'"}), 400
    attributes = data["attributes"]
    success = gm.update_node(G, node_id, attributes)
    return (jsonify({"ok": True, "message": f"Node '{node_id}' updated."}), 200) if success \
           else (jsonify({"ok": False, "error": f"Node '{node_id}' not found."}), 404)

@app.delete("/api/graph/nodes/<path:node_id>")
def delete_graph_node(node_id):
    success = gm.delete_node(G, node_id)
    return (jsonify({"ok": True, "message": f"Node '{node_id}' deleted."}), 200) if success \
           else (jsonify({"ok": False, "error": f"Node '{node_id}' not found."}), 404)

@app.post("/api/graph/edges")
def add_graph_edge():
    data = request.get_json()
    if not data or "source" not in data or "target" not in data or "attributes" not in data:
        return jsonify({"ok": False, "error": "Missing 'source', 'target', or 'attributes'"}), 400
    source = data["source"]; target = data["target"]; attributes = data["attributes"]
    success = gm.add_edge(G, source, target, attributes)
    return (jsonify({"ok": True, "message": f"Edge from '{source}' to '{target}' added."}), 201) if success \
           else (jsonify({"ok": False, "error": "Edge already exists or one of the nodes was not found."}), 409)

@app.delete("/api/graph/edges")
def delete_graph_edge():
    data = request.get_json()
    if not data or "source" not in data or "target" not in data:
        return jsonify({"ok": False, "error": "Missing 'source' or 'target'"}), 400
    source = data["source"]; target = data["target"]
    success = gm.delete_edge(G, source, target)
    return (jsonify({"ok": True, "message": f"Edge from '{source}' to '{target}' deleted."}), 200) if success \
           else (jsonify({"ok": False, "error": "Edge not found."}), 404)

# === RUN SERVER ===
if __name__ == "__main__":
    print("RUN: starting Flask...", flush=True)
    app.run("0.0.0.0", int(os.environ.get("PORT", 5001)), debug=False)
