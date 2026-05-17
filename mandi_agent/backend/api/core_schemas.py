"""
Pydantic v2 schemas for Mandi-Agent platform.
All agent outputs must be validated Pydantic models.
"""

from datetime import UTC, date, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Decision(StrEnum):
    """Farmer advisory decisions."""

    HARVEST_NOW = "harvest_now"
    HOLD_3_DAYS = "hold_3_days"
    HOLD_7_DAYS = "hold_7_days"
    REDIRECT_MANDI = "redirect_mandi"


class PriceDirection(StrEnum):
    """Price trend direction."""

    RISING = "rising"
    FALLING = "falling"
    STABLE = "stable"


class RiskLevel(StrEnum):
    """Spoilage risk levels."""

    SAFE = "safe"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class Severity(StrEnum):
    """Alert severity levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class BundleStatus(StrEnum):
    """Virtual Cooperative bundle status."""

    NEGOTIATING = "negotiating"
    CONFIRMED = "confirmed"
    DISPATCHED = "dispatched"
    COMPLETED = "completed"


class GuardrailStatus(StrEnum):
    """Guardrail check statuses."""

    APPROVED = "approved"
    REVIEW = "review"
    FLAGGED = "flagged"


class Recommendation(StrEnum):
    """Guardrail recommendation outcomes."""

    APPROVE = "approve"
    REVIEW = "review"
    FLAG = "flag"


class DeliveryChannel(StrEnum):
    """Supported outbound advisory channels."""

    WHATSAPP_VOICE = "whatsapp_voice"
    WHATSAPP_TEXT = "whatsapp_text"
    SMS = "sms"


class WeatherAlertType(StrEnum):
    """Severe weather alert categories."""

    HEAVY_RAIN = "heavy_rain"
    HAIL = "hail"
    HIGH_WIND = "high_wind"


class DemandLevel(StrEnum):
    """Demand forecast buckets."""

    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class FarmerProfile(BaseModel):
    """
    Farmer profile with geolocation and FPO membership.
    Block ID is a 6km radius identifier for clustering farmers.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    farmer_id: str = Field(..., min_length=1, description="Unique farmer identifier")
    name: str = Field(..., min_length=1, description="Farmer full name")
    phone: str = Field(..., pattern=r"^\+?91[6-9]\d{9}$", description="WhatsApp number with country code")
    language: str = Field(..., min_length=2, max_length=3, description="ISO 639 code: kn, ta, te, hi, mr")
    location: str = Field(..., min_length=1, description="Village/taluka location string")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="GPS latitude")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="GPS longitude")
    block_id: str = Field(..., min_length=1, description="6km radius block identifier")
    fpo_id: str | None = Field(None, description="Farmer Producer Organization ID")
    crops: list[str] = Field(..., min_length=1, description="List of crops cultivated")
    landholding_acres: float = Field(..., gt=0, description="Land size in acres")
    has_smartphone: bool = Field(default=True, description="Whether farmer has smartphone app access")
    sms_opt_in: bool = Field(default=True, description="Consent for SMS advisory fallback")
    category: str | None = Field(None, description="Farmer category (general/sc/st/obc)")
    irrigation_type: str | None = Field(None, description="Irrigation type: rainfed/canal/drip/borewell")
    registered_at: datetime = Field(default_factory=lambda: datetime.now(UTC), description="Registration timestamp")

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        """Normalize language code to lowercase."""
        return v.lower()


class HarvestIntent(BaseModel):
    """
    Farmer's intent to harvest and sell produce.
    Submitted before harvest for planning Virtual Cooperatives.
    """

    intent_id: str = Field(..., min_length=1, description="Unique intent identifier")
    farmer_id: str = Field(..., min_length=1, description="Reference to farmer_id")
    crop: str = Field(..., min_length=1, description="Crop name")
    quantity_quintals: float = Field(..., gt=0, description="Expected quantity in quintals")
    expected_harvest_date: date = Field(..., description="Expected harvest date")
    current_growth_stage: str = Field(..., description="Growth stage: flowering, fruiting, mature, etc.")
    block_id: str = Field(..., min_length=1, description="Block identifier")
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(UTC), description="Submission timestamp")


class MandiPrice(BaseModel):
    """
    Daily mandi (market) price data from Agmarknet or eNAM.
    Modal price is the most common price — represents market consensus.
    """

    mandi_name: str = Field(..., min_length=1, description="Mandi name")
    state: str = Field(..., min_length=1, description="State name")
    commodity: str = Field(..., min_length=1, description="Crop commodity name")
    variety: str = Field(..., min_length=1, description="Variety name")
    min_price: float = Field(..., ge=0, description="Minimum traded price (INR/quintal)")
    max_price: float = Field(..., ge=0, description="Maximum traded price (INR/quintal)")
    modal_price: float = Field(..., ge=0, description="Modal price — most common price (INR/quintal)")
    arrival_tonnes: float | None = Field(None, ge=0, description="Arrival quantity in tonnes")
    price_date: date = Field(..., description="Price date")
    source: str = Field(..., pattern="^(agmarknet|enam)$", description="Data source")

    @field_validator("modal_price")
    @classmethod
    def validate_price_range(cls, v: float, info) -> float:
        """Ensure modal price is between min and max."""
        # Note: cross-field validation happens in model_validator below
        return v

    @model_validator(mode="after")
    def validate_price_consistency(self) -> "MandiPrice":
        """Ensure min <= modal <= max prices."""
        if not (self.min_price <= self.modal_price <= self.max_price):
            raise ValueError("modal_price must be between min_price and max_price")
        return self


class PriceForecast(BaseModel):
    """
    Gemini-generated price forecast with confidence scoring.
    Uses historical patterns + weather + supply data.
    """

    crop: str = Field(..., min_length=1, description="Crop name")
    mandi_name: str = Field(..., min_length=1, description="Target mandi")
    forecast_date: date = Field(..., description="Date of forecast")
    predicted_price: float = Field(..., ge=0, description="Predicted price (INR/quintal)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model confidence 0.0-1.0")
    price_direction: PriceDirection = Field(..., description="Price trend direction")
    reasoning: str = Field(..., min_length=10, description="Explanation for forecast")
    model_used: str = Field(..., min_length=1, description="Model identifier")
    days_ahead: int = Field(..., ge=1, le=30, description="Forecast horizon in days")


class SpoilageRisk(BaseModel):
    """
    Perishable crop spoilage risk calculation.
    Based on transit time, ambient temperature, and crop-specific shelf life.
    """

    farmer_id: str = Field(..., min_length=1, description="Farmer identifier")
    crop: str = Field(..., min_length=1, description="Crop name")
    harvest_date: date = Field(..., description="Expected harvest date")
    transit_hours: float = Field(..., ge=0, description="Transit time to mandi in hours")
    ambient_temp_celsius: float = Field(..., ge=-20.0, le=60.0, description="Expected ambient temperature")
    shelf_life_hours: float = Field(..., gt=0, description="Crop-specific shelf life at optimal temp")
    spoilage_probability: float = Field(..., ge=0.0, le=1.0, description="Calculated spoilage risk 0.0-1.0")
    risk_level: RiskLevel = Field(..., description="Categorized risk level")
    recommendation: str = Field(..., min_length=1, description="Action recommendation")


class BlockOversupplyAlert(BaseModel):
    """
    Detects when multiple farmers in a block will harvest same crop simultaneously.
    Triggers Virtual Cooperative bundling to prevent price crash.
    """

    block_id: str = Field(..., min_length=1, description="Block identifier")
    crop: str = Field(..., min_length=1, description="Crop name")
    harvest_window_start: date = Field(..., description="Harvest window start date")
    harvest_window_end: date = Field(..., description="Harvest window end date")
    projected_supply_quintals: float = Field(..., ge=0, description="Total projected supply")
    historical_absorption_quintals: float = Field(..., ge=0, description="Historical mandi absorption capacity")
    oversupply_ratio: float = Field(..., ge=0, description="Supply / absorption ratio")
    affected_farmer_ids: list[str] = Field(..., description="List of affected farmer IDs")
    severity: Severity = Field(..., description="Alert severity")
    recommended_action: str = Field(..., min_length=1, description="Recommended action")

    @model_validator(mode="after")
    def validate_dates(self) -> "BlockOversupplyAlert":
        """Ensure harvest window dates are valid."""
        if self.harvest_window_end < self.harvest_window_start:
            raise ValueError("harvest_window_end must be >= harvest_window_start")
        return self


class CooperativeBundle(BaseModel):
    """
    Virtual Cooperative bundle for collective selling.
    Groups farmers to reach full truckloads and negotiate better prices.
    """

    bundle_id: str = Field(..., min_length=1, description="Unique bundle identifier")
    block_id: str = Field(..., min_length=1, description="Block identifier")
    crop: str = Field(..., min_length=1, description="Crop name")
    farmer_ids: list[str] = Field(..., min_length=1, description="Participating farmer IDs")
    total_quantity_quintals: float = Field(..., gt=0, description="Total bundle quantity")
    target_mandi: str = Field(..., min_length=1, description="Target mandi name")
    target_mandi_lat: float = Field(..., ge=-90.0, le=90.0, description="Mandi GPS latitude")
    target_mandi_lng: float = Field(..., ge=-180.0, le=180.0, description="Mandi GPS longitude")
    delivery_window_start: date = Field(..., description="Delivery window start")
    delivery_window_end: date = Field(..., description="Delivery window end")
    forecast_price: float = Field(..., ge=0, description="Forecasted price at delivery")
    transport_saving_per_quintal: float = Field(..., ge=0, description="Transport cost saving vs solo")
    status: BundleStatus = Field(default=BundleStatus.NEGOTIATING, description="Bundle status")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), description="Creation timestamp")

    @model_validator(mode="after")
    def validate_delivery_window(self) -> "CooperativeBundle":
        """Ensure delivery window dates are valid."""
        if self.delivery_window_end < self.delivery_window_start:
            raise ValueError("delivery_window_end must be >= delivery_window_start")
        return self


class FarmerAdvisory(BaseModel):
    """
    Complete advisory delivered to farmer via WhatsApp.
    Contains both English and local language text.
    """

    advisory_id: str = Field(..., min_length=1, description="Unique advisory identifier")
    farmer_id: str = Field(..., min_length=1, description="Farmer identifier")
    crop: str = Field(..., min_length=1, description="Crop name")
    language: str = Field(..., min_length=2, max_length=3, description="ISO 639 language code")
    decision: Decision = Field(..., description="Harvest/market decision")
    target_mandi: str | None = Field(None, description="Recommended mandi if applicable")
    forecast_price: float = Field(..., ge=0, description="Forecasted price (INR/quintal)")
    spoilage_risk_pct: float = Field(..., ge=0.0, le=100.0, description="Spoilage risk percentage")
    bundle_available: bool = Field(..., description="Whether bundle is available")
    bundle_saving: float | None = Field(None, ge=0, description="Bundle transport saving")
    full_text_english: str = Field(..., min_length=1, description="Full advisory in English")
    full_text_local: str = Field(..., min_length=1, description="Full advisory in local language")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Advisory confidence score")
    guardrail_status: GuardrailStatus = Field(..., description="Guardrail check result")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), description="Creation timestamp")


class GuardrailResult(BaseModel):
    """
    Safety guardrail check result before sending advisory.
    Validates distance feasibility, crop stage, and confidence thresholds.
    """

    passed: bool = Field(..., description="Overall pass/fail")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Overall confidence")
    low_confidence_flag: bool = Field(..., description="Flag if confidence < 0.6")
    distance_feasibility: bool = Field(..., description="Mandi within viable distance")
    crop_stage_consistent: bool = Field(..., description="Crop stage matches recommendation")
    recommendation: Recommendation = Field(..., description="Final recommendation")
    checks_run: list[str] = Field(default_factory=list, description="List of checks performed")
    override_reason: str | None = Field(None, description="Override reason if flagged")


class VoiceSession(BaseModel):
    """
    Voice interaction session for multilingual support.
    Handles speech-to-text, translation, and text-to-speech via Reverie.
    """

    session_id: str = Field(..., min_length=1, description="Unique session identifier")
    farmer_id: str = Field(..., min_length=1, description="Farmer identifier")
    input_audio_url: str | None = Field(None, description="Input audio file URL")
    input_text_local: str = Field(default="", description="Farmer input in local language")
    input_text_english: str = Field(default="", description="Translated to English")
    detected_language: str = Field(..., min_length=2, max_length=3, description="Detected ISO 639 code")
    intent: str = Field(default="", description="Recognized farmer intent")
    response_text_english: str = Field(default="", description="Response in English")
    response_text_local: str = Field(default="", description="Response in local language")
    response_audio_url: str | None = Field(None, description="Output audio file URL")
    processing_ms: int = Field(..., ge=0, description="Processing time in milliseconds")
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), description="Session start timestamp")


class AdvisoryDeliveryResult(BaseModel):
    """Delivery outcome for advisory across channels with failover."""

    advisory_id: str = Field(..., min_length=1)
    farmer_id: str = Field(..., min_length=1)
    primary_channel: DeliveryChannel = Field(...)
    fallback_channel: DeliveryChannel | None = Field(default=None)
    delivered: bool = Field(...)
    provider_message_id: str | None = Field(default=None)
    failure_reason: str | None = Field(default=None)
    delivered_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class DiseaseDiagnosis(BaseModel):
    """Computer-vision diagnosis output for crop disease detection."""

    diagnosis_id: str = Field(..., min_length=1)
    crop: str = Field(..., min_length=1)
    disease_name: str = Field(..., min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)
    severity: Severity = Field(...)
    symptoms_observed: list[str] = Field(default_factory=list)
    preventive_actions: list[str] = Field(default_factory=list)
    treatment_actions: list[str] = Field(default_factory=list)
    escalation_required: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class GovtScheme(BaseModel):
    """Government scheme metadata and match reasoning."""

    scheme_id: str = Field(..., min_length=1)
    scheme_name: str = Field(..., min_length=1)
    state: str = Field(default="all")
    benefits_summary: str = Field(..., min_length=1)
    eligibility_score: float = Field(..., ge=0.0, le=1.0)
    eligibility_reason: str = Field(..., min_length=1)
    required_documents: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)


class DemandForecast(BaseModel):
    """Market demand forecast for a crop and geography."""

    crop: str = Field(..., min_length=1)
    state: str = Field(..., min_length=1)
    months_ahead: int = Field(..., ge=1, le=12)
    predicted_demand_index: float = Field(..., ge=0.0)
    demand_level: DemandLevel = Field(...)
    confidence: float = Field(..., ge=0.0, le=1.0)
    recommended_action: str = Field(..., min_length=1)
    signals: list[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class WeatherAlert(BaseModel):
    """Proactive weather alert for farmers/FPOs."""

    alert_id: str = Field(..., min_length=1)
    state: str = Field(..., min_length=1)
    district: str = Field(..., min_length=1)
    block_id: str | None = Field(default=None)
    crop: str | None = Field(default=None)
    alert_type: WeatherAlertType = Field(...)
    severity: Severity = Field(...)
    advisory_text: str = Field(..., min_length=1)
    valid_from: datetime = Field(...)
    valid_until: datetime = Field(...)
    push_sent: bool = Field(default=False)
    sms_fallback_sent: bool = Field(default=False)


class FAQVoiceItem(BaseModel):
    """Voice FAQ item metadata and rendered asset URL."""

    faq_id: str = Field(..., min_length=1)
    language: str = Field(..., min_length=2, max_length=3)
    question: str = Field(..., min_length=1)
    answer: str = Field(..., min_length=1)
    audio_url: str | None = Field(default=None)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class SyncOperation(BaseModel):
    """Queued mobile offline sync operation payload."""

    operation_id: str = Field(..., min_length=1)
    entity_type: str = Field(..., min_length=1)
    entity_id: str = Field(..., min_length=1)
    operation: str = Field(..., min_length=1)
    payload: dict = Field(default_factory=dict)
    client_version: int = Field(default=1, ge=1)
    server_version: int | None = Field(default=None, ge=1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class HarvestIntentConflict(BaseModel):
    """Conflict record for concurrent harvest intent updates."""

    conflict_id: str = Field(..., min_length=1)
    intent_id: str = Field(..., min_length=1)
    farmer_id: str = Field(..., min_length=1)
    resolution: str = Field(..., min_length=1, description="client_wins/server_wins/manual")
    client_payload: dict = Field(default_factory=dict)
    server_payload: dict = Field(default_factory=dict)
    resolved_payload: dict = Field(default_factory=dict)
    resolved_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
