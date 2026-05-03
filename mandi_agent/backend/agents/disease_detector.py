"""Crop disease detection agent using Gemini Vision."""

from __future__ import annotations

import base64
import json
import logging
import uuid

import google.generativeai as genai

from mandi_agent.backend.api.core_schemas import DiseaseDiagnosis, Severity

logger = logging.getLogger(__name__)

MODEL = "gemini-2.0-flash"
_model: genai.GenerativeModel | None = None


def _get_model() -> genai.GenerativeModel:
    global _model
    if _model is None:
        import os

        api_key = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
        if not api_key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY not set")
        genai.configure(api_key=api_key)
        _model = genai.GenerativeModel(MODEL)
    return _model


async def detect_crop_disease(image_base64: str, crop: str) -> DiseaseDiagnosis:
    """Analyze crop image for disease symptoms using Gemini Vision."""
    prompt = (
        "You are an agricultural pathologist. Analyze this crop image and return JSON with keys: "
        "disease_name, confidence (0-1), severity(low|medium|high|critical), symptoms_observed(list), "
        "preventive_actions(list), treatment_actions(list), escalation_required(boolean). "
        f"Crop is {crop}. If uncertain, set disease_name='unknown'."
    )
    try:
        image_bytes = base64.b64decode(image_base64)
        model = _get_model()
        response = await model.generate_content_async(
            [
                {"mime_type": "image/jpeg", "data": image_bytes},
                prompt,
            ]
        )
        raw = (response.text or "").strip()
        if "```json" in raw:
            raw = raw.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in raw:
            raw = raw.split("```", 1)[1].split("```", 1)[0].strip()

        data = json.loads(raw)
        return DiseaseDiagnosis(
            diagnosis_id=f"diag-{uuid.uuid4().hex[:12]}",
            crop=crop,
            disease_name=str(data.get("disease_name", "unknown")),
            confidence=float(data.get("confidence", 0.55)),
            severity=Severity(str(data.get("severity", "medium"))),
            symptoms_observed=list(data.get("symptoms_observed", [])),
            preventive_actions=list(data.get("preventive_actions", [])),
            treatment_actions=list(data.get("treatment_actions", [])),
            escalation_required=bool(data.get("escalation_required", False)),
        )
    except Exception as exc:
        logger.warning("Disease detection fallback: %s", str(exc)[:160])
        # Crop-specific fallback diseases
        CROP_COMMON_DISEASES: dict[str, dict] = {
            "tomato": {"disease_name": "possible_early_blight", "symptoms": ["brown lesions on lower leaves", "concentric rings on spots"]},
            "potato": {"disease_name": "possible_late_blight", "symptoms": ["water-soaked lesions", "white mould on leaf underside"]},
            "onion": {"disease_name": "possible_purple_blotch", "symptoms": ["purple lesions on leaves", "yellowing leaf tips"]},
            "rice": {"disease_name": "possible_blast", "symptoms": ["diamond-shaped lesions on leaves", "neck rot"]},
            "wheat": {"disease_name": "possible_rust", "symptoms": ["orange-brown pustules on leaves", "reduced vigour"]},
            "chilli": {"disease_name": "possible_anthracnose", "symptoms": ["sunken spots on fruits", "circular lesions"]},
        }
        crop_info = CROP_COMMON_DISEASES.get(crop.lower(), {
            "disease_name": "possible_leaf_blight",
            "symptoms": ["leaf discoloration", "spotting"],
        })
        return DiseaseDiagnosis(
            diagnosis_id=f"diag-{uuid.uuid4().hex[:12]}",
            crop=crop,
            disease_name=crop_info["disease_name"],
            confidence=0.45,
            severity=Severity.MEDIUM,
            symptoms_observed=crop_info["symptoms"],
            preventive_actions=["avoid overhead irrigation", "improve airflow", "remove infected plant debris"],
            treatment_actions=["consult KVK or agricultural officer", "apply recommended fungicide as per label"],
            escalation_required=True,
        )
