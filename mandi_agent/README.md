# Mandi-Agent Backend

AI platform for Indian smallholder farmers — price prediction, disease detection, virtual cooperatives, and voice advisories.

## Overview

Mandi-Agent is an SDG 2 hackathon project helping 120M Indian farmers make better decisions:

- **Price Prediction** — AI-powered mandi price forecasts using Gemini 2.0 + RAG
- **Disease Detection** — Plant leaf disease identification via Gemini Vision (9 crops, 40+ diseases)
- **Virtual Cooperatives** — Bundle produce across farmers to reach full truckloads
- **Voice Advisories** — WhatsApp-based advisories in 22 Indian languages

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
│   ├── api/
│   │   ├── core_schemas.py       # Pydantic v2 schemas
│   │   └── routes/               # FastAPI endpoints
│   ├── agents/
│   │   ├── disease_detector.py   # Gemini Vision disease detection
│   │   ├── price_prediction.py   # Mandi price forecasting
│   │   ├── oversupply_detector.py
│   │   ├── spoilage_risk.py
│   │   ├── benchmark_runner.py   # Accuracy benchmarking
│   │   ├── benchmark_dataset.py  # PlantVillage dataset tools
│   │   └── benchmark_report.py   # Performance reports
│   ├── data_sources/
│   │   ├── agmarknet.py          # Agmarknet API connector
│   │   ├── enam.py               # eNAM connector
│   │   ├── imd_weather.py        # IMD weather data
│   │   └── open_meteo.py         # Open-Meteo weather
│   ├── rag/
│   │   ├── embeddings.py         # Cohere multilingual embeddings
│   │   ├── ingestion.py          # Chunking + storage
│   │   └── retrieval.py          # Semantic search
│   ├── orchestrator/
│   │   └── langgraph_flow.py     # LangGraph workflow
│   ├── main.py                   # FastAPI app
│   └── guardrails.py             # AI safety filters
├── scripts/
│   └── setup_benchmark.py        # Benchmark setup & execution
├── tests/
│   └── test_disease_detection.py # Disease detection tests
├── n8n/                          # n8n workflow exports
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Setup

### 1. Install Dependencies

```bash
pip install -r backend/requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Required API keys:
- **GEMINI_API_KEY**: Gemini 2.0 Flash (LLM + Vision)
- **SUPABASE_URL / SUPABASE_SERVICE_KEY**: Database + pgvector
- **COHERE_API_KEY**: Multilingual embeddings
- **DATA_GOV_API_KEY**: Agmarknet data.gov.in API
- **TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN**: WhatsApp messaging
- **N8N_API_KEY**: Automation webhooks

### 3. Set Up Supabase

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    embedding VECTOR(1024),
    source TEXT, crop TEXT, mandi TEXT,
    state TEXT, district TEXT, season TEXT,
    month INTEGER, year INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON rag_documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### 4. Run

```bash
# Docker (recommended)
docker compose up -d

# Or locally
uvicorn backend.main:app --reload --port 8000
```

API available at `http://localhost:8000`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/v1/disease/detect` | Detect plant disease from image |
| POST | `/api/v1/harvest-intent` | Submit harvest intent |
| GET | `/api/v1/prices/{commodity}` | Get mandi prices |
| GET | `/api/v1/forecast/{crop}` | Get price forecast |
| POST | `/api/v1/bundle/create` | Create cooperative bundle |

## Disease Detection

The disease detection agent uses Gemini 2.0 Flash with expert agricultural pathologist prompts covering 9 crops and 40+ diseases:

| Crop | Diseases |
|------|----------|
| Tomato | Early blight, late blight, leaf curl, mosaic virus, septoria, spider mites |
| Potato | Early blight, late blight |
| Corn | Common rust, northern leaf blight, gray leaf spot |
| Rice | Blast, brown spot, bacterial blight |
| Wheat | Rust, powdery mildew, leaf blight |
| Cotton | Leaf spot, bollworm, anthracnose |
| Grape | Black rot, powdery mildew, leaf blight |
| Apple | Scab, black rot, cedar apple rust |
| Onion | Purple blotch, downy mildew |

### Benchmarking

```bash
# Download sample images from PlantVillage and run accuracy benchmark
python scripts/setup_benchmark.py

# Results saved to data/benchmark_results/
```

Benchmark compares prompt versions (baseline vs expert context) across all crops and reports accuracy, precision, recall, and confidence calibration.

## Testing

```bash
# Run all tests
pytest

# Run disease detection tests
pytest tests/test_disease_detection.py -v
```

## Development

```bash
# Type checking
mypy mandi_agent/

# Linting
ruff check mandi_agent/
```

## Phases

1. **Phase 1**: Project Foundation ✓ (schemas, structure)
2. **Phase 2**: Data Sources ✓ (Agmarknet, eNAM, IMD, MOSDAC)
3. **Phase 3**: RAG Pipeline ✓ (embeddings, ingestion, retrieval)
4. **Phase 4**: AI Agents ✓ (price, disease, spoilage, oversupply)
5. **Phase 5**: Voice Interface ✓ (Reverie integration)
6. **Phase 6**: LangGraph Orchestration ✓ (advisory generation)
7. **Phase 7**: Integration & Testing ✓ (n8n Webhooks, system tests)
8. **Phase 8**: Benchmarking ✓ (PlantVillage dataset, accuracy reports)
