"""
Stage 1: Deterministic Decision Engine
======================================
Rule-based harvest/market decision logic.
Completely deterministic — same inputs always produce same decision.

Decision logic:
- Price direction + spoilage risk → harvest timing
- Bundle availability + savings → recommendation strength
- Mandi selection → best price + distance
"""

import logging
from dataclasses import dataclass
from enum import StrEnum

from mandi_agent.backend.api.core_schemas import (
    CooperativeBundle,
    Decision,
    PriceDirection,
    PriceForecast,
    RiskLevel,
    SpoilageRisk,
)

logger = logging.getLogger(__name__)


class DecisionFactor(StrEnum):
    """Factors influencing the decision."""

    SPOILAGE_CRITICAL = "spoilage_critical"  # >= 60%
    SPOILAGE_HIGH = "spoilage_high"  # 40-60%
    SPOILAGE_MODERATE = "spoilage_moderate"  # 20-40%
    SPOILAGE_LOW = "spoilage_low"  # < 20%
    PRICE_FALLING = "price_falling"
    PRICE_STABLE = "price_stable"
    PRICE_RISING = "price_rising"
    BUNDLE_AVAILABLE_HIGH_SAVING = "bundle_available_high_saving"  # > 200/q
    BUNDLE_AVAILABLE_LOW_SAVING = "bundle_available_low_saving"  # <= 200/q
    NO_BUNDLE = "no_bundle"


@dataclass
class StructuredDecision:
    """
    Locked-in decision with reasoning factors.
    This object is deterministic and testable.
    """

    decision: Decision
    primary_factor: DecisionFactor
    secondary_factors: list[DecisionFactor]

    # Numeric factors (for explanation)
    spoilage_pct: float
    price_forecast_inr: float
    price_direction: PriceDirection

    # Mandi selection
    target_mandi: str

    # Bundle info
    bundle_available: bool
    bundle_saving_per_q: float | None = None

    # Scoring for confidence
    decision_confidence: float = 0.85  # Default confidence

    # Human-readable reasoning
    reasoning_short: str = ""  # 1-line reason

    def __post_init__(self):
        """Generate reasoning after init."""
        if not self.reasoning_short:
            self.reasoning_short = self._generate_reasoning()

    def _generate_reasoning(self) -> str:
        """Auto-generate short reasoning from factors."""
        if self.primary_factor == DecisionFactor.SPOILAGE_CRITICAL:
            return f"Spoilage risk critical ({self.spoilage_pct:.0f}%) — harvest immediately"
        elif self.primary_factor == DecisionFactor.PRICE_FALLING:
            return f"Prices falling ({self.price_direction.value}) — sell now at ₹{self.price_forecast_inr:.0f}/q"
        elif self.primary_factor == DecisionFactor.PRICE_RISING:
            return f"Prices rising — hold to reach ₹{self.price_forecast_inr:.0f}/q"
        elif self.primary_factor == DecisionFactor.BUNDLE_AVAILABLE_HIGH_SAVING:
            return f"Bundle saves ₹{self.bundle_saving_per_q:.0f}/q — join collective"
        else:
            return "Best time to harvest"


def analyze_spoilage(spoilage: SpoilageRisk) -> DecisionFactor:
    """Categorize spoilage risk into decision factors."""
    risk_pct = spoilage.spoilage_probability * 100

    if risk_pct >= 60:
        return DecisionFactor.SPOILAGE_CRITICAL
    elif 40 <= risk_pct < 60:
        return DecisionFactor.SPOILAGE_HIGH
    elif 20 <= risk_pct < 40:
        return DecisionFactor.SPOILAGE_MODERATE
    else:
        return DecisionFactor.SPOILAGE_LOW


def analyze_price(price: PriceForecast) -> DecisionFactor:
    """Categorize price direction into decision factors."""
    if price.price_direction == PriceDirection.FALLING:
        return DecisionFactor.PRICE_FALLING
    elif price.price_direction == PriceDirection.RISING:
        return DecisionFactor.PRICE_RISING
    else:
        return DecisionFactor.PRICE_STABLE


def analyze_bundle(bundle: CooperativeBundle | None) -> DecisionFactor:
    """Categorize bundle availability."""
    if not bundle:
        return DecisionFactor.NO_BUNDLE

    if bundle.transport_saving_per_quintal >= 200:
        return DecisionFactor.BUNDLE_AVAILABLE_HIGH_SAVING
    else:
        return DecisionFactor.BUNDLE_AVAILABLE_LOW_SAVING


def make_decision(
    price_forecast: PriceForecast,
    spoilage_risk: SpoilageRisk,
    bundle: CooperativeBundle | None,
) -> StructuredDecision:
    """
    DETERMINISTIC decision engine.
    Same inputs always produce same decision.

    Priority order:
    1. If spoilage >= 60%: HARVEST_NOW (override everything)
    2. If price falling: HARVEST_NOW
    3. If bundle available with high saving: HOLD (use bundle)
    4. If price rising & spoilage < 40%: HOLD_3_DAYS
    5. Default: HARVEST_NOW

    Args:
        price_forecast: PriceForecast from ML model
        spoilage_risk: SpoilageRisk assessment
        bundle: Optional CooperativeBundle

    Returns:
        StructuredDecision with locked-in decision
    """

    # Analyze each factor
    spoilage_factor = analyze_spoilage(spoilage_risk)
    price_factor = analyze_price(price_forecast)
    bundle_factor = analyze_bundle(bundle)

    spoilage_pct = spoilage_risk.spoilage_probability * 100

    # ============ DECISION TREE ============

    # Rule 1: CRITICAL SPOILAGE overrides everything
    if spoilage_pct >= 60:
        decision = Decision.HARVEST_NOW
        primary_factor = DecisionFactor.SPOILAGE_CRITICAL
        secondary_factors = [price_factor, bundle_factor]
        confidence = 0.95  # Very confident

    # Rule 2: FALLING PRICES → harvest now
    elif price_forecast.price_direction == PriceDirection.FALLING:
        decision = Decision.HARVEST_NOW
        primary_factor = DecisionFactor.PRICE_FALLING
        secondary_factors = [spoilage_factor, bundle_factor]
        confidence = 0.90

    # Rule 3: BUNDLE AVAILABLE with high saving → hold & use bundle
    elif bundle and bundle.transport_saving_per_quintal >= 200:
        decision = Decision.HOLD_3_DAYS  # Hold to organize logistics
        primary_factor = DecisionFactor.BUNDLE_AVAILABLE_HIGH_SAVING
        secondary_factors = [spoilage_factor, price_factor]
        confidence = 0.88

    # Rule 4: RISING PRICES + LOW SPOILAGE → hold 3 days
    elif price_forecast.price_direction == PriceDirection.RISING and spoilage_pct < 40:
        decision = Decision.HOLD_3_DAYS
        primary_factor = DecisionFactor.PRICE_RISING
        secondary_factors = [spoilage_factor, bundle_factor]
        confidence = 0.80

    # Rule 5: HIGH SPOILAGE (40-60%) + STABLE/RISING PRICE → hold briefly
    elif (
        spoilage_pct >= 40
        and spoilage_pct < 60
        and price_forecast.price_direction in [PriceDirection.RISING, PriceDirection.STABLE]
    ):
        decision = Decision.HOLD_3_DAYS
        primary_factor = spoilage_factor
        secondary_factors = [price_factor, bundle_factor]
        confidence = 0.75

    # Rule 6: Default → harvest now
    else:
        decision = Decision.HARVEST_NOW
        primary_factor = spoilage_factor
        secondary_factors = [price_factor, bundle_factor]
        confidence = 0.70

    # ============ MANDI SELECTION ============
    # Prefer bundle's target mandi if available, else use forecast mandi
    target_mandi = bundle.target_mandi if bundle else price_forecast.mandi_name

    # ============ BUILD DECISION OBJECT ============
    return StructuredDecision(
        decision=decision,
        primary_factor=primary_factor,
        secondary_factors=secondary_factors,
        spoilage_pct=spoilage_pct,
        price_forecast_inr=price_forecast.predicted_price,
        price_direction=price_forecast.price_direction,
        target_mandi=target_mandi,
        bundle_available=bundle is not None,
        bundle_saving_per_q=bundle.transport_saving_per_quintal if bundle else None,
        decision_confidence=confidence,
    )


# Unit tests (run with: python -m pytest mandi_agent/backend/agents/decision_engine.py)
if __name__ == "__main__":
    from datetime import date

    # Test case 1: Critical spoilage overrides rising prices
    print("Test 1: Critical spoilage overrides rising prices")
    price = PriceForecast(
        crop="tomato",
        mandi_name="Ballabgarh",
        forecast_date=date.today(),
        predicted_price=2500.0,
        confidence=0.85,
        price_direction=PriceDirection.RISING,
        reasoning="Festival demand",
        model_used="xgboost",
        days_ahead=7,
    )
    spoilage = SpoilageRisk(
        farmer_id="F001",
        crop="tomato",
        harvest_date=date.today(),
        transit_hours=6.0,
        ambient_temp_celsius=35.0,
        shelf_life_hours=48.0,
        spoilage_probability=0.65,  # 65% — critical
        risk_level=RiskLevel.CRITICAL,
        recommendation="Harvest immediately",
    )
    decision = make_decision(price, spoilage, None)
    assert decision.decision == Decision.HARVEST_NOW, f"Expected HARVEST_NOW, got {decision.decision}"
    assert decision.primary_factor == DecisionFactor.SPOILAGE_CRITICAL
    print(f"✓ {decision.decision.value} | Confidence: {decision.decision_confidence:.0%}")

    # Test case 2: Rising prices + low spoilage → hold
    print("\nTest 2: Rising prices + low spoilage → hold")
    spoilage = SpoilageRisk(
        farmer_id="F001",
        crop="wheat",
        harvest_date=date.today(),
        transit_hours=2.0,
        ambient_temp_celsius=25.0,
        shelf_life_hours=720.0,  # High shelf life
        spoilage_probability=0.05,  # 5% — low
        risk_level=RiskLevel.SAFE,
        recommendation="Safe to store",
    )
    decision = make_decision(price, spoilage, None)
    assert decision.decision == Decision.HOLD_3_DAYS
    assert decision.primary_factor == DecisionFactor.PRICE_RISING
    print(f"✓ {decision.decision.value} | Confidence: {decision.decision_confidence:.0%}")

    # Test case 3: Bundle with high saving → hold
    print("\nTest 3: Bundle with high saving → hold")
    bundle = CooperativeBundle(
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
        transport_saving_per_quintal=250.0,  # High saving
    )
    price = PriceForecast(
        crop="wheat",
        mandi_name="Ballabgarh",
        forecast_date=date.today(),
        predicted_price=2150.0,
        confidence=0.80,
        price_direction=PriceDirection.STABLE,
        reasoning="Seasonal stability",
        model_used="xgboost",
        days_ahead=7,
    )
    decision = make_decision(price, spoilage, bundle)
    assert decision.decision == Decision.HOLD_3_DAYS
    assert decision.primary_factor == DecisionFactor.BUNDLE_AVAILABLE_HIGH_SAVING
    assert decision.target_mandi == "Delhi Wholesale"
    print(f"✓ {decision.decision.value} | Saving: ₹{decision.bundle_saving_per_q:.0f}/q")

    # Test case 4: Falling prices → harvest now
    print("\nTest 4: Falling prices → harvest now")
    price_falling = PriceForecast(
        crop="wheat",
        mandi_name="Ballabgarh",
        forecast_date=date.today(),
        predicted_price=1900.0,
        confidence=0.75,
        price_direction=PriceDirection.FALLING,
        reasoning="Oversupply expected",
        model_used="xgboost",
        days_ahead=7,
    )
    decision = make_decision(price_falling, spoilage, None)
    assert decision.decision == Decision.HARVEST_NOW
    assert decision.primary_factor == DecisionFactor.PRICE_FALLING
    print(f"✓ {decision.decision.value} | Falling to ₹{decision.price_forecast_inr:.0f}/q")

    print("\n✅ All tests passed!")
