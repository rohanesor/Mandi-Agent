"""
RAG retrieval — semantic search over embedded documents in Supabase pgvector.
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from supabase import AsyncClient

from mandi_agent.backend.services.rag.embeddings import EmbeddingService, get_embedding_service

logger = logging.getLogger(__name__)

# Minimum similarity threshold — results below this are discarded
MIN_SIMILARITY = 0.65


@dataclass
class RetrievedChunk:
    """A retrieved document chunk with similarity score."""
    content: str
    source: str
    similarity: float
    crop: Optional[str] = None
    mandi: Optional[str] = None
    state: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "content": self.content,
            "source": self.source,
            "similarity": round(self.similarity, 4),
            "crop": self.crop,
            "mandi": self.mandi,
            "state": self.state,
            "metadata": self.metadata or {},
        }


class RAGRetriever:
    """
    Semantic retriever using Supabase pgvector cosine similarity search.

    Features:
    - Cosine similarity via pgvector's <=> operator
    - Filters by crop and state (optional)
    - Minimum similarity threshold (0.65) to filter noise
    - Returns source attributions and similarity scores

    Usage:
        retriever = RAGRetriever(supabase_client)
        results = await retriever.retrieve(
            query="tomato price forecast next week",
            crop="tomato",
            state="karnataka",
            top_k=8,
        )
    """

    def __init__(
        self,
        supabase: AsyncClient,
        embedding_service: Optional[EmbeddingService] = None,
        min_similarity: float = MIN_SIMILARITY,
    ):
        """
        Initialize RAG retriever.

        Args:
            supabase: Supabase async client
            embedding_service: Optional EmbeddingService (creates default if None)
            min_similarity: Minimum cosine similarity threshold (0.0-1.0)
        """
        self._supabase = supabase
        self._embedding = embedding_service or get_embedding_service()
        self._min_similarity = min_similarity

    def _build_retrieval_query(
        self,
        query_embedding: List[float],
        crop: Optional[str],
        state: Optional[str],
        top_k: int,
    ) -> tuple[str, dict]:
        """
        Build SQL query for pgvector similarity search.

        Uses Supabase's RPC function or direct SQL with pgvector.
        The <=> operator gives L2 distance; 1 - distance = cosine similarity.

        Args:
            query_embedding: Query vector
            crop: Optional crop filter
            state: Optional state filter
            top_k: Number of results to return

        Returns:
            Tuple of (SQL query string, parameters dict)
        """
        # Build dynamic filter conditions
        filters = []
        params: Dict[str, Any] = {}

        if crop:
            filters.append("(crop = %(crop)s OR crop IS NULL)")
            params["crop"] = crop.lower()
        if state:
            filters.append("(state = %(state)s OR state IS NULL)")
            params["state"] = state.lower()

        filter_clause = " AND ".join(filters) if filters else "TRUE"

        # SQL query using Supabase pgvector
        # embedding <=> query_embedding gives L2 distance
        # 1 - (embedding <=> query_embedding) converts to cosine similarity
        query = f"""
            SELECT
                content,
                source,
                crop,
                mandi,
                state,
                1 - (embedding <=> %(query_embedding)s::vector) AS similarity
            FROM rag_documents
            WHERE {filter_clause}
              AND embedding IS NOT NULL
            ORDER BY embedding <=> %(query_embedding)s::vector
            LIMIT %(top_k)s;
        """
        params["query_embedding"] = query_embedding
        params["top_k"] = top_k * 2  # Fetch extra to account for filtering

        return query, params

    async def retrieve(
        self,
        query: str,
        crop: Optional[str] = None,
        state: Optional[str] = None,
        top_k: int = 8,
    ) -> List[RetrievedChunk]:
        """
        Retrieve most relevant document chunks for a query.

        Pipeline:
        1. Embed query using EmbeddingService
        2. Cosine similarity search in Supabase pgvector
        3. Filter by minimum similarity threshold
        4. Return top_k results

        Args:
            query: Search query text
            crop: Optional crop filter (e.g., "tomato")
            state: Optional state filter (e.g., "karnataka")
            top_k: Maximum results to return (default 8)

        Returns:
            List of RetrievedChunk sorted by similarity descending
        """
        if not query or not query.strip():
            return []

        start = time.monotonic()
        query = query.strip()

        # 1. Embed query
        query_embedding = await self._embedding.embed_text(query)
        if query_embedding is None:
            logger.error("Failed to embed query: %.32s...", query[:32])
            return []

        # 2. Build and execute retrieval query
        sql, params = self._build_retrieval_query(
            query_embedding=query_embedding,
            crop=crop,
            state=state,
            top_k=top_k,
        )

        try:
            # Use Supabase's raw query (rpc) or direct postgresql
            response = await self._supabase.postgrest.rpc(
                "match_rag_documents",  # Custom RPC function in Supabase
                {
                    "query_embedding": query_embedding,
                    "match_crop": crop.lower() if crop else None,
                    "match_state": state.lower() if state else None,
                    "match_threshold": self._min_similarity,
                    "match_count": top_k,
                }
            ).execute()
            rows = response.data

        except Exception as e:
            # Fallback to direct SQL via connection pool if RPC not available
            logger.warning("RPC retrieval failed, trying direct SQL: %s", str(e)[:100])
            try:
                # Use Supabase connection for raw SQL
                response = await self._supabase.postgres.query(
                    sql,
                    params,
                    count="exact",
                )
                rows = response.get("data", [])
            except Exception as e2:
                logger.error("All retrieval methods failed: %s", str(e2)[:200])
                return []

        # 3. Filter by minimum similarity and build results
        results: List[RetrievedChunk] = []
        for row in rows:
            try:
                similarity = float(row.get("similarity", 0.0))
                if similarity < self._min_similarity:
                    continue

                chunk = RetrievedChunk(
                    content=str(row.get("content", "")),
                    source=str(row.get("source", "unknown")),
                    similarity=similarity,
                    crop=row.get("crop"),
                    mandi=row.get("mandi"),
                    state=row.get("state"),
                )
                results.append(chunk)

                if len(results) >= top_k:
                    break

            except (ValueError, KeyError) as e:
                logger.debug("Skipping invalid row: %s — %s", row, str(e))
                continue

        retrieval_time_ms = (time.monotonic() - start) * 1000
        top_similarity = results[0].similarity if results else 0.0

        logger.info(
            "RAG retrieval: query=%.32s crop=%s state=%s top_k=%d — "
            "retrieved=%d top_similarity=%.3f time=%.0fms",
            query[:32], crop, state, top_k, len(results), top_similarity, retrieval_time_ms
        )

        return results

    async def retrieve_with_expansion(
        self,
        query: str,
        crop: Optional[str] = None,
        state: Optional[str] = None,
        top_k: int = 8,
    ) -> List[RetrievedChunk]:
        """
        Retrieve with query expansion — runs multiple queries and merges results.

        Generates variations of the query to capture different phrasings:
        - Original query
        - Query in past tense
        - Query with generic terms

        Args:
            query: Search query text
            crop: Optional crop filter
            state: Optional state filter
            top_k: Maximum results per query

        Returns:
            Merged list of RetrievedChunk, deduplicated by content
        """
        # Build query variations
        queries = [
            query,
            f"{query} advisory recommendation",
            f"{query} price forecast",
            f"agricultural {query}",
        ]

        all_chunks: Dict[str, RetrievedChunk] = {}
        seen_contents: set = set()

        for q in queries:
            results = await self.retrieve(
                query=q,
                crop=crop,
                state=state,
                top_k=top_k,
            )
            for chunk in results:
                # Deduplicate by content
                content_key = chunk.content[:100]  # Use first 100 chars as key
                if content_key not in seen_contents:
                    seen_contents.add(content_key)
                    # Boost similarity slightly for earlier queries
                    if q == query:
                        all_chunks[content_key] = chunk
                    else:
                        # Slightly reduce similarity for expanded queries
                        chunk.similarity *= 0.95
                        all_chunks[content_key] = chunk

        # Sort by similarity and return top_k
        sorted_chunks = sorted(
            all_chunks.values(),
            key=lambda c: c.similarity,
            reverse=True,
        )[:top_k]

        return sorted_chunks


# Convenience function
async def retrieve(
    query: str,
    crop: Optional[str] = None,
    state: Optional[str] = None,
    top_k: int = 8,
) -> List[Dict[str, Any]]:
    """
    Retrieve relevant documents for a query.

    Convenience wrapper using default Supabase client.

    Args:
        query: Search query text
        crop: Optional crop filter
        state: Optional state filter
        top_k: Maximum results

    Returns:
        List of result dicts with content, source, similarity
    """
    import os
    from supabase import create_async_client, AsyncClient

    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

    if not supabase_url or not supabase_key:
        logger.error("SUPABASE_URL and SUPABASE_SERVICE_KEY required for retrieval")
        return []

    supabase: AsyncClient = await create_async_client(supabase_url, supabase_key)
    retriever = RAGRetriever(supabase)
    results = await retriever.retrieve(query=query, crop=crop, state=state, top_k=top_k)
    return [r.to_dict() for r in results]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    async def test():
        import os
        from supabase import create_async_client, AsyncClient

        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

        if not supabase_url or not supabase_key:
            print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY to test retrieval")
            return

        supabase: AsyncClient = await create_async_client(supabase_url, supabase_key)
        retriever = RAGRetriever(supabase)

        results = await retriever.retrieve(
            query="tomato price and storage conditions",
            crop="tomato",
            state="karnataka",
            top_k=5,
        )

        print(f"Retrieved {len(results)} chunks:")
        for i, r in enumerate(results, 1):
            print(f"  {i}. [{r.source}] similarity={r.similarity:.3f}")
            print(f"     {r.content[:120]}...")

    asyncio.run(test())
