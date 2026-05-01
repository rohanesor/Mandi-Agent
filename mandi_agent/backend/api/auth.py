"""
Authentication routes (OTP, Login, Refresh, Logout).
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Header

from mandi_agent.backend.api.schemas import (
    OtpRequest,
    OtpResponse,
    LoginRequest,
    AuthLoginResponse,
    RefreshResponse,
    FrontendFarmer,
)
from mandi_agent.backend.utils.tokens import (
    OTP_STORE,
    AUTH_FARMERS_BY_PHONE,
    AUTH_REFRESH_TOKENS,
    new_token,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/otp/request", response_model=OtpResponse)
async def request_otp(req: OtpRequest) -> OtpResponse:
    """Dev OTP endpoint for mobile onboarding."""
    phone = req.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")

    # Dev-friendly fixed OTP
    OTP_STORE[phone] = "123456"
    return OtpResponse(message="OTP sent successfully", expires_in=300)


@router.post("/login", response_model=AuthLoginResponse)
async def login(req: LoginRequest) -> AuthLoginResponse:
    """Dev login endpoint used by mobile app."""
    phone = req.phone.strip()
    otp = req.otp.strip()

    expected = OTP_STORE.get(phone)
    if not expected or otp != expected:
        raise HTTPException(
            status_code=400,
            detail="Invalid OTP",
        )

    farmer = AUTH_FARMERS_BY_PHONE.get(phone)
    if not farmer:
        raise HTTPException(
            status_code=404,
            detail="Farmer not found",
        )

    access_token = new_token("access")
    refresh_token = new_token("refresh")
    AUTH_REFRESH_TOKENS[refresh_token] = farmer["id"]

    return AuthLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        farmer=FrontendFarmer(**farmer),
    )


@router.get("/refresh", response_model=RefreshResponse)
async def refresh_token(authorization: Optional[str] = Header(None)) -> RefreshResponse:
    """Refresh access token using refresh token in Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing refresh token")

    refresh_token_val = authorization.replace("Bearer ", "").strip()
    if refresh_token_val not in AUTH_REFRESH_TOKENS:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    return RefreshResponse(access_token=new_token("access"))


@router.post("/logout")
async def logout(authorization: Optional[str] = Header(None)) -> dict[str, bool]:
    """Logout endpoint (best effort for frontend compatibility)."""
    if authorization and authorization.startswith("Bearer "):
        refresh_token_val = authorization.replace("Bearer ", "").strip()
        AUTH_REFRESH_TOKENS.pop(refresh_token_val, None)
    return {"ok": True}
