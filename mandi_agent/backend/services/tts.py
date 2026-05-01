"""
Text-to-Speech service.

Wraps:
  1. Reverie TTS REST API (primary)
  2. Google gTTS (fallback)
  3. Supabase Storage upload

Extracted from main.py so the /api/tts/* routes stay thin.
"""

import base64
import io
import logging
import os
from typing import Optional

import httpx  # type: ignore

logger = logging.getLogger(__name__)

# Speaker preference map — ordered by availability
_TTS_SPEAKER_MAP: dict[str, list[str]] = {
    "hi": ["hi_female", "hi_female_1", "hi_f"],
    "kn": ["kn_female", "kn_female_1", "kn_f"],
    "te": ["te_female", "te_female_1", "te_f"],
    "ta": ["ta_female", "ta_female_1", "ta_f"],
    "mr": ["mr_female", "mr_female_1", "mr_f"],
    "en": ["en_female", "en_female_1", "en_f"],
    "bn": ["bn_female", "bn_female_1", "bn_f"],
    "gu": ["gu_female", "gu_female_1", "gu_f"],
    "pa": ["pa_female", "pa_female_1", "pa_f"],
    "ml": ["ml_female", "ml_female_1", "ml_f"],
    "or": ["or_female", "or_female_1", "or_f"],
}


async def reverie_tts(
    text: str,
    language: str,
    gender: str = "female",
    speed: float = 1.0,
    pitch: float = 1.0,
) -> dict:
    """
    Synthesise speech via the Reverie TTS REST API.

    Returns a dict with keys:
      audio_base64, audio_content_type, audio_url, speaker, language
    """
    app_id = os.getenv("REVERIE_APP_ID", "").strip()
    api_key = os.getenv("REVERIE_API_KEY", "").strip()

    if not app_id or not api_key:
        raise ValueError("REVERIE_APP_ID / REVERIE_API_KEY not set")

    speakers = _TTS_SPEAKER_MAP.get(language, [f"{language}_{gender}"])
    headers = {
        "Content-Type": "application/json",
        "REV-API-KEY": api_key,
        "REV-APP-ID": app_id,
        "REV-APPNAME": "tts",
    }

    last_error = ""
    async with httpx.AsyncClient(timeout=30.0) as client:
        for speaker in speakers:
            try:
                resp = await client.post(
                    "https://revapi.reverieinc.com/",
                    headers={**headers, "speaker": speaker},
                    json={"text": text, "speed": speed, "pitch": pitch},
                )
                if resp.status_code == 200:
                    ct = resp.headers.get("Content-Type", "audio/wav")
                    audio_b64 = base64.b64encode(resp.content).decode("utf-8")
                    logger.info(
                        "TTS success — speaker=%s lang=%s bytes=%d",
                        speaker,
                        language,
                        len(resp.content),
                    )
                    return {
                        "audio_base64": audio_b64,
                        "audio_content_type": ct,
                        "audio_url": f"data:{ct};base64,{audio_b64}",
                        "speaker": speaker,
                        "language": language,
                    }
                last_error = f"{speaker}: HTTP {resp.status_code} — {resp.text[:200]}"
            except Exception as exc:
                last_error = f"{speaker}: {str(exc)[:150]}"

    raise RuntimeError(
        f"Reverie TTS failed for all speakers ({language}): {last_error}"
    )


async def gtts_fallback(text: str, language: str) -> dict:
    """Google gTTS fallback when Reverie is unavailable."""
    from gtts import gTTS  # type: ignore

    tts = gTTS(text=text, lang=language, slow=False)
    fp = io.BytesIO()
    tts.write_to_fp(fp)
    fp.seek(0)
    audio_b64 = base64.b64encode(fp.read()).decode("utf-8")
    return {
        "audio_base64": audio_b64,
        "audio_content_type": "audio/mpeg",
        "speaker": f"google_gTTS_{language}",
        "language": language,
    }


async def upload_audio_to_supabase(result: dict) -> dict:
    """
    Upload audio bytes from *result* to Supabase Storage bucket 'audio-files'.

    Mutates *result* in-place to set 'audio_url' and 'twiml_url' to the public URL.
    Returns the updated *result*.
    """
    import uuid as _uuid
    from supabase import create_client  # type: ignore

    audio_b64 = result.get("audio_base64")
    if not audio_b64:
        return result

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    if not (supabase_url and supabase_key):
        # Ensure data URI fallback
        if "audio_url" not in result:
            ct = result.get("audio_content_type", "audio/wav")
            result["audio_url"] = f"data:{ct};base64,{audio_b64}"
        return result

    audio_bytes = base64.b64decode(audio_b64)
    c_type = result.get("audio_content_type", "audio/wav")
    ext = "mp3" if "mpeg" in c_type else "wav"
    file_name = f"{_uuid.uuid4()}.{ext}"

    try:
        supabase = create_client(supabase_url, supabase_key)
        supabase.storage.from_("audio-files").upload(
            file_name, audio_bytes, {"content-type": c_type}
        )
        public_url = supabase.storage.from_("audio-files").get_public_url(file_name)
        result["audio_url"] = public_url
        result["twiml_url"] = (
            f"http://host.docker.internal:8000/api/tts/twiml/{file_name}"
        )
        logger.info("Supabase storage TTS upload successful: %s", public_url)
    except Exception as exc:
        logger.error("Supabase Storage upload failed: %s", str(exc)[:300])
        if "audio_url" not in result:
            ct = result.get("audio_content_type", "audio/wav")
            result["audio_url"] = f"data:{ct};base64,{audio_b64}"

    return result
