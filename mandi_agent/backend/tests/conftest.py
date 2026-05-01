"""
Pytest configuration and shared fixtures for Mandi-Agent backend tests.
"""

import asyncio
from datetime import date

import pytest

from mandi_agent.backend.models.schemas import (
    CooperativeBundle,
    FarmerAdvisory,
    FarmerProfile,
    GuardrailStatus,
    HarvestIntent,
    PriceDirection,
    PriceForecast,
    RiskLevel,
    SpoilageRisk,
)


# ---------------------------------------------------------------------------
# Event loop
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def event_loop():
    """Create a session-scoped event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ---------------------------------------------------------------------------
# Domain object factories
# ---------------------------------------------------------------------------

@pytest.fixture()
def sample_farmer() -> FarmerProfile:
    """Minimal valid FarmerProfile for testing."""
    return FarmerProfile(
        farmer_id="F001",
        name="Test Farmer",
        phone="+919876543210",
        language="hi",
        location="Thane, Maharashtra",
        latitude=19.2,
        longitude=73.0,
        block_id="MH-001",
        crops=["tomato"],
        landholding_acres=3.0,
    )


@pytest.fixture()
def sample_harvest_intent() -> HarvestIntent:
    """Minimal valid HarvestIntent."""
    return HarvestIntent(
        intent_id="I001",
        farmer_id="F001",
        crop="tomato",
        quantity_quintals=10.0,
        expected_harvest_date=date.today(),
        current_growth_stage="mature",
        block_id="MH-001",
    )


@pytest.fixture()
def rising_price_forecast() -> PriceForecast:
    """Price forecast with rising direction."""
    return PriceForecast(
        crop="wheat",
        mandi_name="Ballabgarh",
        forecast_date=date.today(),
        predicted_price=2200.0,
        confidence=0.85,
        price_direction=PriceDirection.RISING,
        reasoning="Festival demand driving prices higher",
        model_used="xgboost",
        days_ahead=7,
    )


@pytest.fixture()
def falling_price_forecast() -> PriceForecast:
    """Price forecast with falling direction."""
    return PriceForecast(
        crop="wheat",
        mandi_name="Ballabgarh",
        forecast_date=date.today(),
        predicted_price=1800.0,
        confidence=0.80,
        price_direction=PriceDirection.FALLING,
        reasoning="Oversupply from multiple blocks",
        model_used="xgboost",
        days_ahead=7,
    )


@pytest.fixture()
def stable_price_forecast() -> PriceForecast:
    """Price forecast with stable direction."""
    return PriceForecast(
        crop="wheat",
        mandi_name="Ballabgarh",
        forecast_date=date.today(),
        predicted_price=2150.0,
        confidence=0.80,
        price_direction=PriceDirection.STABLE,
        reasoning="Market equilibrium stable",
        model_used="xgboost",
        days_ahead=7,
    )


@pytest.fixture()
def low_spoilage() -> SpoilageRisk:
    """Low / safe spoilage risk."""
    return SpoilageRisk(
        farmer_id="F001",
        crop="wheat",
        harvest_date=date.today(),
        transit_hours=2.0,
        ambient_temp_celsius=25.0,
        shelf_life_hours=720.0,
        spoilage_probability=0.05,
        risk_level=RiskLevel.SAFE,
        recommendation="Safe to store",
    )


@pytest.fixture()
def high_spoilage() -> SpoilageRisk:
    """Critical spoilage risk (≥60%)."""
    return SpoilageRisk(
        farmer_id="F001",
        crop="tomato",
        harvest_date=date.today(),
        transit_hours=5.0,
        ambient_temp_celsius=35.0,
        shelf_life_hours=48.0,
        spoilage_probability=0.70,
        risk_level=RiskLevel.CRITICAL,
        recommendation="Harvest immediately",
    )


@pytest.fixture()
def sample_bundle() -> CooperativeBundle:
    """Valid cooperative bundle with significant savings."""
    return CooperativeBundle(
        bundle_id="B001",
        block_id="HR-001",
        crop="wheat",
        farmer_ids=["F001", "F002", "F003"],
        total_quantity_quintals=50.0,
        target_mandi="Delhi Wholesale",
        target_mandi_lat=28.6139,
        target_mandi_lng=77.2090,
        delivery_window_start=date.today(),
        delivery_window_end=date.today(),
        forecast_price=2300.0,
        transport_saving_per_quintal=250.0,
    )


@pytest.fixture()
def sample_advisory() -> FarmerAdvisory:
    """Complete advisory for guardrail testing."""
    return FarmerAdvisory(
        advisory_id="ADV001",
        farmer_id="F001",
        crop="tomato",
        language="hi",
        decision="harvest_now",
        target_mandi="Vashi Navi Mumbai",
        forecast_price=2400.0,
        spoilage_risk_pct=35.0,
        bundle_available=True,
        bundle_saving=350.0,
        full_text_english="Sell your tomato today at Vashi.",
        full_text_local="Aaj apne tamatar Vashi mein bech do.",
        confidence=0.75,
        guardrail_status=GuardrailStatus.APPROVED,
    )
