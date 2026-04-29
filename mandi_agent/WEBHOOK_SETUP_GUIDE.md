# 🌾 Farmer-Friendly Webhook Setup Guide

## Overview
This guide walks you through setting up custom webhooks for your mandi_agent farmer platform with Revery voice advisories, Telegram broadcasts, and multi-channel notifications.

---

## 📋 Quick Setup Checklist

- [x] Environment variables configured in `.env`
- [x] Webhook workflows created in n8n
- [ ] Telegram Bot Token added
- [ ] Google Sheets connected
- [ ] n8n Credentials configured
- [ ] Webhooks deployed and tested

---

## 1️⃣ Environment Variables Setup

Your `.env` file is already configured with:

```bash
# Voice (Revery)
REVERIE_APP_ID=com.rohanjml07
REVERIE_API_KEY=0a1b9d93b10c4bf1f129896347b42c98eebed041
REVERIE_ENDPOINT=https://api.reverieinc.com/v2
REVERIE_VOICE_LANG=hi
REVERIE_VOICE_GENDER=female

# Twilio
TWILIO_WHATSAPP_FROM=+12602613264

# Ops Coordinator
OPS_COORDINATOR_WHATSAPP=+916380221196

# Telegram
TELEGRAM_BOT_TOKEN=<NEEDED>
TELEGRAM_BLOCK_GROUP_ID=-1005258970621

# Google Sheets
GOOGLE_SHEET_ID=1WHcF43JBJiRXHs0i4SdrhhBrEr7xehfXUgopqstiV8U
```

### Missing: Telegram Bot Token
1. Go to [@BotFather](https://t.me/botfather) on Telegram
2. Create a new bot with `/newbot`
3. Copy the token and add to `.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=your_token_here
   ```

---

## 2️⃣ Webhook Deployments

### Webhook 1: Voice Advisory Handler
**Path**: `/webhook/advisory/webhook`  
**Method**: POST

**Request Body**:
```json
{
  "farmer_id": "F001",
  "phone": "+919876543210",
  "language": "hi",
  "text_input": "क्या मेरे गेहूं की कीमत गिरने वाली है?",
  "advisory_text": "आपके गेहूं की कीमत अगले सप्ताह स्थिर रहेगी..."
}
```

**Response**:
```json
{
  "success": true,
  "message": "Advisory delivered successfully",
  "farmer_id": "F001",
  "audio_url": "https://...",
  "session_id": "session_123",
  "language": "hi"
}
```

**Features**:
- ✅ Revery voice synthesis in Hindi/English
- ✅ Auto-sends via WhatsApp
- ✅ Logs to Google Sheets
- ✅ Stores session in Supabase

---

### Webhook 2: Price Crash Broadcast
**Path**: `/webhook/price-crash/broadcast`  
**Method**: POST

**Request Body**:
```json
{
  "crop": "गेहूं",
  "block_id": "HARYANA-JHAJJAR",
  "current_price": 2150,
  "forecast_price": 1950,
  "drop_pct": 9.3,
  "affected_farmer_count": 324,
  "alternative_mandi": "गाजीपुर मंडी",
  "alternative_price": 2300
}
```

**Response**:
```json
{
  "success": true,
  "message": "Price crash broadcast completed",
  "crop": "गेहूं",
  "block_id": "HARYANA-JHAJJAR",
  "drop_pct": 9.3,
  "channels_used": ["telegram", "whatsapp", "voice"],
  "farmers_notified": 324
}
```

**Features**:
- ✅ Revery voice alert in Hindi
- ✅ Telegram broadcast to farmer group
- ✅ WhatsApp alert to Ops Coordinator
- ✅ Logs to Google Sheets + Supabase

---

### Webhook 3: Emergency Spoilage Alert
**Path**: `/webhook/emergency/spoilage`  
**Method**: POST

**Request Body**:
```json
{
  "farmer_id": "F001",
  "farmer_phone": "+919876543210",
  "crop": "प्याज",
  "spoilage_pct": 65,
  "coordinates": {
    "lat": 28.7041,
    "lng": 77.1025
  },
  "recommended_action": "तुरंत कोल्ड स्टोरेज भेजें",
  "cold_storage_name": "SafeFresh Cold Storage",
  "cold_storage_phone": "+919876543212",
  "distance_km": 12,
  "available_capacity": 50
}
```

**Response**:
```json
{
  "success": true,
  "message": "Emergency alert broadcast completed",
  "farmer_id": "F001",
  "crop": "प्याज",
  "spoilage_pct": 65,
  "alerts_sent": ["voice_whatsapp", "text_whatsapp", "telegram", "ops_coordinator"],
  "action_taken": "तुरंत कोल्ड स्टोरेज भेजें",
  "cold_storage": "SafeFresh Cold Storage"
}
```

**Features**:
- ✅ Immediate Revery voice alert
- ✅ Action text with cold storage details
- ✅ Telegram emergency broadcast
- ✅ Ops coordinator alert
- ✅ Real-time tracking

---

## 3️⃣ n8n Configuration Steps

### Step 1: Import Workflows
1. Open your n8n instance: `https://rohanesor.app.n8n.cloud`
2. Go to **Workflows** → **Import**
3. Upload these JSON files:
   - `webhook-revery-voice-handler.json`
   - `webhook-price-crash-broadcast.json`
   - `webhook-emergency-spoilage.json`

### Step 2: Configure Credentials

#### Twilio API
1. Go to **Settings** → **Credentials** → **New Credential**
2. Type: **Twilio**
3. Account SID: `YOUR_TWILIO_ACCOUNT_SID`
4. Auth Token: `YOUR_TWILIO_AUTH_TOKEN`
5. Save as `twilio-creds`

#### Telegram Bot
1. Type: **Telegram**
2. Bot Token: (from BotFather)
3. Save as `telegram-creds`

#### Google Sheets
1. Type: **Google Sheets API**
2. Use OAuth 2.0 to authorize your Google account
3. Save as `google-sheets-creds`

#### Supabase
1. Type: **HTTP Header Auth**
2. Headers: `Authorization: Bearer <SUPABASE_SERVICE_KEY>`
3. Save as `supabase-creds`

### Step 3: Activate & Test

For each workflow:
1. Click **Activate** (toggle switch)
2. Copy the webhook URL
3. Test with curl:

```bash
# Test voice advisory webhook
curl -X POST https://rohanesor.app.n8n.cloud/webhook/advisory/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "farmer_id": "TEST001",
    "phone": "+919876543210",
    "language": "hi",
    "text_input": "मेरी फसल की कीमत?",
    "advisory_text": "आपकी फसल की कीमत ठीक है..."
  }'
```

---

## 4️⃣ Google Sheets Setup

Your Google Sheet has these tabs (auto-created):

### Tab 1: Advisories
| farmer_id | phone | text_input | advisory_text | language | timestamp | status |
|-----------|-------|-----------|---------------|----------|-----------|--------|
| F001 | +919876543210 | क्या मेरे गेहूं की कीमत... | आपके गेहूं की... | hi | 2026-04-13T10:30:00Z | completed |

### Tab 2: Price Crashes
| block_id | crop | current_price | forecast_price | drop_pct | affected_farmers | alternative_mandi | alternative_price | timestamp |
|----------|------|--------------|----------------|----------|-----------------|-------------------|-------------------|-----------|
| HARYANA-JHAJJAR | गेहूं | 2150 | 1950 | 9.3 | 324 | गाजीपुर | 2300 | 2026-04-13T10:30:00Z |

### Tab 3: Emergencies
| timestamp | farmer_id | crop | spoilage_pct | action | cold_storage | alerts_sent | status |
|-----------|-----------|------|-------------|--------|--------------|-------------|--------|
| 2026-04-13T10:30:00Z | F001 | प्याज | 65 | कोल्ड स्टोरेज भेजें | SafeFresh | VOICE+TEXT+TELEGRAM | active |

### Tab 4: FPO Reports
For future government scheme eligibility data

---

## 5️⃣ Testing Your Webhooks

### Test 1: Voice Advisory
```bash
curl -X POST https://rohanesor.app.n8n.cloud/webhook/advisory/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "farmer_id": "TEST_F001",
    "phone": "+919876543210",
    "language": "hi",
    "text_input": "नमस्ते, मेरे गेहूं की कीमत क्या है?",
    "advisory_text": "आपके गेहूं की कीमत वर्तमान में ₹2150 प्रति क्विंटल है जो बाजार में अच्छी है।"
  }'
```

**Expected**: 
- WhatsApp voice message sent to farmer
- SMS confirmation to Ops Coordinator
- Entry logged in Google Sheets
- Session recorded in Supabase

### Test 2: Price Crash Alert
```bash
curl -X POST https://rohanesor.app.n8n.cloud/webhook/price-crash/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "crop": "गेहूं",
    "block_id": "HARYANA-JHAJJAR",
    "current_price": 2150,
    "forecast_price": 1950,
    "drop_pct": 9.3,
    "affected_farmer_count": 324,
    "alternative_mandi": "गाजीपुर",
    "alternative_price": 2300
  }'
```

**Expected**:
- Telegram message in farmer group
- WhatsApp voice alert from Revery
- SMS to Ops Coordinator
- Logged in Google Sheets

### Test 3: Emergency Alert
```bash
curl -X POST https://rohanesor.app.n8n.cloud/webhook/emergency/spoilage \
  -H "Content-Type: application/json" \
  -d '{
    "farmer_id": "TEST_F002",
    "farmer_phone": "+919876543210",
    "crop": "प्याज",
    "spoilage_pct": 65,
    "coordinates": {"lat": 28.7041, "lng": 77.1025},
    "recommended_action": "तुरंत कोल्ड स्टोरेज भेजें",
    "cold_storage_name": "SafeFresh",
    "cold_storage_phone": "+919876543212",
    "distance_km": 12,
    "available_capacity": 50
  }'
```

**Expected**:
- Immediate voice alert to farmer
- Emergency text with cold storage details
- Telegram broadcast
- Ops alert
- Full emergency tracking

---

## 6️⃣ Production Deployment

### Step 1: Environment Variables
Add to your production `.env`:
```bash
N8N_WEBHOOK_BEARER_TOKEN=super_secure_token_here
N8N_WEBHOOK_API_KEY=super_secure_api_key_here
```

### Step 2: Webhook Authentication
Update each webhook node to require auth:
```json
{
  "authentication": "bearerToken",
  "bearerToken": "{{ $env.N8N_WEBHOOK_BEARER_TOKEN }}"
}
```

### Step 3: Rate Limiting
Add to Telegram/Twilio nodes:
```json
{
  "rateLimit": {
    "maxRequests": 100,
    "windowMs": 60000
  }
}
```

### Step 4: Error Handling
All workflows include error handlers that notify Ops:
```json
{
  "errorHandler": {
    "type": "whatsapp",
    "to": "{{ $env.OPS_COORDINATOR_WHATSAPP }}",
    "message": "🚨 Webhook error in {{ $workflow.name }}: {{ $error.message }}"
  }
}
```

---

## 7️⃣ Monitoring & Logging

### Check Execution Logs
1. In n8n, click **Executions** on each workflow
2. View success/failure stats
3. Debug failed runs

### Monitor Alerts
- **Telegram**: Watch `-1005258970621` group for all broadcasts
- **Google Sheets**: Track all farmer interactions
- **Supabase**: Query `voice_sessions`, `price_crash_events`, `emergency_events` tables

### Revery Voice Stats
Track usage via Revery dashboard:
- Characters synthesized
- Languages used
- Response times

---

## 🔧 Troubleshooting

### Issue: "Revery API Error"
- Check API key in `.env`
- Verify `REVERIE_ENDPOINT` is correct
- Check Revery account has voice credits

### Issue: "Telegram bot not responding"
- Verify bot token in credentials
- Ensure bot is added to group
- Check group ID format: `-1005258970621`

### Issue: "Google Sheets not logging"
- Verify sheet ID in `.env`
- Check OAuth credentials are active
- Ensure tab names match exactly

### Issue: "Twilio SMS not sending"
- Verify Account SID and Auth Token
- Check phone numbers have country codes
- Ensure number is WhatsApp-enabled

---

## 📞 Support & Escalation

**For Farmers**:
- WhatsApp: +12602613264
- Telegram: @mandi_agent_bot

**For Ops Coordinator**:
- WhatsApp: +916380221196

**For Technical Issues**:
- Check n8n logs: Settings → Logs
- Review webhook execution history
- Contact n8n support

---

## 🎯 Next Steps

1. ✅ Complete Telegram Bot setup
2. ✅ Test all three webhooks
3. ✅ Monitor first 100 alerts
4. ✅ Gather farmer feedback
5. ✅ Adjust Revery voice settings if needed
6. ✅ Scale to full farmer base

---

**Last Updated**: April 13, 2026  
**Version**: 1.0
