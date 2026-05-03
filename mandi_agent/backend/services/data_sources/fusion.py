"""
Data fusion engine — combines all data sources into unified context.
Runs all 4 fetchers concurrently and merges results.
"""

import asyncio
import logging
import json
import hashlib
from datetime import datetime, timedelta, timezone, date
from typing import Optional
from dataclasses import dataclass, field, asdict
from enum import Enum

import redis.asyncio as redis
import httpx

from mandi_agent.backend.services.data_sources.agmarknet import fetch_agmarknet_prices
from mandi_agent.backend.services.data_sources.nasa_power import fetch_soil_moisture, SoilMoistureReading
from mandi_agent.backend.services.data_sources.imd_weather import fetch_weather_forecast, WeatherForecast
from mandi_agent.backend.services.data_sources.enam import fetch_enam_prices
from mandi_agent.backend.api.core_schemas import MandiPrice

logger = logging.getLogger(__name__)

# Cache TTL: 15 minutes
FUSION_CACHE_TTL_SECONDS = 15 * 60


def _get_redis_url() -> str:
    import os
    return os.getenv("REDIS_URL", "redis://localhost:6379")


def _get_api_key() -> str:
    import os
    return os.getenv("DATA_GOV_API_KEY", "")


def _build_cache_key(block_id: str, crop: str) -> str:
    """Build Redis cache key for fusion data."""
    return f"fusion:{block_id}:{crop.lower()}"


class DataSourceStatus(str, Enum):
    """Status of each data source."""
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"
    UNAVAILABLE = "unavailable"


@dataclass
class DataSourceMetrics:
    """Metrics for each data source in fusion."""
    source: str
    status: DataSourceStatus
    record_count: int
    latency_ms: float
    error_message: Optional[str] = None


@dataclass
class FusedContext:
    """
    Unified data context from all sources for a block+crop.

    Created by DataFusionEngine.fuse() — passed to all downstream agents.
    """
    block_id: str
    crop: str
    mandi_prices: list[MandiPrice] = field(default_factory=list)
    soil_moisture: Optional[SoilMoistureReading] = None
    weather_forecast: Optional[WeatherForecast] = None
    enam_prices: list[MandiPrice] = field(default_factory=list)
    fusion_timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    data_quality_score: float = 0.0  # 0.0 to 1.0
    source_metrics: list[DataSourceMetrics] = field(default_factory=list)
    total_fetch_time_ms: float = 0.0
    from_cache: bool = False

    def to_dict(self) -> dict:
        """Serialize to dict for caching."""
        d = asdict(self)
        # Convert dataclasses to dicts
        d["mandi_prices"] = [p.model_dump(mode="json") for p in self.mandi_prices]
        d["enam_prices"] = [p.model_dump(mode="json") for p in self.enam_prices]
        if self.soil_moisture:
            d["soil_moisture"] = asdict(self.soil_moisture)
        if self.weather_forecast:
            d["weather_forecast"] = asdict(self.weather_forecast)
        d["fusion_timestamp"] = self.fusion_timestamp.isoformat()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "FusedContext":
        """Deserialize from cached dict."""
        d["mandi_prices"] = [MandiPrice(**p) for p in d.get("mandi_prices", [])]
        d["enam_prices"] = [MandiPrice(**p) for p in d.get("enam_prices", [])]
        if d.get("soil_moisture"):
            d["soil_moisture"] = SoilMoistureReading(**d["soil_moisture"])
        if d.get("weather_forecast"):
            wf = d["weather_forecast"]
            wf["forecast_days"] = [wd for wd in wf.get("forecast_days", [])]
            d["weather_forecast"] = WeatherForecast(**wf)
        d["fusion_timestamp"] = datetime.fromisoformat(d["fusion_timestamp"])
        d["source_metrics"] = [DataSourceMetrics(**m) for m in d.get("source_metrics", [])]
        d["from_cache"] = True
        return cls(**d)


class DataFusionEngine:
    """
    Fusion engine that aggregates all 4 data sources concurrently.

    Usage:
        engine = DataFusionEngine()
        context = await engine.fuse(block_id="KA-001", crop="tomato", farmer_location=(lat, lng))
    """

    def __init__(self, redis_url: Optional[str] = None):
        """
        Initialize fusion engine.

        Args:
            redis_url: Redis connection URL (defaults to REDIS_URL env var)
        """
        self._redis_url = redis_url or _get_redis_url()
        self._redis: Optional[redis.Redis] = None
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_redis(self) -> Optional[redis.Redis]:
        """Lazy Redis connection."""
        if self._redis is None:
            try:
                self._redis = redis.from_url(
                    self._redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                )
                # Test connection
                await self._redis.ping()
                logger.debug("Redis connected: %s", self._redis_url)
            except redis.RedisError as e:
                logger.warning("Redis unavailable — caching disabled: %s", str(e)[:100])
                self._redis = None
        return self._redis

    async def _get_http_client(self) -> httpx.AsyncClient:
        """Lazy HTTP client."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=30.0)
        return self._http_client

    async def close(self):
        """Cleanup connections."""
        if self._redis:
            await self._redis.close()
        if self._http_client:
            await self._http_client.aclose()

    async def _fetch_agmarknet(
        self,
        crop: str,
        state: Optional[str] = None,
    ) -> tuple[list[MandiPrice], DataSourceMetrics]:
        """Fetch Agmarknet prices with timing."""
        start = datetime.now(timezone.utc)
        try:
            prices = await fetch_agmarknet_prices(
                commodity=crop,
                state=state,
                from_date=date.today(),
                to_date=date.today(),
            )
            latency_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            return prices, DataSourceMetrics(
                source="agmarknet",
                status=DataSourceStatus.SUCCESS if prices else DataSourceStatus.PARTIAL,
                record_count=len(prices),
                latency_ms=latency_ms,
            )
        except Exception as e:
            latency_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            logger.warning("Agmarknet fetch failed: %s", str(e)[:100])
            return [], DataSourceMetrics(
                source="agmarknet",
                status=DataSourceStatus.FAILED,
                record_count=0,
                latency_ms=latency_ms,
                error_message=str(e)[:200],
            )

    async def _fetch_soil_moisture(
        self,
        lat: float,
        lng: float,
        block_id: str,
    ) -> tuple[Optional[SoilMoistureReading], DataSourceMetrics]:
        """Fetch soil moisture with timing."""
        start = datetime.now(timezone.utc)
        try:
            reading = await fetch_soil_moisture(lat=lat, lng=lng, block_id=block_id)
            latency_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            return reading, DataSourceMetrics(
                source="nasa_power",
                status=DataSourceStatus.SUCCESS,
                record_count=1,
                latency_ms=latency_ms,
            )
        except Exception as e:
            latency_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            logger.warning("NASA POWER fetch failed: %s", str(e)[:100])
            return None, DataSourceMetrics(
                source="nasa_power",
                status=DataSourceStatus.FAILED,
                record_count=0,
                latency_ms=latency_ms,
                error_message=str(e)[:200],
            )

    async def _fetch_weather(
        self,
        district: str,
        state: str,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
    ) -> tuple[Optional[WeatherForecast], DataSourceMetrics]:
        """Fetch weather with timing."""
        start = datetime.now(timezone.utc)
        try:
            forecast = await fetch_weather_forecast(
                district=district,
                state=state,
                lat=lat,
                lon=lon,
            )
            latency_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            day_count = len(forecast.forecast_days) if forecast else 0
            return forecast, DataSourceMetrics(
                source=forecast.source if forecast else "unknown",
                status=DataSourceStatus.SUCCESS if day_count > 0 else DataSourceStatus.PARTIAL,
                record_count=day_count,
                latency_ms=latency_ms,
            )
        except Exception as e:
            latency_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            logger.warning("Weather fetch failed: %s", str(e)[:100])
            return None, DataSourceMetrics(
                source="imd",
                status=DataSourceStatus.FAILED,
                record_count=0,
                latency_ms=latency_ms,
                error_message=str(e)[:200],
            )

    async def _fetch_enam(
        self,
        crop: str,
        state: Optional[str] = None,
    ) -> tuple[list[MandiPrice], DataSourceMetrics]:
        """Fetch eNAM prices with timing."""
        start = datetime.now(timezone.utc)
        try:
            prices = await fetch_enam_prices(
                commodity=crop,
                state=state,
                from_date=date.today(),
                to_date=date.today(),
            )
            latency_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            return prices, DataSourceMetrics(
                source="enam",
                status=DataSourceStatus.SUCCESS if prices else DataSourceStatus.PARTIAL,
                record_count=len(prices),
                latency_ms=latency_ms,
            )
        except Exception as e:
            latency_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000
            logger.warning("eNAM fetch failed: %s", str(e)[:100])
            return [], DataSourceMetrics(
                source="enam",
                status=DataSourceStatus.FAILED,
                record_count=0,
                latency_ms=latency_ms,
                error_message=str(e)[:200],
            )

    def _compute_quality_score(
        self,
        metrics: list[DataSourceMetrics],
        total_records: int,
    ) -> float:
        """
        Compute overall data quality score (0.0 to 1.0).

        Scoring logic:
        - Each successful source: +0.25
        - Each partial source: +0.1
        - Each failed source: +0.0
        - Bonus: more records = slightly higher score (up to +0.1)

        Args:
            metrics: List of source metrics
            total_records: Total records across all sources

        Returns:
            Quality score between 0.0 and 1.0
        """
        if not metrics:
            return 0.0

        score = 0.0
        for m in metrics:
            if m.status == DataSourceStatus.SUCCESS:
                score += 0.25
            elif m.status == DataSourceStatus.PARTIAL:
                score += 0.1
            # FAILED = 0.0

        # Bonus for record volume (cap at +0.1)
        record_bonus = min(0.1, total_records / 1000.0)
        score += record_bonus

        return min(1.0, score)

    async def _check_cache(self, cache_key: str) -> Optional[FusedContext]:
        """Check Redis cache for existing fusion data."""
        r = await self._get_redis()
        if not r:
            return None

        try:
            cached = await r.get(cache_key)
            if cached:
                data = json.loads(cached)
                ctx = FusedContext.from_dict(data)
                logger.info("Cache HIT for %s (%.0f min old)",
                           cache_key,
                           (datetime.now(timezone.utc) - ctx.fusion_timestamp).total_seconds() / 60)
                return ctx
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.warning("Cache parse error for %s: %s", cache_key, str(e)[:100])

        return None

    async def _write_cache(self, cache_key: str, context: FusedContext) -> None:
        """Write fusion context to Redis cache."""
        r = await self._get_redis()
        if not r:
            return

        try:
            data = context.to_dict()
            await r.setex(
                cache_key,
                FUSION_CACHE_TTL_SECONDS,
                json.dumps(data),
            )
            logger.debug("Cached %s for %d seconds", cache_key, FUSION_CACHE_TTL_SECONDS)
        except redis.RedisError as e:
            logger.warning("Cache write failed for %s: %s", cache_key, str(e)[:100])

    async def fuse(
        self,
        block_id: str,
        crop: str,
        farmer_location: tuple[float, float, str, str],  # (lat, lng, district, state)
        use_cache: bool = True,
        bypass_cache: bool = False,
    ) -> FusedContext:
        """
        Fuse all 4 data sources concurrently for a block+crop.

        Runs all fetchers in parallel using asyncio.gather().
        Results are cached in Redis for 15 minutes.

        Args:
            block_id: 6km radius block identifier
            crop: Crop name (e.g., "Tomato")
            farmer_location: Tuple of (latitude, longitude, district, state)
            use_cache: Whether to use/read Redis cache (default True)
            bypass_cache: Force fresh fetch ignoring cache (default False)

        Returns:
            FusedContext with all merged data
        """
        lat, lng, district, state = farmer_location
        cache_key = _build_cache_key(block_id, crop)

        # Check cache first
        if use_cache and not bypass_cache:
            cached = await self._check_cache(cache_key)
            if cached:
                return cached

        overall_start = datetime.now(timezone.utc)

        # Run all 4 fetchers concurrently
        # Using asyncio.gather with return_exceptions=True to handle individual failures
        agmarknet_task = self._fetch_agmarknet(crop=crop, state=state)
        soil_task = self._fetch_soil_moisture(lat=lat, lng=lng, block_id=block_id)
        weather_task = self._fetch_weather(district=district, state=state, lat=lat, lon=lng)
        enam_task = self._fetch_enam(crop=crop, state=state)

        # Execute all concurrently — individual failures don't crash the fusion
        results = await asyncio.gather(
            agmarknet_task,
            soil_task,
            weather_task,
            enam_task,
            return_exceptions=True,
        )

        # Unpack results
        agmarknet_prices: list[MandiPrice] = []
        soil_moisture: Optional[SoilMoistureReading] = None
        weather_forecast: Optional[WeatherForecast] = None
        enam_prices: list[MandiPrice] = []
        source_metrics: list[DataSourceMetrics] = []

        # Handle each result
        if not isinstance(results[0], Exception):
            agmarknet_prices, m = results[0]
            source_metrics.append(m)
        else:
            source_metrics.append(DataSourceMetrics(
                source="agmarknet", status=DataSourceStatus.FAILED,
                record_count=0, latency_ms=0.0, error_message=str(results[0])[:200]
            ))

        if not isinstance(results[1], Exception):
            soil_moisture, m = results[1]
            source_metrics.append(m)
        else:
            source_metrics.append(DataSourceMetrics(
                source="nasa_power", status=DataSourceStatus.FAILED,
                record_count=0, latency_ms=0.0, error_message=str(results[1])[:200]
            ))

        if not isinstance(results[2], Exception):
            weather_forecast, m = results[2]
            source_metrics.append(m)
        else:
            source_metrics.append(DataSourceMetrics(
                source="imd", status=DataSourceStatus.FAILED,
                record_count=0, latency_ms=0.0, error_message=str(results[2])[:200]
            ))

        if not isinstance(results[3], Exception):
            enam_prices, m = results[3]
            source_metrics.append(m)
        else:
            source_metrics.append(DataSourceMetrics(
                source="enam", status=DataSourceStatus.FAILED,
                record_count=0, latency_ms=0.0, error_message=str(results[3])[:200]
            ))

        total_fetch_time_ms = (datetime.now(timezone.utc) - overall_start).total_seconds() * 1000
        total_records = len(agmarknet_prices) + len(enam_prices)
        data_quality_score = self._compute_quality_score(source_metrics, total_records)

        context = FusedContext(
            block_id=block_id,
            crop=crop,
            mandi_prices=agmarknet_prices,
            soil_moisture=soil_moisture,
            weather_forecast=weather_forecast,
            enam_prices=enam_prices,
            fusion_timestamp=datetime.now(timezone.utc),
            data_quality_score=data_quality_score,
            source_metrics=source_metrics,
            total_fetch_time_ms=total_fetch_time_ms,
        )

        # Log summary
        success_count = sum(
            1 for m in source_metrics if m.status == DataSourceStatus.SUCCESS
        )
        logger.info(
            "Fusion complete for %s/%s: %dms, quality=%.2f, %d/%d sources, "
            "prices=%d+%d records",
            block_id, crop, total_fetch_time_ms, data_quality_score,
            success_count, len(source_metrics),
            len(agmarknet_prices), len(enam_prices),
        )

        # Write to cache
        if use_cache:
            await self._write_cache(cache_key, context)

        return context


# Singleton instance for use across the application
_default_engine: Optional[DataFusionEngine] = None


async def get_fusion_engine() -> DataFusionEngine:
    """Get or create the singleton fusion engine."""
    global _default_engine
    if _default_engine is None:
        _default_engine = DataFusionEngine()
    return _default_engine


async def close_fusion_engine() -> None:
    """Close the singleton fusion engine."""
    global _default_engine
    if _default_engine:
        await _default_engine.close()
        _default_engine = None


async def fuse(
    block_id: str,
    crop: str,
    farmer_location: tuple[float, float, str, str],
    use_cache: bool = True,
) -> FusedContext:
    """
    Convenience function — fuse all data sources for a block+crop.

    Args:
        block_id: Block identifier
        crop: Crop name
        farmer_location: (lat, lng, district, state)

    Returns:
        FusedContext with all merged data
    """
    engine = await get_fusion_engine()
    return await engine.fuse(block_id, crop, farmer_location, use_cache=use_cache)


if __name__ == "__main__":
    # Smoke test
    logging.basicConfig(level=logging.INFO)

    async def test():
        engine = DataFusionEngine()
        ctx = await engine.fuse(
            block_id="KA-001",
            crop="tomato",
            farmer_location=(13.5833, 76.0364, "Bangalore Rural", "Karnataka"),
        )
        print(f"Block: {ctx.block_id}, Crop: {ctx.crop}")
        print(f"Quality: {ctx.data_quality_score:.2f}")
        print(f"Fetch time: {ctx.total_fetch_time_ms:.0f}ms")
        print(f"Agmarknet: {len(ctx.mandi_prices)} prices")
        print(f"eNAM: {len(ctx.enam_prices)} prices")
        if ctx.soil_moisture:
            print(f"Soil moisture: {ctx.soil_moisture.soil_moisture_pct}% (sim={ctx.soil_moisture.simulated})")
        if ctx.weather_forecast:
            print(f"Weather: {ctx.weather_forecast.source}, {len(ctx.weather_forecast.forecast_days)} days")
        await engine.close()

    asyncio.run(test())
