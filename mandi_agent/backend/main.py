"""
Mandi-Agent FastAPI Backend.
Main API entry point with modularized routers.
"""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load env before importing services
load_dotenv()

# Import all routers
from mandi_agent.backend.api.advisory import router as advisory_router
from mandi_agent.backend.api.auth import router as auth_router
from mandi_agent.backend.api.automations import router as automations_router
from mandi_agent.backend.api.bundles import router as bundles_router
from mandi_agent.backend.api.farmers import router as farmers_router
from mandi_agent.backend.api.fpo import router as fpo_router
from mandi_agent.backend.api.misc import router as misc_router
from mandi_agent.backend.api.news import router as news_router
from mandi_agent.backend.api.prices import router as prices_router
from mandi_agent.backend.api.truck import router as truck_router
from mandi_agent.backend.api.tts import router as tts_router
from mandi_agent.backend.api.weather import router as weather_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown."""
    logger.info("Mandi-Agent starting up...")

    # Seed demo farmers
    try:
        from mandi_agent.backend.utils.seed import seed_reference_data

        await seed_reference_data()
        logger.info("Demo farmers seeded successfully")
    except Exception as e:
        logger.warning("Demo farmer seeding skipped: %s", str(e)[:100])

    yield
    # Cleanup
    try:
        from mandi_agent.backend.services.data_sources.fusion import close_fusion_engine

        await close_fusion_engine()
    except Exception:
        pass

    try:
        from mandi_agent.backend.services.voice.reverie_voice import close_voice_service

        await close_voice_service()
    except Exception:
        pass
    logger.info("Mandi-Agent shutting down...")


app = FastAPI(
    title="Mandi-Agent",
    description="AI platform for Indian smallholder farmers — price prediction, "
    "Virtual Cooperatives, and voice advisories in 22 Indian languages.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8080",
        "http://localhost:8081",
        "http://localhost:8082",
        "http://localhost:8085",
        os.getenv("FRONTEND_URL", "http://localhost:8085"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(farmers_router)
app.include_router(auth_router)
app.include_router(advisory_router)
app.include_router(prices_router)
app.include_router(weather_router)
app.include_router(fpo_router)
app.include_router(news_router)
app.include_router(tts_router)
app.include_router(automations_router)
app.include_router(misc_router)
app.include_router(truck_router)
app.include_router(bundles_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("mandi_agent.backend.main:app", host="0.0.0.0", port=8000, reload=True)
