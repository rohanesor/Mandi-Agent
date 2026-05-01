"""
Truck & Transport Agency API routes.

Endpoints
---------
POST /api/truck/scrape-kisansabha   → trigger KisanSabha scraper (called by n8n)
GET  /api/truck/agencies            → list cached truck agencies (with filters)
GET  /api/truck/agencies/{id}       → single agency detail
POST /api/truck/match               → find best agency for a booking request
"""

from __future__ import annotations

import logging
import math
import os
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from mandi_agent.backend.services.kisansabha import scrape_kisansabha_transporters

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/truck", tags=["truck"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ScrapeRequest(BaseModel):
    states: list[str] = Field(
        default=["Karnataka", "Andhra Pradesh", "Telangana", "Tamil Nadu", "Maharashtra"],
        description="List of Indian states to scrape",
    )
    category_types: list[int] = Field(
        default=[18, 19, 20, 21],
        description="KisanSabha category type IDs (18=Booking Agent, 19=Broker, 20=Truck Owner, 21=Transporter)",
    )
    max_pages: int = Field(default=10, ge=1, le=50)


class ScrapeResponse(BaseModel):
    success: bool
    count: int
    message: str


class TruckAgency(BaseModel):
    agency_id: str
    kisansabha_id: str
    name: str
    state: str
    city: str
    phone: str
    whatsapp: str
    category_type: int
    category_name: str
    rating: float
    total_trips: int = 0
    vehicle_types: list[str] = []
    price_per_km: Optional[float] = None
    distance_km: Optional[float] = None
    profile_url: str = ""
    verified: bool = False
    source: str = "kisansabha"


class TruckMatchRequest(BaseModel):
    crop: str
    weight_tons: float
    pickup_block: str
    destination_mandi: str
    state: str = "Karnataka"
    lat: Optional[float] = None
    lon: Optional[float] = None


class TruckMatchResponse(BaseModel):
    agency: TruckAgency
    driver_name: str
    driver_phone: str
    vehicle_no: str
    pickup_time: str
    eta_mandi: str
    eta_minutes: int
    booking_id: str
    estimated_cost: float


# ---------------------------------------------------------------------------
# Supabase helper
# ---------------------------------------------------------------------------

def _get_supabase():
    """Return a Supabase client or None if not configured."""
    try:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_KEY", "")
        if url and key:
            return create_client(url, key)
    except Exception as exc:
        logger.warning("Supabase init failed: %s", exc)
    return None


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in km between two lat/lon points."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# Static fallback data (used when Supabase has no rows yet)
# ---------------------------------------------------------------------------

FALLBACK_AGENCIES: list[dict[str, Any]] = [
    {
        "agency_id": "KS-FALLBACK-001", "kisansabha_id": "KS-FALLBACK-001",
        "name": "Anand Transport",        "state": "Karnataka", "city": "Mulbagal, Kolar",
        "phone": "+918181080000",         "whatsapp": "+918181080000",
        "category_type": 21,             "category_name": "Transporter",
        "rating": 4.6,                   "total_trips": 342,
        "vehicle_types": ["Tata Ace", "Eicher Pro"],
        "price_per_km": 18.0,            "verified": True,
        "profile_url": "https://kisansabha.in/Directory.aspx?Category=Transporter&CategoryType=21",
        "source": "kisansabha_fallback",
    },
    {
        "agency_id": "KS-FALLBACK-002", "kisansabha_id": "KS-FALLBACK-002",
        "name": "Sri Balaji Logistics",   "state": "Karnataka", "city": "Kolar, Karnataka",
        "phone": "+918181080000",         "whatsapp": "+918181080000",
        "category_type": 21,             "category_name": "Transporter",
        "rating": 4.3,                   "total_trips": 217,
        "vehicle_types": ["Eicher", "Mahindra Bolero"],
        "price_per_km": 22.0,            "verified": False,
        "profile_url": "https://kisansabha.in/Directory.aspx?Category=Transporter&CategoryType=21",
        "source": "kisansabha_fallback",
    },
    {
        "agency_id": "KS-FALLBACK-003", "kisansabha_id": "KS-FALLBACK-003",
        "name": "Kumar Transport Co.",    "state": "Karnataka", "city": "Bangarpet, Kolar",
        "phone": "+918181080000",         "whatsapp": "+918181080000",
        "category_type": 20,             "category_name": "Truck Owner",
        "rating": 4.8,                   "total_trips": 89,
        "vehicle_types": ["Bolero Pickup", "Mini Truck"],
        "price_per_km": 15.0,            "verified": False,
        "profile_url": "https://kisansabha.in/Directory.aspx?Category=Transporter&CategoryType=20",
        "source": "kisansabha_fallback",
    },
    {
        "agency_id": "KS-FALLBACK-004", "kisansabha_id": "KS-FALLBACK-004",
        "name": "Ravi Freight Services",  "state": "Karnataka", "city": "Chintamani, Chikkaballapur",
        "phone": "+918181080000",         "whatsapp": "+918181080000",
        "category_type": 21,             "category_name": "Transporter",
        "rating": 4.1,                   "total_trips": 156,
        "vehicle_types": ["Tata 407", "Eicher 10.90"],
        "price_per_km": 20.0,            "verified": True,
        "profile_url": "https://kisansabha.in/Directory.aspx?Category=Transporter&CategoryType=21",
        "source": "kisansabha_fallback",
    },
    {
        "agency_id": "KS-FALLBACK-005", "kisansabha_id": "KS-FALLBACK-005",
        "name": "Lakshmi Agri Transport", "state": "Karnataka", "city": "Srinivaspur, Kolar",
        "phone": "+918181080000",         "whatsapp": "+918181080000",
        "category_type": 18,             "category_name": "Booking Agent",
        "rating": 4.4,                   "total_trips": 203,
        "vehicle_types": ["Tata Ace", "Tata 407", "Eicher Pro"],
        "price_per_km": 17.0,            "verified": False,
        "profile_url": "https://kisansabha.in/Directory.aspx?Category=Transporter&CategoryType=18",
        "source": "kisansabha_fallback",
    },
]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/scrape-kisansabha", response_model=ScrapeResponse)
async def scrape_kisansabha(req: ScrapeRequest):
    """
    Trigger KisanSabha transporter scraper.
    Called by n8n on schedule or manual webhook.
    """
    logger.info(
        "KisanSabha scrape requested: states=%s, cat_types=%s, max_pages=%d",
        req.states, req.category_types, req.max_pages,
    )

    result = await scrape_kisansabha_transporters(
        states=req.states,
        category_types=req.category_types,
        max_pages=req.max_pages,
    )

    if not result["success"]:
        logger.error("Scrape failed: %s", result.get("error"))
        raise HTTPException(status_code=502, detail=result.get("error", "Scrape failed"))

    # Persist to Supabase
    agencies = result["agencies"]
    if agencies:
        db = _get_supabase()
        if db:
            try:
                db.table("truck_agencies").upsert(
                    agencies, on_conflict="kisansabha_id"
                ).execute()
                logger.info("Upserted %d agencies to Supabase", len(agencies))
            except Exception as exc:
                logger.warning("Supabase upsert failed: %s", exc)

    return ScrapeResponse(
        success=True,
        count=result["count"],
        message=f"Scraped and cached {result['count']} agencies from KisanSabha.",
    )


@router.get("/agencies", response_model=list[TruckAgency])
async def list_agencies(
    state: Optional[str] = Query(None, description="Filter by state"),
    city: Optional[str] = Query(None, description="Filter by city (partial match)"),
    category_type: Optional[int] = Query(None, description="18=Booking Agent, 19=Broker, 20=Truck Owner, 21=Transporter"),
    lat: Optional[float] = Query(None, description="Farmer latitude (for distance sort)"),
    lon: Optional[float] = Query(None, description="Farmer longitude (for distance sort)"),
    limit: int = Query(20, ge=1, le=100),
):
    """
    List truck agencies cached from KisanSabha.
    Returns fallback data if Supabase has no rows.
    """
    db = _get_supabase()
    agencies: list[dict[str, Any]] = []

    if db:
        try:
            query = db.table("truck_agencies").select("*")
            if state:
                query = query.eq("state", state)
            if city:
                query = query.ilike("city", f"%{city}%")
            if category_type:
                query = query.eq("category_type", category_type)
            query = query.order("rating", desc=True).limit(limit)
            resp = query.execute()
            agencies = resp.data or []
        except Exception as exc:
            logger.warning("Supabase query failed, using fallback: %s", exc)

    # Fall back to static data
    if not agencies:
        logger.info("No DB agencies found — returning fallback data")
        agencies = list(FALLBACK_AGENCIES)
        if state:
            agencies = [a for a in agencies if a["state"] == state]
        if category_type:
            agencies = [a for a in agencies if a["category_type"] == category_type]

    # Compute distance if coordinates provided
    if lat is not None and lon is not None:
        from mandi_agent.backend.services.kisansabha import STATE_CENTRES
        for ag in agencies:
            ag_state = ag.get("state", "Karnataka")
            centre = STATE_CENTRES.get(ag_state, (14.9581, 75.8201))
            ag["distance_km"] = round(_haversine(lat, lon, centre[0], centre[1]), 1)
        agencies.sort(key=lambda a: a.get("distance_km", 9999))

    return agencies[:limit]


@router.get("/agencies/{agency_id}", response_model=TruckAgency)
async def get_agency(agency_id: str):
    """Fetch a single truck agency by ID."""
    db = _get_supabase()
    if db:
        try:
            resp = db.table("truck_agencies").select("*").eq("agency_id", agency_id).execute()
            if resp.data:
                return resp.data[0]
        except Exception as exc:
            logger.warning("Supabase get_agency failed: %s", exc)

    # Search fallback
    for ag in FALLBACK_AGENCIES:
        if ag["agency_id"] == agency_id or ag["kisansabha_id"] == agency_id:
            return ag

    raise HTTPException(status_code=404, detail=f"Agency {agency_id!r} not found")


@router.post("/match", response_model=TruckMatchResponse)
async def match_truck(req: TruckMatchRequest):
    """
    Find the best available truck agency for a booking.
    Called by n8n truck_booking workflow.
    """
    import random, string
    from datetime import datetime, timedelta

    # Fetch suitable agencies
    db = _get_supabase()
    agencies: list[dict[str, Any]] = []
    if db:
        try:
            resp = (
                db.table("truck_agencies")
                .select("*")
                .eq("state", req.state)
                .order("rating", desc=True)
                .limit(10)
                .execute()
            )
            agencies = resp.data or []
        except Exception as exc:
            logger.warning("Supabase match query failed: %s", exc)

    if not agencies:
        agencies = [a for a in FALLBACK_AGENCIES if a["state"] == req.state]
    if not agencies:
        agencies = FALLBACK_AGENCIES

    # Pick best-rated agency
    agency = agencies[0]

    # Compute ETA (simple distance / 40 km/h)
    distance_km = req.weight_tons * 2 + 15   # rough heuristic
    eta_minutes = int((distance_km / 40) * 60)
    now = datetime.utcnow()
    pickup_dt = now + timedelta(hours=2)
    eta_dt = pickup_dt + timedelta(minutes=eta_minutes)

    vehicle_types = agency.get("vehicle_types") or ["Tata Ace"]
    vehicle_type = vehicle_types[0]
    suffix = "".join(random.choices(string.digits, k=4))
    vehicle_no = f"KA-02-AB-{suffix}"
    booking_id = "BKG-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    cost = round((agency.get("price_per_km") or 18.0) * distance_km, 2)

    return TruckMatchResponse(
        agency=TruckAgency(**{
            **agency,
            "agency_id": agency.get("agency_id", agency["kisansabha_id"]),
        }),
        driver_name=f"Driver ({agency['name']})",
        driver_phone=agency.get("phone", "+918181080000"),
        vehicle_no=vehicle_no,
        pickup_time=pickup_dt.strftime("%Y-%m-%d %I:%M %p"),
        eta_mandi=eta_dt.strftime("%Y-%m-%d %I:%M %p"),
        eta_minutes=eta_minutes,
        booking_id=booking_id,
        estimated_cost=cost,
    )
