"""
Stage 2: Explanation Extractor
==============================
Deterministic extraction of REASONS for the decision.

Uses:
- RAG context (why prices are rising/falling/stable)
- Structured decision factors
- Historical context from knowledge bases

Output: StructuredExplanation with key facts (no randomness)
"""

import logging
from dataclasses import dataclass
from typing import Any, Optional

from mandi_agent.backend.agents.decision_engine import (
    StructuredDecision,
    DecisionFactor,
)
from mandi_agent.backend.api.core_schemas import PriceDirection

logger = logging.getLogger(__name__)


@dataclass
class StructuredExplanation:
    """
    Structured explanation — deterministic and testable.
    Extracted from RAG context + decision logic, not generated.
    """
    # Key facts
    current_situation: str  # 1 sentence: what's happening now
    price_context: str  # 1 sentence: why prices are moving this way
    spoilage_context: str  # 1 sentence: shelf-life/storage context

    # Supporting data
    supporting_facts: list[str]  # Bulleted reasons from RAG

    # The recommendation
    recommendation: str  # 1 sentence action


def extract_price_context(
    rag_context: list[dict[str, Any]],
    decision: StructuredDecision,
) -> str:
    """
    Extract why prices are rising/falling from RAG chunks.
    Look for keywords in Agmarknet, e-NAM, KVK, weather sources.
    """

    # Search RAG context for price-related keywords
    keywords_by_direction = {
        PriceDirection.RISING: [
            "demand", "festival", "shortage", "low arrivals",
            "premium", "export", "scarcity", "reserve",
        ],
        PriceDirection.FALLING: [
            "oversupply", "glut", "surplus", "arrivals", "competition",
            "quality decline", "market saturation", "weak demand",
        ],
        PriceDirection.STABLE: [
            "equilibrium", "balanced", "steady", "normal", "expected",
        ],
    }

    direction_keywords = keywords_by_direction.get(decision.price_direction, [])

    # Search chunks for context
    relevant_facts = []
    for chunk in rag_context:
        content = chunk.get("content", "").lower()
        source = chunk.get("source", "unknown")

        # Check if any keyword matches
        for keyword in direction_keywords:
            if keyword in content:
                # Extract first 200 chars of chunk as fact
                fact = chunk.get("content", "")[:200].strip()
                relevant_facts.append(f"{fact} ({source})")
                break

    if relevant_facts:
        return relevant_facts[0]  # Use best match

    # Fallback to generic explanation
    if decision.price_direction == PriceDirection.RISING:
        return f"Market demand is high. ₹{decision.price_forecast_inr:.0f}/quintal expected."
    elif decision.price_direction == PriceDirection.FALLING:
        return f"Market supply is high. Prices expected at ₹{decision.price_forecast_inr:.0f}/quintal."
    else:
        return f"Prices stable around ₹{decision.price_forecast_inr:.0f}/quintal."


def extract_spoilage_context(
    rag_context: list[dict[str, Any]],
    decision: StructuredDecision,
) -> str:
    """
    Extract storage/spoilage context from ICAR shelf-life data in RAG.
    Look for crop-specific storage recommendations.
    """

    # Search for ICAR/storage chunks
    storage_facts = []
    for chunk in rag_context:
        content = chunk.get("content", "").lower()
        source = chunk.get("source", "unknown").lower()

        # Check if ICAR or storage-related
        if "icar" in source or "storage" in content or "shelf life" in content:
            fact = chunk.get("content", "")[:180].strip()
            storage_facts.append(fact)

    if storage_facts:
        return storage_facts[0]

    # Fallback based on spoilage risk
    risk_pct = decision.spoilage_pct
    if risk_pct >= 60:
        return "High spoilage risk — product deteriorates quickly in transit."
    elif risk_pct >= 40:
        return "Moderate spoilage risk — time-sensitive transport needed."
    elif risk_pct >= 20:
        return "Low spoilage risk — standard storage safe for 3-7 days."
    else:
        return "Minimal spoilage risk — product stores well. No urgency."


def extract_supporting_facts(
    rag_context: list[dict[str, Any]],
    decision: StructuredDecision,
    limit: int = 3,
) -> list[str]:
    """
    Extract top 3 supporting facts from RAG chunks.
    Rank by similarity/relevance, not by randomness.
    """

    facts = []

    # Sort by similarity score (highest first)
    sorted_chunks = sorted(
        rag_context,
        key=lambda x: x.get("similarity", 0.0),
        reverse=True,
    )

    for chunk in sorted_chunks[:limit]:
        content = chunk.get("content", "").strip()
        source = chunk.get("source", "unknown")
        similarity = chunk.get("similarity", 0.0)

        if content:
            # Truncate long facts
            fact = (content[:150] + "...") if len(content) > 150 else content
            facts.append(f"{fact} [{source}, {similarity:.0%} match]")

    return facts if facts else ["Market data from multiple sources analyzed."]


def extract_recommendation(decision: StructuredDecision) -> str:
    """
    Extract recommendation from decision + context.
    Deterministic based on decision object.
    """

    recommendation_map = {
        "harvest_now": f"Harvest and sell at {decision.target_mandi} for ₹{decision.price_forecast_inr:.0f}/quintal.",
        "hold_3_days": f"Hold for 3 days. Prices expected to improve to ₹{decision.price_forecast_inr:.0f}/quintal.",
        "hold_7_days": f"Hold for up to 7 days if storage permits. Target ₹{decision.price_forecast_inr:.0f}/quintal.",
        "redirect_mandi": f"Transport to {decision.target_mandi} for better prices (₹{decision.price_forecast_inr:.0f}/quintal).",
    }

    base_rec = recommendation_map.get(decision.decision.value, "Best action based on market conditions.")

    # Add bundle info if available
    if decision.bundle_available and decision.bundle_saving_per_q:
        base_rec += f" Bundle savings: ₹{decision.bundle_saving_per_q:.0f}/quintal."

    return base_rec


def extract_explanation(
    decision: StructuredDecision,
    rag_context: list[dict[str, Any]],
) -> StructuredExplanation:
    """
    Extract deterministic explanation from structured decision + RAG context.

    Args:
        decision: StructuredDecision from Stage 1
        rag_context: Retrieved RAG chunks

    Returns:
        StructuredExplanation with locked-in reasons
    """

    # Build situation summary
    current_situation = (
        f"Your {decision.spoilage_pct:.0f}% spoilage risk and "
        f"{decision.price_direction.value} market with ₹{decision.price_forecast_inr:.0f}/q price call for action."
    )

    # Extract contexts from RAG
    price_context = extract_price_context(rag_context, decision)
    spoilage_context = extract_spoilage_context(rag_context, decision)

    # Get supporting facts
    facts = extract_supporting_facts(rag_context, decision, limit=3)

    # Build recommendation
    recommendation = extract_recommendation(decision)

    return StructuredExplanation(
        current_situation=current_situation,
        price_context=price_context,
        spoilage_context=spoilage_context,
        supporting_facts=facts,
        recommendation=recommendation,
    )


# Unit tests
if __name__ == "__main__":
    from datetime import date
    from mandi_agent.backend.api.core_schemas import (
        PriceForecast,
        SpoilageRisk,
        RiskLevel,
    )
    from mandi_agent.backend.agents.decision_engine import make_decision

    # Setup test data
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
            "content": "Wheat shelf life in cool storage: 6-8 months. No special precautions needed.",
            "source": "icar",
            "similarity": 0.88,
        },
        {
            "content": "Ballabgarh mandi receiving steady arrivals. Prices stable.",
            "source": "enam",
            "similarity": 0.85,
        },
    ]

    explanation = extract_explanation(decision, rag_context)

    print("=== Explanation ===")
    print(f"Situation: {explanation.current_situation}")
    print(f"Price: {explanation.price_context}")
    print(f"Spoilage: {explanation.spoilage_context}")
    print(f"Facts: {explanation.supporting_facts}")
    print(f"Action: {explanation.recommendation}")
    print("\n✅ Explanation extraction working!")
