"""Market demand forecasting agent with real mandi data."""

from __future__ import annotations

from datetime import date, timedelta
from mandi_agent.backend.models.schemas import DemandForecast, DemandLevel


async def predict_demand(crop: str, state: str, months_ahead: int) -> DemandForecast:
    """Predict market demand using real Agmarknet price data."""
    from mandi_agent.backend.data_sources.agmarknet import fetch_agmarknet_prices
    import logging

    logger = logging.getLogger(__name__)

    # Clamp months_ahead to valid range
    months_ahead = max(1, min(months_ahead, 12))

    # Fetch last 30 days of prices for the crop/state
    from_date = date.today() - timedelta(days=30)
    try:
        prices = await fetch_agmarknet_prices(
            commodity=crop,
            state=state,
            from_date=from_date,
            to_date=date.today(),
            limit=500,
        )
    except Exception as exc:
        logger.warning("Agmarknet fetch failed for demand prediction: %s", str(exc)[:100])
        prices = []

    if not prices:
        logger.warning(f"No price data found for {crop} in {state}; using baseline forecast")
        # Fallback to baseline if no data
        normalized = crop.lower().strip()
        seasonal_boost = 1.12 if normalized in {"onion", "tomato", "potato"} else 1.0
        horizon_factor = max(0.75, 1 - (months_ahead - 1) * 0.05)
        demand_index = round(72 * seasonal_boost * horizon_factor, 2)
    else:
        # Calculate trend from historical prices
        modal_prices = [p.modal_price for p in prices if p.modal_price > 0]
        if not modal_prices:
            demand_index = 72.0
        else:
            avg_price = sum(modal_prices) / len(modal_prices)
            # Prices sorted from oldest to newest
            recent_prices = modal_prices[-7:] if len(modal_prices) >= 7 else modal_prices
            oldest_prices = modal_prices[:7] if len(modal_prices) >= 7 else modal_prices

            if oldest_prices:
                avg_recent = sum(recent_prices) / len(recent_prices)
                avg_old = sum(oldest_prices) / len(oldest_prices)
                price_trend = avg_recent / avg_old if avg_old > 0 else 1.0
            else:
                price_trend = 1.0

            # Higher prices = higher demand (farmers are selling at premium)
            # Base demand index = 72 (midpoint)
            # Adjust by price trend and months ahead
            seasonal_boost = 1.12 if crop.lower().strip() in {"onion", "tomato", "potato"} else 1.0
            horizon_factor = max(0.75, 1 - (months_ahead - 1) * 0.05)

            # Price-based adjustment: if trending up, demand stronger
            price_adjustment = min(1.3, max(0.7, price_trend))
            demand_index = round(72 * seasonal_boost * horizon_factor * price_adjustment, 2)

        # Arrival data insight: high arrivals = abundant supply = lower demand opportunity
        total_arrivals = sum(p.arrival_tonnes or 0 for p in prices if p.arrival_tonnes)
        if total_arrivals > 0:
            avg_arrival = total_arrivals / len(prices)
            # If arrivals declining, demand likely increasing
            arrival_trend = 0.95 if avg_arrival < 50 else 1.05  # Heuristic adjustment

            demand_index = round(demand_index * (1 / arrival_trend), 2)

    # Determine demand level
    if demand_index >= 78:
        level = DemandLevel.HIGH
        action = "Increase harvest planning and pre-book logistics to capture demand spike"
    elif demand_index >= 58:
        level = DemandLevel.MODERATE
        action = "Maintain current acreage and monitor mandi trends weekly"
    else:
        level = DemandLevel.LOW
        action = "Diversify crop plan and avoid overexposure in a single mandi"

    # Build signal list based on data availability
    signals = ["regional seasonal patterns"]
    if prices:
        signals.insert(0, "historical price trends")
        if any(p.arrival_tonnes for p in prices if p.arrival_tonnes):
            signals.insert(1, "recent mandi arrivals")
    confidence = 0.82 if prices else 0.65
    # Reduce confidence for longer horizons
    confidence = round(max(0.40, confidence - (months_ahead - 1) * 0.03), 2)

    return DemandForecast(
        crop=crop,
        state=state,
        months_ahead=months_ahead,
        predicted_demand_index=demand_index,
        demand_level=level,
        confidence=confidence,
        recommended_action=action,
        signals=signals,
    )
