"""
SMS fallback delivery for farmers without smartphone/WhatsApp voice access.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from twilio.base.exceptions import TwilioException
from twilio.rest import Client

from mandi_agent.backend.models.schemas import (
    AdvisoryDeliveryResult,
    DeliveryChannel,
    FarmerAdvisory,
    FarmerProfile,
)

logger = logging.getLogger(__name__)


def _build_sms_body(advisory: FarmerAdvisory) -> str:
    target = f" Target mandi: {advisory.target_mandi}." if advisory.target_mandi else ""
    return (
        f"Mandi-Agent Advisory ({advisory.crop}): {advisory.full_text_local[:240]}"
        f" Decision: {advisory.decision.value}.{target}"
    )[:320]


async def deliver_sms(advisory: FarmerAdvisory, farmer: FarmerProfile) -> AdvisoryDeliveryResult:
    """Send advisory via SMS using Twilio as channel fallback."""
    if not farmer.sms_opt_in:
        return AdvisoryDeliveryResult(
            advisory_id=advisory.advisory_id,
            farmer_id=farmer.farmer_id,
            primary_channel=DeliveryChannel.WHATSAPP_VOICE,
            fallback_channel=DeliveryChannel.SMS,
            delivered=False,
            failure_reason="Farmer has not opted in for SMS",
            delivered_at=datetime.now(timezone.utc),
        )

    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_number = os.getenv("TWILIO_SMS_FROM", "")
    body = _build_sms_body(advisory)

    if not (sid and token and from_number):
        logger.warning("Twilio SMS credentials missing; returning simulated SMS delivery")
        return AdvisoryDeliveryResult(
            advisory_id=advisory.advisory_id,
            farmer_id=farmer.farmer_id,
            primary_channel=DeliveryChannel.WHATSAPP_VOICE,
            fallback_channel=DeliveryChannel.SMS,
            delivered=True,
            provider_message_id=f"sim-{advisory.advisory_id}",
            delivered_at=datetime.now(timezone.utc),
        )

    try:
        client = Client(sid, token)
        msg = client.messages.create(
            from_=from_number,
            to=farmer.phone,
            body=body,
        )
        return AdvisoryDeliveryResult(
            advisory_id=advisory.advisory_id,
            farmer_id=farmer.farmer_id,
            primary_channel=DeliveryChannel.WHATSAPP_VOICE,
            fallback_channel=DeliveryChannel.SMS,
            delivered=True,
            provider_message_id=msg.sid,
            delivered_at=datetime.now(timezone.utc),
        )
    except TwilioException as exc:
        logger.error("Twilio SMS delivery failed: %s", str(exc)[:200])
        return AdvisoryDeliveryResult(
            advisory_id=advisory.advisory_id,
            farmer_id=farmer.farmer_id,
            primary_channel=DeliveryChannel.WHATSAPP_VOICE,
            fallback_channel=DeliveryChannel.SMS,
            delivered=False,
            failure_reason=str(exc)[:180],
            delivered_at=datetime.now(timezone.utc),
        )
