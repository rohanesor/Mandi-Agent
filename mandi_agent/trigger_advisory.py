import asyncio
import os
from dotenv import load_dotenv

# Ensure we're hitting the local n8n
os.environ["N8N_WEBHOOK_URL"] = "http://localhost:5678/webhook/"

from mandi_agent.backend.automations.n8n_triggers import trigger_advisory_delivered

async def run_trigger():
    load_dotenv(r"d:\ktr\mandi_agent\.env")
    
    # Trigger parameters
    farmer_id = "F-10023"
    advisory_id = "ADV-9921"
    language = "en"
    channel = "whatsapp"
    
    print(f"Triggering WhatsApp Advisory Loop for farmer {farmer_id}...")
    
    result = await trigger_advisory_delivered(
        farmer_id=farmer_id,
        advisory_id=advisory_id,
        language=language,
        channel=channel
    )
    
    if result:
        print("✅ Triggered successfully!")
    else:
        print("❌ Trigger failed. Is n8n running and the webhook active?")

if __name__ == "__main__":
    asyncio.run(run_trigger())
