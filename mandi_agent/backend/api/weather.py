"""
Weather alerts and check routes.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter

from mandi_agent.backend.api.core_schemas import Severity, WeatherAlert, WeatherAlertType
from mandi_agent.backend.api.schemas import WeatherAlertRequest

router = APIRouter(tags=["Weather"])
logger = logging.getLogger(__name__)


@router.post("/api/weather/alerts/check", response_model=WeatherAlert)
async def weather_alert_check(req: WeatherAlertRequest) -> WeatherAlert:
    """Evaluate weather forecast and emit proactive weather alert payload with real weather data."""
    from mandi_agent.backend.services.data_sources.imd_weather import fetch_weather_forecast

    # If manual forecast params provided, use them (for testing)
    if req.forecast_rain_mm is not None and req.hail_probability is not None:
        forecast_rain_mm = req.forecast_rain_mm
        hail_probability = req.hail_probability
        wind_kmph = req.wind_kmph or 0.0
    else:
        # Fetch real weather forecast from IMD/OpenWeather
        forecast = await fetch_weather_forecast(
            district=req.district,
            state=req.state,
            lat=req.lat,
            lon=req.lon,
        )

        # Analyze first 2 days of forecast
        if not forecast.forecast_days:
            logger.warning("No weather forecast available for %s, %s", req.state, req.district)
            forecast_rain_mm = 0.0
            hail_probability = 0.0
            wind_kmph = 0.0
        else:
            day1 = forecast.forecast_days[0]
            day2 = forecast.forecast_days[1] if len(forecast.forecast_days) > 1 else day1

            # Estimate parameters from forecast
            forecast_rain_mm = max(day1.rainfall_mm, day2.rainfall_mm)
            # Heuristic: if rain is expected and humidity is high, increase hail probability
            hail_probability = 0.35 if (forecast_rain_mm > 20 and day1.humidity_pct > 70) else 0.15
            # Estimate wind speed from condition (rainy = higher wind risk)
            wind_kmph = 35.0 if day1.weather_condition == "rainy" else 20.0

    # Evaluate thresholds and generate alert — multi-tier severity
    crop_label = f" for {req.crop}" if req.crop else ""
    if hail_probability >= 0.7:
        alert_type = WeatherAlertType.HAIL
        severity = Severity.CRITICAL
        advisory = f"URGENT: High hail risk{crop_label}. Move all harvested produce to covered storage immediately. Do not spray or irrigate."
    elif hail_probability >= 0.5:
        alert_type = WeatherAlertType.HAIL
        severity = Severity.HIGH
        advisory = (
            f"Hail warning{crop_label}. Cover produce and delay harvest if possible. Avoid spraying before hail window."
        )
    elif forecast_rain_mm >= 60:
        alert_type = WeatherAlertType.HEAVY_RAIN
        severity = Severity.CRITICAL
        advisory = f"Extreme rainfall expected ({forecast_rain_mm:.0f}mm){crop_label}. Ensure field drainage is clear. Move stored produce to elevated dry storage."
    elif forecast_rain_mm >= 35:
        alert_type = WeatherAlertType.HEAVY_RAIN
        severity = Severity.HIGH
        advisory = f"Heavy rain expected ({forecast_rain_mm:.0f}mm){crop_label}. Clear field drainage and shift harvested produce to dry covered storage."
    elif wind_kmph >= 60:
        alert_type = WeatherAlertType.HIGH_WIND
        severity = Severity.HIGH
        advisory = f"Strong winds expected ({wind_kmph:.0f} km/h){crop_label}. Secure staking and support structures. Postpone all spray operations."
    elif wind_kmph >= 45:
        alert_type = WeatherAlertType.HIGH_WIND
        severity = Severity.MEDIUM
        advisory = (
            f"Moderate wind advisory ({wind_kmph:.0f} km/h){crop_label}. Check crop staking and postpone foliar sprays."
        )
    elif forecast_rain_mm >= 15:
        alert_type = WeatherAlertType.HEAVY_RAIN
        severity = Severity.LOW
        advisory = f"Light to moderate rain expected ({forecast_rain_mm:.0f}mm). Monitor field drainage. Routine crop care may continue."
    else:
        alert_type = WeatherAlertType.HEAVY_RAIN
        severity = Severity.LOW
        advisory = "No severe weather detected. Continue routine crop care."

    alert = WeatherAlert(
        alert_id=f"wa-{uuid.uuid4().hex[:10]}",
        state=req.state,
        district=req.district,
        block_id=req.block_id,
        crop=req.crop,
        alert_type=alert_type,
        severity=severity,
        advisory_text=advisory,
        valid_from=datetime.now(UTC),
        valid_until=datetime.now(UTC) + timedelta(hours=24),
        push_sent=severity in {Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL},
        sms_fallback_sent=severity in {Severity.HIGH, Severity.CRITICAL},
    )

    if alert.push_sent or alert.sms_fallback_sent:
        from mandi_agent.backend.services.automations.n8n_triggers import trigger_weather_alert

        await trigger_weather_alert(
            state=alert.state,
            district=alert.district,
            block_id=alert.block_id,
            alert_type=alert.alert_type.value,
            severity=alert.severity.value,
            advisory_text=alert.advisory_text,
        )
    return alert
