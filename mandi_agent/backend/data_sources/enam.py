"""
eNAM data source — fetches electronic National Agriculture Market prices.
API: https://enam.gov.in/
eNAM reports actual farmer sale prices (different from Agmarknet posted prices).
"""

import asyncio
import logging
from datetime import date, datetime
from typing import List, Optional

import httpx

from mandi_agent.backend.models.schemas import MandiPrice

logger = logging.getLogger(__name__)

ENAM_API_URL = "https://enam.gov.in/api/v1"


def _get_api_key() -> str:
    """Fetch eNAM API key from environment."""
    import os
    return os.getenv("ENAM_API_KEY", "")


def _parse_enam_record(record: dict) -> Optional[MandiPrice]:
    """
    Parse a single eNAM API record into MandiPrice schema.

    eNAM returns actual trade data including:
    - mandi name, state
    - commodity, variety
    - min/max/modal price (INR/quintal)
    - arrival quantity
    - trade date

    Args:
        record: Raw record dict from eNAM API

    Returns:
        MandiPrice instance or None if parsing fails
    """
    try:
        required_fields = ["mandi_name", "state", "commodity", "variety",
                          "min_price", "max_price", "modal_price"]
        for field in required_fields:
            if not record.get(field):
                return None

        # Parse date
        date_str = record.get("trade_date", record.get("date", ""))
        try:
            trade_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            trade_date = date.today()

        # Parse numeric fields
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

        # Ensure price consistency
        if not (min_price <= modal_price <= max_price):
            modal_price = max(min_price, min(modal_price, max_price))

        # Parse arrival (tonnes)
        arrival_tonnes = None
        arrival_str = record.get("arrival_tonnes", record.get("quantity", ""))
        if arrival_str:
            try:
                arrival_tonnes = float(arrival_str.strip())
            except (ValueError, TypeError):
                pass

        return MandiPrice(
            mandi_name=record["mandi_name"].strip(),
            state=record["state"].strip(),
            commodity=record["commodity"].strip(),
            variety=record.get("variety", "").strip() or "mixed",
            min_price=min_price,
            max_price=max_price,
            modal_price=modal_price,
            arrival_tonnes=arrival_tonnes,
            price_date=trade_date,
            source="enam",
        )

    except Exception as e:
        logger.debug("Failed to parse eNAM record: %s — %s", record, str(e))
        return None


async def fetch_enam_prices(
    commodity: Optional[str] = None,
    state: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    limit: int = 100,
) -> List[MandiPrice]:
    """
    Fetch prices from eNAM (electronic National Agriculture Market).

    eNAM provides actual farmer sale prices — typically lower than
    Agmarknet's modal prices which include trader margins.

    API docs: https://enam.gov.in/api/v1/docs

    Args:
        commodity: Filter by commodity name (e.g., "Onion")
        state: Filter by state name (e.g., "Maharashtra")
        from_date: Start date (defaults to today)
        to_date: End date (defaults to today)
        limit: Maximum records to fetch

    Returns:
        List of MandiPrice records with source="enam"
    """
    api_key = _get_api_key()
    if not api_key:
        logger.warning("ENAM_API_KEY not set — skipping eNAM fetch")
        return []

    if from_date is None:
        from_date = date.today()
    if to_date is None:
        to_date = from_date

    # eNAM API endpoint
    url = f"{ENAM_API_URL}/prices"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "limit": limit,
    }

    if commodity:
        payload["commodity"] = commodity
    if state:
        payload["state"] = state

    results: List[MandiPrice] = []
    fetch_start = datetime.utcnow()

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers=headers,
                json=payload,
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            raw_records = data.get("records", []) or data.get("data", [])
            if not raw_records:
                logger.info("eNAM returned 0 records for commodity=%s state=%s",
                           commodity, state)
                return []

            for record in raw_records:
                mandi_price = _parse_enam_record(record)
                if mandi_price is not None:
                    results.append(mandi_price)

    except httpx.HTTPStatusError as e:
        logger.warning("eNAM HTTP %d: %s", e.response.status_code, str(e)[:200])
    except httpx.TimeoutException:
        logger.warning("eNAM timeout for commodity=%s state=%s", commodity, state)
    except httpx.RequestError as e:
        logger.warning("eNAM request error: %s", str(e)[:200])
    except (KeyError, ValueError) as e:
        logger.warning("eNAM parse error: %s", str(e)[:200])

    fetch_duration_ms = (datetime.utcnow() - fetch_start).total_seconds() * 1000
    logger.info(
        "eNAM fetch complete: %d records in %.0fms (commodity=%s, state=%s)",
        len(results), fetch_duration_ms, commodity, state
    )

    return results


async def fetch_enam_prices_by_mandi(
    mandi_name: str,
    commodity: Optional[str] = None,
    days: int = 7,
) -> List[MandiPrice]:
    """
    Convenience wrapper — fetch recent prices for a specific mandi.

    Args:
        mandi_name: Mandi name (e.g., "Vashi Navi Mumbai")
        commodity: Optional commodity filter
        days: Number of days to look back

    Returns:
        List of MandiPrice records
    """
    from_date = date.today() - timedelta(days=days)
    return await fetch_enam_prices(
        commodity=commodity,
        from_date=from_date,
        to_date=date.today(),
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    prices = asyncio.run(fetch_enam_prices(commodity="Onion", state="Maharashtra"))
    print(f"Fetched {len(prices)} eNAM Onion prices from Maharashtra")
    for p in prices[:3]:
        print(f"  {p.mandi_name}: ₹{p.modal_price}/q ({p.arrival_tonnes}t)")
