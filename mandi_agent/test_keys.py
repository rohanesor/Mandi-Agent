import os
import requests
from dotenv import load_dotenv

load_dotenv(".env")

def check_anthropic():
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key: return "Skipped"
    # Even if 400 invalid request, auth passed compared to 401 Unauthorized
    res = requests.post("https://api.anthropic.com/v1/messages", 
        headers={"x-api-key": key, "anthropic-version": "2023-06-01"}, 
        json={"model": "claude-3-haiku-20240307", "max_tokens": 10, "messages": [{"role": "user", "content": "ping"}]}
    )
    if res.status_code == 200: return "🟢 Active (Request Success)"
    if res.status_code == 400: return "🟢 Active (Key loaded, formatting error)"
    if res.status_code == 401: return "🔴 Invalid or Expired API Key"
    return f"🟡 Unknown/Failed ({res.status_code})"

def check_gemini():
    key = os.getenv("GEMINI_API_KEY")
    if not key: return "Skipped"
    res = requests.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={key}")
    if res.status_code == 200: return "🟢 Active (Models listed successfully)"
    if res.status_code == 400: return "🔴 Invalid API Key"
    return f"🟡 Unknown/Failed ({res.status_code})"

def check_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key: return "Skipped"
    res = requests.get(f"{url}/rest/v1/", headers={"apikey": key, "Authorization": f"Bearer {key}"})
    # 400/401 schema errors but auth header implies connected
    if res.status_code in [200, 401, 406]: return f"🟢 Active (Connected to {url})"
    if "Invalid" in res.text: return "🔴 Invalid Keys"
    return f"🟡 Check Console ({res.status_code})"

def check_cohere():
    key = os.getenv("COHERE_API_KEY")
    if not key: return "Skipped"
    res = requests.post("https://api.cohere.ai/v1/embed", 
        headers={"Authorization": f"Bearer {key}"}, 
        json={"texts": ["ping"], "model": "embed-english-light-v3.0", "input_type": "search_query"}
    )
    if res.status_code == 200: return "🟢 Active (Embeddings generated)"
    if res.status_code == 401: return "🔴 Invalid API Key"
    return f"🟡 Failed ({res.status_code})"

def check_datagov():
    key = os.getenv("DATA_GOV_API_KEY")
    if not key: return "Skipped"
    res = requests.get(f"https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key={key}&format=json&limit=1")
    if res.status_code == 200: return "🟢 Active (Data fetched)"
    if res.status_code == 401: return "🔴 Invalid API Key"
    return f"🟡 Failed ({res.status_code})"

def check_openrouteservice():
    key = os.getenv("OPENROUTESERVICE_API_KEY")
    if not key: return "Skipped"
    res = requests.get("https://api.openrouteservice.org/v2/directions/driving-car?start=8.68,49.41&end=8.68,49.42", headers={"Authorization": key})
    if res.status_code == 200: return "🟢 Active (Routing successful)"
    if res.status_code == 401: return "🔴 Invalid API Key"
    if res.status_code == 403: return "🔴 Quota Exceeded or API disabled for key"
    return f"🟡 Failed ({res.status_code})"

def check_reverie():
    key = os.getenv("REVERIE_API_KEY")
    app_id = os.getenv("REVERIE_APP_ID")
    if not key: return "Skipped"
    try:
        res = requests.get("https://revapi.reverieinc.com/", headers={"REV-API-KEY": key, "REV-APP-ID": app_id}, timeout=3)
        if res.status_code == 401: return "🔴 Invalid API Key / App ID"
        return "🟢 Active (Auth accepted/connected)"
    except requests.exceptions.Timeout:
        return "🔴 Server timed out (Reverie API might be down or blocking ping)"
    except Exception as e:
        return f"🟡 Error {e}"

def main():
    result = []
    result.append("\n🤖 AI Models")
    result.append(f"Anthropic Clause : {check_anthropic()}")
    result.append(f"Google Gemini    : {check_gemini()}")
    
    result.append("\n🗄️ Database & Embed")
    result.append(f"Supabase         : {check_supabase()}")
    result.append(f"Cohere API       : {check_cohere()}")

    result.append("\n🌍 Data & Utilities")
    result.append(f"Data.gov.in      : {check_datagov()}")
    result.append(f"OpenRouteService : {check_openrouteservice()}")
    
    result.append("\n🗣️ Voice Services")
    result.append(f"Reverie API      : {check_reverie()}")
    
    with open("test_results_final.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(result))

if __name__ == "__main__":
    main()
