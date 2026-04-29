# Mandi Agent

AI-powered agricultural platform empowering Indian smallholder farmers with real-time mandi price prediction, virtual cooperatives, and voice advisories in 22 Indian languages.

> SDG 2 Hackathon Project — Targeting ₹30,000 prize

[![Python](https://img.shields.io/badge/Python-3.12+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green.svg)](https://fastapi.tiangolo.com/)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-black.svg)](https://expo.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E.svg)](https://supabase.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://www.docker.com/)

## Overview

Mandi Agent helps 120M Indian farmers make data-driven decisions:

- **Price Prediction** — AI-powered mandi price forecasts using Gemini 2.0 + RAG
- **Virtual Cooperatives** — Bundle produce across farmers to reach full truckloads
- **Voice Advisories** — WhatsApp-based advisories in 22 Indian languages via Reverie API
- **Multi-Language Mobile App** — React Native app with 8 Indian languages

## Project Structure

```
mandi-agent/
├── mandi_agent/          # Backend (Python/FastAPI)
│   ├── backend/          # FastAPI application
│   │   ├── agents/       # AI agents (price prediction, oversupply, spoilage, etc.)
│   │   ├── data_sources/ # External API connectors (Agmarknet, eNAM, IMD, MOSDAC)
│   │   ├── rag/          # RAG pipeline (embeddings, ingestion, retrieval)
│   │   ├── orchestrator/ # LangGraph workflow orchestration
│   │   ├── voice/        # Bhashini voice integration
│   │   ├── automations/  # n8n triggers
│   │   ├── guardrails/   # AI safety layer
│   │   └── main.py       # FastAPI entry point
│   ├── n8n/              # n8n workflow configurations
│   ├── Dockerfile        # Backend container
│   ├── docker-compose.yml # Full stack orchestration
│   └── requirements.txt   # Python dependencies
│
├── mobile/               # Mobile App (React Native/Expo)
│   ├── app/              # Expo Router pages
│   ├── components/       # Reusable UI components
│   ├── services/         # API clients
│   ├── store/            # Zustand state management
│   ├── context/          # LanguageContext (i18n)
│   ├── hooks/            # Custom React hooks
│   └── assets/           # Fonts, images, icons
│
└── .gitignore
```

## Tech Stack

### Backend
| Layer | Technology |
|-------|------------|
| Framework | FastAPI + async/await |
| AI Agents | PydanticAI + LangGraph + Gemini 2.0 Flash |
| Database | Supabase (PostgreSQL + pgvector) |
| Voice | Reverie SDK (22 Indian languages) |
| RAG | Cohere multilingual embeddings |
| Automation | n8n (WhatsApp routing, scheduled jobs) |
| Messaging | Twilio WhatsApp |
| Containerization | Docker + Docker Compose |

### Mobile
| Layer | Technology |
|-------|------------|
| Framework | Expo SDK 54 + React Native |
| Routing | expo-router (file-based) |
| State | Zustand + React Query |
| Animations | react-native-reanimated |
| Styling | NativeWind (Tailwind) |
| i18n | Custom LanguageContext (8 languages) |
| Language | TypeScript |

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- Docker & Docker Compose
- Expo CLI (`npm install -g expo-cli`)

### Backend Setup

```bash
cd mandi_agent

# 1. Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 4. Run with Docker Compose (recommended)
docker compose up -d

# OR run locally
uvicorn backend.main:app --reload --port 8000
```

### Mobile Setup

```bash
cd mobile

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env  # if available
# Edit .env with your API URLs

# 3. Start development server
npx expo start

# 4. Run on device
# - Scan QR code with Expo Go app
# - Or press 'a' for Android emulator, 'i' for iOS simulator
```

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

## Supported Languages (Mobile)

- Hindi (हिंदी)
- Tamil (தமிழ்)
- Telugu (తెలుగు)
- Kannada (ಕನ್ನಡ)
- Marathi (मराठी)
- Bengali (বাংলা)
- Gujarati (ગુજરાતી)
- Malayalam (മലയാളം)

## Development

### Backend

```bash
cd mandi_agent

# Run tests
pytest

# Type checking
mypy mandi_agent/

# Linting
ruff check mandi_agent/
```

### Mobile

```bash
cd mobile

# Type check
npx tsc --noEmit

# Clear cache
npx expo start --clear
```

### Daily Commit Workflow

```bash
# Check changes
git status
git diff

# Stage and commit
git add .
git commit -m "feat: description of changes"

# Push to remote
git push origin main
```

## Environment Variables

### Backend (.env)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude 3.7 for AI agents |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `COHERE_API_KEY` | Multilingual embeddings |
| `BHASHINI_API_KEY` | 22-language voice API |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | WhatsApp sender number |
| `N8N_BASE_URL` | n8n instance URL |
| `REVERIE_API_KEY` | Voice synthesis API key |
| `REVERIE_APP_ID` | Reverie application ID |
| `DATA_GOV_API_KEY` | Agmarknet data.gov.in API |

### Mobile (.env)

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_API_URL` | Backend API endpoint |
| `EXPO_PUBLIC_BHASHINI_API_KEY` | Voice recognition |
| `EXPO_PUBLIC_REVERIE_KEY` | Voice synthesis |
| `EXPO_PUBLIC_REVERIE_APP_ID` | Reverie app ID |

## Supabase Setup

1. Create a Supabase project
2. Enable pgvector: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Run the SQL migration in `mandi_agent/supabase_match_function.sql`

## Docker Services

| Service | Port | URL |
|---------|------|-----|
| Backend API | 8000 | http://localhost:8000 |
| n8n Dashboard | 5678 | http://localhost:5678 |
| n8n MCP | 5678 | http://localhost:5678/mcp-server/http |

## Project Phases

- [x] Phase 1: Project Foundation (schemas, structure)
- [x] Phase 2: Data Sources (Agmarknet, eNAM, IMD, MOSDAC, Fusion)
- [x] Phase 3: RAG Pipeline (embeddings, ingestion, retrieval)
- [x] Phase 4: AI Agents (price prediction, oversupply, spoilage)
- [x] Phase 5: Voice Interface (Reverie integration)
- [x] Phase 6: LangGraph Orchestration (advisory generation)
- [ ] Phase 7: Integration & Testing (In progress)

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and test
3. Commit with conventional messages: `git commit -m "feat: add price alerts"`
4. Push and create a pull request

## License

This project is for SDG 2 Hackathon use.

## Team

Built with by the Mandi Agent team.
