"""
Integration Tests for 3-Stage Advisory Pipeline
================================================

Verify:
1. Deterministic decision-making
2. Consistent explanation extraction
3. Reliable text rendering
4. No randomness across multiple runs
"""

import logging
from datetime import date

from mandi_agent.backend.agents.advisory_renderer import render_advisory
from mandi_agent.backend.agents.decision_engine import make_decision
from mandi_agent.backend.agents.explanation_extractor import extract_explanation
from mandi_agent.backend.api.core_schemas import (
    CooperativeBundle,
    PriceDirection,
    PriceForecast,
    RiskLevel,
    SpoilageRisk,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_deterministic_decisions():
    """
    Test 1: Same inputs must always produce same decision.
    Run same scenario 3 times and verify output is identical.
    """
    print("\n" + "=" * 70)
    print("TEST 1: Deterministic Decisions (3 runs)")
    print("=" * 70)

    price = PriceForecast(
        crop="wheat",
        mandi_name="Ballabgarh",
        forecast_date=date.today(),
        predicted_price=2200.0,
        confidence=0.85,
        price_direction=PriceDirection.RISING,
        reasoning="Festival demand",
        model_used="xgboost",
        days_ahead=7,
    )

    spoilage = SpoilageRisk(
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

    # Run 3 times
    decisions = []
    for i in range(3):
        decision = make_decision(price, spoilage, None)
        decisions.append(decision)
        print(f"  Run {i + 1}: {decision.decision.value} (confidence: {decision.decision_confidence:.0%})")

    # Verify all identical
    assert all(d.decision == decisions[0].decision for d in decisions)
    assert all(d.decision_confidence == decisions[0].decision_confidence for d in decisions)
    assert all(d.target_mandi == decisions[0].target_mandi for d in decisions)

    print(f"  ✓ All 3 runs produced identical decision: {decisions[0].decision.value}")


def test_deterministic_explanations():
    """
    Test 2: Extraction must be deterministic.
    Run explanation extraction 3 times with same data.
    """
    print("\n" + "=" * 70)
    print("TEST 2: Deterministic Explanations (3 runs)")
    print("=" * 70)

    price = PriceForecast(
        crop="wheat",
        mandi_name="Ballabgarh",
        forecast_date=date.today(),
        predicted_price=2200.0,
        confidence=0.85,
        price_direction=PriceDirection.RISING,
        reasoning="Festival demand",
        model_used="xgboost",
        days_ahead=7,
    )

    spoilage = SpoilageRisk(
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

    decision = make_decision(price, spoilage, None)

    rag_context = [
        {
            "content": "Festival season approaching. High demand for wheat expected.",
            "source": "agmarknet",
            "similarity": 0.92,
        },
        {
            "content": "Wheat shelf life in cool storage: 6-8 months.",
            "source": "icar",
            "similarity": 0.88,
        },
        {
            "content": "Ballabgarh mandi receiving steady arrivals.",
            "source": "enam",
            "similarity": 0.85,
        },
    ]

    # Run 3 times
    explanations = []
    for i in range(3):
        explanation = extract_explanation(decision, rag_context)
        explanations.append(explanation)
        print(f"  Run {i + 1}: {explanation.recommendation[:50]}...")

    # Verify all identical
    assert all(e.current_situation == explanations[0].current_situation for e in explanations)
    assert all(e.price_context == explanations[0].price_context for e in explanations)
    assert all(e.recommendation == explanations[0].recommendation for e in explanations)

    print("  ✓ All 3 runs produced identical explanation")


def test_deterministic_rendering():
    """
    Test 3: Text rendering must be deterministic.
    Run 3 times with same structured data.
    """
    print("\n" + "=" * 70)
    print("TEST 3: Deterministic Text Rendering (3 runs)")
    print("=" * 70)

    price = PriceForecast(
        crop="wheat",
        mandi_name="Ballabgarh",
        forecast_date=date.today(),
        predicted_price=2200.0,
        confidence=0.85,
        price_direction=PriceDirection.RISING,
        reasoning="Festival demand",
        model_used="xgboost",
        days_ahead=7,
    )

    spoilage = SpoilageRisk(
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

    decision = make_decision(price, spoilage, None)

    rag_context = [
        {
            "content": "Festival season approaching. High demand for wheat expected.",
            "source": "agmarknet",
            "similarity": 0.92,
        },
    ]

    explanation = extract_explanation(decision, rag_context)

    # Run 3 times
    advisories = []
    for i in range(3):
        advisory = render_advisory(decision, explanation, crop_name="wheat")
        advisories.append(advisory)
        print(f"  Run {i + 1}: '{advisory.full_text[:60]}...'")

    # Verify all identical
    assert all(a.full_text == advisories[0].full_text for a in advisories)
    assert all(a.emoji_decision == advisories[0].emoji_decision for a in advisories)
    assert all(a.action_summary == advisories[0].action_summary for a in advisories)

    print("  ✓ All 3 runs produced identical advisory text")


def test_decision_rules():
    """
    Test 4: Verify decision rules work as documented.
    Test all major decision paths.
    """
    print("\n" + "=" * 70)
    print("TEST 4: Decision Rules Verification")
    print("=" * 70)

    # Rule 1: Critical spoilage overrides everything
    print("  Rule 1: Critical spoilage (≥60%) → HARVEST_NOW")
    price_rising = PriceForecast(
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
    high_spoilage = SpoilageRisk(
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
    decision = make_decision(price_rising, high_spoilage, None)
    assert decision.decision.value == "harvest_now", f"Expected harvest_now, got {decision.decision.value}"
    print(f"    ✓ {decision.decision.value} (confidence: {decision.decision_confidence:.0%})")

    # Rule 2: Falling prices → HARVEST_NOW
    print("  Rule 2: Falling prices → HARVEST_NOW")
    price_falling = PriceForecast(
        crop="wheat",
        mandi_name="Ballabgarh",
        forecast_date=date.today(),
        predicted_price=1800.0,
        confidence=0.80,
        price_direction=PriceDirection.FALLING,
        reasoning="Oversupply",
        model_used="xgboost",
        days_ahead=7,
    )
    low_spoilage = SpoilageRisk(
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
    decision = make_decision(price_falling, low_spoilage, None)
    assert decision.decision.value == "harvest_now"
    print(f"    ✓ {decision.decision.value}")

    # Rule 3: Bundle with high saving → HOLD_3_DAYS
    print("  Rule 3: Bundle with high saving (≥₹200/q) → HOLD_3_DAYS")
    bundle = CooperativeBundle(
        bundle_id="B001",
        block_id="HR-001",
        crop="wheat",
        farmer_ids=["F001", "F002", "F003"],
        total_quantity_quintals=50.0,
        target_mandi="Delhi",
        target_mandi_lat=28.6139,
        target_mandi_lng=77.2090,
        delivery_window_start=date.today(),
        delivery_window_end=date.today(),
        forecast_price=2300.0,
        transport_saving_per_quintal=250.0,
    )
    price_stable = PriceForecast(
        crop="wheat",
        mandi_name="Ballabgarh",
        forecast_date=date.today(),
        predicted_price=2200.0,
        confidence=0.80,
        price_direction=PriceDirection.STABLE,
        reasoning="Normal market",
        model_used="xgboost",
        days_ahead=7,
    )
    decision = make_decision(price_stable, low_spoilage, bundle)
    assert decision.decision.value == "hold_3_days"
    print(f"    ✓ {decision.decision.value} (saving: ₹{decision.bundle_saving_per_q:.0f}/q)")

    # Rule 4: Rising prices + low spoilage → HOLD_3_DAYS
    print("  Rule 4: Rising prices + low spoilage (<40%) → HOLD_3_DAYS")
    decision = make_decision(price_rising, low_spoilage, None)
    assert decision.decision.value == "hold_3_days"
    print(f"    ✓ {decision.decision.value}")

    print("\n  ✅ All decision rules verified!")


def test_bundle_preference():
    """
    Test 5: Bundle selection and preference.
    """
    print("\n" + "=" * 70)
    print("TEST 5: Bundle Preference")
    print("=" * 70)

    price = PriceForecast(
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

    spoilage = SpoilageRisk(
        farmer_id="F001",
        crop="wheat",
        harvest_date=date.today(),
        transit_hours=2.0,
        ambient_temp_celsius=25.0,
        shelf_life_hours=720.0,
        spoilage_probability=0.05,
        risk_level=RiskLevel.SAFE,
        recommendation="Safe",
    )

    bundle = CooperativeBundle(
        bundle_id="B001",
        block_id="HR-001",
        crop="wheat",
        farmer_ids=["F001", "F002"],
        total_quantity_quintals=30.0,
        target_mandi="Delhi Wholesale",
        target_mandi_lat=28.6139,
        target_mandi_lng=77.2090,
        delivery_window_start=date.today(),
        delivery_window_end=date.today(),
        forecast_price=2300.0,
        transport_saving_per_quintal=220.0,
    )

    decision = make_decision(price, spoilage, bundle)

    # Verify bundle mandi is selected
    assert decision.target_mandi == "Delhi Wholesale", f"Expected bundle mandi, got {decision.target_mandi}"
    print(f"  ✓ Bundle mandi selected: {decision.target_mandi}")
    print(f"  ✓ Bundle saving: ₹{decision.bundle_saving_per_q:.0f}/quintal")


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("3-STAGE ADVISORY PIPELINE — INTEGRATION TESTS")
    print("=" * 70)

    try:
        test_deterministic_decisions()
        test_deterministic_explanations()
        test_deterministic_rendering()
        test_decision_rules()
        test_bundle_preference()

        print("\n" + "=" * 70)
        print("✅ ALL TESTS PASSED!")
        print("=" * 70)
        print("\nKey Results:")
        print("  • Decisions are deterministic (same input → same output)")
        print("  • Explanations are deterministic (extracted, not generated)")
        print("  • Rendering is deterministic (template-based)")
        print("  • All decision rules validated")
        print("  • Bundle preference working correctly")
        print("\n📊 No randomness in advisory generation!")

    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback

        traceback.print_exc()
        exit(1)
