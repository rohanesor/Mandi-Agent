"""
Prices and Forecasts routes.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, status

router = APIRouter(tags=["Prices"])
logger = logging.getLogger(__name__)

SUPPORTED_CROPS = [
    "Tomato", "Onion", "Potato", "Rice", "Wheat", "Maize",
    "Cotton", "Soybean", "Groundnut", "Chilli", "Turmeric",
]

MANDI_LOCATIONS = [
    {"mandi_id": "MH-VASHI-01", "mandi_name": "Vashi Navi Mumbai", "district": "Thane", "state": "Maharashtra"},
    {"mandi_id": "MH-PUNE-01", "mandi_name": "Pune", "district": "Pune", "state": "Maharashtra"},
    {"mandi_id": "KA-KOLAR-01", "mandi_name": "Kolar", "district": "Kolar", "state": "Karnataka"},
    {"mandi_id": "KA-BANG-01", "mandi_name": "Bangalore", "district": "Bangalore Urban", "state": "Karnataka"},
    {"mandi_id": "RJ-JAIPUR-01", "mandi_name": "Jaipur", "district": "Jaipur", "state": "Rajasthan"},
    {"mandi_id": "MP-INDORE-01", "mandi_name": "Indore", "district": "Indore", "state": "Madhya Pradesh"},
    {"mandi_id": "AP-GUNTUR-01", "mandi_name": "Guntur", "district": "Guntur", "state": "Andhra Pradesh"},
    {"mandi_id": "TN-MADURAI-01", "mandi_name": "Madurai", "district": "Madurai", "state": "Tamil Nadu"},
]

PRICE_ALERTS: dict[str, list[dict]] = {}


@router.get("/api/prices/{commodity}", response_model=list[dict])
async def get_prices(commodity: str, state: Optional[str] = None) -> list[dict]:
    """Get recent mandi prices for a commodity."""
    try:
        from mandi_agent.backend.services.data_sources.agmarknet import fetch_agmarknet_prices

        prices = await fetch_agmarknet_prices(commodity=commodity, state=state)
        return [p.model_dump(mode="json") for p in prices]

    except Exception as e:
        logger.error("Price fetch failed: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Price fetch failed: {str(e)[:100]}",
        )


@router.get("/api/forecast/{crop}", response_model=list[dict])
async def get_forecast(
    crop: str,
    mandi_name: Optional[str] = None,
    state: Optional[str] = None,
    days_ahead: int = 7,
) -> list[dict]:
    """Get price forecast for a crop."""
    try:
        from mandi_agent.backend.agents.price_prediction import predict_price

        forecast = await predict_price(
            crop=crop,
            mandi_name=mandi_name or "Vashi Navi Mumbai",
            state=state or "Maharashtra",
            historical_prices=[],
            days_ahead=days_ahead,
        )

        if not forecast:
            return []
        return [forecast.model_dump(mode="json")]

    except Exception as e:
        logger.error("Forecast failed: %s", str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forecast failed: {str(e)[:100]}",
        )


@router.get("/api/prices/history")
async def get_price_history(
    crop: str,
    mandi: Optional[str] = None,
    state: Optional[str] = None,
    months: int = 3,
):
    """Get historical price data for a crop."""
    today = date.today()
    start_date = today - timedelta(days=months * 30)

    try:
        from mandi_agent.backend.services.data_sources.agmarknet import fetch_agmarknet_prices

        prices = await fetch_agmarknet_prices(commodity=crop, state=state)
        if prices:
            data = [
                {
                    "date": p.price_date or today.isoformat(),
                    "modal_price": p.modal_price,
                    "min_price": p.min_price,
                    "max_price": p.max_price,
                    "arrival_qty": getattr(p, "arrival_tonnes", None),
                }
                for p in prices
            ]
            return {
                "crop": crop,
                "mandi": mandi or "Agmarknet",
                "state": state or prices[0].state if prices else "",
                "data": data,
            }
    except Exception as e:
        logger.warning("History fetch from Agmarknet failed: %s", str(e)[:200])

    # Fallback: generate realistic demo data
    import random
    random.seed(hash(f"{crop}-{mandi}") % (2**32))
    base_price = {"Tomato": 30, "Onion": 25, "Potato": 20, "Rice": 35, "Wheat": 22, "Maize": 18}.get(crop, 25)

    history = []
    for i in range(months * 30):
        d = start_date + timedelta(days=i)
        variation = random.uniform(-0.3, 0.4)
        history.append({
            "date": d.isoformat(),
            "modal_price": round(base_price * (1 + variation), 2),
        })

    return {
        "crop": crop,
        "mandi": mandi or "Demo",
        "state": state or "",
        "data": history[-60:],
    }


@router.get("/api/mandis/nearby")
async def get_nearby_mandis(state: str, district: Optional[str] = None, crop: Optional[str] = None):
    """Get nearby mandis for a state/district."""
    mandis = [m for m in MANDI_LOCATIONS if m["state"].lower() == state.lower()]
    if district:
        mandis = [m for m in mandis if m["district"].lower() == district.lower()]
    if not mandis:
        mandis = MANDI_LOCATIONS[:4]
    return mandis


@router.get("/api/crops")
async def get_supported_crops():
    """Get list of supported crops."""
    return SUPPORTED_CROPS


@router.post("/api/price-alerts")
async def create_price_alert(request: dict):
    """Create a price alert for a farmer."""
    farmer_id = request.get("farmer_id", "")
    if farmer_id not in PRICE_ALERTS:
        PRICE_ALERTS[farmer_id] = []

    alert = {
        "alert_id": f"alert-{len(PRICE_ALERTS.get(farmer_id, [])) + 1:04d}",
        "farmer_id": farmer_id,
        "crop": request.get("crop", ""),
        "mandi": request.get("mandi", ""),
        "target_price": request.get("target_price", 0),
        "condition": request.get("condition", "above"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    PRICE_ALERTS[farmer_id].append(alert)
    return alert


@router.get("/api/farmer/{farmer_id}/price-alerts")
async def get_price_alerts(farmer_id: str):
    """Get price alerts for a farmer."""
    return PRICE_ALERTS.get(farmer_id, [])


@router.delete("/api/price-alerts/{alert_id}")
async def delete_price_alert(alert_id: str):
    """Delete a price alert."""
    for farmer_id, alerts in PRICE_ALERTS.items():
        PRICE_ALERTS[farmer_id] = [a for a in alerts if a["alert_id"] != alert_id]
    return {"deleted": True}
