"""
IMD Weather data source — fetches district-level weather forecasts.
Primary: mausam.imd.gov.in
Fallback: OpenWeatherMap
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

IMD_BASE_URL = "https://mausam.imd.gov.in"
OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5"


def _get_imd_api_key() -> str:
    import os
    return os.getenv("IMD_API_KEY", "")


def _get_openweather_api_key() -> str:
    import os
    return os.getenv("OPENWEATHER_API_KEY", "")


@dataclass
class DayForecast:
    """Single day weather forecast."""
    date: date
    max_temp_celsius: float
    min_temp_celsius: float
    rainfall_mm: float
    humidity_pct: int
    weather_condition: str  # sunny, cloudy, rainy, partly_cloudy, foggy


@dataclass
class WeatherForecast:
    """7-day weather forecast for a district."""
    district: str
    state: str
    forecast_days: list[DayForecast] = field(default_factory=list)
    source: str = "imd"  # "imd" or "openweather"
    fetched_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def _parse_imd_response(data: dict, district: str, state: str) -> WeatherForecast:
    """
    Parse IMD API response into WeatherForecast.

    IMD returns JSON with daily forecast data.
    Field names vary by endpoint — using common patterns.

    Args:
        data: Raw JSON from IMD API
        district: District name
        state: State name

    Returns:
        WeatherForecast with list of DayForecast
    """
    forecast_days = []

    # IMD typically returns 'data' or 'forecast' array
    records = data.get("data", []) or data.get("forecast", []) or []

    for day_data in records:
        try:
            # Parse date
            date_str = day_data.get("date", day_data.get("date_val", ""))
            if isinstance(date_str, str):
                forecast_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            else:
                forecast_date = date_str

            # Temperature (IMD uses Celsius)
            max_temp = float(day_data.get("max_temp", day_data.get("maxTemperature", 30)))
            min_temp = float(day_data.get("min_temp", day_data.get("minTemperature", 20)))

            # Rainfall (mm)
            rainfall = float(day_data.get("rainfall", day_data.get("rain_mm", 0)))

            # Humidity (%)
            humidity = int(day_data.get("humidity", day_data.get("humidity_percent", 60)))

            # Weather condition — map to standardized values
            raw_condition = str(day_data.get("weather", day_data.get("condition", "sunny"))).lower()
            condition = _normalize_weather_condition(raw_condition)

            forecast_days.append(DayForecast(
                date=forecast_date,
                max_temp_celsius=round(max_temp, 1),
                min_temp_celsius=round(min_temp, 1),
                rainfall_mm=round(rainfall, 1),
                humidity_pct=min(100, max(0, humidity)),
                weather_condition=condition,
            ))
        except (KeyError, ValueError) as e:
            logger.debug("Skipping invalid IMD forecast day: %s — %s", day_data, str(e))
            continue

    return WeatherForecast(
        district=district,
        state=state,
        forecast_days=forecast_days,
        source="imd",
    )


def _normalize_weather_condition(condition: str) -> str:
    """
    Normalize weather condition strings to standard values.

    Args:
        condition: Raw condition string from API

    Returns:
        Standardized condition: sunny, partly_cloudy, cloudy, rainy, foggy
    """
    condition = condition.lower().strip()

    if any(k in condition for k in ["clear", "sunny", "no cloud"]):
        return "sunny"
    elif any(k in condition for k in ["partly", "scattered", "few clouds"]):
        return "partly_cloudy"
    elif any(k in condition for k in ["overcast", "cloudy", "grey"]):
        return "cloudy"
    elif any(k in condition for k in ["rain", "shower", "drizzle", "thunder", "precip"]):
        return "rainy"
    elif any(k in condition for k in ["fog", "mist", "haze"]):
        return "foggy"
    else:
        return "sunny"


def _parse_openweather_response(data: dict, district: str, state: str) -> WeatherForecast:
    """
    Parse OpenWeatherMap response into WeatherForecast.

    OpenWeatherMap free tier returns 5-day/3-hour forecast.
    We aggregate to daily values.

    Args:
        data: Raw JSON from OpenWeatherMap
        district: District name
        state: State name

    Returns:
        WeatherForecast with aggregated daily data
    """
    # Group by date
    daily_data: dict[str, list] = {}
    for entry in data.get("list", []):
        dt = datetime.fromtimestamp(entry["dt"], tz=timezone.utc)
        day_key = dt.date().isoformat()
        daily_data.setdefault(day_key, []).append(entry)

    # Aggregate to daily values (take max/min temp, sum rainfall)
    forecast_days = []
    for day_key, entries in sorted(daily_data.items())[:7]:
        temps = [e["main"]["temp"] for e in entries]
        max_temp = max(temps)
        min_temp = min(temps)

        # Rainfall = sum of rain in 3-hour blocks
        rainfall = sum(e.get("rain", {}).get("3h", 0) for e in entries)

        # Humidity = average
        humidity = int(sum(e["main"]["humidity"] for e in entries) / len(entries))

        # Weather condition = most common
        conditions = [e["weather"][0]["main"].lower() for e in entries]
        raw_condition = max(set(conditions), key=conditions.count)

        forecast_days.append(DayForecast(
            date=date.fromisoformat(day_key),
            max_temp_celsius=round(max_temp, 1),
            min_temp_celsius=round(min_temp, 1),
            rainfall_mm=round(rainfall, 1),
            humidity_pct=min(100, max(0, humidity)),
            weather_condition=_normalize_weather_condition(raw_condition),
        ))

    return WeatherForecast(
        district=district,
        state=state,
        forecast_days=forecast_days,
        source="openweather",
    )


async def fetch_imd_forecast(
    district: str,
    state: str,
) -> Optional[WeatherForecast]:
    """
    Fetch 7-day forecast from IMD API.

    Args:
        district: District name (e.g., "Bangalore Rural")
        state: State name (e.g., "Karnataka")

    Returns:
        WeatherForecast or None on failure
    """
    api_key = _get_imd_api_key()
    if not api_key:
        logger.debug("IMD_API_KEY not set")
        return None

    # IMD API endpoint — exact path may vary
    url = f"{IMD_BASE_URL}/api/forecast"
    params = {
        "district": district,
        "state": state,
        "api_key": api_key,
        "format": "json",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=30.0)
            response.raise_for_status()
            data = response.json()
            return _parse_imd_response(data, district, state)

    except httpx.HTTPStatusError as e:
        logger.warning("IMD HTTP %d for %s, %s: %s",
                      e.response.status_code, district, state, str(e)[:100])
    except httpx.TimeoutException:
        logger.warning("IMD timeout for %s, %s", district, state)
    except httpx.RequestError as e:
        logger.warning("IMD request error for %s, %s: %s", district, state, str(e)[:100])
    except (KeyError, ValueError) as e:
        logger.warning("IMD parse error for %s, %s: %s", district, state, str(e)[:100])

    return None


async def fetch_openweather_forecast(
    lat: float,
    lon: float,
    district: str,
    state: str,
) -> Optional[WeatherForecast]:
    """
    Fetch forecast from OpenWeatherMap as IMD fallback.

    Args:
        lat: Latitude
        lon: Longitude
        district: District name (for return object)
        state: State name (for return object)

    Returns:
        WeatherForecast or None on failure
    """
    api_key = _get_openweather_api_key()
    if not api_key:
        logger.debug("OPENWEATHER_API_KEY not set")
        return None

    url = f"{OPENWEATHER_BASE_URL}/forecast"
    params = {
        "lat": lat,
        "lon": lon,
        "appid": api_key,
        "units": "metric",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=30.0)
            response.raise_for_status()
            data = response.json()
            return _parse_openweather_response(data, district, state)

    except httpx.HTTPStatusError as e:
        logger.warning("OpenWeatherMap HTTP %d for (%.2f, %.2f): %s",
                      e.response.status_code, lat, lon, str(e)[:100])
    except httpx.TimeoutException:
        logger.warning("OpenWeatherMap timeout for (%.2f, %.2f)", lat, lon)
    except httpx.RequestError as e:
        logger.warning("OpenWeatherMap request error for (%.2f, %.2f): %s",
                      lat, lon, str(e)[:100])
    except (KeyError, ValueError) as e:
        logger.warning("OpenWeatherMap parse error for (%.2f, %.2f): %s",
                      lat, lon, str(e)[:100])

    return None


async def fetch_weather_forecast(
    district: str,
    state: str,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> WeatherForecast:
    """
    Fetch 7-day weather forecast with fallback chain.

    Primary: IMD API (mausam.imd.gov.in)
    Fallback: OpenWeatherMap API

    Args:
        district: District name (e.g., "Bangalore Rural")
        state: State name (e.g., "Karnataka")
        lat: Optional latitude for OpenWeatherMap fallback
        lon: Optional longitude for OpenWeatherMap fallback

    Returns:
        WeatherForecast (falls back to OpenWeatherMap on IMD failure)
    """
    # Try IMD first
    imd_result = await fetch_imd_forecast(district, state)
    if imd_result and imd_result.forecast_days:
        logger.info("IMD forecast fetched for %s, %s: %d days",
                   district, state, len(imd_result.forecast_days))
        return imd_result

    logger.info("IMD unavailable for %s, %s — trying OpenWeatherMap fallback", district, state)

    # Fallback to OpenWeatherMap if lat/lon provided
    if lat is not None and lon is not None:
        owm_result = await fetch_openweather_forecast(lat, lon, district, state)
        if owm_result and owm_result.forecast_days:
            logger.info("OpenWeatherMap forecast for %s, %s: %d days",
                       district, state, len(owm_result.forecast_days))
            return owm_result

    # Return empty forecast if all sources fail
    logger.warning("All weather sources failed for %s, %s — returning empty forecast",
                 district, state)
    return WeatherForecast(
        district=district,
        state=state,
        forecast_days=[],
        source="none",
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    result = asyncio.run(fetch_weather_forecast(
        district="Bangalore Rural",
        state="Karnataka",
        lat=13.5833,
        lon=76.0364,
    ))

    print(f"District: {result.district}, {result.state}")
    print(f"Source: {result.source}")
    print(f"Days: {len(result.forecast_days)}")
    for day in result.forecast_days[:3]:
        print(f"  {day.date}: {day.min_temp_celsius}-{day.max_temp_celsius}°C, "
              f"rain={day.rainfall_mm}mm, {day.weather_condition}")
