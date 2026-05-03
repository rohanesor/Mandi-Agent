"""
Farmer registration and profile management routes.
"""

from datetime import datetime, timedelta, timezone
import logging
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/farmer", tags=["Farmer"])


@router.post("/register", response_model=Any)
async def register_farmer(req: dict[str, Any]) -> Any:
    """
    Register a new farmer on the platform.

    Stores farmer profile in Supabase.
    Sends WhatsApp verification code.
    """
    # Frontend contract: flat payload for mobile onboarding
    if "farmer" not in req:
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

    # Legacy contract: nested `farmer` payload
    farmer = FarmerProfile(**req["farmer"])

    try:
        supabase = await get_supabase_async()

        if supabase:
            data = farmer.model_dump(mode="json")
            response = await supabase.table("farmers").insert(data).execute()
            if response.data:
                farmer_id = response.data[0].get("farmer_id", farmer.farmer_id)
            else:
                farmer_id = farmer.farmer_id
        else:
            farmer_id = farmer.farmer_id

        # TODO: Send WhatsApp OTP via Twilio
        # await send_whatsapp_otp(farmer.phone)

        return FarmerRegistrationResponse(
            farmer_id=farmer_id,
            registered=True,
            whatsapp_verified=False,  # Verified after OTP
        )

    except Exception as e:
        logger.error("Farmer registration failed: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)[:100]}",
        )


@router.get("/{farmer_id}/history", response_model=AdvisoryHistoryResponse)
async def get_advisory_history(
    farmer_id: str,
    days: int = 30,
) -> AdvisoryHistoryResponse:
    """
    Get advisory history for a farmer.

    Returns advisories from the last `days` days (default 30).
    """
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
