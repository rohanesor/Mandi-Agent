import { workflow, node, trigger, ifElse, merge, placeholder, expr } from '@n8n/workflow-sdk';

const scheduleTriggerEvery30Min = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1,
  config: {
  "name": "Schedule Trigger (every 30 min)",
  "position": [
    100,
    260
  ],
  "parameters": {
    "rule": {
      "interval": [
        {
          "field": "minutes",
          "minutesInterval": 30
        }
      ]
    }
  }
},
  output: [{}]
});

const httpRequestGETApinews = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 3,
  config: {
  "name": "HTTP Request — GET /api/news",
  "position": [
    350,
    260
  ],
  "parameters": {
    "method": "GET",
    "url": "http://backend:8000/api/news",
    "options": {}
  }
},
  output: [{}]
});

const codeFilterUrgencyImportant = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
  "name": "Code — filter urgency >= important",
  "position": [
    620,
    260
  ],
  "parameters": {
    "mode": "runOnceForAllItems",
    "jsCode": "const articles = $input.first().json.articles || [];\nconst urgent = articles.filter(a => (a.relevance_score || 0) >= 7);\nreturn urgent.map(a => ({ json: a }));"
  }
},
  output: [{}]
});

const ifIsUrgencyEmergency = ifElse({
  version: 2,
  config: {
  "name": "IF — Is urgency emergency?",
  "position": [
    900,
    260
  ],
  "parameters": {
    "conditions": {
      "string": [
        {
          "value1": "={{ $json.urgency_level }}",
          "operation": "equal",
          "value2": "emergency"
        }
      ]
    }
  }
}
});

const twilioWhatsAppImmediate = node({
  type: 'n8n-nodes-base.twilio',
  version: 1,
  config: {
  "name": "Twilio WhatsApp (immediate)",
  "position": [
    1170,
    170
  ],
  "parameters": {
    "resource": "message",
    "from": "whatsapp:+14155238886",
    "to": "=whatsapp:{{ $json.farmer_phone || '' }}",
    "message": "={{ `🚨 ${$json.headline_short || $json.title}\n\nAction: ${$json.farmer_action || 'Check local mandi and act quickly.'}` }}"
  }
},
  output: [{}]
});

const googleSheetsQueueFor6AMDigest = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4,
  config: {
  "name": "Google Sheets — queue for 6AM digest",
  "position": [
    1170,
    350
  ],
  "parameters": {
    "operation": "append",
    "sheetName": "News Digest Queue",
    "columns": {
      "mappingMode": "defineBelow",
      "value": {
        "article_id": "={{ $json.article_id }}",
        "headline": "={{ $json.headline_short || $json.title }}",
        "urgency": "={{ $json.urgency_level }}",
        "farmer_phone": "={{ $json.farmer_phone || '' }}",
        "timestamp": "={{ $now.toISO() }}"
      }
    }
  }
},
  output: [{}]
});

const googleSheetsLogAlertSent = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4,
  config: {
  "name": "Google Sheets — log alert sent",
  "position": [
    1440,
    260
  ],
  "parameters": {
    "operation": "append",
    "sheetName": "News Alert Log",
    "columns": {
      "mappingMode": "defineBelow",
      "value": {
        "article_id": "={{ $json.article_id }}",
        "headline": "={{ $json.headline_short || $json.title }}",
        "urgency": "={{ $json.urgency_level }}",
        "farmers_notified": "={{ $json.farmers_notified || 1 }}",
        "timestamp": "={{ $now.toISO() }}"
      }
    }
  }
},
  output: [{}]
});

export default workflow('id', 'Mandi-Agent — Agricultural News Alerts')
  .add(scheduleTriggerEvery30Min)
  .to(httpRequestGETApinews)
  .to(codeFilterUrgencyImportant)
  .to(ifIsUrgencyEmergency)
  .to(ifIsUrgencyEmergency
    .onTrue(twilioWhatsAppImmediate)
    .onFalse(googleSheetsQueueFor6AMDigest))
;