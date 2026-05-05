"""
Bundle / Cooperative routes.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, status

router = APIRouter(tags=["Bundles"])
logger = logging.getLogger(__name__)

# In-memory store (use Supabase in production)
BUNDLES: dict[str, dict] = {}


@router.post("/api/bundle")
async def create_bundle(request: dict):
    """Create a new cooperative bundle."""
    try:
        bundle_id = f"bundle-{len(BUNDLES) + 1:04d}"
        bundle = {
            "bundle_id": bundle_id,
            "block_id": request.get("block_id", ""),
            "crop": request.get("crop", ""),
            "total_quantity": request.get("initial_quantity", 0),
            "farmers": [
                {
                    "farmer_id": request.get("farmer_id", ""),
                    "farmer_name": "Farmer",
                    "quantity": request.get("initial_quantity", 0),
                    "harvest_date": request.get("harvest_date", ""),
                    "status": "confirmed",
                }
            ],
            "target_mandi": request.get("target_mandi", ""),
            "negotiated_price": None,
            "status": "forming",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "closes_at": "",
        }
        BUNDLES[bundle_id] = bundle
        return bundle
    except Exception as e:
        logger.error("Create bundle failed: %s", str(e)[:200])
        raise HTTPException(status_code=500, detail=f"Failed to create bundle: {str(e)[:100]}")


@router.get("/api/bundle/{bundle_id}")
async def get_bundle(bundle_id: str):
    """Get bundle details."""
    bundle = BUNDLES.get(bundle_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    return bundle


@router.post("/api/bundle/{bundle_id}/join")
async def join_bundle(bundle_id: str, request: dict):
    """Join an existing cooperative bundle."""
    bundle = BUNDLES.get(bundle_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if bundle["status"] in ("closed", "transported", "sold"):
        raise HTTPException(status_code=400, detail="This bundle is closed and cannot accept new farmers.")

    farmer_entry = {
        "farmer_id": request.get("farmer_id", ""),
        "farmer_name": "Farmer",
        "quantity": request.get("quantity", 0),
        "harvest_date": request.get("harvest_date", ""),
        "status": "pending",
    }
    bundle["farmers"].append(farmer_entry)
    bundle["total_quantity"] += request.get("quantity", 0)

    total_qty = bundle["total_quantity"]
    share_pct = (request.get("quantity", 0) / total_qty * 100) if total_qty > 0 else 0

    return {
        "bundle": bundle,
        "farmer_contribution": {
            "farmer_id": request.get("farmer_id", ""),
            "quantity": request.get("quantity", 0),
            "share_percentage": round(share_pct, 2),
        },
        "message": "Successfully joined the bundle",
    }


@router.delete("/api/bundle/{bundle_id}/leave")
async def leave_bundle(bundle_id: str, request: dict):
    """Leave a cooperative bundle."""
    bundle = BUNDLES.get(bundle_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    farmer_id = request.get("farmer_id", "")
    bundle["farmers"] = [f for f in bundle["farmers"] if f["farmer_id"] != farmer_id]
    return {"message": "Left the bundle successfully"}


@router.get("/api/farmer/{farmer_id}/bundles")
async def get_farmer_bundles(farmer_id: str):
    """Get all bundles a farmer is part of."""
    farmer_bundles = []
    for bundle in BUNDLES.values():
        if any(f["farmer_id"] == farmer_id for f in bundle.get("farmers", [])):
            farmer_bundles.append(bundle)
    return farmer_bundles
