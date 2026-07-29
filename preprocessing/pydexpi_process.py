from pydexpi.loaders import ProteusSerializer
from pydexpi.loaders.ml_graph_loader import MLGraphLoader
from pydexpi.loaders import JsonSerializer
import networkx as nx
import os
from tqdm import tqdm # Import tqdm for the progress bar

# --- Configuration ---
PIDS_INPUT_DIR = "../data/pids"
JSON_OUTPUT_DIR = "../data/json"
GEXF_OUTPUT_DIR = "../data/gexf"
# ---------------------

# ----------------------------------------------------
# 🌟 Stage 1: Load XML file to pyDEXPI Model Object
# ----------------------------------------------------
def load_dexpi_model(dir_path: str, filename: str):
    """Loads a Proteus XML file into a pyDEXPI object."""
    # Reduced print output for cleaner progress bar display
    # print(f"\n--- Stage 1: Starting load of {filename} ---") 
    
    my_loader = ProteusSerializer()
    
    try:
        dexpi_model = my_loader.load(dir_path, filename)
        # print(f"✅ Stage 1 Complete: DEXPI Model object successfully created.")
        return dexpi_model
    except Exception as e:
        # print(f"❌ Stage 1 Error: Failed to load {filename}. Error: {e}")
        return None

# ----------------------------------------------------
# 🚀 Stage 2: Convert pyDEXPI Model to NetworkX Graph
# ----------------------------------------------------
def convert_to_graph(dexpi_model, filename):
    """Converts the pyDEXPI model to a NetworkX graph."""
    if dexpi_model is None:
        return None
    
    # print(f"\n--- Stage 2: Starting Graph Conversion for {filename} ---")
    
    my_graph_loader = MLGraphLoader(plant_model=dexpi_model)
    
    try:
        G = my_graph_loader.dexpi_to_graph(dexpi_model)
        # print("✅ Stage 2 Complete: Converted to NetworkX graph.")
        return G
    except Exception as e:
        # print(f"❌ Stage 2 Error: Failed to convert graph for {filename}. Error: {e}")
        return None

# ----------------------------------------------------
# 🧹 Graph Cleanup Function
# ----------------------------------------------------
def clean_graph_attributes(G):
    """Removes all attributes with NoneType values from nodes and edges."""
    
    # Clean Node Attributes
    for _, attributes in G.nodes(data=True):
        keys_to_delete = [key for key, value in attributes.items() if value is None]
        for key in keys_to_delete:
            del attributes[key]
            
    # Clean Edge Attributes
    for _, _, attributes in G.edges(data=True):
        keys_to_delete = [key for key, value in attributes.items() if value is None]
        for key in keys_to_delete:
            del attributes[key]
            
    return G

# ----------------------------------------------------
# 💾 Stage 3: Serialize and Save Data to Files
# ----------------------------------------------------
def serialize_and_save(dexpi_model, G, base_name):
    """Saves the pyDEXPI model (JSON) and the NetworkX graph (GEXF).
       Returns a tuple: (json_success: bool, gexf_success: bool)
    """
    json_success = False
    gexf_success = False

    # --- 3A: Saving DEXPI Model (JSON) ---
    if dexpi_model is not None:
        json_serializer = JsonSerializer()
        json_output_path = os.path.join(JSON_OUTPUT_DIR, f"{base_name}.json")
        try:
            json_serializer.save(dexpi_model, JSON_OUTPUT_DIR, base_name)
            json_success = True
        except Exception:
            pass

    # --- 3B: Saving NetworkX Graph (GEXF) ---
    if G is not None:
        try:
            # 1. Clean the graph before attempting GEXF serialization
            G_cleaned = clean_graph_attributes(G)
            
            gexf_output_path = os.path.join(GEXF_OUTPUT_DIR, f"{base_name}.gexf")
            
            # 2. Save the cleaned graph
            nx.write_gexf(G_cleaned, gexf_output_path)
            gexf_success = True
        except Exception:
            pass

    return json_success, gexf_success


# ----------------------------------------------------
# 🔄 Main Execution Loop with Progress Bar & Summary
# ----------------------------------------------------
def main():
    # 1. Create output directories if they don't exist
    os.makedirs(JSON_OUTPUT_DIR, exist_ok=True)
    os.makedirs(GEXF_OUTPUT_DIR, exist_ok=True)
    
    # 2. Get list of XML files
    try:
        xml_files = [f for f in os.listdir(PIDS_INPUT_DIR) if f.endswith(".xml")]
    except FileNotFoundError:
        print(f"\n❌ Error: Input directory not found at {PIDS_INPUT_DIR}. Please check the path.")
        return
        
    if not xml_files:
        print(f"\n⚠️ Warning: No XML files found in {PIDS_INPUT_DIR}.")
        return

    total_files = len(xml_files)
    results = {
        'json_success': 0,
        'gexf_success': 0,
        'load_failure': 0
    }
    
    print(f"\n--- Starting Batch Processing of {total_files} files ---")

    # 3. Process each file using tqdm for progress bar
    # The 'desc' parameter is the text displayed on the progress bar.
    for index, filename in tqdm(enumerate(xml_files), total=total_files, desc="Processing P&ID files"):
        
        # Determine the base name for output files (e.g., E06V01-VER.EX01)
        base_name = os.path.splitext(filename)[0]
        
        # Stage 1: Load Model
        dexpi_model_obj = load_dexpi_model(PIDS_INPUT_DIR, filename)

        if dexpi_model_obj is None:
            results['load_failure'] += 1
            continue

        # Stage 2: Convert to Graph
        graph_obj = convert_to_graph(dexpi_model_obj, filename)
        
        # Stage 3: Save results and tally success/failure
        json_ok, gexf_ok = serialize_and_save(dexpi_model_obj, graph_obj, base_name)
        
        if json_ok:
            results['json_success'] += 1
        if gexf_ok:
            results['gexf_success'] += 1
        
        # Optional: Update the progress bar description for current file (if needed)
        # tqdm.set_postfix({'file': filename, 'status': 'OK'}) # Too verbose for 35 files

    # --- Summary Report (Final Print) ---
    total_processed = total_files - results['load_failure']
    print("\n\n" + "=" * 50)
    print("                BATCH PROCESSING COMPLETE")
    print("=" * 50)
    print(f"Total Files Found: {total_files}")
    print(f"Total Files Successfully Loaded/Processed: {total_processed} / {total_files}")
    print("-" * 50)
    print(f"JSON (.json) Files Saved: {results['json_success']} / {total_processed}")
    print(f"GEXF (.gexf) Files Saved: {results['gexf_success']} / {total_processed}")
    print(f"Files Failed to Load/Process: {results['load_failure']} / {total_files}")
    print("=" * 50)


if __name__ == "__main__":
    main()