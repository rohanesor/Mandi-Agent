# Mandi Agent

> AI-powered agricultural platform empowering Indian smallholder farmers with real-time mandi price prediction, disease detection, virtual cooperatives, and voice advisories in 9+ Indian languages.

---

## 🧠 Architecture

Farmers interact via a mobile app (Expo/React Native) or WhatsApp. The FastAPI backend orchestrates AI agents (PydanticAI + LangGraph + Gemini 2.0) for price forecasting, disease detection, spoilage risk, and advisory generation. Data comes from Agmarknet, eNAM, IMD weather, and ISRO MOSDAC. All state is persisted via Supabase/PostgreSQL + pgvector for RAG.

```
┌──────────────────┐     ┌───────────────┐     ┌─────────────────┐
│  Mobile App      │────▶│  FastAPI      │────▶│  AI Agents       │
│  (Expo/React)    │◀────│  Backend      │◀────│  (LangGraph +    │
│                  │     │               │     │   Gemini 2.0)    │
└──────────────────┘     └───────┬───────┘     └────────┬────────┘
                                 │                      │
                          ┌──────┴──────┐        ┌──────┴──────┐
                          │  Supabase   │        │  RAG Store  │
                          │  (pgvector) │        │  (Cohere)   │
                          └─────────────┘        └─────────────┘
                                 │
                          ┌──────┴────────────────────────┐
                          │  External Data Sources         │
                          │  Agmarknet · eNAM · IMD · MOSDAC│
                          └───────────────────────────────┘
```

---

## ⚙️ Tech Stack

**Backend:**

- Python 3.12 (FastAPI)
- PydanticAI + LangGraph (AI agent orchestration)
- Gemini 2.0 Flash (LLM)
- Supabase / PostgreSQL + pgvector (vector database)
- Cohere embed-multilingual-v3.0 (embeddings)
- n8n (workflow automation)

**Mobile:**

- Expo / React Native
- TypeScript
- AsyncStorage (offline persistence)

**DevOps:**

- Docker + Docker Compose
- GitHub Actions (CI/CD)
- Twilio (WhatsApp messaging)

---

## ✨ Features

### Core AI
- **Price Forecasting** — AI-powered mandi price predictions with RAG-enriched context
- **Disease Detection** — Plant leaf disease identification via Gemini Vision (9 crops, 40+ diseases)
- **Oversupply Detection** — Block-level surplus alerts to prevent price crashes
- **Spoilage Risk** — Crop-specific shelf life and storage advisories

### Farmer Tools
- **Farm Management** — Profile with crop, land size, soil type, irrigation
- **Expense Tracker** — Log inputs (seeds, fertilizer, labor, transport)
- **Marketplace** — Sell directly to buyers with produce listings
- **Yield Estimator** — AI-based harvest quantity predictions
- **Market Demand** — Real-time demand signals per crop per mandi
- **Pest Alerts** — Seasonal pest warnings by region
- **Soil Health** — Soil type guidance and treatment recommendations
- **FPO Dashboard** — Cooperative bundle tracking and group selling

### Communication
- **Voice Advisories** — WhatsApp voice messages in 9+ Indian languages
- **Multi-language UI** — App available in English, Hindi, Marathi, Tamil, Telugu, Bengali, Kannada, Malayalam, Punjabi

---

## 📊 Performance

| Metric | Value |
| --- | --- |
| Languages Supported | 9 (mobile) + 22 (voice) |
| Crops Covered | 9 (tomato, potato, corn, apple, grape, rice, wheat, cotton, onion) |
| Diseases Detectable | 40+ |
| Data Sources | 5 (Agmarknet, eNAM, IMD, MOSDAC, Open-Meteo) |
| AI Agents | 8+ (price, disease, spoilage, oversupply, advisory, etc.) |
| n8n Workflows | 10+ automated pipelines |

---

## ⚖️ Trade-offs & Design Decisions

- **Gemini 2.0 Flash over Claude** → faster response, lower cost, built-in vision for disease detection
- **Supabase over self-hosted Postgres** → managed service reduces DevOps overhead
- **pgvector over Pinecone/Weaviate** → co-locates vector search with transactional data
- **AsyncStorage over cloud sync** → works offline in rural areas with poor connectivity
- **n8n over custom cron jobs** → visual workflow builder enables non-technical ops staff

---

## 🧪 Testing & Benchmarking

```bash
cd mandi_agent

# Run unit tests
pytest

# Run disease detection benchmark
python scripts/setup_benchmark.py
```

Benchmark downloads real images from the PlantVillage dataset (54k images) and evaluates detection accuracy across crops and disease classes.

---

## 🐳 Docker Setup

```bash
cd mandi_agent
docker compose up -d

# Backend: http://localhost:8000/api/health
# n8n:     http://localhost:5678
```

---

## 📁 Folder Structure

```
├── mobile/                 # Farmer-facing app (Expo/React Native)
│   ├── app/                # Expo router pages
│   ├── components/         # UI components (FarmCards, LanguagePicker, etc.)
│   ├── constants/          # Translations, theme, config
│   └── utils/              # Helpers (storage, fetch, i18n)
│
├── mandi_agent/            # Backend & Automation
│   ├── backend/
│   │   ├── agents/         # AI agents (price, disease, spoilage, etc.)
│   │   ├── data_sources/   # Agmarknet, eNAM, IMD, MOSDAC connectors
│   │   ├── rag/            # Embeddings, ingestion, retrieval
│   │   ├── orchestrator/   # LangGraph workflow
│   │   ├── api/            # FastAPI routes & schemas
│   │   ├── main.py         # FastAPI app entry
│   │   └── guardrails.py   # AI safety
│   ├── scripts/            # Benchmark setup, data tools
│   ├── tests/              # Unit & integration tests
│   ├── n8n/                # Workflow configurations
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── .github/workflows/      # CI/CD (lint, test, Docker build)
└── README.md
```

---

## ⚙️ Quick Start

### Backend

```bash
git clone https://github.com/rohanesor/Mandi-Agent.git
cd Mandi-Agent/mandi_agent

python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt

cp .env.example .env  # Edit with your API keys
docker compose up -d
```

### Mobile App

```bash
cd Mandi-Agent/mobile
npm install
npx expo start
```

---

## 🔄 CI/CD

- **GitHub Actions** — lint + test on every push, Docker build on merge
- **Docker Image** — auto-published to GitHub Container Registry

---

## 🔮 Roadmap

- [ ] OTP-based phone authentication
- [ ] Offline mode with background sync
- [ ] Farmer feedback loop for model fine-tuning
- [ ] Government scheme eligibility matching
- [ ] Cold storage marketplace integration
- [ ] Multi-region Supabase deployment
- [ ] Full PlantVillage benchmark with accuracy metrics

---

## 🤝 Contributing

Pull requests are welcome. For major changes, open an issue first.

