"""
NASA POWER data source — fetches satellite-based soil moisture data.
API: https://power.larc.nasa.gov/
"""

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta

import httpx

# The original schema used in fusion.py
from mandi_agent.backend.services.data_sources.isro_mosdac import SoilMoistureReading, _generate_simulated_soil_moisture

logger = logging.getLogger(__name__)

NASA_POWER_BASE_URL = os.getenv("NASA_POWER_BASE_URL", "https://power.larc.nasa.gov/api/temporal/daily/point")


async def fetch_soil_moisture(
    lat: float,
    lng: float,
    block_id: str,
) -> SoilMoistureReading:
    """
    Fetch daily soil moisture (root zone) for a lat/lng coordinate using NASA POWER API.
    Falls back to simulated values if API is unavailable.

    Args:
        lat: Latitude (-90 to 90)
        lng: Longitude (-180 to 180)
        block_id: 6km radius block identifier

    Returns:
        SoilMoistureReading with soil_moisture_pct, reading_date, satellite_pass_time
    """
    # Use yesterday's date or two days ago as NASA POWER daily point data is often 1-2 days delayed
    target_date = datetime.now(UTC).date() - timedelta(days=2)
    start_str = target_date.strftime("%Y%m%d")
    end_str = start_str

    params = {
        "parameters": "GWETROOT",  # Root Zone Soil Wetness (Profile)
        "community": "AG",
        "longitude": round(lng, 4),
        "latitude": round(lat, 4),
        "start": start_str,
        "end": end_str,
        "format": "JSON",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(NASA_POWER_BASE_URL, params=params, timeout=30.0)
            response.raise_for_status()
            data = response.json()

            # GWETROOT typically returns values between 0.0 and 1.0 (as index)
            # Find the value in the "properties.parameter.GWETROOT" dict
            params_data = data.get("properties", {}).get("parameter", {}).get("GWETROOT", {})

            # Since we requested 1 day, params_data maps date strings (e.g., "20240321") to values
            moisture_val = None
            for _key, val in params_data.items():
                if val != -999.0:  # NASA's fill value for missing data
                    moisture_val = val
                    break

            if moisture_val is not None:
                # Convert the index (0-1) to percentage (0-100)
                soil_moisture_pct = round(moisture_val * 100, 1)

                # We assume the satellite reading is generally captured at midday
                satellite_pass_time = datetime.combine(
                    target_date, datetime.strptime("12:00", "%H:%M").time(), tzinfo=UTC
                )

                return SoilMoistureReading(
                    block_id=block_id,
                    soil_moisture_pct=soil_moisture_pct,
                    reading_date=target_date,
                    satellite_pass_time=satellite_pass_time,
                    simulated=False,
                )

    except httpx.HTTPStatusError as e:
        logger.warning(
            "NASA POWER HTTP %d for (%.2f, %.2f) — using simulated: %s", e.response.status_code, lat, lng, str(e)[:100]
        )
    except httpx.TimeoutException:
        logger.warning("NASA POWER timeout for (%.2f, %.2f) — using simulated", lat, lng)
    except httpx.RequestError as e:
        logger.warning("NASA POWER request error for (%.2f, %.2f) — using simulated: %s", lat, lng, str(e)[:100])
    except (KeyError, ValueError) as e:
        logger.warning("NASA POWER parse error for (%.2f, %.2f) — using simulated: %s", lat, lng, str(e)[:100])

    # Fallback to simulated data
    return _generate_simulated_soil_moisture(lat, lng, block_id)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    result = asyncio.run(fetch_soil_moisture(lat=13.5833, lng=76.0364, block_id="KA-001"))
    print(f"Block: {result.block_id}")
    print(f"Soil Moisture: {result.soil_moisture_pct}%")
    print(f"Date: {result.reading_date}")
    print(f"Simulated: {result.simulated}")
