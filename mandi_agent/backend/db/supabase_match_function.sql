-- Supabase RPC function for RAG semantic search over pgvector.
-- Execute this SQL in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION match_rag_documents (
  query_embedding VECTOR(1024),
  match_threshold FLOAT,
  match_count INT,
  match_crop TEXT DEFAULT NULL,
  match_state TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source TEXT,
  crop TEXT,
  mandi TEXT,
  state TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rag_documents.id,
    rag_documents.content,
    rag_documents.source,
    rag_documents.crop,
    rag_documents.mandi,
    rag_documents.state,
    1 - (rag_documents.embedding <=> query_embedding) AS similarity
  FROM rag_documents
  WHERE (match_crop IS NULL OR rag_documents.crop = match_crop)
    AND (match_state IS NULL OR rag_documents.state = match_state)
    AND (1 - (rag_documents.embedding <=> query_embedding)) > match_threshold
  ORDER BY rag_documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
