# Mandi Agent

> AI-powered agricultural platform empowering Indian smallholder farmers with real-time mandi price prediction, virtual cooperatives, and voice advisories in 22 Indian languages.

---

## 🌐 Live Demo

> _Deploying soon — backend runs locally via Docker Compose_

---

## 🎥 Demo Video

> _To be added_

---

## 🧠 Architecture

**Overview:**

Farmers interact via the React Native mobile app or WhatsApp. Voice/text requests are routed through n8n automation to the FastAPI backend, where AI agents (PydanticAI + LangGraph + Gemini 2.0) process the intent. The backend fetches live mandi data from Agmarknet/eNAM, enriches it with weather (IMD, ISRO MOSDAC), and queries the RAG pipeline (Supabase pgvector + Cohere embeddings) for contextual advisories. Responses are delivered back via WhatsApp voice (Reverie SDK) or mobile push notifications.

```
┌────────────┐     ┌──────────┐     ┌───────────────┐     ┌─────────────────┐
│  Farmer    │────▶│  n8n /   │────▶│  FastAPI      │────▶│  AI Agents       │
│  (App /    │◀────│  Twilio  │◀────│  Backend      │◀────│  (LangGraph +    │
│  WhatsApp) │     │  Reverie │     │               │     │   Gemini 2.0)    │
└────────────┘     └──────────┘     └───────┬───────┘     └────────┬────────┘
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

* Python 3.12 (FastAPI)
* PydanticAI + LangGraph (AI agent orchestration)
* Gemini 2.0 Flash (LLM)
* Supabase / PostgreSQL + pgvector (vector database)
* Cohere embed-multilingual-v3.0 (embeddings)
* Reverie SDK (22-language voice synthesis)
* n8n (workflow automation)

**Frontend:**

* Expo SDK 54 / React Native
* TypeScript
* Zustand + React Query (state management)
* NativeWind (Tailwind styling)

**DevOps:**

* Docker + Docker Compose
* Twilio (WhatsApp messaging)

---

## ✨ Features

* AI-powered mandi price forecasting with RAG-enriched context
* Virtual cooperatives — bundle produce across farmers to reach full truckloads
* Voice advisories in 22 Indian languages via WhatsApp
* Multi-language mobile app (Hindi, Tamil, Telugu, Kannada, Marathi, Bengali, Gujarati, Malayalam)
* Oversupply detection & spoilage risk alerts
* Real-time data from Agmarknet, eNAM, IMD weather, ISRO MOSDAC
* n8n-powered automation for scheduled broadcasts and emergency alerts

---

## 📊 Performance Metrics

| Metric | Value |
| --- | --- |
| Languages Supported | 22 (voice) / 8 (UI) |
| Data Sources | 5 (Agmarknet, eNAM, IMD, MOSDAC, Fusion) |
| AI Agents | 8+ (price, spoilage, oversupply, advisory, negotiation, etc.) |
| n8n Workflows | 10+ automated pipelines |

---

## ⚖️ Trade-offs & Design Decisions

* Gemini 2.0 Flash over Claude → faster response, lower cost, adequate quality for agricultural domain
* Supabase over self-hosted Postgres → managed service reduces DevOps overhead
* pgvector over Pinecone/Weaviate → co-locates vector search with transactional data
* n8n over custom cron jobs → visual workflow builder enables non-technical ops staff
* React Native over Flutter → Expo ecosystem, OTA updates, easier hot reload

---

## 🧪 Testing

* Unit tests using pytest

```bash
cd mandi_agent
pytest
```

---

## 🐳 Docker Setup

```bash
cd mandi_agent
docker compose up -d

# Backend: http://localhost:8000/api/health
# n8n:     http://localhost:5678
```

---

## 🔄 CI/CD Pipeline

* _Planned: GitHub Actions — lint + test on every push, Docker build on merge_

---

## ⚙️ Installation & Setup

### Backend

```bash
git clone https://github.com/rohanesor/Mandi-Agent.git
cd Mandi-Agent/mandi_agent

# Virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run (Docker recommended)
docker compose up -d

# Or locally
uvicorn backend.main:app --reload --port 8000
```

### Mobile

```bash
cd mobile

npm install
npx expo start
```

---

## 📁 Folder Structure

```
├── mandi_agent/          # Backend
│   ├── backend/
│   │   ├── agents/       # AI agents (price, spoilage, oversupply, etc.)
│   │   ├── data_sources/ # Agmarknet, eNAM, IMD, MOSDAC connectors
│   │   ├── rag/          # Embeddings, ingestion, retrieval
│   │   ├── orchestrator/ # LangGraph workflow
│   │   ├── voice/        # Reverie + Bhashini
│   │   ├── automations/  # n8n triggers
│   │   ├── guardrails/   # AI safety
│   │   └── main.py
│   ├── n8n/              # Workflow configurations
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── requirements.txt
│
├── mobile/               # React Native app
│   ├── app/              # Expo Router pages
│   ├── components/       # Reusable UI
│   ├── services/         # API clients
│   ├── store/            # Zustand state
│   ├── context/          # LanguageContext (i18n)
│   └── assets/
│
└── README.md
```

---

## 🔮 Future Improvements

* User authentication (OTP-based phone login)
* Offline mode with SQLite sync
* Multi-region Supabase deployment
* Farmer feedback loop for model fine-tuning
* Government scheme eligibility matching
* Cold storage marketplace integration

---

## 🤝 Contributing

Pull requests are welcome. For major changes, open an issue first.

---

## 📜 License

This project is for SDG 2 Hackathon use.
