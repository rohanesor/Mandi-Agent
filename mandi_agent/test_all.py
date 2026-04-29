import requests

BASE = "http://localhost:5678"

tests = [
    ("POST", "/webhook/mandi_agent/advisory-delivered", {"event": "advisory_delivered"}),
    ("POST", "/webhook/mandi_agent/bundle-formed", {"event": "bundle_formed"}),
    ("POST", "/webhook/mandi_agent/scheme-check", {"event": "scheme_check", "farmer": {"farmer_id": "F1"}}),
    ("POST", "/webhook/mandi_agent/price-crash", {"drop_pct": 30, "block_id": "B1", "crop": "Tomato"}),
    ("POST", "/webhook/mandi_agent/spoilage-emergency", {"spoilage_pct": 70, "farmer_phone": "+911111111111"}),
]

for method, path, payload in tests:
    url = f"{BASE}{path}"
    try:
        resp = requests.request(method, url, json=payload, timeout=20)
        print(f"{method} {url} -> {resp.status_code}")
    except Exception as e:
        print(f"{method} {url} -> ERROR: {e}")
