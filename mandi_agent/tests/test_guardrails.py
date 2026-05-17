"""
Tests for the haversine distance utility and guardrail validation.
"""

import math

import pytest

from mandi_agent.backend.agents.guardrails import GuardrailAgent
from mandi_agent.backend.utils.geo import haversine_distance

# ---------------------------------------------------------------------------
# Haversine distance
# ---------------------------------------------------------------------------


class TestHaversineDistance:
    """Verify the shared haversine implementation."""

    def test_same_point_returns_zero(self):
        assert haversine_distance(19.0, 73.0, 19.0, 73.0) == 0.0

    def test_known_distance_mumbai_to_delhi(self):
        """Mumbai ↔ Delhi ≈ 1,150–1,160 km by great circle."""
        dist = haversine_distance(19.076, 72.877, 28.644, 77.216)
        assert 1100 < dist < 1200

    def test_short_distance(self):
        """Two nearby points should be close."""
        dist = haversine_distance(19.0, 73.0, 19.01, 73.01)
        assert dist < 5  # < 5 km

    def test_antipodal_points(self):
        """Diametrically opposite points ≈ half Earth circumference."""
        dist = haversine_distance(0, 0, 0, 180)
        expected = math.pi * 6371.0  # ≈ 20015 km
        assert abs(dist - expected) < 1


# ---------------------------------------------------------------------------
# Guardrail validation
# ---------------------------------------------------------------------------


class TestGuardrailAgent:
    """Test the safety guardrail checks."""

    @pytest.mark.asyncio
    async def test_high_confidence_advisory_passes(self, sample_advisory, sample_farmer, sample_harvest_intent):
        agent = GuardrailAgent()
        result = await agent.validate(sample_advisory, sample_farmer, sample_harvest_intent)
        # confidence 0.75 ≥ 0.70 threshold
        assert result.confidence_score >= 0.70

    @pytest.mark.asyncio
    async def test_low_confidence_gets_flagged(self, sample_advisory, sample_farmer, sample_harvest_intent):
        sample_advisory.confidence = 0.50
        agent = GuardrailAgent()
        result = await agent.validate(sample_advisory, sample_farmer, sample_harvest_intent)
        assert result.low_confidence_flag is True

    @pytest.mark.asyncio
    async def test_checks_run_list_populated(self, sample_advisory, sample_farmer, sample_harvest_intent):
        agent = GuardrailAgent()
        result = await agent.validate(sample_advisory, sample_farmer, sample_harvest_intent)
        assert len(result.checks_run) == 4  # confidence, distance, crop stage, price
