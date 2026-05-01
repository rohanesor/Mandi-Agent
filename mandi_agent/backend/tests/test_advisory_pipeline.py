"""
Tests for the 3-stage advisory pipeline (decision → explanation → render).

Verifies:
- Determinism: same inputs → same outputs across multiple runs.
- Decision rules: each rule path produces the expected outcome.
- Bundle preference: cooperative bundles override default mandi selection.
"""

from datetime import date

import pytest

from mandi_agent.backend.agents.decision_engine import make_decision
from mandi_agent.backend.agents.explanation_extractor import extract_explanation
from mandi_agent.backend.agents.advisory_renderer import render_advisory
from mandi_agent.backend.models.schemas import (
    PriceDirection,
    PriceForecast,
    RiskLevel,
    SpoilageRisk,
)


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------

class TestDeterminism:
    """Same inputs must always produce identical outputs."""

    def test_decisions_are_deterministic(
        self, rising_price_forecast, low_spoilage
    ):
        results = [
            make_decision(rising_price_forecast, low_spoilage, None)
            for _ in range(3)
        ]
        assert all(r.decision == results[0].decision for r in results)
        assert all(
            r.decision_confidence == results[0].decision_confidence for r in results
        )

    def test_explanations_are_deterministic(
        self, rising_price_forecast, low_spoilage
    ):
        decision = make_decision(rising_price_forecast, low_spoilage, None)
        rag = [
            {"content": "Festival demand rising.", "source": "agmarknet", "similarity": 0.92},
        ]
        results = [extract_explanation(decision, rag) for _ in range(3)]
        assert all(r.recommendation == results[0].recommendation for r in results)

    def test_rendering_is_deterministic(
        self, rising_price_forecast, low_spoilage
    ):
        decision = make_decision(rising_price_forecast, low_spoilage, None)
        explanation = extract_explanation(decision, [])
        results = [
            render_advisory(decision, explanation, crop_name="wheat")
            for _ in range(3)
        ]
        assert all(r.full_text == results[0].full_text for r in results)


# ---------------------------------------------------------------------------
# Decision rules
# ---------------------------------------------------------------------------

class TestDecisionRules:
    """Verify documented decision-engine rules."""

    def test_critical_spoilage_overrides_rising_price(
        self, rising_price_forecast, high_spoilage
    ):
        """≥60% spoilage → HARVEST_NOW regardless of price trend."""
        # Use tomato price to match high_spoilage fixture
        price = PriceForecast(
            crop="tomato",
            mandi_name="Delhi",
            forecast_date=date.today(),
            predicted_price=3000.0,
            confidence=0.90,
            price_direction=PriceDirection.RISING,
            reasoning="Premium demand",
            model_used="xgboost",
            days_ahead=5,
        )
        result = make_decision(price, high_spoilage, None)
        assert result.decision.value == "harvest_now"

    def test_falling_prices_trigger_harvest_now(
        self, falling_price_forecast, low_spoilage
    ):
        result = make_decision(falling_price_forecast, low_spoilage, None)
        assert result.decision.value == "harvest_now"

    def test_rising_price_low_spoilage_triggers_hold(
        self, rising_price_forecast, low_spoilage
    ):
        result = make_decision(rising_price_forecast, low_spoilage, None)
        assert result.decision.value == "hold_3_days"

    def test_bundle_with_high_saving_triggers_hold(
        self, stable_price_forecast, low_spoilage, sample_bundle
    ):
        result = make_decision(
            stable_price_forecast, low_spoilage, sample_bundle
        )
        assert result.decision.value == "hold_3_days"
        assert result.bundle_saving_per_q > 0


# ---------------------------------------------------------------------------
# Bundle preference
# ---------------------------------------------------------------------------

class TestBundlePreference:
    """Bundle mandi should override default mandi selection."""

    def test_bundle_mandi_is_selected(
        self, stable_price_forecast, low_spoilage, sample_bundle
    ):
        result = make_decision(
            stable_price_forecast, low_spoilage, sample_bundle
        )
        assert result.target_mandi == "Delhi Wholesale"
