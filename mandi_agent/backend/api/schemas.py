"""
Pydantic request/response schemas used across API routes.

Keeping them in one place avoids circular imports between route modules.
"""

from typing import Any, Optional
from pydantic import BaseModel, Field

from mandi_agent.backend.models.schemas import (
    FarmerAdvisory,
    FarmerProfile,
    HarvestIntent,
    VoiceSession,
)


# ---------------------------------------------------------------------------
# Auth / Registration
# ---------------------------------------------------------------------------

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


class FarmerRegistrationRequest(BaseModel):
    farmer: FarmerProfile


class FarmerRegistrationResponse(BaseModel):
    farmer_id: str
    registered: bool
    whatsapp_verified: bool


class AdvisoryHistoryResponse(BaseModel):
    farmer_id: str
    advisories: list[FarmerAdvisory]


# ---------------------------------------------------------------------------
# Advisory
# ---------------------------------------------------------------------------

class AdvisoryRequest(BaseModel):
    farmer_id: str
    audio_base64: Optional[str] = Field(None, description="Base64-encoded audio input")
    text_input: Optional[str] = Field(None, description="Text input if no audio")


class AdvisoryResponse(BaseModel):
    session: VoiceSession
    processing_ms: int


class TriggerVoiceAdvisoryRequest(BaseModel):
    farmer_id: str
    phone: str
    language: str
    advisory_text: str


# ---------------------------------------------------------------------------
# Harvest Intent
# ---------------------------------------------------------------------------

class HarvestIntentRequest(BaseModel):
    intent: HarvestIntent


class HarvestIntentResponse(BaseModel):
    intent_id: str
    received: bool
    next_step: str


class HarvestIntentSyncRequest(BaseModel):
    intent: HarvestIntent
    client_version: int = 1


# ---------------------------------------------------------------------------
# Block
# ---------------------------------------------------------------------------

class BlockStatusResponse(BaseModel):
    block_id: str
    active_intents: int
    oversupply_crops: list[str]
    active_bundles: list[str]
    avg_forecast_price: Optional[float]


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    agents: dict[str, str]
    rag: str
    voice: str
    n8n: str


# ---------------------------------------------------------------------------
# Misc agents
# ---------------------------------------------------------------------------

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
    forecast_rain_mm: Optional[float] = None
    hail_probability: Optional[float] = None
    wind_kmph: Optional[float] = None


class FPOAnalyticsResponse(BaseModel):
    fpo_id: str
    harvest_intent_map_points: list[dict[str, Any]]
    bundle_progress: dict[str, Any]
    price_trends: list[dict[str, Any]]
    engagement_metrics: dict[str, Any]


class SMSFallbackRequest(BaseModel):
    advisory: FarmerAdvisory
    farmer: FarmerProfile


class NotificationRequest(BaseModel):
    article_id: Optional[str] = None
    alert_id: Optional[str] = None
    urgency: Optional[str] = "normal"
    title: Optional[str] = None
    message: Optional[str] = None
    farmer_phone: Optional[str] = None
    farmer_id: Optional[str] = None


# ---------------------------------------------------------------------------
# n8n / Automation triggers
# ---------------------------------------------------------------------------

class TriggerPriceCrashRequest(BaseModel):
    block_id: str
    crop: str
    forecast_price: float
    current_price: float
    drop_pct: float
    affected_farmer_ids: list[str] = ["F001"]


class TriggerEmergencyRequest(BaseModel):
    farmer_id: str
    crop: str
    spoilage_pct: float
    recommended_action: str
