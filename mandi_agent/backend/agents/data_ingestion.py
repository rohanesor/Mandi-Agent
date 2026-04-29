"""
Data ingestion agent — pulls prices from Agmarknet and eNAM.
Writes validated MandiPrice records to Supabase.

Delegates to the real data source modules:
  - backend.data_sources.agmarknet
  - backend.data_sources.enam
"""

import asyncio
import logging
import os
from datetime import date, datetime, timezone
from typing import List, Optional

from mandi_agent.backend.models.schemas import MandiPrice

logger = logging.getLogger(__name__)


async def fetch_agmarknet_prices(
    state: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    commodity: Optional[str] = None,
    limit: int = 100,
) -> List[MandiPrice]:
    """
    Fetch daily prices from Agmarknet API.

    Delegates to backend.data_sources.agmarknet module which handles
    data.gov.in API calls with retry logic and rate limiting.

    Args:
        state: Indian state name (e.g., "Karnataka")
        from_date: Start date for price range (default: today)
        to_date: End date for price range (default: same as from_date)
        commodity: Filter by commodity name (optional)
        limit: Maximum records to fetch

    Returns:
        List of validated MandiPrice records
    """
    from mandi_agent.backend.data_sources.agmarknet import fetch_agmarknet_prices as _fetch

    try:
        prices = await _fetch(
            commodity=commodity,
            state=state,
            from_date=from_date or date.today(),
            to_date=to_date or from_date or date.today(),
            limit=limit,
        )
        logger.info(
            "Ingested %d Agmarknet prices for state=%s commodity=%s",
            len(prices), state, commodity,
        )
        return prices

    except Exception as e:
        logger.error("Agmarknet ingestion failed: %s", str(e)[:200])
        return []


async def fetch_enam_prices(
    state: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    commodity: Optional[str] = None,
    limit: int = 100,
) -> List[MandiPrice]:
    """
    Fetch daily prices from eNAM (electronic National Agriculture Market).

    Delegates to backend.data_sources.enam module which handles
    eNAM API calls and parsing.

    Args:
        state: Indian state name
        from_date: Start date
        to_date: End date
        commodity: Filter by commodity name
        limit: Maximum records

    Returns:
        List of validated MandiPrice records
    """
    from mandi_agent.backend.data_sources.enam import fetch_enam_prices as _fetch

    try:
        prices = await _fetch(
            state=state,
            commodity=commodity,
            from_date=from_date or date.today(),
            to_date=to_date or from_date or date.today(),
            limit=limit,
        )
        logger.info(
            "Ingested %d eNAM prices for state=%s commodity=%s",
            len(prices), state, commodity,
        )
        return prices

    except Exception as e:
        logger.error("eNAM ingestion failed: %s", str(e)[:200])
        return []


async def ingest_all_prices(
    state: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    commodity: Optional[str] = None,
) -> List[MandiPrice]:
    """
    Fetch prices from ALL data sources concurrently and merge results.

    Runs Agmarknet and eNAM fetches in parallel and deduplicates
    by (mandi_name, commodity, price_date).

    Args:
        state: Indian state name
        from_date: Start date
        to_date: End date
        commodity: Filter by commodity name

    Returns:
        Merged, deduplicated list of MandiPrice records
    """
    agmarknet_task = fetch_agmarknet_prices(
        state=state, from_date=from_date, to_date=to_date, commodity=commodity
    )
    enam_task = fetch_enam_prices(
        state=state, from_date=from_date, to_date=to_date, commodity=commodity
    )

    agmarknet_prices, enam_prices = await asyncio.gather(
        agmarknet_task, enam_task, return_exceptions=True
    )

    # Handle exceptions from gather
    all_prices: List[MandiPrice] = []
    if isinstance(agmarknet_prices, list):
        all_prices.extend(agmarknet_prices)
    else:
        logger.error("Agmarknet gather error: %s", str(agmarknet_prices)[:200])

    if isinstance(enam_prices, list):
        all_prices.extend(enam_prices)
    else:
        logger.error("eNAM gather error: %s", str(enam_prices)[:200])

    # Deduplicate by (mandi, commodity, date) — prefer Agmarknet data
    seen = set()
    deduplicated: List[MandiPrice] = []
    for price in all_prices:
        key = (price.mandi_name.lower(), price.commodity.lower(), str(price.price_date))
        if key not in seen:
            seen.add(key)
            deduplicated.append(price)

    logger.info(
        "Total ingested: %d prices (%d Agmarknet + %d eNAM → %d unique)",
        len(all_prices),
        len(agmarknet_prices) if isinstance(agmarknet_prices, list) else 0,
        len(enam_prices) if isinstance(enam_prices, list) else 0,
        len(deduplicated),
    )

    return deduplicated


async def store_prices_to_supabase(prices: List[MandiPrice]) -> int:
    """
    Store MandiPrice records to Supabase.

    Args:
        prices: List of MandiPrice records to store

    Returns:
        Number of records successfully stored
    """
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

    if not supabase_url or not supabase_key:
        logger.warning("Supabase not configured — skipping price storage")
        return 0

    try:
        from supabase import create_client

        supabase = create_client(supabase_url, supabase_key)

        records = [p.model_dump(mode="json") for p in prices]

        # Upsert to avoid duplicates
        response = await supabase.table("mandi_prices").upsert(
            records,
            on_conflict="mandi_name,commodity,price_date",
        ).execute()

        stored_count = len(response.data) if response.data else 0
        logger.info("Stored %d price records to Supabase", stored_count)
        return stored_count

    except Exception as e:
        logger.error("Supabase storage failed: %s", str(e)[:200])
        return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def test():
        prices = await ingest_all_prices(
            state="Maharashtra",
            commodity="Tomato",
        )
        print(f"Fetched {len(prices)} prices")
        for p in prices[:5]:
            print(f"  {p.mandi_name}, {p.state}: ₹{p.modal_price}/q ({p.source})")

    asyncio.run(test())
