"""
Agmarknet data source — fetches mandi prices from data.gov.in API.
API: https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070
"""

import asyncio
import contextlib
import logging
from datetime import UTC, date, datetime

import httpx
from dotenv import load_dotenv

from mandi_agent.backend.api.core_schemas import MandiPrice

load_dotenv()

logger = logging.getLogger(__name__)

# Agmarknet API on data.gov.in
AGMARKNET_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"
AGMARKNET_API_URL = f"https://api.data.gov.in/resource/{AGMARKNET_RESOURCE_ID}"
DATA_GOV_API_KEY = ""  # Loaded from env


def _get_api_key() -> str:
    """Fetch API key from environment."""
    import os

    return os.getenv("DATA_GOV_API_KEY", "")


async def _fetch_with_retry(
    client: httpx.AsyncClient,
    url: str,
    params: dict,
    max_attempts: int = 3,
    backoff_seconds: float = 2.0,
) -> dict | None:
    """
    Fetch URL with retry logic and exponential backoff.

    Args:
        client: httpx AsyncClient
        url: Target URL
        params: Query parameters
        max_attempts: Number of retry attempts
        backoff_seconds: Base backoff delay (doubles each retry)

    Returns:
        Response JSON dict or None on complete failure
    """
    for attempt in range(1, max_attempts + 1):
        try:
            response = await client.get(url, params=params, timeout=30.0)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.warning(
                "Agmarknet HTTP error attempt %d/%d: %s %s",
                attempt,
                max_attempts,
                e.response.status_code,
                e.response.text[:200],
            )
        except httpx.TimeoutException as e:
            logger.warning("Agmarknet timeout attempt %d/%d: %s", attempt, max_attempts, str(e))
        except httpx.RequestError as e:
            logger.warning("Agmarknet request error attempt %d/%d: %s", attempt, max_attempts, str(e))

        if attempt < max_attempts:
            # Exponential backoff: 2s, 4s, 8s
            delay = backoff_seconds * (2 ** (attempt - 1))
            logger.debug("Retrying Agmarknet in %.1f seconds...", delay)
            await asyncio.sleep(delay)

    logger.error("Agmarknet fetch failed after %d attempts", max_attempts)
    return None


def _parse_agmarknet_record(record: dict) -> MandiPrice | None:
    """
    Parse a single Agmarknet API record into MandiPrice schema.

    Maps data.gov.in field names to MandiPrice fields.
    API returns records with: state, district, market, commodity,
    variety, min_price, max_price, modal_price, price_received_date

    Args:
        record: Raw record dict from API

    Returns:
        MandiPrice instance or None if parsing fails
    """
    try:
        # Skip records with missing essential fields
        required_fields = ["market", "state", "commodity", "variety", "min_price", "max_price", "modal_price"]
        for field in required_fields:
            if not record.get(field):
                return None

        # Parse date — API returns DD-MM-YYYY format
        date_str = record.get("price_received_date", "")
        try:
            price_date = datetime.strptime(date_str, "%d-%m-%Y").date()
        except ValueError:
            try:
                # Try alternate format
                price_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                price_date = date.today()

        # Parse numeric fields — API returns strings
        def parse_float(val) -> float:
            if val is None:
                return 0.0
            try:
                return float(str(val).strip())
            except (ValueError, TypeError):
                return 0.0

        min_price = parse_float(record.get("min_price"))
        max_price = parse_float(record.get("max_price"))
        modal_price = parse_float(record.get("modal_price"))

        # Validate price range consistency
        if not (min_price <= modal_price <= max_price):
            # Adjust to maintain consistency
            modal_price = max(min_price, min(modal_price, max_price))

        # Parse arrival quantity (tonnes) — optional field
        arrival_tonnes = None
        arrival_str = record.get("arrivals_in_tonnes", "")
        if arrival_str:
            with contextlib.suppress(ValueError, TypeError):
                arrival_tonnes = float(arrival_str.strip())

        return MandiPrice(
            mandi_name=record["market"].strip(),
            state=record["state"].strip(),
            commodity=record["commodity"].strip(),
            variety=record.get("variety", "").strip() or "mixed",
            min_price=min_price,
            max_price=max_price,
            modal_price=modal_price,
            arrival_tonnes=arrival_tonnes,
            price_date=price_date,
            source="agmarknet",
        )

    except Exception as e:
        logger.debug("Failed to parse Agmarknet record: %s — %s", record, str(e))
        return None


async def fetch_agmarknet_prices(
    commodity: str | None = None,
    state: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = 100,
) -> list[MandiPrice]:
    """
    Fetch daily mandi prices from data.gov.in Agmarknet API.

    API docs: https://api.data.gov.in/documents/api-guide
    Rate limit: 100 requests/hour (use caching in production)

    Args:
        commodity: Filter by commodity name (e.g., "Tomato")
        state: Filter by state name (e.g., "Karnataka")
        from_date: Start date (defaults to today)
        to_date: End date (defaults to today)
        limit: Maximum records to fetch (API max: 10000)

    Returns:
        List of validated MandiPrice records (empty list on failure)
    """
    api_key = _get_api_key()
    if not api_key:
        logger.error("DATA_GOV_API_KEY not set in environment")
        return []

    # Default date range to today
    if from_date is None:
        from_date = date.today()
    if to_date is None:
        to_date = from_date

    # Format dates for API (DD-MM-YYYY)
    date_format = "%d-%m-%Y"
    params = {
        "api-key": api_key,
        "format": "json",
        "limit": limit,
        "filters[price_received_date]": from_date.strftime(date_format)
        if from_date == to_date
        else f"{from_date.strftime(date_format)},{to_date.strftime(date_format)}",
    }

    # Add optional filters
    if commodity:
        params["filters[commodity]"] = commodity
    if state:
        params["filters[state]"] = state

    results: list[MandiPrice] = []
    fetch_start = datetime.now(UTC)

    async with httpx.AsyncClient() as client:
        data = await _fetch_with_retry(client, AGMARKNET_API_URL, params)

        if data is None:
            return []

        # Parse records — API returns 'records' key with list of dicts
        raw_records = data.get("records", [])
        if not raw_records:
            logger.info("Agmarknet returned 0 records for date=%s commodity=%s", from_date, commodity)
            return []

        for record in raw_records:
            mandi_price = _parse_agmarknet_record(record)
            if mandi_price is not None:
                results.append(mandi_price)

    fetch_duration_ms = (datetime.now(UTC) - fetch_start).total_seconds() * 1000
    logger.info(
        "Agmarknet fetch complete: %d records in %.0fms (date=%s, commodity=%s, state=%s)",
        len(results),
        fetch_duration_ms,
        from_date,
        commodity,
        state,
    )

    return results


async def fetch_today_prices(commodity: str | None = None) -> list[MandiPrice]:
    """
    Convenience wrapper — fetch today's prices for a commodity.

    Args:
        commodity: Commodity name (optional)

    Returns:
        List of MandiPrice records for today
    """
    return await fetch_agmarknet_prices(commodity=commodity, from_date=date.today())


if __name__ == "__main__":
    # Quick smoke test
    logging.basicConfig(level=logging.INFO)
    prices = asyncio.run(fetch_today_prices(commodity="Tomato"))
    print(f"Fetched {len(prices)} Tomato prices")
    for p in prices[:3]:
        print(f"  {p.mandi_name}, {p.state}: ₹{p.modal_price}/q")
