import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const webhookPriceCrashAlert = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 1,
  config: {
  "name": "Webhook: Price Crash Alert",
  "position": [
    100,
    300
  ],
  "parameters": {
    "httpMethod": "POST",
    "path": "price-crash/broadcast",
    "responseMode": "lastNode",
    "options": {}
  }
},
  output: [{}]
});

const ifPriceDrop20 = ifElse({
  version: 1,
  config: {
  "name": "If Price Drop > 20%",
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
          "id": "check-drop-threshold",
          "leftValue": "={{ $json.drop_pct }}",
          "rightValue": 20,
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

const reveryGeneratePriceAlertVoice = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Revery: Generate Price Alert Voice",
  "position": [
    550,
    200
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
          "value": "={{ $json.crop }} की कीमत में तेजी से गिरावट आई है। मौजूदा कीमत {{ $json.current_price }} है जो {{ $json.drop_pct }}% गिरी है। कृपया तुरंत सलाह लें।"
        },
        {
          "name": "language",
          "value": "hi"
        },
        {
          "name": "voice_config",
          "value": "={\"gender\": \"female\", \"speed\": 1.0}"
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

const telegramBroadcastToFarmerGroup = node({
  type: 'n8n-nodes-base.telegram',
  version: 1,
  config: {
  "name": "Telegram: Broadcast to Farmer Group",
  "position": [
    550,
    400
  ],
  "parameters": {
    "message": "🚨 *Price Crash Alert - {{ $json.crop }}*\n\n📍 Block: *{{ $json.block_id }}*\n\n💰 Current Price: *₹{{ $json.current_price }}/quintal*\n📉 Price Drop: *{{ $json.drop_pct }}%*\n\n🎯 Forecast: *₹{{ $json.forecast_price }}/quintal*\n\n👥 Affected Farmers: *{{ $json.affected_farmer_count }}*\n\n📍 Alternative Mandi: *{{ $json.alternative_mandi }}*\n💵 Price There: *₹{{ $json.alternative_price }}/quintal*\n\n⏰ Time: {{ new Date().toLocaleString() }}",
    "chatId": "={{ $env.TELEGRAM_BLOCK_GROUP_ID }}",
    "additionalFields": {
      "parse_mode": "Markdown"
    },
    "options": {}
  }
},
  output: [{}]
});

const twilioAlertOpsCoordinator = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Twilio: Alert Ops Coordinator",
  "position": [
    800,
    500
  ],
  "parameters": {
    "resource": "media",
    "channel": "whatsapp",
    "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
    "to": "=whatsapp:{{ $env.OPS_COORDINATOR_WHATSAPP }}",
    "messageType": "text",
    "text": "🚨 PRICE CRASH: {{ $json.crop }} in {{ $json.block_id }} dropped {{ $json.drop_pct }}% to ₹{{ $json.current_price }}/qt. Affected farmers: {{ $json.affected_farmer_count }}. Broadcasting alerts now.",
    "options": {}
  }
},
  output: [{}]
});

const googleSheetsLogPriceCrash = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4,
  config: {
  "name": "Google Sheets: Log Price Crash",
  "position": [
    1050,
    300
  ],
  "parameters": {
    "spreadsheetId": "={{ $env.GOOGLE_SHEET_ID }}",
    "range": "={{ $env.GOOGLE_SHEETS_PRICE_CRASHES_TAB }}!A:Z",
    "operation": "append",
    "values": "{{ [[ $json.block_id, $json.crop, $json.current_price, $json.forecast_price, $json.drop_pct, $json.affected_farmer_count, $json.alternative_mandi, $json.alternative_price, new Date().toISOString() ]] }}"
  }
},
  output: [{}]
});

const supabaseLogPriceCrashEvent = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Supabase: Log Price Crash Event",
  "position": [
    1300,
    300
  ],
  "parameters": {
    "jsonParameters": true,
    "requestBody": "={\n  \"event_type\": \"price_crash\",\n  \"block_id\": \"{{ $json.block_id }}\",\n  \"crop\": \"{{ $json.crop }}\",\n  \"current_price\": {{ $json.current_price }},\n  \"forecast_price\": {{ $json.forecast_price }},\n  \"drop_pct\": {{ $json.drop_pct }},\n  \"affected_farmers\": {{ $json.affected_farmer_count }},\n  \"broadcast_channels\": [\"telegram\", \"whatsapp\", \"voice\"],\n  \"timestamp\": \"{{ new Date().toISOString() }}\"\n}"
  }
},
  output: [{}]
});

const responseBroadcastSuccess = trigger({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1,
  config: {
  "name": "Response: Broadcast Success",
  "position": [
    1550,
    300
  ],
  "parameters": {
    "statusCode": 200,
    "responseBody": "={\n  \"success\": true,\n  \"message\": \"Price crash broadcast completed\",\n  \"crop\": \"{{ $json.crop }}\",\n  \"block_id\": \"{{ $json.block_id }}\",\n  \"drop_pct\": {{ $json.drop_pct }},\n  \"channels_used\": [\"telegram\", \"whatsapp\", \"voice\"],\n  \"farmers_notified\": {{ $json.affected_farmer_count }}\n}"
  }
},
  output: [{}]
});

export default workflow('id', 'Custom Webhook - Price Crash Broadcast')
  .add(webhookPriceCrashAlert)
  .to(ifPriceDrop20)
  .to(reveryGeneratePriceAlertVoice)
  .to(telegramBroadcastToFarmerGroup)
  .to(twilioAlertOpsCoordinator)
  .to(googleSheetsLogPriceCrash)
  .to(supabaseLogPriceCrashEvent)
  .to(responseBroadcastSuccess)
  .to(googleSheetsLogPriceCrash)
;