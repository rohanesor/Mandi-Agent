"""
Translation service using Reverie NMT REST API.
Used by the /api/translate route and advisory generation.
"""

import logging
import os

import httpx  # type: ignore

logger = logging.getLogger(__name__)


async def reverie_translate(text: str, src_lang: str, tgt_lang: str) -> str:
    """
    Translate *text* from *src_lang* to *tgt_lang* via the Reverie NMT REST API.

    Returns the original *text* unchanged if:
    - text is empty / whitespace
    - source == target language
    - Reverie credentials are missing

    Raises httpx / ValueError on failure so callers can decide to swallow or re-raise.
    """
    if not text or not text.strip():
        return text
    if src_lang == tgt_lang:
        return text

    app_id = os.getenv("REVERIE_APP_ID", "").strip()
    api_key = os.getenv("REVERIE_API_KEY", "").strip()

    if not app_id or not api_key:
        raise ValueError("REVERIE_APP_ID / REVERIE_API_KEY not set in .env")

    headers = {
        "Content-Type": "application/json",
        "REV-API-KEY": api_key,
        "REV-APP-ID": app_id,
        "REV-APPNAME": "localization",
        "REV-APPVERSION": "2.0",
        "src_lang": src_lang,
        "tgt_lang": tgt_lang,
        "domain": "1",
    }
    payload = {
        "data": [text],
        "enableNmt": True,
        "enableTransliteration": True,
        "enableLookup": False,
        "nmtMask": False,
        "debugMode": False,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://revapi.reverieinc.com/",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    response_list = data.get("responseList", [])
    if response_list:
        out = response_list[0].get("outString")
        if isinstance(out, list) and out:
            return out[0]
        if isinstance(out, str) and out:
            return out
    return text
