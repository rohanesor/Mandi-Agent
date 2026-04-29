"""Archive all existing workflows, then reimport."""
import sys, io, json, requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

MCP_URL = "http://localhost:5678/mcp-server/http"
MCP_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ZWVkYWU0MS03ZjdlLTQ1NTYtODNiMS03OTFkZmE4OTY4NjkiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6ImQzMjE0YTkzLWJiNDUtNDhkOS1iOGUxLTYxNDY1ZmRkNmY4MCIsImlhdCI6MTc3NjExMTYxMX0.GvrMtfB7QS1944MrUZw7b2R7cagaAFbHfSiu1rnaQnA"
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
    resp = requests.post(MCP_URL, headers=headers, json=payload, timeout=120)
    if "Mcp-Session-Id" in resp.headers:
        session_id = resp.headers["Mcp-Session-Id"]
    ct = resp.headers.get("Content-Type", "")
    if "text/event-stream" in ct:
        for line in resp.text.strip().split("\n"):
            line = line.strip()
            if line.startswith("data: "):
                data = json.loads(line[6:])
                if "result" in data:
                    return data["result"]
        return None
    else:
        data = resp.json()
        return data.get("result", data)

# Init
print("Initializing...")
mcp_request("initialize", {
    "protocolVersion": "2025-03-26",
    "capabilities": {},
    "clientInfo": {"name": "cleanup", "version": "1.0.0"}
})

# Search all existing workflows
print("Searching existing workflows...")
result = mcp_request("tools/call", {"name": "search_workflows", "arguments": {"query": ""}})

if result and "content" in result:
    text = result["content"][0]["text"]
    # Parse the JSON data from the response
    try:
        data = json.loads(text)
        workflows = data.get("data", [])
    except:
        workflows = []
    
    print(f"Found {len(workflows)} workflows to archive")
    
    for wf in workflows:
        wf_id = wf["id"]
        wf_name = wf["name"]
        print(f"  Archiving '{wf_name}' ({wf_id})...")
        r = mcp_request("tools/call", {"name": "archive_workflow", "arguments": {"workflowId": wf_id}})
        if r and "content" in r:
            print(f"    -> {r['content'][0]['text'][:120]}")

print("\nAll old workflows archived. Ready for reimport.")
