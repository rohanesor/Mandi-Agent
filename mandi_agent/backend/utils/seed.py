"""
Seed demo farmers into in-memory store and Supabase on startup.
"""

import logging
import uuid
from datetime import datetime, timezone

from mandi_agent.backend.utils.tokens import AUTH_FARMERS_BY_PHONE

logger = logging.getLogger(__name__)

DEMO_FARMERS = [
    {
        "id": "demo-farmer-001",
        "phone": "9876543210",
        "name": "Raju Naik",
        "state": "Karnataka",
        "district": "Kolar",
        "block": "KOL-06",
        "village": "Mulbagal",
        "primary_crops": ["Tomato", "Onion"],
        "land_size_hectares": 2.5,
        "preferred_language": "kn",
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": "demo-farmer-002",
        "phone": "9876543211",
        "name": "Sridhar K",
        "state": "Karnataka",
        "district": "Kolar",
        "block": "KOL-06",
        "village": "Mulbagal",
        "primary_crops": ["Tomato"],
        "land_size_hectares": 1.8,
        "preferred_language": "kn",
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": "demo-farmer-003",
        "phone": "9876543212",
        "name": "Anita Devi",
        "state": "Maharashtra",
        "district": "Nashik",
        "block": "NSK-04",
        "village": "Dindori",
        "primary_crops": ["Grape", "Onion"],
        "land_size_hectares": 3.2,
        "preferred_language": "mr",
        "created_at": datetime.now(timezone.utc).isoformat(),
    },
]


async def seed_demo_farmers():
    """Seed demo farmers into the in-memory store and attempt Supabase insert."""
    for farmer in DEMO_FARMERS:
        phone = farmer["phone"]
        if phone not in AUTH_FARMERS_BY_PHONE:
            AUTH_FARMERS_BY_PHONE[phone] = farmer
            logger.info("Seeded demo farmer: %s (%s)", farmer["name"], phone)

    # Try Supabase insert
    try:
        from mandi_agent.backend.db.supabase import get_supabase_sync
        supabase = get_supabase_sync()
        if supabase:
            for farmer in DEMO_FARMERS:
                supabase.table("farmers").upsert(farmer, on_conflict="id").execute()
            logger.info("Demo farmers upserted to Supabase")
    except Exception as e:
        logger.debug("Supabase seed skipped (non-fatal): %s", str(e)[:100])
