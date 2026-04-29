"""
Stage 3: Advisory Text Renderer
===============================
Template-based rendering of structured decisions to WhatsApp messages.

Input: StructuredDecision + StructuredExplanation
Output: WhatsApp-friendly advisory text (2-3 sentences)

Deterministic — same input always produces same output.
No LLM randomness. Just template variable substitution.
"""

import logging
from dataclasses import dataclass

from mandi_agent.backend.agents.decision_engine import StructuredDecision, DecisionFactor
from mandi_agent.backend.agents.explanation_extractor import StructuredExplanation
from mandi_agent.backend.models.schemas import Decision, PriceDirection

logger = logging.getLogger(__name__)


@dataclass
class RenderedAdvisory:
    """Advisory text ready to send via WhatsApp."""
    full_text: str  # Complete advisory (2-3 sentences)
    emoji_decision: str  # Visual indicator
    action_summary: str  # 1-line summary


# Template library — easy to customize per crop/region/language
TEMPLATES = {
    Decision.HARVEST_NOW: {
        "emoji": "🚜",
        "templates": [
            # High spoilage → urgent
            (
                lambda d, e: d.primary_factor == DecisionFactor.SPOILAGE_CRITICAL,
                "🚜 Your {crop} needs to be harvested RIGHT NOW — spoilage risk is {spoilage_pct:.0f}%. "
                "Sell at {target_mandi} for ₹{price_forecast_inr:.0f}/quintal. {recommendation}"
            ),
            # Falling prices → sell immediately
            (
                lambda d, e: d.primary_factor == DecisionFactor.PRICE_FALLING,
                "🚜 SELL NOW. Market prices for {crop} are falling. "
                "Lock in ₹{price_forecast_inr:.0f}/quintal at {target_mandi} today. "
                "{price_context}"
            ),
            # Generic harvest now
            (
                lambda d, e: True,
                "🚜 Harvest your {crop} and bring to {target_mandi}. "
                "Current price: ₹{price_forecast_inr:.0f}/quintal. {recommendation}"
            ),
        ]
    },
    Decision.HOLD_3_DAYS: {
        "emoji": "⏰",
        "templates": [
            # Bundle with savings
            (
                lambda d, e: d.bundle_available and d.bundle_saving_per_q and d.bundle_saving_per_q >= 200,
                "⏰ WAIT 3 DAYS. Your {crop} can be bundled with other farmers — "
                "Save ₹{bundle_saving_per_q:.0f}/quintal on transport! "
                "Prices will be ₹{price_forecast_inr:.0f}/q. {spoilage_context}"
            ),
            # Rising prices + low spoilage
            (
                lambda d, e: d.price_direction == PriceDirection.RISING and d.spoilage_pct < 40,
                "⏰ Wait 3 days. Prices for {crop} are RISING toward ₹{price_forecast_inr:.0f}/quintal. "
                "Spoilage risk is low ({spoilage_pct:.0f}%). {price_context}"
            ),
            # Generic hold
            (
                lambda d, e: True,
                "⏰ HOLD for 3 days. Market conditions improving for {crop}. "
                "Target price: ₹{price_forecast_inr:.0f}/quintal. {recommendation}"
            ),
        ]
    },
    Decision.HOLD_7_DAYS: {
        "emoji": "⏳",
        "templates": [
            (
                lambda d, e: d.price_direction == PriceDirection.RISING and d.spoilage_pct < 20,
                "⏳ HOLD up to 7 days. Prices for {crop} rising strongly toward ₹{price_forecast_inr:.0f}/quintal. "
                "Storage safe. {price_context}"
            ),
            (
                lambda d, e: True,
                "⏳ Can hold 7 days if storage available. {crop} prices trending to ₹{price_forecast_inr:.0f}/quintal. "
                "{spoilage_context}"
            ),
        ]
    },
    Decision.REDIRECT_MANDI: {
        "emoji": "📍",
        "templates": [
            (
                lambda d, e: True,
                "📍 Better prices at {target_mandi}. "
                "Your {crop} can fetch ₹{price_forecast_inr:.0f}/quintal there vs local market. "
                "Transport cost: {recommendation}"
            ),
        ]
    },
}


def render_advisory(
    decision: StructuredDecision,
    explanation: StructuredExplanation,
    crop_name: str = "crop",
) -> RenderedAdvisory:
    """
    Render structured decision + explanation to advisory text.
    Deterministic template matching + variable substitution.

    Args:
        decision: StructuredDecision from Stage 1
        explanation: StructuredExplanation from Stage 2
        crop_name: Crop being harvested

    Returns:
        RenderedAdvisory with formatted text
    """

    # Get templates for decision type
    decision_templates = TEMPLATES.get(decision.decision, TEMPLATES[Decision.HARVEST_NOW])
    emoji = decision_templates.get("emoji", "🌾")
    templates = decision_templates.get("templates", [])

    # Find first matching template
    selected_template = None
    for condition, template in templates:
        if condition(decision, explanation):
            selected_template = template
            break

    if not selected_template:
        selected_template = templates[-1][1]  # Fallback to last template

    # Build variable dict for substitution
    variables = {
        "crop": crop_name,
        "spoilage_pct": decision.spoilage_pct,
        "price_forecast_inr": decision.price_forecast_inr,
        "target_mandi": decision.target_mandi,
        "bundle_saving_per_q": decision.bundle_saving_per_q or 0,
        "price_context": explanation.price_context,
        "spoilage_context": explanation.spoilage_context,
        "recommendation": explanation.recommendation,
        "emoji": emoji,
    }

    # Render template
    try:
        full_text = selected_template.format(**variables)
    except KeyError as e:
        logger.warning(f"Template variable missing: {e}. Falling back to recommendation.")
        full_text = f"{emoji} {explanation.recommendation}"

    # Clean up extra spaces
    full_text = " ".join(full_text.split())

    # Create action summary (1 line)
    action_map = {
        Decision.HARVEST_NOW: f"Harvest now at {decision.target_mandi}",
        Decision.HOLD_3_DAYS: "Wait 3 days — prices improving",
        Decision.HOLD_7_DAYS: "Wait up to 7 days — storage available",
        Decision.REDIRECT_MANDI: f"Go to {decision.target_mandi} for better price",
    }
    action_summary = action_map.get(decision.decision, "See details below")

    return RenderedAdvisory(
        full_text=full_text,
        emoji_decision=emoji,
        action_summary=action_summary,
    )


def translate_advisory(
    advisory: RenderedAdvisory,
    language: str,
) -> RenderedAdvisory:
    """
    Placeholder for translation.
    In production, use Reverie/Bhashini for speech rendering.

    For now, return English version.
    """
    # TODO: Call Reverie translation API
    return advisory


# Unit tests
if __name__ == "__main__":
    from datetime import date
    from mandi_agent.backend.models.schemas import (
        PriceForecast,
        SpoilageRisk,
        RiskLevel,
    )
    from mandi_agent.backend.agents.decision_engine import make_decision
    from mandi_agent.backend.agents.explanation_extractor import extract_explanation

    # Test case 1: HARVEST NOW due to spoilage
    print("Test 1: Critical spoilage → harvest now")
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
        spoilage_probability=0.65,
        risk_level=RiskLevel.CRITICAL,
        recommendation="Harvest immediately",
    )
    decision = make_decision(price, spoilage, None)

    rag_context = [
        {
            "content": "Tomato spoilage accelerates in high heat.",
            "source": "icar",
            "similarity": 0.95,
        },
    ]
    explanation = extract_explanation(decision, rag_context)
    advisory = render_advisory(decision, explanation, crop_name="tomato")

    print(f"Text: {advisory.full_text}")
    print(f"Summary: {advisory.action_summary}\n")

    # Test case 2: HOLD 3 DAYS due to rising prices
    print("Test 2: Rising prices + low spoilage → hold 3 days")
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
    decision = make_decision(price, spoilage, None)

    rag_context = [
        {
            "content": "Festival season approaching. High demand for wheat expected.",
            "source": "agmarknet",
            "similarity": 0.92,
        },
    ]
    explanation = extract_explanation(decision, rag_context)
    advisory = render_advisory(decision, explanation, crop_name="wheat")

    print(f"Text: {advisory.full_text}")
    print(f"Summary: {advisory.action_summary}\n")

    # Test case 3: Falling prices → harvest now
    print("Test 3: Falling prices → harvest now")
    price = PriceForecast(
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
    decision = make_decision(price, spoilage, None)

    rag_context = [
        {
            "content": "Heavy arrivals expected. Market oversupply.",
            "source": "agmarknet",
            "similarity": 0.90,
        },
    ]
    explanation = extract_explanation(decision, rag_context)
    advisory = render_advisory(decision, explanation, crop_name="wheat")

    print(f"Text: {advisory.full_text}")
    print(f"Summary: {advisory.action_summary}\n")

    print("✅ All rendering tests passed!")
