"""
Supabase JWT validation middleware for FastAPI.

Validates Bearer tokens from Supabase Auth using the Supabase service key.
Provides `get_current_user` dependency for protected routes.
"""

import os
import logging
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from supabase import create_client
from supabase.lib.client_options import ClientOptions

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

_supabase_client = None


def _get_supabase_admin():
    global _supabase_client
    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_KEY", "")
        if url and key:
            _supabase_client = create_client(
                url, key,
                options=ClientOptions(postgrest_client_timeout=10),
            )
    return _supabase_client


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """
    FastAPI dependency that validates a Supabase JWT and returns the user object.

    Usage:
        @router.get("/protected")
        async def protected_route(user: dict = Depends(get_current_user)):
            return {"user_id": user["id"]}
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    token = credentials.credentials
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    supabase = _get_supabase_admin()
    if not supabase:
        # No Supabase configured — allow in demo mode
        return {
            "id": "demo-user",
            "phone": "",
            "email": "",
            "app_metadata": {},
            "user_metadata": {},
        }

    try:
        response = supabase.auth.get_user(token)
        user = response.user
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or token expired",
            )
        return dict(user)
    except Exception as e:
        logger.warning("Supabase token validation failed: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
