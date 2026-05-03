"""
Price Prediction Agent — uses Gemini 2.0 Flash.
Predicts mandi prices 3, 7, and 14 days ahead.
"""

import asyncio
import logging
from datetime import date, timedelta
from typing import Any, Optional

import google.generativeai as genai
from pydantic import BaseModel, Field

from mandi_agent.backend.api.core_schemas import (
    MandiPrice,
    PriceDirection,
    PriceForecast,
)

logger = logging.getLogger(__name__)

# Gemini Model ID
GEMINI_MODEL = "gemini-2.0-flash"

# Gemini client model (lazy init)
_gemini_model: Optional[genai.GenerativeModel] = None


def _get_model() -> genai.GenerativeModel:
    """Get or create Gemini model."""
    global _gemini_model
    if _gemini_model is None:
        import os
        api_key = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
        if not api_key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY not set")
        genai.configure(api_key=api_key)
        _gemini_model = genai.GenerativeModel(GEMINI_MODEL)
    return _gemini_model


# =============================================================================
# Tool definitions
# =============================================================================

def get_seasonal_index(crop: str, month: int) -> float:
    """
    Get historical seasonal price index for crop + month.

    Returns a multiplier (e.g., 1.2 = 20% above baseline).
    Based on 5-year Agmarknet monthly averages.

    Args:
        crop: Crop name (e.g., "tomato")
        month: Month number (1-12)

    Returns:
        Seasonal price index (float)
    """
    # Historical seasonal patterns for major crops
    # Values derived from Agmarknet 2020-2024 monthly averages
    SEASONAL_INDEX: dict[str, dict[int, float]] = {
        "tomato": {
            1: 0.85, 2: 0.90, 3: 1.10, 4: 1.25, 5: 1.40, 6: 1.20,
            7: 0.90, 8: 0.80, 9: 0.85, 10: 0.90, 11: 0.95, 12: 0.88,
        },
        "onion": {
            1: 1.10, 2: 1.05, 3: 0.95, 4: 0.88, 5: 0.85, 6: 0.90,
            7: 0.95, 8: 1.00, 9: 1.10, 10: 1.15, 11: 1.20, 12: 1.18,
        },
        "potato": {
            1: 0.95, 2: 0.92, 3: 0.88, 4: 0.85, 5: 0.82, 6: 0.88,
            7: 0.92, 8: 0.95, 9: 1.00, 10: 1.05, 11: 1.08, 12: 1.02,
        },
        "wheat": {
            1: 1.05, 2: 1.00, 3: 0.95, 4: 0.90, 5: 0.88, 6: 0.92,
            7: 0.95, 8: 0.98, 9: 1.00, 10: 1.02, 11: 1.05, 12: 1.08,
        },
        "rice": {
            1: 1.00, 2: 0.98, 3: 0.95, 4: 0.92, 5: 0.90, 6: 0.95,
            7: 1.00, 8: 1.05, 9: 1.10, 10: 1.15, 11: 1.12, 12: 1.08,
        },
        "maize": {
            1: 0.98, 2: 0.95, 3: 0.92, 4: 0.88, 5: 0.85, 6: 0.90,
            7: 0.95, 8: 1.00, 9: 1.05, 10: 1.08, 11: 1.05, 12: 1.00,
        },
        "sugarcane": {
            1: 1.00, 2: 1.00, 3: 1.00, 4: 1.00, 5: 1.02, 6: 1.02,
            7: 1.00, 8: 1.00, 9: 1.00, 10: 1.00, 11: 1.00, 12: 1.00,
        },
        "chilli": {
            1: 1.15, 2: 1.10, 3: 1.05, 4: 1.00, 5: 0.95, 6: 0.90,
            7: 0.88, 8: 0.92, 9: 1.00, 10: 1.10, 11: 1.18, 12: 1.20,
        },
        "turmeric": {
            1: 1.05, 2: 1.00, 3: 0.98, 4: 0.95, 5: 0.92, 6: 0.90,
            7: 0.88, 8: 0.92, 9: 0.98, 10: 1.02, 11: 1.08, 12: 1.10,
        },
        "groundnut": {
            1: 1.02, 2: 1.00, 3: 0.98, 4: 0.95, 5: 0.90, 6: 0.88,
            7: 0.90, 8: 0.95, 9: 1.00, 10: 1.05, 11: 1.08, 12: 1.05,
        },
    }

    crop_lower = crop.lower()
    if crop_lower in SEASONAL_INDEX and month in SEASONAL_INDEX[crop_lower]:
        return SEASONAL_INDEX[crop_lower][month]

    # Default: no seasonal adjustment
    return 1.0


def get_competing_mandi_prices(
    mandi_name: str,
    radius_km: float = 50.0,
) -> list[dict[str, Any]]:
    """
    Get prices at nearby mandis within radius to detect regional saturation.

    Args:
        mandi_name: Reference mandi name
        radius_km: Search radius in km (default 50km)

    Returns:
        List of dicts with: mandi_name, state, modal_price, distance_km
    """
    # TODO: Replace with actual Supabase/Geo query
    # For now, return simulated competing mandi data
    # In production: query Supabase with PostGIS ST_DWithin
    COMPETING_MANDIS = {
        "bangalore": [
            {"mandi_name": "Chikkamagaluru", "state": "Karnataka", "modal_price": 2800, "distance_km": 45.0},
            {"mandi_name": "Hoskote", "state": "Karnataka", "modal_price": 2650, "distance_km": 25.0},
            {"mandi_name": "Ramanagara", "state": "Karnataka", "modal_price": 2720, "distance_km": 35.0},
        ],
        "vashi navi mumbai": [
            {"mandi_name": "Palghar", "state": "Maharashtra", "modal_price": 2400, "distance_km": 40.0},
            {"mandi_name": "Thane", "state": "Maharashtra", "modal_price": 2550, "distance_km": 22.0},
        ],
    }

    key = mandi_name.lower()
    return COMPETING_MANDIS.get(key, [])


# =============================================================================
# Output schema
# =============================================================================

class PricePredictionInput(BaseModel):
    """Structured input schema for price prediction."""
    crop: str = Field(..., description="Crop name")
    mandi_name: str = Field(..., description="Target mandi name")
    state: str = Field(..., description="State name")
    historical_prices: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Recent MandiPrice records as dicts"
    )
    weather_summary: str = Field(
        default="",
        description="Weather context string"
    )
    soil_moisture_pct: Optional[float] = Field(
        None,
        description="Soil moisture percentage"
    )
    xgboost_prediction: Optional[float] = Field(
        None,
        description="XGBoost model base prediction (INR/quintal)"
    )


# =============================================================================
# Main prediction function
# =============================================================================

SYSTEM_PROMPT = """You are the Price Prediction Agent for Mandi-Agent, an AI platform serving Indian smallholder farmers.

You receive historical mandi price data, current arrivals, weather context, and soil moisture readings.
Your task: predict the modal price for a specific crop at a specific mandi for 3, 7, and 14 days ahead.

Use the XGBoost model output provided as your base prediction. Your role is to ADD qualitative reasoning:
- Seasonal patterns (Diwali, Ramadan, wedding seasons spike demand)
- Festival demand surges
- Regional weather impact on supply
- Competing mandi saturation (if prices are lower nearby, supply may redirect)

You must:
1. Always state your confidence as a number between 0 and 1
2. If confidence is below 0.70, explicitly say so and explain why
3. State whether prices are rising, falling, or stable
4. Provide a concise reasoning for your prediction

Output a JSON object with these fields:
- crop: string
- mandi_name: string
- forecast_date: date (YYYY-MM-DD)
- predicted_price: float (INR/quintal)
- confidence: float (0.0 to 1.0)
- price_direction: "rising" | "falling" | "stable"
- reasoning: string (your qualitative explanation)
- model_used: string (e.g., "xgboost+gemini-2.0-flash" or "rule-based")
- days_ahead: integer (3, 7, or 14)"""


async def _predict_price_fallback(
    crop: str,
    mandi_name: str,
    state: str,
    historical_prices: list[MandiPrice],
    days_ahead: int,
    seasonal_index: float,
) -> PriceForecast:
    """Rule-based price prediction fallback."""
    last_price = 2000.0
    if historical_prices:
        last_price = historical_prices[-1].modal_price

    predicted_price = last_price * seasonal_index

    # Simple direction logic
    direction = PriceDirection.STABLE
    if seasonal_index > 1.05:
        direction = PriceDirection.RISING
    elif seasonal_index < 0.95:
        direction = PriceDirection.FALLING

    return PriceForecast(
        crop=crop,
        mandi_name=mandi_name,
        forecast_date=date.today() + timedelta(days=days_ahead),
        predicted_price=round(predicted_price, 2),
        confidence=0.6,  # Low confidence for fallback
        price_direction=direction,
        reasoning=f"Rule-based prediction based on last known price (₹{last_price}) and seasonal index ({seasonal_index:.2f}).",
        model_used="seasonal-fallback",
        days_ahead=days_ahead,
    )


async def predict_price(
    crop: str,
    mandi_name: str,
    state: str,
    historical_prices: list[MandiPrice],
    weather: Optional[dict[str, Any]] = None,
    soil_moisture: Optional[float] = None,
    xgboost_base: Optional[float] = None,
    days_ahead: int = 7,
) -> Optional[PriceForecast]:
    """
    Predict price for a crop at a mandi N days ahead.

    Uses Gemini 2.0 Flash with structured output.
    Base prediction from XGBoost is refined with qualitative reasoning.

    Args:
        crop: Crop name
        mandi_name: Target mandi
        state: State name
        historical_prices: List of recent MandiPrice records
        weather: Weather context dict
        soil_moisture: Soil moisture percentage
        xgboost_base: XGBoost model base prediction
        days_ahead: Forecast horizon (3, 7, or 14)

    Returns:
        PriceForecast with prediction and confidence, or None on failure
    """
    model = _get_model()

    # Build context for Gemini
    hist_data = []
    for p in historical_prices[-10:]:
        hist_data.append({
            "date": p.price_date.isoformat(),
            "modal_price": p.modal_price,
            "min_price": p.min_price,
            "max_price": p.max_price,
            "arrival_tonnes": p.arrival_tonnes,
        })

    # Seasonal pattern
    forecast_date = date.today() + timedelta(days=days_ahead)
    month = forecast_date.month
    seasonal_index = get_seasonal_index(crop, month)

    # Competing mandi data
    competing = get_competing_mandi_prices(mandi_name)
    competing_str = "\n".join(
        f"  - {c['mandi_name']} ({c['state']}): ₹{c['modal_price']}/q, {c['distance_km']}km away"
        for c in competing
    ) if competing else "  (no nearby mandi data)"

    # Weather summary
    weather_str = ""
    if weather:
        weather_str = (
            f"Weather forecast: {weather.get('condition', 'unknown')}, "
            f"max {weather.get('max_temp', '?')}°C, min {weather.get('min_temp', '?')}°C, "
            f"rainfall: {weather.get('rainfall_mm', 0)}mm"
        )

    soil_str = f"Soil moisture: {soil_moisture}%" if soil_moisture else "Soil moisture: unavailable"

    # Base prediction from XGBoost or fallback to last known price
    if xgboost_base:
        base_price = xgboost_base
        base_source = f"XGBoost base: ₹{xgboost_base:.0f}/q"
    elif hist_data:
        base_price = hist_data[0]["modal_price"]
        base_source = f"Last known price: ₹{base_price:.0f}/q"
    else:
        base_price = 2000.0  # Fallback
        base_source = "Estimated fallback price: ₹2000/q"

    user_message = f"""Predict the price for {crop} at {mandi_name} mandi in {state}, {days_ahead} days from today.

{base_source}
Seasonal index for {crop} in month {month}: {seasonal_index:.2f} (1.0 = baseline)

Recent price history:
{chr(10).join(str(p) for p in hist_data)}

{weather_str}
{soil_str}

Nearby competing mandis:
{competing_str}

Please provide your prediction for {forecast_date} ({days_ahead} days ahead) as a JSON object."""

    try:
        full_prompt = f"{SYSTEM_PROMPT}\n\nUSER DATAPOINTS:\n{user_message}"
        response = await model.generate_content_async(full_prompt)

        # Parse Gemini's JSON response
        response_text = response.text.strip()

        # Extract JSON from response (Gemini may wrap in ```json)
        if "```json" in response_text:
            start = response_text.index("```json") + 7
            end = response_text.index("```", start)
            response_text = response_text[start:end].strip()
        elif "```" in response_text:
            start = response_text.index("```") + 3
            end = response_text.index("```", start)
            response_text = response_text[start:end].strip()

        import json
        pred_data = json.loads(response_text)

        # Map to PriceForecast
        price_direction_str = pred_data.get("price_direction", "stable")
        if price_direction_str not in ["rising", "falling", "stable"]:
            price_direction_str = "stable"

        return PriceForecast(
            crop=crop,
            mandi_name=mandi_name,
            forecast_date=forecast_date,
            predicted_price=float(pred_data["predicted_price"]),
            confidence=float(pred_data.get("confidence", 0.7)),
            price_direction=PriceDirection(price_direction_str),
            reasoning=pred_data.get("reasoning", ""),
            model_used="xgboost+gemini-2.0-flash",
            days_ahead=days_ahead,
        )

    except Exception as e:
        logger.warning("Price prediction LLM failed (credits/API): %s. Using rule-based fallback.", str(e)[:200])
        return await _predict_price_fallback(
            crop=crop,
            mandi_name=mandi_name,
            state=state,
            historical_prices=historical_prices,
            days_ahead=days_ahead,
            seasonal_index=seasonal_index,
        )


async def predict_price_batch(
    requests: list[dict[str, Any]],
) -> list[Optional[PriceForecast]]:
    """
    Run multiple price predictions concurrently.

    Args:
        requests: List of kwargs for predict_price()

    Returns:
        List of PriceForecast results (None for failures)
    """
    tasks = [predict_price(**req) for req in requests]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Convert exceptions to None
    return [r if isinstance(r, PriceForecast) else None for r in results]


if __name__ == "__main__":
    # Smoke test
    logging.basicConfig(level=logging.INFO)

    async def test():
        # Create sample historical prices
        from datetime import date as date_cls
        sample_prices = [
            MandiPrice(
                mandi_name="Vashi Navi Mumbai",
                state="Maharashtra",
                commodity="onion",
                variety="red",
                min_price=1800,
                max_price=2200,
                modal_price=2000,
                arrival_tonnes=50.0,
                price_date=date_cls(2026, 3, 15),
                source="agmarknet",
            ),
            MandiPrice(
                mandi_name="Vashi Navi Mumbai",
                state="Maharashtra",
                commodity="onion",
                variety="red",
                min_price=1900,
                max_price=2300,
                modal_price=2100,
                arrival_tonnes=45.0,
                price_date=date_cls(2026, 3, 17),
                source="agmarknet",
            ),
        ]

        result = await predict_price(
            crop="onion",
            mandi_name="Vashi Navi Mumbai",
            state="Maharashtra",
            historical_prices=sample_prices,
            weather={"condition": "sunny", "max_temp": 32, "min_temp": 22, "rainfall_mm": 0},
            soil_moisture=62.0,
            days_ahead=7,
        )

        if result:
            print(f"Predicted price: ₹{result.predicted_price:.0f}/q")
            print(f"Confidence: {result.confidence:.2f}")
            print(f"Direction: {result.price_direction.value}")
            print(f"Reasoning: {result.reasoning}")
        else:
            print("Prediction failed (set GEMINI_API_KEY to test)")

    asyncio.run(test())
