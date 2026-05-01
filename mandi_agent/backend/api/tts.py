"""
Text-to-Speech (TTS) and Translation routes.
"""

import logging
import os

from fastapi import APIRouter, HTTPException, Body, Response

router = APIRouter(tags=["Voice & Translation"])
logger = logging.getLogger(__name__)


@router.post("/api/translate")
async def translate_text_route(request: dict):
    """
    Translate text between languages using Reverie NMT REST API.
    Used by n8n workflows for localising messages before WhatsApp delivery.
    """
    from mandi_agent.backend.services.translation import reverie_translate

    text = request.get("text", "")
    source_language = request.get("source_language", "en")
    target_language = request.get("target_language", "hi")

    # Also support the batch format from agri_news_alerts daily digest
    items = request.get("items")

    if not text and not items:
        raise HTTPException(status_code=400, detail="text or items is required")

    try:
        if items:
            translated_items = []
            for item in items:
                headline = item.get("headline", "")
                translated = await reverie_translate(headline, source_language, target_language)
                translated_items.append({**item, "translated_headline": translated})
            return {
                "translated_items": translated_items,
                "translated_digest": "\n".join(
                    i.get("translated_headline", i.get("headline", "")) for i in translated_items
                ),
                "target_language": target_language,
            }

        translated = await reverie_translate(text, source_language, target_language)
        return {
            "translated_text": translated,
            "translated_message": translated,
            "source_language": source_language,
            "target_language": target_language,
        }

    except Exception as e:
        logger.error("Translation failed: %s", str(e)[:200])
        return {
            "translated_text": text,
            "translated_message": text,
            "source_language": source_language,
            "target_language": target_language,
            "error": str(e)[:100],
        }


@router.post("/api/tts/synthesize")
async def tts_synthesize(req: dict = Body(...)):
    """
    Reverie Text-to-Speech endpoint.
    Accepts text + language and returns synthesised audio.
    """
    from mandi_agent.backend.services.tts import reverie_tts, gtts_fallback, upload_audio_to_supabase

    text = req.get("text", "").strip()
    language = req.get("language", os.getenv("REVERIE_VOICE_LANG", "hi"))

    if not text:
        raise HTTPException(status_code=400, detail="'text' is required")

    # Voice config (optional)
    voice_config = req.get("voice_config", {})
    if isinstance(voice_config, str):
        import json as _json
        try:
            voice_config = _json.loads(voice_config)
        except Exception:
            voice_config = {}

    gender = voice_config.get("gender", os.getenv("REVERIE_VOICE_GENDER", "female"))
    speed = float(voice_config.get("speed", 1.0))
    pitch = float(voice_config.get("pitch", 1.0))

    try:
        try:
            result = await reverie_tts(text, language, gender=gender, speed=speed, pitch=pitch)
        except Exception as rev_err:
            logger.warning("Reverie TTS failed (%s), falling back to Google TTS: %s", language, str(rev_err)[:100])
            result = await gtts_fallback(text, language)

        # Upload to supabase to get actual URL
        result = await upload_audio_to_supabase(result)
        return result

    except Exception as e:
        logger.error("TTS synthesize failed: %s", str(e)[:300])
        raise HTTPException(status_code=502, detail=f"TTS synthesis failed: {str(e)[:200]}")


@router.get("/api/tts/twiml/{file_name}")
async def get_twiml_play(file_name: str):
    """
    Returns TwiML XML for Twilio to play a synthesized audio file.
    Usage: <url>/api/tts/twiml/uuid.wav
    """
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

    if not (supabase_url and supabase_key):
        raise HTTPException(status_code=500, detail="Missing Supabase config for TwiML")

    from supabase import create_client  # type: ignore
    supabase = create_client(supabase_url, supabase_key)
    public_url = supabase.storage.from_("audio-files").get_public_url(file_name)

    twiml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Play>{public_url}</Play></Response>'

    return Response(content=twiml, media_type="application/xml")
