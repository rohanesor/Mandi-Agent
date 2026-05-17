"""
Automation trigger routes for n8n.
"""

from fastapi import APIRouter, HTTPException

from mandi_agent.backend.api.schemas import (
    TriggerEmergencyRequest,
    TriggerPriceCrashRequest,
    TriggerVoiceAdvisoryRequest,
)

router = APIRouter(tags=["Automations"])


@router.post("/api/automate/{workflow_id}")
async def master_automation_trigger(workflow_id: str, request: dict):
    """
    Master Bridge: Connects Frontend to any Published n8n Workflow.
    Used by the mobile app to trigger bundles, advisories, and alerts.
    """
    try:
        try:
            from automations.master_bridge import get_bridge  # type: ignore
        except ImportError:
            # Fallback for different package structures
            from mandi_agent.backend.services.automations.master_bridge import get_bridge

        bridge = get_bridge()
        result = await bridge.trigger(workflow_id, request)

        if result.get("status") == "success":
            return result
        else:
            raise HTTPException(status_code=500 if result.get("status") == "error" else 400, detail=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/n8n/trigger/advisory")
async def trigger_voice_advisory_endpoint(req: TriggerVoiceAdvisoryRequest):
    """Trigger Voice Advisory generation via n8n."""
    from mandi_agent.backend.services.automations.n8n_triggers import trigger_voice_advisory

    res = await trigger_voice_advisory(req.farmer_id, req.phone, req.language, req.advisory_text)
    return {"triggered": res, "event": "voice_advisory"}


@router.post("/api/n8n/trigger/price-crash")
async def trigger_price_crash_endpoint(req: TriggerPriceCrashRequest):
    """Trigger Price Crash warning via n8n."""
    from mandi_agent.backend.services.automations.n8n_triggers import trigger_price_crash_warning

    res = await trigger_price_crash_warning(
        req.block_id, req.crop, req.forecast_price, req.current_price, req.drop_pct, req.affected_farmer_ids
    )
    return {"triggered": res, "event": "price_crash"}


@router.post("/api/n8n/trigger/emergency")
async def trigger_emergency_endpoint(req: TriggerEmergencyRequest):
    """Trigger Spoilage Emergency via n8n."""
    from mandi_agent.backend.services.automations.n8n_triggers import trigger_spoilage_emergency

    res = await trigger_spoilage_emergency(req.farmer_id, req.crop, req.spoilage_pct, req.recommended_action)
    return {"triggered": res, "event": "spoilage_emergency"}
