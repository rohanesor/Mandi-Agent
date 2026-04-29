# 🔗 Webhook API Reference

## Base URL
```
https://rohanesor.app.n8n.cloud/webhook
```

---

## 1. Voice Advisory Handler

**Endpoint**: `/advisory/webhook`  
**Method**: `POST`  
**Auth**: Bearer Token (optional)

### Request
```json
{
  "farmer_id": "string (required)",
  "phone": "string (required) - WhatsApp number with country code",
  "language": "string (optional, default: hi)",
  "text_input": "string (optional) - farmer's question",
  "advisory_text": "string (optional) - pre-written advisory",
  "session_id": "string (optional) - for tracking"
}
```

### Languages Supported
- `hi` - Hindi
- `en` - English  
- `kn` - Kannada
- `ta` - Tamil
- `te` - Telugu
- `mr` - Marathi
- `gu` - Gujarati

### Example Request
```bash
curl -X POST https://rohanesor.app.n8n.cloud/webhook/advisory/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "farmer_id": "FARMER_001",
    "phone": "+919876543210",
    "language": "hi",
    "text_input": "मेरे गेहूं की कीमत क्या है?",
    "advisory_text": "आपके गेहूं की कीमत वर्तमान में ₹2150 प्रति क्विंटल है।"
  }'
```

### Response (200 OK)
```json
{
  "success": true,
  "message": "Advisory delivered successfully",
  "farmer_id": "FARMER_001",
  "phone": "+919876543210",
  "audio_url": "https://revery-voice-storage.blob.core.windows.net/...",
  "session_id": "voice_session_abc123",
  "language": "hi",
  "processing_time_ms": 2500
}
```

### Response (400 Bad Request)
```json
{
  "success": false,
  "error": "Missing required field: farmer_id",
  "code": "VALIDATION_ERROR"
}
```

---

## 2. Price Crash Broadcast

**Endpoint**: `/price-crash/broadcast`  
**Method**: `POST`  
**Auth**: API Key (optional)

### Request
```json
{
  "crop": "string (required)",
  "block_id": "string (required) - region/block identifier",
  "current_price": "number (required) - in ₹/quintal",
  "forecast_price": "number (required)",
  "drop_pct": "number (required) - percentage drop",
  "affected_farmer_count": "number (required)",
  "alternative_mandi": "string (optional)",
  "alternative_price": "number (optional)",
  "timestamp": "ISO 8601 (optional)"
}
```

### Example Request
```bash
curl -X POST https://rohanesor.app.n8n.cloud/webhook/price-crash/broadcast \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{
    "crop": "गेहूं",
    "block_id": "HARYANA-JHAJJAR",
    "current_price": 2150,
    "forecast_price": 1950,
    "drop_pct": 9.3,
    "affected_farmer_count": 324,
    "alternative_mandi": "गाजीपुर मंडी",
    "alternative_price": 2300
  }'
```

### Response (200 OK)
```json
{
  "success": true,
  "message": "Price crash broadcast completed",
  "crop": "गेहूं",
  "block_id": "HARYANA-JHAJJAR",
  "current_price": 2150,
  "forecast_price": 1950,
  "drop_pct": 9.3,
  "channels_used": ["telegram", "whatsapp", "voice"],
  "farmers_notified": 324,
  "telegram_message_id": "12345",
  "voice_synthesis_duration_ms": 3200
}
```

---

## 3. Emergency Spoilage Alert

**Endpoint**: `/emergency/spoilage`  
**Method**: `POST`  
**Auth**: Bearer Token (required for critical alerts)

### Request
```json
{
  "farmer_id": "string (required)",
  "farmer_phone": "string (required)",
  "crop": "string (required)",
  "spoilage_pct": "number (required, 0-100)",
  "coordinates": {
    "lat": "number (required)",
    "lng": "number (required)"
  },
  "recommended_action": "string (required)",
  "cold_storage_name": "string (optional)",
  "cold_storage_phone": "string (optional)",
  "distance_km": "number (optional)",
  "available_capacity": "number (optional)",
  "severity": "string (optional, 'critical' | 'high' | 'medium')"
}
```

### Severity Levels
- `critical` - >70% spoilage, immediate action
- `high` - 50-70% spoilage, urgent action  
- `medium` - 30-50% spoilage, plan action

### Example Request
```bash
curl -X POST https://rohanesor.app.n8n.cloud/webhook/emergency/spoilage \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_bearer_token" \
  -d '{
    "farmer_id": "FARMER_002",
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
    "available_capacity": 50,
    "severity": "critical"
  }'
```

### Response (200 OK)
```json
{
  "success": true,
  "message": "Emergency alert broadcast completed",
  "farmer_id": "FARMER_002",
  "crop": "प्याज",
  "spoilage_pct": 65,
  "alerts_sent": {
    "whatsapp_voice": {
      "status": "delivered",
      "timestamp": "2026-04-13T10:30:00Z"
    },
    "whatsapp_text": {
      "status": "delivered",
      "timestamp": "2026-04-13T10:30:01Z"
    },
    "telegram": {
      "status": "posted",
      "message_id": "54321"
    },
    "ops_coordinator": {
      "status": "delivered",
      "timestamp": "2026-04-13T10:30:02Z"
    }
  },
  "action_taken": "तुरंत कोल्ड स्टोरेज भेजें",
  "cold_storage": "SafeFresh Cold Storage",
  "response_time_ms": 4500
}
```

---

## HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Alert delivered |
| 400 | Bad Request | Missing required fields |
| 401 | Unauthorized | Invalid API key/token |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | n8n/Revery API down |
| 503 | Service Unavailable | Temporarily down |

---

## Error Codes

### VALIDATION_ERROR
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Missing required field: crop",
  "field": "crop"
}
```

### REVERY_ERROR
```json
{
  "code": "REVERY_ERROR",
  "message": "Voice synthesis failed",
  "details": "Revery API rate limit exceeded"
}
```

### TWILIO_ERROR
```json
{
  "code": "TWILIO_ERROR",
  "message": "SMS/WhatsApp delivery failed",
  "details": "Invalid phone number format"
}
```

### RATE_LIMIT
```json
{
  "code": "RATE_LIMIT",
  "message": "Too many requests",
  "retry_after_seconds": 60
}
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/advisory/webhook` | 100 req | 1 minute |
| `/price-crash/broadcast` | 50 req | 1 minute |
| `/emergency/spoilage` | 200 req | 1 minute |

---

## Webhook Signatures (Coming Soon)

For enhanced security, webhook requests will include signatures:

```
X-Webhook-Signature: sha256=...
X-Webhook-Timestamp: 2026-04-13T10:30:00Z
X-Webhook-ID: webhook_123
```

Verify signature:
```javascript
const crypto = require('crypto');
const signature = req.headers['x-webhook-signature'];
const timestamp = req.headers['x-webhook-timestamp'];
const secret = process.env.WEBHOOK_SECRET;

const data = `${timestamp}.${JSON.stringify(req.body)}`;
const computed = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(data)
  .digest('hex');

if (computed !== signature) {
  throw new Error('Invalid signature');
}
```

---

## Testing Tools

### Using cURL
Already shown above for each endpoint.

### Using Postman
1. Import this collection: (link to postman.json)
2. Set variables:
   - `base_url` = `https://rohanesor.app.n8n.cloud/webhook`
   - `api_key` = your API key
   - `bearer_token` = your bearer token

### Using JavaScript
See `webhook-client.js` in this repo

---

## Webhook Logs

View execution logs:
1. Go to n8n dashboard
2. Select workflow
3. Click **Executions**
4. Filter by status/date
5. Click execution to see details

---

## Changelog

### v1.0 (April 13, 2026)
- Initial release
- 3 webhook endpoints
- Revery voice integration
- Multi-channel broadcasts

### v1.1 (Coming Soon)
- Webhook signatures
- Rate limit headers
- Batch API for multiple farmers
- Webhook retries

---

**Last Updated**: April 13, 2026  
**API Version**: v1
