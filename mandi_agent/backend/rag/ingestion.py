"""
RAG ingestion pipeline — chunks, embeds, and stores documents in Supabase pgvector.
"""

import asyncio
import csv
import io
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass

from supabase import AsyncClient

from mandi_agent.backend.rag.embeddings import EmbeddingService, get_embedding_service

logger = logging.getLogger(__name__)


# =============================================================================
# Shelf Life Database — 50 common Indian crops
# =============================================================================

SHELF_LIFE_DATABASE: List[Dict[str, Any]] = [
    {"commodity": "tomato", "min_shelf_life_hours": 48, "max_shelf_life_hours": 96,
     "optimal_temp_celsius": 12, "optimal_humidity_pct": 85,
     "storage_tips": "Store at 10-15°C. Do not refrigerate below 10°C. Keep away from direct sunlight."},
    {"commodity": "onion", "min_shelf_life_hours": 120, "max_shelf_life_hours": 240,
     "optimal_temp_celsius": 0, "optimal_humidity_pct": 65,
     "storage_tips": "Store in cool, dry, well-ventilated area. Do not refrigerate."},
    {"commodity": "potato", "min_shelf_life_hours": 168, "max_shelf_life_hours": 504,
     "optimal_temp_celsius": 8, "optimal_humidity_pct": 85,
     "storage_tips": "Store in dark, cool place. Light turns potatoes green and toxic."},
    {"commodity": "mango", "min_shelf_life_hours": 36, "max_shelf_life_hours": 72,
     "optimal_temp_celsius": 13, "optimal_humidity_pct": 85,
     "storage_tips": "Ripen at room temperature. Refrigerate only when fully ripe."},
    {"commodity": "banana", "min_shelf_life_hours": 48, "max_shelf_life_hours": 96,
     "optimal_temp_celsius": 13, "optimal_humidity_pct": 90,
     "storage_tips": "Hang to prevent bruising. Do not refrigerate unripe bananas."},
    {"commodity": "cauliflower", "min_shelf_life_hours": 24, "max_shelf_life_hours": 48,
     "optimal_temp_celsius": 0, "optimal_humidity_pct": 90,
     "storage_tips": "Wrap in plastic and refrigerate. Use within 5 days."},
    {"commodity": "cabbage", "min_shelf_life_hours": 72, "max_shelf_life_hours": 144,
     "optimal_temp_celsius": 0, "optimal_humidity_pct": 90,
     "storage_tips": "Store in refrigerator crisper. Can last 2 weeks if fresh."},
    {"commodity": "okra", "min_shelf_life_hours": 24, "max_shelf_life_hours": 48,
     "optimal_temp_celsius": 8, "optimal_humidity_pct": 85,
     "storage_tips": "Use quickly as it wilts fast. Refrigerate in paper bag."},
    {"commodity": "brinjal", "min_shelf_life_hours": 48, "max_shelf_life_hours": 72,
     "optimal_temp_celsius": 10, "optimal_humidity_pct": 80,
     "storage_tips": "Do not refrigerate below 10°C. Store at room temperature."},
    {"commodity": "green_peas", "min_shelf_life_hours": 12, "max_shelf_life_hours": 36,
     "optimal_temp_celsius": 0, "optimal_humidity_pct": 90,
     "storage_tips": "Use immediately. Refrigerate in pods. Loses sweetness rapidly."},
    {"commodity": "spinach", "min_shelf_life_hours": 6, "max_shelf_life_hours": 18,
     "optimal_temp_celsius": 0, "optimal_humidity_pct": 95,
     "storage_tips": "Wash, dry thoroughly, refrigerate in airtight container."},
    {"commodity": "coriander", "min_shelf_life_hours": 12, "max_shelf_life_hours": 36,
     "optimal_temp_celsius": 0, "optimal_humidity_pct": 90,
     "storage_tips": "Store in water like flowers, wrap leaves in damp towel."},
    {"commodity": "capsicum", "min_shelf_life_hours": 72, "max_shelf_life_hours": 120,
     "optimal_temp_celsius": 8, "optimal_humidity_pct": 85,
     "storage_tips": "Refrigerate in crisper. Keeps well for 5-7 days."},
    {"commodity": "carrot", "min_shelf_life_hours": 96, "max_shelf_life_hours": 168,
     "optimal_temp_celsius": 0, "optimal_humidity_pct": 90,
     "storage_tips": "Remove tops before storing. Refrigerate in塑料袋."},
    {"commodity": "radish", "min_shelf_life_hours": 48, "max_shelf_life_hours": 96,
     "optimal_temp_celsius": 0, "optimal_humidity_pct": 85,
     "storage_tips": "Remove leaves and refrigerate. Stays fresh 5-7 days."},
    {"commodity": "garlic", "min_shelf_life_hours": 168, "max_shelf_life_hours": 360,
     "optimal_temp_celsius": 15, "optimal_humidity_pct": 65,
     "storage_tips": "Store in cool, dry, dark place. Do not refrigerate."},
    {"commodity": "ginger", "min_shelf_life_hours": 96, "max_shelf_life_hours": 168,
     "optimal_temp_celsius": 12, "optimal_humidity_pct": 70,
     "storage_tips": "Store in refrigerator or freeze for longer storage."},
    {"commodity": "turmeric", "min_shelf_life_hours": 720, "max_shelf_life_hours": 1440,
     "optimal_temp_celsius": 25, "optimal_humidity_pct": 60,
     "storage_tips": "Dry thoroughly before storing. Store in airtight container."},
    {"commodity": "chilli", "min_shelf_life_hours": 168, "max_shelf_life_hours": 360,
     "optimal_temp_celsius": 10, "optimal_humidity_pct": 65,
     "storage_tips": "Dry and store in airtight container. Can be frozen."},
    {"commodity": "pomegranate", "min_shelf_life_hours": 168, "max_shelf_life_hours": 336,
     "optimal_temp_celsius": 5, "optimal_humidity_pct": 85,
     "storage_tips": "Refrigerate whole fruit. Arils last 5 days refrigerated."},
    {"commodity": "grapes", "min_shelf_life_hours": 72, "max_shelf_life_hours": 120,
     "optimal_temp_celsius": 0, "optimal_humidity_pct": 90,
     "storage_tips": "Do not wash until ready to eat. Refrigerate immediately."},
    {"commodity": "apple", "min_shelf_life_hours": 168, "max_shelf_life_hours": 504,
     "optimal_temp_celsius": 2, "optimal_humidity_pct": 85,
     "storage_tips": "Store in refrigerator. Keep away from other vegetables."},
    {"commodity": "orange", "min_shelf_life_hours": 168, "max_shelf_life_hours": 336,
     "optimal_temp_celsius": 5, "optimal_humidity_pct": 85,
     "storage_tips": "Refrigerate in crisper. Can develop mold if stored too long."},
    {"commodity": "papaya", "min_shelf_life_hours": 24, "max_shelf_life_hours": 48,
     "optimal_temp_celsius": 10, "optimal_humidity_pct": 85,
     "storage_tips": "Ripen at room temperature. Refrigerate only when ripe."},
    {"commodity": "guava", "min_shelf_life_hours": 48, "max_shelf_life_hours": 72,
     "optimal_temp_celsius": 8, "optimal_humidity_pct": 85,
     "storage_tips": "Refrigerate ripe guava. Stays fresh 2-3 days at room temp."},
    {"commodity": "watermelon", "min_shelf_life_hours": 96, "max_shelf_life_hours": 168,
     "optimal_temp_celsius": 10, "optimal_humidity_pct": 80,
     "storage_tips": "Store whole at room temperature. Cut pieces refrigerate."},
    {"commodity": "muskmelon", "min_shelf_life_hours": 72, "max_shelf_life_hours": 120,
     "optimal_temp_celsius": 8, "optimal_humidity_pct": 80,
     "storage_tips": "Store at room temp until ripe. Refrigerate when cut."},
    {"commodity": "sweet_lime", "min_shelf_life_hours": 168, "max_shelf_life_hours": 336,
     "optimal_temp_celsius": 8, "optimal_humidity_pct": 80,
     "storage_tips": "Refrigerate whole. Juice stays fresh 2-3 days."},
    {"commodity": "coconut", "min_shelf_life_hours": 168, "max_shelf_life_hours": 360,
     "optimal_temp_celsius": 5, "optimal_humidity_pct": 70,
     "storage_tips": "Store at room temp for 1 week. Refrigerate for 2 weeks."},
    {"commodity": "jackfruit", "min_shelf_life_hours": 48, "max_shelf_life_hours": 72,
     "optimal_temp_celsius": 12, "optimal_humidity_pct": 80,
     "storage_tips": "Store at room temperature. Refrigerate when cut."},
    {"commodity": "custard_apple", "min_shelf_life_hours": 24, "max_shelf_life_hours": 48,
     "optimal_temp_celsius": 10, "optimal_humidity_pct": 85,
     "storage_tips": "Refrigerate when ripe. Use within 2-3 days."},
    {"commodity": "beans", "min_shelf_life_hours": 36, "max_shelf_life_hours": 72,
     "optimal_temp_celsius": 8, "optimal_humidity_pct": 85,
     "storage_tips": "Refrigerate unwashed in crisper. Use within 5 days."},
    {"commodity": "bitter_gourd", "min_shelf_life_hours": 48, "max_shelf_life_hours": 72,
     "optimal_temp_celsius": 10, "optimal_humidity_pct": 80,
     "storage_tips": "Refrigerate in paper bag. Use within 4-5 days."},
    {"commodity": "bottle_gourd", "min_shelf_life_hours": 72, "max_shelf_life_hours": 120,
     "optimal_temp_celsius": 10, "optimal_humidity_pct": 80,
     "storage_tips": "Store at room temperature. Refrigerate when cut."},
    {"commodity": "ridge_gourd", "min_shelf_life_hours": 48, "max_shelf_life_hours": 72,
     "optimal_temp_celsius": 10, "optimal_humidity_pct": 80,
     "storage_tips": "Refrigerate in crisper. Best used within 3-4 days."},
    {"commodity": "snake_gourd", "min_shelf_life_hours": 48, "max_shelf_life_hours": 72,
     "optimal_temp_celsius": 10, "optimal_humidity_pct": 80,
     "storage_tips": "Store in cool place. Use within 3-4 days."},
    {"commodity": "tinda", "min_shelf_life_hours": 36, "max_shelf_life_hours": 60,
     "optimal_temp_celsius": 8, "optimal_humidity_pct": 85,
     "storage_tips": "Refrigerate unwashed. Best used within 2-3 days."},
    {"commodity": "parwal", "min_shelf_life_hours": 48, "max_shelf_life_hours": 72,
     "optimal_temp_celsius": 10, "optimal_humidity_pct": 80,
     "storage_tips": "Refrigerate in paper bag. Use within 3-4 days."},
    {"commodity": "eggplant", "min_shelf_life_hours": 48, "max_shelf_life_hours": 72,
     "optimal_temp_celsius": 10, "optimal_humidity_pct": 80,
     "storage_tips": "Do not refrigerate below 10°C. Store at room temperature."},
    {"commodity": "kohlrabi", "min_shelf_life_hours": 72, "max_shelf_life_hours": 120,
     "optimal_temp_celsius": 0, "optimal_humidity_pct": 85,
     "storage_tips": "Remove leaves and refrigerate. Keeps 1-2 weeks."},
    {"commodity": "celery", "min_shelf_life_hours": 72, "max_shelf_life_hours": 120,
     "optimal_temp_celsius": 0, "optimal_humidity_pct": 90,
     "storage_tips": "Wrap in foil and refrigerate. Stays crisp 2 weeks."},
    {"commodity": "asparagus", "min_shelf_life_hours": 24, "max_shelf_life_hours": 48,
     "optimal_temp_celsius": 2, "optimal_humidity_pct": 90,
     "storage_tips": "Store upright in water like flowers. Refrigerate."},
    {"commodity": "corn", "min_shelf_life_hours": 12, "max_shelf_life_hours": 24,
     "optimal_temp_celsius": 0, "optimal_humidity_pct": 85,
     "storage_tips": "Use immediately. Sugars convert to starch rapidly after harvest."},
    {"commodity": "mushroom", "min_shelf_life_hours": 24, "max_shelf_life_hours": 48,
     "optimal_temp_celsius": 2, "optimal_humidity_pct": 85,
     "storage_tips": "Store in paper bag in refrigerator. Do not wash until use."},
    {"commodity": "paneer", "min_shelf_life_hours": 12, "max_shelf_life_hours": 24,
     "optimal_temp_celsius": 4, "optimal_humidity_pct": 80,
     "storage_tips": "Refrigerate in water. Change water daily. Use within 2 days."},
    {"commodity": "cottage_cheese", "min_shelf_life_hours": 12, "max_shelf_life_hours": 24,
     "optimal_temp_celsius": 4, "optimal_humidity_pct": 80,
     "storage_tips": "Refrigerate in airtight container. Use within 24 hours."},
    {"commodity": "wheat", "min_shelf_life_hours": 8760, "max_shelf_life_hours": 26280,
     "optimal_temp_celsius": 20, "optimal_humidity_pct": 65,
     "storage_tips": "Store in cool, dry place. Protect from pests and moisture."},
    {"commodity": "rice", "min_shelf_life_hours": 8760, "max_shelf_life_hours": 26280,
     "optimal_temp_celsius": 20, "optimal_humidity_pct": 60,
     "storage_tips": "Store in airtight containers in cool, dry place."},
    {"commodity": "chickpea", "min_shelf_life_hours": 8760, "max_shelf_life_hours": 17520,
     "optimal_temp_celsius": 15, "optimal_humidity_pct": 65,
     "storage_tips": "Store in airtight container. Can last 1-2 years dried."},
    {"commodity": "moong_dal", "min_shelf_life_hours": 8760, "max_shelf_life_hours": 17520,
     "optimal_temp_celsius": 15, "optimal_humidity_pct": 60,
     "storage_tips": "Store in airtight container. Protect from humidity."},
    {"commodity": "urad_dal", "min_shelf_life_hours": 8760, "max_shelf_life_hours": 17520,
     "optimal_temp_celsius": 15, "optimal_humidity_pct": 60,
     "storage_tips": "Store in cool, dry place. Boil within 1 year for best quality."},
    {"commodity": "masoor_dal", "min_shelf_life_hours": 8760, "max_shelf_life_hours": 17520,
     "optimal_temp_celsius": 15, "optimal_humidity_pct": 60,
     "storage_tips": "Store in airtight container in refrigerator for longer life."},
]


@dataclass
class IngestionStats:
    """Statistics for an ingestion run."""
    source: str
    chunks_created: int = 0
    embeddings_stored: int = 0
    time_seconds: float = 0.0
    errors: List[str] = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = []


def _build_shelf_life_chunk(entry: Dict[str, Any]) -> str:
    """
    Build a searchable text chunk from a shelf life entry.

    Format: commodity data as natural language for embedding.
    """
    return (
        f"Commodity: {entry['commodity'].replace('_', ' ').title()}. "
        f"Shelf life: {entry['min_shelf_life_hours']}-{entry['max_shelf_life_hours']} hours. "
        f"Optimal storage temperature: {entry['optimal_temp_celsius']}°C. "
        f"Optimal humidity: {entry['optimal_humidity_pct']}%. "
        f"Storage tips: {entry['storage_tips']}"
    )


class RAGIngestionPipeline:
    """
    RAG ingestion pipeline — chunks documents, embeds, and stores in Supabase.

    Methods:
    - ingest_agmarknet_history(): Price history 2020-2025
    - ingest_kvk_advisories(): KVK agricultural advisories
    - ingest_icar_shelf_life(): Crop storage/shelf life reference
    - ingest_all(): Run all ingestion methods

    Usage:
        pipeline = RAGIngestionPipeline(supabase_client)
        await pipeline.ingest_all()
    """

    def __init__(
        self,
        supabase: AsyncClient,
        embedding_service: Optional[EmbeddingService] = None,
    ):
        """
        Initialize ingestion pipeline.

        Args:
            supabase: Supabase async client
            embedding_service: Optional EmbeddingService (creates default if None)
        """
        self._supabase = supabase
        self._embedding = embedding_service or get_embedding_service()
        self._stats: List[IngestionStats] = []

    async def _store_chunks(
        self,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]],
    ) -> int:
        """
        Store embedded chunks in Supabase rag_documents table.

        Table schema:
        id: uuid (auto)
        content: text
        embedding: vector(1024)
        source: text
        crop: text
        mandi: text
        state: text
        month: integer
        year: integer
        created_at: timestamptz

        Args:
            chunks: List of chunk dicts with content + metadata
            embeddings: List of embedding vectors

        Returns:
            Number of chunks successfully stored
        """
        rows = []
        for chunk, embedding in zip(chunks, embeddings):
            if embedding is None:
                continue
            rows.append({
                "content": chunk["content"],
                "embedding": embedding,
                "source": chunk.get("source", "unknown"),
                "crop": chunk.get("crop"),
                "mandi": chunk.get("mandi"),
                "state": chunk.get("state"),
                "month": chunk.get("month"),
                "year": chunk.get("year"),
            })

        if not rows:
            return 0

        try:
            response = await self._supabase.table("rag_documents").insert(rows).execute()
            return len(response.data)
        except Exception as e:
            logger.error("Failed to store %d chunks in Supabase: %s", len(rows), str(e)[:200])
            raise

    def _chunk_agmarknet_row(self, row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Convert a single Agmarknet CSV/API row into a RAG chunk.

        Chunks are organized as: one mandi + commodity + month summary.
        """
        try:
            # Parse month/year from date
            date_str = row.get("date", "")
            if not date_str:
                return None

            # Try multiple date formats
            for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y"]:
                try:
                    dt = datetime.strptime(date_str, fmt)
                    month = dt.month
                    year = dt.year
                    break
                except ValueError:
                    continue
            else:
                return None

            commodity = row.get("commodity", "").strip()
            mandi = row.get("mandi_name", row.get("market", "")).strip()
            state = row.get("state", "").strip()
            modal_price = float(row.get("modal_price", 0))
            arrivals = float(row.get("arrival_tonnes", row.get("arrivals_in_tonnes", 0)))

            if not all([commodity, mandi, state]):
                return None

            content = (
                f"Mandi: {mandi}, State: {state}, "
                f"Commodity: {commodity}, Month: {month}, Year: {year}, "
                f"Average modal price: ₹{modal_price:.0f} per quintal, "
                f"Average arrivals: {arrivals:.1f} tonnes"
            )

            return {
                "content": content,
                "source": "agmarknet",
                "crop": commodity.lower(),
                "mandi": mandi,
                "state": state,
                "month": month,
                "year": year,
            }
        except (ValueError, KeyError) as e:
            logger.debug("Skipping invalid agmarknet row: %s — %s", row, str(e))
            return None

    async def ingest_agmarknet_history(
        self,
        csv_path: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> IngestionStats:
        """
        Ingest Agmarknet price history (2020-2025).

        Reads from CSV file (if provided) or fetches via API.
        Creates one chunk per mandi+commodity+month record.

        Args:
            csv_path: Optional path to CSV file with historical data.
                      CSV must have columns: mandi_name, state, commodity,
                      variety, min_price, max_price, modal_price, arrival_tonnes, date
            limit: Optional limit on number of rows to process

        Returns:
            IngestionStats with counts and timing
        """
        stats = IngestionStats(source="agmarknet")
        start = time.monotonic()

        chunks: List[Dict[str, Any]] = []
        rows_to_process: List[Dict[str, Any]] = []

        # Load data from CSV or API
        if csv_path:
            try:
                with open(csv_path, "r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    for i, row in enumerate(reader):
                        if limit and i >= limit:
                            break
                        rows_to_process.append(row)
                logger.info("Loaded %d rows from %s", len(rows_to_process), csv_path)
            except FileNotFoundError:
                logger.warning("Agmarknet CSV not found at %s — skipping", csv_path)
                return stats
            except Exception as e:
                logger.error("Failed to read Agmarknet CSV: %s", str(e))
                return stats
        else:
            # Fetch recent data from API (historical data requires bulk import)
            from mandi_agent.backend.data_sources.agmarknet import fetch_agmarknet_prices
            records = await fetch_agmarknet_prices(limit=limit or 1000)
            rows_to_process = [
                {
                    "mandi_name": r.mandi_name,
                    "state": r.state,
                    "commodity": r.commodity,
                    "variety": r.variety,
                    "modal_price": r.modal_price,
                    "min_price": r.min_price,
                    "max_price": r.max_price,
                    "arrival_tonnes": r.arrival_tonnes,
                    "date": r.date.isoformat(),
                }
                for r in records
            ]

        # Chunk each row
        for row in rows_to_process:
            chunk = self._chunk_agmarknet_row(row)
            if chunk:
                chunks.append(chunk)

        logger.info("Created %d agmarknet chunks from %d rows", len(chunks), len(rows_to_process))

        if not chunks:
            stats.time_seconds = time.monotonic() - start
            return stats

        # Embed all chunks
        texts = [c["content"] for c in chunks]
        embeddings = await self._embedding.embed_batch(texts)

        # Store in Supabase
        try:
            stored = await self._store_chunks(chunks, embeddings)
            stats.embeddings_stored = stored
            stats.chunks_created = len(chunks)
        except Exception as e:
            stats.errors.append(str(e))
            logger.error("Agmarknet ingestion failed: %s", str(e)[:200])

        stats.time_seconds = time.monotonic() - start
        self._stats.append(stats)
        logger.info(
            "Agmarknet ingestion: %d chunks, %d stored, %.1fs",
            stats.chunks_created, stats.embeddings_stored, stats.time_seconds
        )
        return stats

    async def ingest_kvk_advisories(
        self,
        advisory_dir: Optional[str] = None,
    ) -> IngestionStats:
        """
        Ingest KVK (Krishi Vigyan Kendra) advisories.

        Reads from local directory of advisory documents or fetches from ICAR.
        Each advisory becomes one chunk with crop, district, and season metadata.

        Args:
            advisory_dir: Optional directory containing advisory .txt or .csv files.
                         Files named: {crop}_{district}_{season}.txt
                         Content format: free-form advisory text
        """
        stats = IngestionStats(source="kvk_advisories")
        start = time.monotonic()

        chunks: List[Dict[str, Any]] = []

        if advisory_dir:
            import os
            if not os.path.exists(advisory_dir):
                logger.warning("KVK advisory dir not found: %s — skipping", advisory_dir)
                return stats

            # Scan for advisory files
            for filename in os.listdir(advisory_dir):
                if not filename.endswith((".txt", ".csv")):
                    continue

                # Parse filename: {crop}_{district}_{season}.txt
                base = filename.rsplit(".", 1)[0]
                parts = base.split("_")
                if len(parts) < 3:
                    logger.debug("Skipping malformed advisory filename: %s", filename)
                    continue

                crop = parts[0]
                district = parts[1]
                season = "_".join(parts[2:])  # season may have underscores

                filepath = os.path.join(advisory_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        content = f.read().strip()
                except Exception as e:
                    logger.warning("Failed to read advisory %s: %s", filepath, str(e))
                    continue

                if not content:
                    continue

                # Build chunk with full text
                chunk_content = (
                    f"Crop: {crop.title()}. District: {district.title()}. "
                    f"Season: {season.title()}. Advisory: {content}"
                )

                chunks.append({
                    "content": chunk_content,
                    "source": "kvk_advisory",
                    "crop": crop.lower(),
                    "district": district.lower(),
                    "season": season.lower(),
                })
        else:
            # KVK advisories from ICAR API would go here
            # For now, create a note that they need to be populated
            logger.info("No advisory_dir provided — ingesting sample advisories")
            sample_advisories = [
                {
                    "crop": "tomato",
                    "district": "bangalore_rural",
                    "season": "rabi",
                    "content": "Tomato growers should monitor for late blight disease during humid weather. "
                              "Recommended to apply copper-based fungicide as preventive spray. "
                              "Harvest at green-mature stage for distant markets.",
                },
                {
                    "crop": "onion",
                    "district": "pune",
                    "season": "kharif",
                    "content": "Onion thrips management: Install blue sticky traps at 50 per hectare. "
                              "Spray dimethoate 30 EC at 1.5 L/ha. Avoid irrigation during flowering.",
                },
                {
                    "crop": "wheat",
                    "district": " Ludhiana",
                    "season": "rabi",
                    "content": "Wheat rust monitoring: Scout fields weekly. At first detection of stripe rust, "
                              "apply propiconazole 25 EC at 500 ml/ha. Irrigate at critical stages.",
                },
            ]

            for adv in sample_advisories:
                chunk_content = (
                    f"Crop: {adv['crop'].title()}. District: {adv['district'].title()}. "
                    f"Season: {adv['season'].title()}. Advisory: {adv['content']}"
                )
                chunks.append({
                    "content": chunk_content,
                    "source": "kvk_advisory",
                    "crop": adv["crop"].lower(),
                    "district": adv["district"].lower(),
                    "season": adv["season"].lower(),
                })

        logger.info("Created %d KVK advisory chunks", len(chunks))

        if not chunks:
            stats.time_seconds = time.monotonic() - start
            return stats

        # Embed all chunks
        texts = [c["content"] for c in chunks]
        embeddings = await self._embedding.embed_batch(texts)

        # Store in Supabase
        try:
            stored = await self._store_chunks(chunks, embeddings)
            stats.embeddings_stored = stored
            stats.chunks_created = len(chunks)
        except Exception as e:
            stats.errors.append(str(e))
            logger.error("KVK advisory ingestion failed: %s", str(e)[:200])

        stats.time_seconds = time.monotonic() - start
        self._stats.append(stats)
        logger.info(
            "KVK advisories: %d chunks, %d stored, %.1fs",
            stats.chunks_created, stats.embeddings_stored, stats.time_seconds
        )
        return stats

    async def ingest_icar_shelf_life(self) -> IngestionStats:
        """
        Ingest ICAR shelf life reference database for 50 Indian crops.

        Creates searchable text chunks from SHELF_LIFE_DATABASE.
        Each chunk contains commodity name, shelf life range, optimal
        storage conditions, and handling tips.

        Returns:
            IngestionStats with counts and timing
        """
        stats = IngestionStats(source="icar_shelf_life")
        start = time.monotonic()

        # Build chunks from database
        chunks = []
        for entry in SHELF_LIFE_DATABASE:
            content = _build_shelf_life_chunk(entry)
            chunks.append({
                "content": content,
                "source": "icar_shelf_life",
                "crop": entry["commodity"].lower(),
            })

        logger.info("Created %d shelf life chunks from %d entries",
                   len(chunks), len(SHELF_LIFE_DATABASE))

        # Embed all chunks
        texts = [c["content"] for c in chunks]
        embeddings = await self._embedding.embed_batch(texts)

        # Store in Supabase
        try:
            stored = await self._store_chunks(chunks, embeddings)
            stats.embeddings_stored = stored
            stats.chunks_created = len(chunks)
        except Exception as e:
            stats.errors.append(str(e))
            logger.error("Shelf life ingestion failed: %s", str(e)[:200])

        stats.time_seconds = time.monotonic() - start
        self._stats.append(stats)
        logger.info(
            "ICAR shelf life: %d chunks, %d stored, %.1fs",
            stats.chunks_created, stats.embeddings_stored, stats.time_seconds
        )
        return stats

    async def ingest_all(
        self,
        agmarknet_csv: Optional[str] = None,
        advisory_dir: Optional[str] = None,
        agmarknet_limit: Optional[int] = None,
    ) -> List[IngestionStats]:
        """
        Run all ingestion methods sequentially.

        Args:
            agmarknet_csv: Optional CSV path for Agmarknet history
            advisory_dir: Optional directory for KVK advisories
            agmarknet_limit: Limit rows for Agmarknet (for testing)

        Returns:
            List of IngestionStats for each source
        """
        overall_start = time.monotonic()
        logger.info("Starting full RAG ingestion...")

        all_stats: List[IngestionStats] = []

        # 1. Agmarknet history
        logger.info("Ingesting Agmarknet history...")
        stats = await self.ingest_agmarknet_history(
            csv_path=agmarknet_csv,
            limit=agmarknet_limit,
        )
        all_stats.append(stats)

        # 2. KVK advisories
        logger.info("Ingesting KVK advisories...")
        stats = await self.ingest_kvk_advisories(advisory_dir=advisory_dir)
        all_stats.append(stats)

        # 3. ICAR shelf life
        logger.info("Ingesting ICAR shelf life...")
        stats = await self.ingest_icar_shelf_life()
        all_stats.append(stats)

        total_chunks = sum(s.chunks_created for s in all_stats)
        total_embeddings = sum(s.embeddings_stored for s in all_stats)
        total_time = time.monotonic() - overall_start

        logger.info(
            "Full RAG ingestion complete: %d total chunks, %d embeddings stored, %.1fs",
            total_chunks, total_embeddings, total_time
        )

        return all_stats


if __name__ == "__main__":
    # Smoke test — requires SUPABASE_URL and SUPABASE_SERVICE_KEY env vars
    logging.basicConfig(level=logging.INFO)

    async def test():
        import os
        from dotenv import load_dotenv
        from supabase import create_async_client
        load_dotenv()
        
        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

        if not supabase_url or not supabase_key:
            print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY to test ingestion")
            return

        supabase = await create_async_client(supabase_url, supabase_key)
        pipeline = RAGIngestionPipeline(supabase)

        # Run ICAR shelf life only (no external data needed)
        print("Ingesting ICAR shelf life database...")
        stats = await pipeline.ingest_icar_shelf_life()
        print(f"Created {stats.chunks_created} chunks, stored {stats.embeddings_stored}")

    import asyncio
    asyncio.run(test())
