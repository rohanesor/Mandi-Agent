"""
Step 1: Get the n8n SDK reference and understand the workflow format needed.
Step 2: Try to import workflows using the correct code format.
"""

import sys
import io
import json

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import requests

MCP_URL = "http://localhost:5678/mcp-server/http"
MCP_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5OGIxNmNiMy02MDFlLTQxMDQtYmQ2Mi00ZTljZjUxNThkMGIiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6ImM3ZDk1MDA3LWM1ZDMtNDU3YS05ZGI1LTljMDlkNGI4NDNkMyIsImlhdCI6MTc3NjExMDE3NH0.vQMFL4HkVp_nVYjgHQJFGxxvERNcP2fbL0qEdT1uRM8"

HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {MCP_TOKEN}",
    "Accept": "application/json, text/event-stream",
}

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

    resp = requests.post(MCP_URL, headers=headers, json=payload, timeout=60)
    
    # Capture session ID
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


# Initialize
print("=== Initializing ===")
result = mcp_request("initialize", {
    "protocolVersion": "2025-03-26",
    "capabilities": {},
    "clientInfo": {"name": "importer", "version": "1.0.0"}
})
print(f"Init: OK")

# Get SDK reference
print("\n=== Getting SDK Reference ===")
result = mcp_request("tools/call", {
    "name": "get_sdk_reference",
    "arguments": {}
})
if result:
    # Print the full text content
    for content in result.get("content", []):
        if content.get("type") == "text":
            print(content["text"][:5000])
