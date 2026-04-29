import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from dotenv import load_dotenv
import os

from mandi_agent.backend.models.schemas import CooperativeBundle, FarmerProfile
from mandi_agent.backend.automations.n8n_triggers import (
    trigger_advisory_delivered,
    trigger_bundle_formed,
    trigger_spoilage_emergency,
    trigger_price_crash_warning,
    trigger_fpo_digest,
    trigger_scheme_check,
    trigger_harvest_alert,
)

# Silence standard httpx logging
logging.getLogger("httpx").setLevel(logging.WARNING)

def print_header(title):
    print(f"\n{'='*60}")
    print(f"🚀 TRIGGERING: {title}")
    print(f"{'='*60}")

async def run_demo():
    # Load env so N8N_WEBHOOK_URL and keys are available
    load_dotenv(r"d:\ktr\mandi_agent\.env")
    
    print("\n🌿 MANDI-AGENT N8N WORKFLOW DEMO 🌿")
    print("This will fire all 7 major backend alerts to your local n8n instance.")
    print("Keep your n8n dashboard open to see the executions arrive!\n")
    
    # 1. Advisory Delivered (WhatsApp Loop)
    print_header("1. WhatsApp Advisory Loop (Advisory Delivered)")
    res1 = await trigger_advisory_delivered(
        farmer_id="F-10023",
        advisory_id="ADV-9921",
        language="kn",
        channel="whatsapp"
    )
    print(f"✅ Result: {res1}")
    await asyncio.sleep(2)

    # 2. Bundle Formed Notification
    print_header("2. Virtual Cooperative Bundle Formed")
    bundle = CooperativeBundle(
        bundle_id="BND-883",
        block_id="BLK-TUMAKURU",
        crop="Tomato",
        farmer_ids=["F-10023", "F-10024", "F-10025"],
        total_quantity_quintals=45.5,
        target_mandi="APMC Vashi, Navi Mumbai",
        target_mandi_lat=19.083,
        target_mandi_lng=73.001,
        delivery_window_start=date.today() + timedelta(days=1),
        delivery_window_end=date.today() + timedelta(days=2),
        forecast_price=2200.0,
        transport_saving_per_quintal=150.0,
        status="confirmed"
    )
    res2 = await trigger_bundle_formed(
        bundle=bundle,
        farmer_phones=["+919876543210", "+919876543211"],
        message_template=None
    )
    print(f"✅ Result: {res2}")
    await asyncio.sleep(2)

    # 3. Spoilage Emergency
    print_header("3. High Spoilage Emergency Alert")
    res3 = await trigger_spoilage_emergency(
        farmer_id="F-10023",
        crop="Tomato",
        spoilage_pct=85.0,
        recommended_action="Divert to local cold storage immediately to preserve 45 Quintals.",
        transit_hours=12.5,
        ambient_temp=38.4,
        nearest_cold_storage="Siddheshwar Cold Storage (3km away)"
    )
    print(f"✅ Result: {res3}")
    await asyncio.sleep(2)

    # 4. Price Crash Broadcast
    print_header("4. Price Crash Warning Broadcast")
    res4 = await trigger_price_crash_warning(
        block_id="BLK-TUMAKURU",
        crop="Onion",
        forecast_price=900.0,
        current_price=1350.0,
        drop_pct=33.3,
        affected_farmer_ids=["F-1001", "F-1002", "F-1003", "F-1004", "F-1005"],
        alternative_mandi="Pune APMC",
        alternative_price=1600.0
    )
    print(f"✅ Result: {res4}")
    await asyncio.sleep(2)

    # 5. FPO Weekly Digest
    print_header("5. FPO Weekly Digest")
    stats = {
        "week_start": (date.today() - timedelta(days=7)).isoformat(),
        "week_end": date.today().isoformat(),
        "advisories_sent": 342,
        "bundles_formed": 12,
        "total_quantity_quintals": 450.5,
        "total_transport_savings": 22500.0,
        "price_crashes_detected": 1,
        "spoilage_emergencies": 3,
        "active_farmers": 215
    }
    res5 = await trigger_fpo_digest(
        fpo_id="FPO-TUMAKURU-01",
        weekly_stats=stats,
        coordinator_email="admin@tumakuru-fpo.in"
    )
    print(f"✅ Result: {res5}")
    await asyncio.sleep(2)

    # 6. Scheme Eligibility Check
    print_header("6. Scheme Eligibility Check (PM-KISAN/PMFBY)")
    farmer = FarmerProfile(
        farmer_id="F-10099",
        name="Ramesh Gowda",
        phone="+919988776655",
        language="kn",
        location="Gubbi, Tumakuru",
        latitude=13.31,
        longitude=76.94,
        block_id="BLK-GUBBI",
        crops=["Ragi", "Maize"],
        landholding_acres=3.5,
    )
    res6 = await trigger_scheme_check(farmer=farmer)
    print(f"✅ Result: {res6}")
    await asyncio.sleep(2)

    # 7. Harvest Alert / Reminder
    print_header("7. Daily Harvest Alerts (Intent Submission)")
    res7 = await trigger_harvest_alert(
        farmer_id="F-10023",
        crop="Tomato",
        harvest_date=(date.today() + timedelta(days=2)).isoformat()
    )
    print(f"✅ Result: {res7}")

    print("\n✨ DEMO COMPLETED SUCCESSFULLY ✨")
    print("Check your n8n executions tab to view the routing logic and external API calls.")

if __name__ == "__main__":
    asyncio.run(run_demo())
