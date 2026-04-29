"""
Import all n8n workflow JSON files via the n8n MCP Server.
Converts JSON workflow definitions to n8n Workflow SDK code,
validates them, and creates them in n8n.
"""

import sys
import io
import os
import json
import glob
import re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import requests

MCP_URL = "http://localhost:5678/mcp-server/http"
MCP_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ZWVkYWU0MS03ZjdlLTQ1NTYtODNiMS03OTFkZmE4OTY4NjkiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6ImQzMjE0YTkzLWJiNDUtNDhkOS1iOGUxLTYxNDY1ZmRkNmY4MCIsImlhdCI6MTc3NjExMTYxMX0.GvrMtfB7QS1944MrUZw7b2R7cagaAFbHfSiu1rnaQnA"

HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {MCP_TOKEN}",
    "Accept": "application/json, text/event-stream",
}

WORKFLOWS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "n8n", "workflows")

req_id = 0
session_id = None


def mcp_request(method, params=None):
    global req_id, session_id
    req_id += 1
    payload = {"jsonrpc": "2.0", "id": req_id, "method": method}
    if params:
        payload["params"] = params

    headers = dict(HEADERS)
    if session_id:
        headers["Mcp-Session-Id"] = session_id

    resp = requests.post(MCP_URL, headers=headers, json=payload, timeout=120)

    if "Mcp-Session-Id" in resp.headers:
        session_id = resp.headers["Mcp-Session-Id"]

    content_type = resp.headers.get("Content-Type", "")
    if "text/event-stream" in content_type:
        for line in resp.text.strip().split("\n"):
            line = line.strip()
            if line.startswith("data: "):
                data = json.loads(line[6:])
                if "result" in data:
                    return data["result"]
                elif "error" in data:
                    return {"error": data["error"]}
        return None
    else:
        data = resp.json()
        return data.get("result", data)


def call_tool(name, arguments):
    result = mcp_request("tools/call", {"name": name, "arguments": arguments})
    return result


def safe_var_name(name):
    """Convert node name to a valid JS variable name."""
    # Remove special chars, convert spaces/dashes to camelCase
    name = re.sub(r'[^a-zA-Z0-9\s_-]', '', name)
    parts = re.split(r'[\s_-]+', name.strip())
    if not parts:
        return 'node'
    result = parts[0].lower()
    for p in parts[1:]:
        if p:
            result += p[0].upper() + p[1:]
    # Ensure it starts with a letter
    if result and not result[0].isalpha():
        result = 'n' + result
    return result or 'node'


def escape_js_string(s):
    """Escape a string for use in JS template literal or string."""
    if s is None:
        return ''
    s = str(s)
    s = s.replace('\\', '\\\\')
    s = s.replace('`', '\\`')
    s = s.replace('${', '\\${')
    return s


def params_to_js(params, indent=6):
    """Convert a parameters dict to JS object literal string."""
    return json.dumps(params, indent=2, ensure_ascii=False)


def is_trigger_node(node_type):
    """Check if a node type is a trigger."""
    trigger_keywords = ['trigger', 'webhook', 'cron', 'schedule']
    return any(kw in node_type.lower() for kw in trigger_keywords)


def json_to_sdk_code(workflow_data):
    """Convert a single n8n workflow JSON to SDK code."""
    wf_name = workflow_data.get('name', 'Unnamed Workflow')
    nodes = workflow_data.get('nodes', [])
    connections = workflow_data.get('connections', {})

    # Build node name -> node data map
    node_map = {}
    for n in nodes:
        node_map[n['name']] = n

    # Build adjacency from connections
    # connections[sourceName].main[outputIndex] = [{node: targetName, ...}]
    adjacency = {}  # sourceName -> [targetName, ...]
    for source_name, conn_data in connections.items():
        main_outputs = conn_data.get('main', [])
        targets = []
        for output_group in main_outputs:
            if output_group:
                for target in output_group:
                    targets.append(target['node'])
        adjacency[source_name] = targets

    # Find trigger/start nodes (nodes that are not targets of any connection)
    all_targets = set()
    for targets in adjacency.values():
        all_targets.update(targets)

    start_nodes = [n['name'] for n in nodes if n['name'] not in all_targets]
    if not start_nodes:
        start_nodes = [nodes[0]['name']] if nodes else []

    # Generate variable names
    var_names = {}
    used_vars = set()
    for n in nodes:
        base_var = safe_var_name(n['name'])
        var = base_var
        counter = 1
        while var in used_vars:
            var = f"{base_var}{counter}"
            counter += 1
        var_names[n['name']] = var
        used_vars.add(var)

    lines = []
    lines.append("import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';")
    lines.append("")

    # Declare all nodes
    for n in nodes:
        var = var_names[n['name']]
        node_type = n.get('type', '')
        version = n.get('typeVersion', 1)
        position = n.get('position', [0, 0])
        parameters = n.get('parameters', {})

        config = {
            'name': n['name'],
            'position': position,
        }
        if parameters:
            config['parameters'] = parameters

        config_json = json.dumps(config, indent=2, ensure_ascii=False)

        if is_trigger_node(node_type):
            lines.append(f"const {var} = trigger({{")
            lines.append(f"  type: '{node_type}',")
            lines.append(f"  version: {version},")
            lines.append(f"  config: {config_json},")
            lines.append(f"  output: [{{}}]")
            lines.append(f"}});")
        elif node_type == 'n8n-nodes-base.if':
            lines.append(f"const {var} = ifElse({{")
            lines.append(f"  version: {version},")
            lines.append(f"  config: {config_json}")
            lines.append(f"}});")
        elif node_type == 'n8n-nodes-base.merge':
            lines.append(f"const {var} = merge({{")
            lines.append(f"  version: {version},")
            lines.append(f"  config: {config_json}")
            lines.append(f"}});")
        else:
            lines.append(f"const {var} = node({{")
            lines.append(f"  type: '{node_type}',")
            lines.append(f"  version: {version},")
            lines.append(f"  config: {config_json},")
            lines.append(f"  output: [{{}}]")
            lines.append(f"}});")
        lines.append("")

    # Build chains via BFS from start nodes
    # For simplicity, do a linear chain approach
    lines.append(f"export default workflow('id', '{escape_js_string(wf_name)}')")

    visited = set()

    def build_chain(node_name, depth=0):
        """Recursively build .to() chains."""
        if node_name in visited:
            return
        visited.add(node_name)

        targets = adjacency.get(node_name, [])
        var = var_names.get(node_name)

        if not targets:
            return

        # Get the connection details for branching
        conn_data = connections.get(node_name, {})
        main_outputs = conn_data.get('main', [])
        node_data = node_map.get(node_name, {})
        node_type = node_data.get('type', '')

        if node_type == 'n8n-nodes-base.if' and len(main_outputs) >= 2:
            # Handle IF branching
            true_targets = main_outputs[0] if len(main_outputs) > 0 else []
            false_targets = main_outputs[1] if len(main_outputs) > 1 else []

            if true_targets:
                true_name = true_targets[0]['node']
                true_var = var_names.get(true_name, 'unknown')
                lines.append(f"  .to({var}")
                lines.append(f"    .onTrue({true_var})")
                if false_targets:
                    false_name = false_targets[0]['node']
                    false_var = var_names.get(false_name, 'unknown')
                    lines.append(f"    .onFalse({false_var}))")
                else:
                    lines.append(f"  )")

                # Continue chain from true branch targets
                for t in true_targets:
                    visited.add(t['node'])
                    build_chain(t['node'], depth + 1)
                for t in false_targets:
                    visited.add(t['node'])
                    build_chain(t['node'], depth + 1)
            return

        # Linear chain: single output
        if len(targets) == 1:
            target_var = var_names.get(targets[0], 'unknown')
            lines.append(f"  .to({target_var})")
            build_chain(targets[0], depth + 1)
        else:
            # Multiple targets from same output — chain to first, add others separately
            for t in targets:
                target_var = var_names.get(t, 'unknown')
                lines.append(f"  .to({target_var})")
            for t in targets:
                build_chain(t, depth + 1)

    # Start with trigger nodes
    for start_name in start_nodes:
        start_var = var_names[start_name]
        lines.append(f"  .add({start_var})")
        build_chain(start_name)

    lines.append(";")

    return "\n".join(lines)


def extract_workflows_from_json(filepath):
    """Extract workflow(s) from a JSON file. Some files have a 'workflows' array."""
    with open(filepath, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    if "workflows" in data:
        return data["workflows"]
    else:
        return [data]


def main():
    # Initialize MCP
    print("=" * 60)
    print("  n8n Workflow Import via MCP")
    print("=" * 60)
    print()

    print("Initializing MCP session...")
    result = mcp_request("initialize", {
        "protocolVersion": "2025-03-26",
        "capabilities": {},
        "clientInfo": {"name": "mandi-agent-importer", "version": "1.0.0"}
    })
    if not result or "error" in (result or {}):
        print("[ERROR] Failed to initialize MCP session!")
        return
    print(f"  Connected to: {result.get('serverInfo', {}).get('name', '?')} v{result.get('serverInfo', {}).get('version', '?')}")
    print()

    # Check existing workflows
    print("Checking existing workflows...")
    existing = call_tool("search_workflows", {"query": ""})
    existing_names = set()
    if existing and "content" in existing:
        for c in existing.get("content", []):
            if c.get("type") == "text":
                text = c["text"]
                # Parse workflow names from the response
                for line in text.split("\n"):
                    if "name:" in line.lower() or "Name:" in line:
                        name = line.split(":", 1)[-1].strip().strip('"').strip("'")
                        if name:
                            existing_names.add(name)
                print(f"  Existing workflows response:\n{text[:500]}")
    print()

    # Gather all workflows
    files = sorted(glob.glob(os.path.join(WORKFLOWS_DIR, "*.json")))
    print(f"Found {len(files)} workflow JSON files")
    print()

    all_workflows = []
    for filepath in files:
        wfs = extract_workflows_from_json(filepath)
        for wf in wfs:
            all_workflows.append((filepath, wf))

    print(f"Total workflows to import: {len(all_workflows)}")
    print()

    success = 0
    failed = 0
    skipped = 0

    for filepath, wf_data in all_workflows:
        wf_name = wf_data.get("name", os.path.basename(filepath))
        filename = os.path.basename(filepath)

        if wf_name in existing_names:
            print(f"[SKIP] '{wf_name}' -- already exists")
            skipped += 1
            continue

        print(f"[...] Converting '{wf_name}' -> SDK code...")

        try:
            sdk_code = json_to_sdk_code(wf_data)
        except Exception as e:
            print(f"  [FAIL] Conversion error: {e}")
            failed += 1
            continue

        # Save generated code for debugging
        debug_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "n8n", "sdk_output")
        os.makedirs(debug_dir, exist_ok=True)
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', wf_name)
        debug_file = os.path.join(debug_dir, f"{safe_name}.js")
        with open(debug_file, "w", encoding="utf-8") as f:
            f.write(sdk_code)
        print(f"  Saved SDK code to: {debug_file}")

        # Step 1: Validate the workflow code
        print(f"  Validating...")
        val_result = call_tool("validate_workflow", {"code": sdk_code})
        validation_ok = False
        if val_result and "content" in val_result:
            for c in val_result.get("content", []):
                if c.get("type") == "text":
                    val_text = c["text"]
                    print(f"  Validation: {val_text[:300]}")
                    if "error" not in val_text.lower() or "valid" in val_text.lower():
                        validation_ok = True

        # Step 2: Create the workflow
        print(f"  Creating workflow...")
        create_result = call_tool("create_workflow_from_code", {
            "code": sdk_code,
            "name": wf_name,
            "description": f"Mandi-Agent workflow: {wf_name}"
        })

        if create_result and "content" in create_result:
            result_text = ""
            for c in create_result.get("content", []):
                if c.get("type") == "text":
                    result_text += c["text"]

            if "error" in result_text.lower() and "success" not in result_text.lower():
                print(f"  [FAIL] {result_text[:300]}")
                failed += 1
            else:
                print(f"  [OK] {result_text[:300]}")
                success += 1
        else:
            print(f"  [FAIL] No response from create_workflow_from_code")
            failed += 1

        print()

    print("=" * 60)
    print(f"RESULTS: {success} imported, {skipped} skipped, {failed} failed")
    print(f"  Total workflows processed: {len(all_workflows)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
