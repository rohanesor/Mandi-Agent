"""
Prices and Forecasts routes.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, status

router = APIRouter(tags=["Prices"])
logger = logging.getLogger(__name__)


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
    days_ahead: int = 7,
) -> list[dict]:
    """Get price forecast for a crop."""
    try:
        from mandi_agent.backend.agents.price_prediction import predict_price

        forecast = await predict_price(
            crop=crop,
            mandi_name=mandi_name or "Vashi Navi Mumbai",
            state="Maharashtra",
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
