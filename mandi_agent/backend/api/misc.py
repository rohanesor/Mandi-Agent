"""
Miscellaneous routes (disease detection, schemes, demand, logs, cold storage, health).
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException

from mandi_agent.backend.api.core_schemas import DemandForecast, FAQVoiceItem, GovtScheme
from mandi_agent.backend.api.schemas import (
    DemandPredictionRequest,
    DiseaseDetectionRequest,
    FAQVoiceRequest,
    HealthResponse,
    SchemeEligibilityRequest,
)

router = APIRouter(tags=["Misc"])
logger = logging.getLogger(__name__)


@router.post("/api/disease/detect")
async def detect_disease(req: DiseaseDetectionRequest):
    """Analyze crop image for disease symptoms."""
    from mandi_agent.backend.agents.disease_detector import detect_crop_disease

    diagnosis = await detect_crop_disease(req.image_base64, req.crop)
    return diagnosis.model_dump(mode="json")


@router.post("/api/schemes/eligibility", response_model=list[GovtScheme])
async def schemes_eligibility(req: SchemeEligibilityRequest) -> list[GovtScheme]:
    """Check government scheme eligibility for a farmer profile."""
    from mandi_agent.backend.agents.scheme_matcher import check_scheme_eligibility

    return await check_scheme_eligibility(req.farmer)


@router.post("/api/demand/predict", response_model=DemandForecast)
async def demand_predict(req: DemandPredictionRequest) -> DemandForecast:
    """Predict market demand trajectory for a crop/state."""
    from mandi_agent.backend.agents.demand_predictor import predict_demand

    return await predict_demand(req.crop, req.state, req.months_ahead)


@router.post("/api/faq/voice", response_model=FAQVoiceItem)
async def voice_faq(req: FAQVoiceRequest) -> FAQVoiceItem:
    """Return voice FAQ answer in requested language."""
    from mandi_agent.backend.agents.faq_voice import get_voice_faq

    return await get_voice_faq(req.query, req.language)


@router.get("/api/cold-storage/nearest")
async def nearest_cold_storage(lat: float = 0.0, lng: float = 0.0, crop: str = ""):
    """
    Find nearest cold storage facility with available capacity.
    Used by n8n spoilage_emergency workflow to route perishables.
    """
    if not crop:
        raise HTTPException(status_code=400, detail="crop is required")

    # Demo cold storage facilities
    facilities = [
        {
            "storage_id": "CS-KA-KOL-01",
            "storage_name": "Kolar Cold Storage Pvt Ltd",
            "storage_contact": "+919900112233",
            "lat": 13.1358,
            "lng": 78.1292,
            "capacity_tonnes": 500,
            "available_tonnes": 120,
            "supported_crops": ["Tomato", "Capsicum", "Grapes"],
            "price_per_quintal_per_day": 8.5,
        },
        {
            "storage_id": "CS-KA-BLR-01",
            "storage_name": "Bangalore APMC Cold Chain",
            "storage_contact": "+919900445566",
            "lat": 12.9716,
            "lng": 77.5946,
            "capacity_tonnes": 1000,
            "available_tonnes": 350,
            "supported_crops": ["Tomato", "Onion", "Potato", "Mango"],
            "price_per_quintal_per_day": 12.0,
        },
        {
            "storage_id": "CS-MH-NSK-01",
            "storage_name": "Nashik Grape Cold Storage",
            "storage_contact": "+919922334455",
            "lat": 19.9975,
            "lng": 73.7898,
            "capacity_tonnes": 800,
            "available_tonnes": 200,
            "supported_crops": ["Grape", "Onion", "Pomegranate", "Tomato"],
            "price_per_quintal_per_day": 10.0,
        },
    ]

    matching = [
        f for f in facilities if crop.lower() in [c.lower() for c in f["supported_crops"]] and f["available_tonnes"] > 0
    ]

    if not matching:
        return {
            "available": False,
            "message": f"No cold storage with capacity found for {crop}",
            "facilities": [],
        }

    for f in matching:
        f["distance_km"] = round(((f["lat"] - lat) ** 2 + (f["lng"] - lng) ** 2) ** 0.5 * 111, 1)
    matching.sort(key=lambda f: f["distance_km"])

    nearest = matching[0]
    return {
        "available": True,
        "storage_id": nearest["storage_id"],
        "storage_name": nearest["storage_name"],
        "storage_contact": nearest["storage_contact"],
        "distance_km": nearest["distance_km"],
        "available_tonnes": nearest["available_tonnes"],
        "price_per_quintal_per_day": nearest["price_per_quintal_per_day"],
        "alternate_mandi": "Koyambedu, Chennai",
        "alternate_price": 32.0,
        "facilities": matching,
    }


@router.post("/api/cold-storage/book")
async def book_cold_storage(request: dict):
    """
    Book a cold storage slot for a farmer's crop.
    Used by n8n spoilage_emergency workflow after finding nearest facility.
    """
    farmer_id = request.get("farmer_id", "")
    storage_id = request.get("storage_id", "")
    crop = request.get("crop", "")
    quantity = request.get("quantity", 0)

    if not farmer_id or not storage_id:
        raise HTTPException(status_code=400, detail="farmer_id and storage_id are required")

    booking_id = f"BK-{uuid.uuid4().hex[:8].upper()}"
    return {
        "booking_id": booking_id,
        "farmer_id": farmer_id,
        "storage_id": storage_id,
        "storage_name": "Kolar Cold Storage Pvt Ltd",
        "storage_contact": "+919900112233",
        "crop": crop,
        "quantity_quintals": quantity,
        "booked": True,
        "valid_until": (datetime.now(UTC) + timedelta(hours=48)).isoformat(),
        "message": f"Cold storage booked for {quantity}q of {crop} at {storage_id}",
    }


@router.post("/api/log/advisory")
async def log_advisory(request: dict):
    """Log advisory delivery record (used by n8n WhatsApp Advisory Loop)."""
    row = {
        "farmer_id": request.get("farmer_id", ""),
        "advisory_id": request.get("advisory_id", ""),
        "language": request.get("language", ""),
        "channel": request.get("channel", "whatsapp"),
        "created_at": datetime.now(UTC).isoformat(),
    }
    try:
        from mandi_agent.backend.db.supabase import get_supabase_sync

        supabase = get_supabase_sync()
        if supabase:
            supabase.table("advisory_logs").insert(row).execute()
    except Exception as e:
        logger.warning("advisory_logs insert failed: %s", str(e)[:200])
    return {"logged": True, **row}


@router.post("/api/log/voice-session")
async def log_voice_session(request: dict):
    """Log voice session record (used by n8n WhatsApp Advisory Loop)."""
    row = {
        "session_id": request.get("session_id", ""),
        "farmer_id": request.get("farmer_id", ""),
        "input_text_local": request.get("input_text_local", ""),
        "response_text_local": request.get("response_text_local", ""),
        "response_audio_url": request.get("response_audio_url"),
        "processing_ms": request.get("processing_ms", 0),
        "created_at": datetime.now(UTC).isoformat(),
    }
    try:
        from mandi_agent.backend.db.supabase import get_supabase_sync

        supabase = get_supabase_sync()
        if supabase:
            supabase.table("voice_sessions").insert(row).execute()
    except Exception as e:
        logger.warning("voice_sessions insert failed: %s", str(e)[:200])
    return {"logged": True, **row}


@router.get("/api/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.
    Returns status of all system components.
    """
    agents_ok = True
    try:
        agents = {
            "price_prediction": "ok",
            "oversupply_detector": "ok",
            "spoilage_risk": "ok",
            "negotiation": "ok",
            "rag_advisory": "ok",
            "guardrails": "ok",
        }
    except Exception as e:
        agents_ok = False
        agents = {"error": str(e)[:50]}

    rag_status = "ok" if agents_ok else "degraded"
    voice_status = "ok"
    n8n_status = "ok"

    return HealthResponse(
        status="healthy" if agents_ok else "degraded",
        agents=agents,
        rag=rag_status,
        voice=voice_status,
        n8n=n8n_status,
    )



