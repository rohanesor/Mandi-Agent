# n8n Workflows — Mandi-Agent Automation Layer

This directory contains the n8n automation workflows that connect the Mandi-Agent backend to external services (WhatsApp, Telegram, Google Sheets, Supabase, etc.).

## Directory Structure

```
n8n/
├── README.md              ← This file
├── workflows/             ← Importable JSON workflow definitions (n8n UI)
│   ├── harvest_alerts_daily.json
│   ├── weather_alerts_daily.json
│   ├── whatsapp_advisory_loop.json
│   ├── price_crash_broadcast.json
│   ├── spoilage_emergency.json
│   ├── bundle_notification.json
│   ├── fpo_weekly_digest.json
│   ├── scheme_eligibility.json
│   ├── agri_news_alerts.json
│   ├── truck_booking.json
│   ├── webhook-emergency-spoilage.json
│   ├── webhook-price-crash-broadcast.json
│   └── webhook-revery-voice-handler.json
└── sdk_output/            ← SDK-format JS exports (generated, read-only reference)
    ├── Daily_Harvest_Alerts.js
    ├── Daily_Weather_Alerts.js
    ├── WhatsApp_Advisory_Loop.js
    ├── Price_Crash_Broadcast.js
    ├── Spoilage_Emergency.js
    ├── Bundle_Notification.js
    ├── FPO_Weekly_Digest.js
    ├── Scheme_Eligibility_Check.js
    ├── Mandi-Agent___Agricultural_News_Alerts.js
    ├── daily_news_digest.js
    ├── Custom_Webhook_-_Emergency_Spoilage_Alert.js
    ├── Custom_Webhook_-_Price_Crash_Broadcast.js
    └── Custom_Webhook_-_Revery_Voice_Advisory_Handler.js
```

## Workflow Inventory

### Scheduled (Cron-triggered)

| Workflow | Schedule | What it does |
|----------|----------|-------------|
| **Daily Harvest Alerts** | 6:00 AM IST | Calls `/api/harvest-alerts-due`, generates advisories, sends WhatsApp voice notes |
| **Daily Weather Alerts** | 5:00 AM IST | Checks weather alerts, triggers push notifications if severity warrants |
| **FPO Weekly Digest** | Monday 8:00 AM IST | Fetches stats per FPO → logs to Supabase → Notion report → email → Slack |
| **Agricultural News Alerts** | Every 30 min | Scrapes `/api/news`, filters by urgency, sends emergency WhatsApp or queues for digest |
| **Daily News Digest** | 6:00 AM IST | Reads queued news → groups by farmer language → translates → sends WhatsApp digest |

### Webhook-triggered (event-driven)

| Workflow | Trigger path | What it does |
|----------|-------------|-------------|
| **WhatsApp Advisory Loop** | `POST /whatsapp-inbound` | Receives Twilio inbound → generates advisory → replies with voice → logs session |
| **Price Crash Broadcast** | `POST /price-crash` | Drop > 25% → Telegram + Slack; > 40% → recalculate harvest intents |
| **Spoilage Emergency** | `POST /spoilage-emergency` | Spoilage > 65% → emergency WhatsApp + cold storage lookup + booking |
| **Bundle Notification** | `POST /bundle-formed` | Translates per farmer → WhatsApp → Supabase → Google Sheets → Porter truck booking |
| **Scheme Eligibility** | `POST /scheme-check` | PM-KISAN + PMFBY eligibility → translate → WhatsApp advisory |
| **Emergency Spoilage Alert** | `POST /emergency/spoilage` | Spoilage > 50% → voice alert + text + Telegram + Supabase log |
| **Price Crash Broadcast (v2)** | `POST /price-crash/broadcast` | Voice alert + Telegram + Ops coordinator + Google Sheets + Supabase log |
| **Reverie Voice Handler** | `POST /advisory/webhook` | Input validation → TTS synthesis → Twilio delivery → Google Sheets + Supabase log |

## Backend API Endpoints Used

All workflows call the FastAPI backend at `http://backend:8000`:

| Endpoint | Used by |
|----------|---------|
| `GET /api/harvest-alerts-due` | Daily Harvest Alerts |
| `POST /api/advisory` | Daily Harvest Alerts, WhatsApp Advisory Loop |
| `POST /api/weather/alerts/check` | Daily Weather Alerts |
| `POST /api/news/notify` | Daily Weather Alerts |
| `GET /api/news` | Agricultural News Alerts |
| `GET /api/fpo/list` | FPO Weekly Digest |
| `GET /api/fpo/weekly-stats` | FPO Weekly Digest |
| `POST /api/fpo/report` | FPO Weekly Digest |
| `POST /api/translate` | Bundle Notification, Scheme Eligibility, Daily News Digest |
| `POST /api/tts/synthesize` | Voice Handler, Emergency Spoilage, Price Crash |
| `POST /api/harvest-intent/recalculate` | Price Crash Broadcast |
| `POST /api/log/advisory` | WhatsApp Advisory Loop |
| `POST /api/log/voice-session` | WhatsApp Advisory Loop |
| `GET /api/cold-storage/nearest` | Spoilage Emergency |
| `POST /api/cold-storage/book` | Spoilage Emergency |

## External Services

| Service | Purpose |
|---------|---------|
| **Twilio** | WhatsApp messaging (voice notes + text) |
| **Telegram** | Block-level farmer group broadcasts |
| **Google Sheets** | Audit logs, transport manifests, news digest queue |
| **Supabase** | Primary database (bundles, events, sessions) |
| **Notion** | FPO weekly report pages |
| **Gmail** | FPO coordinator digest emails |
| **Slack** | `#mandi-ops` channel alerts |
| **Porter API** | Truck booking for cooperative bundles |
| **Reverie** | TTS voice synthesis + NMT translation |

## Environment Variables Required

```
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
OPS_COORDINATOR_WHATSAPP=+91...
TELEGRAM_BLOCK_GROUP_ID=...
GOOGLE_SHEET_ID=...
GOOGLE_SHEETS_BUNDLE_ID=...
NOTION_FPO_REPORTS_PAGE_ID=...
SLACK_WEBHOOK_URL=...
PORTER_API_URL=...
REVERIE_API_KEY=...
REVERIE_APP_ID=...
```

## How to Import

1. Open your n8n instance
2. Go to **Workflows → Import from File**
3. Select any `.json` file from the `workflows/` directory
4. Configure credentials for Twilio, Google Sheets, Supabase, etc.
5. Activate the workflow

The `sdk_output/` files are generated JS representations — they are for **reference only** and cannot be imported directly into n8n.
