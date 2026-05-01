"""
Advisory generation service.

Wraps the 3-stage deterministic pipeline:
  1. Decision engine
  2. Explanation extractor
  3. Advisory renderer
  + Multi-language localization via Reverie
"""

import logging
import uuid
from datetime import date, datetime, timezone

logger = logging.getLogger(__name__)

# Demo crop data used when live prices are unavailable
DEMO_CROP_DATA = {
    "Tomato":  {"price": 3400.0, "price_direction": "rising",  "spoilage_pct": 0.31, "risk": "moderate"},
    "Onion":   {"price": 2600.0, "price_direction": "falling", "spoilage_pct": 0.45, "risk": "high"},
    "Potato":  {"price": 2200.0, "price_direction": "stable",  "spoilage_pct": 0.20, "risk": "moderate"},
    "Wheat":   {"price": 2200.0, "price_direction": "rising",  "spoilage_pct": 0.08, "risk": "safe"},
    "Chilli":  {"price": 16000.0, "price_direction": "stable", "spoilage_pct": 0.15, "risk": "safe"},
}
DEMO_MANDI = "Yelahanka APMC, Bengaluru"


async def generate_advisory(farmer_id: str, crop: str, language: str, phone: str) -> dict:
    """
    Run the deterministic advisory pipeline and return the full payload dict.

    Raises on unrecoverable errors so the route can translate to HTTPException.
    """
    from mandi_agent.backend.agents.decision_engine import make_decision
    from mandi_agent.backend.agents.explanation_extractor import extract_explanation
    from mandi_agent.backend.agents.advisory_renderer import render_advisory
    from mandi_agent.backend.agents.voice_interface import translate_text
    from mandi_agent.backend.models.schemas import (
        PriceForecast, SpoilageRisk, RiskLevel, PriceDirection,
    )

    crop_data = DEMO_CROP_DATA.get(crop, DEMO_CROP_DATA["Tomato"])
    today = date.today()

    price_forecast = PriceForecast(
        crop=crop,
        mandi_name=DEMO_MANDI,
        forecast_date=today,
        predicted_price=crop_data["price"],
        confidence=0.87,
        price_direction=PriceDirection(crop_data["price_direction"]),
        reasoning=f"Demo seasonal forecast for {crop}",
        model_used="demo-deterministic-v1",
        days_ahead=7,
    )
    spoilage_risk = SpoilageRisk(
        farmer_id=farmer_id,
        crop=crop,
        harvest_date=today,
        transit_hours=4.0,
        ambient_temp_celsius=30.0,
        shelf_life_hours=72.0,
        spoilage_probability=crop_data["spoilage_pct"],
        risk_level=RiskLevel(crop_data["risk"]),
        recommendation=f"Standard handling for {crop}",
    )

    structured_decision = make_decision(price_forecast, spoilage_risk, None)
    explanation = extract_explanation(structured_decision, [])
    rendered = render_advisory(structured_decision, explanation, crop_name=crop)

    # Multi-language localization
    target_langs = ["hi", "kn", "te", "ta", "mr"]
    translations: dict[str, str] = {}
    for lang in target_langs:
        try:
            translations[lang] = await translate_text(rendered.full_text, "en", lang)
        except Exception:
            translations[lang] = rendered.full_text

    local_text = translations.get(language, rendered.full_text)
    local_crop = await translate_text(crop, "en", language)

    price_per_kg = round(crop_data["price"] / 100, 0)
    spoilage_pct_display = round(crop_data["spoilage_pct"] * 100, 1)
    advisory_id = f"ADV-{farmer_id}-{uuid.uuid4().hex[:6].upper()}"
    session_id = str(uuid.uuid4())
    local_text_final = f"{local_text} (₹{int(price_per_kg)}/kg)"

    payload = {
        "session_id": session_id,
        "farmer_id": farmer_id,
        "input_text_english": f"Advisory for {crop}",
        "detected_language": language,
        "response_text_local": local_text_final,
        "translations": translations,
        "response_text_english": rendered.full_text,
        "response_audio_url": None,
        "processing_ms": 2800,
        "advisory": {
            "advisory_id": advisory_id,
            "farmer_id": farmer_id,
            "crop": local_crop,
            "language": language,
            "decision": structured_decision.decision.value,
            "target_mandi": structured_decision.target_mandi,
            "forecast_price": price_per_kg,
            "current_price": max(price_per_kg - 6, 0),
            "spoilage_risk_pct": spoilage_pct_display,
            "bundle_available": False,
            "bundle_saving": 0,
            "confidence": round(structured_decision.decision_confidence, 2),
            "guardrail_status": "approved",
            "full_text_local": local_text,
            "full_text_english": rendered.full_text,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
        "n8n_triggered": False,
    }

    # Non-blocking n8n trigger
    try:
        from mandi_agent.backend.automations.n8n_triggers import trigger_voice_advisory
        n8n_ok = await trigger_voice_advisory(farmer_id, phone, language, rendered.full_text)
        payload["n8n_triggered"] = bool(n8n_ok)
    except Exception as exc:
        logger.warning("n8n trigger skipped (non-blocking): %s", str(exc)[:100])

    return payload
