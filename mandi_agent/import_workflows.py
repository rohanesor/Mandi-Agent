"""
Import all n8n workflow JSON files via the n8n REST API.
Usage: python import_workflows.py
"""

import sys
import os
import io
import json
import glob

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

try:
    import requests
except ImportError:
    print("Installing requests...")
    os.system(f'"{sys.executable}" -m pip install requests python-dotenv --quiet')
    import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # Manual .env loading
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip()

N8N_BASE_URL = os.getenv("N8N_BASE_URL", "https://rohanesor.app.n8n.cloud")
N8N_API_KEY = os.getenv("N8N_API_KEY")

WORKFLOWS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "n8n", "workflows")

HEADERS = {
    "Content-Type": "application/json",
    "X-N8N-API-KEY": N8N_API_KEY,
}


def get_existing_workflows():
    """Fetch all existing workflows to avoid duplicates."""
    url = f"{N8N_BASE_URL}/api/v1/workflows"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return {wf["name"]: wf["id"] for wf in data.get("data", [])}
    except Exception as e:
        print(f"[WARN] Could not fetch existing workflows: {e}")
        return {}


def import_workflow(filepath, existing):
    """Import a single workflow JSON file."""
    filename = os.path.basename(filepath)

    with open(filepath, "r", encoding="utf-8") as f:
        workflow_data = json.load(f)

    name = workflow_data.get("name", filename)

    # Check if workflow already exists
    if name in existing:
        print(f"[SKIP] '{name}' -- already exists (id: {existing[name]})")
        return "skip"

    url = f"{N8N_BASE_URL}/api/v1/workflows"

    try:
        resp = requests.post(url, headers=HEADERS, json=workflow_data, timeout=30)
        resp.raise_for_status()
        result = resp.json()
        wf_id = result.get("id", "?")
        print(f"[OK]   '{name}' -> id: {wf_id}")
        return wf_id
    except requests.exceptions.HTTPError as e:
        print(f"[FAIL] '{name}' -- {e}")
        if e.response is not None:
            try:
                print(f"       Detail: {e.response.json()}")
            except Exception:
                print(f"       Status: {e.response.status_code}")
        return None
    except Exception as e:
        print(f"[FAIL] '{name}' -- {e}")
        return None


def activate_workflow(wf_id, name):
    """Activate a workflow by ID."""
    url = f"{N8N_BASE_URL}/api/v1/workflows/{wf_id}"
    try:
        resp = requests.patch(url, headers=HEADERS, json={"active": True}, timeout=15)
        resp.raise_for_status()
        print(f"[ACTIVE] '{name}'")
        return True
    except Exception as e:
        print(f"[WARN] Could not activate '{name}': {e}")
        return False


def main():
    if not N8N_API_KEY:
        print("[ERROR] N8N_API_KEY not found in .env file!")
        return

    print(f"n8n instance: {N8N_BASE_URL}")
    print(f"Workflows dir: {WORKFLOWS_DIR}")
    print()

    # Get all JSON workflow files
    files = sorted(glob.glob(os.path.join(WORKFLOWS_DIR, "*.json")))
    if not files:
        print("[ERROR] No workflow JSON files found!")
        return

    print(f"Found {len(files)} workflow files:")
    for f in files:
        print(f"  - {os.path.basename(f)}")
    print()

    # Fetch existing workflows
    print("Checking existing workflows...")
    existing = get_existing_workflows()
    if existing:
        print(f"  Found {len(existing)} existing workflow(s)")
    print()

    # Import each workflow
    print("=" * 60)
    print("IMPORTING WORKFLOWS")
    print("=" * 60)

    success = 0
    failed = 0
    skipped = 0
    imported = []  # (id, name)

    for filepath in files:
        with open(filepath, "r", encoding="utf-8") as f:
            wf_name = json.load(f).get("name", os.path.basename(filepath))

        result = import_workflow(filepath, existing)
        if result == "skip":
            skipped += 1
        elif result is not None:
            success += 1
            imported.append((result, wf_name))
        else:
            failed += 1

    print()
    print("=" * 60)
    print(f"RESULTS: {success} imported, {skipped} skipped, {failed} failed (out of {len(files)} total)")
    print("=" * 60)

    # Try to activate imported workflows
    if imported:
        print()
        print("Activating imported workflows...")
        for wf_id, wf_name in imported:
            activate_workflow(wf_id, wf_name)

    print()
    print(f"Dashboard: {N8N_BASE_URL}")
    print("Done!")


if __name__ == "__main__":
    main()
