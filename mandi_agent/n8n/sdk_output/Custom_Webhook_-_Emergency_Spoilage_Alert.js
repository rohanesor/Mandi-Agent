import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const webhookEmergencySpoilageAlert = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 1,
  config: {
  "name": "Webhook: Emergency Spoilage Alert",
  "position": [
    100,
    300
  ],
  "parameters": {
    "httpMethod": "POST",
    "path": "emergency/spoilage",
    "responseMode": "lastNode",
    "options": {}
  }
},
  output: [{}]
});

const ifSpoilage50 = ifElse({
  version: 1,
  config: {
  "name": "If Spoilage > 50%",
  "position": [
    300,
    300
  ],
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict"
      },
      "conditions": [
        {
          "id": "check-spoilage-critical",
          "leftValue": "={{ $json.spoilage_pct }}",
          "rightValue": 50,
          "operator": {
            "type": "boolean",
            "operation": "gt"
          }
        }
      ],
      "combinator": "and"
    },
    "options": {}
  }
}
});

const reveryGenerateEmergencyVoiceAlert = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Revery: Generate Emergency Voice Alert",
  "position": [
    550,
    150
  ],
  "parameters": {
    "url": "http://backend:8000/api/tts/synthesize",
    "method": "POST",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "httpHeaderAuth",
    "headers": {
      "Authorization": "Bearer {{ $env.REVERIE_API_KEY }}",
      "Content-Type": "application/json"
    },
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "app_id",
          "value": "={{ $env.REVERIE_APP_ID }}"
        },
        {
          "name": "text",
          "value": "खेतिहर भाई! आपके {{ $json.crop }} में {{ $json.spoilage_pct }}% की सड़न देखी गई है। यह बहुत गंभीर है। कृपया तुरंत {{ $json.recommended_action }} लें। आपके पास सीमित समय है।"
        },
        {
          "name": "language",
          "value": "hi"
        },
        {
          "name": "voice_config",
          "value": "={\"gender\": \"female\", \"speed\": 0.9, \"urgency\": true}"
        }
      ]
    },
    "options": {
      "timeout": 30000
    }
  }
},
  output: [{}]
});

const twilioSendEmergencyVoiceAlert = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Twilio: Send Emergency Voice Alert",
  "position": [
    550,
    350
  ],
  "parameters": {
    "resource": "media",
    "channel": "whatsapp",
    "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
    "to": "=whatsapp:{{ $json.farmer_phone }}",
    "messageType": "audio",
    "mediaUrl": "={{ $json.audio_url }}",
    "options": {}
  }
},
  output: [{}]
});

const twilioSendActionText = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Twilio: Send Action Text",
  "position": [
    800,
    350
  ],
  "parameters": {
    "resource": "media",
    "channel": "whatsapp",
    "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
    "to": "=whatsapp:{{ $json.farmer_phone }}",
    "messageType": "text",
    "text": "🚨 EMERGENCY - {{ $json.crop }} Spoilage Alert\n\nSpoilage: {{ $json.spoilage_pct }}%\n\nAction: {{ $json.recommended_action }}\n\n📍 Cold Storage: {{ $json.cold_storage_name }}\nDistance: {{ $json.distance_km }} km\nCapacity: {{ $json.available_capacity }} MT\n\nContact: {{ $json.cold_storage_phone }}",
    "options": {}
  }
},
  output: [{}]
});

const twilioAlertOpsEmergency = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Twilio: Alert Ops (Emergency)",
  "position": [
    1050,
    500
  ],
  "parameters": {
    "resource": "media",
    "channel": "whatsapp",
    "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
    "to": "=whatsapp:{{ $env.OPS_COORDINATOR_WHATSAPP }}",
    "messageType": "text",
    "text": "🚨 CRITICAL SPOILAGE - Immediate Action Required\n\nFarmer: {{ $json.farmer_id }}\nCrop: {{ $json.crop }}\nSpoilage: {{ $json.spoilage_pct }}%\n\nAction Taken: {{ $json.recommended_action }}\nCold Storage: {{ $json.cold_storage_name }}\n\nFarmer Location: {{ $json.coordinates.lat }}, {{ $json.coordinates.lng }}",
    "options": {}
  }
},
  output: [{}]
});

const telegramEmergencyBroadcast = node({
  type: 'n8n-nodes-base.telegram',
  version: 1,
  config: {
  "name": "Telegram: Emergency Broadcast",
  "position": [
    1050,
    200
  ],
  "parameters": {
    "message": "🚨 *EMERGENCY ALERT - SPOILAGE*\n\n👤 Farmer: *{{ $json.farmer_id }}*\n🌾 Crop: *{{ $json.crop }}*\n📈 Spoilage: *{{ $json.spoilage_pct }}%* ⚠️\n\n💨 Action: *{{ $json.recommended_action }}*\n\n🏭 Cold Storage:\n   Name: *{{ $json.cold_storage_name }}*\n   Distance: *{{ $json.distance_km }} km*\n   Capacity: *{{ $json.available_capacity }} MT*\n   Phone: *{{ $json.cold_storage_phone }}*\n\n📍 Location: {{ $json.coordinates.lat }}, {{ $json.coordinates.lng }}\n⏰ Alert Time: {{ new Date().toLocaleString() }}",
    "chatId": "={{ $env.TELEGRAM_BLOCK_GROUP_ID }}",
    "additionalFields": {
      "parse_mode": "Markdown"
    },
    "options": {}
  }
},
  output: [{}]
});

const googleSheetsLogEmergency = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4,
  config: {
  "name": "Google Sheets: Log Emergency",
  "position": [
    1300,
    300
  ],
  "parameters": {
    "spreadsheetId": "={{ $env.GOOGLE_SHEET_ID }}",
    "range": "={{ $env.GOOGLE_SHEETS_EMERGENCIES_TAB }}!A:Z",
    "operation": "append",
    "values": "{{ [[ new Date().toISOString(), $json.farmer_id, $json.crop, $json.spoilage_pct, $json.recommended_action, $json.cold_storage_name, 'VOICE_ALERT + TEXT_ALERT + TELEGRAM', 'active' ]] }}"
  }
},
  output: [{}]
});

const supabaseLogEmergencyEvent = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Supabase: Log Emergency Event",
  "position": [
    1550,
    300
  ],
  "parameters": {
    "jsonParameters": true,
    "requestBody": "={\n  \"event_type\": \"emergency_spoilage\",\n  \"farmer_id\": \"{{ $json.farmer_id }}\",\n  \"crop\": \"{{ $json.crop }}\",\n  \"spoilage_pct\": {{ $json.spoilage_pct }},\n  \"recommended_action\": \"{{ $json.recommended_action }}\",\n  \"cold_storage\": \"{{ $json.cold_storage_name }}\",\n  \"coordinates\": {\n    \"lat\": {{ $json.coordinates.lat }},\n    \"lng\": {{ $json.coordinates.lng }}\n  },\n  \"alerts_sent\": [\"voice\", \"text\", \"telegram\"],\n  \"timestamp\": \"{{ new Date().toISOString() }}\",\n  \"status\": \"active\"\n}"
  }
},
  output: [{}]
});

const responseEmergencySuccess = trigger({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1,
  config: {
  "name": "Response: Emergency Success",
  "position": [
    1800,
    300
  ],
  "parameters": {
    "statusCode": 200,
    "responseBody": "={\n  \"success\": true,\n  \"message\": \"Emergency alert broadcast completed\",\n  \"farmer_id\": \"{{ $json.farmer_id }}\",\n  \"crop\": \"{{ $json.crop }}\",\n  \"spoilage_pct\": {{ $json.spoilage_pct }},\n  \"alerts_sent\": [\"voice_whatsapp\", \"text_whatsapp\", \"telegram\", \"ops_coordinator\"],\n  \"action_taken\": \"{{ $json.recommended_action }}\",\n  \"cold_storage\": \"{{ $json.cold_storage_name }}\"\n}"
  }
},
  output: [{}]
});

export default workflow('id', 'Custom Webhook - Emergency Spoilage Alert')
  .add(webhookEmergencySpoilageAlert)
  .to(ifSpoilage50)
  .to(reveryGenerateEmergencyVoiceAlert)
  .to(twilioSendEmergencyVoiceAlert)
  .to(twilioSendActionText)
  .to(twilioAlertOpsEmergency)
  .to(telegramEmergencyBroadcast)
  .to(googleSheetsLogEmergency)
  .to(supabaseLogEmergencyEvent)
  .to(responseEmergencySuccess)
  .to(googleSheetsLogEmergency)
;