"""
Bundle / Cooperative routes.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["Bundles"])
logger = logging.getLogger(__name__)

# In-memory store (use Supabase in production)
BUNDLES: dict[str, dict] = {}
INVITATIONS: dict[str, dict] = {}


def _generate_id() -> str:
    """Generate a proper UUID string."""
    return str(uuid.uuid4())


def _format_bundle(bundle: dict) -> dict:
    """Ensure bundle response matches frontend CooperativeBundleSchema."""
    return {
        "bundle_id": bundle["bundle_id"],
        "block_id": bundle["block_id"],
        "crop": bundle["crop"],
        "total_quantity": bundle["total_quantity"],
        "farmers": bundle["farmers"],
        "target_mandi": bundle["target_mandi"],
        "negotiated_price": bundle.get("negotiated_price"),
        "status": bundle["status"],
        "created_at": bundle["created_at"],
        "closes_at": bundle.get("closes_at", (datetime.now(UTC) + timedelta(days=7)).isoformat()),
    }


@router.post("/api/bundle")
async def create_bundle(request: dict):
    """Create a new cooperative bundle."""
    try:
        bundle_id = _generate_id()
        now = datetime.now(UTC)
        block_id = request.get("block_id", _generate_id())
        if len(block_id) < 10:
            block_id = _generate_id()

        bundle = {
            "bundle_id": bundle_id,
            "block_id": block_id,
            "crop": request.get("crop", ""),
            "total_quantity": request.get("initial_quantity", 0),
            "farmers": [
                {
                    "farmer_id": request.get("farmer_id", _generate_id()),
                    "farmer_name": "Farmer",
                    "quantity": request.get("initial_quantity", 0),
                    "harvest_date": request.get("harvest_date", now.isoformat()),
                    "status": "confirmed",
                }
            ],
            "target_mandi": request.get("target_mandi", ""),
            "negotiated_price": None,
            "status": "forming",
            "created_at": now.isoformat(),
            "closes_at": (now + timedelta(days=7)).isoformat(),
        }
        BUNDLES[bundle_id] = bundle
        return _format_bundle(bundle)
    except Exception as e:
        logger.error("Create bundle failed: %s", str(e)[:200])
        raise HTTPException(status_code=500, detail=f"Failed to create bundle: {str(e)[:100]}")


@router.get("/api/bundle/{bundle_id}")
async def get_bundle(bundle_id: str):
    """Get bundle details."""
    bundle = BUNDLES.get(bundle_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    return _format_bundle(bundle)


@router.post("/api/bundle/{bundle_id}/join")
async def join_bundle(bundle_id: str, request: dict):
    """Join an existing cooperative bundle."""
    bundle = BUNDLES.get(bundle_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    if bundle["status"] in ("closed", "transported", "sold"):
        raise HTTPException(status_code=400, detail="This bundle is closed and cannot accept new farmers.")

    farmer_id = request.get("farmer_id", _generate_id())
    if len(farmer_id) < 10:
        farmer_id = _generate_id()

    farmer_entry = {
        "farmer_id": farmer_id,
        "farmer_name": "Farmer",
        "quantity": request.get("quantity", 0),
        "harvest_date": request.get("harvest_date", datetime.now(UTC).isoformat()),
        "status": "pending",
    }
    bundle["farmers"].append(farmer_entry)
    bundle["total_quantity"] += request.get("quantity", 0)

    total_qty = bundle["total_quantity"]
    share_pct = (request.get("quantity", 0) / total_qty * 100) if total_qty > 0 else 0

    return {
        "bundle": _format_bundle(bundle),
        "farmer_contribution": {
            "farmer_id": farmer_id,
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
            farmer_bundles.append(_format_bundle(bundle))
    return farmer_bundles


@router.get("/api/block/{block_id}/bundles")
async def get_block_bundles(block_id: str):
    """Get all bundles for a block."""
    block_bundles = []
    for bundle in BUNDLES.values():
        if bundle.get("block_id") == block_id:
            block_bundles.append(_format_bundle(bundle))
    return block_bundles


@router.get("/api/farmer/{farmer_id}/invitations")
async def get_farmer_invitations(farmer_id: str):
    """Get pending invitations for a farmer."""
    farmer_invites = []
    for invite in INVITATIONS.values():
        if invite["farmer_id"] == farmer_id and invite["status"] == "pending":
            farmer_invites.append(invite)
    return farmer_invites


@router.post("/api/invitation/{invitation_id}/respond")
async def respond_to_invitation(invitation_id: str, request: dict):
    """Accept or decline an invitation."""
    invite = INVITATIONS.get(invitation_id)
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invite["status"] != "pending":
        raise HTTPException(status_code=400, detail="Invitation is no longer pending")

    accept = request.get("accept", False)
    invite["status"] = "accepted" if accept else "declined"

    if accept:
        bundle_id = invite["bundle_id"]
        bundle = BUNDLES.get(bundle_id)
        if bundle:
            farmer_id = invite["farmer_id"]
            quantity = request.get("quantity", 5)
            farmer_entry = {
                "farmer_id": farmer_id,
                "farmer_name": "Farmer",
                "quantity": quantity,
                "harvest_date": request.get("harvest_date", datetime.now(UTC).isoformat()),
                "status": "confirmed",
            }
            bundle["farmers"].append(farmer_entry)
            bundle["total_quantity"] += quantity
            return {"bundle": _format_bundle(bundle), "message": "Joined bundle via invitation"}

    return {"message": "Invitation declined"}


@router.get("/api/bundle/{bundle_id}/settlement")
async def get_bundle_settlement(bundle_id: str):
    """Get settlement details for a completed bundle."""
    bundle = BUNDLES.get(bundle_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")

    total_qty = bundle["total_quantity"]
    sold_price = bundle.get("negotiated_price", bundle.get("target_mandi_price", 0))
    total_amount = sold_price * total_qty if sold_price else 0

    settlements = []
    for farmer in bundle.get("farmers", []):
        share_pct = (farmer["quantity"] / total_qty * 100) if total_qty > 0 else 0
        amount = (farmer["quantity"] / total_qty * total_amount) if total_qty > 0 else 0
        settlements.append(
            {
                "farmer_id": farmer["farmer_id"],
                "farmer_name": farmer.get("farmer_name", "Farmer"),
                "quantity": farmer["quantity"],
                "share_percentage": round(share_pct, 2),
                "amount": round(amount, 2),
                "status": "pending",
            }
        )

    return {
        "bundle_id": bundle_id,
        "total_amount": round(total_amount, 2),
        "settlements": settlements,
        "sold_price": sold_price,
        "sold_at": bundle.get("sold_at", datetime.now(UTC).isoformat()),
    }
