"""
Safety Guardrails — validates all advisories before delivery.
Implements 4 rule-based checks and logs to Braintrust.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import Any, Optional

import httpx

from mandi_agent.backend.utils.geo import haversine_distance as _haversine_distance

from mandi_agent.backend.api.core_schemas import (
    FarmerAdvisory,
    FarmerProfile,
    GuardrailResult,
    GuardrailStatus,
    HarvestIntent,
    Recommendation,
)

logger = logging.getLogger(__name__)

# Braintrust API
BRAINTRUST_PROJECT_ID = "mandi-agent-guardrails"


def _get_braintrust_api_key() -> str:
    import os
    return os.getenv("BRAINTRUST_API_KEY", "")


def _get_google_maps_api_key() -> str:
    import os
    return os.getenv("GOOGLE_MAPS_API_KEY", "")


# =============================================================================
# Distance check using Google Maps Distance Matrix API
# =============================================================================

async def _check_distance(
    farmer_lat: float,
    farmer_lng: float,
    mandi_lat: float,
    mandi_lng: float,
) -> tuple[bool, float]:
    """
    Check if mandi is within 150km of farmer using Google Maps API.

    Returns:
        Tuple of (is_feasible, distance_km)
    """
    api_key = _get_google_maps_api_key()

    if not api_key:
        # Fallback: use Haversine distance
        dist = _haversine_distance(farmer_lat, farmer_lng, mandi_lat, mandi_lng)
        logger.warning(
            "GOOGLE_MAPS_API_KEY not set — using Haversine fallback (%.0fkm)", dist
        )
        return dist <= 150.0, dist

    try:
        async with httpx.AsyncClient() as client:
            url = "https://maps.googleapis.com/maps/api/distancematrix/json"
            params = {
                "origins": f"{farmer_lat},{farmer_lng}",
                "destinations": f"{mandi_lat},{mandi_lng}",
                "key": api_key,
            }
            response = await client.get(url, params=params, timeout=10.0)
            response.raise_for_status()
            data = response.json()

            # Parse distance from response
            rows = data.get("rows", [])
            if rows and rows[0].get("elements"):
                element = rows[0]["elements"][0]
                if element.get("status") == "OK":
                    distance_km = element["distance"]["value"] / 1000.0
                    return distance_km <= 150.0, distance_km

    except Exception as e:
        logger.warning("Google Maps API error — using Haversine: %s", str(e)[:100])

    # Fallback to Haversine
    dist = _haversine_distance(farmer_lat, farmer_lng, mandi_lat, mandi_lng)
    return dist <= 150.0, dist


# _haversine_distance imported from utils.geo at top of file


# =============================================================================
# Check 1: Confidence threshold
# =============================================================================

def _check_confidence(advisory: FarmerAdvisory) -> tuple[bool, float]:
    """
    Check if advisory confidence meets minimum threshold.

    Threshold: confidence >= 0.70 → pass
    If confidence < 0.70 → flag for review
    """
    passed = advisory.confidence >= 0.70
    confidence_score = advisory.confidence
    return passed, confidence_score


# =============================================================================
# Check 2: Distance feasibility
# =============================================================================

async def _check_distance_feasibility(
    farmer: FarmerProfile,
    advisory: FarmerAdvisory,
    intent: HarvestIntent,
) -> tuple[bool, float]:
    """
    Check if target mandi is within viable distance.

    Mandi must be < 150km from farmer location.
    """
    if not advisory.target_mandi:
        # No specific mandi — skip distance check
        return True, 0.0

    # TODO: Look up mandi coordinates from Supabase mandi table
    # For now, use default coordinates
    # In production: query mandi_locations table
    MANDI_COORDINATES = {
        "vashi navi mumbai": (19.0664, 73.0154),
        "vashi": (19.0664, 73.0154),
        "ballabgarh mandi": (28.3333, 76.8333),
        "bangalore": (12.9716, 77.5946),
        "chandigarh": (30.7333, 76.7794),
        "pune": (18.5204, 73.8567),
        "surat": (21.1702, 72.8311),
        "ahmedabad": (23.0225, 72.5714),
        "delhi": (28.7041, 77.1025),
    }

    mandi_name_lower = advisory.target_mandi.lower()
    coords = MANDI_COORDINATES.get(mandi_name_lower)

    if not coords:
        # Try partial match
        for known_mandi, (lat, lng) in MANDI_COORDINATES.items():
            if known_mandi in mandi_name_lower or mandi_name_lower in known_mandi:
                coords = (lat, lng)
                break

    if not coords:
        logger.warning(
            "Mandi coordinates unknown for '%s' — skipping distance check",
            advisory.target_mandi
        )
        return True, 0.0

    mandi_lat, mandi_lng = coords
    is_feasible, distance_km = await _check_distance(
        farmer.latitude, farmer.longitude, mandi_lat, mandi_lng
    )

    return is_feasible, distance_km


# =============================================================================
# Check 3: Crop stage consistency
# =============================================================================

def _check_crop_stage_consistency(
    advisory: FarmerAdvisory,
    intent: HarvestIntent,
) -> tuple[bool, str]:
    """
    Check if harvest recommendation matches crop growth stage.

    Harvest recommendation only valid if expected harvest date
    is within ±7 days of today.
    """
    today = date.today()
    harvest_date = intent.expected_harvest_date

    days_until_harvest = (harvest_date - today).days

    # Advisory is harvest_now: harvest date must be within ±7 days
    if advisory.decision.value == "harvest_now":
        if abs(days_until_harvest) <= 7:
            return True, f"harvest date {harvest_date} is within ±7 days"
        else:
            return False, (
                f"harvest_now recommended but harvest date {harvest_date} "
                f"is {days_until_harvest} days away (should be ±7 days)"
            )

    # Advisory is hold: harvest date must be in the future
    if advisory.decision.value in ("hold_3_days", "hold_7_days"):
        if days_until_harvest >= 0:
            return True, f"crop can be held until {harvest_date}"
        else:
            return False, (
                f"hold recommended but harvest date {harvest_date} is in the past"
            )

    # redirect_mandi: check is flexible
    return True, f"redirect_mandi is always valid"


# =============================================================================
# Check 4: Price sanity
# =============================================================================

async def _check_price_sanity(
    advisory: FarmerAdvisory,
    intent: HarvestIntent,
) -> tuple[bool, str]:
    """
    Check if forecast price is within ±40% of recent average.

    Flags potential hallucinations where predicted price deviates
    wildly from historical norms.
    """
    forecasted_price = advisory.forecast_price

    # Historical price ranges for common crops (INR/quintal)
    # These are approximate baselines
    CROP_PRICE_BASELINES = {
        "tomato": (800, 4000),
        "onion": (600, 3500),
        "potato": (400, 2000),
        "wheat": (1500, 2800),
        "rice": (1500, 3000),
        "maize": (1200, 2500),
        "sugarcane": (250, 450),
        "chilli": (1500, 8000),
        "turmeric": (4000, 12000),
        "groundnut": (3000, 7000),
        "mustard": (3000, 6000),
        "soybean": (2000, 5000),
        "cotton": (3500, 8000),
    }

    crop_lower = intent.crop.lower()
    price_range = CROP_PRICE_BASELINES.get(crop_lower)

    if not price_range:
        # Unknown crop — skip check
        return True, f"no baseline for {intent.crop}"

    min_price, max_price = price_range
    avg_price = (min_price + max_price) / 2
    threshold = avg_price * 0.40  # ±40%

    lower_bound = avg_price - threshold
    upper_bound = avg_price + threshold

    if lower_bound <= forecasted_price <= upper_bound:
        return True, (
            f"forecast price ₹{forecasted_price:.0f} is within ±40% "
            f"of baseline ₹{avg_price:.0f}"
        )
    else:
        deviation = ((forecasted_price - avg_price) / avg_price) * 100
        return False, (
            f"forecast price ₹{forecasted_price:.0f} deviates {deviation:+.0f}% "
            f"from baseline ₹{avg_price:.0f} (allowed: ±40%)"
        )


# =============================================================================
# Braintrust logging
# =============================================================================

async def _log_to_braintrust(
    advisory: FarmerAdvisory,
    farmer: FarmerProfile,
    intent: HarvestIntent,
    result: GuardrailResult,
    check_results: dict[str, Any],
) -> None:
    """
    Log guardrail evaluation to Braintrust.

    Braintrust: https://braintrust.dev
    Tracks: input, output, scores for guardrail evaluations.
    """
    api_key = _get_braintrust_api_key()
    if not api_key:
        return

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.braintrust.dev/v1/proxy/log",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "project_id": BRAINTRUST_PROJECT_ID,
                    "input": {
                        "advisory": advisory.model_dump(mode="json"),
                        "farmer": farmer.model_dump(mode="json"),
                        "intent": intent.model_dump(mode="json"),
                    },
                    "output": result.model_dump(mode="json"),
                    "scores": {
                        "confidence": float(result.confidence_score),
                        "distance_feasibility": float(1.0 if result.distance_feasibility else 0.0),
                        "crop_stage_consistency": float(1.0 if result.crop_stage_consistent else 0.0),
                        "price_sanity": float(1.0 if check_results.get("price_sanity", (True, ""))[0] else 0.0),
                    },
                    "metadata": {
                        "farmer_id": farmer.farmer_id,
                        "crop": intent.crop,
                        "block_id": farmer.block_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                },
                timeout=10.0,
            )
            response.raise_for_status()
            logger.debug("Braintrust log: %s", response.status_code)

    except Exception as e:
        logger.warning("Braintrust logging failed: %s", str(e)[:100])


# =============================================================================
# Main GuardrailAgent
# =============================================================================


class GuardrailAgent:
    """
    Safety guardrail validation for Mandi-Agent advisories.

    Runs 4 checks before any advisory is sent to a farmer:
    1. confidence_check: advisory.confidence >= 0.70
    2. distance_feasibility: target mandi within 150km
    3. crop_stage_consistency: harvest date within ±7 days
    4. price_sanity: forecast within ±40% of baseline

    All evaluations are logged to Braintrust.

    Usage:
        agent = GuardrailAgent()
        result = await agent.validate(advisory, farmer, intent)
    """

    def __init__(self):
        """Initialize guardrail agent."""
        pass

    async def validate(
        self,
        advisory: FarmerAdvisory,
        farmer: FarmerProfile,
        intent: HarvestIntent,
    ) -> GuardrailResult:
        """
        Validate an advisory against all safety guardrails.

        Args:
            advisory: FarmerAdvisory to validate
            farmer: FarmerProfile for context
            intent: HarvestIntent for consistency check

        Returns:
            GuardrailResult with all check details
        """
        checks_run = []
        all_passed = True
        low_confidence_flag = False

        # Check 1: Confidence
        passed, confidence_score = _check_confidence(advisory)
        checks_run.append(f"confidence_check({'pass' if passed else 'fail'}: {confidence_score:.2f})")
        if not passed:
            all_passed = False
            low_confidence_flag = True

        # Check 2: Distance feasibility
        dist_passed, distance_km = await _check_distance_feasibility(farmer, advisory, intent)
        checks_run.append(
            f"distance_feasibility({'pass' if dist_passed else 'fail'}: {distance_km:.0f}km)"
        )
        if not dist_passed:
            all_passed = False

        # Check 3: Crop stage consistency
        stage_passed, stage_reason = _check_crop_stage_consistency(advisory, intent)
        checks_run.append(f"crop_stage_consistency({'pass' if stage_passed else 'fail'}: {stage_reason})")
        if not stage_passed:
            all_passed = False

        # Check 4: Price sanity
        price_passed, price_reason = await _check_price_sanity(advisory, intent)
        checks_run.append(f"price_sanity({'pass' if price_passed else 'fail'}: {price_reason})")
        if not price_passed:
            all_passed = False

        # Determine recommendation
        if all_passed:
            recommendation = Recommendation.APPROVE
            guardrail_status = GuardrailStatus.APPROVED
        elif low_confidence_flag and dist_passed and stage_passed:
            recommendation = Recommendation.REVIEW
            guardrail_status = GuardrailStatus.REVIEW
        else:
            recommendation = Recommendation.FLAG
            guardrail_status = GuardrailStatus.FLAGGED

        result = GuardrailResult(
            passed=all_passed,
            confidence_score=confidence_score,
            low_confidence_flag=low_confidence_flag,
            distance_feasibility=dist_passed,
            crop_stage_consistent=stage_passed,
            recommendation=recommendation,
            checks_run=checks_run,
        )

        # Log to Braintrust asynchronously (fire and forget)
        asyncio.create_task(
            _log_to_braintrust(
                advisory, farmer, intent, result,
                {"price_sanity": (price_passed, price_reason)}
            )
        )

        logger.info(
            "Guardrail validation: farmer=%s crop=%s decision=%s — %s (checks: %s)",
            farmer.farmer_id, intent.crop, advisory.decision.value,
            recommendation.value, len(checks_run)
        )

        return result


# Convenience function
async def validate_advisory(
    advisory: FarmerAdvisory,
    farmer: FarmerProfile,
    intent: HarvestIntent,
) -> GuardrailResult:
    """Validate an advisory using the default GuardrailAgent."""
    agent = GuardrailAgent()
    return await agent.validate(advisory, farmer, intent)


if __name__ == "__main__":
    # Smoke test
    import asyncio
    logging.basicConfig(level=logging.INFO)

    async def test():
        from datetime import date as date_cls

        advisory = FarmerAdvisory(
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
            full_text_english="Sell your tomato today.",
            full_text_local="Aaj apne tamatar bech.",
            confidence=0.75,
            guardrail_status="approved",
        )

        farmer = FarmerProfile(
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

        intent = HarvestIntent(
            intent_id="I001",
            farmer_id="F001",
            crop="tomato",
            quantity_quintals=10.0,
            expected_harvest_date=date_cls(2026, 3, 20),
            current_growth_stage="mature",
            block_id="MH-001",
        )

        result = await validate_advisory(advisory, farmer, intent)

        print(f"Passed: {result.passed}")
        print(f"Recommendation: {result.recommendation.value}")
        print(f"Confidence: {result.confidence_score:.2f}")
        print(f"Distance feasible: {result.distance_feasibility}")
        print(f"Crop stage consistent: {result.crop_stage_consistent}")
        print(f"Checks: {', '.join(result.checks_run)}")

    asyncio.run(test())
