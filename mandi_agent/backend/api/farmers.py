"""
Farmer registration and profile management routes.
Supports both legacy in-memory auth and Supabase Auth.
"""

from datetime import datetime, timedelta, timezone
import logging
import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from mandi_agent.backend.api.schemas import (
    FarmerRegistrationRequest,
    FarmerRegistrationResponse,
    AdvisoryHistoryResponse,
    FrontendFarmer,
)
from mandi_agent.backend.api.core_schemas import FarmerProfile, FarmerAdvisory
from mandi_agent.backend.utils.tokens import AUTH_FARMERS_BY_PHONE, AUTH_REFRESH_TOKENS, new_token
from mandi_agent.backend.db.supabase import get_supabase_async
from mandi_agent.backend.auth.jwt_validator import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/farmer", tags=["Farmer"])


@router.post("/complete-profile")
async def complete_farmer_profile(
    req: dict[str, Any],
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Complete farmer profile after Supabase Auth signup (Google or Phone).
    Creates farmer record linked to the Supabase Auth user.
    """
    name = str(req.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    supabase_user_id = user.get("id", "demo-user")
    phone = str(req.get("phone", user.get("phone", ""))).strip()
    preferred_language = str(req.get("preferred_language", "hi"))

    farmer_profile = {
        "id": supabase_user_id,
        "phone": phone,
        "name": name,
        "state": str(req.get("state", "")),
        "district": str(req.get("district", "")),
        "block": str(req.get("block", "")),
        "village": req.get("village"),
        "primary_crops": list(req.get("primary_crops", [])),
        "land_size_hectares": req.get("land_size_hectares"),
        "preferred_language": preferred_language,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Try to persist to Supabase
    try:
        supabase = await get_supabase_async()
        if supabase:
            await supabase.table("farmers").upsert(farmer_profile, on_conflict="id").execute()
    except Exception as e:
        logger.warning("Supabase farmer upsert failed, using in-memory: %s", str(e)[:200])

    # Also store in-memory as fallback
    if phone:
        AUTH_FARMERS_BY_PHONE[phone] = farmer_profile
    AUTH_FARMERS_BY_PHONE[supabase_user_id] = farmer_profile

    return {"farmer": farmer_profile, "registered": True}


@router.post("/register")
async def register_farmer(req: dict[str, Any]) -> Any:
    """
    Register a new farmer on the platform (legacy OTP flow).
    """
    phone = str(req.get("phone", "")).strip()
    name = str(req.get("name", "")).strip()

    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    existing = AUTH_FARMERS_BY_PHONE.get(phone)
    if existing:
        farmer_profile = existing
    else:
        farmer_profile = {
            "id": str(uuid.uuid4()),
            "phone": phone,
            "name": name,
            "state": str(req.get("state", "")),
            "district": str(req.get("district", "")),
            "block": str(req.get("block", "")),
            "village": req.get("village"),
            "primary_crops": list(req.get("primary_crops", [])),
            "land_size_hectares": req.get("land_size_hectares"),
            "preferred_language": str(req.get("preferred_language", "hi")),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        AUTH_FARMERS_BY_PHONE[phone] = farmer_profile

    access_token = new_token("access")
    refresh_token = new_token("refresh")
    AUTH_REFRESH_TOKENS[refresh_token] = farmer_profile["id"]

    return {
        "farmer_id": farmer_profile["id"],
        "access_token": access_token,
        "refresh_token": refresh_token,
        "farmer": farmer_profile,
        "registered": True,
        "whatsapp_verified": False,
    }


@router.get("/by-phone/{phone}")
async def get_farmer_by_phone(
    phone: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Get farmer profile by phone number (Supabase Auth users)."""
    # Try Supabase first
    try:
        supabase = await get_supabase_async()
        if supabase:
            resp = await supabase.table("farmers").select("*").eq("phone", phone).execute()
            if resp.data:
                return resp.data[0]
    except Exception as e:
        logger.warning("Supabase lookup failed: %s", str(e)[:200])

    # Fallback to in-memory
    farmer = AUTH_FARMERS_BY_PHONE.get(phone)
    if farmer:
        return farmer

    raise HTTPException(status_code=404, detail="Farmer not found")


@router.get("/by-google/{google_id}")
async def get_farmer_by_google(
    google_id: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Get farmer profile by Google ID."""
    try:
        supabase = await get_supabase_async()
        if supabase:
            resp = await supabase.table("farmers").select("*").eq("id", google_id).execute()
            if resp.data:
                return resp.data[0]
    except Exception as e:
        logger.warning("Supabase lookup failed: %s", str(e)[:200])

    # Fallback: check if user from Supabase Auth has matching ID
    supabase_user_id = user.get("id", "")
    farmer = AUTH_FARMERS_BY_PHONE.get(supabase_user_id)
    if farmer:
        return farmer

    raise HTTPException(status_code=404, detail="Farmer profile not found. Please complete registration.")


@router.get("/{farmer_id}/history", response_model=AdvisoryHistoryResponse)
async def get_advisory_history(
    farmer_id: str,
    days: int = 30,
) -> AdvisoryHistoryResponse:
    """Get advisory history for a farmer."""
    try:
        supabase = await get_supabase_async()

        if not supabase:
            return AdvisoryHistoryResponse(farmer_id=farmer_id, advisories=[])

        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        response = await supabase.table("advisories").select("*").eq(
            "farmer_id", farmer_id
        ).gte("created_at", cutoff).order("created_at", ascending=False).execute()

        advisories = []
        for row in response.data or []:
            if row.get("created_at") and isinstance(row["created_at"], str):
                row["created_at"] = datetime.fromisoformat(
                    row["created_at"].replace("Z", "+00:00")
                )
            advisories.append(FarmerAdvisory(**row))

        return AdvisoryHistoryResponse(farmer_id=farmer_id, advisories=advisories)

    except Exception as e:
        logger.error("Failed to fetch advisory history: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch history: {str(e)[:100]}",
        )
