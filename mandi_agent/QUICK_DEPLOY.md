# ⚡ 5-Minute Quick Deploy Guide

Your **Telegram Bot Token is configured**. Now let's import the 3 workflows. This takes ~5 minutes total.

---

## Step-by-Step Import

### 1️⃣ Open n8n Dashboard
Go to: **https://rohanesor.app.n8n.cloud**

### 2️⃣ Import Workflow #1: Voice Advisory Handler

**Path**: Workflows → Import from File

**File to upload**: 
```
d:\ktr\mandi_agent\n8n\workflows\webhook-revery-voice-handler.json
```

**Steps**:
- Click "Import" button
- Select the file above
- Click "Import"
- Click "Activate" (green toggle)
- ✅ Done! Copy the webhook URL

### 3️⃣ Import Workflow #2: Price Crash Broadcast

**File to upload**:
```
d:\ktr\mandi_agent\n8n\workflows\webhook-price-crash-broadcast.json
```

**Steps**:
- Click "Import" button
- Select the file above
- Click "Import"
- Click "Activate" (green toggle)
- ✅ Done! Copy the webhook URL

### 4️⃣ Import Workflow #3: Emergency Spoilage Alert

**File to upload**:
```
d:\ktr\mandi_agent\n8n\workflows\webhook-emergency-spoilage.json
```

**Steps**:
- Click "Import" button
- Select the file above
- Click "Import"
- Click "Activate" (green toggle)
- ✅ Done! Copy the webhook URL

---

## 🔐 Configure Credentials (If Not Auto-Configured)

Your n8n should auto-detect most credentials. But if any are missing:

### Twilio
- Settings → Credentials → New
- Type: **Twilio**
- Account SID: `YOUR_TWILIO_ACCOUNT_SID`
- Auth Token: `YOUR_TWILIO_AUTH_TOKEN`
- Save as: `twilio-creds`

### Telegram
- Settings → Credentials → New
- Type: **Telegram**
- Bot Token: `8619736609:AAElz99WifGd2b5rYodtRJ-NmUbqoPC08tg`
- Save as: `telegram-creds`

### Google Sheets
- Settings → Credentials → New
- Type: **Google Sheets API**
- Click "Sign in with Google"
- Grant permissions
- Save as: `google-sheets-creds`

### Supabase
- Settings → Credentials → New
- Type: **HTTP Header Auth**
- Headers: `Authorization: Bearer sb_publishable_SoYijOr2vGIYPWQC221nww_cIu5IKQq`
- Save as: `supabase-creds`

---

## ✅ Test Webhooks

Once all 3 are imported and activated:

### Test 1: Voice Advisory
```bash
curl -X POST https://rohanesor.app.n8n.cloud/webhook/advisory/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "farmer_id": "TEST_001",
    "phone": "+919876543210",
    "language": "hi",
    "advisory_text": "आपके गेहूं की कीमत ₹2150 है"
  }'
```

**Expected**: Voice message sent, Google Sheets updated

### Test 2: Price Crash
```bash
curl -X POST https://rohanesor.app.n8n.cloud/webhook/price-crash/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "crop": "गेहूं",
    "block_id": "HARYANA-JHAJJAR",
    "current_price": 2150,
    "forecast_price": 1950,
    "drop_pct": 9.3,
    "affected_farmer_count": 324
  }'
```

**Expected**: Telegram broadcast + voice alert + ops SMS

### Test 3: Emergency
```bash
curl -X POST https://rohanesor.app.n8n.cloud/webhook/emergency/spoilage \
  -H "Content-Type: application/json" \
  -d '{
    "farmer_id": "TEST_002",
    "farmer_phone": "+919876543210",
    "crop": "प्याज",
    "spoilage_pct": 65,
    "coordinates": {"lat": 28.7041, "lng": 77.1025},
    "recommended_action": "तुरंत कोल्ड स्टोरेज भेजें",
    "cold_storage_name": "SafeFresh"
  }'
```

**Expected**: Voice call + text + Telegram + ops alert

---

## ⏱️ Timeline

| Step | Time | Action |
|------|------|--------|
| 1 | 1 min | Open n8n |
| 2 | 1 min | Import workflow 1 |
| 3 | 1 min | Import workflow 2 |
| 4 | 1 min | Import workflow 3 |
| 5 | 1 min | Activate all 3 |
| **Total** | **~5 min** | **All done!** |

---

## 🎯 What You'll See

✅ 3 workflows active in your n8n dashboard  
✅ Webhook URLs ready to use  
✅ All credentials configured  
✅ Telegram group receiving broadcasts  
✅ Google Sheets logging all interactions  

---

## ✨ Done!

After these 5 minutes, your farmer-friendly webhook system will be **100% operational**!

Next: Start testing with real farmers.
