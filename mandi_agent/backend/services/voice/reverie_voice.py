import asyncio
import logging
import base64
import time
import uuid
from datetime import datetime, timezone
from typing import Optional
import os

from mandi_agent.backend.api.core_schemas import VoiceSession
from reverie_sdk import ReverieASR, ReverieTTS, ReverieNMT

logger = logging.getLogger(__name__)

# Standard mapping for Reverie RevUp speakers
SPEAKER_MAP = {
    "hi": ["hi_female_1", "hi_female_2", "hi_f"],
    "kn": ["kn_female_1", "kn_female_2", "kn_f"],
    "te": ["te_female_1", "te_female_2", "te_f"],
    "ta": ["ta_female_1", "ta_female_2", "ta_f"],
    "mr": ["mr_female_1", "mr_female_2", "mr_f"],
    "en": ["en_female_1", "en_f"]
}

def _get_auth():
    app_id = os.getenv("REVERIE_APP_ID", "").strip()
    api_key = os.getenv("REVERIE_API_KEY", "").strip()
    return app_id, api_key

class ReverieVoiceService:
    def __init__(self):
        self.app_id, self.api_key = _get_auth()
        if not self.app_id or not self.api_key:
            logger.warning("Reverie credentials not found in env.")

    async def speech_to_text(self, audio_base64: str, source_language: str) -> Optional[str]:
        if not audio_base64: return None
        try:
            asr = ReverieASR(api_key=self.api_key, app_id=self.app_id)
            audio_bytes = base64.b64decode(audio_base64)
            # Default to 16k mono
            response = asr.stt_file(src_lang=source_language, data=audio_bytes)
            if response and hasattr(response, "text"):
                return response.text
            return None
        except Exception as e:
            logger.error("Reverie STT failed: %s", e)
            return None

    async def translate(self, text: str, source_language: str, target_language: str) -> Optional[str]:
        if not text: return None
        if source_language == target_language: return text
        try:
            nmt = ReverieNMT(api_key=self.api_key, app_id=self.app_id)
            response = nmt.localization(
                data=[text],
                src_lang=source_language,
                tgt_lang=target_language,
                enableNmt=True
            )
            if response and hasattr(response, "responseList") and response.responseList:
                first_item = response.responseList[0]
                if hasattr(first_item, "outString") and first_item.outString:
                    return first_item.outString[0]
            return text
        except Exception as e:
            logger.error("Reverie NMT failed: %s", e)
            return text

    async def text_to_speech(self, text: str, target_language: str) -> Optional[str]:
        if not text: return None
        try:
            tts = ReverieTTS(api_key=self.api_key, app_id=self.app_id)
            
            # Get list of possible speakers for this language
            speakers = SPEAKER_MAP.get(target_language, [f"{target_language}_female_1", f"{target_language}_f"])
            
            last_error = ""
            for speaker in speakers:
                try:
                    response = tts.tts(speaker=speaker, text=text, format="WAV")
                    if response and hasattr(response, "audio_bytes") and response.audio_bytes:
                        logger.info(f"Successfully generated TTS with speaker: {speaker}")
                        return base64.b64encode(response.audio_bytes).decode('utf-8')
                    
                    if response and hasattr(response, "message"):
                        last_error = response.message
                except Exception as e:
                    last_error = str(e)
                    continue
            
            logger.error(f"Reverie TTS failed after trying all speakers: {last_error}")
            return None
        except Exception as e:
            logger.error("Reverie TTS fatal failure: %s", e)
            return None

    async def full_pipeline(self, audio_base64: str, farmer_language: str, advisory_english: str, farmer_id: str = "unknown") -> Optional[VoiceSession]:
        session_id = str(uuid.uuid4())[:16]
        start_time = time.monotonic()
        
        # 1. ASR
        input_text_local = await self.speech_to_text(audio_base64, farmer_language) or ""
        
        # 2. Translation to English
        input_text_english = ""
        if input_text_local:
            input_text_english = await self.translate(input_text_local, farmer_language, "en")
        
        # 3. Translation from English to Farmer Language
        response_text_local = await self.translate(advisory_english, "en", farmer_language) or advisory_english
        
        # 4. TTS
        response_audio_b64 = await self.text_to_speech(response_text_local, farmer_language)
        response_audio_url = f"data:audio/wav;base64,{response_audio_b64}" if response_audio_b64 else None
        
        total_time_ms = int((time.monotonic() - start_time) * 1000)
        
        return VoiceSession(
            session_id=session_id,
            farmer_id=farmer_id,
            input_audio_url=None,
            input_text_local=input_text_local,
            input_text_english=input_text_english,
            detected_language=farmer_language,
            intent="",
            response_text_english=advisory_english,
            response_text_local=response_text_local,
            response_audio_url=response_audio_url,
            processing_ms=total_time_ms,
            created_at=datetime.now(timezone.utc),
        )

    async def close(self): pass

async def get_voice_service(): return ReverieVoiceService()
async def close_voice_service(): pass
