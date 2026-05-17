"""
Tests for Pydantic v2 domain schemas — validation, constraints, edge cases.
"""

from datetime import date

import pytest

from mandi_agent.backend.api.core_schemas import (
    FarmerProfile,
    MandiPrice,
    PriceDirection,
    PriceForecast,
)


class TestFarmerProfile:
    """FarmerProfile validation rules."""

    def test_valid_profile(self, sample_farmer):
        assert sample_farmer.farmer_id == "F001"

    def test_language_normalised_to_lower(self):
        farmer = FarmerProfile(
            farmer_id="F002",
            name="Test",
            phone="+919876543210",
            language="HI",
            location="Delhi",
            latitude=28.0,
            longitude=77.0,
            block_id="DL-001",
            crops=["wheat"],
            landholding_acres=2.0,
        )
        assert farmer.language == "hi"

    def test_invalid_phone_rejected(self):
        with pytest.raises(Exception):
            FarmerProfile(
                farmer_id="F003",
                name="Test",
                phone="12345",  # Invalid
                language="hi",
                location="Delhi",
                latitude=28.0,
                longitude=77.0,
                block_id="DL-001",
                crops=["wheat"],
                landholding_acres=2.0,
            )

    def test_zero_landholding_rejected(self):
        with pytest.raises(Exception):
            FarmerProfile(
                farmer_id="F004",
                name="Test",
                phone="+919876543210",
                language="hi",
                location="Delhi",
                latitude=28.0,
                longitude=77.0,
                block_id="DL-001",
                crops=["wheat"],
                landholding_acres=0,  # must be > 0
            )


class TestMandiPrice:
    """MandiPrice cross-field validation."""

    def test_valid_mandi_price(self):
        mp = MandiPrice(
            mandi_name="Delhi",
            state="Delhi",
            commodity="Wheat",
            variety="Standard",
            min_price=1800.0,
            max_price=2200.0,
            modal_price=2000.0,
            price_date=date.today(),
            source="agmarknet",
        )
        assert mp.modal_price == 2000.0

    def test_modal_outside_range_rejected(self):
        with pytest.raises(Exception):
            MandiPrice(
                mandi_name="Delhi",
                state="Delhi",
                commodity="Wheat",
                variety="Standard",
                min_price=1800.0,
                max_price=2200.0,
                modal_price=2500.0,  # > max
                price_date=date.today(),
                source="agmarknet",
            )


class TestPriceForecast:
    """PriceForecast constraints."""

    def test_confidence_out_of_range_rejected(self):
        with pytest.raises(Exception):
            PriceForecast(
                crop="wheat",
                mandi_name="Delhi",
                forecast_date=date.today(),
                predicted_price=2000.0,
                confidence=1.5,  # must be 0.0–1.0
                price_direction=PriceDirection.STABLE,
                reasoning="Test scenario for validation",
                model_used="test",
                days_ahead=7,
            )

    def test_days_ahead_exceeds_max_rejected(self):
        with pytest.raises(Exception):
            PriceForecast(
                crop="wheat",
                mandi_name="Delhi",
                forecast_date=date.today(),
                predicted_price=2000.0,
                confidence=0.8,
                price_direction=PriceDirection.STABLE,
                reasoning="Test scenario for validation",
                model_used="test",
                days_ahead=31,  # max is 30
            )
