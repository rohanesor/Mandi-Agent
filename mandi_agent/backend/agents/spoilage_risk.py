"""
Spoilage Risk Agent — calculates perishable crop spoilage probability.
Accounts for transit time, ambient temperature, and shelf life.
"""

import asyncio
import logging
from datetime import date
from typing import Any

from mandi_agent.backend.api.core_schemas import RiskLevel, SpoilageRisk

logger = logging.getLogger(__name__)

# =============================================================================
# Shelf life database (50 crops — same as RAG ingestion)
# =============================================================================

SHELF_LIFE_DB: dict[str, dict[str, Any]] = {
    "tomato": {"min_hours": 48, "max_hours": 96, "optimal_temp": 12, "optimal_humidity": 85},
    "onion": {"min_hours": 120, "max_hours": 240, "optimal_temp": 0, "optimal_humidity": 65},
    "potato": {"min_hours": 168, "max_hours": 504, "optimal_temp": 8, "optimal_humidity": 85},
    "mango": {"min_hours": 36, "max_hours": 72, "optimal_temp": 13, "optimal_humidity": 85},
    "banana": {"min_hours": 48, "max_hours": 96, "optimal_temp": 13, "optimal_humidity": 90},
    "cauliflower": {"min_hours": 24, "max_hours": 48, "optimal_temp": 0, "optimal_humidity": 90},
    "cabbage": {"min_hours": 72, "max_hours": 144, "optimal_temp": 0, "optimal_humidity": 90},
    "okra": {"min_hours": 24, "max_hours": 48, "optimal_temp": 8, "optimal_humidity": 85},
    "brinjal": {"min_hours": 48, "max_hours": 72, "optimal_temp": 10, "optimal_humidity": 80},
    "green_peas": {"min_hours": 12, "max_hours": 36, "optimal_temp": 0, "optimal_humidity": 90},
    "spinach": {"min_hours": 6, "max_hours": 18, "optimal_temp": 0, "optimal_humidity": 95},
    "coriander": {"min_hours": 12, "max_hours": 36, "optimal_temp": 0, "optimal_humidity": 90},
    "capsicum": {"min_hours": 72, "max_hours": 120, "optimal_temp": 8, "optimal_humidity": 85},
    "carrot": {"min_hours": 96, "max_hours": 168, "optimal_temp": 0, "optimal_humidity": 90},
    "radish": {"min_hours": 48, "max_hours": 96, "optimal_temp": 0, "optimal_humidity": 85},
    "garlic": {"min_hours": 168, "max_hours": 360, "optimal_temp": 15, "optimal_humidity": 65},
    "ginger": {"min_hours": 96, "max_hours": 168, "optimal_temp": 12, "optimal_humidity": 70},
    "turmeric": {"min_hours": 720, "max_hours": 1440, "optimal_temp": 25, "optimal_humidity": 60},
    "chilli": {"min_hours": 168, "max_hours": 360, "optimal_temp": 10, "optimal_humidity": 65},
    "pomegranate": {"min_hours": 168, "max_hours": 336, "optimal_temp": 5, "optimal_humidity": 85},
    "grapes": {"min_hours": 72, "max_hours": 120, "optimal_temp": 0, "optimal_humidity": 90},
    "apple": {"min_hours": 168, "max_hours": 504, "optimal_temp": 2, "optimal_humidity": 85},
    "orange": {"min_hours": 168, "max_hours": 336, "optimal_temp": 5, "optimal_humidity": 85},
    "papaya": {"min_hours": 24, "max_hours": 48, "optimal_temp": 10, "optimal_humidity": 85},
    "guava": {"min_hours": 48, "max_hours": 72, "optimal_temp": 8, "optimal_humidity": 85},
    "watermelon": {"min_hours": 96, "max_hours": 168, "optimal_temp": 10, "optimal_humidity": 80},
    "muskmelon": {"min_hours": 72, "max_hours": 120, "optimal_temp": 8, "optimal_humidity": 80},
    "sweet_lime": {"min_hours": 168, "max_hours": 336, "optimal_temp": 8, "optimal_humidity": 80},
    "coconut": {"min_hours": 168, "max_hours": 360, "optimal_temp": 5, "optimal_humidity": 70},
    "jackfruit": {"min_hours": 48, "max_hours": 72, "optimal_temp": 12, "optimal_humidity": 80},
    "custard_apple": {"min_hours": 24, "max_hours": 48, "optimal_temp": 10, "optimal_humidity": 85},
    "beans": {"min_hours": 36, "max_hours": 72, "optimal_temp": 8, "optimal_humidity": 85},
    "bitter_gourd": {"min_hours": 48, "max_hours": 72, "optimal_temp": 10, "optimal_humidity": 80},
    "bottle_gourd": {"min_hours": 72, "max_hours": 120, "optimal_temp": 10, "optimal_humidity": 80},
    "ridge_gourd": {"min_hours": 48, "max_hours": 72, "optimal_temp": 10, "optimal_humidity": 80},
    "snake_gourd": {"min_hours": 48, "max_hours": 72, "optimal_temp": 10, "optimal_humidity": 80},
    "tinda": {"min_hours": 36, "max_hours": 60, "optimal_temp": 8, "optimal_humidity": 85},
    "parwal": {"min_hours": 48, "max_hours": 72, "optimal_temp": 10, "optimal_humidity": 80},
    "eggplant": {"min_hours": 48, "max_hours": 72, "optimal_temp": 10, "optimal_humidity": 80},
    "corn": {"min_hours": 12, "max_hours": 24, "optimal_temp": 0, "optimal_humidity": 85},
    "mushroom": {"min_hours": 24, "max_hours": 48, "optimal_temp": 2, "optimal_humidity": 85},
    "wheat": {"min_hours": 8760, "max_hours": 26280, "optimal_temp": 20, "optimal_humidity": 65},
    "rice": {"min_hours": 8760, "max_hours": 26280, "optimal_temp": 20, "optimal_humidity": 60},
    "chickpea": {"min_hours": 8760, "max_hours": 17520, "optimal_temp": 15, "optimal_humidity": 65},
    "moong_dal": {"min_hours": 8760, "max_hours": 17520, "optimal_temp": 15, "optimal_humidity": 60},
    "urad_dal": {"min_hours": 8760, "max_hours": 17520, "optimal_temp": 15, "optimal_humidity": 60},
    "masoor_dal": {"min_hours": 8760, "max_hours": 17520, "optimal_temp": 15, "optimal_humidity": 60},
}


# =============================================================================
# Temperature multiplier
# =============================================================================


def _temperature_multiplier(ambient_temp_celsius: float) -> float:
    """
    Compute shelf life temperature multiplier.

    Based on Q10 rule: reaction rate doubles every 10°C.
    Adjusted for perishable produce:

    - Below 20°C: 0.6 (slow spoilage)
    - 20-30°C: 1.0 (baseline)
    - 30-35°C: 1.4 (elevated spoilage)
    - Above 35°C: 2.0 (critical spoilage)
    """
    if ambient_temp_celsius < 20:
        return 0.6
    elif ambient_temp_celsius < 30:
        return 1.0
    elif ambient_temp_celsius < 35:
        return 1.4
    else:
        return 2.0


def _risk_level_from_probability(probability: float) -> RiskLevel:
    """
    Map spoilage probability to risk level.

    - < 0.20: SAFE
    - 0.20 - 0.40: MODERATE
    - 0.40 - 0.60: HIGH
    - > 0.60: CRITICAL
    """
    if probability < 0.20:
        return RiskLevel.SAFE
    elif probability < 0.40:
        return RiskLevel.MODERATE
    elif probability < 0.60:
        return RiskLevel.HIGH
    else:
        return RiskLevel.CRITICAL


# =============================================================================
# Main assessment function
# =============================================================================

SYSTEM_PROMPT = """You are the Spoilage Risk Agent for Mandi-Agent.

Given: harvest date, transit distance, ambient temperature forecast, and commodity shelf life data —
calculate the probability that the produce will spoil before it reaches the buyer.

Use this formula:
  spoilage_probability = (transit_hours / shelf_life_hours) * temperature_multiplier

Temperature multiplier:
  Below 20°C = 0.6 (slow spoilage — cool is good for most produce)
  20-30°C = 1.0 (baseline)
  30-35°C = 1.4 (elevated spoilage)
  Above 35°C = 2.0 (critical — produce will deteriorate fast)

If spoilage risk exceeds 60%, recommend:
- nearest cold storage OR
- faster transport OR
- closer mandi with acceptable price

If spoilage risk is 40-60%, recommend selling within 24 hours.

If spoilage risk is below 40%, produce can safely travel standard distances.

Output a JSON object with these fields:
- farmer_id: string
- crop: string
- harvest_date: date (YYYY-MM-DD)
- transit_hours: float
- ambient_temp_celsius: float
- shelf_life_hours: float
- spoilage_probability: float (0.0 to 1.0)
- risk_level: "safe" | "moderate" | "high" | "critical"
- recommendation: string (specific action recommendation)"""


async def assess_spoilage(
    farmer_id: str,
    crop: str,
    harvest_date: date,
    transit_hours: float,
    ambient_temp_celsius: float,
    shelf_life_data: dict[str, Any] | None = None,
) -> SpoilageRisk | None:
    """
    Assess spoilage risk for a farmer's produce.

    Calculates probability based on transit time, temperature,
    and crop-specific shelf life.

    Args:
        farmer_id: Farmer identifier
        crop: Crop name
        harvest_date: Expected harvest date
        transit_hours: Estimated transit time to mandi (hours)
        ambient_temp_celsius: Expected ambient temperature during transit
        shelf_life_data: Optional override for shelf life data

    Returns:
        SpoilageRisk with probability, level, and recommendation
    """
    # Look up shelf life
    if shelf_life_data:
        min_hours = shelf_life_data.get("min_shelf_life_hours", shelf_life_data.get("min_hours", 48))
        max_hours = shelf_life_data.get("max_shelf_life_hours", shelf_life_data.get("max_hours", 72))
        shelf_life_hours = (min_hours + max_hours) / 2
    else:
        crop_lower = crop.lower().replace(" ", "_")
        if crop_lower in SHELF_LIFE_DB:
            data = SHELF_LIFE_DB[crop_lower]
            min_hours = data["min_hours"]
            max_hours = data["max_hours"]
            shelf_life_hours = (min_hours + max_hours) / 2
        else:
            # Default: 48 hours if unknown crop
            logger.warning("Unknown crop %s in shelf life DB, using default 48h", crop)
            shelf_life_hours = 48.0
            min_hours = 24
            max_hours = 96

    # Compute temperature multiplier
    temp_mult = _temperature_multiplier(ambient_temp_celsius)

    # Compute spoilage probability using midpoint shelf life
    raw_probability = (transit_hours / shelf_life_hours) * temp_mult
    spoilage_probability = min(1.0, max(0.0, raw_probability))

    # Determine risk level
    risk_level = _risk_level_from_probability(spoilage_probability)

    # Build recommendation
    if spoilage_probability >= 0.60:
        recommendation = (
            f"CRITICAL: Spoilage risk is {spoilage_probability * 100:.0f}%. "
            f"Transit time ({transit_hours:.0f}h) exceeds safe shelf life at {ambient_temp_celsius}°C. "
            f"Options: (1) Find cold storage within 10km. "
            f"(2) Use faster transport to reduce transit to <{shelf_life_hours / temp_mult:.0f}h. "
            f"(3) Redirect to nearest mandi (<{shelf_life_hours / (temp_mult * 2):.0f}h away). "
            f"(4) Sell today at current market price."
        )
    elif spoilage_probability >= 0.40:
        recommendation = (
            f"HIGH RISK: Spoilage risk is {spoilage_probability * 100:.0f}%. "
            f"Sell within 24 hours at best available price. "
            f"Cold storage recommended if sale is delayed beyond tomorrow. "
            f"Consider bundling with nearby farmers to share cold storage costs."
        )
    elif spoilage_probability >= 0.20:
        recommendation = (
            f"MODERATE: Spoilage risk is {spoilage_probability * 100:.0f}%. "
            f"Produce can travel standard distances but avoid delays. "
            f"Recommend selling within 48 hours."
        )
    else:
        recommendation = (
            f"SAFE: Spoilage risk is {spoilage_probability * 100:.0f}%. "
            f"Produce can safely reach mandi within standard transit time. "
            f"No special precautions needed."
        )

    logger.info(
        "Spoilage assessment: farmer=%s crop=%s prob=%.2f level=%s temp=%.0f°C transit=%.0fh",
        farmer_id,
        crop,
        spoilage_probability,
        risk_level.value,
        ambient_temp_celsius,
        transit_hours,
    )

    return SpoilageRisk(
        farmer_id=farmer_id,
        crop=crop,
        harvest_date=harvest_date,
        transit_hours=transit_hours,
        ambient_temp_celsius=ambient_temp_celsius,
        shelf_life_hours=shelf_life_hours,
        spoilage_probability=round(spoilage_probability, 3),
        risk_level=risk_level,
        recommendation=recommendation,
    )


async def assess_spoilage_batch(
    assessments: list[dict[str, Any]],
) -> list[SpoilageRisk | None]:
    """
    Run multiple spoilage assessments concurrently.

    Args:
        assessments: List of kwargs for assess_spoilage()

    Returns:
        List of SpoilageRisk results
    """
    tasks = [assess_spoilage(**a) for a in assessments]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r if isinstance(r, SpoilageRisk) else None for r in results]


if __name__ == "__main__":
    # Smoke test
    import asyncio

    async def test():
        result = await assess_spoilage(
            farmer_id="F001",
            crop="tomato",
            harvest_date=date(2026, 3, 25),
            transit_hours=8.0,
            ambient_temp_celsius=32.0,
        )

        if result:
            print(f"Crop: {result.crop}")
            print(f"Shelf life: {result.shelf_life_hours:.0f}h at optimal temp")
            print(f"Transit: {result.transit_hours:.0f}h at {result.ambient_temp_celsius}°C")
            print(f"Spoilage probability: {result.spoilage_probability * 100:.1f}%")
            print(f"Risk level: {result.risk_level.value}")
            print(f"Recommendation: {result.recommendation[:200]}...")

    asyncio.run(test())
