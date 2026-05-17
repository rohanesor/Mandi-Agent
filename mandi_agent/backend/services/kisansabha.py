"""
KisanSabha Transporter Scraper Service.

Fetches transporter/truck agency listings from kisansabha.in and normalises
them into the TruckAgency schema stored in Supabase.

Category type mapping (from KisanSabha directory):
  18 → Booking Agent
  19 → Broker
  20 → Truck Owner
  21 → Transporter (full agency)
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from typing import Any
from urllib.parse import urlencode

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "https://kisansabha.in"
DIRECTORY_PATH = "/Directory.aspx"

CATEGORY_TYPE_MAP = {
    18: "Booking Agent",
    19: "Broker",
    20: "Truck Owner",
    21: "Transporter",
}

# KisanSabha state → approximate lat/lon centres used for distance calc
STATE_CENTRES: dict[str, tuple[float, float]] = {
    "Karnataka": (14.9581, 75.8201),
    "Andhra Pradesh": (15.9129, 79.7400),
    "Telangana": (18.1124, 79.0193),
    "Tamil Nadu": (11.1271, 78.6569),
    "Maharashtra": (19.7515, 75.7139),
    "Gujarat": (22.2587, 71.1924),
    "Rajasthan": (27.0238, 74.2179),
    "Madhya Pradesh": (22.9734, 78.6569),
    "Uttar Pradesh": (26.8467, 80.9462),
    "Punjab": (31.1471, 75.3412),
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-IN,en;q=0.9",
    "Referer": "https://kisansabha.in/Directory.aspx",
}

# Polite delay between requests (seconds)
REQUEST_DELAY = 1.5


# ---------------------------------------------------------------------------
# Scraper
# ---------------------------------------------------------------------------


class KisanSabhaScraper:
    """Asynchronous scraper for the KisanSabha transporter directory."""

    def __init__(self, timeout: float = 30.0):
        self._client = httpx.AsyncClient(
            headers=HEADERS,
            timeout=timeout,
            follow_redirects=True,
        )

    async def close(self):
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        await self.close()

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    async def scrape_transporters(
        self,
        states: list[str] | None = None,
        category_types: list[int] | None = None,
        max_pages: int = 10,
    ) -> list[dict[str, Any]]:
        """
        Scrape transporter listings from KisanSabha.

        Args:
            states: State names to filter by (None = all supported states).
            category_types: KisanSabha category type IDs (default 18-21).
            max_pages: Maximum pages to fetch per category.

        Returns:
            List of normalised agency dicts.
        """
        states = states or list(STATE_CENTRES.keys())
        category_types = category_types or [21, 20, 19, 18]

        agencies: list[dict[str, Any]] = []
        seen_ids: set[str] = set()

        for state in states:
            for cat_type in category_types:
                cat_name = CATEGORY_TYPE_MAP.get(cat_type, "Transporter")
                logger.info(
                    "Scraping KisanSabha: state=%s, category=%s (type=%d)",
                    state,
                    cat_name,
                    cat_type,
                )
                try:
                    results = await self._scrape_category(
                        state=state,
                        category_type=cat_type,
                        max_pages=max_pages,
                    )
                    for agency in results:
                        uid = agency["kisansabha_id"]
                        if uid not in seen_ids:
                            seen_ids.add(uid)
                            agencies.append(agency)
                except Exception as exc:
                    logger.warning("Failed scraping state=%s cat=%d: %s", state, cat_type, exc)
                await asyncio.sleep(REQUEST_DELAY)

        logger.info("KisanSabha scrape complete: %d unique agencies", len(agencies))
        return agencies

    # ------------------------------------------------------------------ #
    # Internal helpers                                                     #
    # ------------------------------------------------------------------ #

    async def _scrape_category(self, state: str, category_type: int, max_pages: int) -> list[dict[str, Any]]:
        agencies: list[dict[str, Any]] = []
        cat_name = CATEGORY_TYPE_MAP.get(category_type, "Transporter")

        for page in range(1, max_pages + 1):
            params = {
                "Category": "Transporter",
                "CategoryType": category_type,
                "State": state,
                "Page": page,
            }
            url = f"{BASE_URL}{DIRECTORY_PATH}?{urlencode(params)}"

            try:
                resp = await self._client.get(url)
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                logger.warning("HTTP %d for %s", exc.response.status_code, url)
                break

            soup = BeautifulSoup(resp.text, "html.parser")
            listings = self._parse_listings(soup, state=state, category_type=category_type, cat_name=cat_name)

            if not listings:
                logger.debug("No more results at page %d (state=%s)", page, state)
                break

            agencies.extend(listings)
            await asyncio.sleep(REQUEST_DELAY)

        return agencies

    def _parse_listings(
        self,
        soup: BeautifulSoup,
        state: str,
        category_type: int,
        cat_name: str,
    ) -> list[dict[str, Any]]:
        """
        Parse the KisanSabha directory HTML into agency dicts.

        KisanSabha renders each listing as a card div with class
        `directory-listing-card` or similar. Since the DOM structure is
        server-rendered ASP.NET WebForms, we fall back to a best-effort
        heuristic extraction.
        """
        agencies = []

        # KisanSabha listing cards — adjust selectors if DOM changes
        cards = soup.select("div.listing-card, div.member-card, .dir-entry")
        if not cards:
            # Fallback: grab any structural block with a name heading
            cards = soup.select("div.col-md-4, div.company-box, div.agency-item")

        for card in cards:
            try:
                agency = self._extract_agency(card, state=state, category_type=category_type, cat_name=cat_name)
                if agency:
                    agencies.append(agency)
            except Exception as exc:
                logger.debug("Card parse error: %s", exc)

        return agencies

    def _extract_agency(
        self,
        card,
        state: str,
        category_type: int,
        cat_name: str,
    ) -> dict[str, Any] | None:
        """Extract structured data from a single card element."""
        name = self._text(card, "h3, h4, .company-name, .name, .title")
        if not name:
            return None

        city = self._text(card, ".city, .location, .address, .area")
        phone = self._extract_phone(card)
        rating_raw = self._text(card, ".rating, .star-rating, .stars")
        rating = self._parse_float(rating_raw) or 4.0

        # Stable deterministic ID from name + state
        unique_str = f"{name}|{state}|{city or ''}".lower().strip()
        kisansabha_id = "KS-" + hashlib.md5(unique_str.encode()).hexdigest()[:12].upper()

        # Derive profile URL if available (for deduplication and linking)
        link_tag = card.select_one("a[href]")
        profile_url = ""
        if link_tag:
            href = link_tag.get("href", "")
            if href.startswith("/"):
                profile_url = BASE_URL + href
            elif href.startswith("http"):
                profile_url = href

        return {
            "kisansabha_id": kisansabha_id,
            "name": name.strip(),
            "state": state,
            "city": city.strip() if city else state,
            "phone": phone,
            "whatsapp": phone,  # assume same until overridden
            "category_type": category_type,
            "category_name": cat_name,
            "rating": min(5.0, max(0.0, rating)),
            "profile_url": profile_url,
            "source": "kisansabha",
            "verified": False,
        }

    # ------------------------------------------------------------------ #
    # Micro-helpers                                                        #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _text(element, selectors: str) -> str:
        """Extract first non-empty text from comma-separated CSS selectors."""
        for sel in selectors.split(","):
            node = element.select_one(sel.strip())
            if node and node.get_text(strip=True):
                return node.get_text(strip=True)
        return ""

    @staticmethod
    def _extract_phone(element) -> str:
        """Find first phone-like string in the card text."""
        raw = element.get_text(" ")
        match = re.search(r"(\+?91[-\s]?)?[6-9]\d{9}", raw)
        return match.group(0).replace(" ", "").replace("-", "") if match else ""

    @staticmethod
    def _parse_float(value: str) -> float | None:
        try:
            return float(re.sub(r"[^\d.]", "", value))
        except (ValueError, TypeError):
            return None


# ---------------------------------------------------------------------------
# Module-level helper used by the FastAPI route
# ---------------------------------------------------------------------------


async def scrape_kisansabha_transporters(
    states: list[str] | None = None,
    category_types: list[int] | None = None,
    max_pages: int = 10,
) -> dict[str, Any]:
    """
    Entry point called by the FastAPI route.

    Returns a dict:
        {
            "success": bool,
            "count": int,
            "agencies": [ ... ]
        }
    """
    try:
        async with KisanSabhaScraper() as scraper:
            agencies = await scraper.scrape_transporters(
                states=states,
                category_types=category_types,
                max_pages=max_pages,
            )
        return {"success": True, "count": len(agencies), "agencies": agencies}
    except Exception as exc:
        logger.exception("KisanSabha scrape failed: %s", exc)
        return {"success": False, "count": 0, "agencies": [], "error": str(exc)}
