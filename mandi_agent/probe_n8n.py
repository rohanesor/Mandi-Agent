import requests
import os
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("N8N_API_KEY")
base_url = "https://rohanesor.app.n8n.cloud"

headers = {
    "X-N8N-API-KEY": key
}

paths = [
    "/api/v1/workflows",
    "/api/v1/nodes",
    "/api/v1/credentials",
    "/api/v1/users",
]

for path in paths:
    url = base_url + path
    try:
        r = requests.get(url, headers=headers)
        print(f"GET {url} -> {r.status_code}")
        if r.status_code != 404:
            print(f"  Response: {r.text[:200]}")
    except Exception as e:
        print(f"GET {url} -> Error: {e}")
