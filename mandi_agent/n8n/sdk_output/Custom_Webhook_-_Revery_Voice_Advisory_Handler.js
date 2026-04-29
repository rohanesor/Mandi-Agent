import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const customWebhookFarmerAdvisoryRequest = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 1,
  config: {
  "name": "Custom Webhook: Farmer Advisory Request",
  "position": [
    100,
    300
  ],
  "parameters": {
    "httpMethod": "POST",
    "path": "advisory/webhook",
    "responseMode": "lastNode",
    "options": {}
  }
},
  output: [{}]
});

const validateInput = ifElse({
  version: 1,
  config: {
  "name": "Validate Input",
  "position": [
    300,
    300
  ],
  "parameters": {
    "operation": "validate",
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict"
      },
      "conditions": [
        {
          "id": "check-farmer-id",
          "leftValue": "={{ $json.farmer_id }}",
          "rightValue": "",
          "operator": {
            "type": "string",
            "operation": "neq"
          }
        },
        {
          "id": "check-phone",
          "leftValue": "={{ $json.phone }}",
          "rightValue": "",
          "operator": {
            "type": "string",
            "operation": "neq"
          }
        }
      ],
      "combinator": "and"
    },
    "options": {}
  }
}
});

const reveryGenerateVoiceAdvisory = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Revery: Generate Voice Advisory",
  "position": [
    550,
    300
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
          "value": "={{ $json.advisory_text || $json.text_input }}"
        },
        {
          "name": "language",
          "value": "={{ $json.language || $env.REVERIE_VOICE_LANG }}"
        },
        {
          "name": "voice_config",
          "value": "={\n  \"gender\": \"{{ $env.REVERIE_VOICE_GENDER }}\",\n  \"speed\": 1.0,\n  \"pitch\": 1.0\n}"
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

const twilioSendVoiceReplyToFarmer = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Twilio: Send Voice Reply to Farmer",
  "position": [
    800,
    300
  ],
  "parameters": {
    "url": "=whatsapp:{{ $json.phone }}",
    "resource": "media",
    "channel": "whatsapp",
    "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
    "to": "=whatsapp:{{ $json.phone }}",
    "messageType": "audio",
    "mediaUrl": "={{ $json.audio_url || $json.body.audio_url }}",
    "options": {}
  }
},
  output: [{}]
});

const googleSheetsLogAdvisory = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4,
  config: {
  "name": "Google Sheets: Log Advisory",
  "position": [
    1050,
    300
  ],
  "parameters": {
    "spreadsheetId": "={{ $env.GOOGLE_SHEET_ID }}",
    "range": "={{ $env.GOOGLE_SHEETS_ADVISORIES_TAB }}!A:Z",
    "operation": "append",
    "values": "{{ [[ $json.farmer_id, $json.phone, $json.text_input, $json.advisory_text, $json.language, new Date().toISOString(), 'completed' ]] }}"
  }
},
  output: [{}]
});

const supabaseLogVoiceSession = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Supabase: Log Voice Session",
  "position": [
    1300,
    300
  ],
  "parameters": {
    "jsonParameters": true,
    "requestBody": "={\n  \"farmer_id\": \"{{ $json.farmer_id }}\",\n  \"session_id\": \"{{ $json.session_id }}\",\n  \"input_text\": \"{{ $json.text_input }}\",\n  \"response_text\": \"{{ $json.advisory_text }}\",\n  \"response_audio_url\": \"{{ $json.audio_url }}\",\n  \"language\": \"{{ $json.language }}\",\n  \"processing_time_ms\": {{ Date.now() - new Date($json.timestamp).getTime() }},\n  \"channel\": \"whatsapp\",\n  \"status\": \"completed\"\n}"
  }
},
  output: [{}]
});

const responseSuccess = trigger({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1,
  config: {
  "name": "Response: Success",
  "position": [
    1550,
    300
  ],
  "parameters": {
    "statusCode": 200,
    "responseBody": "={\n  \"success\": true,\n  \"message\": \"Advisory delivered successfully\",\n  \"farmer_id\": \"{{ $json.farmer_id }}\",\n  \"audio_url\": \"{{ $json.audio_url }}\",\n  \"session_id\": \"{{ $json.session_id }}\",\n  \"language\": \"{{ $json.language }}\"\n}"
  }
},
  output: [{}]
});

export default workflow('id', 'Custom Webhook - Revery Voice Advisory Handler')
  .add(customWebhookFarmerAdvisoryRequest)
  .to(validateInput)
  .to(reveryGenerateVoiceAdvisory)
  .to(twilioSendVoiceReplyToFarmer)
  .to(googleSheetsLogAdvisory)
  .to(supabaseLogVoiceSession)
  .to(responseSuccess)
;