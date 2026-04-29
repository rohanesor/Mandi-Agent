"""
Mandi-Agent Master Orchestrator — LangGraph workflow for the full advisory pipeline.
Coordinates all agents: data fusion → RAG → price prediction → spoilage →
oversupply → negotiation → advisory → guardrails → voice delivery (Reverie).
"""

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from typing_extensions import TypedDict

from langgraph.graph import StateGraph, START, END

from mandi_agent.backend.models.schemas import (
    BlockOversupplyAlert,
    CooperativeBundle,
    FarmerAdvisory,
    FarmerProfile,
    GuardrailResult,
    HarvestIntent,
    MandiPrice,
    PriceForecast,
    SpoilageRisk,
    VoiceSession,
)

logger = logging.getLogger(__name__)

# =============================================================================
# Graph State Definition
# =============================================================================

class MandiAgentState(TypedDict, total=False):
    """Shared state passed between all agent nodes in the graph."""
    farmer: Optional[dict]  # Serialized FarmerProfile
    intent: Optional[dict]  # Serialized HarvestIntent
    fused_data: Optional[dict]  # FusedContext as dict
    rag_context: list[dict]  # Retrieved RAG chunks
    price_forecast: Optional[dict]  # Serialized PriceForecast
    spoilage_risk: Optional[dict]  # Serialized SpoilageRisk
    oversupply_alert: Optional[dict]  # Serialized BlockOversupplyAlert
    bundle: Optional[dict]  # Serialized CooperativeBundle
    advisory: Optional[dict]  # Serialized FarmerAdvisory
    guardrail_result: Optional[dict]  # Serialized GuardrailResult
    voice_session: Optional[dict]  # Serialized VoiceSession
    processing_start: str  # ISO timestamp
    total_ms: int  # Total processing time
    current_step: str  # Current node name for WebSocket updates
    errors: list[str]
    ws_event_queue: Optional[asyncio.Queue]  # For WebSocket streaming
    audio_base64: Optional[str] # Input audio for voice pipeline


def _ws_emit(state: MandiAgentState, event: str, data: dict = None) -> None:
    """Emit a WebSocket event if queue is available."""
    if state.get("ws_event_queue"):
        try:
            state["ws_event_queue"].put_nowait({
                "event": event,
                "data": data or {},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass


# =============================================================================
# Helper: dict <-> Pydantic conversions
# =============================================================================

def _dict_to_profile(d: dict) -> FarmerProfile:
    if isinstance(d, FarmerProfile):
        return d
    if d.get("registered_at") and isinstance(d["registered_at"], str):
        d["registered_at"] = datetime.fromisoformat(d["registered_at"].replace("Z", "+00:00"))
    return FarmerProfile(**d)


def _dict_to_intent(d: dict) -> HarvestIntent:
    if isinstance(d, HarvestIntent):
        return d
    if d.get("submitted_at") and isinstance(d["submitted_at"], str):
        d["submitted_at"] = datetime.fromisoformat(d["submitted_at"].replace("Z", "+00:00"))
    if d.get("expected_harvest_date") and isinstance(d["expected_harvest_date"], str):
        from datetime import date as date_cls
        d["expected_harvest_date"] = date_cls.fromisoformat(d["expected_harvest_date"])
    return HarvestIntent(**d)


def _dict_to_price_forecast(d: dict) -> Optional[PriceForecast]:
    if not d:
        return None
    if isinstance(d, PriceForecast):
        return d
    if d.get("forecast_date") and isinstance(d["forecast_date"], str):
        from datetime import date as date_cls
        d["forecast_date"] = date_cls.fromisoformat(d["forecast_date"])
    return PriceForecast(**d)


def _dict_to_spoilage(d: dict) -> Optional[SpoilageRisk]:
    if not d:
        return None
    if isinstance(d, SpoilageRisk):
        return d
    if d.get("harvest_date") and isinstance(d["harvest_date"], str):
        from datetime import date as date_cls
        d["harvest_date"] = date_cls.fromisoformat(d["harvest_date"])
    return SpoilageRisk(**d)


def _dict_to_advisory(d: dict) -> Optional[FarmerAdvisory]:
    if not d:
        return None
    if isinstance(d, FarmerAdvisory):
        return d
    if d.get("created_at") and isinstance(d["created_at"], str):
        d["created_at"] = datetime.fromisoformat(d["created_at"].replace("Z", "+00:00"))
    return FarmerAdvisory(**d)


def _dict_to_guardrail(d: dict) -> Optional[GuardrailResult]:
    if not d:
        return None
    if isinstance(d, GuardrailResult):
        return d
    return GuardrailResult(**d)


# =============================================================================
# Graph Nodes — one per agent
# =============================================================================

async def ingest_data(state: MandiAgentState) -> MandiAgentState:
    """
    Node 1: Ingest data from all 4 sources via DataFusionEngine.
    """
    state["current_step"] = "ingest_data"
    _ws_emit(state, "data_fetching", {})

    try:
        farmer = _dict_to_profile(state["farmer"])
        intent = _dict_to_intent(state["intent"])

        from mandi_agent.backend.data_sources.fusion import fuse

        farmer_location = (
            farmer.latitude,
            farmer.longitude,
            farmer.location.split(",")[0].strip(),
            "Karnataka",
        )

        fused = await fuse(
            block_id=farmer.block_id,
            crop=intent.crop,
            farmer_location=farmer_location,
        )

        state["fused_data"] = fused.to_dict()
        state["errors"] = state.get("errors", [])

        _ws_emit(state, "data_fetched", {
            "quality_score": fused.data_quality_score,
            "fetch_time_ms": fused.total_fetch_time_ms,
            "prices": len(fused.mandi_prices),
            "weather_days": len(fused.weather_forecast.forecast_days) if fused.weather_forecast else 0,
        })

        logger.info(
            "Data fusion complete: block=%s crop=%s quality=%.2f",
            farmer.block_id, intent.crop, fused.data_quality_score
        )

    except Exception as e:
        import traceback
        logger.error("Data fusion failed: %s\n%s", str(e)[:200], traceback.format_exc())
        state["errors"] = state.get("errors", []) + [f"ingest_data: {str(e)[:100]}"]
        state["fused_data"] = None

    return state


async def retrieve_rag(state: MandiAgentState) -> MandiAgentState:
    """
    Node 2: Retrieve relevant RAG context for the query.
    """
    state["current_step"] = "retrieve_rag"
    _ws_emit(state, "rag_retrieving", {})

    try:
        farmer = _dict_to_profile(state["farmer"])
        intent = _dict_to_intent(state["intent"])

        from mandi_agent.backend.rag.retrieval import RAGRetriever
        from supabase import create_async_client
        import os

        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

        if not supabase_url or not supabase_key:
            state["rag_context"] = []
            return state

        supabase = await create_async_client(supabase_url, supabase_key)
        retriever = RAGRetriever(supabase)

        query = (
            f"{intent.crop} price forecast for {farmer.location}. "
            f"Harvest in {intent.current_growth_stage} stage. "
        )

        results = await retriever.retrieve(
            query=query,
            crop=intent.crop,
            state=farmer.location.split(",")[-1].strip(),
            top_k=8,
        )

        state["rag_context"] = [r.to_dict() for r in results]
        state["errors"] = state.get("errors", [])

        _ws_emit(state, "rag_retrieved", {
            "chunks": len(state["rag_context"]),
            "top_similarity": state["rag_context"][0]["similarity"] if state["rag_context"] else 0,
        })

    except Exception as e:
        logger.error("RAG retrieval failed: %s", str(e)[:200])
        state["errors"] = state.get("errors", []) + [f"retrieve_rag: {str(e)[:100]}"]
        state["rag_context"] = []

    return state


async def predict_price(state: MandiAgentState) -> MandiAgentState:
    """
    Node 3: Generate price forecast using PricePredictionAgent.
    """
    state["current_step"] = "predict_price"
    _ws_emit(state, "price_predicting", {})

    try:
        farmer = _dict_to_profile(state["farmer"])
        intent = _dict_to_intent(state["intent"])
        fused_data = state.get("fused_data") or {}

        from mandi_agent.backend.agents.price_prediction import predict_price as _predict

        mandi_prices = []
        for p_dict in fused_data.get("mandi_prices", []):
            try:
                mandi_prices.append(MandiPrice(**p_dict))
            except Exception:
                pass

        weather_data = None
        wf = fused_data.get("weather_forecast")
        if wf and wf.get("forecast_days"):
            first_day = wf["forecast_days"][0]
            weather_data = {
                "condition": first_day.get("weather_condition", "unknown"),
                "max_temp": first_day.get("max_temp_celsius", 30),
                "min_temp": first_day.get("min_temp_celsius", 20),
                "rainfall_mm": first_day.get("rainfall_mm", 0),
            }

        soil_moisture = fused_data.get("soil_moisture", {}).get("soil_moisture_pct")

        forecast = await _predict(
            crop=intent.crop,
            mandi_name="Vashi Navi Mumbai",
            state=farmer.location.split(",")[-1].strip(),
            historical_prices=mandi_prices,
            weather=weather_data,
            soil_moisture=soil_moisture,
            days_ahead=7,
        )

        if forecast:
            state["price_forecast"] = forecast.model_dump(mode="json")
            _ws_emit(state, "price_predicted", {
                "price": forecast.predicted_price,
                "direction": forecast.price_direction.value,
                "confidence": forecast.confidence,
            })
        else:
            state["price_forecast"] = None
            state["errors"] = state.get("errors", []) + ["Price prediction returned None"]

    except Exception as e:
        logger.error("Price prediction failed: %s", str(e)[:200])
        state["errors"] = state.get("errors", []) + [f"predict_price: {str(e)[:100]}"]
        state["price_forecast"] = None

    return state


async def assess_spoilage(state: MandiAgentState) -> MandiAgentState:
    """
    Node 4: Assess spoilage risk using SpoilageRiskAgent.
    """
    state["current_step"] = "assess_spoilage"
    try:
        intent = _dict_to_intent(state["intent"])
        fused_data = state.get("fused_data") or {}

        from mandi_agent.backend.agents.spoilage_risk import assess_spoilage as _assess

        ambient_temp = 30.0
        wf = fused_data.get("weather_forecast")
        if wf and wf.get("forecast_days"):
            ambient_temp = wf["forecast_days"][0].get("max_temp_celsius", 30)

        spoilage = await _assess(
            farmer_id=intent.farmer_id,
            crop=intent.crop,
            harvest_date=intent.expected_harvest_date,
            transit_hours=6.0,
            ambient_temp_celsius=ambient_temp,
        )

        if spoilage:
            state["spoilage_risk"] = spoilage.model_dump(mode="json")
            _ws_emit(state, "spoilage_assessed", {
                "probability": spoilage.spoilage_probability,
                "risk_level": spoilage.risk_level.value,
            })

    except Exception as e:
        logger.error("Spoilage assessment failed: %s", str(e)[:200])
        state["errors"] = state.get("errors", []) + [f"assess_spoilage: {str(e)[:100]}"]
        state["spoilage_risk"] = None

    return state


async def detect_oversupply(state: MandiAgentState) -> MandiAgentState:
    """
    Node 5: Detect oversupply using OversupplyDetectorAgent.
    """
    state["current_step"] = "detect_oversupply"
    try:
        intent = _dict_to_intent(state["intent"])
        from mandi_agent.backend.agents.oversupply_detector import detect_oversupply as _detect

        alert = await _detect(
            block_id=intent.block_id,
            crop=intent.crop,
            harvest_intents=[intent],
            mandi_history=[],
            historical_absorption_quintals=50.0,
        )

        if alert:
            state["oversupply_alert"] = alert.model_dump(mode="json")
            _ws_emit(state, "oversupply_detected", {
                "severity": alert.severity.value,
                "ratio": alert.oversupply_ratio,
                "farmers_affected": len(alert.affected_farmer_ids),
            })
        else:
            state["oversupply_alert"] = None

    except Exception as e:
        logger.error("Oversupply detection failed: %s", str(e)[:200])
        state["errors"] = state.get("errors", []) + [f"detect_oversupply: {str(e)[:100]}"]
        state["oversupply_alert"] = None

    return state


async def negotiate_bundle(state: MandiAgentState) -> MandiAgentState:
    """
    Node 6: Form Virtual Cooperative bundle using NegotiationAgent.
    """
    state["current_step"] = "negotiate_bundle"
    try:
        intent = _dict_to_intent(state["intent"])
        alert_data = state.get("oversupply_alert")

        if not alert_data:
            state["bundle"] = None
            return state

        from mandi_agent.backend.agents.negotiation import run_negotiation

        price_forecasts = {}
        pf = _dict_to_price_forecast(state.get("price_forecast"))
        if pf:
            price_forecasts[pf.mandi_name] = pf

        bundle = await run_negotiation(
            block_id=intent.block_id,
            crop=intent.crop,
            farmer_intents=[intent],
            price_forecasts=price_forecasts,
        )

        if bundle:
            state["bundle"] = bundle.model_dump(mode="json")
            _ws_emit(state, "bundle_formed", {
                "bundle_id": bundle.bundle_id,
                "quantity": bundle.total_quantity_quintals,
            })

    except Exception as e:
        logger.error("Bundle negotiation failed: %s", str(e)[:200])
        state["errors"] = state.get("errors", []) + [f"negotiate_bundle: {str(e)[:100]}"]
        state["bundle"] = None

    return state


async def generate_advisory(state: MandiAgentState) -> MandiAgentState:
    """
    Node 7: Generate advisory using RAGAdvisoryAgent.
    """
    state["current_step"] = "generate_advisory"
    _ws_emit(state, "advisory_generating", {})

    try:
        farmer = _dict_to_profile(state["farmer"])
        intent = _dict_to_intent(state["intent"])
        forecast = _dict_to_price_forecast(state.get("price_forecast"))
        spoilage = _dict_to_spoilage(state.get("spoilage_risk"))

        from mandi_agent.backend.agents.rag_advisory import generate_advisory as _gen_adv

        bundle = None
        if state.get("bundle"):
            from mandi_agent.backend.models.schemas import CooperativeBundle
            bundle_data = state["bundle"]
            if bundle_data.get("created_at") and isinstance(bundle_data["created_at"], str):
                bundle_data["created_at"] = datetime.fromisoformat(bundle_data["created_at"].replace("Z", "+00:00"))
            bundle = CooperativeBundle(**bundle_data)

        # Use the REAL LLM-based advisory with extra safety
        try:
            advisory_obj = await _gen_adv(
                farmer=farmer,
                intent=intent,
                price_forecast=forecast or _make_dummy_forecast(),
                spoilage_risk=spoilage or _make_dummy_spoilage(intent.farmer_id, intent.crop),
                bundle=bundle,
                rag_context=state.get("rag_context", []),
            )
        except Exception as e:
            logger.warning("Advisory LLM call raised exception: %s", str(e)[:200])
            advisory_obj = None

        if not advisory_obj:
            # Fallback to rule-based if LLM fails
            from mandi_agent.backend.agents.rag_advisory import generate_advisory_fallback
            advisory_obj = await generate_advisory_fallback(
                farmer=farmer,
                intent=intent,
                price_forecast=forecast or _make_dummy_forecast(),
                spoilage_risk=spoilage or _make_dummy_spoilage(intent.farmer_id, intent.crop),
                bundle=bundle,
            )

        state["advisory"] = advisory_obj.model_dump(mode="json")
        _ws_emit(state, "advisory_generated", {
            "decision": advisory_obj.decision.value,
        })

    except Exception as e:
        logger.error("Advisory generation failed: %s", str(e)[:200])
        state["errors"] = state.get("errors", []) + [f"generate_advisory: {str(e)[:100]}"]
        state["advisory"] = None

    return state


def _make_dummy_forecast() -> PriceForecast:
    from datetime import date as date_cls
    return PriceForecast(
        crop="unknown",
        mandi_name="unknown",
        forecast_date=date_cls.today(),
        predicted_price=2000.0,
        confidence=0.5,
        price_direction="stable",
        reasoning="No forecast available",
        model_used="none",
        days_ahead=7,
    )


def _make_dummy_spoilage(farmer_id: str, crop: str) -> SpoilageRisk:
    from datetime import date as date_cls
    return SpoilageRisk(
        farmer_id=farmer_id,
        crop=crop,
        harvest_date=date_cls.today(),
        transit_hours=6.0,
        ambient_temp_celsius=30.0,
        shelf_life_hours=48.0,
        spoilage_probability=0.5,
        risk_level="moderate",
        recommendation="Sell today.",
    )


async def validate_output(state: MandiAgentState) -> MandiAgentState:
    """
    Node 8: Validate advisory using GuardrailAgent.
    """
    state["current_step"] = "validate_output"
    try:
        farmer = _dict_to_profile(state["farmer"])
        intent = _dict_to_intent(state["intent"])
        advisory = _dict_to_advisory(state.get("advisory"))

        if not advisory:
            return state

        from mandi_agent.backend.agents.guardrails import validate_advisory
        result = await validate_advisory(advisory, farmer, intent)

        state["guardrail_result"] = result.model_dump(mode="json")
        _ws_emit(state, "guardrail_validated", {"passed": result.passed})

    except Exception as e:
        logger.error("Guardrail validation failed: %s", str(e)[:200])
        state["errors"] = state.get("errors", []) + [f"validate_output: {str(e)[:100]}"]

    return state


async def deliver_voice(state: MandiAgentState) -> MandiAgentState:
    """
    Node 9: Convert advisory to voice using ReverieVoiceService.
    """
    state["current_step"] = "deliver_voice"
    try:
        farmer = _dict_to_profile(state["farmer"])
        advisory = _dict_to_advisory(state.get("advisory"))

        if not advisory:
            return state

        from mandi_agent.backend.voice.reverie_voice import ReverieVoiceService
        service = ReverieVoiceService()

        if state.get("audio_base64"):
            session = await service.full_pipeline(
                audio_base64=state["audio_base64"],
                farmer_language=farmer.language,
                advisory_english=advisory.full_text_english,
                farmer_id=farmer.farmer_id,
            )
        else:
            audio_b64 = await service.text_to_speech(
                advisory.full_text_local or advisory.full_text_english,
                farmer.language,
            )
            session = VoiceSession(
                session_id=str(uuid.uuid4())[:16],
                farmer_id=farmer.farmer_id,
                input_audio_url=None,
                input_text_local="",
                input_text_english="",
                detected_language=farmer.language,
                intent="",
                response_text_english=advisory.full_text_english,
                response_text_local=advisory.full_text_local,
                response_audio_url=f"data:audio/wav;base64,{audio_b64}" if audio_b64 else None,
                processing_ms=0,
                created_at=datetime.now(timezone.utc),
            )

        state["voice_session"] = session.model_dump(mode="json")
        await service.close()

    except Exception as e:
        logger.error("Voice delivery failed: %s", str(e)[:200])
        state["errors"] = state.get("errors", []) + [f"deliver_voice: {str(e)[:100]}"]

    return state


async def notify_fpo_coordinator(state: MandiAgentState) -> MandiAgentState:
    """
    Node 10: Notify FPO coordinator.
    """
    state["current_step"] = "notify_fpo"
    try:
        from mandi_agent.backend.automations.n8n_triggers import trigger_harvest_alert
        farmer = _dict_to_profile(state["farmer"])
        intent = state.get("intent", {})

        await trigger_harvest_alert(
            farmer_id=farmer.farmer_id,
            crop=intent.get("crop", ""),
            harvest_date=str(intent.get("expected_harvest_date", "")),
        )
    except Exception as e:
        logger.error("FPO notification failed: %s", str(e)[:200])

    return state


def _build_orchestrator_graph() -> StateGraph:
    graph = StateGraph(MandiAgentState)

    graph.add_node("ingest_data", ingest_data)
    graph.add_node("retrieve_rag", retrieve_rag)
    graph.add_node("predict_price", predict_price)
    graph.add_node("assess_spoilage", assess_spoilage)
    graph.add_node("detect_oversupply", detect_oversupply)
    graph.add_node("negotiate_bundle", negotiate_bundle)
    graph.add_node("generate_advisory", generate_advisory)
    graph.add_node("validate_output", validate_output)
    graph.add_node("deliver_voice", deliver_voice)
    graph.add_node("notify_fpo_coordinator", notify_fpo_coordinator)

    graph.add_edge(START, "ingest_data")
    graph.add_edge("ingest_data", "retrieve_rag")
    graph.add_edge("retrieve_rag", "predict_price")
    graph.add_edge("predict_price", "assess_spoilage")
    graph.add_edge("assess_spoilage", "detect_oversupply")

    def oversupply_router(state: MandiAgentState) -> str:
        alert = state.get("oversupply_alert")
        if alert and alert.get("severity") in ("high", "critical"):
            return "negotiate_bundle"
        return "generate_advisory"

    graph.add_conditional_edges("detect_oversupply", oversupply_router, {
        "negotiate_bundle": "negotiate_bundle",
        "generate_advisory": "generate_advisory",
    })

    graph.add_edge("negotiate_bundle", "generate_advisory")
    graph.add_edge("generate_advisory", "validate_output")

    def guardrail_router(state: MandiAgentState) -> str:
        gr = state.get("guardrail_result")
        if not gr or not gr.get("passed"):
            return "notify_fpo_coordinator"
        return "deliver_voice"

    graph.add_conditional_edges("validate_output", guardrail_router, {
        "deliver_voice": "deliver_voice",
        "notify_fpo_coordinator": "notify_fpo_coordinator",
    })

    graph.add_edge("deliver_voice", END)
    graph.add_edge("notify_fpo_coordinator", END)

    return graph


class MandiAgentOrchestrator:
    def __init__(self):
        self._graph = _build_orchestrator_graph().compile()

    async def process_farmer_request(
        self,
        farmer_id: str,
        audio_base64: Optional[str] = None,
        text_input: str = "",
        ws_event_queue: Optional[asyncio.Queue] = None,
    ) -> Optional[VoiceSession]:
        from mandi_agent.backend.models.schemas import FarmerProfile, HarvestIntent, MandiPrice
        from datetime import date

        # Mock database lookup for farmer
        farmer = FarmerProfile(
            farmer_id=farmer_id,
            name="Farmer Jones",
            phone="+919999999999",
            language="kn",
            location="Tumakuru, Karnataka",
            latitude=13.337,
            longitude=77.117,
            block_id="B001",
            crops=["Tomato", "Potato"],
            landholding_acres=2.5,
        )

        intent = HarvestIntent(
            intent_id=str(uuid.uuid4())[:8],
            farmer_id=farmer_id,
            crop="Tomato",
            expected_harvest_date=date.today(),
            quantity_quintals=10.0,
            current_growth_stage="mature",
            block_id="B001",
        )

        initial_state = MandiAgentState(
            farmer=farmer.model_dump(mode="json"),
            intent=intent.model_dump(mode="json"),
            audio_base64=audio_base64,
            ws_event_queue=ws_event_queue,
            errors=[],
            processing_start=datetime.now(timezone.utc).isoformat(),
        )

        try:
            final_state = await self._graph.ainvoke(initial_state)
            if final_state.get("voice_session"):
                return VoiceSession(**final_state["voice_session"])
            import sys
            import json
            print("FINAL STATE MISSING VOICE SESSION:", json.dumps({k: v for k, v in final_state.items() if k != "audio_base64"}, default=str), file=sys.stderr)
            return None
        except Exception as e:
            logger.error("Orchestrator execution failed: %s", str(e))
            return None
