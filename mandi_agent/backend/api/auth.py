"""
Authentication routes (OTP, Login, Refresh, Logout) using Supabase Auth.
"""

import logging

from fastapi import APIRouter, Header, HTTPException

from mandi_agent.backend.api.schemas import (
    AuthLoginResponse,
    FrontendFarmer,
    LoginRequest,
    OtpRequest,
    OtpResponse,
    RefreshResponse,
)
from mandi_agent.backend.utils.tokens import (
    AUTH_REFRESH_TOKENS,
    new_token,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/otp/request", response_model=OtpResponse)
async def request_otp(req: OtpRequest) -> OtpResponse:
    """Request OTP for phone login via Supabase Auth."""
    phone = req.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")

    from mandi_agent.backend.db.supabase import get_supabase_sync

    supabase = get_supabase_sync()
    if supabase:
        try:
            supabase.auth.sign_in_with_otp({"phone": f"+91{phone}"})
        except Exception as e:
            logger.warning("Supabase OTP request failed: %s", str(e)[:200])
            raise HTTPException(status_code=502, detail="Failed to send OTP. Please try again.")

    return OtpResponse(message="OTP sent successfully", expires_in=300)


@router.post("/login", response_model=AuthLoginResponse)
async def login(req: LoginRequest) -> AuthLoginResponse:
    """Login with phone + OTP via Supabase Auth."""
    phone = req.phone.strip()
    otp = req.otp.strip()

    from mandi_agent.backend.db.supabase import get_supabase_sync

    supabase = get_supabase_sync()
    if supabase:
        try:
            result = supabase.auth.verify_otp({"phone": f"+91{phone}", "token": otp, "type": "sms"})
            if not result.user:
                raise HTTPException(status_code=400, detail="Invalid OTP")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("Supabase OTP verification failed: %s", str(e)[:200])
            raise HTTPException(status_code=400, detail="Invalid OTP")

    # Look up farmer profile in Supabase DB
    if supabase:
        try:
            resp = supabase.table("farmer_profiles").select("*").eq("phone", phone).execute()
            if resp.data:
                farmer = resp.data[0]
                access_token = new_token("access")
                refresh_token = new_token("refresh")
                AUTH_REFRESH_TOKENS[refresh_token] = farmer["id"]
                return AuthLoginResponse(
                    access_token=access_token,
                    refresh_token=refresh_token,
                    farmer=FrontendFarmer(**farmer),
                )
        except Exception as e:
            logger.warning("Supabase farmer lookup failed: %s", str(e)[:200])

    raise HTTPException(status_code=404, detail="Farmer not found. Please register first.")


@router.get("/refresh", response_model=RefreshResponse)
async def refresh_token(authorization: str | None = Header(None)) -> RefreshResponse:
    """Refresh access token using refresh token in Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing refresh token")

    refresh_token_val = authorization.replace("Bearer ", "").strip()
    if refresh_token_val not in AUTH_REFRESH_TOKENS:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    return RefreshResponse(access_token=new_token("access"))


@router.post("/logout")
async def logout(authorization: str | None = Header(None)) -> dict[str, bool]:
    """Logout endpoint (best effort)."""
    if authorization and authorization.startswith("Bearer "):
        refresh_token_val = authorization.replace("Bearer ", "").strip()
        AUTH_REFRESH_TOKENS.pop(refresh_token_val, None)
    return {"ok": True}
