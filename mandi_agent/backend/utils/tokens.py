"""
Auth token helpers and in-memory stores (dev / demo).

These replace the module-level globals that previously lived in main.py.
In production, replace in-memory dicts with Supabase / Redis.
"""

import uuid
from typing import Any

# ---------------------------------------------------------------------------
# In-memory dev stores
# ---------------------------------------------------------------------------

OTP_STORE: dict[str, str] = {}
AUTH_FARMERS_BY_PHONE: dict[str, dict[str, Any]] = {}
AUTH_REFRESH_TOKENS: dict[str, str] = {}
HARVEST_INTENT_VERSIONS: dict[str, int] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def new_token(prefix: str) -> str:
    """Generate a random token with a readable prefix, e.g. 'access_<uuid>'."""
    return f"{prefix}_{uuid.uuid4().hex}"
