import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const twilioWhatsAppInboundWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 1,
  config: {
  "name": "Twilio WhatsApp Inbound Webhook",
  "position": [
    100,
    300
  ],
  "parameters": {
    "httpMethod": "POST",
    "path": "whatsapp-inbound",
    "responseMode": "lastNode",
    "options": {}
  }
},
  output: [{}]
});

const postApiadvisory = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "POST /api/advisory",
  "position": [
    350,
    300
  ],
  "parameters": {
    "url": "http://backend:8000/api/advisory",
    "method": "POST",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "farmer_id",
          "value": "={{ $json.body.From.split('whatsapp:')[1] }}"
        },
        {
          "name": "audio_base64",
          "value": "={{ $json.body.MediaUrl0 }}"
        },
        {
          "name": "text_input",
          "value": "={{ $json.body.Body }}"
        }
      ]
    },
    "options": {
      "timeout": 60000
    }
  }
},
  output: [{}]
});

const sendVoiceReplyViaTwilio = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Send Voice Reply via Twilio",
  "position": [
    600,
    300
  ],
  "parameters": {
    "resource": "media",
    "channel": "whatsapp",
    "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
    "to": "={{ $json.body.From }}",
    "mediaUrl": "={{ $json.response_audio_url }}",
    "options": {}
  }
},
  output: [{}]
});

const logInNotion = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Log in Notion",
  "position": [
    850,
    300
  ],
  "parameters": {
    "url": "http://backend:8000/api/log/advisory",
    "method": "POST",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "farmer_id",
          "value": "={{ $json.farmer_id }}"
        },
        {
          "name": "advisory_id",
          "value": "={{ $json.advisory_id }}"
        },
        {
          "name": "language",
          "value": "={{ $json.language }}"
        },
        {
          "name": "channel",
          "value": "whatsapp"
        }
      ]
    },
    "options": {}
  }
},
  output: [{}]
});

const logSessionInSupabase = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Log Session in Supabase",
  "position": [
    1100,
    300
  ],
  "parameters": {
    "url": "http://backend:8000/api/log/voice-session",
    "method": "POST",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "session_id",
          "value": "={{ $json.session_id }}"
        },
        {
          "name": "farmer_id",
          "value": "={{ $json.farmer_id }}"
        },
        {
          "name": "input_text_local",
          "value": "={{ $json.input_text_local }}"
        },
        {
          "name": "response_text_local",
          "value": "={{ $json.response_text_local }}"
        },
        {
          "name": "response_audio_url",
          "value": "={{ $json.response_audio_url }}"
        },
        {
          "name": "processing_ms",
          "value": "={{ $json.processing_ms }}"
        }
      ]
    },
    "options": {}
  }
},
  output: [{}]
});

export default workflow('id', 'WhatsApp Advisory Loop')
  .add(twilioWhatsAppInboundWebhook)
  .to(postApiadvisory)
  .to(sendVoiceReplyViaTwilio)
  .to(logInNotion)
  .to(logSessionInSupabase)
;