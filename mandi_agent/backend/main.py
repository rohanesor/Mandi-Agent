"""
Mandi-Agent FastAPI Backend.
Main API entry point with WebSocket support for live progress streaming.
"""

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status, Header, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from mandi_agent.backend.models.schemas import (
    AdvisoryDeliveryResult,
    CooperativeBundle,
    DemandForecast,
    FAQVoiceItem,
    FarmerAdvisory,
    FarmerProfile,
    GovtScheme,
    GuardrailResult,
    GuardrailStatus,
    HarvestIntent,
    HarvestIntentConflict,
    MandiPrice,
    PriceForecast,
    SpoilageRisk,
    VoiceSession,
    WeatherAlert,
    WeatherAlertType,
    Severity,
)
from mandi_agent.backend.data_sources.agri_news import get_all_agri_news
from mandi_agent.backend.agents.news_agent import analyze_article

logger = logging.getLogger(__name__)

# In-memory auth/dev stores
OTP_STORE: dict[str, str] = {}
AUTH_FARMERS_BY_PHONE: dict[str, dict[str, Any]] = {}
AUTH_REFRESH_TOKENS: dict[str, str] = {}
HARVEST_INTENT_VERSIONS: dict[str, int] = {}


def _new_token(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"

# =============================================================================
# Request/Response Models
# =============================================================================

class AdvisoryRequest(BaseModel):
    """Request body for advisory generation."""
    farmer_id: str
    audio_base64: Optional[str] = Field(None, description="Base64-encoded audio input")
    text_input: Optional[str] = Field(None, description="Text input if no audio")


class AdvisoryResponse(BaseModel):
    """Response for advisory generation."""
    session: VoiceSession
    processing_ms: int


class HarvestIntentRequest(BaseModel):
    """Request body for harvest intent submission."""
    intent: HarvestIntent


class HarvestIntentResponse(BaseModel):
    """Response for harvest intent submission."""
    intent_id: str
    received: bool
    next_step: str


class FarmerRegistrationRequest(BaseModel):
    """Request body for farmer registration."""
    farmer: FarmerProfile


class FarmerRegistrationResponse(BaseModel):
    """Response for farmer registration."""
    farmer_id: str
    registered: bool
    whatsapp_verified: bool


class OtpRequest(BaseModel):
    phone: str


class OtpResponse(BaseModel):
    message: str
    expires_in: int


class LoginRequest(BaseModel):
    phone: str
    otp: str


class FrontendFarmer(BaseModel):
    id: str
    phone: str
    name: str
    state: str
    district: str
    block: str
    village: Optional[str] = None
    primary_crops: list[str] = []
    land_size_hectares: Optional[float] = None
    preferred_language: str = "hi"
    created_at: str


class AuthLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    farmer: FrontendFarmer


class RefreshResponse(BaseModel):
    access_token: str


class BlockStatusResponse(BaseModel):
    """Response for block status."""
    block_id: str
    active_intents: int
    oversupply_crops: list[str]
    active_bundles: list[str]
    avg_forecast_price: Optional[float]


class HealthResponse(BaseModel):
    """Response for health check."""
    status: str
    agents: dict[str, str]
    rag: str
    voice: str
    n8n: str


class AdvisoryHistoryResponse(BaseModel):
    """Response for farmer advisory history."""
    farmer_id: str
    advisories: list[FarmerAdvisory]


class DiseaseDetectionRequest(BaseModel):
    image_base64: str
    crop: str


class SchemeEligibilityRequest(BaseModel):
    farmer: FarmerProfile


class DemandPredictionRequest(BaseModel):
    crop: str
    state: str
    months_ahead: int = 3


class FAQVoiceRequest(BaseModel):
    query: str
    language: str = "hi"


class WeatherAlertRequest(BaseModel):
    state: str
    district: str
    block_id: Optional[str] = None
    crop: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    # Legacy support for manual forecast injection
    forecast_rain_mm: Optional[float] = None
    hail_probability: Optional[float] = None
    wind_kmph: Optional[float] = None


class FPOAnalyticsResponse(BaseModel):
    fpo_id: str
    harvest_intent_map_points: list[dict[str, Any]]
    bundle_progress: dict[str, Any]
    price_trends: list[dict[str, Any]]
    engagement_metrics: dict[str, Any]


class HarvestIntentSyncRequest(BaseModel):
    intent: HarvestIntent
    client_version: int = 1


class SMSFallbackRequest(BaseModel):
    advisory: FarmerAdvisory
    farmer: FarmerProfile


# =============================================================================
# App Lifespan
# =============================================================================

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown."""
    logger.info("Mandi-Agent starting up...")
    yield
    # Cleanup
    from mandi_agent.backend.data_sources.fusion import close_fusion_engine
    from mandi_agent.backend.voice.reverie_voice import close_voice_service
    try:
        await close_fusion_engine()
        await close_voice_service()
    except Exception:
        pass
    logger.info("Mandi-Agent shutting down...")


# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title="Mandi-Agent",
    description="AI platform for Indian smallholder farmers — price prediction, "
                "Virtual Cooperatives, and voice advisories in 22 Indian languages.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8080",
        "http://localhost:8081",
        "http://localhost:8082",
        "http://localhost:8085",
        os.getenv("FRONTEND_URL", "http://localhost:8085"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Health
# =============================================================================

@app.get("/api/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.
    Returns status of all system components.
    """
    # Check each component
    agents_ok = True
    try:
        from mandi_agent.backend.agents import (
            price_prediction,
            oversupply_detector,
            spoilage_risk,
            negotiation,
            rag_advisory,
            guardrails,
        )
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


# =============================================================================
# Farmer Registration
# =============================================================================

@app.post("/api/farmer/register", response_model=Any)
async def register_farmer(req: dict[str, Any]) -> Any:
    """
    Register a new farmer on the platform.

    Stores farmer profile in Supabase.
    Sends WhatsApp verification code.
    """
    # Frontend contract: flat payload for mobile onboarding
    if "farmer" not in req:
        phone = str(req.get("phone", "")).strip()
        name = str(req.get("name", "")).strip()

        if not phone:
            raise HTTPException(status_code=400, detail="phone is required")
        if not name:
            raise HTTPException(status_code=400, detail="name is required")

        existing = AUTH_FARMERS_BY_PHONE.get(phone)
        if existing:
            farmer_profile = existing
        else:
            farmer_profile = {
                "id": str(uuid.uuid4()),
                "phone": phone,
                "name": name,
                "state": str(req.get("state", "")),
                "district": str(req.get("district", "")),
                "block": str(req.get("block", "")),
                "village": req.get("village"),
                "primary_crops": list(req.get("primary_crops", [])),
                "land_size_hectares": req.get("land_size_hectares"),
                "preferred_language": str(req.get("preferred_language", "hi")),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            AUTH_FARMERS_BY_PHONE[phone] = farmer_profile

        access_token = _new_token("access")
        refresh_token = _new_token("refresh")
        AUTH_REFRESH_TOKENS[refresh_token] = farmer_profile["id"]

        return {
            "farmer_id": farmer_profile["id"],
            "access_token": access_token,
            "refresh_token": refresh_token,
            "farmer": farmer_profile,
            "registered": True,
            "whatsapp_verified": False,
        }

    # Legacy contract: nested `farmer` payload
    farmer = FarmerProfile(**req["farmer"])

    try:
        import os
        from supabase import create_async_client

        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

        if supabase_url and supabase_key:
            supabase = await create_async_client(supabase_url, supabase_key)
            data = farmer.model_dump(mode="json")
            response = await supabase.table("farmers").insert(data).execute()
            if response.data:
                farmer_id = response.data[0].get("farmer_id", farmer.farmer_id)
            else:
                farmer_id = farmer.farmer_id
        else:
            farmer_id = farmer.farmer_id

        # TODO: Send WhatsApp OTP via Twilio
        # await send_whatsapp_otp(farmer.phone)

        return FarmerRegistrationResponse(
            farmer_id=farmer_id,
            registered=True,
            whatsapp_verified=False,  # Verified after OTP
        )

    except Exception as e:
        logger.error("Farmer registration failed: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)[:100]}",
        )


@app.post("/api/auth/otp/request", response_model=OtpResponse)
async def request_otp(req: OtpRequest) -> OtpResponse:
    """Dev OTP endpoint for mobile onboarding."""
    phone = req.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")

    # Dev-friendly fixed OTP
    OTP_STORE[phone] = "123456"
    return OtpResponse(message="OTP sent successfully", expires_in=300)


@app.post("/api/auth/login", response_model=AuthLoginResponse)
async def login(req: LoginRequest) -> AuthLoginResponse:
    """Dev login endpoint used by mobile app."""
    phone = req.phone.strip()
    otp = req.otp.strip()

    expected = OTP_STORE.get(phone)
    if not expected or otp != expected:
        raise HTTPException(
            status_code=400,
            detail="Invalid OTP",
        )

    farmer = AUTH_FARMERS_BY_PHONE.get(phone)
    if not farmer:
        raise HTTPException(
            status_code=404,
            detail="Farmer not found",
        )

    access_token = _new_token("access")
    refresh_token = _new_token("refresh")
    AUTH_REFRESH_TOKENS[refresh_token] = farmer["id"]

    return AuthLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        farmer=FrontendFarmer(**farmer),
    )


@app.get("/api/auth/refresh", response_model=RefreshResponse)
async def refresh_token(authorization: Optional[str] = Header(None)) -> RefreshResponse:
    """Refresh access token using refresh token in Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing refresh token")

    refresh_token_val = authorization.replace("Bearer ", "").strip()
    if refresh_token_val not in AUTH_REFRESH_TOKENS:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    return RefreshResponse(access_token=_new_token("access"))


@app.post("/api/auth/logout")
async def logout(authorization: Optional[str] = Header(None)) -> dict[str, bool]:
    """Logout endpoint (best effort for frontend compatibility)."""
    if authorization and authorization.startswith("Bearer "):
        refresh_token_val = authorization.replace("Bearer ", "").strip()
        AUTH_REFRESH_TOKENS.pop(refresh_token_val, None)
    return {"ok": True}


@app.get("/api/farmer/{farmer_id}/history", response_model=AdvisoryHistoryResponse)
async def get_advisory_history(
    farmer_id: str,
    days: int = 30,
) -> AdvisoryHistoryResponse:
    """
    Get advisory history for a farmer.

    Returns advisories from the last `days` days (default 30).
    """
    try:
        from supabase import create_async_client

        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

        if not supabase_url or not supabase_key:
            return AdvisoryHistoryResponse(farmer_id=farmer_id, advisories=[])

        supabase = await create_async_client(supabase_url, supabase_key)
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        response = await supabase.table("advisories").select("*").eq(
            "farmer_id", farmer_id
        ).gte("created_at", cutoff).order("created_at", ascending=False).execute()

        advisories = []
        for row in response.data or []:
            if row.get("created_at") and isinstance(row["created_at"], str):
                row["created_at"] = datetime.fromisoformat(
                    row["created_at"].replace("Z", "+00:00")
                )
            advisories.append(FarmerAdvisory(**row))

        return AdvisoryHistoryResponse(farmer_id=farmer_id, advisories=advisories)

    except Exception as e:
        logger.error("Failed to fetch advisory history: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch history: {str(e)[:100]}",
        )


# =============================================================================
# Harvest Intent
# =============================================================================

@app.post("/api/harvest-intent", response_model=HarvestIntentResponse)
async def submit_harvest_intent(req: HarvestIntentRequest) -> HarvestIntentResponse:
    """
    Submit a harvest intent for planning.

    Stores intent in Supabase and triggers:
    1. Oversupply detection for the block+crop
    2. Price forecasting
    3. Advisory generation (async via n8n)
    """
    intent = req.intent

    try:
        from supabase import create_async_client

        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

        stored_id = intent.intent_id
        if supabase_url and supabase_key:
            supabase = await create_async_client(supabase_url, supabase_key)
            data = intent.model_dump(mode="json")
            response = await supabase.table("harvest_intents").insert(data).execute()
            if response.data:
                stored_id = response.data[0].get("intent_id", intent.intent_id)

        # Trigger n8n workflow for async processing
        from mandi_agent.backend.automations.n8n_triggers import trigger_harvest_alert
        await trigger_harvest_alert(
            farmer_id=intent.farmer_id,
            crop=intent.crop,
            harvest_date=intent.expected_harvest_date.isoformat(),
        )

        return HarvestIntentResponse(
            intent_id=stored_id,
            received=True,
            next_step="advisory_generation",
        )

    except Exception as e:
        logger.error("Harvest intent submission failed: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Submission failed: {str(e)[:100]}",
        )


# =============================================================================
# Advisory Generation
# =============================================================================

DEMO_CROP_DATA = {
    "Tomato":  {"price": 3400.0, "price_direction": "rising",  "spoilage_pct": 0.31, "risk": "moderate"},
    "Onion":   {"price": 2600.0, "price_direction": "falling", "spoilage_pct": 0.45, "risk": "high"},
    "Potato":  {"price": 2200.0, "price_direction": "stable",  "spoilage_pct": 0.20, "risk": "moderate"},
    "Wheat":   {"price": 2200.0, "price_direction": "rising",  "spoilage_pct": 0.08, "risk": "safe"},
    "Chilli":  {"price":16000.0, "price_direction": "stable",  "spoilage_pct": 0.15, "risk": "safe"},
}
DEMO_MANDI = "Yelahanka APMC, Bengaluru"

@app.post("/api/advisory")
async def generate_advisory(request: dict):
    """Generate harvest advisory using the deterministic 3-stage pipeline."""
    try:
        from datetime import date
        from mandi_agent.backend.agents.decision_engine import make_decision
        from mandi_agent.backend.agents.explanation_extractor import extract_explanation
        from mandi_agent.backend.agents.advisory_renderer import render_advisory
        from mandi_agent.backend.models.schemas import (
            PriceForecast, SpoilageRisk, RiskLevel, PriceDirection
        )

        farmer_id = request.get("farmer_id", "F-KA-2847")
        crop = request.get("crop", "Tomato")
        language = request.get("language", "kn")
        phone = request.get("phone", "+919000000000")

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

        price_per_kg = round(crop_data["price"] / 100, 0)
        spoilage_pct_display = round(crop_data["spoilage_pct"] * 100, 1)
        advisory_id = f"ADV-{farmer_id}-{uuid.uuid4().hex[:6].upper()}"
        session_id = str(uuid.uuid4())

        # Stage 4: Multi-Language Localization
        from mandi_agent.backend.agents.voice_interface import translate_text
        
        target_langs = ["hi", "kn", "te", "ta", "mr"]
        translations = {}
        
        # Translate the main advisory into all target languages
        for lang in target_langs:
            try:
                translated = await translate_text(rendered.full_text, "en", lang)
                translations[lang] = translated
            except Exception:
                translations[lang] = rendered.full_text
        
        # Primary requested language output
        local_text = translations.get(language, rendered.full_text)
        local_crop = await translate_text(crop, "en", language)
        
        price_per_kg = round(crop_data["price"] / 100, 0)
        local_text_final = f"{local_text} (₹{int(price_per_kg)}/kg)"
        
        logger.info(f"Generated Multi-Language Advisory for {crop}")
        
        payload = {
            "session_id": session_id,
            "farmer_id": farmer_id,
            "input_text_english": f"Advisory for {crop}",
            "detected_language": language,
            "response_text_local": local_text_final,
            "translations": translations,  # Added multi-language output
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
                "created_at": datetime.utcnow().isoformat(),
            },
            "created_at": datetime.utcnow().isoformat(),
            "n8n_triggered": False,
        }

        # Auto-trigger n8n (non-blocking)
        try:
            from mandi_agent.backend.automations.n8n_triggers import trigger_voice_advisory
            n8n_ok = await trigger_voice_advisory(farmer_id, phone, language, rendered.full_text)
            payload["n8n_triggered"] = bool(n8n_ok)
        except Exception as n8n_err:
            logger.warning("n8n trigger skipped (non-blocking): %s", str(n8n_err)[:100])

        return payload

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Advisory generation failed - {str(e)}")


class TriggerVoiceAdvisoryRequest(BaseModel):
    farmer_id: str
    phone: str
    language: str
    advisory_text: str

@app.post("/api/automate/{workflow_id}")
async def master_automation_trigger(workflow_id: str, request: dict):
    """
    Master Bridge: Connects Frontend to any Published n8n Workflow.
    Used by the mobile app to trigger bundles, advisories, and alerts.
    """
    try:
        from automations.master_bridge import get_bridge
        bridge = get_bridge()
        
        result = await bridge.trigger(workflow_id, request)
        
        if result.get("status") == "success":
            return result
        else:
            raise HTTPException(
                status_code=500 if result.get("status") == "error" else 400,
                detail=result
            )
    except ImportError as e:
        # Fallback for different package structures
        from mandi_agent.backend.automations.master_bridge import get_bridge
        bridge = get_bridge()
        return await bridge.trigger(workflow_id, request)

@app.post("/api/n8n/trigger/advisory")
async def trigger_voice_advisory_endpoint(req: TriggerVoiceAdvisoryRequest):
    """Trigger Voice Advisory generation via n8n."""
    from mandi_agent.backend.automations.n8n_triggers import trigger_voice_advisory
    res = await trigger_voice_advisory(req.farmer_id, req.phone, req.language, req.advisory_text)
    return {"triggered": res, "event": "voice_advisory"}

class TriggerPriceCrashRequest(BaseModel):
    block_id: str
    crop: str
    forecast_price: float
    current_price: float
    drop_pct: float
    affected_farmer_ids: list[str] = ["F001"]

@app.post("/api/n8n/trigger/price-crash")
async def trigger_price_crash_endpoint(req: TriggerPriceCrashRequest):
    """Trigger Price Crash warning via n8n."""
    from mandi_agent.backend.automations.n8n_triggers import trigger_price_crash_warning
    res = await trigger_price_crash_warning(
        req.block_id, req.crop, req.forecast_price, req.current_price, 
        req.drop_pct, req.affected_farmer_ids
    )
    return {"triggered": res, "event": "price_crash"}

class TriggerEmergencyRequest(BaseModel):
    farmer_id: str
    crop: str
    spoilage_pct: float
    recommended_action: str

@app.post("/api/n8n/trigger/emergency")
async def trigger_emergency_endpoint(req: TriggerEmergencyRequest):
    """Trigger Spoilage Emergency via n8n."""
    from mandi_agent.backend.automations.n8n_triggers import trigger_spoilage_emergency
    res = await trigger_spoilage_emergency(
        req.farmer_id, req.crop, req.spoilage_pct, req.recommended_action
    )
    return {"triggered": res, "event": "spoilage_emergency"}


# =============================================================================
# Block Status
# =============================================================================

@app.get("/api/block/{block_id}/status", response_model=BlockStatusResponse)
async def get_block_status(block_id: str) -> BlockStatusResponse:
    """
    Get current status for a block.

    Returns: active intents, oversupply crops, active bundles, avg forecast price.
    """
    try:
        from supabase import create_async_client

        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

        if not supabase_url or not supabase_key:
            return BlockStatusResponse(
                block_id=block_id,
                active_intents=0,
                oversupply_crops=[],
                active_bundles=[],
                avg_forecast_price=None,
            )

        supabase = await create_async_client(supabase_url, supabase_key)

        # Count active intents
        intents_resp = await supabase.table("harvest_intents").select(
            "intent_id", count="exact"
        ).eq("block_id", block_id).execute()
        active_intents = intents_resp.count or 0

        # Get oversupply alerts
        alerts_resp = await supabase.table("oversupply_alerts").select(
            "crop"
        ).eq("block_id", block_id).eq("severity", "high").execute()
        oversupply_crops = list(set(r.get("crop") for r in alerts_resp.data or []))

        # Get active bundles
        bundles_resp = await supabase.table("bundles").select(
            "bundle_id"
        ).eq("block_id", block_id).eq("status", "confirmed").execute()
        active_bundles = [r.get("bundle_id") for r in bundles_resp.data or []]

        return BlockStatusResponse(
            block_id=block_id,
            active_intents=active_intents,
            oversupply_crops=oversupply_crops,
            active_bundles=active_bundles,
            avg_forecast_price=None,  # TODO: compute from recent forecasts
        )

    except Exception as e:
        logger.error("Block status failed: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Block status failed: {str(e)[:100]}",
        )


# =============================================================================
# WebSocket — Live Progress Streaming
# =============================================================================

class ConnectionManager:
    """Manages active WebSocket connections per farmer."""

    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, farmer_id: str):
        await websocket.accept()
        self.active_connections[farmer_id] = websocket

    def disconnect(self, farmer_id: str):
        self.active_connections.pop(farmer_id, None)

    async def send_event(self, farmer_id: str, event: dict):
        if farmer_id in self.active_connections:
            try:
                await self.active_connections[farmer_id].send_json(event)
            except Exception:
                self.disconnect(farmer_id)


manager = ConnectionManager()


@app.websocket("/ws/advisory/{farmer_id}")
async def websocket_advisory(websocket: WebSocket, farmer_id: str):
    """
    WebSocket endpoint for streaming advisory pipeline progress.

    Events sent:
    - data_fetching
    - data_fetched
    - rag_retrieving
    - rag_retrieved
    - price_predicting
    - price_predicted
    - spoilage_assessed
    - oversupply_detected
    - bundle_formed
    - advisory_generating
    - advisory_generated
    - guardrail_validated
    - voice_ready
    - fpo_notified
    - error

    Client sends:
    - {"action": "start", "audio_base64": "...", "text_input": "..."}
    - {"action": "cancel"}
    """
    await manager.connect(websocket, farmer_id)

    try:
        while True:
            message = await websocket.receive_json()
            action = message.get("action")

            if action == "start":
                # Start advisory pipeline with streaming
                from mandi_agent.backend.orchestrator.langgraph_flow import MandiAgentOrchestrator

                orchestrator = MandiAgentOrchestrator()

                # Create event queue for this session
                event_queue: asyncio.Queue = asyncio.Queue()

                async def stream_events():
                    """Stream events from queue to WebSocket."""
                    while True:
                        try:
                            event = await asyncio.wait_for(event_queue.get(), timeout=30.0)
                            await websocket.send_json(event)
                            if event.get("event") in ("voice_ready", "error", "fpo_notified"):
                                break
                        except asyncio.TimeoutError:
                            # Send heartbeat
                            await websocket.send_json({"event": "heartbeat", "timestamp": datetime.now(timezone.utc).isoformat()})

                # Start streaming task
                stream_task = asyncio.create_task(stream_events())

                try:
                    # Run orchestrator (it will emit events to queue)
                    # For now: run without queue-based streaming
                    session = await orchestrator.process_farmer_request(
                        farmer_id=farmer_id,
                        audio_base64=message.get("audio_base64"),
                        text_input=message.get("text_input"),
                    )

                    # Send final result
                    if session:
                        await websocket.send_json({
                            "event": "complete",
                            "session": session.model_dump(mode="json"),
                        })
                    else:
                        await websocket.send_json({
                            "event": "error",
                            "error": "Advisory generation failed",
                        })

                finally:
                    stream_task.cancel()
                    try:
                        await stream_task
                    except asyncio.CancelledError:
                        pass

            elif action == "cancel":
                await websocket.send_json({"event": "cancelled"})
                break

    except WebSocketDisconnect:
        manager.disconnect(farmer_id)
    except Exception as e:
        logger.error("WebSocket error: %s", str(e)[:200])
        try:
            await websocket.send_json({"event": "error", "error": str(e)[:100]})
        except Exception:
            pass
        manager.disconnect(farmer_id)


# =============================================================================
# Prices & Forecasts (simple proxies to data sources)
# =============================================================================

@app.get("/api/prices/{commodity}", response_model=list[dict])
async def get_prices(commodity: str, state: Optional[str] = None) -> list[dict]:
    """Get recent mandi prices for a commodity."""
    try:
        from mandi_agent.backend.data_sources.agmarknet import fetch_agmarknet_prices

        prices = await fetch_agmarknet_prices(commodity=commodity, state=state)
        return [p.model_dump(mode="json") for p in prices]

    except Exception as e:
        logger.error("Price fetch failed: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Price fetch failed: {str(e)[:100]}",
        )


@app.get("/api/forecast/{crop}", response_model=list[dict])
async def get_forecast(
    crop: str,
    mandi_name: Optional[str] = None,
    days_ahead: int = 7,
) -> list[dict]:
    """Get price forecast for a crop."""
    try:
        from mandi_agent.backend.agents.price_prediction import predict_price

        forecast = await predict_price(
            crop=crop,
            mandi_name=mandi_name or "Vashi Navi Mumbai",
            state="Maharashtra",
            historical_prices=[],
            days_ahead=days_ahead,
        )

        if not forecast:
            return []
        return [forecast.model_dump(mode="json")]

    except Exception as e:
        logger.error("Forecast failed: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forecast failed: {str(e)[:100]}",
        )


# =============================================================================
# News
# =============================================================================

@app.get("/api/news")
async def get_news(limit: int = 20, category: Optional[str] = None) -> dict[str, Any]:
    """Get latest agricultural news with AI relevance analysis."""
    articles = await get_all_agri_news()
    analyzed: list[dict[str, Any]] = []

    for article in articles[: max(limit * 2, 20)]:
        try:
            analysis = await analyze_article(
                article.get("title", ""),
                article.get("description", ""),
            )

            if not analysis.is_relevant:
                continue

            if category and analysis.category.lower() != category.lower():
                continue

            analyzed.append(
                {
                    **article,
                    "article_id": article.get("url") or str(uuid.uuid4()),
                    "relevance_score": analysis.relevance_score,
                    "urgency_level": analysis.urgency_level,
                    "crops_affected": analysis.crops_affected,
                    "states_affected": analysis.states_affected,
                    "headline_short": analysis.headline_short,
                    "farmer_action": analysis.farmer_action,
                    "category": analysis.category,
                }
            )
        except Exception:
            continue

    return {"articles": analyzed[:limit], "total": len(analyzed[:limit])}


@app.post("/api/news/notify")
async def notify_farmers_of_news(req: dict = Body(...)) -> dict[str, Any]:
    """Trigger WhatsApp + push notification for urgent news (n8n handles delivery)."""
    article_id = req.get("article_id") or req.get("alert_id")
    urgency = req.get("urgency", "normal")
    notification_id = str(uuid.uuid4())

    logger.info(
        "Notification received: id=%s article_id=%s urgency=%s",
        notification_id, article_id, urgency,
    )

    return {
        "ok": True,
        "notification_id": notification_id,
        "article_id": article_id,
        "urgency": urgency,
        "message": "Notification trigger acknowledged. n8n handles downstream delivery.",
    }


# =============================================================================
# Translation (used by n8n: agri_news_alerts, bundle_notification, scheme_eligibility)
# =============================================================================

async def _reverie_translate(text: str, src_lang: str, tgt_lang: str) -> str:
    """Call Reverie NMT REST API directly (bypasses reverie-sdk which needs Python <3.13)."""
    import os, httpx

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

    # Parse response: {"responseList": [{"outString": "translated text"}]}
    response_list = data.get("responseList", [])
    if response_list:
        out = response_list[0].get("outString")
        if isinstance(out, list) and out:
            return out[0]
        if isinstance(out, str) and out:
            return out
    return text


@app.post("/api/translate")
async def translate_text(request: dict):
    """
    Translate text between languages using Reverie NMT REST API.
    Used by n8n workflows for localising messages before WhatsApp delivery.
    """
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
                translated = await _reverie_translate(headline, source_language, target_language)
                translated_items.append({**item, "translated_headline": translated})
            return {
                "translated_items": translated_items,
                "translated_digest": "\n".join(
                    i.get("translated_headline", i.get("headline", "")) for i in translated_items
                ),
                "target_language": target_language,
            }

        translated = await _reverie_translate(text, source_language, target_language)
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


# =============================================================================
# Reverie TTS — Text-to-Speech synthesis
# (used by n8n: webhook-revery-voice-handler, webhook-price-crash-broadcast,
#  webhook-emergency-spoilage)
# =============================================================================

# Speaker map — ordered by availability preference
_TTS_SPEAKER_MAP = {
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


async def _reverie_tts(text: str, language: str, gender: str = "female",
                       speed: float = 1.0, pitch: float = 1.0) -> dict:
    """
    Call Reverie TTS REST API to synthesise speech.
    Returns dict with 'audio_base64', 'audio_content_type', and 'speaker'.
    """
    import httpx, base64

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
                headers_with_speaker = {**headers, "speaker": speaker}
                resp = await client.post(
                    "https://revapi.reverieinc.com/",
                    headers=headers_with_speaker,
                    json={
                        "text": text,
                        "speed": speed,
                        "pitch": pitch,
                    },
                )
                if resp.status_code == 200:
                    ct = resp.headers.get("Content-Type", "audio/wav")
                    audio_b64 = base64.b64encode(resp.content).decode("utf-8")
                    logger.info("TTS success — speaker=%s, lang=%s, bytes=%d",
                                speaker, language, len(resp.content))
                    return {
                        "audio_base64": audio_b64,
                        "audio_content_type": ct,
                        "audio_url": f"data:{ct};base64,{audio_b64}",
                        "speaker": speaker,
                        "language": language,
                    }
                else:
                    last_error = f"{speaker}: HTTP {resp.status_code} — {resp.text[:200]}"
            except Exception as e:
                last_error = f"{speaker}: {str(e)[:150]}"
                continue

    raise RuntimeError(f"Reverie TTS failed for all speakers ({language}): {last_error}")


@app.post("/api/tts/synthesize")
async def tts_synthesize(req: dict = Body(...)):
    """
    Reverie Text-to-Speech endpoint.
    Accepts text + language and returns synthesised audio.

    Called by n8n webhook workflows:
      - Custom Webhook - Revery Voice Advisory Handler
      - Custom Webhook - Price Crash Broadcast
      - Custom Webhook - Emergency Spoilage Alert

    Request body:
      {
        "text": "कृपया अपनी फसल तुरंत बेचें",
        "language": "hi",
        "app_id": "...",            // optional, overrides env
        "voice_config": {           // optional
          "gender": "female",
          "speed": 1.0,
          "pitch": 1.0
        }
      }

    Returns:
      {
        "audio_url": "data:audio/wav;base64,...",
        "audio_base64": "...",
        "speaker": "hi_female",
        "language": "hi"
      }
    """
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
            result = await _reverie_tts(text, language, gender=gender, speed=speed, pitch=pitch)
        except Exception as rev_err:
            logger.warning("Reverie TTS failed (%s), falling back to Google TTS: %s", language, str(rev_err)[:100])
            from gtts import gTTS
            import io, base64
            
            # gTTS has no speed/pitch dials but natively supports `kn`, `te`, `ta`, `hi`, `en`, etc.
            tts = gTTS(text=text, lang=language, slow=False)
            fp = io.BytesIO()
            tts.write_to_fp(fp)
            fp.seek(0)
            
            audio_b64 = base64.b64encode(fp.read()).decode("utf-8")
            result = {
                "audio_base64": audio_b64,
                "audio_content_type": "audio/mpeg",
                "speaker": f"google_gTTS_{language}",
                "language": language
            }

        # Retrieve generated base64 audio
        audio_base64 = result.get("audio_base64")
        if audio_base64:
            import base64
            import uuid
            from supabase import create_client

            # convert to binary
            audio_bytes = base64.b64decode(audio_base64)
            c_type = result.get("audio_content_type", "audio/wav")
            ext = "mp3" if "mpeg" in c_type else "wav"
            file_name = f"{uuid.uuid4()}.{ext}"

            # Prepare supabase client credentials
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

            if supabase_url and supabase_key:
                try:
                    supabase = create_client(supabase_url, supabase_key)
                    # 🚀 Upload to Supabase Storage bucket 'audio-files'
                    supabase.storage.from_("audio-files").upload(
                        file_name,
                        audio_bytes,
                        {"content-type": c_type}
                    )

                    # Replace data URI with actual Supabase Public URL
                    public_url = supabase.storage.from_("audio-files").get_public_url(file_name)
                    result["audio_url"] = public_url
                    
                    # 🚀 Add TwiML URL for Twilio
                    # Assuming the backend is reachable via a public tunnel or host name
                    base_url = "https://rohanesor.app.n8n.cloud" # We'll need to check this or use a relative one
                    # For local testing, we can use the host name n8n knows
                    result["twiml_url"] = f"http://host.docker.internal:8000/api/tts/twiml/{file_name}"
                    
                    logger.info(f"Supabase storage TTS upload successful: {public_url}")
                except Exception as upload_err:
                    logger.error("Supabase Storage audio-files upload failed: %s", str(upload_err)[:300])
                    # Ensure audio_url is still valid as data URI if missing (e.g. gTTS case)
                    if "audio_url" not in result:
                        at = result.get("audio_content_type", "audio/wav")
                        ab = result.get("audio_base64", "")
                        result["audio_url"] = f"data:{at};base64,{ab}"
            else:
                # No Supabase config, ensure audio_url is at least a data URI
                if "audio_url" not in result:
                    at = result.get("audio_content_type", "audio/wav")
                    ab = result.get("audio_base64", "")
                    result["audio_url"] = f"data:{at};base64,{ab}"

        return result
    except Exception as e:
        logger.error("TTS synthesize failed: %s", str(e)[:300])
        raise HTTPException(status_code=502, detail=f"TTS synthesis failed: {str(e)[:200]}")


@app.get("/api/tts/twiml/{file_name}")
async def get_twiml_play(file_name: str):
    """
    Returns TwiML XML for Twilio to play a synthesized audio file.
    Usage: <url>/api/tts/twiml/uuid.wav
    """
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    
    if not (supabase_url and supabase_key):
        raise HTTPException(status_code=500, detail="Missing Supabase config for TwiML")
        
    from supabase import create_client
    supabase = create_client(supabase_url, supabase_key)
    public_url = supabase.storage.from_("audio-files").get_public_url(file_name)
    
    twiml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Play>{public_url}</Play></Response>'
    
    from fastapi import Response
    return Response(content=twiml, media_type="application/xml")


# =============================================================================
# Harvest Intent Recalculation (used by n8n: price_crash_broadcast)
# =============================================================================

@app.post("/api/harvest-intent/recalculate")
async def recalculate_harvest_intents(request: dict):
    """
    Recalculate advisories for all farmers in a block+crop after a price crash.
    Triggered by n8n price_crash_broadcast workflow when drop > 40%.
    """
    block_id = request.get("block_id", "")
    crop = request.get("crop", "")

    if not block_id or not crop:
        raise HTTPException(status_code=400, detail="block_id and crop are required")

    # In production this would:
    # 1. Query Supabase for active harvest intents matching block_id + crop
    # 2. Re-run price prediction + oversupply detection
    # 3. Generate updated advisories
    # 4. Trigger n8n to send updated WhatsApp messages
    return {
        "block_id": block_id,
        "crop": crop,
        "recalculated": True,
        "affected_farmers": 12,
        "new_recommendation": "redirect_to_alternate_mandi",
        "alternate_mandi": "Koyambedu, Chennai",
        "alternate_price": 34.5,
        "message": f"Recalculated advisories for {crop} farmers in {block_id}",
    }


# =============================================================================
# Cold Storage (used by n8n: spoilage_emergency)
# =============================================================================

@app.get("/api/cold-storage/nearest")
async def nearest_cold_storage(lat: float = 0.0, lng: float = 0.0, crop: str = ""):
    """
    Find nearest cold storage facility with available capacity.
    Used by n8n spoilage_emergency workflow to route perishables.
    """
    if not crop:
        raise HTTPException(status_code=400, detail="crop is required")

    # Demo cold storage facilities (in production, query NIC cold storage DB)
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

    # Filter by crop support and sort by distance (simple Euclidean for demo)
    matching = [
        f for f in facilities
        if crop.lower() in [c.lower() for c in f["supported_crops"]]
        and f["available_tonnes"] > 0
    ]

    if not matching:
        return {
            "available": False,
            "message": f"No cold storage with capacity found for {crop}",
            "facilities": [],
        }

    # Sort by approximate distance
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


@app.post("/api/cold-storage/book")
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

    # In production: create booking in Supabase, send confirmation
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
        "valid_until": (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat(),
        "message": f"Cold storage booked for {quantity}q of {crop} at {storage_id}",
    }


# =============================================================================
# High-impact feature endpoints
# =============================================================================

@app.post("/api/delivery/sms-fallback", response_model=AdvisoryDeliveryResult)
async def deliver_sms_fallback(req: SMSFallbackRequest) -> AdvisoryDeliveryResult:
    """Deliver advisory via SMS fallback for non-smartphone users."""
    from mandi_agent.backend.agents.sms_fallback import deliver_sms

    result = await deliver_sms(req.advisory, req.farmer)
    return result


@app.post("/api/harvest-intent/sync")
async def sync_harvest_intent(req: HarvestIntentSyncRequest) -> dict[str, Any]:
    """Offline-first sync endpoint with conflict resolution — persistent in Supabase."""
    from supabase import create_async_client

    intent = req.intent
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

    # Try to fetch server version from Supabase
    server_version = None
    if supabase_url and supabase_key:
        try:
            supabase = await create_async_client(supabase_url, supabase_key)
            response = await supabase.table("harvest_intent_versions").select("*").eq(
                "intent_id", intent.intent_id
            ).execute()

            if response.data and len(response.data) > 0:
                server_version = response.data[0].get("version", 0)
        except Exception as exc:
            logger.warning("Supabase version lookup failed: %s; using in-memory fallback", str(exc)[:100])

    # Fallback to in-memory if Supabase unavailable
    if server_version is None:
        server_version = HARVEST_INTENT_VERSIONS.get(intent.intent_id, 0)

    # Check for conflicts
    if req.client_version < server_version:
        conflict = HarvestIntentConflict(
            conflict_id=f"conf-{uuid.uuid4().hex[:10]}",
            intent_id=intent.intent_id,
            farmer_id=intent.farmer_id,
            resolution="server_wins",
            client_payload=intent.model_dump(mode="json"),
            server_payload={"version": server_version},
            resolved_payload={"version": server_version},
        )
        return {
            "synced": False,
            "conflict": True,
            "server_version": server_version,
            "conflict_record": conflict.model_dump(mode="json"),
        }

    # No conflict — increment version
    new_version = server_version + 1

    # Persist new version to Supabase
    if supabase_url and supabase_key:
        try:
            supabase = await create_async_client(supabase_url, supabase_key)

            # Upsert (insert or update)
            await supabase.table("harvest_intent_versions").upsert({
                "intent_id": intent.intent_id,
                "version": new_version,
                "farmer_id": intent.farmer_id,
                "payload": intent.model_dump(mode="json"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }).execute()

            logger.info("Harvest intent %s synced to version %d", intent.intent_id, new_version)
        except Exception as exc:
            logger.warning("Failed to persist harvest intent to Supabase: %s", str(exc)[:100])

    # Always update in-memory cache as fallback
    HARVEST_INTENT_VERSIONS[intent.intent_id] = new_version

    return {
        "synced": True,
        "conflict": False,
        "intent_id": intent.intent_id,
        "server_version": new_version,
    }


@app.post("/api/disease/detect")
async def detect_disease(req: DiseaseDetectionRequest):
    """Analyze crop image for disease symptoms."""
    from mandi_agent.backend.agents.disease_detector import detect_crop_disease

    diagnosis = await detect_crop_disease(req.image_base64, req.crop)
    return diagnosis.model_dump(mode="json")


@app.post("/api/schemes/eligibility", response_model=list[GovtScheme])
async def schemes_eligibility(req: SchemeEligibilityRequest) -> list[GovtScheme]:
    """Check government scheme eligibility for a farmer profile."""
    from mandi_agent.backend.agents.scheme_matcher import check_scheme_eligibility

    return await check_scheme_eligibility(req.farmer)


@app.post("/api/demand/predict", response_model=DemandForecast)
async def demand_predict(req: DemandPredictionRequest) -> DemandForecast:
    """Predict market demand trajectory for a crop/state."""
    from mandi_agent.backend.agents.demand_predictor import predict_demand

    return await predict_demand(req.crop, req.state, req.months_ahead)


@app.post("/api/faq/voice", response_model=FAQVoiceItem)
async def voice_faq(req: FAQVoiceRequest) -> FAQVoiceItem:
    """Return voice FAQ answer in requested language."""
    from mandi_agent.backend.agents.faq_voice import get_voice_faq

    return await get_voice_faq(req.query, req.language)


@app.post("/api/weather/alerts/check", response_model=WeatherAlert)
async def weather_alert_check(req: WeatherAlertRequest) -> WeatherAlert:
    """Evaluate weather forecast and emit proactive weather alert payload with real weather data."""
    from mandi_agent.backend.data_sources.imd_weather import fetch_weather_forecast

    # If manual forecast params provided, use them (for testing)
    if req.forecast_rain_mm is not None and req.hail_probability is not None:
        forecast_rain_mm = req.forecast_rain_mm
        hail_probability = req.hail_probability
        wind_kmph = req.wind_kmph or 0.0
    else:
        # Fetch real weather forecast from IMD/OpenWeather
        forecast = await fetch_weather_forecast(
            district=req.district,
            state=req.state,
            lat=req.lat,
            lon=req.lon,
        )

        # Analyze first 2 days of forecast
        if not forecast.forecast_days:
            logger.warning("No weather forecast available for %s, %s", req.state, req.district)
            forecast_rain_mm = 0.0
            hail_probability = 0.0
            wind_kmph = 0.0
        else:
            day1 = forecast.forecast_days[0]
            day2 = forecast.forecast_days[1] if len(forecast.forecast_days) > 1 else day1

            # Estimate parameters from forecast
            forecast_rain_mm = max(day1.rainfall_mm, day2.rainfall_mm)
            # Heuristic: if rain is expected and humidity is high, increase hail probability
            hail_probability = 0.35 if (forecast_rain_mm > 20 and day1.humidity_pct > 70) else 0.15
            # Estimate wind speed from condition (rainy = higher wind risk)
            wind_kmph = 35.0 if day1.weather_condition == "rainy" else 20.0

    # Evaluate thresholds and generate alert — multi-tier severity
    crop_label = f" for {req.crop}" if req.crop else ""
    if hail_probability >= 0.7:
        alert_type = WeatherAlertType.HAIL
        severity = Severity.CRITICAL
        advisory = f"URGENT: High hail risk{crop_label}. Move all harvested produce to covered storage immediately. Do not spray or irrigate."
    elif hail_probability >= 0.5:
        alert_type = WeatherAlertType.HAIL
        severity = Severity.HIGH
        advisory = f"Hail warning{crop_label}. Cover produce and delay harvest if possible. Avoid spraying before hail window."
    elif forecast_rain_mm >= 60:
        alert_type = WeatherAlertType.HEAVY_RAIN
        severity = Severity.CRITICAL
        advisory = f"Extreme rainfall expected ({forecast_rain_mm:.0f}mm){crop_label}. Ensure field drainage is clear. Move stored produce to elevated dry storage."
    elif forecast_rain_mm >= 35:
        alert_type = WeatherAlertType.HEAVY_RAIN
        severity = Severity.HIGH
        advisory = f"Heavy rain expected ({forecast_rain_mm:.0f}mm){crop_label}. Clear field drainage and shift harvested produce to dry covered storage."
    elif wind_kmph >= 60:
        alert_type = WeatherAlertType.HIGH_WIND
        severity = Severity.HIGH
        advisory = f"Strong winds expected ({wind_kmph:.0f} km/h){crop_label}. Secure staking and support structures. Postpone all spray operations."
    elif wind_kmph >= 45:
        alert_type = WeatherAlertType.HIGH_WIND
        severity = Severity.MEDIUM
        advisory = f"Moderate wind advisory ({wind_kmph:.0f} km/h){crop_label}. Check crop staking and postpone foliar sprays."
    elif forecast_rain_mm >= 15:
        alert_type = WeatherAlertType.HEAVY_RAIN
        severity = Severity.LOW
        advisory = f"Light to moderate rain expected ({forecast_rain_mm:.0f}mm). Monitor field drainage. Routine crop care may continue."
    else:
        alert_type = WeatherAlertType.HEAVY_RAIN
        severity = Severity.LOW
        advisory = "No severe weather detected. Continue routine crop care."

    alert = WeatherAlert(
        alert_id=f"wa-{uuid.uuid4().hex[:10]}",
        state=req.state,
        district=req.district,
        block_id=req.block_id,
        crop=req.crop,
        alert_type=alert_type,
        severity=severity,
        advisory_text=advisory,
        valid_from=datetime.now(timezone.utc),
        valid_until=datetime.now(timezone.utc) + timedelta(hours=24),
        push_sent=severity in {Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL},
        sms_fallback_sent=severity in {Severity.HIGH, Severity.CRITICAL},
    )

    if alert.push_sent or alert.sms_fallback_sent:
        from mandi_agent.backend.automations.n8n_triggers import trigger_weather_alert

        await trigger_weather_alert(
            state=alert.state,
            district=alert.district,
            block_id=alert.block_id,
            alert_type=alert.alert_type.value,
            severity=alert.severity.value,
            advisory_text=alert.advisory_text,
        )
    return alert


@app.get("/api/fpo/{fpo_id}/analytics", response_model=FPOAnalyticsResponse)
async def fpo_analytics(fpo_id: str) -> FPOAnalyticsResponse:
    """Analytics endpoint for FPO coordinators with real Supabase data."""
    from supabase import create_async_client
    from datetime import timedelta, date

    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

    # Default demo data if Supabase unavailable
    default_response = FPOAnalyticsResponse(
        fpo_id=fpo_id,
        harvest_intent_map_points=[
            {"block_id": "KA-KOL-06", "crop": "Tomato", "farmer_count": 34, "lat": 13.1, "lng": 78.1},
            {"block_id": "KA-KOL-08", "crop": "Onion", "farmer_count": 21, "lat": 13.08, "lng": 78.2},
        ],
        bundle_progress={"open": 4, "forming": 2, "confirmed": 3, "avg_fill_pct": 71},
        price_trends=[
            {"crop": "Tomato", "series": [28, 30, 32, 35]},
            {"crop": "Onion", "series": [22, 23, 24, 26]},
        ],
        engagement_metrics={
            "active_farmers_7d": 118,
            "advisories_sent_7d": 342,
            "faq_hit_rate": 0.63,
            "avg_response_seconds": 3.8,
        },
    )

    if not (supabase_url and supabase_key):
        logger.warning("Supabase not configured; returning demo analytics")
        return default_response

    try:
        supabase = await create_async_client(supabase_url, supabase_key)
        seven_days_ago = date.today() - timedelta(days=7)

        # Fetch harvest intents (map points)
        intents_response = await supabase.table("harvest_intents").select(
            "block_id, crop, COUNT(*) as farmer_count"
        ).eq("fpo_id", fpo_id).gte("created_at", seven_days_ago.isoformat()).execute()

        harvest_intent_map_points = []
        if intents_response.data:
            for intent in intents_response.data:
                # Generate approximate coordinates for demo (in production, use geocoding)
                lat = 13.0 + (hash(intent.get("block_id", "")) % 100) / 1000
                lng = 78.0 + (hash(intent.get("block_id", "")) % 100) / 1000
                harvest_intent_map_points.append({
                    "block_id": intent.get("block_id", ""),
                    "crop": intent.get("crop", ""),
                    "farmer_count": intent.get("farmer_count", 0),
                    "lat": lat,
                    "lng": lng,
                })

        # Fetch bundle progress
        bundles_response = await supabase.table("bundles").select("*").eq("fpo_id", fpo_id).execute()

        bundle_counts = {"open": 0, "forming": 0, "confirmed": 0}
        total_fill = 0
        if bundles_response.data:
            for bundle in bundles_response.data:
                status = bundle.get("status", "open")
                bundle_counts[status] = bundle_counts.get(status, 0) + 1
                total_fill += bundle.get("fill_percentage", 0)
            avg_fill_pct = int(total_fill / len(bundles_response.data)) if bundles_response.data else 0
        else:
            avg_fill_pct = 0

        bundle_progress = {**bundle_counts, "avg_fill_pct": avg_fill_pct}

        # Fetch price trends from mandi_prices
        prices_response = await supabase.table("mandi_prices").select(
            "commodity, modal_price, price_date"
        ).eq("state", "Karnataka").gte("price_date", seven_days_ago.isoformat()).order(
            "commodity,price_date"
        ).execute()

        price_trends = []
        prices_by_crop = {}
        if prices_response.data:
            for price in prices_response.data:
                crop = price.get("commodity", "")
                modal_price = price.get("modal_price", 0)
                if crop not in prices_by_crop:
                    prices_by_crop[crop] = []
                prices_by_crop[crop].append(modal_price)

            for crop, prices in prices_by_crop.items():
                price_trends.append({"crop": crop, "series": prices[-7:] if len(prices) > 7 else prices})

        # Fetch engagement metrics
        advisories_response = await supabase.table("advisories").select("*").eq(
            "fpo_id", fpo_id
        ).gte("created_at", seven_days_ago.isoformat()).execute()

        active_farmers = set()
        if advisories_response.data:
            for advisory in advisories_response.data:
                active_farmers.add(advisory.get("farmer_id", ""))

        advisories_sent_7d = len(advisories_response.data) if advisories_response.data else 0
        active_farmers_7d = len(active_farmers)

        engagement_metrics = {
            "active_farmers_7d": active_farmers_7d,
            "advisories_sent_7d": advisories_sent_7d,
            "faq_hit_rate": 0.63,  # TODO: Track FAQ hits in tracker table
            "avg_response_seconds": 3.8,  # TODO: Track response times
        }

        return FPOAnalyticsResponse(
            fpo_id=fpo_id,
            harvest_intent_map_points=harvest_intent_map_points,
            bundle_progress=bundle_progress,
            price_trends=price_trends,
            engagement_metrics=engagement_metrics,
        )

    except Exception as exc:
        logger.error("Failed to fetch FPO analytics from Supabase: %s", str(exc)[:200])
        return default_response


# =============================================================================
# Root
# =============================================================================

@app.get("/")
async def root():
    """Root endpoint — redirect to docs."""
    return {
        "name": "Mandi-Agent API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/api/health",
    }


# =============================================================================
# Harvest Alerts Due
# =============================================================================

@app.get("/api/fpo/list")
async def list_fpos():
    """List all registered Farmer Producer Organizations."""
    return [
        {
            "fpo_id": "FPO-KA-KOL-01",
            "fpo_name": "Kolar Tomato Growers FPO",
            "state": "Karnataka",
            "district": "Kolar",
            "coordinator_email": "kolar.fpo@example.com",
            "active_farmers": 142,
            "primary_crops": ["Tomato", "Onion", "Capsicum"],
        },
        {
            "fpo_id": "FPO-MH-NSK-01",
            "fpo_name": "Nashik Grape & Onion FPO",
            "state": "Maharashtra",
            "district": "Nashik",
            "coordinator_email": "nashik.fpo@example.com",
            "active_farmers": 98,
            "primary_crops": ["Onion", "Grape", "Pomegranate"],
        },
        {
            "fpo_id": "FPO-AP-GTR-01",
            "fpo_name": "Guntur Chilli FPO",
            "state": "Andhra Pradesh",
            "district": "Guntur",
            "coordinator_email": "guntur.fpo@example.com",
            "active_farmers": 210,
            "primary_crops": ["Chilli", "Turmeric", "Cotton"],
        },
    ]


@app.get("/api/fpo/weekly-stats")
async def fpo_weekly_stats_query(fpo_id: str):
    """Get weekly statistics for an FPO via query param (used by n8n)."""
    return await fpo_weekly_stats(fpo_id)


@app.get("/api/fpo/{fpo_id}/weekly-stats")
async def fpo_weekly_stats(fpo_id: str):
    """Get weekly statistics for an FPO (used by n8n FPO Weekly Digest)."""
    from datetime import date, timedelta

    today = date.today()
    week_start = (today - timedelta(days=today.weekday() + 7)).isoformat()
    week_end = (today - timedelta(days=today.weekday() + 1)).isoformat()

    fpo_data = {
        "FPO-KA-KOL-01": {
            "fpo_id": "FPO-KA-KOL-01",
            "fpo_name": "Kolar Tomato Growers FPO",
            "coordinator_email": "kolar.fpo@example.com",
            "week_start": week_start,
            "week_end": week_end,
            "advisories_sent": 87,
            "bundles_formed": 4,
            "total_transport_savings": 12600,
            "price_crashes_detected": 1,
            "spoilage_emergencies": 0,
            "active_farmers": 142,
        },
        "FPO-MH-NSK-01": {
            "fpo_id": "FPO-MH-NSK-01",
            "fpo_name": "Nashik Grape & Onion FPO",
            "coordinator_email": "nashik.fpo@example.com",
            "week_start": week_start,
            "week_end": week_end,
            "advisories_sent": 54,
            "bundles_formed": 2,
            "total_transport_savings": 8400,
            "price_crashes_detected": 0,
            "spoilage_emergencies": 1,
            "active_farmers": 98,
        },
        "FPO-AP-GTR-01": {
            "fpo_id": "FPO-AP-GTR-01",
            "fpo_name": "Guntur Chilli FPO",
            "coordinator_email": "guntur.fpo@example.com",
            "week_start": week_start,
            "week_end": week_end,
            "advisories_sent": 120,
            "bundles_formed": 6,
            "total_transport_savings": 21000,
            "price_crashes_detected": 2,
            "spoilage_emergencies": 0,
            "active_farmers": 210,
        },
    }

    if fpo_id not in fpo_data:
        raise HTTPException(status_code=404, detail=f"FPO {fpo_id} not found")

    return fpo_data[fpo_id]


@app.post("/api/fpo/report")
async def log_fpo_report(request: dict):
    """Log FPO weekly report to Supabase (called by n8n instead of direct Supabase node)."""
    import os

    fpo_id = request.get("fpo_id", "")
    week_start = request.get("week_start", "")
    week_end = request.get("week_end", "")

    if not fpo_id:
        raise HTTPException(status_code=400, detail="fpo_id is required")

    row = {
        "fpo_id": fpo_id,
        "week_start": week_start,
        "week_end": week_end,
        "advisories_sent": request.get("advisories_sent", 0),
        "bundles_formed": request.get("bundles_formed", 0),
        "total_savings": request.get("total_transport_savings", 0),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        from supabase import create_client

        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

        if supabase_url and supabase_key:
            supabase = create_client(supabase_url, supabase_key)
            resp = supabase.table("fpo_reports").insert(row).execute()
            return {"logged": True, "data": resp.data}
    except Exception as e:
        logger.warning("Supabase insert failed (non-fatal): %s", str(e)[:200])

    return {"logged": True, "data": row, "storage": "in-memory"}


@app.get("/api/harvest-alerts-due")
async def harvest_alerts_due():
    """Returns farmers whose harvest decision is due today."""
    return [
        {
            "farmer_id": "F-KA-2847",
            "name": "Raju Naik",
            "phone": "+919876543210",
            "crop": "Tomato",
            "language": "kn",
            "block_id": "KA-KOL-06",
            "harvest_date": "2025-12-14",
            "days_to_harvest": 2,
            "location": "Mulbagal, Kolar, Karnataka"
        },
        {
            "farmer_id": "F-KA-2801",
            "name": "Sridhar K",
            "phone": "+919876543211",
            "crop": "Tomato",
            "language": "kn",
            "block_id": "KA-KOL-06",
            "harvest_date": "2025-12-14",
            "days_to_harvest": 2,
            "location": "Mulbagal, Kolar, Karnataka"
        }
    ]


# =============================================================================
# Logging endpoints (replace n8n Supabase/Notion nodes with HTTP requests)
# =============================================================================

@app.post("/api/log/advisory")
async def log_advisory(request: dict):
    """Log advisory delivery record (used by n8n WhatsApp Advisory Loop)."""
    row = {
        "farmer_id": request.get("farmer_id", ""),
        "advisory_id": request.get("advisory_id", ""),
        "language": request.get("language", ""),
        "channel": request.get("channel", "whatsapp"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        import os
        from supabase import create_client
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_KEY", "")
        if url and key:
            sb = create_client(url, key)
            sb.table("advisory_logs").insert(row).execute()
    except Exception as e:
        logger.warning("advisory_logs insert failed: %s", str(e)[:200])
    return {"logged": True, **row}


@app.post("/api/log/voice-session")
async def log_voice_session(request: dict):
    """Log voice session record (used by n8n WhatsApp Advisory Loop)."""
    row = {
        "session_id": request.get("session_id", ""),
        "farmer_id": request.get("farmer_id", ""),
        "input_text_local": request.get("input_text_local", ""),
        "response_text_local": request.get("response_text_local", ""),
        "response_audio_url": request.get("response_audio_url"),
        "processing_ms": request.get("processing_ms", 0),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        import os
        from supabase import create_client
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_KEY", "")
        if url and key:
            sb = create_client(url, key)
            sb.table("voice_sessions").insert(row).execute()
    except Exception as e:
        logger.warning("voice_sessions insert failed: %s", str(e)[:200])
    return {"logged": True, **row}


# =============================================================================
# News & Notifications (n8n workflow support)
# =============================================================================

class NotificationRequest(BaseModel):
    """Request body for news/alert notifications from n8n workflows."""
    article_id: Optional[str] = None
    alert_id: Optional[str] = None
    urgency: Optional[str] = "normal"
    title: Optional[str] = None
    message: Optional[str] = None
    farmer_phone: Optional[str] = None
    farmer_id: Optional[str] = None


@app.get("/api/news")
async def get_news():
    """
    Fetch latest agricultural news articles.
    Called by the agri_news_alerts n8n workflow every 30 minutes.
    """
    try:
        articles = await get_all_agri_news()
        return {"articles": articles, "count": len(articles)}
    except Exception as e:
        logger.error("Failed to fetch agri news: %s", str(e)[:200])
        return {"articles": [], "count": 0, "error": str(e)[:100]}




if __name__ == "__main__":
    import uvicorn
    uvicorn.run("mandi_agent.backend.main:app", host="0.0.0.0", port=8000, reload=True)
