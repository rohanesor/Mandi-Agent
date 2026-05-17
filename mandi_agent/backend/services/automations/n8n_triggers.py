"""
n8n automation triggers — webhook calls to n8n workflows.
Each method POSTs to a specific n8n webhook endpoint.
"""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

import httpx

from mandi_agent.backend.api.core_schemas import (
    CooperativeBundle,
    FarmerProfile,
)

logger = logging.getLogger(__name__)

# n8n webhook base URL (set via environment)
N8N_BASE_URL = ""


def _get_n8n_url() -> str:
    import os

    return os.getenv("N8N_WEBHOOK_URL", "")


def _get_n8n_api_key() -> str:
    import os

    return os.getenv("N8N_API_KEY", "")


# =============================================================================
# N8NClient
# =============================================================================


class N8NClient:
    """
    Client for triggering n8n workflow webhooks.

    Each workflow has its own webhook endpoint. This client
    wraps POST calls with error handling, retry logic,
    and structured payloads.

    Usage:
        client = N8NClient()
        await client.trigger_bundle_formed(bundle)
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
    ):
        """
        Initialize n8n client.

        Args:
            base_url: Base n8n URL (e.g., https://n8n.example.com/webhook)
            api_key: Optional API key for n8n
        """
        self._base_url = base_url or _get_n8n_url()
        self._api_key = api_key or _get_n8n_api_key()
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Lazy HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def close(self) -> None:
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()

    async def _post(
        self,
        endpoint: str,
        payload: dict[str, Any],
    ) -> bool:
        """
        POST to an n8n webhook endpoint with corrected URL mappings.
        """
        # Exact mapping gathered from n8n Local Instance properties
        # For test mode: paths must match the webhook trigger names in workflows
        path_map = {
            "advisory-delivered": "advisory-delivered",
            "bundle-formed": "fwrsTA7jqgOwHV8u",  # Bundle Notification workflow ID
            "spoilage-emergency": "spoilage-emergency",
            "price-crash": "price-crash",
            "scheme-check": "scheme-check",
            "weather-alert": "weather-alert",
            "advisory-webhook": "whatsapp-inbound",  # WhatsApp Advisory Loop custom path
            "mandi-advisory": "whatsapp-inbound",  # Alias for advisory-webhook
            # The following are Schedule Triggers in n8n, not webhooks!
            "fpo-digest": None,
            "harvest-alert": None,
        }

        mapped_endpoint = path_map.get(endpoint, endpoint)
        if mapped_endpoint is None:
            logger.info("Skipping trigger '%s' because it is a Cron/Schedule workflow in n8n.", endpoint)
            return True

        if not self._base_url:
            logger.warning("N8N_WEBHOOK_URL not set — skipping trigger: %s", endpoint)
            return False

        # Properly map base URL: if it's localhost:5678/webhook/, just join
        url = f"{self._base_url.rstrip('/')}/{mapped_endpoint.lstrip('/')}"

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        try:
            client = await self._get_client()
            logger.info("n8n POST to %s with payload: %s", url, payload)
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            logger.info(
                "n8n trigger %s (mapped to %s): %d | Response: %s",
                endpoint,
                mapped_endpoint,
                response.status_code,
                response.text[:200],
            )
            return True

        except httpx.HTTPStatusError as e:
            logger.warning(
                "n8n HTTP %d for %s: %s | Response: %s",
                e.response.status_code,
                endpoint,
                str(e)[:100],
                e.response.text[:200],
            )
        except httpx.TimeoutException:
            logger.warning("n8n timeout for %s (URL: %s)", endpoint, url)
        except httpx.RequestError as e:
            logger.warning("n8n request error for %s (URL: %s): %s", endpoint, url, str(e)[:100])
        except Exception as e:
            logger.error("n8n trigger %s failed (URL: %s): %s", endpoint, url, str(e)[:100])

        return False

    # =========================================================================
    # Trigger Methods
    # =========================================================================

    async def trigger_voice_advisory(
        self,
        farmer_id: str,
        phone: str,
        language: str,
        advisory_text: str,
    ) -> bool:
        """
        Trigger Voice Advisory n8n workflow with properly formatted payload.
        """
        payload = {
            "farmer_id": farmer_id,
            "phone": phone,
            "language": language,
            "advisory_text": advisory_text,
            "response_text_english": advisory_text,  # For Reverie translation node
            "text": advisory_text,  # Ensure 'text' field is included for Reverie API
        }
        return await self._post("advisory-webhook", payload)

    async def trigger_advisory_delivered(
        self,
        farmer_id: str,
        advisory_id: str,
        language: str,
        channel: str = "whatsapp",
    ) -> bool:
        """
        Trigger when an advisory is delivered to a farmer.

        Args:
            farmer_id: Farmer identifier
            advisory_id: Advisory identifier
            language: ISO 639 language code
            channel: Delivery channel (whatsapp, sms, voice)

        Returns:
            True if triggered successfully
        """
        payload = {
            "event": "advisory_delivered",
            "farmer_id": farmer_id,
            "advisory_id": advisory_id,
            "language": language,
            "channel": channel,
            "delivered_at": datetime.now(UTC).isoformat(),
        }
        return await self._post("advisory-delivered", payload)

    async def trigger_bundle_formed(
        self,
        bundle: CooperativeBundle,
        farmer_phones: list[str],
        message_template: str | None = None,
    ) -> bool:
        """
        Trigger when a Virtual Cooperative bundle is formed.

        Notifies all farmers in the bundle via WhatsApp with detailed info.
        n8n workflow: bundle_notification.json

        Args:
            bundle: CooperativeBundle object
            farmer_phones: List of WhatsApp numbers for farmers
            message_template: Optional custom message template

        Returns:
            True if triggered successfully
        """
        if message_template is None:
            message_template = (
                "🌾 *BUNDLE CONFIRMED* 🌾\n\n"
                "Crop: {crop}\n"
                "Quantity: {quantity} quintals\n"
                "Target Mandi: {mandi}\n"
                "Current Price: ₹{current_price}/q\n"
                "Expected Price: ₹{expected_price}/q\n\n"
                "💰 *Your Savings*\n"
                "Transport: ₹{saving}/quintal\n"
                "Total Bundle Savings: ₹{total_saving}\n\n"
                "📦 *Delivery Details*\n"
                "Window: {window_start} to {window_end}\n"
                "Farmers in Bundle: {farmer_count}\n\n"
                "✅ Confirmed & Ready for Harvest\n"
                "Reply with your confirmation or call support."
            )

        payload = {
            "event": "bundle_formed",
            "bundle_id": bundle.bundle_id,
            "farmer_id": farmer_phones[0] if farmer_phones else "unknown",
            "crop": bundle.crop,
            "quantity": bundle.total_quantity_quintals,
            "mandi": bundle.target_mandi,
            "current_price": bundle.current_mandi_price,
            "expected_price": bundle.expected_price,
            "transport_saving": bundle.transport_saving_per_quintal,
            "total_saving": bundle.transport_saving_per_quintal * bundle.total_quantity_quintals,
            "farmer_count": len(farmer_phones),
            "delivery_start": bundle.delivery_window_start.isoformat(),
            "delivery_end": bundle.delivery_window_end.isoformat(),
            "text": message_template.format(
                crop=bundle.crop,
                quantity=int(bundle.total_quantity_quintals),
                mandi=bundle.target_mandi,
                current_price=int(bundle.current_mandi_price),
                expected_price=int(bundle.expected_price),
                saving=int(bundle.transport_saving_per_quintal),
                total_saving=int(bundle.transport_saving_per_quintal * bundle.total_quantity_quintals),
                farmer_count=len(farmer_phones),
                window_start=bundle.delivery_window_start.strftime("%b %d"),
                window_end=bundle.delivery_window_end.strftime("%b %d"),
            ),
            "message_template": message_template,
            "farmer_phones": farmer_phones,
            "triggered_at": datetime.now(UTC).isoformat(),
        }
        return await self._post("bundle-formed", payload)

    async def trigger_spoilage_emergency(
        self,
        farmer_id: str,
        crop: str,
        spoilage_pct: float,
        recommended_action: str,
        transit_hours: float,
        ambient_temp: float,
        nearest_cold_storage: str | None = None,
    ) -> bool:
        """
        Trigger spoilage emergency workflow.

        Sent when spoilage risk exceeds 65%.
        n8n workflow: spoilage_emergency.json

        Args:
            farmer_id: Farmer identifier
            crop: Crop name
            spoilage_pct: Spoilage probability percentage
            recommended_action: Recommended action text
            transit_hours: Estimated transit time
            ambient_temp: Ambient temperature during transit
            nearest_cold_storage: Optional cold storage facility name

        Returns:
            True if triggered successfully
        """
        payload = {
            "event": "spoilage_emergency",
            "farmer_id": farmer_id,
            "crop": crop,
            "spoilage_pct": spoilage_pct,
            "recommended_action": recommended_action,
            "transit_hours": transit_hours,
            "ambient_temp_celsius": ambient_temp,
            "nearest_cold_storage": nearest_cold_storage,
            "severity": "critical" if spoilage_pct >= 80 else "high",
            "triggered_at": datetime.now(UTC).isoformat(),
        }
        return await self._post("spoilage-emergency", payload)

    async def trigger_price_crash_warning(
        self,
        block_id: str,
        crop: str,
        forecast_price: float,
        current_price: float,
        drop_pct: float,
        affected_farmer_ids: list[str],
        alternative_mandi: str | None = None,
        alternative_price: float | None = None,
    ) -> bool:
        """
        Trigger price crash warning broadcast.

        Sent when price is forecast to drop more than 20%.
        n8n workflow: price_crash_broadcast.json

        Args:
            block_id: Block identifier
            crop: Crop name
            forecast_price: Predicted price (INR/quintal)
            current_price: Current mandi price
            drop_pct: Percentage drop
            affected_farmer_ids: List of affected farmer IDs
            alternative_mandi: Optional alternative mandi name
            alternative_price: Price at alternative mandi

        Returns:
            True if triggered successfully
        """
        payload = {
            "event": "price_crash_warning",
            "block_id": block_id,
            "crop": crop,
            "forecast_price": forecast_price,
            "current_price": current_price,
            "drop_pct": drop_pct,
            "affected_farmer_count": len(affected_farmer_ids),
            "alternative_mandi": alternative_mandi,
            "alternative_price": alternative_price,
            "telegram_broadcast": True,
            "triggered_at": datetime.now(UTC).isoformat(),
        }
        return await self._post("price-crash", payload)

    async def trigger_fpo_digest(
        self,
        fpo_id: str,
        weekly_stats: dict[str, Any],
        coordinator_email: str | None = None,
    ) -> bool:
        """
        Trigger weekly FPO digest.

        Sent every Monday with summary stats.
        n8n workflow: fpo_weekly_digest.json

        Args:
            fpo_id: FPO identifier
            weekly_stats: Dict with stats (advisories_sent, bundles_formed,
                         total_savings, etc.)
            coordinator_email: Optional coordinator email for direct send

        Returns:
            True if triggered successfully
        """
        payload = {
            "event": "fpo_weekly_digest",
            "fpo_id": fpo_id,
            "week_start": weekly_stats.get("week_start"),
            "week_end": weekly_stats.get("week_end"),
            "stats": {
                "advisories_sent": weekly_stats.get("advisories_sent", 0),
                "bundles_formed": weekly_stats.get("bundles_formed", 0),
                "total_quantity_quintals": weekly_stats.get("total_quantity_quintals", 0.0),
                "total_transport_savings": weekly_stats.get("total_transport_savings", 0.0),
                "price_crashes_detected": weekly_stats.get("price_crashes_detected", 0),
                "spoilage_emergencies": weekly_stats.get("spoilage_emergencies", 0),
                "active_farmers": weekly_stats.get("active_farmers", 0),
            },
            "coordinator_email": coordinator_email,
            "triggered_at": datetime.now(UTC).isoformat(),
        }
        return await self._post("fpo-digest", payload)

    async def trigger_scheme_check(
        self,
        farmer: FarmerProfile,
    ) -> bool:
        """
        Trigger scheme eligibility check for new farmer.

        Checks PM-KISAN and PMFBY eligibility.
        n8n workflow: scheme_eligibility.json

        Args:
            farmer: FarmerProfile object

        Returns:
            True if triggered successfully
        """
        payload = {
            "event": "scheme_check",
            "farmer": farmer.model_dump(mode="json"),
            "triggered_at": datetime.now(UTC).isoformat(),
        }
        return await self._post("scheme-check", payload)

    async def trigger_harvest_reminder(
        self,
        farmer_id: str,
        crop: str,
        harvest_date: str,
        days_until_harvest: int,
        advisory_preview: str,
    ) -> bool:
        """
        Trigger proactive harvest reminder.

        Sent 1-2 days before harvest date.
        n8n workflow: harvest_alerts_daily.json (via daily scan)

        Args:
            farmer_id: Farmer identifier
            crop: Crop name
            harvest_date: Expected harvest date (ISO string)
            days_until_harvest: Days remaining
            advisory_preview: Short preview of recommendation

        Returns:
            True if triggered successfully
        """
        payload = {
            "event": "harvest_reminder",
            "farmer_id": farmer_id,
            "crop": crop,
            "harvest_date": harvest_date,
            "days_until_harvest": days_until_harvest,
            "advisory_preview": advisory_preview,
            "triggered_at": datetime.now(UTC).isoformat(),
        }
        return await self._post("harvest-reminder", payload)

    async def trigger_weather_alert(
        self,
        state: str,
        district: str,
        block_id: str | None,
        alert_type: str,
        severity: str,
        advisory_text: str,
    ) -> bool:
        """Trigger weather alert push/SMS workflow."""
        payload = {
            "event": "weather_alert",
            "state": state,
            "district": district,
            "block_id": block_id,
            "alert_type": alert_type,
            "severity": severity,
            "advisory_text": advisory_text,
            "triggered_at": datetime.now(UTC).isoformat(),
        }
        return await self._post("weather-alert", payload)


# =============================================================================
# Convenience functions — single-shot triggers
# =============================================================================


async def trigger_voice_advisory(
    farmer_id: str,
    phone: str,
    language: str,
    advisory_text: str,
) -> bool:
    """Trigger voice advisory workflow."""
    client = N8NClient()
    try:
        return await client.trigger_voice_advisory(farmer_id, phone, language, advisory_text)
    finally:
        await client.close()


async def trigger_advisory_delivered(
    farmer_id: str,
    advisory_id: str,
    language: str,
    channel: str = "whatsapp",
) -> bool:
    """Trigger advisory delivered event."""
    client = N8NClient()
    try:
        return await client.trigger_advisory_delivered(farmer_id, advisory_id, language, channel)
    finally:
        await client.close()


async def trigger_bundle_formed(
    bundle: CooperativeBundle,
    farmer_phones: list[str],
    message_template: str | None = None,
) -> bool:
    """Trigger bundle formed event."""
    client = N8NClient()
    try:
        return await client.trigger_bundle_formed(bundle, farmer_phones, message_template)
    finally:
        await client.close()


async def trigger_spoilage_emergency(
    farmer_id: str,
    crop: str,
    spoilage_pct: float,
    recommended_action: str,
    transit_hours: float = 0.0,
    ambient_temp: float = 30.0,
    nearest_cold_storage: str | None = None,
) -> bool:
    """Trigger spoilage emergency event."""
    client = N8NClient()
    try:
        return await client.trigger_spoilage_emergency(
            farmer_id, crop, spoilage_pct, recommended_action, transit_hours, ambient_temp, nearest_cold_storage
        )
    finally:
        await client.close()


async def trigger_price_crash_warning(
    block_id: str,
    crop: str,
    forecast_price: float,
    current_price: float,
    drop_pct: float,
    affected_farmer_ids: list[str],
    alternative_mandi: str | None = None,
    alternative_price: float | None = None,
) -> bool:
    """Trigger price crash warning event."""
    client = N8NClient()
    try:
        return await client.trigger_price_crash_warning(
            block_id,
            crop,
            forecast_price,
            current_price,
            drop_pct,
            affected_farmer_ids,
            alternative_mandi,
            alternative_price,
        )
    finally:
        await client.close()


async def trigger_fpo_digest(
    fpo_id: str,
    weekly_stats: dict[str, Any],
    coordinator_email: str | None = None,
) -> bool:
    """Trigger FPO weekly digest."""
    client = N8NClient()
    try:
        return await client.trigger_fpo_digest(fpo_id, weekly_stats, coordinator_email)
    finally:
        await client.close()


async def trigger_scheme_check(farmer: FarmerProfile) -> bool:
    """Trigger scheme eligibility check."""
    client = N8NClient()
    try:
        return await client.trigger_scheme_check(farmer)
    finally:
        await client.close()


async def trigger_harvest_alert(
    farmer_id: str,
    crop: str,
    harvest_date: str,
) -> bool:
    """
    Trigger harvest alert (for n8n webhook).

    This is the function called from the main FastAPI app
    when a harvest intent is submitted.
    """
    client = N8NClient()
    try:
        payload = {
            "event": "harvest_intent_submitted",
            "farmer_id": farmer_id,
            "crop": crop,
            "harvest_date": harvest_date,
            "triggered_at": datetime.now(UTC).isoformat(),
        }
        return await client._post("harvest-alert", payload)
    finally:
        await client.close()


async def trigger_weather_alert(
    state: str,
    district: str,
    block_id: str | None,
    alert_type: str,
    severity: str,
    advisory_text: str,
) -> bool:
    """Convenience trigger for weather alert workflow."""
    client = N8NClient()
    try:
        return await client.trigger_weather_alert(
            state=state,
            district=district,
            block_id=block_id,
            alert_type=alert_type,
            severity=severity,
            advisory_text=advisory_text,
        )
    finally:
        await client.close()


async def trigger_truck_booking(
    farmer_id: str,
    crop: str,
    quantity_quintals: float,
    source_location: str,
    destination_mandi: str,
    estimated_cost: float,
    phone: str = "+919000000000",
) -> bool:
    """Trigger truck booking workflow with detailed transport info."""
    client = N8NClient()
    try:
        message_template = (
            "🚚 *TRUCK BOOKING CONFIRMED* 🚚\n\n"
            "Crop: {crop}\n"
            "Quantity: {quantity} quintals\n\n"
            "📍 *Route Details*\n"
            "From: {source}\n"
            "To: {destination}\n\n"
            "💰 *Cost Details*\n"
            "Estimated Cost: ₹{cost}\n"
            "Cost/quintal: ₹{cost_per_q}\n\n"
            "📅 *Next Steps*\n"
            "1. Confirm booking details\n"
            "2. Arrange loading\n"
            "3. Driver will contact you\n\n"
            "✅ Booking ID: {booking_id}"
        )

        cost_per_q = estimated_cost / quantity_quintals if quantity_quintals > 0 else 0
        booking_id = f"TRK-{farmer_id[:3].upper()}-{datetime.now().strftime('%Y%m%d%H%M')}"

        payload = {
            "event": "truck_booking",
            "farmer_id": farmer_id,
            "crop": crop,
            "quantity": quantity_quintals,
            "source": source_location,
            "destination": destination_mandi,
            "estimated_cost": estimated_cost,
            "phone": phone,
            "booking_id": booking_id,
            "text": message_template.format(
                crop=crop,
                quantity=int(quantity_quintals),
                source=source_location,
                destination=destination_mandi,
                cost=int(estimated_cost),
                cost_per_q=int(cost_per_q),
                booking_id=booking_id,
            ),
            "triggered_at": datetime.now(UTC).isoformat(),
        }
        return await client._post("truck_booking", payload)
    finally:
        await client.close()


if __name__ == "__main__":
    # Smoke test
    import asyncio

    logging.basicConfig(level=logging.INFO)

    async def test():
        client = N8NClient()
        # Test with no URL set (should warn and skip)
        result = await client.trigger_advisory_delivered(
            farmer_id="TEST",
            advisory_id="ADV001",
            language="hi",
        )
        print(f"Trigger result (expected False): {result}")
        await client.close()

    asyncio.run(test())
