"""
Oversupply Detector Agent — detects when too many farmers in a block
will harvest the same crop simultaneously, risking local price crash.
"""

import asyncio
import logging
from datetime import date

from pydantic import BaseModel, Field

from mandi_agent.backend.api.core_schemas import (
    BlockOversupplyAlert,
    HarvestIntent,
    MandiPrice,
    Severity,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Helper functions
# =============================================================================

# Re-export for backward compatibility; canonical implementation in utils.geo


def _group_intents_by_window(
    intents: list[HarvestIntent],
    window_days: int = 7,
) -> dict[str, list[HarvestIntent]]:
    """
    Group harvest intents by their overlapping harvest windows.

    Two farmers are in the same window if their harvest dates
    are within `window_days` of each other.

    Args:
        intents: List of HarvestIntent records
        window_days: Window size in days (default 7)

    Returns:
        Dict mapping window_key -> list of intents in that window
    """
    if not intents:
        return {}

    # Sort by harvest date
    sorted_intents = sorted(intents, key=lambda i: i.expected_harvest_date)
    groups: dict[str, list[HarvestIntent]] = {}
    current_window: list[HarvestIntent] = []
    window_start: date | None = None

    for intent in sorted_intents:
        if not current_window:
            current_window.append(intent)
            window_start = intent.expected_harvest_date
        else:
            # Check if this intent overlaps with current window
            days_diff = (intent.expected_harvest_date - window_start).days
            if days_diff <= window_days:
                current_window.append(intent)
            else:
                # Close current window and start new one
                window_key = f"{window_start.isoformat()}__{current_window[-1].expected_harvest_date.isoformat()}"
                groups[window_key] = current_window
                current_window = [intent]
                window_start = intent.expected_harvest_date

    # Close last window
    if current_window:
        window_key = f"{window_start.isoformat()}__{current_window[-1].expected_harvest_date.isoformat()}"
        groups[window_key] = current_window

    return groups


def _compute_oversupply_ratio(
    projected_supply_quintals: float,
    historical_absorption_quintals: float,
) -> float:
    """
    Compute oversupply ratio.

    Args:
        projected_supply_quintals: Total expected supply
        historical_absorption_quintals: Historical mandi capacity

    Returns:
        Ratio (1.0 = exactly at capacity)
    """
    if historical_absorption_quintals <= 0:
        return 2.0  # Conservative: assume oversupply
    return projected_supply_quintals / historical_absorption_quintals


def _severity_from_ratio(ratio: float) -> Severity:
    """
    Map oversupply ratio to severity level.

    Thresholds:
    - ratio <= 1.0: LOW (no alert)
    - 1.0 < ratio <= 1.2: MEDIUM
    - 1.2 < ratio <= 1.5: HIGH
    - ratio > 1.5: CRITICAL
    """
    if ratio <= 1.0:
        return Severity.LOW
    elif ratio <= 1.2:
        return Severity.MEDIUM
    elif ratio <= 1.5:
        return Severity.HIGH
    else:
        return Severity.CRITICAL


# =============================================================================
# Input schema for Gemini
# =============================================================================


class OversupplyInput(BaseModel):
    """Structured input for oversupply detection."""

    block_id: str
    crop: str
    harvest_intents: list[dict] = Field(default_factory=list)
    historical_absorption_quintals: float = Field(
        ..., description="Historical average absorption (quintals) for this crop in this block"
    )
    current_arrivals_tonnes: float = Field(default=0.0, description="Current day's arrivals at nearby mandi (tonnes)")
    recent_prices: list[dict] = Field(default_factory=list, description="Recent prices at nearby mandi")


# =============================================================================
# Main detection function
# =============================================================================

SYSTEM_PROMPT = """You are the Block Oversupply Detector for Mandi-Agent.

Your job is to detect when too many farmers in the same 6km block are planning to harvest the same crop in the same week — causing a local price crash.

You receive:
- List of harvest intents from all farmers in the block (each with quantity, harvest date, growth stage)
- Historical mandi absorption data (how much the mandi typically absorbs per week)
- Current arrival trends at the mandi

You must:
1. Calculate projected supply vs historical absorption
2. If supply exceeds absorption by more than 20% (ratio > 1.2), this is an oversupply event
3. Recommend which farmers should redirect to alternate mandis, and which should hold 5-7 days
4. Flag the severity: low / medium / high / critical

When recommending actions:
- If oversupply ratio is 1.2-1.5: recommend top 30% of farmers (by quantity) to redirect
- If oversupply ratio > 1.5: recommend top 50% of farmers to redirect or hold
- Prioritize redirecting farmers with: smaller quantities, closer alternate mandis, more perishable crops

Output a JSON object with these fields:
- block_id: string
- crop: string
- harvest_window_start: date (YYYY-MM-DD)
- harvest_window_end: date (YYYY-MM-DD)
- projected_supply_quintals: float
- historical_absorption_quintals: float
- oversupply_ratio: float
- affected_farmer_ids: list of strings
- severity: "low" | "medium" | "high" | "critical"
- recommended_action: string (detailed recommendation)"""


async def detect_oversupply(
    block_id: str,
    crop: str,
    harvest_intents: list[HarvestIntent],
    mandi_history: list[MandiPrice],
    historical_absorption_quintals: float,
    current_arrivals_tonnes: float = 0.0,
) -> BlockOversupplyAlert | None:
    """
    Detect oversupply conditions for a block + crop.

    Groups farmers by overlapping harvest windows, computes
    supply vs absorption ratio, and generates an alert if ratio > 1.2.

    Args:
        block_id: 6km block identifier
        crop: Crop name
        harvest_intents: All harvest intents for this block + crop
        mandi_history: Recent MandiPrice records for trend analysis
        historical_absorption_quintals: Historical weekly absorption (quintals)
        current_arrivals_tonnes: Today's arrivals in tonnes

    Returns:
        BlockOversupplyAlert if oversupply detected (ratio > 1.0), else None
    """
    if not harvest_intents:
        return None

    # Filter intents for this crop
    crop_intents = [i for i in harvest_intents if i.crop.lower() == crop.lower()]
    if not crop_intents:
        return None

    # Group by harvest window
    window_groups = _group_intents_by_window(crop_intents, window_days=7)

    # Find the window with maximum supply
    best_window_key = max(window_groups.keys(), key=lambda k: sum(i.quantity_quintals for i in window_groups[k]))
    window_intents = window_groups[best_window_key]

    # Calculate total projected supply
    projected_supply = sum(i.quantity_quintals for i in window_intents)

    # Include current arrivals if happening now
    total_projected = projected_supply + (current_arrivals_tonnes * 10)  # Convert tonnes to quintals

    # Compute oversupply ratio
    ratio = _compute_oversupply_ratio(total_projected, historical_absorption_quintals)

    # If ratio <= 1.0, no oversupply
    if ratio <= 1.0:
        logger.debug(
            "No oversupply for %s/%s: ratio=%.2f (supply=%.0f, absorption=%.0f)",
            block_id,
            crop,
            ratio,
            total_projected,
            historical_absorption_quintals,
        )
        return None

    # Determine severity
    severity = _severity_from_ratio(ratio)

    # Get affected farmer IDs
    affected_farmer_ids = [i.farmer_id for i in window_intents]

    # Determine harvest window dates
    harvest_dates = [i.expected_harvest_date for i in window_intents]
    window_start = min(harvest_dates)
    window_end = max(harvest_dates)

    # Build recommendation
    if ratio > 1.5:
        hold_msg = "top 50% of farmers (by quantity) should redirect to alternate mandis or hold 5-7 days"
    elif ratio > 1.2:
        hold_msg = "top 30% of farmers (by quantity) should redirect or hold 3-5 days"
    else:
        hold_msg = "top 20% of farmers should monitor prices and consider early sale"

    recommended_action = (
        f"OVERSUPPLY ALERT: {crop} harvest in {block_id} exceeds mandi capacity by {(ratio - 1) * 100:.0f}%. "
        f"Projected supply: {total_projected:.0f} quintals. Historical absorption: {historical_absorption_quintals:.0f} quintals. "
        f"Affected farmers: {len(affected_farmer_ids)}. "
        f"Action required: {hold_msg}. "
        f"Alternative: form Virtual Cooperative bundle to reach distant mandi with better prices."
    )

    logger.warning(
        "Oversupply detected: block=%s crop=%s ratio=%.2f severity=%s farmers=%d",
        block_id,
        crop,
        ratio,
        severity.value,
        len(affected_farmer_ids),
    )

    return BlockOversupplyAlert(
        block_id=block_id,
        crop=crop,
        harvest_window_start=window_start,
        harvest_window_end=window_end,
        projected_supply_quintals=total_projected,
        historical_absorption_quintals=historical_absorption_quintals,
        oversupply_ratio=round(ratio, 3),
        affected_farmer_ids=affected_farmer_ids,
        severity=severity,
        recommended_action=recommended_action,
    )


async def scan_all_blocks(
    all_intents: list[HarvestIntent],
    block_crop_pairs: list[tuple[str, str]],
    historical_absorption: dict[tuple[str, str], float],
) -> list[BlockOversupplyAlert]:
    """
    Scan multiple block+crop combinations for oversupply.

    Args:
        all_intents: All harvest intents in the system
        block_crop_pairs: List of (block_id, crop) to check
        historical_absorption: Dict mapping (block_id, crop) -> absorption quintals

    Returns:
        List of all detected BlockOversupplyAlert records
    """
    alerts: list[BlockOversupplyAlert] = []

    for block_id, crop in block_crop_pairs:
        # Get intents for this block + crop
        intents = [i for i in all_intents if i.block_id == block_id and i.crop.lower() == crop.lower()]

        absorption = historical_absorption.get((block_id, crop), 0.0)
        if absorption <= 0:
            continue

        alert = await detect_oversupply(
            block_id=block_id,
            crop=crop,
            harvest_intents=intents,
            mandi_history=[],  # TODO: fetch relevant mandi history
            historical_absorption_quintals=absorption,
        )

        if alert:
            alerts.append(alert)

    return alerts


if __name__ == "__main__":
    # Smoke test
    logging.basicConfig(level=logging.INFO)

    async def test():
        from datetime import date as date_cls

        sample_intents = [
            HarvestIntent(
                intent_id="I1",
                farmer_id="F1",
                crop="tomato",
                quantity_quintals=15.0,
                expected_harvest_date=date_cls(2026, 3, 25),
                current_growth_stage="mature",
                block_id="KA-001",
                submitted_at=None,
            ),
            HarvestIntent(
                intent_id="I2",
                farmer_id="F2",
                crop="tomato",
                quantity_quintals=12.0,
                expected_harvest_date=date_cls(2026, 3, 26),
                current_growth_stage="mature",
                block_id="KA-001",
                submitted_at=None,
            ),
            HarvestIntent(
                intent_id="I3",
                farmer_id="F3",
                crop="tomato",
                quantity_quintals=18.0,
                expected_harvest_date=date_cls(2026, 3, 27),
                current_growth_stage="mature",
                block_id="KA-001",
                submitted_at=None,
            ),
        ]

        # Historical absorption: 30 quintals/week
        alert = await detect_oversupply(
            block_id="KA-001",
            crop="tomato",
            harvest_intents=sample_intents,
            mandi_history=[],
            historical_absorption_quintals=30.0,
        )

        if alert:
            print(f"Oversupply Alert: {alert.crop} in {alert.block_id}")
            print(f"Severity: {alert.severity.value}")
            print(f"Ratio: {alert.oversupply_ratio:.2f}")
            print(
                f"Supply: {alert.projected_supply_quintals:.0f}q / Absorption: {alert.historical_absorption_quintals:.0f}q"
            )
            print(f"Affected farmers: {len(alert.affected_farmer_ids)}")
            print(f"Action: {alert.recommended_action[:150]}...")
        else:
            print("No oversupply detected")

    asyncio.run(test())
