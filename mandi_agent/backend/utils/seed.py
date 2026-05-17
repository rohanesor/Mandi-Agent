"""
Seed reference data into Supabase on startup (if tables are empty).
Skip demo farmers — real farmers come via signup.
"""

import logging

from mandi_agent.backend.db.supabase import get_supabase_sync

logger = logging.getLogger(__name__)

REFERENCE_MANDIS = [
    {"mandi_id": "MH-VASHI-01", "mandi_name": "Vashi Navi Mumbai", "district": "Thane", "state": "Maharashtra"},
    {"mandi_id": "MH-PUNE-01", "mandi_name": "Pune", "district": "Pune", "state": "Maharashtra"},
    {"mandi_id": "KA-KOLAR-01", "mandi_name": "Kolar", "district": "Kolar", "state": "Karnataka"},
    {"mandi_id": "KA-BANG-01", "mandi_name": "Bangalore", "district": "Bangalore Urban", "state": "Karnataka"},
    {"mandi_id": "RJ-JAIPUR-01", "mandi_name": "Jaipur", "district": "Jaipur", "state": "Rajasthan"},
    {"mandi_id": "MP-INDORE-01", "mandi_name": "Indore", "district": "Indore", "state": "Madhya Pradesh"},
    {"mandi_id": "AP-GUNTUR-01", "mandi_name": "Guntur", "district": "Guntur", "state": "Andhra Pradesh"},
    {"mandi_id": "TN-MADURAI-01", "mandi_name": "Madurai", "district": "Madurai", "state": "Tamil Nadu"},
]


async def seed_reference_data():
    """
    Seed reference mandi locations into Supabase if the table is empty.
    Does NOT seed demo farmers — real farmer profiles come through signup.
    """
    try:
        supabase = get_supabase_sync()
        if not supabase:
            logger.info("Supabase not configured — skipping reference seed")
            return

        # Only seed if mandis table is empty
        existing = supabase.table("mandis").select("mandi_id").limit(1).execute()
        if existing.data:
            logger.info("Reference data already seeded — skipping")
            return

        for mandi in REFERENCE_MANDIS:
            supabase.table("mandis").upsert(mandi, on_conflict="mandi_id").execute()

        logger.info("Seeded %d reference mandi locations", len(REFERENCE_MANDIS))
    except Exception as e:
        logger.debug("Reference seed skipped (non-fatal): %s", str(e)[:100])
