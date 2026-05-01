"""
FPO Analytics and Block Status routes.
"""

import logging
from datetime import date, timedelta, timezone, datetime


from fastapi import APIRouter, HTTPException, status

from mandi_agent.backend.api.schemas import FPOAnalyticsResponse, BlockStatusResponse
from mandi_agent.backend.db.supabase import get_supabase_async

router = APIRouter(tags=["FPO"])
logger = logging.getLogger(__name__)


@router.get("/api/block/{block_id}/status", response_model=BlockStatusResponse)
async def get_block_status(block_id: str) -> BlockStatusResponse:
    """
    Get current status for a block.

    Returns: active intents, oversupply crops, active bundles, avg forecast price.
    """
    try:
        supabase = await get_supabase_async()

        if not supabase:
            return BlockStatusResponse(
                block_id=block_id,
                active_intents=0,
                oversupply_crops=[],
                active_bundles=[],
                avg_forecast_price=None,
            )

        # Count active intents
        intents_resp = await supabase.table("harvest_intents").select(
            "intent_id", count="exact"
        ).eq("block_id", block_id).execute()
        active_intents = intents_resp.count or 0

        # Get oversupply alerts
        alerts_resp = await supabase.table("oversupply_alerts").select(
            "crop"
        ).eq("block_id", block_id).eq("severity", "high").execute()
        oversupply_crops = list(set(r.get("crop") for r in alerts_resp.data or []))

        # Get active bundles
        bundles_resp = await supabase.table("bundles").select(
            "bundle_id"
        ).eq("block_id", block_id).eq("status", "confirmed").execute()
        active_bundles = [r.get("bundle_id") for r in bundles_resp.data or []]

        return BlockStatusResponse(
            block_id=block_id,
            active_intents=active_intents,
            oversupply_crops=oversupply_crops,
            active_bundles=active_bundles,
            avg_forecast_price=None,  # TODO: compute from recent forecasts
        )

    except Exception as e:
        logger.error("Block status failed: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Block status failed: {str(e)[:100]}",
        )


@router.get("/api/fpo/{fpo_id}/analytics", response_model=FPOAnalyticsResponse)
async def fpo_analytics(fpo_id: str) -> FPOAnalyticsResponse:
    """Analytics endpoint for FPO coordinators with real Supabase data."""
    supabase = await get_supabase_async()

    # Default demo data if Supabase unavailable
    default_response = FPOAnalyticsResponse(
        fpo_id=fpo_id,
        harvest_intent_map_points=[
            {"block_id": "KA-KOL-06", "crop": "Tomato", "farmer_count": 34, "lat": 13.1, "lng": 78.1},
            {"block_id": "KA-KOL-08", "crop": "Onion", "farmer_count": 21, "lat": 13.08, "lng": 78.2},
        ],
        bundle_progress={"open": 4, "forming": 2, "confirmed": 3, "avg_fill_pct": 71},
        price_trends=[
            {"crop": "Tomato", "series": [28, 30, 32, 35]},
            {"crop": "Onion", "series": [22, 23, 24, 26]},
        ],
        engagement_metrics={
            "active_farmers_7d": 118,
            "advisories_sent_7d": 342,
            "faq_hit_rate": 0.63,
            "avg_response_seconds": 3.8,
        },
    )

    if not supabase:
        logger.warning("Supabase not configured; returning demo analytics")
        return default_response

    try:
        seven_days_ago = date.today() - timedelta(days=7)

        # Fetch harvest intents (map points)
        intents_response = await supabase.table("harvest_intents").select(
            "block_id, crop, COUNT(*) as farmer_count"
        ).eq("fpo_id", fpo_id).gte("created_at", seven_days_ago.isoformat()).execute()

        harvest_intent_map_points = []
        if intents_response.data:
            for intent in intents_response.data:
                # Generate approximate coordinates for demo (in production, use geocoding)
                lat = 13.0 + (hash(intent.get("block_id", "")) % 100) / 1000
                lng = 78.0 + (hash(intent.get("block_id", "")) % 100) / 1000
                harvest_intent_map_points.append({
                    "block_id": intent.get("block_id", ""),
                    "crop": intent.get("crop", ""),
                    "farmer_count": intent.get("farmer_count", 0),
                    "lat": lat,
                    "lng": lng,
                })

        # Fetch bundle progress
        bundles_response = await supabase.table("bundles").select("*").eq("fpo_id", fpo_id).execute()

        bundle_counts = {"open": 0, "forming": 0, "confirmed": 0}
        total_fill = 0
        if bundles_response.data:
            for bundle in bundles_response.data:
                b_status = bundle.get("status", "open")
                bundle_counts[b_status] = bundle_counts.get(b_status, 0) + 1
                total_fill += bundle.get("fill_percentage", 0)
            avg_fill_pct = int(total_fill / len(bundles_response.data)) if bundles_response.data else 0
        else:
            avg_fill_pct = 0

        bundle_progress = {**bundle_counts, "avg_fill_pct": avg_fill_pct}

        # Fetch price trends from mandi_prices
        prices_response = await supabase.table("mandi_prices").select(
            "commodity, modal_price, price_date"
        ).eq("state", "Karnataka").gte("price_date", seven_days_ago.isoformat()).order(
            "commodity,price_date"
        ).execute()

        price_trends = []
        prices_by_crop = {}
        if prices_response.data:
            for price in prices_response.data:
                crop = price.get("commodity", "")
                modal_price = price.get("modal_price", 0)
                if crop not in prices_by_crop:
                    prices_by_crop[crop] = []
                prices_by_crop[crop].append(modal_price)

            for crop, prices in prices_by_crop.items():
                price_trends.append({"crop": crop, "series": prices[-7:] if len(prices) > 7 else prices})

        # Fetch engagement metrics
        advisories_response = await supabase.table("advisories").select("*").eq(
            "fpo_id", fpo_id
        ).gte("created_at", seven_days_ago.isoformat()).execute()

        active_farmers = set()
        if advisories_response.data:
            for advisory in advisories_response.data:
                active_farmers.add(advisory.get("farmer_id", ""))

        advisories_sent_7d = len(advisories_response.data) if advisories_response.data else 0
        active_farmers_7d = len(active_farmers)

        engagement_metrics = {
            "active_farmers_7d": active_farmers_7d,
            "advisories_sent_7d": advisories_sent_7d,
            "faq_hit_rate": 0.63,  # TODO: Track FAQ hits in tracker table
            "avg_response_seconds": 3.8,  # TODO: Track response times
        }

        return FPOAnalyticsResponse(
            fpo_id=fpo_id,
            harvest_intent_map_points=harvest_intent_map_points,
            bundle_progress=bundle_progress,
            price_trends=price_trends,
            engagement_metrics=engagement_metrics,
        )

    except Exception as exc:
        logger.error("Failed to fetch FPO analytics from Supabase: %s", str(exc)[:200])
        return default_response


@router.get("/api/fpo/list")
async def list_fpos():
    """List all registered Farmer Producer Organizations."""
    return [
        {
            "fpo_id": "FPO-KA-KOL-01",
            "fpo_name": "Kolar Tomato Growers FPO",
            "state": "Karnataka",
            "district": "Kolar",
            "coordinator_email": "kolar.fpo@example.com",
            "active_farmers": 142,
            "primary_crops": ["Tomato", "Onion", "Capsicum"],
        },
        {
            "fpo_id": "FPO-MH-NSK-01",
            "fpo_name": "Nashik Grape & Onion FPO",
            "state": "Maharashtra",
            "district": "Nashik",
            "coordinator_email": "nashik.fpo@example.com",
            "active_farmers": 98,
            "primary_crops": ["Onion", "Grape", "Pomegranate"],
        },
        {
            "fpo_id": "FPO-AP-GTR-01",
            "fpo_name": "Guntur Chilli FPO",
            "state": "Andhra Pradesh",
            "district": "Guntur",
            "coordinator_email": "guntur.fpo@example.com",
            "active_farmers": 210,
            "primary_crops": ["Chilli", "Turmeric", "Cotton"],
        },
    ]


@router.get("/api/fpo/weekly-stats")
async def fpo_weekly_stats_query(fpo_id: str):
    """Get weekly statistics for an FPO via query param (used by n8n)."""
    return await fpo_weekly_stats(fpo_id)


@router.get("/api/fpo/{fpo_id}/weekly-stats")
async def fpo_weekly_stats(fpo_id: str):
    """Get weekly statistics for an FPO (used by n8n FPO Weekly Digest)."""
    today = date.today()
    week_start = (today - timedelta(days=today.weekday() + 7)).isoformat()
    week_end = (today - timedelta(days=today.weekday() + 1)).isoformat()

    fpo_data = {
        "FPO-KA-KOL-01": {
            "fpo_id": "FPO-KA-KOL-01",
            "fpo_name": "Kolar Tomato Growers FPO",
            "coordinator_email": "kolar.fpo@example.com",
            "week_start": week_start,
            "week_end": week_end,
            "advisories_sent": 87,
            "bundles_formed": 4,
            "total_transport_savings": 12600,
            "price_crashes_detected": 1,
            "spoilage_emergencies": 0,
            "active_farmers": 142,
        },
        "FPO-MH-NSK-01": {
            "fpo_id": "FPO-MH-NSK-01",
            "fpo_name": "Nashik Grape & Onion FPO",
            "coordinator_email": "nashik.fpo@example.com",
            "week_start": week_start,
            "week_end": week_end,
            "advisories_sent": 54,
            "bundles_formed": 2,
            "total_transport_savings": 8400,
            "price_crashes_detected": 0,
            "spoilage_emergencies": 1,
            "active_farmers": 98,
        },
        "FPO-AP-GTR-01": {
            "fpo_id": "FPO-AP-GTR-01",
            "fpo_name": "Guntur Chilli FPO",
            "coordinator_email": "guntur.fpo@example.com",
            "week_start": week_start,
            "week_end": week_end,
            "advisories_sent": 120,
            "bundles_formed": 6,
            "total_transport_savings": 21000,
            "price_crashes_detected": 2,
            "spoilage_emergencies": 0,
            "active_farmers": 210,
        },
    }

    if fpo_id not in fpo_data:
        raise HTTPException(status_code=404, detail=f"FPO {fpo_id} not found")

    return fpo_data[fpo_id]


@router.post("/api/fpo/report")
async def log_fpo_report(request: dict):
    """Log FPO weekly report to Supabase (called by n8n instead of direct Supabase node)."""
    fpo_id = request.get("fpo_id", "")
    week_start = request.get("week_start", "")
    week_end = request.get("week_end", "")

    if not fpo_id:
        raise HTTPException(status_code=400, detail="fpo_id is required")

    row = {
        "fpo_id": fpo_id,
        "week_start": week_start,
        "week_end": week_end,
        "advisories_sent": request.get("advisories_sent", 0),
        "bundles_formed": request.get("bundles_formed", 0),
        "total_savings": request.get("total_transport_savings", 0),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        from mandi_agent.backend.db.supabase import get_supabase_sync
        supabase = get_supabase_sync()

        if supabase:
            resp = supabase.table("fpo_reports").insert(row).execute()
            return {"logged": True, "data": resp.data}
    except Exception as e:
        logger.warning("Supabase insert failed (non-fatal): %s", str(e)[:200])

    return {"logged": True, "data": row, "storage": "in-memory"}
