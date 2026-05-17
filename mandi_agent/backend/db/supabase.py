"""
Supabase client helpers.
Centralises all Supabase connection logic so routes/services
don't need to repeat env-var lookups and client creation.
"""

import os


def _creds() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "") or os.getenv("SUPABASE_KEY", "")
    return url, key


def get_supabase_sync():
    """Return a synchronous Supabase client, or None if credentials are missing."""
    from supabase import create_client  # type: ignore

    url, key = _creds()
    if not url or not key:
        return None
    return create_client(url, key)


async def get_supabase_async():
    """Return an async Supabase client, or None if credentials are missing."""
    from supabase import create_async_client  # type: ignore

    url, key = _creds()
    if not url or not key:
        return None
    return await create_async_client(url, key)


def has_supabase() -> bool:
    """Return True if Supabase credentials are present in the environment."""
    url, key = _creds()
    return bool(url and key)
