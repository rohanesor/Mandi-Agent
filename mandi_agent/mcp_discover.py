import requests
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

URL = "https://rohanesor.app.n8n.cloud/mcp-server/http"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5N2RkNGQ2Ni1kMjAwLTQzMjMtYWNiYy03OTIxZjUyYWI3ZTYiLCJpc3MiOiJuOG4iLCJhdWQiOiJtY3Atc2VydmVyLWFwaSIsImp0aSI6ImNmMjc5YjYxLTdkNDQtNGJjNi1hN2ZmLWZkMjM4NDg4Y2QyYSIsImlhdCI6MTc3NjAyMzk1MH0.N8rCENJt8tErm_FRrS5eIh2lu40YU_ygkLXZZIQwM64"
}

def call_mcp(method, params=None, req_id=1):
    payload = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": method,
    }
    if params:
        payload["params"] = params
    try:
        r = requests.post(URL, headers=HEADERS, json=payload, timeout=15)
        # Handle SSE response if the server forces it despite our request
        if "text/event-stream" in r.headers.get("Content-Type", ""):
            print(f"[{method}] Received SSE response:")
            for line in r.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8')
                    # Just print the raw SSE for now to see what we get
                    print(decoded_line)
            return None
        return r.json()
    except Exception as e:
        print(f"Error calling {method}: {e}")
        try:
             print("Response content:", r.content)
        except:
             pass
        return None

# Initialize
print("=== INITIALIZE ===")
init_result = call_mcp("initialize", {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {"name": "mandi-agent", "version": "1.0"}
}, 1)

if init_result:
     print(json.dumps(init_result, indent=2, default=str)[:1000])

print()

# List tools
print("=== TOOLS ===")
tools_result = call_mcp("tools/list", {}, 2)
if tools_result and "result" in tools_result and "tools" in tools_result["result"]:
    tools = tools_result["result"]["tools"]
    print(f"Found {len(tools)} tools:")
    for t in tools:
        desc = t.get("description", "")[:120]
        print(f"  - {t['name']}: {desc}")
        if "inputSchema" in t:
            props = t["inputSchema"].get("properties", {})
            if props:
                print(f"    params: {list(props.keys())}")
elif tools_result:
    print(json.dumps(tools_result, indent=2, default=str)[:1000])
