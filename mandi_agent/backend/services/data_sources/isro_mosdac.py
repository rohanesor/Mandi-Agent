"""
ISRO MOSDAC data source — fetches satellite-based soil moisture data.
API: https://mosdac.gov.in/
"""

import asyncio
import logging
import math
import random
from datetime import datetime, timedelta, timezone, date
from typing import Optional
from dataclasses import dataclass

import httpx

from mandi_agent.backend.api.core_schemas import MandiPrice

logger = logging.getLogger(__name__)

MOSDAC_BASE_URL = "https://mosdac.gov.in/api"


def _get_api_token() -> str:
    """Fetch ISRO MOSDAC token from environment."""
    import os
    return os.getenv("ISRO_MOSDAC_TOKEN", "")


@dataclass
class SoilMoistureReading:
    """Soil moisture data from satellite observation."""
    block_id: str
    soil_moisture_pct: float
    reading_date: date
    satellite_pass_time: datetime
    simulated: bool = False


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate great-circle distance between two points in km.

    Uses Haversine formula for accurate Earth surface distance.
    """
    R = 6371.0  # Earth radius in km

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = (math.sin(delta_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def _generate_simulated_soil_moisture(
    lat: float,
    lng: float,
    block_id: str,
) -> SoilMoistureReading:
    """
    Generate realistic simulated soil moisture when API is unavailable.

    Uses latitude-based seasonal patterns to simulate realistic values:
    - Coastal/tropical regions (south India): higher moisture 60-85%
    - Arid regions (northwest): lower moisture 45-65%
    - Central India: 50-75%

    Args:
        lat: Latitude
        lng: Longitude
        block_id: Block identifier

    Returns:
        SoilMoistureReading with simulated=True
    """
    # Latitude-based base moisture (India roughly 8°N to 37°N)
    if lat < 15:
        # South India — tropical, higher moisture
        base_moisture = random.uniform(65.0, 85.0)
    elif lat < 22:
        # Central India
        base_moisture = random.uniform(55.0, 75.0)
    elif lat < 28:
        # North India
        base_moisture = random.uniform(50.0, 70.0)
    else:
        # Himalayan region
        base_moisture = random.uniform(45.0, 65.0)

    # Add small random variation
    soil_moisture_pct = round(base_moisture + random.uniform(-5.0, 5.0), 1)
    soil_moisture_pct = max(45.0, min(85.0, soil_moisture_pct))  # Clamp to realistic range

    # Satellite pass time — typically morning (6-10 AM local)
    today = datetime.now(timezone.utc).date()
    satellite_pass = datetime.combine(
        today,
        datetime.strptime("07:30", "%H:%M").time(),
        tzinfo=timezone.utc
    )

    logger.debug(
        "Generated simulated soil moisture for block %s (%.2f, %.2f): %.1f%%",
        block_id, lat, lng, soil_moisture_pct
    )

    return SoilMoistureReading(
        block_id=block_id,
        soil_moisture_pct=soil_moisture_pct,
        reading_date=today,
        satellite_pass_time=satellite_pass,
        simulated=True,
    )


async def fetch_soil_moisture(
    lat: float,
    lng: float,
    block_id: str,
) -> SoilMoistureReading:
    """
    Fetch 8-day composite soil moisture for a lat/lng coordinate.

    Uses ISRO MOSDAC Soil Moisture Ocean Salinity (SMOS) data.
    Falls back to simulated values if API is unavailable.

    Args:
        lat: Latitude (-90 to 90)
        lng: Longitude (-180 to 180)
        block_id: 6km radius block identifier

    Returns:
        SoilMoistureReading with soil_moisture_pct, reading_date, satellite_pass_time
    """
    token = _get_api_token()

    if not token:
        logger.warning("ISRO_MOSDAC_TOKEN not set — using simulated soil moisture")
        return _generate_simulated_soil_moisture(lat, lng, block_id)

    # MOSDAC SMOS API endpoint for soil moisture
    # Note: Actual API structure may vary — using placeholder endpoint
    url = f"{MOSDAC_BASE_URL}/soil_moisture"
    params = {
        "lat": round(lat, 4),
        "lng": round(lng, 4),
        "product": "8day_composite",
        "token": token,
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=30.0)
            response.raise_for_status()
            data = response.json()

            # Parse MOSDAC response — exact field names depend on API
            soil_moisture_pct = float(data.get("soil_moisture_percent", 0.0))
            reading_date_str = data.get("date", datetime.now(timezone.utc).isoformat())
            pass_time_str = data.get("satellite_pass_utc", datetime.now(timezone.utc).isoformat())

            # Parse dates
            reading_date = datetime.fromisoformat(reading_date_str.replace("Z", "+00:00")).date()
            satellite_pass_time = datetime.fromisoformat(pass_time_str.replace("Z", "+00:00"))

            return SoilMoistureReading(
                block_id=block_id,
                soil_moisture_pct=round(soil_moisture_pct, 1),
                reading_date=reading_date,
                satellite_pass_time=satellite_pass_time,
                simulated=False,
            )

    except httpx.HTTPStatusError as e:
        logger.warning(
            "MOSDAC HTTP %d for (%.2f, %.2f) — using simulated: %s",
            e.response.status_code, lat, lng, str(e)[:100]
        )
    except httpx.TimeoutException:
        logger.warning("MOSDAC timeout for (%.2f, %.2f) — using simulated", lat, lng)
    except httpx.RequestError as e:
        logger.warning("MOSDAC request error for (%.2f, %.2f) — using simulated: %s",
                      lat, lng, str(e)[:100])
    except (KeyError, ValueError) as e:
        logger.warning("MOSDAC parse error for (%.2f, %.2f) — using simulated: %s",
                      lat, lng, str(e)[:100])

    # Fallback to simulated data
    return _generate_simulated_soil_moisture(lat, lng, block_id)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Test with sample Karnataka coordinates
    result = asyncio.run(fetch_soil_moisture(
        lat=13.5833,
        lng=76.0364,
        block_id="KA-001"
    ))
    print(f"Block: {result.block_id}")
    print(f"Soil Moisture: {result.soil_moisture_pct}%")
    print(f"Date: {result.reading_date}")
    print(f"Simulated: {result.simulated}")
