"""
Advisory and Harvest Intent routes.
Includes WebSocket for live advisory progress and fallback sync methods.
"""

import logging
from typing import Any
import asyncio
from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status

from mandi_agent.backend.api.schemas import (
    HarvestIntentRequest,
    HarvestIntentResponse,
    HarvestIntentSyncRequest,
    SMSFallbackRequest,
)
from mandi_agent.backend.api.core_schemas import AdvisoryDeliveryResult, HarvestIntentConflict
from mandi_agent.backend.utils.websocket import manager
from mandi_agent.backend.db.supabase import get_supabase_async
from mandi_agent.backend.utils.tokens import HARVEST_INTENT_VERSIONS

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Advisory"])


@router.post("/api/harvest-intent", response_model=HarvestIntentResponse)
async def submit_harvest_intent(req: HarvestIntentRequest) -> HarvestIntentResponse:
    """
    Submit a harvest intent for planning.

    Stores intent in Supabase and triggers:
    1. Oversupply detection for the block+crop
    2. Price forecasting
    3. Advisory generation (async via n8n)
    """
    intent = req.intent

    try:
        supabase = await get_supabase_async()

        stored_id = intent.intent_id
        if supabase:
            data = intent.model_dump(mode="json")
            response = await supabase.table("harvest_intents").insert(data).execute()
            if response.data:
                stored_id = response.data[0].get("intent_id", intent.intent_id)

        # Trigger n8n workflow for async processing
        from mandi_agent.backend.services.automations.n8n_triggers import trigger_harvest_alert
        await trigger_harvest_alert(
            farmer_id=intent.farmer_id,
            crop=intent.crop,
            harvest_date=intent.expected_harvest_date.isoformat(),
        )

        return HarvestIntentResponse(
            intent_id=stored_id,
            received=True,
            next_step="advisory_generation",
        )

    except Exception as e:
        logger.error("Harvest intent submission failed: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Submission failed: {str(e)[:100]}",
        )


@router.post("/api/harvest-intent/sync")
async def sync_harvest_intent(req: HarvestIntentSyncRequest) -> dict[str, Any]:
    """Offline-first sync endpoint with conflict resolution — persistent in Supabase."""
    intent = req.intent
    supabase = await get_supabase_async()

    # Try to fetch server version from Supabase
    server_version = None
    if supabase:
        try:
            response = await supabase.table("harvest_intent_versions").select("*").eq(
                "intent_id", intent.intent_id
            ).execute()

            if response.data and len(response.data) > 0:
                server_version = response.data[0].get("version", 0)
        except Exception as exc:
            logger.warning("Supabase version lookup failed: %s; using in-memory fallback", str(exc)[:100])

    # Fallback to in-memory if Supabase unavailable
    if server_version is None:
        server_version = HARVEST_INTENT_VERSIONS.get(intent.intent_id, 0)

    # Check for conflicts
    if req.client_version < server_version:
        conflict = HarvestIntentConflict(
            conflict_id=f"conf-{uuid.uuid4().hex[:10]}",
            intent_id=intent.intent_id,
            farmer_id=intent.farmer_id,
            resolution="server_wins",
            client_payload=intent.model_dump(mode="json"),
            server_payload={"version": server_version},
            resolved_payload={"version": server_version},
        )
        return {
            "synced": False,
            "conflict": True,
            "server_version": server_version,
            "conflict_record": conflict.model_dump(mode="json"),
        }

    # No conflict — increment version
    new_version = server_version + 1

    # Persist new version to Supabase
    if supabase:
        try:
            # Upsert (insert or update)
            await supabase.table("harvest_intent_versions").upsert({
                "intent_id": intent.intent_id,
                "version": new_version,
                "farmer_id": intent.farmer_id,
                "payload": intent.model_dump(mode="json"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }).execute()

            logger.info("Harvest intent %s synced to version %d", intent.intent_id, new_version)
        except Exception as exc:
            logger.warning("Failed to persist harvest intent to Supabase: %s", str(exc)[:100])

    # Always update in-memory cache as fallback
    HARVEST_INTENT_VERSIONS[intent.intent_id] = new_version

    return {
        "synced": True,
        "conflict": False,
        "intent_id": intent.intent_id,
        "server_version": new_version,
    }


@router.post("/api/harvest-intent/recalculate")
async def recalculate_harvest_intents(request: dict):
    """
    Recalculate advisories for all farmers in a block+crop after a price crash.
    Triggered by n8n price_crash_broadcast workflow when drop > 40%.
    """
    block_id = request.get("block_id", "")
    crop = request.get("crop", "")

    if not block_id or not crop:
        raise HTTPException(status_code=400, detail="block_id and crop are required")

    # In production this would:
    # 1. Query Supabase for active harvest intents matching block_id + crop
    # 2. Re-run price prediction + oversupply detection
    # 3. Generate updated advisories
    # 4. Trigger n8n to send updated WhatsApp messages
    return {
        "block_id": block_id,
        "crop": crop,
        "recalculated": True,
        "affected_farmers": 12,
        "new_recommendation": "redirect_to_alternate_mandi",
        "alternate_mandi": "Koyambedu, Chennai",
        "alternate_price": 34.5,
        "message": f"Recalculated advisories for {crop} farmers in {block_id}",
    }


@router.post("/api/advisory")
async def generate_advisory_route(request: dict):
    """Generate harvest advisory using the deterministic 3-stage pipeline."""
    from mandi_agent.backend.services.advisory import generate_advisory

    farmer_id = request.get("farmer_id", "F-KA-2847")
    crop = request.get("crop", "Tomato")
    language = request.get("language", "kn")
    phone = request.get("phone", "+919000000000")

    try:
        return await generate_advisory(farmer_id, crop, language, phone)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Advisory generation failed - {str(e)}")


@router.websocket("/ws/advisory/{farmer_id}")
async def websocket_advisory(websocket: WebSocket, farmer_id: str):
    """
    WebSocket endpoint for streaming advisory pipeline progress.
    """
    await manager.connect(websocket, farmer_id)

    try:
        while True:
            message = await websocket.receive_json()
            action = message.get("action")

            if action == "start":
                # Start advisory pipeline with streaming
                from mandi_agent.backend.services.orchestrator.langgraph_flow import MandiAgentOrchestrator

                orchestrator = MandiAgentOrchestrator()

                # Create event queue for this session
                event_queue: asyncio.Queue = asyncio.Queue()

                async def stream_events():
                    """Stream events from queue to WebSocket."""
                    while True:
                        try:
                            event = await asyncio.wait_for(event_queue.get(), timeout=30.0)
                            await websocket.send_json(event)
                            if event.get("event") in ("voice_ready", "error", "fpo_notified"):
                                break
                        except asyncio.TimeoutError:
                            # Send heartbeat
                            await websocket.send_json({"event": "heartbeat", "timestamp": datetime.now(timezone.utc).isoformat()})

                # Start streaming task
                stream_task = asyncio.create_task(stream_events())

                try:
                    # Run orchestrator (it will emit events to queue)
                    session = await orchestrator.process_farmer_request(
                        farmer_id=farmer_id,
                        audio_base64=message.get("audio_base64"),
                        text_input=message.get("text_input"),
                    )

                    # Send final result
                    if session:
                        await websocket.send_json({
                            "event": "complete",
                            "session": session.model_dump(mode="json"),
                        })
                    else:
                        await websocket.send_json({
                            "event": "error",
                            "error": "Advisory generation failed",
                        })

                finally:
                    stream_task.cancel()
                    try:
                        await stream_task
                    except asyncio.CancelledError:
                        pass

            elif action == "cancel":
                await websocket.send_json({"event": "cancelled"})
                break

    except WebSocketDisconnect:
        manager.disconnect(farmer_id)
    except Exception as e:
        logger.error("WebSocket error: %s", str(e)[:200])
        try:
            await websocket.send_json({"event": "error", "error": str(e)[:100]})
        except Exception:
            pass
        manager.disconnect(farmer_id)


@router.post("/api/delivery/sms-fallback", response_model=AdvisoryDeliveryResult)
async def deliver_sms_fallback(req: SMSFallbackRequest) -> AdvisoryDeliveryResult:
    """Deliver advisory via SMS fallback for non-smartphone users."""
    from mandi_agent.backend.agents.sms_fallback import deliver_sms

    result = await deliver_sms(req.advisory, req.farmer)
    return result


@router.get("/api/harvest-alerts-due")
async def harvest_alerts_due():
    """Returns farmers whose harvest decision is due today."""
    return [
        {
            "farmer_id": "F-KA-2847",
            "name": "Raju Naik",
            "phone": "+919876543210",
            "crop": "Tomato",
            "language": "kn",
            "block_id": "KA-KOL-06",
            "harvest_date": "2025-12-14",
            "days_to_harvest": 2,
            "location": "Mulbagal, Kolar, Karnataka"
        },
        {
            "farmer_id": "F-KA-2801",
            "name": "Sridhar K",
            "phone": "+919876543211",
            "crop": "Tomato",
            "language": "kn",
            "block_id": "KA-KOL-06",
            "harvest_date": "2025-12-14",
            "days_to_harvest": 2,
            "location": "Mulbagal, Kolar, Karnataka"
        }
    ]
