"""
Embedding service using Cohere multilingual embeddings.
Supports 102 languages including 22 Indian languages.
"""

import asyncio
import hashlib
import logging
import time
from typing import List, Optional

import cohere
import httpx
import numpy as np

logger = logging.getLogger(__name__)

# Cohere multilingual model — supports all 22 Indian languages
COHERE_MODEL = "embed-multilingual-v3.0"
COHERE_EMBEDDING_DIM = 1024
COHERE_BATCH_LIMIT = 96  # Cohere max batch size

# Fallback Gemini model
GEMINI_EMBEDDING_MODEL = "models/text-embedding-004"
GEMINI_EMBEDDING_DIM = 768

# Redis TTL for embedding cache (24 hours)
EMBEDDING_CACHE_TTL = 24 * 60 * 60


def _get_cohere_api_key() -> str:
    import os
    return os.getenv("COHERE_API_KEY", "")


def _get_gemini_api_key() -> str:
    import os
    return os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))


def _get_redis_url() -> str:
    import os
    return os.getenv("REDIS_URL", "redis://localhost:6379")


def _text_hash(text: str) -> str:
    """Generate cache key from text content."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]


class EmbeddingService:
    """
    Text embedding service with Cohere multilingual model.

    Features:
    - 1024-dim embeddings for 102 languages (including 22 Indian languages)
    - Automatic batching (96 per request)
    - Redis caching to avoid re-embedding identical texts
    - Fallback to Gemini on Cohere failure

    Usage:
        service = EmbeddingService()
        vector = await service.embed_text("Tomato price in Bangalore")
        vectors = await service.embed_batch(["text1", "text2"])
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        cohere_key: Optional[str] = None,
        gemini_key: Optional[str] = None,
    ):
        self._cohere_key = cohere_key or _get_cohere_api_key()
        self._gemini_key = gemini_key or _get_gemini_api_key()
        self._redis_url = redis_url or _get_redis_url()
        self._cohere_client: Optional[cohere.AsyncClient] = None
        self._redis: Optional["redis.Redis"] = None
        self._fallback_to_gemini = False

    async def _get_cohere(self) -> cohere.AsyncClient:
        """Lazy Cohere client initialization."""
        if self._cohere_client is None:
            self._cohere_client = cohere.AsyncClient(
                api_key=self._cohere_key,
                timeout=60.0,
            )
        return self._cohere_client

    async def _get_redis(self) -> Optional["redis.Redis"]:
        """Lazy Redis connection for caching."""
        if self._redis is not None:
            return self._redis

        try:
            import redis.asyncio as redis
            self._redis = redis.from_url(
                self._redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            await self._redis.ping()
            logger.debug("Embedding Redis cache connected")
        except Exception as e:
            logger.warning("Redis embedding cache unavailable: %s", str(e)[:100])
            self._redis = None

        return self._redis

    async def _get_cache(self, text: str) -> Optional[List[float]]:
        """Get cached embedding from Redis."""
        r = await self._get_redis()
        if not r:
            return None

        try:
            cache_key = f"emb:{_text_hash(text)}"
            cached = await r.get(cache_key)
            if cached:
                import json
                return json.loads(cached)
        except Exception as e:
            logger.debug("Embedding cache read error: %s", str(e)[:100])

        return None

    async def _set_cache(self, text: str, embedding: List[float]) -> None:
        """Store embedding in Redis cache."""
        r = await self._get_redis()
        if not r:
            return

        try:
            import json
            cache_key = f"emb:{_text_hash(text)}"
            await r.setex(cache_key, EMBEDDING_CACHE_TTL, json.dumps(embedding))
        except Exception as e:
            logger.debug("Embedding cache write error: %s", str(e)[:100])

    async def embed_text(self, text: str) -> Optional[List[float]]:
        """
        Generate 1024-dim embedding for a single text.

        Uses Cohere multilingual-v3.0, falls back to Gemini on failure.
        Results are cached in Redis to avoid re-embedding identical texts.

        Args:
            text: Input text (any language)

        Returns:
            1024-dimensional embedding vector, or None on failure
        """
        if not text or not text.strip():
            return None

        text = text.strip()

        # Check cache first
        cached = await self._get_cache(text)
        if cached is not None:
            logger.debug("Embedding cache hit: %.32s...", text[:32])
            return cached

        # Try Cohere first
        if self._cohere_key and not self._fallback_to_gemini:
            try:
                embedding = await self._embed_cohere([text])
                if embedding:
                    await self._set_cache(text, embedding[0])
                    return embedding[0]
            except Exception as e:
                logger.warning("Cohere embed failed, trying Gemini fallback: %s", str(e)[:100])
                self._fallback_to_gemini = True

        # Gemini fallback
        if self._gemini_key:
            try:
                embedding = await self._embed_gemini([text])
                if embedding:
                    await self._set_cache(text, embedding[0])
                    return embedding[0]
            except Exception as e:
                logger.error("Gemini embedding also failed: %s", str(e)[:100])

        return None

    async def embed_batch(self, texts: List[str]) -> List[Optional[List[float]]]:
        """
        Generate embeddings for multiple texts with automatic batching.

        Texts are grouped into batches of 96 (Cohere limit) and processed
        concurrently for speed. Texts with cached embeddings are skipped.

        Args:
            texts: List of input texts

        Returns:
            List of embeddings (same order as input). None for failed texts.
        """
        if not texts:
            return []

        # Filter empty texts
        valid_texts = [(i, t.strip()) for i, t in enumerate(texts) if t and t.strip()]
        if not valid_texts:
            return [None] * len(texts)

        # Check cache for all texts
        results: List[Optional[List[float]]] = [None] * len(texts)
        uncached_indices: list[int] = []
        uncached_texts: list[str] = []

        for i, text in valid_texts:
            cached = await self._get_cache(text)
            if cached is not None:
                results[i] = cached
            else:
                uncached_indices.append(i)
                uncached_texts.append(text)

        if not uncached_texts:
            logger.debug("All %d embeddings cache hits", len(valid_texts))
            return results

        # Process uncached texts in batches of 96
        all_embeddings: list[Optional[List[float]]] = []
        for batch_start in range(0, len(uncached_texts), COHERE_BATCH_LIMIT):
            batch = uncached_texts[batch_start:batch_start + COHERE_BATCH_LIMIT]

            if self._cohere_key and not self._fallback_to_gemini:
                try:
                    batch_embeddings = await self._embed_cohere(batch)
                    all_embeddings.extend(batch_embeddings)
                    continue
                except Exception as e:
                    logger.warning("Cohere batch failed, trying Gemini: %s", str(e)[:100])
                    self._fallback_to_gemini = True

            # Gemini fallback
            if self._gemini_key:
                try:
                    batch_embeddings = await self._embed_gemini(batch)
                    all_embeddings.extend(batch_embeddings)
                except Exception as e:
                    logger.error("Gemini batch also failed: %s", str(e)[:100])
                    all_embeddings.extend([None] * len(batch))
            else:
                all_embeddings.extend([None] * len(batch))

        # Merge cached and fresh results
        embedding_iter = iter(all_embeddings)
        for idx in uncached_indices:
            emb = next(embedding_iter)
            results[idx] = emb
            if emb is not None:
                await self._set_cache(valid_texts[idx][1], emb)

        cached_count = len(valid_texts) - len(uncached_texts)
        logger.info("Batch embed complete: %d total, %d cache hits, %d fresh",
                   len(texts), cached_count, len(uncached_texts))

        return results

    async def _embed_cohere(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings using Cohere API.

        Args:
            texts: List of texts to embed

        Returns:
            List of 1024-dim embedding vectors
        """
        client = await self._get_cohere()
        start = time.monotonic()

        response = await client.embed(
            texts=texts,
            model=COHERE_MODEL,
            input_type="search_document",  # Optimized for retrieval
            embedding_types=["float"],
        )

        # Response.embeddings is a dict with 'float' key
        embeddings = response.embeddings.float_
        latency_ms = (time.monotonic() - start) * 1000

        logger.debug(
            "Cohere embed: %d texts, %.0fms, dim=%d",
            len(texts), latency_ms, len(embeddings[0])
        )

        return [list(e) for e in embeddings]

    async def _embed_gemini(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings using Google Gemini API (fallback).

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors (768-dim)
        """
        import google.generativeai as genai
        genai.configure(api_key=self._gemini_key)
        start = time.monotonic()
        
        # GenerativeAI embed_content accepts a list
        response = genai.embed_content(
            model=GEMINI_EMBEDDING_MODEL,
            content=texts,
            task_type="retrieval_document"
        )
        
        embeddings = response['embedding']
        latency_ms = (time.monotonic() - start) * 1000

        logger.debug(
            "Gemini embed fallback: %d texts, %.0fms, dim=%d",
            len(texts), latency_ms, len(embeddings[0]) if embeddings else 0
        )

        return embeddings

    async def close(self) -> None:
        """Cleanup connections."""
        if self._redis:
            await self._redis.close()


# Default service instance
_default_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get or create singleton embedding service."""
    global _default_service
    if _default_service is None:
        _default_service = EmbeddingService()
    return _default_service


async def embed_text(text: str) -> Optional[List[float]]:
    """Convenience: embed a single text."""
    service = get_embedding_service()
    return await service.embed_text(text)


async def embed_batch(texts: List[str]) -> List[Optional[List[float]]]:
    """Convenience: embed multiple texts."""
    service = get_embedding_service()
    return await service.embed_batch(texts)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def test():
        service = EmbeddingService()
        # Test single embed
        vec = await service.embed_text("Tomato price in Karnataka")
        print(f"Single embed: {len(vec) if vec else 'FAILED'} dims")
        # Test batch
        vecs = await service.embed_batch([
            "Onion harvest in Maharashtra",
            "Wheat price in Punjab",
            "Rice cultivation in Tamil Nadu",
        ])
        print(f"Batch embed: {sum(1 for v in vecs if v)}/{len(vecs)} succeeded")
        await service.close()

    asyncio.run(test())
