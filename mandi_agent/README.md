# Mandi-Agent

AI platform for Indian smallholder farmers — price prediction, Virtual Cooperatives, and voice advisories in 22 Indian languages.

## Overview

Mandi-Agent is an SDG 2 hackathon project targeting ₹30,000 prize. It helps 120M Indian farmers:

- **Price Prediction**: AI-powered mandi price forecasts using Gemini 2.0 + RAG
- **Virtual Cooperatives**: Bundle produce across farmers to reach full truckloads
- **Voice Advisories**: WhatsApp-based advisories in 22 Indian languages via Reverie API

## Tech Stack

- **AI Agents**: PydanticAI + LangGraph + Gemini 2.0 Flash
- **Backend**: FastAPI + async/await
- **Database**: Supabase (PostgreSQL + pgvector)
- **Voice**: Reverie SDK (22 Indian languages)
- **Automation**: n8n (WhatsApp routing, scheduled jobs)
- **Messaging**: Twilio WhatsApp

## Project Structure

```
mandi_agent/
├── backend/
│   ├── models/schemas.py       # All Pydantic v2 schemas
│   ├── agents/                 # AI agent implementations
│   │   ├── data_ingestion.py   # Agmarknet/eNAM scrapers
│   │   ├── price_prediction.py
│   │   ├── oversupply_detector.py
│   │   ├── spoilage_risk.py
│   │   ├── negotiation.py
│   │   ├── rag_advisory.py
│   │   ├── voice_interface.py
│   │   └── guardrails.py
│   ├── data_sources/           # External API connectors
│   │   ├── agmarknet.py
│   │   ├── enam.py
│   │   ├── imd_weather.py
│   │   ├── isro_mosdac.py
│   │   └── fusion.py
│   ├── rag/                    # RAG pipeline
│   │   ├── embeddings.py       # Cohere multilingual embeddings
│   │   ├── ingestion.py        # Chunking + storage
│   │   └── retrieval.py        # Semantic search
│   ├── orchestrator/
│   │   └── langgraph_flow.py   # LangGraph workflow
│   ├── voice/
│   │   └── bhashini.py        # Bhashini API
│   ├── automations/
│   │   └── n8n_triggers.py
│   ├── guardrails/
│   │   └── safety.py
│   └── main.py                 # FastAPI app
```

## Setup

### 1. Install Dependencies

```bash
pip install -r backend/requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

Required API keys:
- **Anthropic**: Claude 3.7 for AI agents
- **Supabase**: Database + pgvector
- **Cohere**: Multilingual embeddings (embed-multilingual-v3.0)
- **Bhashini**: 22-language voice API
- **Twilio**: WhatsApp messaging
- **n8n**: Automation webhooks
- **DATA_GOV_API_KEY**: Agmarknet data.gov.in API

### 3. Set Up Supabase

1. Create a Supabase project
2. Enable pgvector extension: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Create `rag_documents` table:

```sql
CREATE TABLE rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    embedding VECTOR(1024),
    source TEXT,
    crop TEXT,
    mandi TEXT,
    state TEXT,
    district TEXT,
    season TEXT,
    month INTEGER,
    year INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON rag_documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 4. Create semantic search function (RPC)
-- Execute the SQL provided in backend/db/supabase_match_function.sql
```

### 4. Verify Installation

```bash
python -m backend.main
```

The API should start on `http://localhost:8000`.

## RAG Ingestion

Before using RAG retrieval, populate the knowledge base:

```bash
python -m backend.rag.ingestion
```

This ingests:
- Agmarknet price history (2020-2025)
- KVK agricultural advisories
- ICAR shelf life database (50 crops)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/farmers/{id}` | Get farmer profile |
| POST | `/api/v1/farmers` | Register farmer |
| POST | `/api/v1/harvest-intent` | Submit harvest intent |
| GET | `/api/v1/prices/{commodity}` | Get mandi prices |
| GET | `/api/v1/forecast/{crop}` | Get price forecast |
| POST | `/api/v1/advisory/generate` | Generate advisory |
| POST | `/api/v1/bundle/create` | Create cooperative bundle |
| POST | `/api/v1/voice/session` | Create voice session |

## Development

### Run Single Test

```bash
pytest tests/test_schemas.py -v
```

### Type Checking

```bash
mypy mandi_agent/
```

### Linting

```bash
ruff check mandi_agent/
```

## Phases

1. **Phase 1**: Project Foundation ✓ (schemas, structure)
2. **Phase 2**: Data Sources ✓ (Agmarknet, eNAM, IMD, MOSDAC, Fusion)
3. **Phase 3**: RAG Pipeline ✓ (embeddings, ingestion, retrieval)
4. **Phase 4**: AI Agents ✓ (price prediction, oversupply, spoilage)
5. **Phase 5**: Voice Interface ✓ (Reverie integration)
6. **Phase 6**: LangGraph Orchestration ✓ (advisory generation)
7. **Phase 7**: Integration & Testing ✓ (n8n Webhooks, system tests)
