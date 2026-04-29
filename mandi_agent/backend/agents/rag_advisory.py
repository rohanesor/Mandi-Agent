"""
RAG Advisory Agent — 3-Stage Pipeline
=====================================
Stage 1: Deterministic Decision Engine
  → Rule-based decision (no randomness)
Stage 2: Explanation Extractor
  → Extract reasons from RAG context
Stage 3: Advisory Renderer
  → Template-based text generation

Result: Deterministic, testable, WhatsApp-friendly advisories.
"""

import logging
import uuid
from datetime import datetime
from typing import Any, Optional

from mandi_agent.backend.agents.decision_engine import make_decision
from mandi_agent.backend.agents.explanation_extractor import extract_explanation
from mandi_agent.backend.agents.advisory_renderer import render_advisory
from mandi_agent.backend.models.schemas import (
    CooperativeBundle,
    FarmerAdvisory,
    FarmerProfile,
    GuardrailStatus,
    HarvestIntent,
    PriceForecast,
    SpoilageRisk,
)

logger = logging.getLogger(__name__)


async def generate_advisory(
    farmer: FarmerProfile,
    intent: HarvestIntent,
    price_forecast: PriceForecast,
    spoilage_risk: SpoilageRisk,
    bundle: Optional[CooperativeBundle],
    rag_context: list[dict[str, Any]],
) -> Optional[FarmerAdvisory]:
    """
    Generate a personalized advisory using 3-stage deterministic pipeline.

    Stage 1: Structured Decision
      - Rule-based decision engine (deterministic)
      - Same inputs always produce same decision

    Stage 2: Explanation Extraction
      - Extract reasons from RAG context
      - No LLM randomness, just fact extraction

    Stage 3: Text Rendering
      - Template-based WhatsApp message generation
      - Deterministic variable substitution

    Args:
        farmer: FarmerProfile
        intent: HarvestIntent
        price_forecast: PriceForecast from ML model
        spoilage_risk: SpoilageRisk assessment
        bundle: Optional CooperativeBundle
        rag_context: Retrieved RAG chunks

    Returns:
        FarmerAdvisory with deterministic content
    """

    try:
        # STAGE 1: Make Deterministic Decision
        logger.info("Stage 1: Making deterministic decision for farmer=%s crop=%s", farmer.farmer_id, intent.crop)
        structured_decision = make_decision(price_forecast, spoilage_risk, bundle)

        # STAGE 2: Extract Explanation from RAG
        logger.info("Stage 2: Extracting explanation from %d RAG chunks", len(rag_context))
        explanation = extract_explanation(structured_decision, rag_context)

        # STAGE 3: Render Advisory Text
        logger.info("Stage 3: Rendering WhatsApp message")
        rendered = render_advisory(structured_decision, explanation, crop_name=intent.crop)

        # Build FarmerAdvisory
        advisory = FarmerAdvisory(
            advisory_id=str(uuid.uuid4())[:16],
            farmer_id=farmer.farmer_id,
            crop=intent.crop,
            language=farmer.language,
            decision=structured_decision.decision,
            target_mandi=structured_decision.target_mandi,
            forecast_price=structured_decision.price_forecast_inr,
            spoilage_risk_pct=structured_decision.spoilage_pct,
            bundle_available=structured_decision.bundle_available,
            bundle_saving=structured_decision.bundle_saving_per_q,
            full_text_english=rendered.full_text,
            full_text_local=rendered.full_text,  # Translation done separately
            confidence=structured_decision.decision_confidence,
            guardrail_status=GuardrailStatus.APPROVED,
            created_at=datetime.utcnow(),
        )

        logger.info(
            "✓ Advisory generated (deterministic): farmer=%s decision=%s confidence=%.0f%%",
            farmer.farmer_id,
            advisory.decision.value,
            advisory.confidence * 100,
        )

        return advisory

    except Exception as e:
        logger.error("Advisory generation failed: %s. Returning None.", str(e))
        return None


if __name__ == "__main__":
    # Integration test with 3-stage pipeline
    import asyncio
    from datetime import date as date_cls
    from mandi_agent.backend.models.schemas import RiskLevel, PriceDirection

    logging.basicConfig(level=logging.INFO)

    async def test():
        farmer = FarmerProfile(
            farmer_id="F001",
            name="Ramesh Kumar",
            phone="+919876543210",
            language="hi",
            location="Ballabgarh, Haryana",
            latitude=28.3333,
            longitude=76.8333,
            block_id="HR-001",
            fpo_id="FPO-HARYANA-01",
            crops=["wheat", "mustard"],
            landholding_acres=5.0,
        )

        intent = HarvestIntent(
            intent_id="I001",
            farmer_id="F001",
            crop="wheat",
            quantity_quintals=18.0,
            expected_harvest_date=date_cls(2026, 3, 25),
            current_growth_stage="mature",
            block_id="HR-001",
        )

        forecast = PriceForecast(
            crop="wheat",
            mandi_name="Ballabgarh Mandi",
            forecast_date=date_cls(2026, 3, 28),
            predicted_price=2150.0,
            confidence=0.72,
            price_direction=PriceDirection.RISING,
            reasoning="Pre-Rabi festival demand, limited arrivals",
            model_used="xgboost+ml",
            days_ahead=7,
        )

        spoilage = SpoilageRisk(
            farmer_id="F001",
            crop="wheat",
            harvest_date=date_cls(2026, 3, 25),
            transit_hours=3.0,
            ambient_temp_celsius=28.0,
            shelf_life_hours=168.0,
            spoilage_probability=0.08,
            risk_level=RiskLevel.SAFE,
            recommendation="Safe to transport. No special precautions needed.",
        )

        rag_context = [
            {
                "content": "Festival season approaching. High demand for wheat.",
                "source": "agmarknet",
                "similarity": 0.92,
            },
            {
                "content": "Wheat shelf life in cool storage: 6-8 months.",
                "source": "icar",
                "similarity": 0.88,
            },
        ]

        # Test the 3-stage pipeline
        adv = await generate_advisory(farmer, intent, forecast, spoilage, None, rag_context)

        if adv:
            print(f"\n✅ Advisory generated successfully!")
            print(f"   ID: {adv.advisory_id}")
            print(f"   Decision: {adv.decision.value}")
            print(f"   Confidence: {adv.confidence:.0%}")
            print(f"   Text: {adv.full_text_english}")
        else:
            print("\n❌ Advisory generation failed")

    asyncio.run(test())
