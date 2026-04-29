import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const cron600AMISTDaily = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1,
  config: {
  "name": "Cron — 6:00 AM IST Daily",
  "position": [
    100,
    300
  ],
  "parameters": {
    "rule": {
      "interval": [
        {
          "triggerAtHour": 6,
          "triggerAtMinute": 0,
          "timezone": "Asia/Kolkata"
        }
      ]
    }
  }
},
  output: [{}]
});

const getApiharvestAlertsDue = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "GET /api/harvest-alerts-due",
  "position": [
    350,
    300
  ],
  "parameters": {
    "url": "http://backend:8000/api/harvest-alerts-due",
    "method": "GET",
    "options": {}
  }
},
  output: [{}]
});

const loopOverFarmers = node({
  type: 'n8n-nodes-base.splitInBatches',
  version: 2,
  config: {
  "name": "Loop over farmers",
  "position": [
    600,
    300
  ],
  "parameters": {
    "operation": "manual",
    "batchSize": 10,
    "options": {}
  }
},
  output: [{}]
});

const generateAdvisory = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "Generate Advisory",
  "position": [
    850,
    200
  ],
  "parameters": {
    "url": "http://backend:8000/api/advisory",
    "method": "POST",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        {
          "name": "farmer_id",
          "value": "={{ $json.farmer_id }}"
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

const sendProactiveVoiceNote = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Send Proactive Voice Note",
  "position": [
    1100,
    200
  ],
  "parameters": {
    "resource": "media",
    "channel": "whatsapp",
    "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
    "to": "=whatsapp:{{ $json.farmer_phone }}",
    "messageType": "audio",
    "mediaUrl": "={{ $json.response_audio_url }}",
    "options": {}
  }
},
  output: [{}]
});

const markAdvisorySent = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
  "name": "Mark Advisory Sent",
  "position": [
    1350,
    200
  ],
  "parameters": {
    "operation": "update",
    "database": "mandi_agent",
    "table": "advisories",
    "columns": "sent_via",
    "values": "proactive_whatsapp",
    "options": {
      "where": "advisory_id"
    }
  }
},
  output: [{}]
});

export default workflow('id', 'Daily Harvest Alerts')
  .add(cron600AMISTDaily)
  .to(getApiharvestAlertsDue)
  .to(loopOverFarmers)
  .to(generateAdvisory)
  .to(sendProactiveVoiceNote)
  .to(markAdvisorySent)
;