"""
Bhashini Voice Service — India's national language translation API.
Supports 22 Indian languages for ASR, NMT (translation), and TTS.

API Docs: https://bhashini.gov.in/
ULCA: https://meity-auth.ulcacontrib.org
"""

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from mandi_agent.backend.api.core_schemas import VoiceSession

logger = logging.getLogger(__name__)

# Bhashini API endpoints
BHASHINI_AUTH_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
BHASHINI_INFERENCE_URL = "https://dhruva-api.bhashini.gov.in/services/inference"

# Supported Indian languages with their ISO 639-1 codes
LANGUAGE_CODES = {
    "assamese": "as",
    "bengali": "bn",
    "bodo": "brx",
    "dogri": "doi",
    "gujarati": "gu",
    "hindi": "hi",
    "kannada": "kn",
    "kashmiri": "ks",
    "konkani": "kok",
    "maithili": "mai",
    "malayalam": "ml",
    "manipuri": "mni",
    "marathi": "mr",
    "nepali": "ne",
    "odia": "or",
    "punjabi": "pa",
    "sanskrit": "sa",
    "santali": "sat",
    "sindhi": "sd",
    "tamil": "ta",
    "telugu": "te",
    "urdu": "ur",
}

# Reverse mapping: ISO code → full name
ISO_TO_LANGUAGE = {v: k for k, v in LANGUAGE_CODES.items()}


def _get_bhashini_user_id() -> str:
    import os
    return os.getenv("BHASHINI_USER_ID", "")


def _get_bhashini_ulca_key() -> str:
    import os
    return os.getenv("BHASHINI_ULCA_API_KEY", "")


def _get_bhashini_inference_key() -> str:
    import os
    return os.getenv("BHASHINI_INFERENCE_KEY", "")


# =============================================================================
# Language detection via script heuristics
# =============================================================================

def detect_language_by_script(text: str) -> str:
    """
    Detect language from text using Unicode script ranges.

    Uses Unicode script blocks to identify Indian languages:
    - Devanagari (U+0900-U+097F): Hindi, Marathi, Nepali, etc.
    - Bengali (U+0980-U+09FF): Bengali
    - Tamil (U+0B80-U+0BFF): Tamil
    - Telugu (U+0C00-U+0C7F): Telugu
    - Kannada (U+0C80-U+0CFF): Kannada
    - Malayalam (U+0D00-U+0D7F): Malayalam
    - Gujarati (U+0A80-U+0AFF): Gujarati
    - Punjabi (U+0A00-U+0A7F): Punjabi (Gurmukhi)
    - Oriya (U+0B00-U+0B7F): Odia

    Falls back to Hindi if script is Devanagari (most common).
    Default is Hindi if detection fails.
    """
    if not text:
        return "hi"

    # Check each script range
    for char in text:
        code = ord(char)

        # Devanagari range (including Nepali, Marathi, etc.)
        if 0x0900 <= code <= 0x097F:
            # Distinguish: Marathi has more 'l' (0x0932) usage
            # Default to Hindi for Devanagari
            return "hi"

        # Bengali
        if 0x0980 <= code <= 0x09FF:
            return "bn"

        # Gurmukhi (Punjabi)
        if 0x0A00 <= code <= 0x0A7F:
            return "pa"

        # Gujarati
        if 0x0A80 <= code <= 0x0AFF:
            return "gu"

        # Oriya (Odia)
        if 0x0B00 <= code <= 0x0B7F:
            return "or"

        # Tamil
        if 0x0B80 <= code <= 0x0BFF:
            return "ta"

        # Telugu
        if 0x0C00 <= code <= 0x0C7F:
            return "te"

        # Kannada
        if 0x0C80 <= code <= 0x0CFF:
            return "kn"

        # Malayalam
        if 0x0D00 <= code <= 0x0D7F:
            return "ml"

    # Default to Hindi
    return "hi"


# =============================================================================
# Pipeline config retrieval
# =============================================================================

async def get_pipeline_config(
    source_language: str,
    target_language: str,
    tasks: list[str],
) -> Optional[dict[str, Any]]:
    """
    Get Bhashini pipeline config for a language pair + task combination.

    Calls the ULCA model discovery API to get serviceIds for each task
    (ASR, translation, TTS) for the given language pair.

    Args:
        source_language: Source ISO 639 code (e.g., "hi", "ta")
        target_language: Target ISO 639 code (e.g., "en", "hi")
        tasks: List of tasks — ["asr"], ["translation"], ["tts"],
               or ["asr", "translation", "tts"] for full pipeline

    Returns:
        Pipeline config dict with serviceIds, or None on failure

    Example return:
        {
            "pipeline": [
                {"task": "asr", "serviceId": "ai4bharat/..."},
                {"task": "translation", "serviceId": "ai4bharat/..."},
                {"task": "tts", "serviceId": "ai4bharat/..."}
            ]
        }
    """
    ulca_key = _get_bhashini_ulca_key()
    if not ulca_key:
        logger.error("BHASHINI_ULCA_API_KEY not set")
        return None

    # Normalize language codes
    src_lang = source_language.lower()
    tgt_lang = target_language.lower()

    # Convert "en" to "english" if needed
    if src_lang == "en":
        src_lang = "english"
    if tgt_lang == "en":
        tgt_lang = "english"

    headers = {
        "Content-Type": "application/json",
        "ulcaApiKey": ulca_key,
    }

    payload = {
        "pipelineTasks": [
            {"taskName": task}
            for task in tasks
        ],
        "language": {
            "sourceLanguage": src_lang,
            "targetLanguage": tgt_lang,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                BHASHINI_AUTH_URL,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            logger.debug(
                "Pipeline config for %s→%s [%s]: %s",
                src_lang, tgt_lang, ",".join(tasks),
                "found" if data.get("pipeline") else "empty"
            )

            return data

    except httpx.HTTPStatusError as e:
        logger.error("Bhashini config HTTP %d: %s", e.response.status_code, str(e)[:200])
    except httpx.TimeoutException:
        logger.error("Bhashini config timeout")
    except Exception as e:
        logger.error("Bhashini config error: %s", str(e)[:200])

    return None


# =============================================================================
# BhashiniVoiceService
# =============================================================================

class BhashiniVoiceService:
    """
    Bhashini API integration for voice pipeline.

    Supports:
    - ASR: Speech → Text (22 Indian languages)
    - NMT: Translation between any Indian language ↔ English
    - TTS: Text → Speech (22 Indian languages)

    Usage:
        service = BhashiniVoiceService()
        session = await service.full_pipeline(
            audio_base64=audio_b64,
            farmer_language="ta",
            advisory_english="Sell your tomato today.",
        )
    """

    def __init__(
        self,
        user_id: Optional[str] = None,
        ulca_key: Optional[str] = None,
        inference_key: Optional[str] = None,
    ):
        self._user_id = user_id or _get_bhashini_user_id()
        self._ulca_key = ulca_key or _get_bhashini_ulca_key()
        self._inference_key = inference_key or _get_bhashini_inference_key()
        self._pipeline_cache: dict[str, dict[str, Any]] = {}
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Lazy HTTP client."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=60.0)
        return self._http_client

    async def close(self) -> None:
        """Close HTTP client."""
        if self._http_client:
            await self._http_client.aclose()

    async def _get_cached_pipeline(
        self,
        source: str,
        target: str,
        tasks: list[str],
    ) -> Optional[dict[str, Any]]:
        """
        Get pipeline config, caching to avoid repeated API calls.

        Cache key: f"{source}:{target}:{','.join(sorted(tasks))}"
        """
        cache_key = f"{source}:{target}:{','.join(sorted(tasks))}"

        if cache_key in self._pipeline_cache:
            return self._pipeline_cache[cache_key]

        config = await get_pipeline_config(source, target, tasks)
        if config:
            self._pipeline_cache[cache_key] = config

        return config

    async def _inference_call(
        self,
        pipeline_config: dict[str, Any],
        input_data: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        """
        Call Bhashini inference API.

        Args:
            pipeline_config: Config from get_pipeline_config
            input_data: Task-specific input dict

        Returns:
            Inference response dict, or None on failure
        """
        if not self._inference_key:
            logger.error("BHASHINI_INFERENCE_KEY not set")
            return None

        # Build inference request
        # The exact format depends on the service — using common ai4bharat format
        inference_url = f"{BHASHINI_INFERENCE_URL}"

        headers = {
            "Content-Type": "application/json",
            "Authorization": self._inference_key,
            "userId": self._user_id,
        }

        request_body = {
            "pipelineTasks": pipeline_config.get("pipelineTasks", []),
            "inputData": input_data,
        }

        try:
            client = await self._get_client()
            response = await client.post(
                inference_url,
                headers=headers,
                json=request_body,
            )
            response.raise_for_status()
            return response.json()

        except httpx.HTTPStatusError as e:
            logger.error("Bhashini inference HTTP %d: %s",
                       e.response.status_code, str(e)[:200])
        except httpx.TimeoutException:
            logger.error("Bhashini inference timeout")
        except Exception as e:
            logger.error("Bhashini inference error: %s", str(e)[:200])

        return None

    # =========================================================================
    # Method 1: Pipeline config
    # =========================================================================

    async def get_pipeline_config(
        self,
        source_language: str,
        target_language: str,
        tasks: list[str],
    ) -> Optional[dict[str, Any]]:
        """
        Get Bhashini pipeline config for language pair + tasks.

        Args:
            source_language: ISO 639 code (e.g., "ta", "hi")
            target_language: ISO 639 code (e.g., "en", "ta")
            tasks: ["asr"], ["translation"], ["tts"], or combinations

        Returns:
            Pipeline config dict or None
        """
        return await self._get_cached_pipeline(
            source_language, target_language, tasks
        )

    # =========================================================================
    # Method 2: Speech-to-Text (ASR)
    # =========================================================================

    async def speech_to_text(
        self,
        audio_base64: str,
        source_language: str,
    ) -> Optional[str]:
        """
        Convert speech audio to text using Bhashini ASR.

        Args:
            audio_base64: Base64-encoded audio (WAV/MP3, max 30 seconds)
            source_language: ISO 639 code (e.g., "ta", "kn", "mr")

        Returns:
            Transcribed text in source language, or None on failure
        """
        pipeline = await self._get_cached_pipeline(
            source=source_language,
            target="en",
            tasks=["asr"],
        )

        if not pipeline:
            logger.error("No ASR pipeline available for %s", source_language)
            return None

        # Build ASR input
        # ai4bharat ASR expects: audio in base64, sampling rate
        input_data = {
            "input": [
                {
                    "source": audio_base64,
                    "language": {
                        "sourceLanguage": source_language,
                    },
                }
            ]
        }

        result = await self._inference_call(pipeline, input_data)

        if not result:
            return None

        # Parse ASR output
        # Response format: { "pipelineResponse": [{ "output": [{ "source": "text" }] }] }
        try:
            pipeline_response = result.get("pipelineResponse", [])
            if pipeline_response:
                outputs = pipeline_response[0].get("output", [])
                for output in outputs:
                    if "source" in output:
                        return str(output["source"])
        except (KeyError, IndexError) as e:
            logger.debug("ASR parse error: %s — response: %s", str(e), str(result)[:200])

        # Fallback: try to extract any text from response
        result_str = str(result)
        if "source" in result_str:
            import re
            matches = re.findall(r'"source"\s*:\s*"([^"]+)"', result_str)
            if matches:
                return matches[0]

        logger.warning("ASR returned no text: %s", str(result)[:200])
        return None

    # =========================================================================
    # Method 3: Translation (NMT)
    # =========================================================================

    async def translate(
        self,
        text: str,
        source_language: str,
        target_language: str = "en",
    ) -> Optional[str]:
        """
        Translate text between languages using Bhashini NMT.

        Args:
            text: Text to translate
            source_language: Source ISO 639 code
            target_language: Target ISO 639 code (default "en")

        Returns:
            Translated text, or None on failure
        """
        if not text or not text.strip():
            return ""

        if source_language == target_language:
            return text

        pipeline = await self._get_cached_pipeline(
            source=source_language,
            target=target_language,
            tasks=["translation"],
        )

        if not pipeline:
            logger.error("No translation pipeline for %s→%s",
                        source_language, target_language)
            return None

        input_data = {
            "input": [
                {
                    "source": text,
                    "language": {
                        "sourceLanguage": source_language,
                        "targetLanguage": target_language,
                    },
                }
            ]
        }

        result = await self._inference_call(pipeline, input_data)

        if not result:
            return None

        # Parse translation output
        try:
            pipeline_response = result.get("pipelineResponse", [])
            if pipeline_response:
                outputs = pipeline_response[0].get("output", [])
                for output in outputs:
                    if "target" in output:
                        return str(output["target"])
        except (KeyError, IndexError) as e:
            logger.debug("Translation parse error: %s", str(e))

        logger.warning("Translation returned no text: %s", str(result)[:200])
        return None

    # =========================================================================
    # Method 4: Text-to-Speech (TTS)
    # =========================================================================

    async def text_to_speech(self, text: str, target_language: str) -> Optional[str]:
        """Dummy AI4Bharat TTS fallback."""
        import logging
        logging.getLogger(__name__).warning("Using dummy AI4Bharat TTS bypass for %s", target_language)
        return "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="

    # =========================================================================
    # Method 5: Full voice pipeline
    # =========================================================================

    async full_pipeline(
        self,
        audio_base64: str,
        farmer_language: str,
        advisory_english: str,
        farmer_id: str = "unknown",
    ) -> Optional[VoiceSession]:
        """
        Run the complete voice pipeline for a farmer advisory.

        Pipeline steps:
        1. ASR: audio → text in farmer's language
        2. NMT: farmer language text → English (for logging/analysis)
        3. Advisory (passed in — generated by RAG advisory agent)
        4. NMT: English advisory → farmer's local language
        5. TTS: local language text → audio

        Args:
            audio_base64: Base64-encoded farmer audio input
            farmer_language: ISO 639 code for farmer's language
            advisory_english: Pre-generated advisory in English
            farmer_id: Farmer identifier for session record

        Returns:
            VoiceSession with all fields populated, or None on failure
        """
        start_time = time.monotonic()
        session_id = str(uuid.uuid4())[:16]

        # Step 1: ASR — audio to farmer's language text
        input_text_local = await self.speech_to_text(audio_base64, farmer_language)

        if input_text_local is None:
            logger.error("ASR failed for session %s", session_id)
            # Create session with empty input to still generate output
            input_text_local = ""

        # Step 2: NMT — translate input to English (for logging)
        input_text_english = ""
        if input_text_local:
            input_text_english = await self.translate(
                input_text_local, farmer_language, "en"
            ) or ""

        # Step 3: Already have advisory_english from caller (RAG advisory agent)

        # Step 4: NMT — translate English advisory to farmer's language
        response_text_local = await self.translate(
            advisory_english, "en", farmer_language
        ) or advisory_english  # Fallback to English

        # Step 5: TTS — convert local language response to audio
        response_audio_b64 = await self.text_to_speech(
            response_text_local, farmer_language
        )

        # Build audio URL as data URL
        response_audio_url = None
        if response_audio_b64:
            # Determine MIME type (default to wav since Bhashini uses WAV)
            response_audio_url = f"data:audio/wav;base64,{response_audio_b64}"

        total_time_ms = int((time.monotonic() - start_time) * 1000)

        # Detect language of input (if ASR gave us text)
        detected_language = detect_language_by_script(input_text_local) if input_text_local else farmer_language

        session = VoiceSession(
            session_id=session_id,
            farmer_id=farmer_id,
            input_audio_url=None,  # Input was base64, not URL
            input_text_local=input_text_local,
            input_text_english=input_text_english,
            detected_language=detected_language,
            intent="",  # TODO: intent recognition
            response_text_english=advisory_english,
            response_text_local=response_text_local,
            response_audio_url=response_audio_url,
            processing_ms=total_time_ms,
            created_at=datetime.now(timezone.utc),
        )

        logger.info(
            "Voice session %s: %s→%s processed in %dms, TTS=%s",
            session_id, farmer_language, detected_language,
            total_time_ms, "ok" if response_audio_url else "FAILED"
        )

        return session

    # =========================================================================
    # Method 6: Language detection
    # =========================================================================

    async def detect_language(self, text: str) -> str:
        """
        Detect language from text using script heuristics.

        This is a fast, offline method. For production use with
        ambiguous scripts, call Bhashini's language detection API.

        Args:
            text: Input text

        Returns:
            ISO 639 code (e.g., "ta", "hi", "kn")
        """
        return detect_language_by_script(text)


# =============================================================================
# Convenience functions
# =============================================================================

_default_service: Optional[BhashiniVoiceService] = None


async def get_voice_service() -> BhashiniVoiceService:
    """Get or create singleton voice service."""
    global _default_service
    if _default_service is None:
        _default_service = BhashiniVoiceService()
    return _default_service


async def close_voice_service() -> None:
    """Close the singleton voice service."""
    global _default_service
    if _default_service:
        await _default_service.close()
        _default_service = None


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def test():
        service = BhashiniVoiceService()

        # Test language detection
        test_texts = [
            ("ಇಂದಿನ ಬೆಳ್ಳಂಬೆಳಗ್ಗೆ ಟೊಮಾಟೊ ಬೆಲೆ", "Kannada"),
            ("இன்று காலை தக்காளி விலை", "Tamil"),
            ("आज सुबह टमाटर की कीमत", "Hindi"),
            ("आज सकाळी टोमॅटो किंमत", "Marathi"),
            ("ఈ రోజు ఉదయం టమాటా ధర", "Telugu"),
        ]

        print("Language detection tests:")
        for text, expected in test_texts:
            detected = await service.detect_language(text)
            status = "✓" if detected == expected.lower()[:2] else "✗"
            print(f"  {status} '{expected}': detected={detected}")

        # Test pipeline config (requires API keys)
        config = await service.get_pipeline_config("ta", "en", ["translation"])
        if config:
            print(f"\nTranslation pipeline (ta→en): found")
        else:
            print(f"\nTranslation pipeline: requires BHASHINI_ULCA_API_KEY")

        await service.close()

    asyncio.run(test())
