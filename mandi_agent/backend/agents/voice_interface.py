"""
Voice interface agent — handles speech input/output via Reverie API.
Supports 22 Indian languages for voice advisories.

Delegates to backend.voice.reverie_voice.ReverieVoiceService for all
ASR, NMT (translation), and TTS operations.
"""

import logging
from typing import Optional

from mandi_agent.backend.api.core_schemas import VoiceSession

logger = logging.getLogger(__name__)


LANGUAGE_CODES = {
    "hindi": "hi",
    "bengali": "bn",
    "tamil": "ta",
    "telugu": "te",
    "kannada": "kn",
    "malayalam": "ml",
    "marathi": "mr",
    "gujarati": "gu",
    "punjabi": "pa",
    "assamese": "as",
    "odia": "or",
    "urdu": "ur",
}

# Reverse mapping
ISO_TO_NAME = {v: k for k, v in LANGUAGE_CODES.items()}


async def _get_service():
    """Get the singleton Reverie voice service."""
    from mandi_agent.backend.services.voice.reverie_voice import get_voice_service
    return await get_voice_service()


async def speech_to_text(
    audio_base64: str,
    language: str,
) -> tuple[str, str]:
    """
    Convert speech audio to text using Reverie ASR.

    Args:
        audio_base64: Base64-encoded audio (WAV/MP3, max 30 seconds)
        language: ISO 639 language code (e.g., "hi", "ta", "kn")

    Returns:
        Tuple of (transcribed_text, detected_language)
    """
    service = await _get_service()

    transcribed = await service.speech_to_text(audio_base64, language)

    if transcribed is None:
        logger.warning("ASR returned no text for language=%s", language)
        return "", language

    # Detect the actual language from the transcript
    from mandi_agent.backend.services.voice.utils import detect_language_by_script
    detected = detect_language_by_script(transcribed)

    logger.info(
        "STT: %d chars, input_lang=%s, detected=%s",
        len(transcribed), language, detected,
    )

    return transcribed, detected


async def text_to_speech(
    text: str,
    language: str,
) -> str:
    """
    Convert text to speech using Reverie TTS.

    Args:
        text: Text to convert
        language: ISO 639 language code

    Returns:
        Base64-encoded audio string, or empty string on failure
    """
    service = await _get_service()

    audio_b64 = await service.text_to_speech(text, language)

    if audio_b64 is None:
        logger.warning("TTS returned no audio for language=%s", language)
        return ""

    logger.info("TTS: %d chars → audio (%d bytes b64)", len(text), len(audio_b64))
    return audio_b64


async def translate_text(
    text: str,
    source_lang: str,
    target_lang: str,
) -> str:
    """
    Translate text between languages using Reverie NMT.

    Args:
        text: Text to translate
        source_lang: Source ISO 639 code
        target_lang: Target ISO 639 code

    Returns:
        Translated text, or original text on failure
    """
    if source_lang == target_lang:
        return text

    service = await _get_service()

    translated = await service.translate(text, source_lang, target_lang)

    if translated is None:
        logger.warning(
            "Translation failed %s→%s, returning original",
            source_lang, target_lang,
        )
        return text

    logger.info(
        "Translated %s→%s: %d→%d chars",
        source_lang, target_lang, len(text), len(translated),
    )
    return translated


async def create_voice_session(
    farmer_id: str,
    input_audio_base64: Optional[str] = None,
    input_text: str = "",
    farmer_language: str = "hi",
    advisory_english: str = "",
) -> VoiceSession:
    """
    Create and process a complete voice session.

    Pipeline:
    1. Speech-to-text (if audio provided)
    2. Translate to English
    3. Intent recognition (basic keyword matching)
    4. Generate response (advisory_english passed from calling agent)
    5. Translate response to local language
    6. Text-to-speech

    Args:
        farmer_id: Farmer identifier
        input_audio_base64: Optional base64-encoded audio input
        input_text: Text input if no audio
        farmer_language: ISO 639 code for farmer's language
        advisory_english: Pre-generated advisory in English

    Returns:
        Complete VoiceSession with all fields populated
    """
    service = await _get_service()

    if input_audio_base64:
        # Full pipeline with audio
        session = await service.full_pipeline(
            audio_base64=input_audio_base64,
            farmer_language=farmer_language,
            advisory_english=advisory_english,
            farmer_id=farmer_id,
        )

        if session:
            return session

    # Text-only fallback
    import time
    import uuid
    from datetime import datetime, timezone

    start_time = time.monotonic()
    session_id = str(uuid.uuid4())[:16]

    # Translate input to English if needed
    input_text_english = ""
    if input_text and farmer_language != "en":
        input_text_english = await translate_text(
            input_text, farmer_language, "en"
        )
    elif input_text:
        input_text_english = input_text

    # Translate advisory to local language
    response_text_local = advisory_english
    if advisory_english and farmer_language != "en":
        response_text_local = await translate_text(
            advisory_english, "en", farmer_language
        )

    # Generate TTS for local language response
    response_audio_url = None
    if response_text_local:
        audio_b64 = await text_to_speech(response_text_local, farmer_language)
        if audio_b64:
            response_audio_url = f"data:audio/wav;base64,{audio_b64}"

    total_ms = int((time.monotonic() - start_time) * 1000)

    # Detect language from input text
    detected_language = farmer_language
    if input_text:
        from mandi_agent.backend.services.voice.utils import detect_language_by_script
        detected_language = detect_language_by_script(input_text)

    session = VoiceSession(
        session_id=session_id,
        farmer_id=farmer_id,
        input_audio_url=None,
        input_text_local=input_text,
        input_text_english=input_text_english,
        detected_language=detected_language,
        intent="",  # Set by orchestrator
        response_text_english=advisory_english,
        response_text_local=response_text_local,
        response_audio_url=response_audio_url,
        processing_ms=total_ms,
        created_at=datetime.now(timezone.utc),
    )

    logger.info(
        "Voice session %s (text-only): %s processed in %dms",
        session_id, farmer_language, total_ms,
    )

    return session
